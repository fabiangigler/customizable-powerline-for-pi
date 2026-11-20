// Customizable Powerline for Pi theme/config.
// Based on agnoster-compact, with selected-provider subscription usage.
// Run /powerline:theme agnoster-minimal-codex or /reload after editing.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";

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
  const cwd = ctx.cwd;
  const cached = gitStatusCache.get(cwd);
  if (cached?.refreshing) return;

  gitStatusCache.set(cwd, {
    at: cached?.at ?? 0,
    value: cached?.value ?? null,
    refreshing: true,
  });

  execFile(
    "git",
    ["--no-optional-locks", "status", "--porcelain=v1", "--branch"],
    {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      timeout: 250,
    },
    (error, stdout) => {
      const value = error ? (cached?.value ?? null) : parseGitStatus(stdout);
      gitStatusCache.set(cwd, {
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

const formatModelLabel = (runtime) => {
  const model = runtime.ctx.model?.id ?? "no-model";
  return runtime.width < 100 ? model.replace(/^gpt-/, "") : model;
};

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

const usageCache = new Map();
const usageViews = new WeakMap();
const usageTtlMs = 10 * 60_000;
const usageErrorTtlMs = 5 * 60_000;
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

const getCodexWindowResetAt = (window, receivedAt) => {
  const resetAt = window?.reset_at ?? window?.resetAt;
  if (typeof resetAt === "number" && Number.isFinite(resetAt)) return resetAt * 1000;

  const resetAfterSeconds = window?.reset_after_seconds ?? window?.resetAfterSeconds;
  if (typeof resetAfterSeconds === "number" && Number.isFinite(resetAfterSeconds)) {
    return receivedAt + resetAfterSeconds * 1000;
  }

  return null;
};

const windowLabel = (seconds) => {
  if (!Number.isFinite(seconds) || seconds <= 0) return "quota";
  if (seconds % 86400 === 0) return `${seconds / 86400}d`;
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  return `${Math.ceil(seconds / 60)}m`;
};

// Percentages are USED, not remaining. Model-specific pools only match explicit names.
export const parseProviderUsage = (provider, payload, modelId, receivedAt = Date.now()) => {
  const windows = [];
  if (provider === "openai-codex") {
    const normalize = (name) => String(name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const additional = Array.isArray(payload?.additional_rate_limits) ? payload.additional_rate_limits : [];
    const specific = additional.find((limit) =>
      [limit?.limit_name, limit?.metered_feature].some((name) => name && normalize(name) === normalize(modelId)));
    for (const window of getCandidateWindows(specific ?? payload)) {
      const percent = getWindowUsedPercent(window);
      if (percent === null) continue;
      const seconds = window.limit_window_seconds ?? window.limitWindowSeconds ?? window.window_seconds;
      windows.push({ percent, label: windowLabel(seconds), resetAt: getCodexWindowResetAt(window, receivedAt) });
    }
  } else if (provider === "anthropic") {
    const modelWords = String(modelId).toLowerCase().split(/[-_.]/);
    for (const key of Object.keys(payload ?? {})) {
      const window = payload[key];
      let label;
      if (key === "five_hour") label = "5h";
      else if (key === "seven_day") label = "7d";
      else if (key.startsWith("seven_day_") && modelWords.includes(key.slice(10))) label = "7d";
      else continue;
      const percent = window?.utilization;
      if (typeof percent !== "number" || !Number.isFinite(percent)) continue;
      const resetAt = typeof window.resets_at === "string" ? Date.parse(window.resets_at) : NaN;
      windows.push({ percent, label, resetAt: Number.isFinite(resetAt) ? resetAt : null });
    }
  }
  return windows
    .filter((window) => Number.isFinite(window.percent) && (window.resetAt === null || window.resetAt > Date.now()))
    .map((window) => ({ ...window, percent: Math.max(0, Math.min(100, Math.round(window.percent))) }))
    .sort((a, b) => b.percent - a.percent)[0] ?? null;
};

const headerValue = (headers, name) =>
  Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1];

const getUsageSource = (model, auth) => {
  if (!auth?.ok) return null;
  const codex = model.provider === "openai-codex";
  const origin = codex ? "https://chatgpt.com" : "https://api.anthropic.com";
  try {
    if (new URL(auth.baseUrl ?? model.baseUrl ?? origin).origin !== origin) return null;
  } catch { return null; }
  const authorization = headerValue(auth.headers, "authorization");
  const token = typeof authorization === "string" ? /^Bearer\s+(.+)$/i.exec(authorization)?.[1] : auth.apiKey;
  if (typeof token !== "string" || !token) return null;
  const accountId = codex ? headerValue(auth.headers, "chatgpt-account-id") ?? getChatGptAccountId(token) : "";
  if (codex ? typeof accountId !== "string" || !accountId : !token.startsWith("sk-ant-oat")) return null;
  const headers = {
    Authorization: `Bearer ${token}`, accept: "application/json",
    ...(codex ? { "chatgpt-account-id": accountId, originator: "pi" } : { "anthropic-beta": "oauth-2025-04-20" }),
  };
  return {
    // Never keep raw tokens in cache keys or persist them to disk.
    key: createHash("sha256").update(JSON.stringify([model.provider, origin, accountId, token])).digest("hex"),
    url: codex ? `${origin}/backend-api/wham/usage` : `${origin}/api/oauth/usage`,
    headers,
  };
};

const cachedUsage = (source, model) => {
  let entry = usageCache.get(source.key);
  if (entry && (entry.pending || Date.now() < entry.expires)) return entry;
  entry = { payload: null, at: 0, expires: 0, pending: null };
  usageCache.set(source.key, entry);
  if (usageCache.size > 32) usageCache.delete(usageCache.keys().next().value);
  entry.pending = Promise.resolve().then(async () => {
    try {
      const response = await fetch(source.url, {
        headers: source.headers, signal: AbortSignal.timeout(5000), redirect: "error",
      });
      if (!response.ok) {
        const retryAfter = response.headers?.get("retry-after");
        const seconds = Number(retryAfter);
        const retryAt = retryAfter && Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryAfter ?? "");
        if (Number.isFinite(retryAt) && retryAt > Date.now()) entry.expires = Math.max(Date.now() + usageErrorTtlMs, retryAt);
        return;
      }
      const payload = await response.json();
      entry.at = Date.now();
      const usage = parseProviderUsage(model.provider, payload, model.id, entry.at);
      entry.payload = payload;
      entry.expires = Math.min(entry.at + (usage ? usageTtlMs : usageErrorTtlMs), usage?.resetAt ?? Infinity);
    } catch {
      // Unofficial usage endpoints can fail or lack OAuth scope. Never show old data.
    } finally {
      entry.pending = null;
      if (!entry.expires) entry.expires = Date.now() + usageErrorTtlMs;
    }
  });
  return entry;
};

export const readProviderUsage = (runtime) => {
  const model = runtime.ctx.model;
  if (!(model?.provider === "openai-codex" && model.api === "openai-codex-responses") &&
      !(model?.provider === "anthropic" && model.api === "anthropic-messages")) return null;
  const registry = runtime.ctx.modelRegistry;
  if (!registry?.getApiKeyAndHeaders) return null;
  let view = usageViews.get(runtime.ctx);
  if (!view || view.model !== model) {
    view = { model, key: null, checking: false, nextCheck: 0 };
    usageViews.set(runtime.ctx, view);
  }
  if (!view.checking && Date.now() >= view.nextCheck) {
    view.checking = true;
    view.nextCheck = Date.now() + 1000;
    // Capture session-bound methods before awaiting; old contexts become stale on resume.
    const resolveAuth = registry.getApiKeyAndHeaders.bind(registry);
    const requestRender = runtime.data.requestRender;
    (async () => {
      let pending;
      try {
        const source = getUsageSource(model, await resolveAuth(model));
        view.key = source?.key ?? null;
        if (source) pending = cachedUsage(source, model).pending;
      } catch { view.key = null; }
      finally { view.checking = false; }
      // Slow quota fetches must not block checking a newly selected account.
      await pending;
      requestRender?.();
    })();
  }
  const entry = usageCache.get(view.key);
  if (!entry?.payload || entry.pending || Date.now() >= entry.expires) return null;
  return parseProviderUsage(model.provider, entry.payload, model.id, entry.at);
};

const getProviderUsage = (runtime) =>
  memo(runtime, "providerUsage", () => readProviderUsage(runtime));

const formatResetTime = (resetAt) => {
  if (!resetAt) return "";
  const remainingMinutes = Math.max(0, Math.ceil((resetAt - Date.now()) / 60_000));
  if (remainingMinutes >= 60) return `${(remainingMinutes / 60).toFixed(1)}h`;
  return `${remainingMinutes}m`;
};

const usageColor = (percent) => {
  if (percent > 90) return "#cc0000";
  return percent > 75 ? "#d86408" : "#3a3a3a";
};

const combinedUsageColor = (contextPercent, usagePercent) => {
  if (contextPercent > 90) return "#cc0000";
  if (contextPercent > 75) return "#d86408";
  if ((usagePercent ?? 0) > 75) return "#b8860b";
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
      value: (runtime) => {
        const model = formatModelLabel(runtime);
        const thinking = getThinkingLabel(runtime.ctx);
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
        data.getExtensionStatuses().get("fast-mode") === "ultrafast mode on"
          ? "#cc0000"
          : data.getExtensionStatuses().get("fast-mode")?.includes("on")
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
        const usage = getProviderUsage(runtime);
        return combinedUsageColor(contextPercent, usage?.percent);
      },
      value: (runtime) => {
        const contextPercent = getContextPercentage(runtime);
        const usage = getProviderUsage(runtime);
        if (usage === null) return `${contextPercent}% `;
        const reset = usage.percent > 75 ? formatResetTime(usage.resetAt) : "";
        return `${contextPercent}%  ${usage.percent}% ${usage.label} ${reset ? ` ${reset}` : ""}`;
      },
      separatorAfter: (runtime) => {
        const contextPercent = getContextPercentage(runtime);
        const usage = getProviderUsage(runtime);
        return Math.max(contextPercent, usage?.percent ?? 0) > 75 ? "" : "";
      },
      separatorAfterFg: (runtime) => {
        const contextPercent = getContextPercentage(runtime);
        const usage = getProviderUsage(runtime);
        return combinedUsageColor(contextPercent, usage?.percent);
      },
    },
  ],
};
