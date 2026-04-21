/**
 * Heuristics for detecting whether a page is a task management platform.
 * Returns a confidence score 0–100.
 */

interface ScoredSignal {
  name: string;
  weight: number;
  test: () => boolean;
}

const URL_TASK_SEGMENTS = ["/issues", "/tasks", "/tickets", "/work-items", "/backlog", "/board"];
const TITLE_KEYWORDS = ["board", "backlog", "sprint", "issues", "tickets"];
const CREATE_BUTTON_TEXT = ["create", "new issue", "add issue", "new task", "add task", "new ticket"];
const TITLE_INPUT_HINTS = ["title", "summary", "issue name", "task name", "subject"];
const DESC_HINTS = ["description", "body", "details", "comment"];
const PRIORITY_HINTS = ["priority", "severity", "urgency"];

export function scoreCurrentPage(): number {
  const signals: ScoredSignal[] = [
    {
      name: "url_path_segment",
      weight: 20,
      test: () => URL_TASK_SEGMENTS.some((s) => location.pathname.toLowerCase().includes(s)),
    },
    {
      name: "page_title_keyword",
      weight: 15,
      test: () => {
        const t = document.title.toLowerCase();
        return TITLE_KEYWORDS.some((k) => t.includes(k));
      },
    },
    {
      name: "title_input",
      weight: 20,
      test: () => {
        const inputs = document.querySelectorAll<HTMLInputElement>("input[type=text], input:not([type])");
        return Array.from(inputs).some((el) => {
          const hint = (el.name + " " + el.placeholder + " " + el.getAttribute("aria-label")).toLowerCase();
          return TITLE_INPUT_HINTS.some((h) => hint.includes(h));
        });
      },
    },
    {
      name: "description_textarea",
      weight: 15,
      test: () => {
        const areas = document.querySelectorAll("textarea, [contenteditable]");
        return Array.from(areas).some((el) => {
          const hint = (
            (el as HTMLElement).getAttribute("placeholder") +
            " " +
            (el as HTMLElement).getAttribute("aria-label") +
            " " +
            (el as HTMLElement).getAttribute("name")
          ).toLowerCase();
          return DESC_HINTS.some((h) => hint.includes(h));
        });
      },
    },
    {
      name: "priority_select",
      weight: 15,
      test: () => {
        const selects = document.querySelectorAll("select, [role=combobox], [role=listbox]");
        return Array.from(selects).some((el) => {
          const hint = (
            (el as HTMLElement).getAttribute("aria-label") +
            " " +
            (el as HTMLElement).getAttribute("name") +
            " " +
            (el as HTMLElement).getAttribute("placeholder")
          ).toLowerCase();
          return PRIORITY_HINTS.some((h) => hint.includes(h));
        });
      },
    },
    {
      name: "create_button",
      weight: 10,
      test: () => {
        const buttons = document.querySelectorAll<HTMLElement>("button, [role=button], a");
        return Array.from(buttons).some((el) => {
          const text = (el.textContent ?? "").trim().toLowerCase();
          return CREATE_BUTTON_TEXT.some((t) => text === t || text.startsWith(t));
        });
      },
    },
  ];

  return signals.reduce((total, sig) => {
    try {
      return sig.test() ? total + sig.weight : total;
    } catch {
      return total;
    }
  }, 0);
}

export const CANDIDATE_THRESHOLD = 50;
export const CONFIRMED_THRESHOLD = 75;
