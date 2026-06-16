// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { dirname, join } from "node:path";
// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { fileURLToPath } from "node:url";
import { CONFIG_DIR, THEMES_DIR } from "./constants.ts";
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

export const publishDefaultConfig = (cwd: string, theme?: string): string => {
  const filePath = getConfigPath(cwd, theme);
  mkdirSync(
    theme
      ? join(cwd, ".pi", CONFIG_DIR, THEMES_DIR)
      : join(cwd, ".pi", CONFIG_DIR),
    { recursive: true },
  );
  writeFileSync(filePath, publishedConfigSource());
  return filePath;
};
