import type { CreateTaskPayload } from "../types/messages";

export type Strategy = "API_DIRECT_TOKEN" | "API_DIRECT_SESSION" | "FORM_FILL";

export interface BridgeConfig {
  host: string;
  platformType: string;
  strategy: Strategy;
  token?: string;
  projectId?: string;
  displayName?: string;
  // Form fill specific (used when strategy === "FORM_FILL")
  formUrl?: string;
  formSelector?: string;
  submitSelector?: string;
  fieldSelectors?: Record<string, string>;
}

export interface TaskResult {
  taskId: string;
  taskUrl?: string;
}

export interface Task {
  id: string;
  title: string;
  status: string;
  description?: string;
  assignee?: string;
  url?: string;
}

export interface ListTasksFilter {
  status?: string;
  limit?: number;
}

export interface UpdateTaskFields {
  title?: string;
  description?: string;
  status?: string;
}

export interface PlatformBridge {
  readonly platformType: string;
  readonly displayName: string;
  readonly supportedStrategies: Strategy[];
  createTask(payload: CreateTaskPayload, config: BridgeConfig): Promise<TaskResult>;
  validateConnection(config: BridgeConfig): Promise<boolean>;
  listTasks(config: BridgeConfig, filter: ListTasksFilter): Promise<Task[]>;
  getTask(config: BridgeConfig, taskId: string): Promise<Task>;
  updateTask(config: BridgeConfig, taskId: string, fields: UpdateTaskFields): Promise<Task>;
}
