// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { dirname, join } from "node:path";
// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { fileURLToPath } from "node:url";
import defaultTheme from "./default-theme.ts";
import type { PowerlineConfigInput } from "./types.ts";
import { getConfigPath } from "./utils.ts";

export const defaultConfigInput = (): PowerlineConfigInput =>
  defaultTheme as PowerlineConfigInput;

const defaultThemeSourcePath = (): string =>
  join(dirname(fileURLToPath(import.meta.url)), "default-theme.ts");

const publishedConfigSource = (): string =>
  readFileSync(defaultThemeSourcePath(), "utf8").replace(
    "// Customizable Powerline for Pi default theme/config.\n// This file is both the built-in default and the source copied by /powerline:publish.\n",
    "// Customizable Powerline for Pi theme/config.\n",
  );

export const publishDefaultConfig = (
  cwd: string,
  theme?: string,
  options: { force?: boolean } = {},
): string => {
  const filePath = getConfigPath(cwd, theme);
  if (!options.force && existsSync(filePath)) {
    throw new Error(`Powerline config already exists: ${filePath}`);
  }
  mkdirSync(dirname(filePath), { recursive: true });
  writeFileSync(filePath, publishedConfigSource());
  return filePath;
};
