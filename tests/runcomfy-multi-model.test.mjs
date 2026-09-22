import test from "node:test";
import assert from "node:assert/strict";
import * as pricing from "../web/runcomfy-client.mjs";
import { MODELS } from "../web/runcomfy-models.mjs";
import { installRunComfyExtension } from "../web/runcomfy-node.mjs";

const original = MODELS.RunComfySeedance25I2V1080p;
const textVideo = MODELS.RunComfySeedance25T2V1080p;
const imageModel = MODELS.RunComfyNanoBanana2LiteT2I;
const baseVideo = MODELS.RunComfyWan30I2V;
const baseImage = MODELS.RunComfySeedream50ProI2I;
const quote = (model, price = 0.2) => ({ model_id: model.modelId, unit_price_usd: price,
  price_unit: model.outputType === "IMAGE" ? "output" : "second", currency: "USD",
  fetched_at: "2026-09-16T10:00:00Z", estimate_supported: model.pricingMode === "fixed", pricing_note: "Live catalog quote" });
const response = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const transportOptions = { documentTarget: null, windowTarget: null,
  setInterval: () => 1, clearInterval() {} };

class Events {
  handlers = new Map();
  visibilityState = "visible";
  addEventListener(name, fn) { if (!this.handlers.has(name)) this.handlers.set(name, new Set()); this.handlers.get(name).add(fn); }
  removeEventListener(name, fn) { this.handlers.get(name)?.delete(fn); }
  fire(name) { for (const fn of this.handlers.get(name) ?? []) fn(); }
}

test("each model has its own encoded route and exact model and unit validation", async () => {
  for (const model of Object.values(MODELS)) {
    let payload = quote(model);
    const calls = [];
    const client = pricing.createPriceClient({ ...transportOptions, model, fetchApi: async (url) => {
      calls.push(url); return response(payload);
    } });
    await client.refresh();
    assert.equal(calls[0], `/runcomfy/models/price?model_id=${encodeURIComponent(model.modelId)}`);
    assert.equal(client.state.quote.model_id, model.modelId);
    payload = quote(model === original ? textVideo : original);
    await client.refresh();
    assert.equal(client.state.quote, null, "a different model's response is rejected");
    payload = { ...quote(model), price_unit: model.outputType === "IMAGE" ? "second" : "output" };
    await client.refresh();
    assert.equal(client.state.quote, null, "a mismatched billing unit is rejected");
  }
});

test("the legacy default route still validates the original canonical identity", async () => {
  const client = pricing.createPriceClient({ ...transportOptions, fetchApi: async () => response(quote(textVideo)) });
  await client.refresh();
  assert.equal(client.state.quote, null);
  assert.equal(client.state.phase, "unavailable");
});

test("account hub shares requests for the same model and isolates quotes across models", async () => {
  assert.equal(typeof pricing.createPriceHub, "function");
  const pending = deferred();
  const calls = [];
  const hub = pricing.createPriceHub({ ...transportOptions, fetchApi: async url => {
    calls.push(url);
    return url.includes(encodeURIComponent(original.modelId)) ? pending.promise : response(quote(imageModel, 0.07));
  } });
  const a = hub.forModel(original);
  assert.equal(hub.forModel(original), a);
  const b = hub.forModel(imageModel);
  const first = a.refresh();
  const second = a.refresh();
  await b.refresh();
  assert.equal(calls.length, 2);
  assert.equal(b.state.quote.unit_price_usd, 0.07);
  assert.equal(a.state.quote, null);
  pending.resolve(response(quote(original, 0.3)));
  await Promise.all([first, second]);
  assert.equal(a.state.quote.unit_price_usd, 0.3);
  assert.equal(b.state.quote.unit_price_usd, 0.07);
});

