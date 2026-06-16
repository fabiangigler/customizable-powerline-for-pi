// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { existsSync, readdirSync } from "node:fs";
// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { join } from "node:path";
import {
  CONFIG_DIR,
  DEFAULT_CONFIG_FILE,
  THEMES_DIR,
} from "./constants.ts";
import type {
  ExtensionContext,
  Placement,
  PowerlineMessageEntry,
  PowerlineSessionEntry,
  PowerlineState,
  SegmentValueContext,
  DynamicValue,
} from "./types.ts";

declare const process: { env: Record<string, string | undefined> };

export const stripAnsi = (value: string): string =>
  value.replace(/\x1b\[[0-9;]*m/g, "");

export const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
};

export const ansiFg = (hex: string): string => {
  if (hex === "") return "\x1b[39m";
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[38;2;${r};${g};${b}m`;
};

export const ansiBg = (hex: string): string => {
  if (hex === "") return "\x1b[49m";
  const [r, g, b] = hexToRgb(hex);
  return `\x1b[48;2;${r};${g};${b}m`;
};

export const reset = "\x1b[0m";

const ANSI_16_COLORS = [
  "#000000",
  "#800000",
  "#008000",
  "#808000",
  "#000080",
  "#800080",
  "#008080",
  "#c0c0c0",
  "#808080",
  "#ff0000",
  "#00ff00",
  "#ffff00",
  "#0000ff",
  "#ff00ff",
  "#00ffff",
  "#ffffff",
];

export const ansi256ToHex = (index: number): string | undefined => {
  if (index >= 0 && index < 16) return ANSI_16_COLORS[index];
  if (index >= 16 && index < 232) {
    const cubeIndex = index - 16;
    const r = Math.floor(cubeIndex / 36);
    const g = Math.floor((cubeIndex % 36) / 6);
    const b = cubeIndex % 6;
    const toHex = (value: number) =>
      (value === 0 ? 0 : 55 + value * 40).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }
  if (index >= 232 && index < 256) {
    const gray = (8 + (index - 232) * 10).toString(16).padStart(2, "0");
    return `#${gray}${gray}${gray}`;
  }
  return undefined;
};

export const getColorFgBgBackground = (): string | undefined => {
  const bg = process.env.COLORFGBG?.split(";").at(-1);
  if (!bg) return undefined;
  const index = Number.parseInt(bg, 10);
  return Number.isInteger(index) ? ansi256ToHex(index) : undefined;
};

export const resolveDynamic = <T>(
  value: DynamicValue<T>,
  runtime: SegmentValueContext,
): T =>
  typeof value === "function"
    ? (value as (runtime: SegmentValueContext) => T)(runtime)
    : value;

export const getCutoutColor = (bg: string): string =>
  bg || getColorFgBgBackground() || "#000000";

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isPowerlineState = (value: unknown): value is PowerlineState =>
  isRecord(value) &&
  (value.enabled === undefined || typeof value.enabled === "boolean") &&
  (value.theme === undefined || typeof value.theme === "string");

export const sanitizeThemeName = (name: string): string =>
  name.trim().replace(/\.(ts|js)$/, "").replace(/\.config$/, "").replace(/[^a-zA-Z0-9._-]/g, "-");

export const getConfigPath = (cwd: string, theme?: string): string =>
  theme
    ? join(cwd, ".pi", CONFIG_DIR, THEMES_DIR, `${sanitizeThemeName(theme)}.ts`)
    : join(cwd, ".pi", CONFIG_DIR, DEFAULT_CONFIG_FILE);

export const getThemeNames = (cwd: string): string[] => {
  const dir = join(cwd, ".pi", CONFIG_DIR, THEMES_DIR);
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => file.replace(/\.ts$/, ""))
      .sort();
  } catch {
    return [];
  }
};

export const isPlacement = (value: unknown): value is Placement =>
  value === "footer" || value === "aboveEditor" || value === "belowEditor";

export const isAssistantMessageEntry = (
  entry: PowerlineSessionEntry,
): entry is PowerlineMessageEntry =>
  entry.type === "message" && entry.message.role === "assistant";

export const getContextPercentage = (ctx: ExtensionContext) => {
  const context = ctx.getContextUsage();
  if (!context?.tokens || !context?.contextWindow) return 0;
  return Math.round((context.tokens / context.contextWindow) * 100);
};
