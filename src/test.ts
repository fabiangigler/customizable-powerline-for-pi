import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";
import { loadPowerlineConfig, normalizeConfig } from "./config.ts";
import { defaultConfigInput, publishDefaultConfig } from "./default-config.ts";
import { renderPowerline } from "./render.ts";
import { ansiBg, ansiFg, getConfigPath, getThemeNames, getThemePaths } from "./utils.ts";

const repo = process.cwd();

const check = (file: string) => {
  execFileSync(process.execPath, ["--check", file], { cwd: repo, stdio: "inherit" });
};

const extensionDir = join(repo, ".pi/extensions/customizable-powerline-for-pi/src");
for (const file of [
  "commands.ts",
  "config.ts",
  "constants.ts",
  "default-config.ts",
  "default-theme.ts",
  "core-themes/default.ts",
  "index.ts",
  "render.ts",
  "theme-types.ts",
  "types.ts",
  "utils.ts",
  "core-themes/agnoster-tokens.ts",
]) {
  check(join(extensionDir, file));
}
check(join(repo, ".pi/extensions/fast-mode-for-pi/index.ts"));

const normalized = normalizeConfig({
  left: [{ id: "plain", value: () => "ok" }],
  right: [{ id: "bad", color: 42 as never, value: () => "nope" }],
});
assert.equal(normalized.left.length, 1, "segments may omit color");
assert.equal(normalized.right.length, 0, "malformed segments are dropped");

assert.equal(ansiFg("not-a-color"), "\x1b[39m", "bad fg falls back");
assert.equal(ansiBg("not-a-color"), "\x1b[49m", "bad bg falls back");
assert.match(ansiFg("#ffffff"), /38;2;255;255;255/, "valid fg is emitted");

const tmp = mkdtempSync(join(tmpdir(), "powerline-test-"));
const oldPiHome = process.env.PI_HOME;
process.env.PI_HOME = join(tmp, "pi-home");
try {
  const published = publishDefaultConfig(tmp);
  assert.equal(published, getConfigPath(tmp));
  assert.ok(published.startsWith(process.env.PI_HOME), "themes publish globally");
  assert.ok(existsSync(published), "default theme is published");
  check(published);

  assert.throws(() => publishDefaultConfig(tmp), /already exists/);
  writeFileSync(published, "export default {};\n");
  publishDefaultConfig(tmp, undefined, { force: true });
  check(published);

  const named = publishDefaultConfig(tmp, "dark");
  assert.equal(named, getConfigPath(tmp, "dark"));
  assert.ok(named.startsWith(process.env.PI_HOME), "named themes publish globally");
  check(named);

  const coreNamed = publishDefaultConfig(tmp, "agnoster-tokens");
  assert.equal(coreNamed, getConfigPath(tmp, "agnoster-tokens"));
  assert.match(readFileSync(coreNamed, "utf8"), /id: "tokens"/, "core theme source is published by name");
  check(coreNamed);
  const coreConfig = await loadPowerlineConfig(tmp, "agnoster-tokens");
  assert.equal(coreConfig.right.at(-1)?.id, "tokens", "core theme loads by name");
  assert.ok(getThemeNames(tmp).includes("default"), "default core theme is discoverable");
  assert.ok(getThemeNames(tmp).includes("agnoster-tokens"), "core themes are discoverable");
  const defaultConfig = await loadPowerlineConfig(tmp);
  assert.equal(defaultConfig.right.at(-1)?.id, "cost", "default core theme loads without a selected theme");

  const ancestorRoot = join(tmp, "ancestor-root");
  const nestedCwd = join(ancestorRoot, "packages", "app");
  const rootThemeDir = join(ancestorRoot, ".pi", "customizable-powerline-for-pi", "themes");
  const nestedThemeDir = join(nestedCwd, ".pi", "customizable-powerline-for-pi", "themes");
  mkdirSync(rootThemeDir, { recursive: true });
  mkdirSync(nestedThemeDir, { recursive: true });
  writeFileSync(
    join(rootThemeDir, "shared.ts"),
    "export default { left: [{ id: 'root', value: () => 'root' }], right: [] };\n",
  );
  writeFileSync(
    join(nestedThemeDir, "shared.ts"),
    "export default { left: [{ id: 'nested', value: () => 'nested' }], right: [] };\n",
  );
  writeFileSync(
    join(rootThemeDir, "root-only.ts"),
    "export default { left: [{ id: 'rootOnly', value: () => 'rootOnly' }], right: [] };\n",
  );

  const sharedPaths = getThemePaths(nestedCwd, "shared");
  assert.equal(sharedPaths[0], join(nestedThemeDir, "shared.ts"));
  assert.ok(sharedPaths.includes(join(rootThemeDir, "shared.ts")), "ancestor theme is discoverable");

  assert.deepEqual(getThemeNames(nestedCwd).filter((name) => name.includes("root") || name === "shared"), ["root-only", "shared"]);

  const nestedConfig = await loadPowerlineConfig(nestedCwd, "shared");
  assert.equal(nestedConfig.left[0]?.id, "nested", "nearest local theme overrides ancestor theme");
  const ancestorConfig = await loadPowerlineConfig(nestedCwd, "root-only");
  assert.equal(ancestorConfig.left[0]?.id, "rootOnly", "ancestor theme loads when no nearer override exists");
} finally {
  if (oldPiHome === undefined) delete process.env.PI_HOME;
  else process.env.PI_HOME = oldPiHome;
  rmSync(tmp, { recursive: true, force: true });
}

assert.equal(
  existsSync(join(repo, ".pi/extensions/customizable-powerline-for-pi.ts")),
  false,
  "top-level shim should not exist; it causes duplicate command registration",
);

const renderConfig = normalizeConfig(defaultConfigInput());

const mockCtx = {
  cwd: repo,
  model: { id: "test-model", reasoning: true },
  sessionManager: {
    buildSessionContext: () => ({ thinkingLevel: "med" }),
    getBranch: () => [],
    getEntries: () => [],
  },
  ui: {
    notify() {},
    setFooter() {},
    setWidget() {},
    setWorkingVisible() {},
  },
  isIdle: () => true,
  getContextUsage: () => ({ tokens: 120, contextWindow: 1000 }),
};
const mockData = {
  getExtensionStatuses: () => new Map([["fast-mode", "fast mode on"]]),
  fg: (_key: string, text: string) => text,
};

const renderIterations = 5_000;
const renderStarted = performance.now();
for (let index = 0; index < renderIterations; index += 1) {
  const [line] = renderPowerline(120, mockCtx, renderConfig, mockData);
  assert.ok(line.includes("test-model"));
}
const renderMs = performance.now() - renderStarted;
const renderPerFrameMs = renderMs / renderIterations;
assert.ok(
  renderPerFrameMs < 0.25,
  `render benchmark too slow: ${renderPerFrameMs.toFixed(4)}ms/frame`,
);
console.log(
  `render benchmark: ${renderPerFrameMs.toFixed(4)}ms/frame (${renderIterations} frames)`,
);

console.log("customizable-powerline-for-pi smoke tests passed");
