import test from "node:test";
import assert from "node:assert/strict";
import { createPriceClient, describePricing } from "../web/runcomfy-client.mjs";

const quote = (price = 0.15) => ({ model_id: "bytedance/seedance-2.5/image-to-video/1080p", unit_price_usd: price,
  price_unit: "second", currency: "USD", fetched_at: "2026-09-15T10:00:00Z", pricing_note: "Per output second" });
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
class Events {
  handlers = new Map();
  visibilityState = "visible";
  addEventListener(name, fn) { this.handlers.set(name, fn); }
  removeEventListener(name, fn) { if (this.handlers.get(name) === fn) this.handlers.delete(name); }
  fire(name) { this.handlers.get(name)?.(); }
}
function harness(fetchApi) {
  const documentTarget = new Events();
  const windowTarget = new Events();
  const timers = new Set();
  const client = createPriceClient({ fetchApi, documentTarget, windowTarget,
    setInterval: (fn, ms) => { assert.equal(ms, 30_000); timers.add(fn); return fn; },
    clearInterval: fn => timers.delete(fn) });
  return { client, documentTarget, windowTarget, timers };
}

test("shares one price request and always bypasses browser caching", async () => {
  const pending = deferred();
  const calls = [];
  const { client } = harness((url, options) => { calls.push({ url, options }); return pending.promise; });
  const one = client.refresh();
  const two = client.refresh();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "/runcomfy/seedance-25/price");
  assert.equal(calls[0].options.cache, "no-store");
  pending.resolve(response(quote()));
  await Promise.all([one, two]);
  assert.equal(client.state.quote.unit_price_usd, 0.15);
});

test("a failed refresh invalidates the last successful price", async () => {
  let ok = true;
  const { client } = harness(async () => ok ? response(quote()) : response({ error: "upstream unavailable", code: "pricing_unavailable" }, 503));
  await client.refresh();
  ok = false;
  await client.refresh();
  assert.equal(client.state.quote, null);
  assert.equal(client.state.phase, "unavailable");
  assert.match(describePricing(client.state, { duration: 5 }).estimate, /unavailable/i);
});

test("missing or invalid tokens get a configuration status", async () => {
  const { client } = harness(async () => response({ error: "Token required", code: "token_missing" }, 401));
  await client.refresh();
  assert.equal(client.state.phase, "configure");
  assert.match(describePricing(client.state, {}).status, /Settings.*RunComfy/);
});

test("rejects malformed or stale-contract quotes instead of inventing a price", async () => {
  for (const invalid of [null, {}, quote(-1), quote("0.15"), { ...quote(), price_unit: "video" }, { ...quote(), fetched_at: "invalid" }, { ...quote(), currency: "CNY" }]) {
    const { client } = harness(async () => response(invalid));
    await client.refresh();
    assert.equal(client.state.quote, null);
    assert.equal(client.state.phase, "unavailable");
  }
});

test("token change discards the old response and obtains the new token's quote", async () => {
  const old = deferred();
  const calls = [];
  const { client } = harness(async (url, options) => {
    calls.push({ url, options });
    if (options.method === "POST") return response({ configured: true, source: "file", token: "must-not-retain" });
    return calls.filter(c => c.url.includes("price")).length === 1 ? old.promise : response(quote(0.24));
  });
  const refreshing = client.refresh();
  const originalRevision = client.state.accountRevision ?? 0;
  const saving = client.saveToken("transient-secret");
  assert.equal(client.state.accountRevision, originalRevision + 1);
  await tick();
  assert.equal(client.state.quote, null);
  old.resolve(response(quote(0.1)));
  await Promise.all([refreshing, saving]);
  assert.equal(client.state.quote.unit_price_usd, 0.24);
  const mutation = calls.find(c => c.options.method === "POST");
  assert.equal(mutation.options.headers["X-RunComfy-Client"], "comfyui");
  assert.equal(mutation.options.headers["Content-Type"], "application/json");
  assert.deepEqual(JSON.parse(mutation.options.body), { token: "transient-secret" });
  assert.equal(JSON.stringify(client.state).includes("secret"), false);
  assert.equal(JSON.stringify(client.state).includes("must-not-retain"), false);
});

test("submission estimate and rate stay separate from edited next-run inputs and billed cost", () => {
  const state = { quote: quote(0.2), phase: "ready" };
  const submissionQuote = { ...quote(0.57), estimated_cost_usd: 2.85 };
  const execution = { state: "completed", request_id: "confirmed", quote: submissionQuote, cost_usd: 2.7 };
  const display = describePricing(state, { duration: 8, execution });
  assert.match(display.estimate, /\$1\.60/);
  assert.match(display.submission, /\$2\.85 at \$0\.57 \/ second/);
  assert.equal(display.submissionChecked, new Date(submissionQuote.fetched_at).toLocaleString());
  assert.match(display.actual, /\$2\.70/);
  const connected = describePricing(state, { durationConnected: true, execution });
  assert.match(connected.estimate, /connected/i);
  assert.match(connected.submission, /\$2\.85/);
});

