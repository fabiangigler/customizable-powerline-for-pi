// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
// @ts-ignore: Pi provides Node built-ins at runtime; this project has no local @types/node.
import { dirname, join } from "node:path";
import { WIDGET_KEY } from "./constants.ts";
import { registerPowerlineCommand } from "./commands.ts";
import { loadPowerlineConfig } from "./config.ts";
import { getWidgetData, renderPowerline } from "./render.ts";
import type {
  ExtensionAPI,
  ExtensionContext,
  PowerlineConfig,
  PowerlineState,
} from "./types.ts";
import { getPiHome, isPowerlineState } from "./utils.ts";

declare const setInterval: (callback: () => void, ms: number) => unknown;
declare const clearInterval: (interval: unknown) => void;

const customizablePowerlineForPi = (pi: ExtensionAPI) => {
  let enabled = true;
  let activeTheme: string | undefined;
  let currentCwd: string | undefined;
  let lastPersistedState = "";
  let installGeneration = 0;
  let sessionActive = false;

  const serializeState = () => JSON.stringify({ enabled, theme: activeTheme });
  const globalStatePath = () =>
    join(getPiHome(), "customizable-powerline-for-pi", "state.json");

  const persistState = () => {
    const nextState = serializeState();
    if (nextState === lastPersistedState) return;
    lastPersistedState = nextState;
    const filePath = globalStatePath();
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, `${nextState}\n`);
  };

  const restoreState = () => {
    try {
      const state = JSON.parse(readFileSync(globalStatePath(), "utf8"));
      if (!isPowerlineState(state)) return;
      if (state.enabled !== undefined) enabled = state.enabled;
      activeTheme = state.theme || undefined;
    } catch {
      // No global state yet, or unreadable state; keep defaults.
    }
    lastPersistedState = serializeState();
  };

  const refreshConfig = async (cwd: string) =>
    loadPowerlineConfig(cwd, activeTheme);

  const hidePowerline = (ctx: ExtensionContext) => {
    ctx.ui.setWidget(WIDGET_KEY, undefined);
    ctx.ui.setFooter(undefined);
    ctx.ui.setWorkingVisible(true);
  };

  const applyThemeVisibility = (ctx: ExtensionContext, resolvedConfig: PowerlineConfig) => {
    ctx.ui.setWorkingVisible(!resolvedConfig.hideWorking);
    if (resolvedConfig.placement !== "footer") {
      if (resolvedConfig.hideFooter) {
        ctx.ui.setFooter(() => ({
          invalidate() {},
          render(): string[] {
            return [];
          },
        }));
      } else {
        ctx.ui.setFooter(undefined);
      }
    }
  };

  const installPowerline = async (ctx: ExtensionContext) => {
    const generation = ++installGeneration;
    const cwd = ctx.cwd;
    currentCwd = cwd;
    const resolvedConfig = await refreshConfig(cwd);
    if (!sessionActive || generation !== installGeneration) return;

    if (!enabled) {
      hidePowerline(ctx);
      return;
    }

    const isCurrent = () => sessionActive && generation === installGeneration;
    applyThemeVisibility(ctx, resolvedConfig);

    if (resolvedConfig.placement === "footer") {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
      ctx.ui.setFooter((tui, theme, footerData) => {
        const requestRender = () => {
          if (isCurrent()) tui.requestRender();
        };
        const unsubscribe = footerData.onBranchChange(requestRender);
        const interval = setInterval(() => {
          if (isCurrent() && !ctx.isIdle()) requestRender();
        }, 250);

        return {
          dispose: () => {
            unsubscribe();
            clearInterval(interval);
          },
          invalidate() {},
          render(width: number): string[] {
            return isCurrent()
              ? renderPowerline(width, ctx, resolvedConfig, {
                  ...footerData,
                  fg: theme?.fg ? (key, text) => theme.fg?.(key, text) ?? text : undefined,
                  requestRender,
                })
              : [""];
          },
        };
      });
      return;
    }

    ctx.ui.setWidget(
      WIDGET_KEY,
      (tui, theme) => {
        const requestRender = () => {
          if (isCurrent()) tui.requestRender();
        };
        const interval = setInterval(() => {
          if (isCurrent() && !ctx.isIdle()) requestRender();
        }, 250);

        return {
          dispose: () => clearInterval(interval),
          invalidate() {},
          render(width: number): string[] {
            return isCurrent()
              ? renderPowerline(width, ctx, resolvedConfig, getWidgetData(theme, requestRender))
              : [""];
          },
        };
      },
      { placement: resolvedConfig.placement },
    );
  };

  registerPowerlineCommand(pi, {
    getEnabled: () => enabled,
    setEnabled: (value) => {
      enabled = value;
    },
    getTheme: () => activeTheme,
    setTheme: (theme) => {
      activeTheme = theme;
    },
    persistState,
    installPowerline,
    hidePowerline,
    setCurrentCwd: (cwd) => {
      currentCwd = cwd;
    },
    getCurrentCwd: () => currentCwd,
  });

  pi.on("session_start", (_event, ctx) => {
    sessionActive = true;
    restoreState();
    void installPowerline(ctx).catch((error) => {
      console.error("Failed to install customizable-powerline-for-pi:", error);
    });
  });

  pi.on("session_shutdown", (_event, ctx) => {
    sessionActive = false;
    installGeneration += 1;
    currentCwd = undefined;
    hidePowerline(ctx);
  });
};

export default customizablePowerlineForPi;