test("a Settings token mutation invalidates all sibling clients and blocks price refresh until completion", async () => {
  assert.equal(typeof pricing.createPriceHub, "function");
  const oldVideo = deferred();
  const oldImage = deferred();
  const mutation = deferred();
  const calls = [];
  let newAccount = false;
  const hub = pricing.createPriceHub({ ...transportOptions, fetchApi: async (url, options) => {
    calls.push({ url, options });
    if (options.method) return mutation.promise;
    const model = url.includes(encodeURIComponent(original.modelId)) ? original : imageModel;
    if (!newAccount) return model === original ? oldVideo.promise : oldImage.promise;
    return response(quote(model, model === original ? 0.8 : 0.09));
  } });
  const a = hub.forModel(original), b = hub.forModel(imageModel);
  const refreshA = a.refresh(), refreshB = b.refresh();
  const saving = hub.saveToken("new-secret");
  assert.equal(a.state.accountRevision, 1);
  assert.equal(b.state.accountRevision, 1);
  assert.equal(a.state.quote, null);
  assert.equal(b.state.quote, null);
  oldVideo.resolve(response(quote(original, 0.1)));
  oldImage.resolve(response(quote(imageModel, 0.01)));
  await Promise.all([refreshA, refreshB]);
  await Promise.all([a.refresh(), b.refresh()]);
  assert.equal(calls.filter(call => !call.options.method).length, 2);
  assert.equal(a.state.quote, null);
  assert.equal(b.state.quote, null);
  newAccount = true;
  mutation.resolve(response({ configured: true, source: "file", token: "never-retain" }));
  await saving;
  assert.equal(a.state.quote.unit_price_usd, 0.8);
  assert.equal(b.state.quote.unit_price_usd, 0.09);
  assert.deepEqual(a.state.config, { configured: true, source: "file" });
  assert.deepEqual(b.state.config, a.state.config);
  assert.doesNotMatch(JSON.stringify([a.state, b.state]), /secret|never-retain/);
});

test("a token change through a sibling client refreshes other models even after a rejected mutation", async () => {
  assert.equal(typeof pricing.createPriceHub, "function");
  let rate = 0.1;
  const hub = pricing.createPriceHub({ ...transportOptions, fetchApi: async (url, options) => {
    if (options.method) { rate = 0.2; return response({}, 503); }
    return response(quote(url.includes(encodeURIComponent(original.modelId)) ? original : imageModel, rate));
  } });
  const a = hub.forModel(original), b = hub.forModel(imageModel);
  await Promise.all([a.refresh(), b.refresh()]);
  await assert.rejects(b.clearToken(), /Unable to update/);
  assert.equal(a.state.quote.unit_price_usd, 0.2);
  assert.equal(b.state.quote.unit_price_usd, 0.2);
  assert.equal(a.state.accountRevision, 1);
});

test("model clients refresh on the visible 30-second schedule, focus and visibility", async () => {
  assert.equal(typeof pricing.createPriceHub, "function");
  const documentTarget = new Events(), windowTarget = new Events(), timers = new Set();
  let calls = 0;
  const hub = pricing.createPriceHub({ documentTarget, windowTarget,
    setInterval(fn, ms) { assert.equal(ms, 30_000); timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn),
    fetchApi: async url => { calls++; return response(quote(url.includes(encodeURIComponent(original.modelId)) ? original : imageModel)); } });
  const a = hub.forModel(original), b = hub.forModel(imageModel);
  const offA = a.subscribe(() => {}), offB = b.subscribe(() => {});
  await tick(); assert.equal(calls, 2);
  windowTarget.fire("focus"); await tick(); assert.equal(calls, 4);
  for (const fn of timers) fn(); await tick(); assert.equal(calls, 6);
  documentTarget.visibilityState = "hidden"; documentTarget.fire("visibilitychange");
  assert.equal(timers.size, 0);
  windowTarget.fire("focus"); await tick(); assert.equal(calls, 6);
  documentTarget.visibilityState = "visible"; documentTarget.fire("visibilitychange"); await tick(); assert.equal(calls, 8);
  offA(); offB(); assert.equal(timers.size, 0);
});

test("fixed image pricing is per image and fixed video respects model duration limits and choices", () => {
  const image = pricing.describePricing({ phase: "ready", quote: quote(imageModel, 0.07) }, { model: imageModel });
  assert.equal(image.badge, "$0.07/image · ~$0.07/Run");
  assert.equal(image.price, "$0.07 / image");
  const smallVideo = { ...original, durationMin: 2, durationMax: 10, durationChoices: ["auto", "2", "5"] };
  const state = { phase: "ready", quote: quote(smallVideo) };
  assert.equal(pricing.describePricing(state, { model: smallVideo, duration: "2" }).badge, "$0.20/s · ~$0.40/Run");
  for (const duration of ["auto", "3", 11, NaN, null, ""]) {
    assert.equal(pricing.describePricing(state, { model: smallVideo, duration }).badge, "$0.20/s");
  }
});

