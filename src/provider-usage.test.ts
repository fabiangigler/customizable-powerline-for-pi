import assert from "node:assert/strict";
import { test } from "node:test";

let sequence = 0;
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
const jwt = (account: string) => `test.${Buffer.from(JSON.stringify({ "https://api.openai.com/auth": { chatgpt_account_id: account } })).toString("base64url")}.synthetic`;
const codexPayload = (percent: number) => ({ rate_limit: { primary_window: { used_percent: percent, limit_window_seconds: 18000 } } });
const claudePayload = (percent: number) => ({ five_hour: { utilization: percent, resets_at: null } });

async function fixture(run: (h: any) => Promise<void> | void) {
  const originalFetch = globalThis.fetch;
  const originalNow = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  const calls: Array<{ url: string; options: RequestInit }> = [];
  const authCalls: string[] = [];
  const auth = {
    "openai-codex": { ok: true, apiKey: jwt("account-a") },
    anthropic: { ok: true, apiKey: "sk-ant-oat01-synthetic-account-a" },
  };
  let response = async (url: string, _options: RequestInit) =>
    new Response(JSON.stringify(url.includes("anthropic") ? claudePayload(64) : codexPayload(31)));
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options: options! });
    return response(String(url), options!);
  };
  try {
    const mod = await import(`./core-themes/agnoster-minimal-codex.ts?test=${sequence++}`);
    let renders = 0;
    const ctx = {
      model: { provider: "openai-codex", api: "openai-codex-responses", id: "gpt-6.2-sol", baseUrl: "https://chatgpt.com/backend-api/codex" },
      modelRegistry: { getApiKeyAndHeaders: async (model: { provider: string }) => { authCalls.push(model.provider); return auth[model.provider]; } },
      getContextUsage: () => ({ tokens: 100, contextWindow: 1000 }),
    };
    const runtime = { ctx, data: { requestRender: () => { renders++; }, getExtensionStatuses: () => new Map() }, memo: new Map() };
    await run({ ...mod, runtime, calls, authCalls, auth, tick, now: () => now, advance: (ms: number) => { now += ms; },
      setResponse: (value: typeof response) => { response = value; }, renders: () => renders,
      selectClaude: (id = "claude-opus-4-7") => { ctx.model = { provider: "anthropic", api: "anthropic-messages", id, baseUrl: "https://api.anthropic.com" }; } });
    await tick();
  } finally { globalThis.fetch = originalFetch; Date.now = originalNow; }
}

test("Ultrafast is red in every bundled theme; ordinary Fast and off keep their colors", async () => {
  for (const name of ["default", "agnoster-compact", "agnoster-tokens", "agnoster-minimal-codex"]) {
    const { default: theme } = await import(`./core-themes/${name}.ts`);
    const segment = theme.right.find((segment: { id: string }) => segment.id === "fastMode")!;
    for (const [status, expected] of [["ultrafast mode on", "#cc0000"], ["fast mode on", "#d7af00"], ["fast mode off", "#999999"]]) {
      const runtime = { data: { getExtensionStatuses: () => new Map([["fast-mode", status]]) } };
      assert.equal(segment.color(runtime), expected, `${name}/${status}`);
    }
  }
});

test("Codex reports actual window duration and the highest used applicable window", async () => fixture(h => {
  const payload = { rate_limit: { primary_window: { used_percent: 20, limit_window_seconds: 18000 },
    secondary_window: { used_percent: 81, limit_window_seconds: 604800 } } };
  assert.deepEqual(h.parseProviderUsage("openai-codex", payload, "gpt-6.2-sol"), { percent: 81, label: "7d", resetAt: null });
  assert.equal(h.parseProviderUsage("openai-codex", { primary_window: { used_percent: 10, limit_window_seconds: 900 } }, "model").label, "15m");
}));

test("Codex model-specific buckets match exact model names, not another model's pool", async () => fixture(h => {
  const payload = { ...codexPayload(95), additional_rate_limits: [{ limit_name: "GPT-6.2 Sol", rate_limit: codexPayload(11).rate_limit }] };
  assert.equal(h.parseProviderUsage("openai-codex", payload, "gpt-6.2-sol").percent, 11);
  assert.equal(h.parseProviderUsage("openai-codex", payload, "gpt-6.2-astra").percent, 95);
}));

