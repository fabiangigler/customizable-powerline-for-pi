// @ts-ignore: Pi provides its TUI package at runtime.
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
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
  getCutoutColor,
  reset,
  resolveDynamic,
  stripAnsi,
} from "./utils.ts";

export const getWidgetData = (theme?: { fg?(key: string, text: string): string }): PowerlineData => ({
  fg: theme?.fg ? (key, text) => theme.fg?.(key, text) ?? text : undefined,
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

  const fg = resolveDynamic(config.fg, runtime);
  const bg = resolveDynamic(config.bg, runtime);
  const separator = resolveDynamic(config.separator, runtime);
  const rightSeparator = resolveDynamic(config.rightSeparator, runtime);

  const colorOf = (section: PowerlineSegment): string =>
    resolveDynamic(
      section.color ?? fg,
      segmentRuntime.get(section.id) ?? runtime,
    );
  const separatorAfterOf = (
    section: PowerlineSegment,
  ): string | null | undefined =>
    section.separatorAfter === undefined
      ? undefined
      : resolveDynamic(
          section.separatorAfter,
          segmentRuntime.get(section.id) ?? runtime,
        );
  const separatorAfterFgOf = (
    section: PowerlineSegment,
  ): string | null | undefined =>
    section.separatorAfterFg === undefined
      ? undefined
      : resolveDynamic(
          section.separatorAfterFg,
          segmentRuntime.get(section.id) ?? runtime,
        );

  orderedSections.forEach((section, index) => {
    const previousSection = orderedSections[index - 1];
    const nextSection = orderedSections[index + 1];
    const sectionColor = colorOf(section);
    const previousColor = previousSection ? colorOf(previousSection) : bg;
    const nextColor = nextSection ? colorOf(nextSection) : undefined;
    const sectionSeparatorAfter = separatorAfterOf(section);
    const sectionSeparatorAfterFg = separatorAfterFgOf(section);
    const text = stripAnsi(sectionText.get(section.id) ?? "").trim();

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
  const runtime: SegmentValueContext = { ctx, data, config };

  for (const section of [...config.left, ...config.right]) {
    segmentRuntime.set(section.id, runtime);
    const text = section.value(runtime);
    if (text) sectionText.set(section.id, text);
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