test("base catalog rates never imply a supported per-run estimate, including execution quotes", () => {
  for (const model of [baseVideo, MODELS.RunComfyFlux3Video, baseImage]) {
    const live = quote(model);
    const execution = { state: "running", quote: { ...quote(model, 0.4), estimated_cost_usd: null }, cost_usd: 0.51 };
    const view = pricing.describePricing({ phase: "ready", quote: live }, { model, duration: model.durationMin, execution });
    const unit = model.outputType === "IMAGE" ? "image" : "s";
    assert.equal(view.badge, `Base $0.40/${unit}`);
    assert.doesNotMatch(view.badge, /NaN|Run|minimum/i);
    assert.doesNotMatch(view.estimate, /\$|NaN/);
    assert.match(view.actual, /\$0\.51/);
    assert.doesNotMatch(view.submission, /\$0\.00|NaN/);
    const malformedTotal = { ...execution, quote: { ...execution.quote, estimated_cost_usd: 99 } };
    assert.doesNotMatch(pricing.describePricing({ phase: "ready", quote: live }, { model, duration: 5, execution: malformedTotal }).badge, /Run|99/);
  }
});

test("execution quotes from another model do not replace the node's rate", () => {
  const view = pricing.describePricing({ phase: "ready", quote: quote(original) }, {
    model: original, duration: 5,
    execution: { state: "running", quote: { ...quote(textVideo, 0.9), estimated_cost_usd: 4.5 } },
  });
  assert.equal(view.badge, "$0.20/s · ~$1.00/Run");
  assert.equal(view.submission, "Not available");
});

class Node {
  constructor(comfyClass, id) {
    Object.assign(this, { comfyClass, id, size: [320, 180], flags: {}, properties: {},
      inputs: [{ name: "image", link: null }], outputs: [{ name: "output", type: MODELS[comfyClass].outputType }],
      widgets: [{ name: "duration", value: 5 }, { name: "resolution", value: "720p" }, { name: "generate_audio", value: true }] });
  }
  computeSize() { return [440, 260]; }
  setSize(value) { this.size = value; }
  setDirtyCanvas() { this.dirty = (this.dirty ?? 0) + 1; }
}
function badge(node) {
  let text;
  const ctx = { save() {}, restore() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {}, ellipse() {},
    measureText: value => ({ width: value.length * 6 }), fillText(value) { text = value; } };
  node.onDrawForeground(ctx);
  assert.equal(ctx.font, "600 12px Arial, sans-serif");
  assert.equal(ctx.fillStyle, "#ffffff");
  return text;
}
function nodeSetup(fetchApi) {
  let extension;
  let promptNumber = 1;
  const handlers = new Map();
  const rootGraph = { id: "test-workflow", nodes: [] };
  const hub = pricing.createPriceHub({ ...transportOptions, fetchApi });
  installRunComfyExtension({ app: { rootGraph, registerExtension(e) {
    extension = e; const create = e.nodeCreated;
    e.nodeCreated = node => { if (!rootGraph.nodes.includes(node)) rootGraph.nodes.push(node); create(node); };
  } },
    api: { fetchApi, addEventListener: (name, fn) => handlers.set(name, name === "runcomfy.status"
      ? event => { if (event.detail.state === "submitting") promptNumber++;
        const detail = { prompt_id: `test-prompt-${promptNumber}`, workflow_id: rootGraph.id, ...event.detail, node_id: String(event.detail.node_id) };
        detail.model_id ??= detail.quote?.model_id ?? MODELS[rootGraph.nodes.find(node => String(node.id) === detail.node_id)?.comfyClass]?.modelId;
        handlers.get("execution_start")({ detail: { prompt_id: detail.prompt_id } }); fn({ detail }); } : fn),
      removeEventListener: name => handlers.delete(name) }, priceHub: hub });
  return { get extension() { return extension; }, hub, handlers };
}

test("all registered model classes receive the same gold style and isolated compact prices", async () => {
  assert.equal(typeof pricing.createPriceHub, "function");
  const calls = [];
  const env = nodeSetup(async url => {
    calls.push(url); const modelId = new URL(url, "http://localhost").searchParams.get("model_id");
    const model = Object.values(MODELS).find(m => m.modelId === modelId);
    return response(quote(model, model.outputType === "IMAGE" ? 0.07 : 0.2));
  });
  const nodes = Object.keys(MODELS).map((key, index) => new Node(key, index));
  for (const node of nodes) env.extension.nodeCreated(node);
  const duplicate = new Node("RunComfySeedance25T2V1080p", 100);
  env.extension.nodeCreated(duplicate);
  await tick();
  assert.equal(calls.length, Object.keys(MODELS).length);
  for (const node of nodes) {
    const model = MODELS[node.comfyClass];
    assert.equal(node.color, "#443522"); assert.equal(node.bgcolor, "#665637");
    assert.equal(node.widgets.length, 3);
    assert.equal(node.getExtraMenuOptions, undefined);
    const text = badge(node);
    assert.match(text, model.outputType === "IMAGE" ? /\/image/ : /\/s/);
    assert.equal(text.startsWith("Base "), model.pricingMode === "base");
    for (const widget of node.widgets) {
      const dirty = node.dirty;
      assert.equal(typeof widget.callback, "function");
      widget.callback(widget.value);
      assert.ok(node.dirty > dirty);
    }
  }
  const before = calls.length;
  env.extension.loadedGraphNode(nodes[1]); await tick();
  assert.equal(calls.length, before + 1);
  duplicate.onRemoved(); for (const node of nodes) node.onRemoved();
});

