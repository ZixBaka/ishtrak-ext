import { describe, it, expect } from "vitest";
import {
  saveBridgeConfig,
  getBridgeConfig,
  deleteBridgeConfig,
  listBridgeConfigs,
  setWindowActiveBridge,
  getWindowActiveBridge,
  clearWindowActiveBridge,
} from "../utils/storage";
import type { BridgeConfig } from "../bridges/types";

const jiraConfig: BridgeConfig = {
  host: "jira.example.com",
  platformType: "jira",
  strategy: "API_DIRECT_SESSION",
  projectId: "PROJ",
  displayName: "Jira",
};

const linearConfig: BridgeConfig = {
  host: "api.linear.app",
  platformType: "linear",
  strategy: "API_DIRECT_TOKEN",
  token: "lin_api_test",
  projectId: "team-abc",
  displayName: "Linear",
};

// ── Bridge config (chrome.storage.local) ─────────────────────────────────────

describe("saveBridgeConfig / getBridgeConfig", () => {
  it("saves and retrieves a config by host", async () => {
    await saveBridgeConfig(jiraConfig);
    const result = await getBridgeConfig("jira.example.com");
    expect(result).toEqual(jiraConfig);
  });

  it("returns undefined for an unknown host", async () => {
    const result = await getBridgeConfig("unknown.host");
    expect(result).toBeUndefined();
  });

  it("overwrites an existing config for the same host", async () => {
    await saveBridgeConfig(jiraConfig);
    const updated = { ...jiraConfig, projectId: "NEW" };
    await saveBridgeConfig(updated);
    const result = await getBridgeConfig("jira.example.com");
    expect(result?.projectId).toBe("NEW");
  });
});

describe("listBridgeConfigs", () => {
  it("returns empty array when nothing saved", async () => {
    expect(await listBridgeConfigs()).toEqual([]);
  });

  it("lists all saved configs", async () => {
    await saveBridgeConfig(jiraConfig);
    await saveBridgeConfig(linearConfig);
    const list = await listBridgeConfigs();
    expect(list).toHaveLength(2);
    expect(list).toContainEqual(jiraConfig);
    expect(list).toContainEqual(linearConfig);
  });
});

describe("deleteBridgeConfig", () => {
  it("removes a config by host", async () => {
    await saveBridgeConfig(jiraConfig);
    await deleteBridgeConfig("jira.example.com");
    expect(await getBridgeConfig("jira.example.com")).toBeUndefined();
  });

  it("is a no-op for an unknown host", async () => {
    await saveBridgeConfig(jiraConfig);
    await deleteBridgeConfig("unknown.host");
    expect(await listBridgeConfigs()).toHaveLength(1);
  });
});

// ── Per-window active bridge (chrome.storage.session) ────────────────────────

describe("setWindowActiveBridge / getWindowActiveBridge", () => {
  it("sets and retrieves active bridge for a window", async () => {
    await setWindowActiveBridge(1, "jira.example.com");
    expect(await getWindowActiveBridge(1)).toBe("jira.example.com");
  });

  it("returns null for a window with no active bridge", async () => {
    expect(await getWindowActiveBridge(99)).toBeNull();
  });

  it("different windows can have different active bridges", async () => {
    await setWindowActiveBridge(1, "jira.example.com");
    await setWindowActiveBridge(2, "api.linear.app");
    expect(await getWindowActiveBridge(1)).toBe("jira.example.com");
    expect(await getWindowActiveBridge(2)).toBe("api.linear.app");
  });

  it("overwrites the previous active bridge for the same window", async () => {
    await setWindowActiveBridge(1, "jira.example.com");
    await setWindowActiveBridge(1, "api.linear.app");
    expect(await getWindowActiveBridge(1)).toBe("api.linear.app");
  });
});

describe("clearWindowActiveBridge", () => {
  it("removes the active bridge for a window", async () => {
    await setWindowActiveBridge(1, "jira.example.com");
    await clearWindowActiveBridge(1);
    expect(await getWindowActiveBridge(1)).toBeNull();
  });

  it("does not affect other windows", async () => {
    await setWindowActiveBridge(1, "jira.example.com");
    await setWindowActiveBridge(2, "api.linear.app");
    await clearWindowActiveBridge(1);
    expect(await getWindowActiveBridge(2)).toBe("api.linear.app");
  });
});
