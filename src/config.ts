// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { existsSync } from "node:fs";
// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { pathToFileURL } from "node:url";
import { defaultConfigInput } from "./default-config.ts";
import type {
  ConfigModuleExport,
  PowerlineConfig,
  PowerlineConfigInput,
  PowerlineSegment,
  SegmentInput,
} from "./types.ts";
import { getThemePaths, isPlacement, isRecord } from "./utils.ts";

declare const console: { error(...args: unknown[]): void };

const normalizeSegment = (input: SegmentInput): PowerlineSegment | null => {
  if (!input) return null;
  if (
    typeof input.id === "string" &&
    (input.color === undefined ||
      typeof input.color === "string" ||
      typeof input.color === "function") &&
    typeof input.value === "function"
  )
    return input;
  return null;
};

export const normalizeConfig = (input: PowerlineConfigInput): PowerlineConfig => {
  const defaultInput = defaultConfigInput();
  const left = (input.left ?? defaultInput.left ?? [])
    .map(normalizeSegment)
    .filter(Boolean) as PowerlineSegment[];
  const right = (input.right ?? defaultInput.right ?? [])
    .map(normalizeSegment)
    .filter(Boolean) as PowerlineSegment[];

  return {
    fg:
      typeof input.fg === "string" || typeof input.fg === "function"
        ? input.fg
        : (defaultInput.fg ?? ""),
    bg:
      typeof input.bg === "string" || typeof input.bg === "function"
        ? input.bg
        : (defaultInput.bg ?? ""),
    separator:
      typeof input.separator === "string" ||
      typeof input.separator === "function"
        ? input.separator
        : (defaultInput.separator ?? ""),
    rightSeparator:
      typeof input.rightSeparator === "string" ||
      typeof input.rightSeparator === "function"
        ? input.rightSeparator
        : (defaultInput.rightSeparator ?? ""),
    hideFooter:
      typeof input.hideFooter === "boolean"
        ? input.hideFooter
        : (defaultInput.hideFooter ?? true),
    hideWorking:
      typeof input.hideWorking === "boolean"
        ? input.hideWorking
        : (defaultInput.hideWorking ?? true),
    placement: isPlacement(input.placement)
      ? input.placement
      : isPlacement(defaultInput.placement)
        ? defaultInput.placement
        : "aboveEditor",
    left,
    right,
  };
};

const loadConfigFile = async (
  configPath: string,
): Promise<PowerlineConfigInput | null> => {
  try {
    const moduleUrl = `${pathToFileURL(configPath).href}?t=${Date.now()}`;
    const mod = (await import(moduleUrl)) as {
      default?: ConfigModuleExport;
      config?: ConfigModuleExport;
    };
    const exported = mod.default ?? mod.config;
    if (typeof exported === "function") return await exported();
    if (isRecord(exported)) return exported as PowerlineConfigInput;
    return null;
  } catch (error) {
    console.error(
      "Failed to load customizable-powerline-for-pi config:",
      error,
    );
    return null;
  }
};

const loadTsConfig = async (
  cwd: string,
  theme?: string,
): Promise<PowerlineConfigInput | null> => {
  for (const configPath of getThemePaths(cwd, theme)) {
    if (!existsSync(configPath)) continue;
    const config = await loadConfigFile(configPath);
    if (config) return config;
  }
  return null;
};

export const loadPowerlineConfig = async (
  cwd: string,
  theme?: string,
): Promise<PowerlineConfig> => {
  const tsConfig = await loadTsConfig(cwd, theme);
  if (tsConfig) return normalizeConfig(tsConfig);
  if (theme) {
    const defaultTsConfig = await loadTsConfig(cwd);
    if (defaultTsConfig) return normalizeConfig(defaultTsConfig);
  }

  return normalizeConfig(defaultConfigInput());
};
