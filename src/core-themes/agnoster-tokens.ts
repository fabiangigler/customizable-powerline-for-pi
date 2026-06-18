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

const formatTokenCost = (cost) => {
  if (cost <= 0) return "$0";
  if (cost < 0.01) return "$" + cost.toFixed(4);
  if (cost < 1) return "$" + cost.toFixed(3);
  return "$" + cost.toFixed(2);
};

const tokenFg = (hex, text) => {
  const normalized = hex.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}`;
};

const getTokenTotals = (runtime) =>
  memo(runtime, "tokenTotals", () =>
    runtime.ctx.sessionManager
      .getBranch()
      .filter(
        (entry) =>
          entry.type === "message" && entry.message.role === "assistant",
      )
      .reduce(
        (totals, entry) => {
          const cost = entry.message.usage?.cost;
          totals.cached += cost?.cacheRead ?? 0;
          totals.input += (cost?.input ?? 0) + (cost?.cacheWrite ?? 0);
          totals.output += cost?.output ?? 0;
          return totals;
        },
        { cached: 0, input: 0, output: 0 },
      ),
  );

const tokenBar = (runtime) => {
  const totals = getTokenTotals(runtime);
  const values = [
    { key: "c", value: totals.cached, color: "#6fa929" },
    { key: "i", value: totals.input, color: "#B9DB3E" },
    { key: "o", value: totals.output, color: "#f18f01" },
  ];
  const total = values.reduce((sum, item) => sum + item.value, 0);
  if (total <= 0)
    return tokenFg("#777777", "────────────") + tokenFg("#ffffff", " $0");

  const width = 12;
  const counts = values.map((item) =>
    item.value > 0 ? Math.max(1, Math.round((item.value / total) * width)) : 0,
  );
  while (counts.reduce((sum, count) => sum + count, 0) > width) {
    const index = counts.indexOf(Math.max(...counts));
    counts[index] -= 1;
  }
  while (counts.reduce((sum, count) => sum + count, 0) < width) {
    const index = values
      .map((item, itemIndex) => ({ itemIndex, value: item.value }))
      .sort((a, b) => b.value - a.value)[0].itemIndex;
    counts[index] += 1;
  }

  const bar = values
    .map((item, index) => tokenFg(item.color, "■".repeat(counts[index])))
    .join("");

  return [
    bar,
    tokenFg("#6fa929", formatTokenCost(totals.cached)) + "c",
    tokenFg("#B9DB3E", formatTokenCost(totals.input)) + "i",
    tokenFg("#f18f01", formatTokenCost(totals.output)) + "o",
    tokenFg("#ffffff", ""),
  ].join(" ");
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
      value: ({ data }) =>
        data.getExtensionStatuses().get("fast-mode") ? "fast" : null,
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
      id: "tokens",
      color: "#3a3a3a",
      value: tokenBar,
    },
  ],
};
