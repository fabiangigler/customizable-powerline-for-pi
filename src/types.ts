export {};

declare const process: { env: Record<string, string | undefined> };
declare const console: { error(...args: unknown[]): void };
declare const setInterval: (callback: () => void, ms: number) => unknown;
declare const clearInterval: (interval: unknown) => void;

export type Placement = "footer" | "aboveEditor" | "belowEditor";

export type PowerlineData = {
  getExtensionStatuses(): ReadonlyMap<string, string>;
  fg?(key: string, text: string): string;
  requestRender?(): void;
};

export type PowerlineRenderer = {
  dispose?: () => void;
  invalidate(): void;
  render(width: number): string[];
};

export type PowerlineTui = { requestRender(): void };
export type PowerlineTheme = { fg?(key: string, text: string): string };
export type PowerlineFooterData = PowerlineData & {
  onBranchChange(callback: () => void): () => void;
};
export type PowerlineUI = {
  notify(message: string, level?: "info" | "success" | "warning" | "error"): void;
  setFooter(
    factory:
      | ((
          tui: PowerlineTui,
          theme: unknown,
          footerData: PowerlineFooterData,
        ) => PowerlineRenderer)
      | undefined,
  ): void;
  setWidget(
    key: string,
    factory: ((tui: PowerlineTui, theme: PowerlineTheme) => PowerlineRenderer) | undefined,
    options?: { placement: Placement },
  ): void;
  setWorkingVisible(visible: boolean): void;
};

export type PowerlineMessageEntry = {
  type: "message";
  message: {
    role: string;
    usage?: { cost?: { total?: number } };
  };
};
export type PowerlineSessionEntry = PowerlineMessageEntry | { type: string };
export type PowerlineCustomEntry = {
  type: "custom";
  customType: string;
  data?: unknown;
};
export type PowerlineSessionManager = {
  buildSessionContext(): { thinkingLevel?: string };
  getBranch(): PowerlineSessionEntry[];
  getEntries(): Array<PowerlineCustomEntry | { type: string }>;
};

export type ExtensionContext = {
  cwd: string;
  model?: { id?: string; reasoning?: unknown; api?: string };
  sessionManager: PowerlineSessionManager;
  ui: PowerlineUI;
  isIdle(): boolean;
  getContextUsage(): { tokens?: number; contextWindow?: number } | undefined;
};

export type CommandCompletion = { value: string; label: string };
export type ExtensionAPI = {
  on(
    event: "session_start",
    handler: (event: unknown, ctx: ExtensionContext) => void,
  ): void;
  on(
    event: "session_shutdown",
    handler: (event: unknown, ctx: ExtensionContext) => void,
  ): void;
  registerCommand(
    name: string,
    command: {
      description?: string;
      getArgumentCompletions?: (prefix: string) => CommandCompletion[] | null;
      handler: (args: string, ctx: ExtensionContext) => void | Promise<void>;
    },
  ): void;
};

export type SegmentValueContext = {
  ctx: ExtensionContext;
  data: PowerlineData;
  config: PowerlineConfig;
  memo: Map<string, unknown>;
};

export type DynamicValue<T> = T | ((runtime: SegmentValueContext) => T);

export type PowerlineSegment = {
  id: string;
  value: (runtime: SegmentValueContext) => string | null | undefined;
  color?: DynamicValue<string>;
  separatorAfter?: DynamicValue<string | null | undefined>;
  separatorAfterFg?: DynamicValue<string | null | undefined>;
};

export type SegmentInput = PowerlineSegment | false | null | undefined;

export type PowerlineConfigInput = {
  left?: SegmentInput[];
  right?: SegmentInput[];
  fg?: DynamicValue<string>;
  bg?: DynamicValue<string>;
  separator?: DynamicValue<string>;
  rightSeparator?: DynamicValue<string>;
  hideFooter?: boolean;
  hideWorking?: boolean;
  placement?: Placement;
};

export type PowerlineConfig = PowerlineConfigInput & {
  fg: DynamicValue<string>;
  bg: DynamicValue<string>;
  separator: DynamicValue<string>;
  rightSeparator: DynamicValue<string>;
  hideFooter: boolean;
  hideWorking: boolean;
  placement: Placement;
  left: PowerlineSegment[];
  right: PowerlineSegment[];
};

export type ConfigModuleExport =
  | PowerlineConfigInput
  | (() => PowerlineConfigInput | Promise<PowerlineConfigInput>);

export type PowerlineState = {
  enabled?: boolean;
  theme?: string;
};
