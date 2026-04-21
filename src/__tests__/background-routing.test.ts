/**
 * Tests for per-window active bridge routing logic.
 *
 * We test the resolution order directly — the background entrypoint itself
 * is not imported here because it calls defineBackground() (WXT global),
 * so we extract and test the pure logic it relies on.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  saveBridgeConfig,
  getBridgeConfig,
  setWindowActiveBridge,
  getWindowActiveBridge,
} from "../utils/storage";
import type { BridgeConfig } from "../bridges/types";

const jira: BridgeConfig = {
  host: "jira.example.com",
  platformType: "jira",
  strategy: "API_DIRECT_SESSION",
  projectId: "PROJ",
};

const linear: BridgeConfig = {
  host: "api.linear.app",
  platformType: "linear",
  strategy: "API_DIRECT_TOKEN",
  token: "lin_api_test",
  projectId: "TEAM",
};

/** Mirrors the resolveActiveConfig function in background.ts */
async function resolveActiveConfig(
  fallbackHost: string,
  activeWindowId: number | undefined
): Promise<BridgeConfig | undefined> {
  if (activeWindowId != null) {
    const host = await getWindowActiveBridge(activeWindowId);
    if (host) {
      const config = await getBridgeConfig(host);
      if (config) return config;
    }
  }
  return getBridgeConfig(fallbackHost);
}

describe("resolveActiveConfig", () => {
  beforeEach(async () => {
    await saveBridgeConfig(jira);
    await saveBridgeConfig(linear);
  });

  it("returns the active bridge for the focused window", async () => {
    await setWindowActiveBridge(1, "api.linear.app");
    const result = await resolveActiveConfig("jira.example.com", 1);
    expect(result?.host).toBe("api.linear.app");
  });

  it("falls back to payload.host when window has no active bridge", async () => {
    const result = await resolveActiveConfig("jira.example.com", 1);
    expect(result?.host).toBe("jira.example.com");
  });

  it("falls back to payload.host when no window context", async () => {
    const result = await resolveActiveConfig("jira.example.com", undefined);
    expect(result?.host).toBe("jira.example.com");
  });

  it("falls back to payload.host when active bridge host has no config", async () => {
    await setWindowActiveBridge(1, "deleted.host");
    const result = await resolveActiveConfig("jira.example.com", 1);
    expect(result?.host).toBe("jira.example.com");
  });

  it("returns undefined when neither active bridge nor fallback host is configured", async () => {
    const result = await resolveActiveConfig("unknown.host", 1);
    expect(result).toBeUndefined();
  });

  it("window 1 and window 2 resolve independently", async () => {
    await setWindowActiveBridge(1, "jira.example.com");
    await setWindowActiveBridge(2, "api.linear.app");

    const w1 = await resolveActiveConfig("jira.example.com", 1);
    const w2 = await resolveActiveConfig("jira.example.com", 2);

    expect(w1?.host).toBe("jira.example.com");
    expect(w2?.host).toBe("api.linear.app");
  });
});