test("Claude uses shared windows plus only the selected model family's weekly limit", async () => fixture(h => {
  const payload = { five_hour: { utilization: 20 }, seven_day: { utilization: 10 },
    seven_day_opus: { utilization: 84 }, seven_day_sonnet: { utilization: 97 }, seven_day_oauth_apps: { utilization: 100 } };
  assert.deepEqual(h.parseProviderUsage("anthropic", payload, "claude-opus-4-7"), { percent: 84, label: "Opus7d", resetAt: null });
  assert.equal(h.parseProviderUsage("anthropic", payload, "claude-sonnet-4-7").label, "Sonnet7d");
  assert.equal(h.parseProviderUsage("anthropic", payload, "claude-haiku-4-5").percent, 20);
}));

test("percentages below one are percentages, zero is valid, expired/malformed data is not invented", async () => fixture(h => {
  assert.equal(h.parseProviderUsage("anthropic", claudePayload(0.6), "claude-opus").percent, 1);
  assert.equal(h.parseProviderUsage("anthropic", claudePayload(0), "claude-opus").percent, 0);
  assert.equal(h.parseProviderUsage("anthropic", { five_hour: { utilization: 90, resets_at: new Date(h.now() - 1).toISOString() } }, "claude-opus"), null);
  for (const payload of [null, {}, { five_hour: null }, { five_hour: { utilization: "90" } }]) {
    assert.equal(h.parseProviderUsage("anthropic", payload, "claude-opus"), null);
  }
}));

test("relative reset time is anchored to receipt, not recomputed on every render", async () => fixture(h => {
  const payload = { primary_window: { used_percent: 80, limit_window_seconds: 18000, reset_after_seconds: 3600 } };
  const receivedAt = h.now();
  const before = h.parseProviderUsage("openai-codex", payload, "model", receivedAt);
  h.advance(60000);
  assert.equal(h.parseProviderUsage("openai-codex", payload, "model", receivedAt).resetAt, before.resetAt);
}));

test("switching from Codex to Claude hides the old quota and uses the selected provider's auth", async () => fixture(async h => {
  assert.equal(h.readProviderUsage(h.runtime), null);
  await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 31);
  h.selectClaude();
  assert.equal(h.readProviderUsage(h.runtime), null);
  await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 64);
  assert.deepEqual(h.authCalls, ["openai-codex", "anthropic"]);
  assert.equal(h.calls[0].url, "https://chatgpt.com/backend-api/wham/usage");
  assert.equal(h.calls[1].url, "https://api.anthropic.com/api/oauth/usage");
  assert.equal(h.calls[1].options.headers["anthropic-beta"], "oauth-2025-04-20");
}));

test("a late Codex response cannot overwrite Claude's active quota", async () => fixture(async h => {
  let release!: (response: Response) => void;
  h.setResponse((url: string) => url.includes("chatgpt") ? new Promise(resolve => { release = resolve; }) : Promise.resolve(new Response(JSON.stringify(claudePayload(64)))));
  h.readProviderUsage(h.runtime);
  await h.tick();
  h.selectClaude();
  h.readProviderUsage(h.runtime);
  await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 64);
  release(new Response(JSON.stringify(codexPayload(99))));
  await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 64);
}));

test("unsupported providers, API keys and custom endpoints never borrow subscription credentials", async () => fixture(async h => {
  for (const [provider, api] of [["openai", "openai-responses"], ["openrouter", "openai-completions"], ["anthropic", "other-api"]]) {
    h.runtime.ctx.model = { provider, api, id: "model" };
    assert.equal(h.readProviderUsage(h.runtime), null);
  }
  assert.equal(h.authCalls.length, 0);
  h.selectClaude();
  h.auth.anthropic = { ok: true, apiKey: "sk-ant-api03-synthetic" };
  h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.readProviderUsage(h.runtime), null);
  h.auth.anthropic = { ok: true, apiKey: "sk-ant-oat01-synthetic", baseUrl: "https://gateway.example.invalid" };
  h.runtime.ctx.model = { ...h.runtime.ctx.model };
  h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.readProviderUsage(h.runtime), null);
  assert.equal(h.calls.length, 0);
}));

test("switching accounts selects a new credential-scoped cache; explicit account header wins", async () => fixture(async h => {
  h.setResponse(async (_url: string, options: RequestInit) => new Response(JSON.stringify(codexPayload(options.headers["chatgpt-account-id"] === "account-b" ? 72 : 31))));
  h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 31);
  h.auth["openai-codex"] = { ok: true, apiKey: jwt("account-a"), headers: { "ChatGPT-Account-ID": "account-b" } };
  h.runtime.ctx.model = { ...h.runtime.ctx.model };
  assert.equal(h.readProviderUsage(h.runtime), null);
  await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 72);
  assert.equal(h.calls.length, 2);
}));

