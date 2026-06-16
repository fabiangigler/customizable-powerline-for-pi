// Customizable Powerline for Pi theme/config.
// Edit the published copy, then run /powerline:theme default or /reload.
import { execSync } from "node:child_process";

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

const readGitPowerlineStatus = (ctx) => {
  const cached = gitStatusCache.get(ctx.cwd);
  if (cached && Date.now() - cached.at < gitStatusTtlMs) return cached.value;

  let value = null;
  try {
    const status = execSync("git status --porcelain=v1 --branch", {
      cwd: ctx.cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 250,
    })
      .trimEnd()
      .split("\n");
    const header = status[0] ?? "";
    const branch = execSync(
      "git branch --show-current 2>/dev/null || git rev-parse --short HEAD 2>/dev/null",
      {
        cwd: ctx.cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 250,
      },
    ).trim();
    if (branch) {
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
      value = {
        label: " " + branch + (suffix ? " " + suffix : ""),
        hasUncommittedChanges,
        hasRemoteChanges: hasUnpulledChanges || hasUnpushedChanges,
      };
    }
  } catch {
    value = null;
  }

  gitStatusCache.set(ctx.cwd, { at: Date.now(), value });
  return value;
};

const getGitPowerlineStatus = (runtime) =>
  memo(runtime, "gitPowerlineStatus", () =>
    readGitPowerlineStatus(runtime.ctx),
  );

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
      separatorAfter: "",
      separatorAfterFg: "#1a1a1a",
      value: ({ ctx }) => ctx.model?.id ?? "no-model",
    },
    {
      id: "thinking",
      color: "#073642",
      value: ({ ctx }) =>
        ctx.model?.reasoning
          ? (ctx.sessionManager.buildSessionContext().thinkingLevel ?? "med")
          : null,
    },
    {
      id: "path",
      color: "#0037da",
      value: ({ ctx }) => ctx.cwd?.replace("/home/coder/", ""),
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
      value: ({ data }) => {
        const status = data.getExtensionStatuses().get("fast-mode");
        return status ?? null;
      },
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
    {
      id: "cost",
      color: "#3a3a3a",
      value: ({ ctx }) => {
        const cost = ctx.sessionManager
          .getBranch()
          .filter(
            (entry) =>
              entry.type === "message" && entry.message.role === "assistant",
          )
          .reduce(
            (total, entry) => total + (entry.message.usage?.cost?.total ?? 0),
            0,
          );
        return cost > 0 ? "$" + cost.toFixed(cost < 0.01 ? 4 : 3) : "$0";
      },
    },
  ],
};
