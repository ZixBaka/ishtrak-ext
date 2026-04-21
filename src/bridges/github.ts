import type { PlatformBridge, BridgeConfig, TaskResult, Task, ListTasksFilter, UpdateTaskFields, Strategy } from "./types";
import type { CreateTaskPayload } from "../types/messages";

export class GitHubBridge implements PlatformBridge {
  readonly platformType = "github";
  readonly displayName = "GitHub Issues";
  readonly supportedStrategies: Strategy[] = ["API_DIRECT_TOKEN"];

  async createTask(payload: CreateTaskPayload, config: BridgeConfig): Promise<TaskResult> {
    // projectId format: "owner/repo"
    const repo = config.projectId ?? payload.projectId ?? "";
    const resp = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${config.token}`,
        "Accept": "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        title: payload.title,
        body: payload.description ?? "",
      }),
      credentials: "omit",
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`GitHub API returned ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    return { taskId: String(data.number), taskUrl: data.html_url };
  }

  async listTasks(_config: BridgeConfig, _filter: ListTasksFilter): Promise<Task[]> {
    throw new Error("listTasks not yet implemented for GitHub");
  }

  async getTask(_config: BridgeConfig, _taskId: string): Promise<Task> {
    throw new Error("getTask not yet implemented for GitHub");
  }

  async updateTask(_config: BridgeConfig, _taskId: string, _fields: UpdateTaskFields): Promise<Task> {
    throw new Error("updateTask not yet implemented for GitHub");
  }

  async validateConnection(config: BridgeConfig): Promise<boolean> {
    try {
      const resp = await fetch("https://api.github.com/user", {
        headers: {
          "Authorization": `Bearer ${config.token}`,
          "Accept": "application/vnd.github.v3+json",
        },
        credentials: "omit",
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }
}
