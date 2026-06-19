// Customizable Powerline for Pi theme/config.
// Edit the published copy, then run /powerline:theme default or /reload.
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
          ? "fast"
          : "\x1b[9mfast\x1b[29m",
      separatorAfter: ({ data }) =>
        data.getExtensionStatuses().get("fast-mode")?.includes("on")
          ? " "
          : "",
    },
    {
      id: "context",
      color: (runtime) => {
        const percent = getContextPercentage(runtime);
        if (percent > 90) return "#cc0000";
        return percent > 75 ? "#d86408" : "#3a3a3a";
      },
      value: (runtime) => String(getContextPercentage(runtime)) + "%",
      separatorAfter: (runtime) =>
        getContextPercentage(runtime) > 75 ? "" : "",
      separatorAfterFg: (runtime) => {
        const percent = getContextPercentage(runtime);
        if (percent > 90) return "#cc0000";
        return percent > 75 ? "#d86408" : "#1a1a1a";
      },
    },

  ],
};
