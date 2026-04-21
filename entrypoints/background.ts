/**
 * Ishtrak Background Service Worker entrypoint (WXT).
 *
 * Responsibilities:
 *  1. Connect to the local ishtrak daemon via HTTP long-polling
 *  2. Process commands (CREATE_TASK, LIST_TASKS, etc.) from the CLI
 *  3. Handle popup internal messages (SET/GET_ACTIVE_BRIDGE, VALIDATE_BRIDGE)
 */

import type { InternalMessage, CommandRequest, CommandResponse } from "../src/types/messages";
import type { Task } from "../src/bridges/types";
import { getBridgeConfig, listBridgeConfigs, deleteBridgeConfig, setWindowActiveBridge, getWindowActiveBridge } from "../src/utils/storage";
import { createTask } from "../src/background/task-creator";
import { getBridge } from "../src/bridges";

// ── Daemon long-poll client ───────────────────────────────────────────────────

const DAEMON_BASE = "http://127.0.0.1:7474";
const POLL_TIMEOUT_MS = 25_000;
const RETRY_DELAY_MS = 2_000;

interface DaemonEnvelope {
  id: string;
  type: string;
  payload: unknown;
}

let loopActive = false;

function connectToDaemon(): void {
  if (loopActive) return;
  loopActive = true;
  pollLoop().finally(() => { loopActive = false; });
}

async function pollLoop(): Promise<void> {
  while (true) {
    try {
      const resp = await fetch(`${DAEMON_BASE}/poll`, {
        signal: AbortSignal.timeout(POLL_TIMEOUT_MS),
      });

      if (!resp.ok) {
        await sleep(RETRY_DELAY_MS);
        continue;
      }

      const cmd = (await resp.json()) as { type: string } | DaemonEnvelope;

      if (cmd.type !== "idle") {
        await handleAndRespond(cmd as DaemonEnvelope);
      }
    } catch {
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function handleAndRespond(cmd: DaemonEnvelope): Promise<void> {
  const req: CommandRequest = { uuid: cmd.id, type: cmd.type, payload: cmd.payload };

  let result: CommandResponse;
  try {
    result = await processCommand(req);
  } catch (err) {
    result = { uuid: cmd.id, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    await fetch(`${DAEMON_BASE}/response`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: cmd.id, data: result.data, error: result.error }),
    });
  } catch {
    // nothing we can do if we can't deliver the response
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Command processing ────────────────────────────────────────────────────────

async function processCommand(req: CommandRequest): Promise<CommandResponse> {
  const payload = req.payload as Record<string, unknown>;
  const host = String(payload?.host ?? "");

  try {
    switch (req.type) {
      case "CREATE_TASK": {
        const config = await resolveActiveConfig(host);
        if (!config) return { uuid: req.uuid, error: `No bridge configured for ${host}` };
        const result = await createTask(payload as Parameters<typeof createTask>[0], config);
        const task: Task = {
          id: result.taskId,
          title: String(payload.title ?? ""),
          status: "To Do",
          url: result.taskUrl,
        };
        return { uuid: req.uuid, data: task };
      }

      case "LIST_TASKS": {
        const config = await getBridgeConfig(host);
        if (!config) return { uuid: req.uuid, error: `No bridge configured for ${host}` };
        const bridge = getBridge(config.platformType);
        if (!bridge) return { uuid: req.uuid, error: `Unknown platform: ${config.platformType}` };
        const tasks = await bridge.listTasks(config, {
          status: payload.status as string | undefined,
          limit: payload.limit as number | undefined,
        });
        return { uuid: req.uuid, data: tasks };
      }

      case "GET_TASK": {
        const config = await getBridgeConfig(host);
        if (!config) return { uuid: req.uuid, error: `No bridge configured for ${host}` };
        const bridge = getBridge(config.platformType);
        if (!bridge) return { uuid: req.uuid, error: `Unknown platform: ${config.platformType}` };
        const task = await bridge.getTask(config, String(payload.taskId ?? ""));
        return { uuid: req.uuid, data: task };
      }

      case "UPDATE_TASK": {
        const config = await getBridgeConfig(host);
        if (!config) return { uuid: req.uuid, error: `No bridge configured for ${host}` };
        const bridge = getBridge(config.platformType);
        if (!bridge) return { uuid: req.uuid, error: `Unknown platform: ${config.platformType}` };
        const task = await bridge.updateTask(config, String(payload.taskId ?? ""), {
          title: payload.title as string | undefined,
          description: payload.description as string | undefined,
          status: payload.status as string | undefined,
        });
        return { uuid: req.uuid, data: task };
      }

      case "LIST_PROFILES": {
        const configs = await listBridgeConfigs();
        return { uuid: req.uuid, data: configs };
      }

      case "DELETE_PROFILE": {
        await deleteBridgeConfig(host);
        return { uuid: req.uuid, data: { ok: true } };
      }

      default:
        return { uuid: req.uuid, error: `Unknown command type: ${req.type}` };
    }
  } catch (e) {
    return { uuid: req.uuid, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Active bridge resolution ──────────────────────────────────────────────────

async function resolveActiveConfig(fallbackHost: string) {
  const fallbackPromise = getBridgeConfig(fallbackHost);
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (tab?.windowId != null) {
      const activeHost = await getWindowActiveBridge(tab.windowId);
      if (activeHost) {
        const config = await getBridgeConfig(activeHost);
        if (config) return config;
      }
    }
  } catch {
    // tabs API unavailable — fall through
  }
  return fallbackPromise;
}

// ── Internal messages (popup ↔ background) ────────────────────────────────────

function startInternalMessageListener(): void {
  chrome.runtime.onMessage.addListener((msg: InternalMessage, _sender, sendResponse) => {
    if (msg.type === "SET_ACTIVE_BRIDGE") {
      setWindowActiveBridge(msg.windowId, msg.host).then(() => sendResponse(true));
      return true;
    }
    if (msg.type === "GET_ACTIVE_BRIDGE") {
      getWindowActiveBridge(msg.windowId).then((host) =>
        sendResponse({ type: "ACTIVE_BRIDGE_RESULT", host })
      );
      return true;
    }
    if (msg.type === "VALIDATE_BRIDGE") {
      (async () => {
        const config = await getBridgeConfig(msg.host);
        if (!config) { sendResponse({ type: "VALIDATE_RESULT", ok: false, error: "Bridge not configured" }); return; }
        const bridge = getBridge(config.platformType);
        if (!bridge) { sendResponse({ type: "VALIDATE_RESULT", ok: false, error: "Unknown platform type" }); return; }
        try {
          const ok = await bridge.validateConnection(config);
          sendResponse({ type: "VALIDATE_RESULT", ok });
        } catch (e) {
          sendResponse({ type: "VALIDATE_RESULT", ok: false, error: String(e) });
        }
      })();
      return true;
    }
    return false;
  });
}

// ── Keepalive (MV3 service worker lifecycle) ──────────────────────────────────

function setupKeepalive(): void {
  // ~24s keepalive alarm; also reconnects daemon loop if worker was woken from sleep
  chrome.alarms.create("ishtrakPing", { periodInMinutes: 0.4 });
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "ishtrakPing") {
      chrome.storage.local.get("ishtrakPing"); // keep worker alive
      connectToDaemon(); // restart loop if it died
    }
  });
}

// ── Entry point ───────────────────────────────────────────────────────────────

export default defineBackground(() => {
  startInternalMessageListener();
  setupKeepalive();
  connectToDaemon();
  console.log("[ishtrak] Background service worker started");
});
