// BridgeConfig is the canonical profile type; PlatformProfile is kept as an
// alias so content scripts and form-filler don't need changes.
export type { BridgeConfig as PlatformProfile, Strategy } from "../bridges/types";
export type PlatformType = "plane" | "linear" | "youtrack" | "clickup" | "jira" | "github" | "unknown";
