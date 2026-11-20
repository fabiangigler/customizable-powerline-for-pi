# customizable-powerline-for-pi

A tiny, themeable, Agnoster-ish powerline for [Pi](https://github.com/earendil-works/pi-coding-agent), replacing the stock footer with a powerline status bar inspired by the agnoster theme.

![customizable-powerline-for-pi demo](demo/demo.gif)

> [!IMPORTANT]
> Proper rendering requires a font with Powerline/Nerd Font glyphs. Install one from [Nerd Fonts](https://www.nerdfonts.com/) if separators or icons appear as boxes.

## Install

Install it with Pi's package manager:

```bash
pi install git:github.com/fabiangigler/customizable-powerline-for-pi
```

Then reload Pi:

```text
/reload
```

## Commands

```text
/powerline
```

Toggles the bar on/off.

```text
/powerline:status
```

Shows whether the bar is enabled and which theme is active.

```text
/powerline:publish dark
```

Publishes a named global theme to:

```text
~/.pi/agent/customizable-powerline-for-pi/themes/dark.ts
```

Existing files are protected. To reset it to the default on purpose:

```text
/powerline:publish --force dark
```

```text
/powerline:theme dark
```

Switches to a named theme.

## How themes work

`default` is the built-in Agnoster-style theme. The extension also ships `agnoster-compact`, which folds the thinking level into the model segment, `agnoster-tokens`, which adds a token-cost bar on the right, and `agnoster-minimal-codex`, which adds compact context and selected-provider subscription usage indicators.

All bundled themes show Ultrafast in red, ordinary Fast in yellow, and off in gray.

### Subscription limits

`agnoster-minimal-codex` reads usage for the selected `openai-codex` or `anthropic` provider using Pi's resolved model request authentication. It never borrows Codex credentials for Anthropic or public OpenAI API-key requests. Cache entries are isolated by provider and a credential/account fingerprint; model/provider changes hide the previous view while credentials are resolved. Credentials are rechecked at most once per second during rendering, and usage requests are coalesced and cached for up to 10 minutes (or the displayed reset).

The clock shows the **highest used applicable window**. Above 75% used, it also shows time until reset (e.g. `47m` or `2d 4h`) if the provider supplies a reset time. Explicit Codex model-specific pools and Claude model-family weekly windows are used when available. Shared account windows can legitimately stay the same between models. Percentages mean **used**, not remaining.

These subscription endpoints are unofficial and may reject credentials without the required OAuth scope. API-key accounts, other providers, custom endpoints, errors and expired data omit the quota rather than showing another account's values. This does not display API RPM/TPM limits. Requests time out after five seconds; errors back off and respect `Retry-After`. Tokens stay in memory and are sent only to the appropriate provider's fixed HTTPS endpoint, never logged or written to a theme cache.

`/powerline:publish <name>` writes a complete editable global theme file. For bundled themes such as `agnoster-compact` or `agnoster-tokens`, it publishes that bundled source; otherwise it starts from `default`.

Local project themes can override bundled and global themes by using the same name under any `.pi` folder from the current directory upward:

```text
.pi/customizable-powerline-for-pi/themes/<name>.ts
```

Nearest local themes win over parent-directory themes, local themes win over global themes, and global themes win over bundled themes.

A few useful notes:

- `placement` can be `"aboveEditor"`, `"belowEditor"`, or `"footer"`.
- `hideFooter` and `hideWorking` control Pi's native footer/working indicator while the powerline is active.
- `left` segments render in listed order.
- `right` segments are listed from the outside edge inward. The first item appears at the far right.
- Segment `value` callbacks return text, `null`, or `undefined`; empty values hide the segment.
- `color`, `separatorAfter`, and `separatorAfterFg` can be static values or runtime callbacks.
- Segment arrays accept `false`, `null`, and `undefined` for conditional inclusion.
- Segment text gets a default single-space pad on both sides.
- Segments are fully dynamic TypeScript callbacks and can show anything available to Pi, including model/session state, filesystem data, shell command output, or arbitrary network/API requests.

Segment callbacks receive `ctx`, `data`, `config`, and a per-render `memo` map. `data.fg(key, text)` can color text with Pi theme keys like `thinkingText`, `muted`, `warning`, or `error` when Pi exposes them.

## How it works internally

On `session_start`, the extension loads the active theme, installs a Pi widget (or footer renderer), and optionally hides Pi's native footer/working indicator according to the theme. Segment callbacks produce strings, colors are converted to ANSI, and the final line is width-truncated.

The extension refreshes the animation on a short interval, but it does **not** reload the theme on every frame. Edit a theme and run `/reload` or `/powerline:theme <name>` to reload it.

Toggle state and the selected named theme are stored globally at `~/.pi/agent/customizable-powerline-for-pi/state.json`, so they apply across Pi sessions and projects.

## Development

Run smoke tests:

```bash
node src/test.ts
node --test src/provider-usage.test.ts
```

Validate syntax only:

```bash
find src -name '*.ts' -print0 | xargs -0 -n1 node --check
```

See `TESTING.md` for the lightweight test plan.
