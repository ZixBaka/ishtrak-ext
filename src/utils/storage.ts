import type { BridgeConfig } from "../bridges/types";

type BridgeConfigMap = Record<string, BridgeConfig>;

const BRIDGES_KEY = "ishtrakBridgeConfigs";

export async function loadBridgeConfigs(): Promise<BridgeConfigMap> {
  const result = await chrome.storage.local.get(BRIDGES_KEY);
  return (result[BRIDGES_KEY] as BridgeConfigMap) ?? {};
}

export async function saveBridgeConfig(config: BridgeConfig): Promise<void> {
  const configs = await loadBridgeConfigs();
  configs[config.host] = config;
  await chrome.storage.local.set({ [BRIDGES_KEY]: configs });
}

export async function getBridgeConfig(host: string): Promise<BridgeConfig | undefined> {
  const configs = await loadBridgeConfigs();
  return configs[host];
}

export async function deleteBridgeConfig(host: string): Promise<void> {
  const configs = await loadBridgeConfigs();
  delete configs[host];
  await chrome.storage.local.set({ [BRIDGES_KEY]: configs });
}

export async function listBridgeConfigs(): Promise<BridgeConfig[]> {
  const configs = await loadBridgeConfigs();
  return Object.values(configs);
}

// ── Per-window active bridge (chrome.storage.session) ────────────────────────

const WINDOW_MAP_KEY = "ishtrakBridgeWindowMap";

async function loadWindowMap(): Promise<Record<number, string>> {
  const result = await chrome.storage.session.get(WINDOW_MAP_KEY);
  return (result[WINDOW_MAP_KEY] as Record<number, string>) ?? {};
}

export async function setWindowActiveBridge(windowId: number, host: string): Promise<void> {
  const map = await loadWindowMap();
  map[windowId] = host;
  await chrome.storage.session.set({ [WINDOW_MAP_KEY]: map });
}

export async function getWindowActiveBridge(windowId: number): Promise<string | null> {
  const map = await loadWindowMap();
  return map[windowId] ?? null;
}

export async function clearWindowActiveBridge(windowId: number): Promise<void> {
  const map = await loadWindowMap();
  delete map[windowId];
  await chrome.storage.session.set({ [WINDOW_MAP_KEY]: map });
}
