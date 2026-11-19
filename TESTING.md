# Lightweight test plan

These tests should stay cheap enough to run during local extension hacking without launching Pi's full TUI.

## Unit-ish checks

- `normalizeConfig` keeps defaults, accepts omitted segment colors, and drops malformed segments.
- `renderPowerline` produces stable left/right ordering, right-to-left separators, spacing, and truncation behavior.
- ANSI-styled segment values survive rendering while width calculations still work.
- Broken segment callbacks are isolated so one bad segment does not break the full bar.
- Invalid colors fall back to terminal defaults instead of emitting `NaN` ANSI sequences.

## Provider usage and speed indicators

Run `node --test src/provider-usage.test.ts`. Tests use synthetic tokens and mocked usage endpoints only; they do not read credentials or make provider requests.

- Ultrafast is red in all bundled themes; Fast/off retain their colors.
- Provider/model/account switches cannot reuse another scope's quota; late responses cannot overwrite the active view.
- Resolved model auth and account headers select the usage source; API keys, custom endpoints and unsupported providers remain quiet.
- Applicable shared/model-family windows, used percentages, durations and reset timestamps are parsed correctly.
- Concurrent refreshes coalesce; failed/expired data is hidden; timeout, redirect refusal and retry backoff stay bounded.
- Published provider-usage themes remain self-contained, and async completion never reads disposed contexts.

## Command/publish checks

- `/powerline` toggles state.
- `/powerline:publish` writes valid TypeScript when the file does not exist.
- `/powerline:publish` refuses to overwrite by default.
- `/powerline:publish --force` overwrites intentionally.
- `/powerline:theme` rejects missing named themes and accepts `default`.

## Integration smoke checks

- Package manifest points Pi at `src/index.ts`; no top-level shim should exist.
- All extension `.ts` files pass `node --check`.
- A freshly published theme passes `node --check`.
- Rendering 100+ frames should not reload theme modules or run expensive work on every frame.
- Async theme callbacks and disposed widgets must not access a stale context after `/resume`, `/new`, `/fork`, or `/reload`.

## Manual open-source checklist

- Test as a project-local extension.
- Test as a git/npm-installed Pi extension.
- Toggle/reload/resume sessions and confirm footer/working indicator restoration.
- Try a broken theme and confirm Pi keeps running with a useful diagnostic.
