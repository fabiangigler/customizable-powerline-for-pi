// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { existsSync } from "node:fs";
import { COMMAND_OPTIONS } from "./constants.ts";
import { publishDefaultConfig } from "./default-config.ts";
import type { CommandCompletion, ExtensionAPI, ExtensionContext } from "./types.ts";
import { getConfigPath, getThemeNames, sanitizeThemeName } from "./utils.ts";

declare const process: { env: Record<string, string | undefined> };

export type PowerlineRuntimeControls = {
  getEnabled(): boolean;
  setEnabled(enabled: boolean): void;
  getTheme(): string | undefined;
  setTheme(theme: string | undefined): void;
  persistState(): void;
  installPowerline(ctx: ExtensionContext): Promise<void>;
  hidePowerline(ctx: ExtensionContext): void;
  setCurrentContext(ctx: ExtensionContext): void;
  getCurrentContext(): ExtensionContext | undefined;
};

const getAvailableThemes = (ctx?: ExtensionContext): string[] => [
  "default",
  ...getThemeNames(ctx?.cwd ?? process.env.PWD ?? ""),
];

const getThemeCompletions = (
  prefix: string,
  ctx?: ExtensionContext,
): CommandCompletion[] =>
  getAvailableThemes(ctx)
    .filter((theme) => theme.startsWith(prefix))
    .map((theme) => ({ value: theme, label: theme }));

const executePowerlineCommand = async (
  command: string,
  rawName: string,
  ctx: ExtensionContext,
  controls: PowerlineRuntimeControls,
) => {
  controls.setCurrentContext(ctx);
  const themeName = sanitizeThemeName(rawName);

  if (command === "publish") {
    const filePath = publishDefaultConfig(
      ctx.cwd,
      themeName && themeName !== "default" ? themeName : undefined,
    );
    ctx.ui.notify(`Published powerline config: ${filePath}`, "success");
    return;
  }

  if (command === "") {
    controls.setEnabled(!controls.getEnabled());
    controls.persistState();
    if (controls.getEnabled()) await controls.installPowerline(ctx);
    else controls.hidePowerline(ctx);
    ctx.ui.notify(
      controls.getEnabled() ? "powerline on" : "powerline off",
      controls.getEnabled() ? "success" : "info",
    );
    return;
  }

  if (command === "theme") {
    if (
      themeName &&
      themeName !== "default" &&
      !existsSync(getConfigPath(ctx.cwd, themeName))
    ) {
      ctx.ui.notify(
        `No powerline theme found: ${themeName}. Create it with /powerline:publish ${themeName}`,
        "warning",
      );
      return;
    }
    controls.setTheme(themeName && themeName !== "default" ? themeName : undefined);
    controls.setEnabled(true);
    controls.persistState();
    await controls.installPowerline(ctx);
    ctx.ui.notify(`powerline theme: ${controls.getTheme() ?? "default"}`, "success");
    return;
  }

  if (command === "status") {
    ctx.ui.notify(
      `powerline ${controls.getEnabled() ? "on" : "off"}; theme ${controls.getTheme() ?? "default"}`,
      "info",
    );
    return;
  }

  ctx.ui.notify(
    "Usage: /powerline or /powerline[:publish|:status|:theme] [theme]",
    "warning",
  );
};

export const registerPowerlineCommand = (
  pi: ExtensionAPI,
  controls: PowerlineRuntimeControls,
) => {
  pi.registerCommand("powerline", {
    description: "Toggle the customizable powerline bar",
    getArgumentCompletions: (prefix) => {
      const [command = "", partial = ""] = prefix.trimStart().split(/\s+/, 2);
      if (command === "theme") {
        return getThemeCompletions(partial, controls.getCurrentContext()).map(
          (theme) => ({ value: `theme ${theme.value}`, label: theme.label }),
        );
      }
      return COMMAND_OPTIONS.filter((option) => option.startsWith(command)).map(
        (option) => ({ value: option, label: option }),
      );
    },
    handler: async (args, ctx) => {
      const [command = "", rawName = ""] = args.trim().split(/\s+/, 2);
      await executePowerlineCommand(command, rawName, ctx, controls);
    },
  });

  const aliases: Array<{ name: string; command: string; description: string }> = [
    { name: "powerline:status", command: "status", description: "Show powerline status" },
    { name: "powerline:publish", command: "publish", description: "Publish editable powerline config/theme" },
    { name: "powerline:theme", command: "theme", description: "Switch powerline theme" },
  ];

  for (const alias of aliases) {
    pi.registerCommand(alias.name, {
      description: alias.description,
      getArgumentCompletions:
        alias.command === "theme"
          ? (prefix) => getThemeCompletions(prefix, controls.getCurrentContext())
          : undefined,
      handler: async (args, ctx) => {
        await executePowerlineCommand(alias.command, args.trim(), ctx, controls);
      },
    });
  }
};
