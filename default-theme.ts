// Customizable Powerline for Pi theme/config.
// Edit the published copy, then run /powerline:theme default or /reload.
import { execSync } from "node:child_process";

const getContextPercentage = (ctx) => {
  const context = ctx.getContextUsage();
  if (!context?.tokens || !context?.contextWindow) return 0;
  return Math.round((context.tokens / context.contextWindow) * 100);
};

const getPiIndicator = (ctx, data) => {
  const text = ctx.isIdle()
    ? "π"
    : ["⠇", "⠋", "⠙", "⠸", "⠴", "⠦"][Math.floor(Date.now() / 120) % 6];
  return data.fg?.("thinkingText", text) ?? text;
};

const getGitPowerlineStatus = (ctx) => {
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
    if (!branch) return null;
    const hasUncommittedChanges = status.slice(1).some(Boolean);
    const hasUnpulledChanges = /(?:^|[, ])behind \d+/.test(header);
    const hasUnpushedChanges = /(?:^|[, ])ahead \d+/.test(header);
    const suffix = [
      hasUncommittedChanges ? " ± " : "",
      hasUnpulledChanges ? " ⇣ " : "",
      hasUnpushedChanges ? " ⇡ " : "",
    ]
      .filter(Boolean)
      .join(" ");
    return {
      label: "  " + branch + (suffix ? " " + suffix : ""),
      hasUncommittedChanges,
      hasRemoteChanges: hasUnpulledChanges || hasUnpushedChanges,
    };
  } catch {
    return null;
  }
};

export default {
  fg: "#ffffff",
  bg: "#1a1a1a",
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
      separatorAfterFg: ({ config }) =>
        typeof config.bg === "string" ? config.bg : "#1a1a1a",
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
      color: ({ ctx }) => {
        const status = getGitPowerlineStatus(ctx);
        if (status?.hasUncommittedChanges) return "#d7af00";
        if (status?.hasRemoteChanges) return "#d86408";
        return "#5faf00";
      },
      value: ({ ctx }) => {
        const label = getGitPowerlineStatus(ctx)?.label;
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
      color: ({ ctx }) => {
        const percent = getContextPercentage(ctx);
        if (percent > 90) return "#cc0000";
        return percent > 75 ? "#d86408" : "#3a3a3a";
      },
      value: ({ ctx }) => String(getContextPercentage(ctx)) + "%",
      separatorAfter: ({ ctx }) => (getContextPercentage(ctx) > 75 ? "" : ""),
      separatorAfterFg: ({ ctx }) => {
        const percent = getContextPercentage(ctx);
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
