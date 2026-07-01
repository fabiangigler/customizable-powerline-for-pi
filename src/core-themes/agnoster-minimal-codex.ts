// Customizable Powerline for Pi theme/config.
// Based on the bundled agnoster-compact theme, with Codex 5h usage.
// Run /powerline:theme agnoster-minimal-codex or /reload after editing.
import { execFile } from "node:child_process";

const memo = (runtime, key, create) => {
  if (!runtime.memo.has(key)) runtime.memo.set(key, create());
  return runtime.memo.get(key);
};

const getContextPercentage = (runtime) =>
  memo(runtime, "contextPercentage", () => {
    const context = runtime.ctx.getContextUsage();
    if (!context?.tokens || !context?.contextWindow) return 0;
    return Math.round((context.tokens / context.contextWindow) * 100);
  });

const getPiIndicator = (ctx, data) => {
  const text = ctx.isIdle()
    ? "π"
    : ["⠇", "⠋", "⠙", "⠸", "⠴", "⠦"][Math.floor(Date.now() / 250) % 6];
  return data.fg?.("thinkingText", text) ?? text;
};

const gitStatusCache = new Map();
const gitStatusTtlMs = 1000;

const parseGitStatus = (stdout) => {
  const status = stdout.trimEnd().split("\n");
  const header = status[0] ?? "";
  const branch = header.startsWith("## No commits yet on ")
    ? header.slice("## No commits yet on ".length)
    : header.startsWith("## ")
      ? header.slice(3).split("...")[0].split(" ")[0]
      : "";
  if (!branch || branch === "HEAD") return null;

  const hasUncommittedChanges = status.slice(1).some(Boolean);
  const hasUnpulledChanges = /(?:^|[, ])behind \d+/.test(header);
  const hasUnpushedChanges = /(?:^|[, ])ahead \d+/.test(header);
  const suffix = [
    hasUncommittedChanges ? "±" : "",
    hasUnpulledChanges ? "⇣" : "",
    hasUnpushedChanges ? "⇡" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return {
    label: " " + branch + (suffix ? " " + suffix : ""),
    hasUncommittedChanges,
    hasRemoteChanges: hasUnpulledChanges || hasUnpushedChanges,
  };
};

const refreshGitPowerlineStatus = (ctx, data) => {
  const cached = gitStatusCache.get(ctx.cwd);
  if (cached?.refreshing) return;

  gitStatusCache.set(ctx.cwd, {
    at: cached?.at ?? 0,
    value: cached?.value ?? null,
    refreshing: true,
  });

  execFile(
    "git",
    ["--no-optional-locks", "status", "--porcelain=v1", "--branch"],
    {
      cwd: ctx.cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      timeout: 250,
    },
    (error, stdout) => {
      const value = error ? (cached?.value ?? null) : parseGitStatus(stdout);
      gitStatusCache.set(ctx.cwd, {
        at: Date.now(),
        value,
        refreshing: false,
      });
      data.requestRender?.();
    },
  );
};

const readGitPowerlineStatus = (runtime) => {
  const cached = gitStatusCache.get(runtime.ctx.cwd);
  if (!cached) {
    refreshGitPowerlineStatus(runtime.ctx, runtime.data);
    return null;
  }
  if (Date.now() - cached.at >= gitStatusTtlMs) {
    refreshGitPowerlineStatus(runtime.ctx, runtime.data);
  }
  return cached.value;
};

const getGitPowerlineStatus = (runtime) =>
  memo(runtime, "gitPowerlineStatus", () => readGitPowerlineStatus(runtime));

const getThinkingLabel = (ctx) => {
  if (!ctx.model?.reasoning) return "";
  const level = ctx.sessionManager.buildSessionContext().thinkingLevel ?? "med";
  const normalized = String(level).toLowerCase();
  if (normalized.startsWith("minimal")) return "min";
  if (normalized.startsWith("low")) return "low";
  if (normalized.startsWith("medium") || normalized.startsWith("med")) return "med";
  if (normalized.startsWith("high")) return "hig";
  if (normalized.startsWith("x")) return "xhi";
  return normalized.slice(0, 3);
};

const codexUsageCache = {
  at: 0,
  value: null,
  error: null,
  refreshing: false,
};
const codexUsageTtlMs = 10 * 60_000;
const codexUsageErrorTtlMs = 30 * 60_000;
const chatGptAuthClaim = "https://api.openai.com/auth";

const decodeJwtPayload = (token) => {
  const payload = token.split(".")[1];
  if (!payload) return null;
  const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  try {
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
};

const getChatGptAccountId = (token) =>
  decodeJwtPayload(token)?.[chatGptAuthClaim]?.chatgpt_account_id ?? null;

const getCandidateWindows = (payload) => {
  const rateLimit = payload?.rate_limit ?? payload?.rateLimit ?? payload;
  return [
    rateLimit?.primary_window,
    rateLimit?.secondary_window,
    rateLimit?.five_hour_limit,
    rateLimit?.five_hour_window,
    payload?.primary_window,
    payload?.five_hour_limit,
    payload?.five_hour_window,
  ].filter(Boolean);
};

const getWindowUsedPercent = (window) => {
  if (!window || typeof window !== "object") return null;
  for (const key of ["used_percent", "usedPercent", "usage_percent", "usagePercent", "percent"]) {
    const value = window[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(value);
  }
  for (const key of ["remaining_percent", "remainingPercent", "percent_remaining", "percentRemaining"]) {
    const value = window[key];
    if (typeof value === "number" && Number.isFinite(value)) return Math.round(100 - value);
  }
  const used = window.used ?? window.consumed;
  const limit = window.limit ?? window.total ?? window.max;
  if (typeof used === "number" && typeof limit === "number" && limit > 0) {
    return Math.round((used / limit) * 100);
  }
  const remaining = window.remaining;
  if (typeof remaining === "number" && typeof limit === "number" && limit > 0) {
    return Math.round(((limit - remaining) / limit) * 100);
  }
  return null;
};

const getCodexFiveHourUsedPercent = (payload) => {
  const windows = getCandidateWindows(payload);
  const fiveHourWindow =
    windows.find((window) => {
      const seconds = window?.limit_window_seconds ?? window?.limitWindowSeconds ?? window?.window_seconds;
      return typeof seconds === "number" && seconds > 0 && seconds <= 24 * 60 * 60;
    }) ?? windows[0];

  const percent = getWindowUsedPercent(fiveHourWindow);
  if (percent === null) return null;
  return Math.max(0, Math.min(100, percent));
};

const refreshCodexUsage = (runtime) => {
  if (codexUsageCache.refreshing) return;
  codexUsageCache.refreshing = true;

  (async () => {
    try {
      const token = await runtime.ctx.modelRegistry.getApiKeyForProvider("openai-codex");
      const accountId = token ? getChatGptAccountId(token) : null;
      if (!token || !accountId) throw new Error("OpenAI Codex OAuth is not available");

      const response = await fetch("https://chatgpt.com/backend-api/wham/usage", {
        headers: {
          Authorization: `Bearer ${token}`,
          "chatgpt-account-id": accountId,
          originator: "pi",
          accept: "application/json",
        },
      });
      if (!response.ok) throw new Error(`Codex usage request failed: ${response.status}`);

      const payload = await response.json();
      const percent = getCodexFiveHourUsedPercent(payload);
      if (percent === null) throw new Error("Codex 5h usage window unavailable");

      codexUsageCache.value = percent;
      codexUsageCache.error = null;
      codexUsageCache.at = Date.now();
    } catch (error) {
      codexUsageCache.error = error;
      codexUsageCache.at = Date.now();
    } finally {
      codexUsageCache.refreshing = false;
      runtime.data.requestRender?.();
    }
  })();
};

const readCodexUsagePercentage = (runtime) => {
  const ttl = codexUsageCache.error ? codexUsageErrorTtlMs : codexUsageTtlMs;
  if (!codexUsageCache.at || Date.now() - codexUsageCache.at >= ttl) {
    refreshCodexUsage(runtime);
  }
  return codexUsageCache.value;
};

const getCodexUsagePercentage = (runtime) =>
  memo(runtime, "codexUsagePercentage", () => readCodexUsagePercentage(runtime));

const usageColor = (percent) => {
  if (percent > 90) return "#cc0000";
  return percent > 75 ? "#d86408" : "#3a3a3a";
};

const combinedUsageColor = (contextPercent, codexPercent) => {
  if (contextPercent > 90) return "#cc0000";
  if (contextPercent > 75) return "#d86408";
  if ((codexPercent ?? 0) > 75) return "#b8860b";
  return "#3a3a3a";
};

export default {
  fg: "#ffffff",
  bg: "",
  separator: "",
  rightSeparator: "",
  hideFooter: true,
  hideWorking: true,
  placement: "aboveEditor",
  left: [
    {
      id: "pi",
      color: "",
      separatorAfter: "",
      separatorAfterFg: "#1a1a1a",
      value: ({ ctx, data }) => getPiIndicator(ctx, data),
    },
    {
      id: "model",
      color: "#073642",
      separatorAfter: "",
      value: ({ ctx }) => {
        const model = ctx.model?.id ?? "no-model";
        const thinking = getThinkingLabel(ctx);
        return thinking ? `${model} ${thinking}` : model;
      },
    },
    {
      id: "path",
      color: "#0037da",
      value: ({ ctx }) => ctx.cwd?.split(/[\\/]/).filter(Boolean).at(-1) ?? ctx.cwd,
    },
    {
      id: "git",
      color: (runtime) => {
        const status = getGitPowerlineStatus(runtime);
        if (status?.hasUncommittedChanges) return "#d7af00";
        if (status?.hasRemoteChanges) return "#d86408";
        return "#5faf00";
      },
      value: (runtime) => {
        const label = getGitPowerlineStatus(runtime)?.label;
        return label ?? null;
      },
    },
  ],
  right: [
    {
      id: "fastMode",
      color: ({ data }) =>
        data.getExtensionStatuses().get("fast-mode")?.includes("on")
          ? "#d7af00"
          : "#999999",
      value: ({ data }) =>
        data.getExtensionStatuses().get("fast-mode")?.includes("on")
          ? ""
          : "\x1b[9m\x1b[29m",
      separatorAfter: ({ data }) =>
        data.getExtensionStatuses().get("fast-mode")?.includes("on")
          ? ""
          : "",
    },
    {
      id: "context",
      color: (runtime) => {
        const contextPercent = getContextPercentage(runtime);
        const codexPercent = getCodexUsagePercentage(runtime);
        return combinedUsageColor(contextPercent, codexPercent);
      },
      value: (runtime) => {
        const contextPercent = getContextPercentage(runtime);
        const codexPercent = getCodexUsagePercentage(runtime);
        return codexPercent === null
          ? `${contextPercent}% `
          : `${contextPercent}%  ${codexPercent}% `;
      },
      separatorAfter: (runtime) => {
        const contextPercent = getContextPercentage(runtime);
        const codexPercent = getCodexUsagePercentage(runtime);
        return Math.max(contextPercent, codexPercent ?? 0) > 75 ? "" : "";
      },
      separatorAfterFg: (runtime) => {
        const contextPercent = getContextPercentage(runtime);
        const codexPercent = getCodexUsagePercentage(runtime);
        return combinedUsageColor(contextPercent, codexPercent);
      },
    },
  ],
};
