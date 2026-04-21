import type { PlatformBridge, BridgeConfig, TaskResult, Task, ListTasksFilter, UpdateTaskFields, Strategy } from "./types";
import type { CreateTaskPayload } from "../types/messages";

const LINEAR_API = "https://api.linear.app/graphql";

export class LinearBridge implements PlatformBridge {
  readonly platformType = "linear";
  readonly displayName = "Linear";
  readonly supportedStrategies: Strategy[] = ["API_DIRECT_TOKEN"];

  async createTask(payload: CreateTaskPayload, config: BridgeConfig): Promise<TaskResult> {
    const resp = await fetch(LINEAR_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": config.token ?? "",
      },
      body: JSON.stringify({
        query: `mutation IssueCreate($input: IssueCreateInput!) {
          issueCreate(input: $input) {
            success
            issue { id identifier url }
          }
        }`,
        variables: {
          input: {
            title: payload.title,
            description: payload.description,
            teamId: config.projectId ?? payload.projectId,
          },
        },
      }),
      credentials: "omit",
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Linear API returned ${resp.status}: ${text.slice(0, 200)}`);
    }

    const data = await resp.json();
    const issue = data?.data?.issueCreate?.issue;
    if (!issue) throw new Error("Linear: no issue returned in response");
    return { taskId: issue.identifier, taskUrl: issue.url };
  }

  async listTasks(_config: BridgeConfig, _filter: ListTasksFilter): Promise<Task[]> {
    throw new Error("listTasks not yet implemented for Linear");
  }

  async getTask(_config: BridgeConfig, _taskId: string): Promise<Task> {
    throw new Error("getTask not yet implemented for Linear");
  }

  async updateTask(_config: BridgeConfig, _taskId: string, _fields: UpdateTaskFields): Promise<Task> {
    throw new Error("updateTask not yet implemented for Linear");
  }

  async validateConnection(config: BridgeConfig): Promise<boolean> {
    try {
      const resp = await fetch(LINEAR_API, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": config.token ?? "",
        },
        body: JSON.stringify({ query: "{ viewer { id } }" }),
        credentials: "omit",
        signal: AbortSignal.timeout(5000),
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      return !!data?.data?.viewer?.id;
    } catch {
      return false;
    }
  }
}