test("malformed execution quotes never become a submission estimate", () => {
  const good = { ...quote(), estimated_cost_usd: 0.75 };
  for (const invalid of [null, {}, { ...good, estimated_cost_usd: -1 }, { ...good, estimated_cost_usd: "0.75" },
    { ...good, unit_price_usd: Infinity }, { ...good, fetched_at: "invalid" }, { ...good, currency: "CNY" }]) {
    const display = describePricing({ quote: quote(), phase: "ready" }, { duration: 5, execution: { quote: invalid } });
    assert.equal(display.submission, "Not available");
    assert.equal(display.submissionChecked, "Not available");
  }
});

test("clear uses a protected DELETE, and config reads expose only configured/source", async () => {
  const calls = [];
  const { client } = harness(async (url, options) => {
    calls.push({ url, options });
    return url.includes("price") ? response({ error: "required" }, 401) : response({ configured: false, source: "none", token: "secret" });
  });
  assert.deepEqual(await client.getConfig(), { configured: false, source: "none" });
  await client.clearToken();
  const mutation = calls.find(c => c.options.method === "DELETE");
  assert.equal(mutation.options.headers["X-RunComfy-Client"], "comfyui");
  assert.equal(mutation.options.headers["Content-Type"], "application/json");
  assert.equal(client.state.quote, null);
});

test("does not reload a quote while the token mutation is still pending", async () => {
  const old = deferred(); const mutation = deferred();
  let priceCalls = 0;
  const { client } = harness(async (_url, options) => {
    if (options.method === "POST") return mutation.promise;
    priceCalls++;
    return priceCalls === 1 ? old.promise : response(quote(0.3));
  });
  const refreshing = client.refresh();
  const saving = client.saveToken("new-token");
  old.resolve(response(quote(0.1)));
  await refreshing;
  await client.refresh();
  assert.equal(priceCalls, 1);
  assert.equal(client.state.quote, null);
  mutation.resolve(response({ configured: true, source: "file" }));
  await saving;
  assert.equal(priceCalls, 2);
  assert.equal(client.state.quote.unit_price_usd, 0.3);
});

test("refresh scheduling exists only for subscribed nodes on a visible page and cleans up", async () => {
  let calls = 0;
  const { client, documentTarget, windowTarget, timers } = harness(async () => { calls++; return response(quote()); });
  assert.equal(timers.size, 0);
  const offOne = client.subscribe(() => {});
  const offTwo = client.subscribe(() => {});
  await tick();
  assert.equal(calls, 1);
  assert.equal(timers.size, 1);
  [...timers][0]();
  await tick();
  assert.equal(calls, 2);
  documentTarget.visibilityState = "hidden";
  documentTarget.fire("visibilitychange");
  assert.equal(timers.size, 0);
  windowTarget.fire("focus");
  await tick();
  assert.equal(calls, 2);
  documentTarget.visibilityState = "visible";
  documentTarget.fire("visibilitychange");
  await tick();
  assert.equal(calls, 3);
  windowTarget.fire("focus");
  await tick();
  assert.equal(calls, 4);
  offOne();
  offTwo();
  offTwo();
  assert.equal(timers.size, 0);
  assert.equal(windowTarget.handlers.size, 0);
  assert.equal(documentTarget.handlers.size, 0);
});

test("calculates immediately from the current duration and reports actual charge separately", () => {
  const state = { quote: quote(), phase: "ready" };
  assert.match(describePricing(state, { duration: 5 }).estimate, /\$0\.75/);
  assert.match(describePricing(state, { duration: 8 }).estimate, /\$1\.20/);
  const display = describePricing(state, { duration: 8, execution: { state: "completed", cost_usd: 1.03, request_id: "request-123" } });
  assert.match(display.actual, /\$1\.03/);
  assert.match(display.estimate, /\$1\.20/);
  assert.equal(display.requestId, "request-123");
});

test("connected duration and resume requests never show a speculative total", () => {
  const state = { quote: quote(), phase: "ready" };
  const connected = describePricing(state, { duration: 5, durationConnected: true });
  assert.match(connected.price, /\$0\.15/);
  assert.match(connected.estimate, /connected/i);
  assert.doesNotMatch(connected.estimate, /\$0\.75/);
  const resume = describePricing(state, { duration: 5, resumeRequestId: "existing-id" });
  assert.match(resume.estimate, /resume.*no new submission/i);
  assert.doesNotMatch(resume.badge, /\$0\.75/);
  for (const duration of [undefined, NaN, -5, "", 31]) {
    assert.doesNotMatch(describePricing(state, { duration }).estimate, /\$/);
  }
});
