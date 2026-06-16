# Lightweight test plan

These tests should stay cheap enough to run during local extension hacking without launching Pi's full TUI.

## Unit-ish checks

- `normalizeConfig` keeps defaults, accepts omitted segment colors, and drops malformed segments.
- `renderPowerline` produces stable left/right ordering, right-to-left separators, spacing, and truncation behavior.
- ANSI-styled segment values survive rendering while width calculations still work.
- Broken segment callbacks are isolated so one bad segment does not break the full bar.
- Invalid colors fall back to terminal defaults instead of emitting `NaN` ANSI sequences.

## Command/publish checks

- `/powerline` toggles state.
- `/powerline:publish` writes valid TypeScript when the file does not exist.
- `/powerline:publish` refuses to overwrite by default.
- `/powerline:publish --force` overwrites intentionally.
- `/powerline:theme` rejects missing named themes and accepts `default`.

## Integration smoke checks

- Package manifest points Pi at `.pi/extensions/customizable-powerline-for-pi/src/index.ts`; no top-level shim should exist.
- All extension `.ts` files pass `node --check`.
- A freshly published theme passes `node --check`.
- Rendering 100+ frames should not reload theme modules or run expensive work on every frame.

## Manual open-source checklist

- Test as a project-local extension.
- Test as a git/npm-installed Pi extension.
- Toggle/reload/resume sessions and confirm footer/working indicator restoration.
- Try a broken theme and confirm Pi keeps running with a useful diagnostic.
