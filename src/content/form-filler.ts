import type { CreateTaskPayload } from "../types/messages";
import type { PlatformProfile } from "../types/profile";

/** Fills the task creation form and submits it. Returns the created task ID. */
export async function fillAndSubmitForm(
  payload: CreateTaskPayload,
  profile: PlatformProfile
): Promise<{ taskId: string; taskUrl?: string }> {
  const form = profile.formSelector
    ? document.querySelector<HTMLFormElement>(profile.formSelector)
    : findTaskForm();

  if (!form) throw new Error("Could not find task creation form on this page");

  await fillFormFields(form, payload, profile);
  await waitForIdle(300);

  const result = await submitForm(form, profile);
  return result;
}

function findTaskForm(): HTMLFormElement | null {
  // Try to find the most likely task creation form heuristically
  const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form"));
  return (
    forms.find((f) => {
      const text = f.textContent?.toLowerCase() ?? "";
      return (
        (text.includes("title") || text.includes("summary")) &&
        (text.includes("create") || text.includes("submit") || text.includes("save"))
      );
    }) ?? null
  );
}

async function fillFormFields(
  form: HTMLFormElement,
  payload: CreateTaskPayload,
  profile: PlatformProfile
): Promise<void> {
  const selectors = profile.fieldSelectors ?? {};

  await setFieldValue(
    selectors["title"] ?? findTitleSelector(form),
    payload.title,
    form
  );

  if (payload.description) {
    await setFieldValue(
      selectors["description"] ?? findDescSelector(form),
      payload.description,
      form
    );
  }
}

function findTitleSelector(form: HTMLFormElement): string {
  const hints = ["title", "summary", "subject", "issue name", "task name"];
  const input = Array.from(form.querySelectorAll<HTMLInputElement>("input[type=text], input:not([type])")).find(
    (el) => hints.some((h) => (el.name + el.placeholder + (el.getAttribute("aria-label") ?? "")).toLowerCase().includes(h))
  );
  if (input) {
    if (input.id) return `#${input.id}`;
    if (input.name) return `input[name="${input.name}"]`;
  }
  return "input[type=text]:first-of-type";
}

function findDescSelector(form: HTMLFormElement): string {
  const hints = ["description", "body", "details", "content"];
  const area = Array.from(form.querySelectorAll<HTMLElement>("textarea, [contenteditable]")).find(
    (el) => hints.some((h) => ((el as HTMLTextAreaElement).name ?? "" + (el.getAttribute("placeholder") ?? "") + (el.getAttribute("aria-label") ?? "")).toLowerCase().includes(h))
  );
  if (area) {
    if (area.id) return `#${area.id}`;
    if ((area as HTMLTextAreaElement).name) return `textarea[name="${(area as HTMLTextAreaElement).name}"]`;
  }
  return "textarea:first-of-type";
}

async function setFieldValue(
  selector: string,
  value: string,
  root: HTMLElement
): Promise<void> {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) return;

  el.focus();
  await waitForIdle(50);

  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    // React/Vue controlled inputs need the native setter trick
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype,
      "value"
    )?.set;
    nativeInputValueSetter?.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  } else if (el.isContentEditable) {
    el.textContent = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }
}

async function submitForm(
  form: HTMLFormElement,
  profile: PlatformProfile
): Promise<{ taskId: string; taskUrl?: string }> {
  return new Promise((resolve, reject) => {
    // Intercept the next fetch/XHR to capture the created task ID
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function (...args) {
      const resp = await originalFetch(...args);
      const clone = resp.clone();
      clone.json().then((data) => {
        const taskId = String(data?.id ?? data?.issue_id ?? data?.taskId ?? "unknown");
        const taskUrl: string | undefined = data?.url ?? data?.html_url ?? undefined;
        resolve({ taskId, taskUrl });
      }).catch(() => {});
      // Restore after first interception
      window.fetch = originalFetch;
      return resp;
    };

    // Click submit or submit the form
    const submitBtn = profile.submitSelector
      ? document.querySelector<HTMLElement>(profile.submitSelector)
      : form.querySelector<HTMLElement>("button[type=submit], input[type=submit]");

    if (submitBtn) {
      submitBtn.click();
    } else {
      form.requestSubmit();
    }

    // Timeout fallback
    setTimeout(() => {
      window.fetch = originalFetch;
      reject(new Error("Form submission timeout — no API response captured"));
    }, 10_000);
  });
}

function waitForIdle(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
