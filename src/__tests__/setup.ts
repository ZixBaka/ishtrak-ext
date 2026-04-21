/**
 * Minimal Chrome API stub for unit tests.
 * Only surfaces the APIs used by the code under test.
 */

import { vi } from "vitest";

// In-memory backing stores reset before each test
let localStore: Record<string, unknown> = {};
let sessionStore: Record<string, unknown> = {};

beforeEach(() => {
  localStore = {};
  sessionStore = {};
});

const makeStorage = (store: Record<string, unknown>) => ({
  get: vi.fn(async (key: string) => ({ [key]: store[key] })),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(store, items);
  }),
  remove: vi.fn(async (key: string) => {
    delete store[key];
  }),
});

const chromeMock = {
  storage: {
    local: makeStorage(localStore),
    session: makeStorage(sessionStore),
  },
  tabs: {
    query: vi.fn(async () => []),
  },
  runtime: {
    sendMessage: vi.fn(async () => ({})),
    onMessage: {
      addListener: vi.fn(),
    },
    lastError: null as chrome.runtime.LastError | null,
  },
  windows: {
    getCurrent: vi.fn(async () => ({ id: 1 })),
  },
};

// Recreate storage mocks each test so fn call counts reset cleanly
beforeEach(() => {
  chromeMock.storage.local = makeStorage(localStore);
  chromeMock.storage.session = makeStorage(sessionStore);
  chromeMock.tabs.query = vi.fn(async () => []);
  chromeMock.runtime.sendMessage = vi.fn(async () => ({}));
  chromeMock.windows.getCurrent = vi.fn(async () => ({ id: 1 }));
});

(globalThis as unknown as { chrome: typeof chromeMock }).chrome = chromeMock;