test("account changes clear every node's execution quote and reject wrong-model status quotes", async () => {
  assert.equal(typeof pricing.createPriceHub, "function");
  const mutation = deferred();
  const env = nodeSetup(async (url, options) => {
    if (options.method) return mutation.promise;
    return response(quote(url.includes(encodeURIComponent(original.modelId)) ? original : imageModel));
  });
  const a = new Node("RunComfySeedance25I2V1080p", 1), b = new Node("RunComfyNanoBanana2LiteT2I", 2);
  env.extension.nodeCreated(a); env.extension.nodeCreated(b); await tick();
  const emit = (node, model, requestId) => env.handlers.get("runcomfy.status")({ detail: { node_id: node.id, state: "running", request_id: requestId,
    quote: { ...quote(model, 0.9), estimated_cost_usd: 4.5 } } });
  emit(a, imageModel, "wrong-model"); assert.equal(badge(a), "$0.20/s · ~$1.00/Run");
  emit(a, original, "old-video"); emit(b, imageModel, "old-image");
  assert.match(badge(a), /0\.90/); assert.match(badge(b), /0\.90/);
  const saving = env.hub.saveToken("new");
  assert.equal(badge(a), "Checking price…"); assert.equal(badge(b), "Checking price…");
  emit(a, original, "old-video"); emit(b, imageModel, "old-image");
  assert.equal(badge(a), "Checking price…"); assert.equal(badge(b), "Checking price…");
  mutation.resolve(response({ configured: true, source: "file" })); await saving;
  assert.equal(badge(a), "$0.20/s · ~$1.00/Run"); assert.equal(badge(b), "$0.20/image · ~$0.20/Run");
  a.onRemoved(); b.onRemoved();
});

test("wrong-model execution events cannot clear a matching model's active submission", async () => {
  const env = nodeSetup(async () => response(quote(original)));
  const node = new Node("RunComfySeedance25I2V1080p", 1);
  env.extension.nodeCreated(node); await tick();
  const emit = detail => env.handlers.get("runcomfy.status")({ detail: { node_id: 1, ...detail } });
  emit({ state: "running", request_id: "right", quote: { ...quote(original, 0.9), estimated_cost_usd: 4.5 } });
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
  emit({ state: "completed", request_id: "wrong", quote: { ...quote(textVideo, 0.7), estimated_cost_usd: 3.5 }, cost_usd: 3.4 });
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
  emit({ state: "completed", request_id: "wrong", model_id: imageModel.modelId, cost_usd: 3.4 });
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
  node.onRemoved();
});

test("a request assigned after an account change cannot revive its old execution quote", async () => {
  const mutation = deferred();
  const env = nodeSetup(async (_url, options) => options.method ? mutation.promise : response(quote(original)));
  const node = new Node("RunComfySeedance25I2V1080p", 1);
  env.extension.nodeCreated(node); await tick();
  const emit = detail => env.handlers.get("runcomfy.status")({ detail: { node_id: 1, ...detail } });
  const executionQuote = { ...quote(original, 0.9), estimated_cost_usd: 4.5 };
  emit({ state: "submitting", request_id: null, quote: executionQuote });
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
  const saving = env.hub.saveToken("new");
  emit({ state: "submitted", request_id: "late-id", quote: executionQuote });
  assert.equal(badge(node), "Checking price…");
  mutation.resolve(response({ configured: true, source: "file" })); await saving;
  emit({ state: "running", request_id: "late-id", quote: executionQuote });
  assert.equal(badge(node), "$0.20/s · ~$1.00/Run");
  emit({ state: "submitting", request_id: null, quote: executionQuote });
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
  node.onRemoved();
});

