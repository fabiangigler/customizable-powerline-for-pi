// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { existsSync, readdirSync } from "node:fs";
// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { dirname, join, resolve } from "node:path";
// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { fileURLToPath } from "node:url";
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

export const visibleWidth = (value: string): number => stripAnsi(value).length;

export const truncateToWidth = (value: string, width: number): string => {
  if (visibleWidth(value) <= width) return value;
  let output = "";
  let visible = 0;
  for (let index = 0; index < value.length && visible < width; ) {
    if (value[index] === "\x1b") {
      const match = /\x1b\[[0-9;]*m/.exec(value.slice(index));
      if (match?.index === 0) {
        output += match[0];
        index += match[0].length;
        continue;
      }
    }
    output += value[index];
    visible += 1;
    index += 1;
  }
  return output + reset;
};

export const normalizeHexColor = (value: string): string | undefined => {
  if (value === "") return "";
  const normalized = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(normalized)) return normalized;
  if (/^[0-9a-fA-F]{6}$/.test(normalized)) return `#${normalized}`;
  return undefined;
};

export const hexToRgb = (hex: string): [number, number, number] => {
  const normalized = hex.replace("#", "");
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
};

export const ansiFg = (hex: string): string => {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "\x1b[39m";
  if (normalized === "") return "\x1b[39m";
  const [r, g, b] = hexToRgb(normalized);
  return `\x1b[38;2;${r};${g};${b}m`;
};

export const ansiBg = (hex: string): string => {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return "\x1b[49m";
  if (normalized === "") return "\x1b[49m";
  const [r, g, b] = hexToRgb(normalized);
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

export const getPiHome = (): string =>
  process.env.PI_HOME ?? join(process.env.HOME ?? ".", ".pi", "agent");

export const getLocalConfigPath = (cwd: string, theme?: string): string =>
  theme
    ? join(cwd, ".pi", CONFIG_DIR, THEMES_DIR, `${sanitizeThemeName(theme)}.ts`)
    : join(cwd, ".pi", CONFIG_DIR, DEFAULT_CONFIG_FILE);

export const getAncestorDirs = (cwd: string): string[] => {
  const dirs: string[] = [];
  let current = resolve(cwd);
  while (true) {
    dirs.push(current);
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return dirs;
};

export const getLocalConfigPaths = (cwd: string, theme?: string): string[] =>
  getAncestorDirs(cwd).map((dir) => getLocalConfigPath(dir, theme));

export const getGlobalConfigPath = (theme?: string): string =>
  theme
    ? join(getPiHome(), CONFIG_DIR, THEMES_DIR, `${sanitizeThemeName(theme)}.ts`)
    : join(getPiHome(), CONFIG_DIR, DEFAULT_CONFIG_FILE);

const sourceDir = (): string => dirname(fileURLToPath(import.meta.url));

export const getCoreThemeNames = (): string[] => ["default", "agnoster-tokens"];

export const getCoreConfigPath = (theme?: string): string | undefined => {
  const themeName = theme ? sanitizeThemeName(theme) : "default";
  if (!getCoreThemeNames().includes(themeName)) return undefined;
  return join(sourceDir(), "core-themes", `${themeName}.ts`);
};

export const getConfigPath = (cwd: string, theme?: string): string =>
  getGlobalConfigPath(theme);

const getThemeNamesFromDir = (dir: string): string[] => {
  if (!existsSync(dir)) return [];
  try {
    return readdirSync(dir)
      .filter((file) => file.endsWith(".ts"))
      .map((file) => file.replace(/\.ts$/, ""));
  } catch {
    return [];
  }
};

export const getThemeNames = (cwd: string): string[] =>
  Array.from(
    new Set([
      ...getAncestorDirs(cwd).flatMap((dir) =>
        getThemeNamesFromDir(join(dir, ".pi", CONFIG_DIR, THEMES_DIR)),
      ),
      ...getThemeNamesFromDir(join(getPiHome(), CONFIG_DIR, THEMES_DIR)),
      ...getCoreThemeNames(),
    ]),
  ).sort();

export const getThemePaths = (cwd: string, theme?: string): string[] => [
  ...getLocalConfigPaths(cwd, theme),
  getGlobalConfigPath(theme),
  ...(getCoreConfigPath(theme) ? [getCoreConfigPath(theme)] : []),
];

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
