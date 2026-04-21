import type { PlatformBridge, BridgeConfig, TaskResult, Task, ListTasksFilter, UpdateTaskFields, Strategy } from "./types";
import type { CreateTaskPayload } from "../types/messages";

interface TabFetchResult {
  ok: boolean;
  status: number;
  text: string;
}

async function fetchViaTab(
  host: string,
  url: string,
  method: string,
  headers: Record<string, string>,
  body: string | null
): Promise<TabFetchResult | null> {
  const tabs = await new Promise<chrome.tabs.Tab[]>((resolve) => {
    chrome.tabs.query({ url: `https://${host}/*` }, resolve);
  });
  if (!tabs.length || !tabs[0].id) return null;

  const results = await chrome.scripting.executeScript({
    target: { tabId: tabs[0].id! },
    func: async (
      fetchUrl: string,
      fetchMethod: string,
      fetchHeaders: Record<string, string>,
      fetchBody: string | null
    ): Promise<TabFetchResult> => {
      try {
        const init: RequestInit = { method: fetchMethod, headers: fetchHeaders };
        if (fetchBody !== null) init.body = fetchBody;
        const r = await fetch(fetchUrl, init);
        return { ok: r.ok, status: r.status, text: await r.text() };
      } catch (e) {
        return { ok: false, status: 0, text: String(e) };
      }
    },
    args: [url, method, headers, body],
  });

  return (results?.[0]?.result as TabFetchResult) ?? null;
}

export class JiraBridge implements PlatformBridge {
  readonly platformType = "jira";
  readonly displayName = "Jira";
  readonly supportedStrategies: Strategy[] = ["API_DIRECT_SESSION", "API_DIRECT_TOKEN"];

  async createTask(payload: CreateTaskPayload, config: BridgeConfig): Promise<TaskResult> {
    const url = `https://${config.host}/rest/api/2/issue`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Atlassian-Token": "no-check",
    };

    if (config.strategy === "API_DIRECT_TOKEN" && config.token) {
      headers["Authorization"] = `Basic ${config.token}`;
    }

    const body = {
      fields: {
        project: { key: config.projectId ?? payload.projectId },
        issuetype: { name: payload.parentId ? "Subtask" : "Task" },
        summary: payload.title,
        ...(payload.description ? { description: payload.description } : {}),
        ...(payload.parentId ? { parent: { key: payload.parentId } } : {}),
      },
    };

    if (config.strategy === "API_DIRECT_SESSION") {
      const tabResult = await fetchViaTab(config.host, url, "POST", headers, JSON.stringify(body));
      if (!tabResult) {
        throw new Error("No open Jira tab found — open Jira in a browser tab first");
      }
      if (!tabResult.ok) {
        throw new Error(`Jira API returned ${tabResult.status}: ${tabResult.text.slice(0, 200)}`);
      }
      return this.extractResult(JSON.parse(tabResult.text), config.host);
    }

