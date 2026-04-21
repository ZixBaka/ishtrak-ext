/**
 * Ishtrak Background Service Worker
 *
 * Responsibilities:
 *  1. Listen on the Native Messaging port for commands from the CLI
 *  2. Route CREATE_TASK → task-creator (API or form fill)
 *  3. Route GET_PROFILE / LIST_PROFILES / DELETE_PROFILE → profile-store
 *  4. Receive PLATFORM_CANDIDATE and REQUEST_BODY_CAPTURED from content scripts
 *  5. Drive platform detection via webRequest listener
 */

import type { InternalMessage, CommandRequest, CommandResponse } from "../types/messages";
import type { PlatformProfile } from "../types/profile";
import { getProfile, listProfiles, deleteProfile, saveProfile } from "./profile-store";
import { createTask } from "./task-creator";
import { sendToNativeHost } from "./native-host";
import { startWebRequestListener, onBodyCaptured } from "./web-request";
import { scoreCurrentPage, CANDIDATE_THRESHOLD } from "../utils/heuristics";
import { connectToDaemon, setCommandHandler } from "./daemon-client";

// ── Platform Auto-Detection ───────────────────────────────────────────────────

async function detectJiraProfile(host: string, token?: string): Promise<PlatformProfile | null> {
  try {
    const headers: Record<string, string> = {};
    if (token) headers["Authorization"] = `Basic ${token}`;

    const resp = await fetch(`https://${host}/rest/api/2/serverInfo`, {
      headers,
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;

    const data = await resp.json();
    if (!data.deploymentType) return null;

    const profile: PlatformProfile = {
      host,
      detectedAt: new Date().toISOString(),
      confidence: 95,
      platformType: "jira",
      apiEndpoint: "/rest/api/2/issue",
      httpMethod: "POST",
      authHeaderName: "Authorization",
      authHeaderPattern: "Basic {token}",
    };
    await saveProfile(profile);
    console.log(`[ishtrak] Auto-detected Jira at ${host} (${data.deploymentType} ${data.version})`);
    return profile;
  } catch {
    return null;
  }
}

// ── Content Script Messages ───────────────────────────────────────────────────

function startContentScriptListener(): void {
  chrome.runtime.onMessage.addListener(
    (msg: InternalMessage, sender, sendResponse) => {
      handleContentMessage(msg, sender).then(sendResponse).catch((err) => {
        console.error("[ishtrak] Content message error:", err);
        sendResponse({ error: String(err) });
      });
      return true; // keep channel open for async response
    }
  );
}

async function handleContentMessage(
  msg: InternalMessage,
  sender: chrome.runtime.MessageSender
): Promise<unknown> {
  switch (msg.type) {
    case "PLATFORM_CANDIDATE": {
      if (msg.score >= CANDIDATE_THRESHOLD) {
        console.log(`[ishtrak] Platform candidate: ${msg.host} (score ${msg.score})`);
        // Mark as candidate but don't save until an API call is witnessed
        await saveProfile({
          host: msg.host,
          detectedAt: new Date().toISOString(),
          confidence: msg.score,
          platformType: "unknown",
        });
      }
      return { ok: true };
    }

    case "REQUEST_BODY_CAPTURED": {
      const tabId = sender.tab?.id ?? 0;
      await onBodyCaptured(tabId, {
        url: msg.url,
        method: msg.method,
        body: msg.body,
        contentType: msg.contentType,
      });
      return { ok: true };
    }

    default:
      return { error: "unknown message" };
  }
}

// ── Queue Draining ────────────────────────────────────────────────────────────

async function drainPendingQueue(): Promise<void> {
  try {
    const resp = await sendToNativeHost({ type: "DRAIN_QUEUE" });
    if (resp.type !== "PENDING_TASKS" || !resp.tasks.length) return;

    for (const payload of resp.tasks) {
      let profile = await getProfile(payload.host);
      if (!profile) {
        profile = await detectJiraProfile(payload.host, payload.token) ?? {
          host: payload.host,
          detectedAt: new Date().toISOString(),
          confidence: 100,
          platformType: "unknown",
        };
      }
      try {
        const result = await createTask(payload, profile);
        console.log(`[ishtrak] Task created: ${result.taskUrl ?? result.taskId}`);
      } catch (err) {
        console.error(`[ishtrak] Failed to create task for ${payload.storyId}:`, err);
      }
    }
  } catch {
    // Native host not reachable — normal when no git activity has occurred
  }
}

// ── Daemon Command Handler ────────────────────────────────────────────────────

function setupDaemonClient(): void {
  setCommandHandler(handleCommandRequest);
  connectToDaemon();
}

async function handleCommandRequest(req: CommandRequest): Promise<CommandResponse> {
  const payload = req.payload as Record<string, unknown>;
  try {
    switch (req.type) {
      case "CREATE_TASK": {
        let profile = await getProfile(payload.host as string);
        if (!profile) {
          profile = await detectJiraProfile(payload.host as string, payload.token as string | undefined) ?? {
            host: payload.host as string,
            detectedAt: new Date().toISOString(),
            confidence: 100,
            platformType: "unknown",
            strategy: "API_DIRECT_TOKEN" as const,
          };
        }
        const result = await createTask(payload as unknown as Parameters<typeof createTask>[0], profile);
        const task = { id: result.taskId, title: (payload.title as string) ?? "", status: "", url: result.taskUrl };
        return { uuid: req.uuid, data: task };
      }

      case "LIST_TASKS": {
        const profile = await getProfile(payload.host as string);
        if (!profile) return { uuid: req.uuid, error: `No profile for host: ${payload.host}` };
        const { getBridge } = await import("../bridges");
        const bridge = getBridge(profile.platformType);
        if (!bridge) return { uuid: req.uuid, error: `No bridge for platform: ${profile.platformType}` };
        const tasks = await bridge.listTasks(profile, {
          status: payload.status as string | undefined,
          limit: payload.limit as number | undefined,
        });
        return { uuid: req.uuid, data: tasks };
      }

      case "GET_TASK": {
        const profile = await getProfile(payload.host as string);
        if (!profile) return { uuid: req.uuid, error: `No profile for host: ${payload.host}` };
        const { getBridge } = await import("../bridges");
        const bridge = getBridge(profile.platformType);
        if (!bridge) return { uuid: req.uuid, error: `No bridge for platform: ${profile.platformType}` };
        const task = await bridge.getTask(profile, payload.taskId as string);
        return { uuid: req.uuid, data: task };
      }

      case "UPDATE_TASK": {
        const profile = await getProfile(payload.host as string);
        if (!profile) return { uuid: req.uuid, error: `No profile for host: ${payload.host}` };
        const { getBridge } = await import("../bridges");
        const bridge = getBridge(profile.platformType);
        if (!bridge) return { uuid: req.uuid, error: `No bridge for platform: ${profile.platformType}` };
        const task = await bridge.updateTask(profile, payload.taskId as string, {
          title: payload.title as string | undefined,
          description: payload.description as string | undefined,
          status: payload.status as string | undefined,
        });
        return { uuid: req.uuid, data: task };
      }

      case "GET_PROFILE": {
        const profile = await getProfile(payload.host as string);
        if (!profile) return { uuid: req.uuid, error: `Profile not found: ${payload.host}` };
        return { uuid: req.uuid, data: profile };
      }

      case "LIST_PROFILES": {
        const profiles = await listProfiles();
        return { uuid: req.uuid, data: profiles };
      }

      case "DELETE_PROFILE": {
        await deleteProfile(payload.host as string);
        return { uuid: req.uuid, data: { ok: true } };
      }

      default:
        return { uuid: req.uuid, error: `Unknown command type: ${req.type}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { uuid: req.uuid, error: message };
  }
}

// ── Keepalive (MV3 service worker lifecycle) ──────────────────────────────────

function setupKeepalive(): void {
  // ~24s keepalive to prevent MV3 service worker unload; also drains git-hook queue
  chrome.alarms.create("ishtrakPing", { periodInMinutes: 0.4 });

  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "ishtrakPing") {
      chrome.storage.local.get("ishtrakPing"); // keeps service worker alive
      drainPendingQueue();
      connectToDaemon(); // reconnect if dropped since last wake
    }
  });
}

// ── Entry Point ───────────────────────────────────────────────────────────────

startContentScriptListener();
startWebRequestListener();
setupKeepalive();
setupDaemonClient();

console.log("[ishtrak] Background service worker started");