test("price and execution quotes preserve an optional opaque account scope", async () => {
  const scoped = { ...quote(original), account_scope: "opaque-account-a" };
  const client = pricing.createPriceClient({ ...transportOptions, model: original,
    fetchApi: async () => response(scoped) });
  await client.refresh();
  assert.equal(client.state.quote.account_scope, "opaque-account-a");
  assert.equal(pricing.normalizeExecutionQuote({ ...scoped, estimated_cost_usd: 1 }, original).account_scope, "opaque-account-a");
});

test("late prior-account submissions without request IDs cannot restore old quotes after switching", async () => {
  const mutation = deferred(), freshPrice = deferred();
  let changing = false;
  const env = nodeSetup(async (_url, options) => {
    if (options.method) { changing = true; return mutation.promise; }
    return changing ? freshPrice.promise : response({ ...quote(original), account_scope: "opaque-account-a" });
  });
  const node = new Node("RunComfySeedance25I2V1080p", 1);
  env.extension.nodeCreated(node); await tick();
  const emit = detail => env.handlers.get("runcomfy.status")({ detail: { node_id: 1, ...detail } });
  const oldExecution = { ...quote(original, 0.9), account_scope: "opaque-account-a", estimated_cost_usd: 4.5 };
  emit({ state: "submitting", request_id: null, account_scope: "opaque-account-a", quote: oldExecution });
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
  const saving = env.hub.saveToken("new");
  mutation.resolve(response({ configured: true, source: "file" })); await tick();
  assert.equal(badge(node), "Checking price…");
  emit({ state: "submitting", request_id: null, account_scope: "opaque-account-a", quote: oldExecution });
  assert.equal(badge(node), "Checking price…", "ignore scoped events until a fresh price establishes the account");
  freshPrice.resolve(response({ ...quote(original), account_scope: "opaque-account-b" })); await saving;
  emit({ state: "submitting", request_id: null, account_scope: "opaque-account-a", quote: oldExecution });
  assert.equal(badge(node), "$0.20/s · ~$1.00/Run");
  emit({ state: "submitting", request_id: null, quote: oldExecution });
  assert.equal(badge(node), "$0.20/s · ~$1.00/Run", "nested quote scope is sufficient to reject the old account");
  emit({ state: "submitting", request_id: null, account_scope: "opaque-account-b",
    quote: { ...oldExecution, account_scope: "opaque-account-b" } });
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
  emit({ state: "completed", request_id: "old", account_scope: "opaque-account-a", cost_usd: 4 });
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
  emit({ state: "completed", request_id: "contradiction", account_scope: "opaque-account-b", quote: oldExecution });
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run", "both outer and nested scopes must match");
  node.onRemoved();
});

test("a refreshed account scope clears the prior execution even when another tab changed the token", async () => {
  const pending = deferred();
  let priceResponse = response({ ...quote(original), account_scope: "opaque-account-a" });
  const env = nodeSetup(async () => priceResponse);
  const node = new Node("RunComfySeedance25I2V1080p", 1);
  env.extension.nodeCreated(node); await tick();
  const client = env.hub.forModel(original);
  const emit = (scope, price, requestId = "run-a") => env.handlers.get("runcomfy.status")({ detail: {
    node_id: 1, state: "submitting", request_id: requestId, account_scope: scope,
    quote: { ...quote(original, price), account_scope: scope, estimated_cost_usd: price * 5 },
  } });
  emit("opaque-account-a", 0.9);
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
  const localRevision = client.state.accountRevision;
  priceResponse = pending.promise;
  const refreshing = client.refresh();
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run", "a pending refresh does not discard a known account");
  pending.resolve(response({}, 503)); await refreshing;
  assert.equal(client.state.quote, null);
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run", "missing prices alone do not establish another account");
  priceResponse = response({ ...quote(original, 0.3), account_scope: "opaque-account-b" });
  await client.refresh();
  assert.equal(client.state.accountRevision, localRevision, "the local Settings token was not mutated");
  assert.equal(badge(node), "$0.30/s · ~$1.50/Run", "a changed fresh scope clears the previous run");
  emit("opaque-account-a", 0.9, null);
  assert.equal(badge(node), "$0.30/s · ~$1.50/Run");
  emit("opaque-account-b", 0.7, null);
  assert.equal(badge(node), "$0.70/s · ~$3.50/Run");
  await client.refresh();
  assert.equal(badge(node), "$0.70/s · ~$3.50/Run", "refreshing the same account preserves its active run");
  node.onRemoved();
});

