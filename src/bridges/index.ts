import { JiraBridge } from "./jira";
import { LinearBridge } from "./linear";
import { GitHubBridge } from "./github";
import type { PlatformBridge } from "./types";

export const BRIDGES: PlatformBridge[] = [
  new JiraBridge(),
  new LinearBridge(),
  new GitHubBridge(),
];

export function getBridge(platformType: string): PlatformBridge | undefined {
  return BRIDGES.find((b) => b.platformType === platformType);
}

export * from "./types";
