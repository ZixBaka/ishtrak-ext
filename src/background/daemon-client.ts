import type { CommandRequest, CommandResponse } from "../types/messages";

const DAEMON_BASE = "http://127.0.0.1:7474";
const POLL_TIMEOUT_MS = 25_000; // slightly longer than server's 20s hold
const RETRY_DELAY_MS = 2_000;

interface DaemonEnvelope {
  id: string;
  type: string;
  payload: unknown;
}

let commandHandler: ((req: CommandRequest) => Promise<CommandResponse>) | null = null;
let loopActive = false;

export function setCommandHandler(
  handler: (req: CommandRequest) => Promise<CommandResponse>
): void {
  commandHandler = handler;
}

/**
 * Start the long-poll loop.  Each fetch() to /poll blocks for up to 20s,
 * keeping the MV3 service worker alive the entire time.  When the fetch
 * returns (command or idle), the loop immediately issues the next fetch.
 * This creates a chain of fetches that keeps the worker alive indefinitely.
 */
export function connectToDaemon(): void {
  if (loopActive) return;
  loopActive = true;
  pollLoop().finally(() => { loopActive = false; });
}

export function isDaemonConnected(): boolean {
  return loopActive;
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
        // Process command and send response; await so worker stays alive
        // throughout the Jira/Linear API call.
        await handleAndRespond(cmd as DaemonEnvelope);
      }

      // No delay — immediately start the next poll so the worker stays alive
      // and commands are picked up with minimal latency.
    } catch {
      // Daemon not reachable yet — wait before retrying
      await sleep(RETRY_DELAY_MS);
    }
  }
}

async function handleAndRespond(cmd: DaemonEnvelope): Promise<void> {
  const cmdReq: CommandRequest = { uuid: cmd.id, type: cmd.type, payload: cmd.payload };

  let result: CommandResponse;
  try {
    result = commandHandler
      ? await commandHandler(cmdReq)
      : { uuid: cmd.id, error: "no command handler registered" };
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
    // If we can't deliver the response the CLI will timeout — nothing more we can do
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
