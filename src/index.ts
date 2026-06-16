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
  let currentCtx: ExtensionContext | undefined;
  let config: PowerlineConfig | undefined;
  let lastPersistedState = "";

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

  const refreshConfig = async (ctx: ExtensionContext) => {
    config = await loadPowerlineConfig(ctx.cwd, activeTheme);
  };

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
    currentCtx = ctx;
    await refreshConfig(ctx);
    if (!enabled || !config) {
      hidePowerline(ctx);
      return;
    }

    applyThemeVisibility(ctx, config);

    if (config.placement === "footer") {
      ctx.ui.setWidget(WIDGET_KEY, undefined);
      ctx.ui.setFooter((tui, theme, footerData) => {
        const unsubscribe = footerData.onBranchChange(() =>
          tui.requestRender(),
        );
        const interval = setInterval(() => tui.requestRender(), 250);

        return {
          dispose: () => {
            unsubscribe();
            clearInterval(interval);
          },
          invalidate() {},
          render(width: number): string[] {
            return config
              ? renderPowerline(width, ctx, config, {
                  ...footerData,
                  fg: theme?.fg ? (key, text) => theme.fg?.(key, text) ?? text : undefined,
                })
              : [];
          },
        };
      });
      return;
    }

    const setPowerlineWidget = () => {
      ctx.ui.setWidget(
        WIDGET_KEY,
        (tui, theme) => {
          const interval = setInterval(() => tui.requestRender(), 250);

          return {
            dispose: () => clearInterval(interval),
            invalidate() {},
            render(width: number): string[] {
              return config ? renderPowerline(width, ctx, config, getWidgetData(theme)) : [];
            },
          };
        },
        { placement: config?.placement ?? "aboveEditor" },
      );
    };

    setPowerlineWidget();
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
    setCurrentContext: (ctx) => {
      currentCtx = ctx;
    },
    getCurrentContext: () => currentCtx,
  });

  pi.on("session_start", (_event, ctx) => {
    restoreState();
    void installPowerline(ctx);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    hidePowerline(ctx);
    currentCtx = undefined;
    config = undefined;
  });
};

export default customizablePowerlineForPi;