test("authentication loss clears an active execution while transient pricing failures preserve it", async () => {
  for (const status of [401, 403]) {
    let priceResponse = response({ ...quote(original), account_scope: "opaque-account-a" });
    const env = nodeSetup(async () => priceResponse);
    const node = new Node("RunComfySeedance25I2V1080p", 1);
    env.extension.nodeCreated(node); await tick();
    const client = env.hub.forModel(original);
    const emit = () => env.handlers.get("runcomfy.status")({ detail: {
      node_id: 1, state: "submitting", request_id: null, account_scope: "opaque-account-a",
      quote: { ...quote(original, 0.9), account_scope: "opaque-account-a", estimated_cost_usd: 4.5 },
    } });
    emit(); assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
    priceResponse = response({}, 503); await client.refresh();
    assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
    priceResponse = response({}, status); await client.refresh();
    assert.equal(client.state.phase, "configure");
    assert.equal(badge(node), "Set up account");
    emit(); assert.equal(badge(node), "Set up account");
    priceResponse = response({ ...quote(original), account_scope: "opaque-account-a" });
    await client.refresh();
    assert.equal(badge(node), "$0.20/s · ~$1.00/Run", "restoring access does not restore the discarded execution");
    emit(); assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
    node.onRemoved();
  }
});

test("complex nodes reserve readable prompt height without enlarging simple nodes", async () => {
  const env = nodeSetup(async url => {
    const modelId = new URL(url, "http://localhost").searchParams.get("model_id");
    return response(quote(Object.values(MODELS).find(model => model.modelId === modelId)));
  });
  const examples = [
    { comfyClass: "RunComfySeedance25I2V1080p", inputs: 1, controls: 2, nativeMinimum: 136, upperBound: 280 },
    { comfyClass: "RunComfyWan30I2V", inputs: 2, controls: 7, nativeMinimum: 276, upperBound: 410 },
    { comfyClass: "RunComfySeedance25Reference4K", inputs: 7, controls: 3, nativeMinimum: 280, upperBound: 420 },
  ];
  for (const [index, example] of examples.entries()) {
    const node = new Node(example.comfyClass, index);
    node.inputs = Array.from({ length: example.inputs }, (_, i) => ({ name: `image_${i}`, link: null }));
    node.widgets = [
      { name: "prompt", type: "customtext", value: "Describe the result", margin: 10, computeLayoutSize: () => ({ minHeight: 50 }) },
      ...Array.from({ length: example.controls }, (_, i) => ({ name: `control_${i}`, type: "combo", value: "default" })),
      { name: "resume_request_id", type: "text", value: "" },
      { name: "converted_widget", type: "text", hidden: true, value: "" },
    ];
    // ComfyUI's native minimum allocates only 50px including the textarea's margins.
    node.computeSize = () => [440, example.nativeMinimum];
    node.size = [440, 900];
    env.extension.nodeCreated(node);
    const textAreaHeight = node.size[1] - example.inputs * 20 - example.controls * 24 - 14 - 4 - 20;
    assert.ok(textAreaHeight >= 140, `${example.comfyClass} prompt has only ${textAreaHeight}px`);
    assert.ok(node.size[1] <= example.upperBound, "the layout remains compact");
    const height = node.size[1];
    node.onConfigure({});
    assert.equal(node.size[1], height, "reloading does not accumulate extra height");
    node.onRemoved();
  }
  await tick();
});

test("same-account completion during a transient price failure ends the running quote", async () => {
  let priceResponse = response({ ...quote(original), account_scope: "opaque-account-a" });
  const env = nodeSetup(async () => priceResponse);
  const node = new Node("RunComfySeedance25I2V1080p", 1);
  env.extension.nodeCreated(node); await tick();
  const client = env.hub.forModel(original);
  const emit = detail => env.handlers.get("runcomfy.status")({ detail: { node_id: 1, account_scope: "opaque-account-a", ...detail } });
  emit({ state: "submitted", request_id: "active-run", quote: {
    ...quote(original, 0.9), account_scope: "opaque-account-a", estimated_cost_usd: 4.5,
  } });
  assert.equal(badge(node), "$0.90/s · ~$4.50/Run");
  priceResponse = response({}, 503); await client.refresh();
  emit({ state: "completed", request_id: "active-run", cost_usd: 4.4 });
  assert.equal(badge(node), "Price unavailable");
  priceResponse = response({ ...quote(original, 0.3), account_scope: "opaque-account-a" });
  await client.refresh();
  assert.equal(badge(node), "$0.30/s · ~$1.50/Run");
  node.onRemoved();
});
