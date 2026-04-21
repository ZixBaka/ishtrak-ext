// Re-export storage utilities for use in the background service worker.
export {
  loadBridgeConfigs,
  saveBridgeConfig,
  getBridgeConfig,
  deleteBridgeConfig,
  listBridgeConfigs,
} from "../utils/storage";
