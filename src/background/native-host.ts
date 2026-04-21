import type { NativeMessage, NativeResponse } from "../types/messages";

const HOST_NAME = "com.ishtrak.host";

let port: chrome.runtime.Port | null = null;
let pendingResolve: ((resp: NativeResponse) => void) | null = null;
let keepAliveInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Send a message to the native host and return its response.
 * Opens the port if not already connected.
 */
export async function sendToNativeHost(msg: NativeMessage): Promise<NativeResponse> {
  ensureConnected();
  return new Promise((resolve, reject) => {
    if (!port) {
      reject(new Error("Native host port not available"));
      return;
    }
    pendingResolve = resolve;
    const timer = setTimeout(() => {
      pendingResolve = null;
      reject(new Error("Timeout: native host did not respond within 5 seconds"));
    }, 5000);

    const originalResolve = resolve;
    pendingResolve = (resp) => {
      clearTimeout(timer);
      originalResolve(resp);
    };

    try {
      port.postMessage(msg);
    } catch (err) {
      clearTimeout(timer);
      pendingResolve = null;
      reject(err);
    }
  });
}

function ensureConnected(): void {
  if (port) return;

  try {
    port = chrome.runtime.connectNative(HOST_NAME);
  } catch (err) {
    console.error("[ishtrak] Failed to connect to native host:", err);
    port = null;
    return;
  }

  port.onMessage.addListener((msg: NativeResponse) => {
    if (pendingResolve) {
      const resolve = pendingResolve;
      pendingResolve = null;
      resolve(msg);
    }
  });

  port.onDisconnect.addListener(() => {
    const err = chrome.runtime.lastError;
    if (err) {
      console.warn("[ishtrak] Native host disconnected:", err.message);
    }
    port = null;
    pendingResolve = null;
    stopKeepAlive();
  });

  startKeepAlive();
}

/** MV3 service workers are killed after ~30s inactivity; keep alive via alarms. */
function startKeepAlive(): void {
  if (keepAliveInterval) return;
  // Ping every 20 seconds to keep the service worker active.
  keepAliveInterval = setInterval(() => {
    if (port) {
      try {
        port.postMessage({ type: "PING" });
      } catch {
        // Port may have closed; onDisconnect will clean up.
      }
    }
  }, 20_000);
}

function stopKeepAlive(): void {
  if (keepAliveInterval !== null) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

/** Disconnect from the native host (call on extension unload). */
export function disconnect(): void {
  stopKeepAlive();
  port?.disconnect();
  port = null;
}