test("a same-model credential change is revalidated rather than reusing a ten-minute account cache", async () => fixture(async h => {
  h.readProviderUsage(h.runtime); await h.tick();
  h.auth["openai-codex"] = { ok: true, apiKey: jwt("account-b") };
  h.setResponse(async () => new Response(JSON.stringify(codexPayload(72))));
  h.advance(1001);
  h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 72);
  assert.equal(h.calls.length, 2);
}));

test("model switches reuse account data but reselect the model-specific window", async () => fixture(async h => {
  h.selectClaude("claude-opus-4-7");
  h.setResponse(async () => new Response(JSON.stringify({ ...claudePayload(20), seven_day_opus: { utilization: 84 }, seven_day_sonnet: { utilization: 97 } })));
  for (let i = 0; i < 10; i++) h.readProviderUsage(h.runtime);
  await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 84);
  h.selectClaude("claude-sonnet-4-7");
  h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 97);
  assert.equal(h.calls.length, 1);
}));

test("failed refresh clears old values and respects error backoff", async () => fixture(async h => {
  h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 31);
  h.advance(10 * 60000 + 1);
  h.setResponse(async () => new Response("", { status: 403 }));
  assert.equal(h.readProviderUsage(h.runtime), null);
  await h.tick();
  assert.equal(h.readProviderUsage(h.runtime), null);
  h.advance(1001); h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.calls.length, 2);
}));

test("HTTP 429 Retry-After prevents polling again too early", async () => fixture(async h => {
  h.setResponse(async () => new Response("", { status: 429, headers: { "retry-after": "1200" } }));
  h.readProviderUsage(h.runtime); await h.tick();
  h.advance(6 * 60000); h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.calls.length, 1);
  h.advance(15 * 60000); h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.calls.length, 2);
}));

test("usage fetches have a timeout and refuse redirects", async () => fixture(async h => {
  h.readProviderUsage(h.runtime); await h.tick();
  assert.ok(h.calls[0].options.signal instanceof AbortSignal);
  assert.equal(h.calls[0].options.redirect, "error");
}));

test("a slow previous-account fetch does not block or overwrite the new account", async () => fixture(async h => {
  let release!: (response: Response) => void;
  h.setResponse((_url: string, options: RequestInit) => options.headers["chatgpt-account-id"] === "account-a"
    ? new Promise(resolve => { release = resolve; }) : Promise.resolve(new Response(JSON.stringify(codexPayload(72)))));
  h.readProviderUsage(h.runtime); await h.tick();
  h.auth["openai-codex"] = { ok: true, apiKey: jwt("account-b") };
  h.advance(1001);
  h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 72);
  release(new Response(JSON.stringify(codexPayload(99)))); await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 72);
}));

test("a payload without the first model's quota can still serve another model's quota", async () => fixture(async h => {
  h.selectClaude("claude-opus-4-7");
  h.setResponse(async () => new Response(JSON.stringify({ seven_day_sonnet: { utilization: 84 } })));
  h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.readProviderUsage(h.runtime), null);
  h.selectClaude("claude-sonnet-4-7");
  h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 84);
  assert.equal(h.calls.length, 1);
}));

test("synchronous fetch failure is bounded by backoff, not a permanently pending cache", async () => fixture(async h => {
  h.setResponse(() => { throw new Error("Synthetic fetch failure"); });
  h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.readProviderUsage(h.runtime), null);
  h.advance(6 * 60000);
  h.setResponse(async () => new Response(JSON.stringify(codexPayload(31))));
  h.readProviderUsage(h.runtime); await h.tick();
  assert.equal(h.readProviderUsage(h.runtime).percent, 31);
  assert.equal(h.calls.length, 2);
}));

test("async completion does not read a disposed extension context", async () => fixture(async h => {
  let resolveAuth!: (auth: unknown) => void;
  const original = h.runtime.ctx;
  original.modelRegistry.getApiKeyAndHeaders = () => new Promise(resolve => { resolveAuth = resolve; });
  let stale = false;
  h.runtime.ctx = new Proxy(original, { get(target, property) { if (stale) throw new Error("Stale context access"); return target[property]; } });
  h.readProviderUsage(h.runtime);
  stale = true;
  resolveAuth({ ok: true, apiKey: jwt("account-a") });
  await h.tick();
  assert.equal(h.calls.length, 1);
}));
