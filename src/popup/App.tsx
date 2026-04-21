import React, { useEffect, useState } from "react";
import { BRIDGES, getBridge } from "../bridges";
import type { BridgeConfig, Strategy } from "../bridges/types";
import { saveBridgeConfig, listBridgeConfigs, deleteBridgeConfig } from "../utils/storage";

type Step = "list" | "pick-platform" | "pick-strategy" | "config" | "validate";

interface WizardState {
  platform: string;
  strategy: Strategy;
  host: string;
  token: string;
  projectId: string;
}

const EMPTY_WIZARD: WizardState = {
  platform: "",
  strategy: "API_DIRECT_SESSION",
  host: "",
  token: "",
  projectId: "",
};

export default function App() {
  const [bridges, setBridges] = useState<BridgeConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState<Step>("list");
  const [wizard, setWizard] = useState<WizardState>(EMPTY_WIZARD);
  const [validating, setValidating] = useState(false);
  const [validationMsg, setValidationMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [activeBridgeHost, setActiveBridgeHost] = useState<string | null>(null);
  const [currentWindowId, setCurrentWindowId] = useState<number | null>(null);
  const [daemonConnected, setDaemonConnected] = useState<boolean | null>(null);

  useEffect(() => {
    listBridgeConfigs().then((configs) => {
      setBridges(configs);
      setLoading(false);
      if (configs.length === 0) setStep("pick-platform");
    });
    chrome.windows.getCurrent().then((win) => {
      setCurrentWindowId(win.id ?? null);
      if (win.id != null) {
        chrome.runtime.sendMessage({ type: "GET_ACTIVE_BRIDGE", windowId: win.id }).then(
          (resp) => { if (resp?.host) setActiveBridgeHost(resp.host); }
        );
      }
    });
    // Check daemon connection status
    fetch("http://127.0.0.1:7474/health")
      .then((r) => r.json())
      .then((d: { connected?: boolean }) => setDaemonConnected(d.connected ?? false))
      .catch(() => setDaemonConnected(false));
  }, []);

  async function handleSave() {
    const bridge = getBridge(wizard.platform);
    if (!bridge) return;

    const config: BridgeConfig = {
      host: wizard.host.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
      platformType: wizard.platform,
      strategy: wizard.strategy,
      token: wizard.token.trim() || undefined,
      projectId: wizard.projectId.trim() || undefined,
      displayName: bridge.displayName,
    };

    await saveBridgeConfig(config);
    const updated = await listBridgeConfigs();
    setBridges(updated);
    setStep("list");
    setWizard(EMPTY_WIZARD);
    setValidationMsg(null);
  }

  async function handleValidate() {
    const bridge = getBridge(wizard.platform);
    if (!bridge) return;

    const config: BridgeConfig = {
      host: wizard.host.trim().replace(/^https?:\/\//, "").replace(/\/$/, ""),
      platformType: wizard.platform,
      strategy: wizard.strategy,
      token: wizard.token.trim() || undefined,
      projectId: wizard.projectId.trim() || undefined,
    };

    setValidating(true);
    setValidationMsg(null);
    try {
      const ok = await bridge.validateConnection(config);
      setValidationMsg(ok ? { ok: true, text: "Connected successfully" } : { ok: false, text: "Connection failed — check host and credentials" });
    } catch (err) {
      setValidationMsg({ ok: false, text: String(err) });
    } finally {
      setValidating(false);
    }
  }

  async function handleDelete(host: string) {
    await deleteBridgeConfig(host);
    setBridges((prev) => prev.filter((b) => b.host !== host));
    if (activeBridgeHost === host) setActiveBridgeHost(null);
  }

  async function handleActivate(host: string) {
    if (currentWindowId == null) return;
    await chrome.runtime.sendMessage({ type: "SET_ACTIVE_BRIDGE", windowId: currentWindowId, host });
    setActiveBridgeHost(host);
  }

  function startWizard() {
    setWizard(EMPTY_WIZARD);
    setValidationMsg(null);
    setStep("pick-platform");
  }

  const daemonStatus = (
    <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, marginBottom: 10 }}>
      <span style={{
        width: 7, height: 7, borderRadius: "50%",
        background: daemonConnected === null ? "#ccc" : daemonConnected ? "#2d9f6e" : "#c0392b",
        display: "inline-block",
        flexShrink: 0,
      }} />
      <span style={{ color: "#666" }}>
        {daemonConnected === null ? "Checking daemon…" : daemonConnected ? "Daemon connected" : "Daemon not running — run ishtrak daemon"}
      </span>
    </div>
  );

  if (loading) {
    return <Shell daemonStatus={daemonStatus}><p style={styles.muted}>Loading...</p></Shell>;
  }

  // ── Step: list existing bridges ──
  if (step === "list") {
    return (
      <Shell daemonStatus={daemonStatus}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <p style={{ ...styles.muted, margin: 0 }}>{bridges.length} bridge{bridges.length !== 1 ? "s" : ""} configured</p>
          <button style={styles.primaryBtn} onClick={startWizard}>+ Add bridge</button>
        </div>
        {bridges.map((b) => (
          <BridgeCard
            key={b.host}
            config={b}
            isActive={activeBridgeHost === b.host}
            onActivate={handleActivate}
            onDelete={handleDelete}
          />
        ))}
      </Shell>
    );
  }

  // ── Step 1: pick platform ──
  if (step === "pick-platform") {
    return (
      <Shell daemonStatus={daemonStatus}>
        <h3 style={styles.stepTitle}>Select platform</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {BRIDGES.map((b) => (
            <button
              key={b.platformType}
              style={wizard.platform === b.platformType ? styles.platformBtnSelected : styles.platformBtn}
              onClick={() => setWizard((w) => ({ ...w, platform: b.platformType }))}
            >
              {b.displayName}
            </button>
          ))}
        </div>
        <WizardNav
          onBack={bridges.length > 0 ? () => setStep("list") : undefined}
          onNext={wizard.platform ? () => {
            const bridge = getBridge(wizard.platform)!;
            const defaultHosts: Record<string, string> = { linear: "api.linear.app", github: "github.com" };
            const next: Step = bridge.supportedStrategies.length > 1 ? "pick-strategy" : "config";
            setWizard((w) => ({
              ...w,
              host: defaultHosts[wizard.platform] || w.host,
              strategy: bridge.supportedStrategies.length === 1 ? bridge.supportedStrategies[0] : w.strategy,
            }));
            setStep(next);
          } : undefined}
          nextLabel="Next"
        />
      </Shell>
    );
  }

  // ── Step 2: pick strategy (only shown when >1 options) ──
  if (step === "pick-strategy") {
    const bridge = getBridge(wizard.platform)!;
    const strategyLabels: Record<Strategy, string> = {
      API_DIRECT_SESSION: "Browser session (no token)",
      API_DIRECT_TOKEN: "API token / Personal Access Token",
      FORM_FILL: "Form fill (DOM automation)",
    };
    return (
      <Shell daemonStatus={daemonStatus}>
        <h3 style={styles.stepTitle}>Authentication strategy</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {bridge.supportedStrategies.map((s) => (
            <button
              key={s}
              style={wizard.strategy === s ? styles.platformBtnSelected : styles.platformBtn}
              onClick={() => setWizard((w) => ({ ...w, strategy: s }))}
            >
              {strategyLabels[s]}
            </button>
          ))}
        </div>
        <WizardNav
          onBack={() => setStep("pick-platform")}
          onNext={wizard.strategy ? () => setStep("config") : undefined}
          nextLabel="Next"
        />
      </Shell>
    );
  }

  // ── Step 3: config form ──
  if (step === "config") {
    return (
      <Shell daemonStatus={daemonStatus}>
        <h3 style={styles.stepTitle}>Configure {getBridge(wizard.platform)?.displayName}</h3>
        <ConfigForm wizard={wizard} onChange={setWizard} />
        <WizardNav
          onBack={() => {
            const bridge = getBridge(wizard.platform)!;
            setStep(bridge.supportedStrategies.length > 1 ? "pick-strategy" : "pick-platform");
          }}
          onNext={wizard.host ? () => {
            setValidationMsg(null);
            setStep("validate");
          } : undefined}
          nextLabel="Next"
        />
      </Shell>
    );
  }

  // ── Step 4: validate + save ──
  if (step === "validate") {
    return (
      <Shell daemonStatus={daemonStatus}>
        <h3 style={styles.stepTitle}>Test connection</h3>
        <div style={styles.summaryBox}>
          <div><strong>Host:</strong> {wizard.host}</div>
          <div><strong>Platform:</strong> {getBridge(wizard.platform)?.displayName}</div>
          <div><strong>Strategy:</strong> {wizard.strategy}</div>
          {wizard.projectId && <div><strong>Project:</strong> {wizard.projectId}</div>}
        </div>
        <button
          style={{ ...styles.primaryBtn, width: "100%", marginBottom: 8 }}
          onClick={handleValidate}
          disabled={validating}
        >
          {validating ? "Testing..." : "Test connection"}
        </button>
        {validationMsg && (
          <div style={{ ...styles.validationMsg, color: validationMsg.ok ? "#2d9f6e" : "#c0392b" }}>
            {validationMsg.ok ? "✓ " : "✗ "}{validationMsg.text}
          </div>
        )}
        <WizardNav
          onBack={() => setStep("config")}
          onNext={validationMsg?.ok ? handleSave : undefined}
          nextLabel="Save bridge"
        />
      </Shell>
    );
  }

  return null;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Shell({ children, daemonStatus }: { children: React.ReactNode; daemonStatus?: React.ReactNode }) {
  return (
    <div style={{ width: 340, padding: "12px 16px", fontFamily: "system-ui, sans-serif" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 16 }}>Ishtrak</h2>
      <p style={{ ...styles.muted, margin: "0 0 8px" }}>Git-native task automation</p>
      {daemonStatus}
      {children}
      <div style={{ marginTop: 16, borderTop: "1px solid #eee", paddingTop: 10, fontSize: 11, color: "#bbb" }}>
        Run <code>ishtrak init</code> to configure the CLI
      </div>
    </div>
  );
}

function BridgeCard({
  config,
  isActive,
  onActivate,
  onDelete,
}: {
  config: BridgeConfig;
  isActive: boolean;
  onActivate: (host: string) => void;
  onDelete: (host: string) => void;
}) {
  const [checking, setChecking] = React.useState(false);
  const [checkResult, setCheckResult] = React.useState<{ ok: boolean; error?: string } | null>(null);

  async function handleCheck() {
    setChecking(true);
    setCheckResult(null);
    try {
      const resp = await chrome.runtime.sendMessage({ type: "VALIDATE_BRIDGE", host: config.host });
      setCheckResult({ ok: resp.ok, error: resp.error });
    } catch (err) {
      setCheckResult({ ok: false, error: String(err) });
    } finally {
      setChecking(false);
    }
  }

  const strategyLabel: Record<string, string> = {
    API_DIRECT_SESSION: "session",
    API_DIRECT_TOKEN: "token",
    FORM_FILL: "form fill",
  };

  return (
    <div style={{ ...styles.card, borderColor: isActive ? "#1a73e8" : "#e0e0e0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <strong style={{ fontSize: 13 }}>{config.host}</strong>
            {isActive && <span style={styles.activeBadge}>Active</span>}
          </div>
          <div style={{ fontSize: 11, color: "#2d9f6e", marginTop: 2 }}>
            {config.displayName ?? config.platformType} · {strategyLabel[config.strategy] ?? config.strategy}
          </div>
          {config.projectId && (
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>Project: {config.projectId}</div>
          )}
          {checkResult && (
            <div style={{ fontSize: 11, marginTop: 4, color: checkResult.ok ? "#2d9f6e" : "#c0392b" }}>
              {checkResult.ok ? "✓ Connected" : `✗ ${checkResult.error ?? "Auth expired or unreachable"}`}
            </div>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-end" }}>
          {!isActive && (
            <button onClick={() => onActivate(config.host)} style={styles.activateBtn}>Activate</button>
          )}
          <button onClick={handleCheck} disabled={checking} style={styles.checkBtn}>
            {checking ? "…" : "Check"}
          </button>
          <button onClick={() => onDelete(config.host)} style={styles.removeBtn}>Remove</button>
        </div>
      </div>
    </div>
  );
}

function ConfigForm({
  wizard,
  onChange,
}: {
  wizard: WizardState;
  onChange: React.Dispatch<React.SetStateAction<WizardState>>;
}) {
  const isJira = wizard.platform === "jira";
  const isLinear = wizard.platform === "linear";
  const isGitHub = wizard.platform === "github";
  const needsToken = wizard.strategy === "API_DIRECT_TOKEN" || isLinear || isGitHub;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {(isJira || !isLinear) && (
        <Field
          label={isGitHub ? "Host (leave as github.com)" : "Host"}
          value={wizard.host}
          placeholder={isJira ? "jira.mycompany.com" : isGitHub ? "github.com" : ""}
          onChange={(v) => onChange((w) => ({ ...w, host: v }))}
        />
      )}
      {isLinear && (
        <Field label="Host" value={wizard.host || "api.linear.app"} onChange={() => {}} disabled />
      )}
      {needsToken && (
        <Field
          label={isLinear ? "Linear API key" : isGitHub ? "Personal Access Token" : "API token (Base64 user:token)"}
          value={wizard.token}
          placeholder={isLinear ? "lin_api_..." : isGitHub ? "ghp_..." : ""}
          onChange={(v) => onChange((w) => ({ ...w, token: v }))}
          password
        />
      )}
      <Field
        label={isGitHub ? "Repository (owner/repo)" : "Project ID / Key"}
        value={wizard.projectId}
        placeholder={isJira ? "PROJ" : isGitHub ? "owner/repo" : isLinear ? "Team ID" : ""}
        onChange={(v) => onChange((w) => ({ ...w, projectId: v }))}
      />
    </div>
  );
}

function Field({
  label,
  value,
  placeholder = "",
  onChange,
  password = false,
  disabled = false,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (v: string) => void;
  password?: boolean;
  disabled?: boolean;
}) {
  return (
    <div>
      <label style={{ fontSize: 11, color: "#555", display: "block", marginBottom: 3 }}>{label}</label>
      <input
        type={password ? "password" : "text"}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        style={styles.input}
      />
    </div>
  );
}

function WizardNav({
  onBack,
  onNext,
  nextLabel = "Next",
}: {
  onBack?: () => void;
  onNext?: (() => void) | (() => Promise<void>);
  nextLabel?: string;
}) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, gap: 8 }}>
      {onBack ? (
        <button style={styles.secondaryBtn} onClick={onBack}>Back</button>
      ) : (
        <span />
      )}
      {onNext && (
        <button style={styles.primaryBtn} onClick={() => onNext?.()}>
          {nextLabel}
        </button>
      )}
    </div>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  muted: { fontSize: 12, color: "#666" } as React.CSSProperties,
  stepTitle: { fontSize: 14, margin: "0 0 12px", fontWeight: 600 } as React.CSSProperties,
  card: {
    border: "1px solid #e0e0e0",
    borderRadius: 6,
    padding: "8px 10px",
    marginBottom: 8,
    fontSize: 13,
  } as React.CSSProperties,
  summaryBox: {
    background: "#f8f8f8",
    borderRadius: 6,
    padding: "8px 10px",
    fontSize: 12,
    marginBottom: 10,
    lineHeight: 1.8,
  } as React.CSSProperties,
  input: {
    width: "100%",
    boxSizing: "border-box" as const,
    fontSize: 12,
    padding: "5px 8px",
    border: "1px solid #ddd",
    borderRadius: 4,
    outline: "none",
  } as React.CSSProperties,
  primaryBtn: {
    background: "#1a73e8",
    color: "#fff",
    border: "none",
    borderRadius: 4,
    padding: "6px 14px",
    fontSize: 12,
    cursor: "pointer",
  } as React.CSSProperties,
  secondaryBtn: {
    background: "none",
    color: "#555",
    border: "1px solid #ddd",
    borderRadius: 4,
    padding: "6px 14px",
    fontSize: 12,
    cursor: "pointer",
  } as React.CSSProperties,
  platformBtn: {
    background: "#fff",
    border: "1px solid #ddd",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left" as const,
  } as React.CSSProperties,
  platformBtnSelected: {
    background: "#e8f0fe",
    border: "1px solid #1a73e8",
    borderRadius: 6,
    padding: "10px 12px",
    fontSize: 13,
    cursor: "pointer",
    textAlign: "left" as const,
    color: "#1a73e8",
    fontWeight: 600,
  } as React.CSSProperties,
  removeBtn: {
    background: "none",
    border: "1px solid #ddd",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
    color: "#888",
    padding: "2px 6px",
  } as React.CSSProperties,
  activateBtn: {
    background: "none",
    border: "1px solid #1a73e8",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
    color: "#1a73e8",
    padding: "2px 6px",
  } as React.CSSProperties,
  checkBtn: {
    background: "none",
    border: "1px solid #ddd",
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 11,
    color: "#555",
    padding: "2px 6px",
  } as React.CSSProperties,
  activeBadge: {
    background: "#e8f5ee",
    color: "#2d9f6e",
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 600,
    padding: "1px 5px",
  } as React.CSSProperties,
  validationMsg: {
    fontSize: 12,
    marginBottom: 8,
    padding: "6px 8px",
    borderRadius: 4,
    background: "#f8f8f8",
  } as React.CSSProperties,
};
