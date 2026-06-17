import type {
  ExtensionContext,
  PowerlineConfig,
  PowerlineData,
  PowerlineSegment,
  SegmentValueContext,
} from "./types.ts";
import {
  ansiBg,
  ansiFg,
  reset,
  resolveDynamic,
  truncateToWidth,
  visibleWidth,
} from "./utils.ts";

declare const console: { error(...args: unknown[]): void };

const warnedSegmentErrors = new Set<string>();

const warnSegmentError = (segmentId: string, phase: string, error: unknown) => {
  const key = `${segmentId}:${phase}`;
  if (warnedSegmentErrors.has(key)) return;
  warnedSegmentErrors.add(key);
  console.error(
    `customizable-powerline-for-pi: segment '${segmentId}' failed during ${phase}`,
    error,
  );
};

export const getWidgetData = (
  theme?: { fg?(key: string, text: string): string },
  requestRender?: () => void,
): PowerlineData => ({
  fg: theme?.fg ? (key, text) => theme.fg?.(key, text) ?? text : undefined,
  requestRender,
  getExtensionStatuses: () => {
    const statuses = new Map<string, string>();
    const fastModeStatus = (
      globalThis as typeof globalThis & {
        __piFastModeStatus?: string;
      }
    ).__piFastModeStatus;
    if (fastModeStatus) statuses.set("fast-mode", fastModeStatus);
    return statuses;
  },
});

const renderBlocks = (
  sections: PowerlineSegment[],
  sectionText: Map<string, string>,
  segmentRuntime: Map<string, SegmentValueContext>,
  config: PowerlineConfig,
  runtime: SegmentValueContext,
  side: "left" | "right",
): string => {
  const chunks: string[] = [];
  const visibleSections = sections.filter((section) =>
    sectionText.get(section.id),
  );
  const orderedSections =
    side === "right" ? [...visibleSections].reverse() : visibleSections;
  if (orderedSections.length === 0) return "";

  let fg = "#ffffff";
  let bg = "";
  let separator = "";
  let rightSeparator = "";
  try {
    fg = resolveDynamic(config.fg, runtime);
    bg = resolveDynamic(config.bg, runtime);
    separator = resolveDynamic(config.separator, runtime);
    rightSeparator = resolveDynamic(config.rightSeparator, runtime);
  } catch (error) {
    warnSegmentError("config", "dynamic value", error);
  }

  const colorOf = (section: PowerlineSegment): string => {
    try {
      return resolveDynamic(
        section.color ?? fg,
        segmentRuntime.get(section.id) ?? runtime,
      );
    } catch (error) {
      warnSegmentError(section.id, "color", error);
      return fg;
    }
  };
  const separatorAfterOf = (
    section: PowerlineSegment,
  ): string | null | undefined => {
    if (section.separatorAfter === undefined) return undefined;
    try {
      return resolveDynamic(
        section.separatorAfter,
        segmentRuntime.get(section.id) ?? runtime,
      );
    } catch (error) {
      warnSegmentError(section.id, "separatorAfter", error);
      return undefined;
    }
  };
  const separatorAfterFgOf = (
    section: PowerlineSegment,
  ): string | null | undefined => {
    if (section.separatorAfterFg === undefined) return undefined;
    try {
      return resolveDynamic(
        section.separatorAfterFg,
        segmentRuntime.get(section.id) ?? runtime,
      );
    } catch (error) {
      warnSegmentError(section.id, "separatorAfterFg", error);
      return undefined;
    }
  };

  orderedSections.forEach((section, index) => {
    const previousSection = orderedSections[index - 1];
    const nextSection = orderedSections[index + 1];
    const sectionColor = colorOf(section);
    const previousColor = previousSection ? colorOf(previousSection) : bg;
    const nextColor = nextSection ? colorOf(nextSection) : undefined;
    const sectionSeparatorAfter = separatorAfterOf(section);
    const sectionSeparatorAfterFg = separatorAfterFgOf(section);
    const text = (sectionText.get(section.id) ?? "").trim();

    if (side === "right") {
      chunks.push(
        sectionSeparatorAfter && previousSection
          ? `${ansiBg(previousColor)}${ansiFg(sectionSeparatorAfterFg ?? sectionColor)}${sectionSeparatorAfter}`
          : `${ansiBg(previousColor)}${ansiFg(sectionColor)}${rightSeparator}`,
      );
    }

    chunks.push(`${ansiBg(sectionColor)}${ansiFg(fg)} ${text} `);

    if (side === "left") {
      if (sectionSeparatorAfter && nextSection) {
        chunks.push(
          `${ansiBg(nextColor ?? bg)}${ansiFg(sectionSeparatorAfterFg ?? sectionColor)}${sectionSeparatorAfter}`,
        );
      } else {
        chunks.push(
          nextSection
            ? `${ansiBg(nextColor ?? bg)}${ansiFg(sectionColor)}${separator}`
            : `${reset}${ansiFg(sectionColor)}${separator}${reset}`,
        );
      }
    }
  });

  if (side === "right") chunks.push(reset);
  return chunks.join("");
};

export const renderPowerline = (
  width: number,
  ctx: ExtensionContext,
  config: PowerlineConfig,
  data: PowerlineData,
): string[] => {
  const sectionText = new Map<string, string>();
  const segmentRuntime = new Map<string, SegmentValueContext>();
  const runtime: SegmentValueContext = { ctx, data, config, memo: new Map() };

  for (const section of [...config.left, ...config.right]) {
    segmentRuntime.set(section.id, runtime);
    try {
      const text = section.value(runtime);
      if (text) sectionText.set(section.id, text);
    } catch (error) {
      warnSegmentError(section.id, "value", error);
    }
  }

  const left = renderBlocks(
    config.left,
    sectionText,
    segmentRuntime,
    config,
    runtime,
    "left",
  );
  const right = renderBlocks(
    config.right,
    sectionText,
    segmentRuntime,
    config,
    runtime,
    "right",
  );
  const spacer = " ".repeat(
    Math.max(1, width - visibleWidth(left) - visibleWidth(right)),
  );
  return [truncateToWidth(`${left}${spacer}${right}`, width)];
};
