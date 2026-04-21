import { getBridge } from "../bridges";
import type { BridgeConfig, TaskResult } from "../bridges/types";
import type { CreateTaskPayload } from "../types/messages";

export type { TaskResult };

export async function createTask(
  payload: CreateTaskPayload,
  config: BridgeConfig
): Promise<TaskResult> {
  const bridge = getBridge(config.platformType);
  if (!bridge) {
    throw new Error(`No bridge registered for platform: ${config.platformType}`);
  }
  return bridge.createTask(payload, config);
}
