import { STATE_CUSTOM_TYPE, WIDGET_KEY } from "./constants.ts";
import { registerPowerlineCommand } from "./commands.ts";
import { loadPowerlineConfig } from "./config.ts";
import { getWidgetData, renderPowerline } from "./render.ts";
import type {
  ExtensionAPI,
  ExtensionContext,
  PowerlineConfig,
  PowerlineState,
} from "./types.ts";
import { isPowerlineState } from "./utils.ts";

declare const setInterval: (callback: () => void, ms: number) => unknown;
declare const clearInterval: (interval: unknown) => void;
declare const setTimeout: (callback: () => void, ms: number) => unknown;

const customizablePowerlineForPi = (pi: ExtensionAPI) => {
  let enabled = true;
  let activeTheme: string | undefined;
  let currentCtx: ExtensionContext | undefined;
  let config: PowerlineConfig | undefined;

  const persistState = () =>
    pi.appendEntry<PowerlineState>(STATE_CUSTOM_TYPE, {
      enabled,
      theme: activeTheme,
    });

  const restoreState = (ctx: ExtensionContext) => {
    for (const entry of ctx.sessionManager.getEntries()) {
      if (entry.type !== "custom" || entry.customType !== STATE_CUSTOM_TYPE || !isPowerlineState(entry.data)) continue;
      if (entry.data.enabled !== undefined) enabled = entry.data.enabled;
      activeTheme = entry.data.theme || undefined;
    }
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
        const interval = setInterval(() => tui.requestRender(), 120);
        void refreshConfig(ctx).then(() => tui.requestRender());

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
      void refreshConfig(ctx);
      ctx.ui.setWidget(
        WIDGET_KEY,
        (tui, theme) => {
          const interval = setInterval(() => tui.requestRender(), 120);
          void refreshConfig(ctx).then(() => tui.requestRender());

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
    setTimeout(setPowerlineWidget, 100);
    setTimeout(setPowerlineWidget, 1000);
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
    restoreState(ctx);
    void installPowerline(ctx);
  });
};

export default customizablePowerlineForPi;
