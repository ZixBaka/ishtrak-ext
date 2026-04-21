import type { BridgeConfig, Task } from "../bridges/types";

// ── Messages from CLI → Extension (via native host) ──────────────────────────

export interface CreateTaskPayload {
  host: string;
  title: string;
  description?: string;
  storyId?: string;
  projectId?: string;
  token?: string;
  parentId?: string;
}

export interface ListTasksPayload {
  host: string;
  projectId?: string;
  status?: string;
  limit?: number;
}

export interface GetTaskPayload {
  host: string;
  taskId: string;
}

export interface UpdateTaskPayload {
  host: string;
  taskId: string;
  title?: string;
  description?: string;
  status?: string;
}

export interface GetProfilePayload { host: string; }
export interface DeleteProfilePayload { host: string; }

export interface CommandRequest {
  uuid: string;
  type: string;
  payload: unknown;
}

export interface CommandResponse {
  uuid: string;
  data?: unknown;
  error?: string;
}

export type NativeMessage =
  | { type: "CREATE_TASK"; payload: CreateTaskPayload }
  | { type: "LIST_TASKS"; payload: ListTasksPayload }
  | { type: "GET_TASK"; payload: GetTaskPayload }
  | { type: "UPDATE_TASK"; payload: UpdateTaskPayload }
  | { type: "GET_PROFILE"; payload: GetProfilePayload }
  | { type: "LIST_PROFILES" }
  | { type: "DELETE_PROFILE"; payload: DeleteProfilePayload }
  | { type: "POLL_REQUESTS" }
  | { type: "WRITE_RESPONSES"; payload: { responses: CommandResponse[] } }
  | { type: "DRAIN_QUEUE" };

// ── Responses from Extension → CLI (via native host) ─────────────────────────

export type NativeResponse =
  | { type: "TASK_CREATED"; taskId: string; taskUrl?: string }
  | { type: "TASK_ERROR"; error: string }
  | { type: "TASKS_LIST"; tasks: Task[] }
  | { type: "TASK_FOUND"; task: Task }
  | { type: "TASK_UPDATED"; task: Task }
  | { type: "PROFILE_FOUND"; profile: BridgeConfig }
  | { type: "PROFILE_NOT_FOUND" }
  | { type: "PROFILES_LIST"; profiles: BridgeConfig[] }
  | { type: "PENDING_REQUESTS"; requests: CommandRequest[] }
  | { type: "PENDING_TASKS"; tasks: CreateTaskPayload[] }
  | { type: "OK" };

// ── Internal extension messages (background ↔ content script / popup) ────────

export type InternalMessage =
  | { type: "FILL_FORM"; payload: CreateTaskPayload }
  | { type: "SET_ACTIVE_BRIDGE"; windowId: number; host: string }
  | { type: "GET_ACTIVE_BRIDGE"; windowId: number }
  | { type: "ACTIVE_BRIDGE_RESULT"; host: string | null }
  | { type: "VALIDATE_BRIDGE"; host: string }
  | { type: "VALIDATE_RESULT"; ok: boolean; error?: string };