    const resp = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      credentials: "omit",
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`Jira API returned ${resp.status}: ${text.slice(0, 200)}`);
    }
    return this.extractResult(await resp.json(), config.host);
  }

  async validateConnection(config: BridgeConfig): Promise<boolean> {
    try {
      if (config.strategy === "API_DIRECT_SESSION") {
        const result = await fetchViaTab(
          config.host,
          `https://${config.host}/rest/api/2/serverInfo`,
          "GET",
          {},
          null
        );
        return result?.ok ?? false;
      }
      const headers: Record<string, string> = {};
      if (config.token) headers["Authorization"] = `Basic ${config.token}`;
      const resp = await fetch(`https://${config.host}/rest/api/2/serverInfo`, {
        headers,
        credentials: "omit",
        signal: AbortSignal.timeout(5000),
      });
      return resp.ok;
    } catch {
      return false;
    }
  }

  async listTasks(config: BridgeConfig, filter: ListTasksFilter): Promise<Task[]> {
    const limit = filter.limit ?? 20;
    const jql = [
      config.projectId ? `project = "${config.projectId}"` : "",
      filter.status ? `status = "${filter.status}"` : "",
    ].filter(Boolean).join(" AND ") || "ORDER BY created DESC";
    const fields = "id,key,summary,status,assignee";
    const url = `https://${config.host}/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=${limit}&fields=${fields}`;
    const data = await this.jiraGet(config, url);
    const issues = (data as { issues?: unknown[] }).issues ?? [];
    return (issues as Record<string, unknown>[]).map((i) => this.extractTask(i, config.host));
  }

  async getTask(config: BridgeConfig, taskId: string): Promise<Task> {
    const url = `https://${config.host}/rest/api/2/issue/${taskId}?fields=id,key,summary,status,assignee,description`;
    const data = await this.jiraGet(config, url);
    return this.extractTask(data as Record<string, unknown>, config.host);
  }

  async updateTask(config: BridgeConfig, taskId: string, fields: UpdateTaskFields): Promise<Task> {
    const url = `https://${config.host}/rest/api/2/issue/${taskId}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Atlassian-Token": "no-check",
    };
    if (config.strategy === "API_DIRECT_TOKEN" && config.token) {
      headers["Authorization"] = `Basic ${config.token}`;
    }

    if (fields.status) {
      await this.transitionIssue(config, taskId, fields.status, headers);
    }

    if (fields.title || fields.description) {
      const body: Record<string, unknown> = { fields: {} };
      if (fields.title) (body.fields as Record<string, unknown>)["summary"] = fields.title;
      if (fields.description) (body.fields as Record<string, unknown>)["description"] = fields.description;

      if (config.strategy === "API_DIRECT_SESSION") {
        const r = await fetchViaTab(config.host, url, "PUT", headers, JSON.stringify(body));
        if (!r?.ok && r?.status !== 204) throw new Error(`Jira PUT returned ${r?.status}`);
      } else {
        const resp = await fetch(url, { method: "PUT", headers, body: JSON.stringify(body), credentials: "omit" });
        if (!resp.ok && resp.status !== 204) throw new Error(`Jira PUT returned ${resp.status}`);
      }
    }

    return this.getTask(config, taskId);
  }

  private async transitionIssue(
    config: BridgeConfig,
    taskId: string,
    targetStatus: string,
    headers: Record<string, string>
  ): Promise<void> {
    const transUrl = `https://${config.host}/rest/api/2/issue/${taskId}/transitions`;
    const listData = await this.jiraGet(config, transUrl);
    const transitions = ((listData as { transitions?: unknown[] }).transitions ?? []) as Array<{
      id: string;
      name: string;
      to: { name: string };
    }>;
    const match = transitions.find(
      (t) => t.name.toLowerCase() === targetStatus.toLowerCase() ||
             t.to?.name?.toLowerCase() === targetStatus.toLowerCase()
    );
    if (!match) throw new Error(`No transition found for status "${targetStatus}"`);

    const body = JSON.stringify({ transition: { id: match.id } });
    if (config.strategy === "API_DIRECT_SESSION") {
      await fetchViaTab(config.host, transUrl, "POST", headers, body);
    } else {
      await fetch(transUrl, { method: "POST", headers, body, credentials: "omit" });
    }
  }

  private async jiraGet(config: BridgeConfig, url: string): Promise<unknown> {
    const headers: Record<string, string> = { "X-Atlassian-Token": "no-check" };
    if (config.strategy === "API_DIRECT_TOKEN" && config.token) {
      headers["Authorization"] = `Basic ${config.token}`;
    }
    if (config.strategy === "API_DIRECT_SESSION") {
      const r = await fetchViaTab(config.host, url, "GET", headers, null);
      if (!r) throw new Error("No open Jira tab found — open Jira in a browser tab first");
      if (!r.ok) throw new Error(`Jira GET returned ${r.status}: ${r.text.slice(0, 200)}`);
      return JSON.parse(r.text);
    }
    const resp = await fetch(url, { headers, credentials: "omit", signal: AbortSignal.timeout(10000) });
    if (!resp.ok) throw new Error(`Jira GET returned ${resp.status}`);
    return resp.json();
  }

  private extractTask(issue: Record<string, unknown>, host: string): Task {
    const fields = (issue.fields ?? {}) as Record<string, unknown>;
    const status = ((fields.status as Record<string, unknown>)?.name as string) ?? "Unknown";
    const assignee = ((fields.assignee as Record<string, unknown>)?.displayName as string) ?? undefined;
    const key = String(issue.key ?? issue.id ?? "");
    return {
      id: key,
      title: String(fields.summary ?? ""),
      status,
      description: (fields.description as string) ?? undefined,
      assignee,
      url: key ? `https://${host}/browse/${key}` : undefined,
    };
  }

  private extractResult(data: Record<string, unknown>, host: string): TaskResult {
    const taskId = String(data.id ?? data.key ?? "unknown");
    const taskUrl = data.key ? `https://${host}/browse/${data.key}` : undefined;
    return { taskId, taskUrl };
  }
}
