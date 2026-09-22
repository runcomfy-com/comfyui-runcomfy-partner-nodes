import test from "node:test";
import assert from "node:assert/strict";
import { installRunComfyExtension } from "../web/runcomfy-node.mjs";

const NODE = "RunComfySeedance25I2V1080p";
const tick = () => new Promise(r => setImmediate(r));
class Node {
  comfyClass = NODE;
  id = 12;
  widgets = [{ name: "prompt", value: "Prompt" }, { name: "duration", value: 5 },
    { name: "generate_audio", value: true }, { name: "resume_request_id", value: "" }];
  inputs = [{ name: "image", link: null }];
  size = [320, 180];
  flags = {};
  properties = {};
  addCustomWidget(widget) { this.widgets.push(widget); return widget; }
  addWidget(type, name, value, callback, options) { const widget = { type, name, value, callback, options }; this.widgets.push(widget); return widget; }
  setSize(size) { this.size = size; }
  computeSize() { return [440, 260]; }
  setDirtyCanvas() { this.dirty = (this.dirty || 0) + 1; }
}
function setup({ documentTarget, fetchApi, initialState } = {}) {
  let extension;
  let callback;
  let refreshes = 0;
  let subscribers = 0;
  const handlers = new Map();
  let promptNumber = 1;
  const rootGraph = { id: "test-workflow", nodes: [] };
  const app = { rootGraph, registerExtension: e => {
    extension = e; const create = e.nodeCreated;
    e.nodeCreated = node => { if (!rootGraph.nodes.includes(node)) rootGraph.nodes.push(node); create(node); };
  } };
  const api = { fetchApi, addEventListener: (name, fn) => handlers.set(name, name === "runcomfy.status"
    ? event => { if (event.detail.state === "submitting") promptNumber++;
      const detail = { prompt_id: `test-prompt-${promptNumber}`, workflow_id: rootGraph.id, ...event.detail };
      handlers.get("execution_start")({ detail: { prompt_id: detail.prompt_id } }); fn({ detail }); } : fn),
    removeEventListener: (name, fn) => { if (handlers.get(name) === fn) handlers.delete(name); } };
  const client = { state: initialState ?? { phase: "ready", quote: { unit_price_usd: 0.15, fetched_at: "2026-09-15T10:00:00Z" } },
    subscribe(fn) { callback = fn; subscribers++; fn(this.state); return () => subscribers--; },
    refresh() { refreshes++; return Promise.resolve(this.state); } };
  installRunComfyExtension({ app, api, client, documentTarget });
  return { extension, app, api, client, handlers, get subscribers() { return subscribers; }, get refreshes() { return refreshes; }, update: () => callback(client.state) };
}
function badge(node) {
  let text;
  const ctx = { save() {}, restore() {}, beginPath() {}, roundRect() {}, fill() {}, stroke() {}, ellipse() {},
    measureText: value => ({ width: value.length * 6 }), fillText(value) { text = value; } };
  node.onDrawForeground(ctx);
  return text;
}
const executionQuote = { model_id: "bytedance/seedance-2.5/image-to-video/1080p", unit_price_usd: 0.57, price_unit: "second", currency: "USD",
  fetched_at: "2026-09-15T10:00:00Z", estimated_cost_usd: 2.85 };

function statusSetup(fetchApi) {
  const documentTarget = { createElement(tag) {
    return { tag, style: {}, children: [], handlers: {}, textContent: '', value: '',
      append(...children) { this.children.push(...children); }, replaceChildren(...children) { this.children = children; },
      setAttribute(name, value) { this[name] = value; }, addEventListener(name, fn) { this.handlers[name] = fn; }, focus() {} };
  } };
  const env = setup({ documentTarget, fetchApi, initialState: { phase: 'configure', quote: null } });
  const node = new Node();
  node.addDOMWidget = (name, type, element, options) => {
    const widget = { name, type, element, options }; node.widgets.push(widget); return widget;
  };
  env.extension.nodeCreated(node);
  const elements = () => {
    const flatten = element => [element, ...element.children.flatMap(flatten)];
    return flatten(node.widgets.find(item => item.name === 'runcomfy_status').element);
  };
  const emit = (name, detail) => env.handlers.get(name)({ detail });
  const ready = (scope, revision = 0) => {
    env.client.state = { phase: 'ready', accountRevision: revision, quote: { ...executionQuote, account_scope: scope } };
    env.update();
  };
  const cached = (promptId, accountScope = 'account-a') => {
    emit('execution_start', { prompt_id: promptId });
    emit('executed', { prompt_id: promptId, node: '12', output: { runcomfy: [{
      prompt_id: 'original-paid-prompt', workflow_id: 'original-workflow', node_id: '3:12',
      model_id: executionQuote.model_id, account_scope: accountScope,
      state: 'completed', request_id: 'paid-once-request', cost_usd: 0.42,
    }] } });
    emit('execution_success', { prompt_id: promptId });
  };
  return { ...env, node, elements, ready, cached };
}

test('a reload restores cached cost and recovery through the full extension after fresh account and scope checks', async () => {
  const calls = [];
  const env = statusSetup(async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ prompt_id: 'cache-after-reload', workflow_id: 'test-workflow', nodes: { '12': NODE } }) };
  });
  env.ready('account-a');
  env.cached('cache-after-reload'); await tick();
  assert.equal(calls.length, 1); assert.equal(calls[0].options.cache, 'no-store');
  assert.equal(calls[0].url, '/runcomfy/execution-scope?prompt_id=cache-after-reload');
  assert.match(env.elements().map(item => item.textContent).join('\n'), /Cached result reused[\s\S]*Reported cost: \$0.42 USD/);
  assert.ok(env.elements().some(item => item.readOnly && item.value === 'paid-once-request'));
  assert.equal(env.elements().find(item => item.textContent === 'Resume existing request').disabled, false);
  assert.doesNotMatch(JSON.stringify(env.node.properties), /paid-once|account-a/);
});

test('account changes while cached scope resolves preserve the invalidation fence and reject old-account cache', async () => {
  let resolveScope;
  const pending = new Promise(resolve => { resolveScope = resolve; });
  const env = statusSetup(async url => {
    const promptId = new URL(url, 'http://local').searchParams.get('prompt_id');
    if (promptId === 'pending-cache') await pending;
    return { ok: true, json: async () => ({ prompt_id: promptId, workflow_id: 'test-workflow', nodes: { '12': NODE } }) };
  });
  env.ready('account-a'); env.cached('pending-cache');
  env.ready('account-b', 1); resolveScope(); await tick();
  assert.ok(!env.elements().some(item => item.readOnly));
  env.cached('wrong-account-cache', 'account-a'); await tick();
  assert.ok(!env.elements().some(item => item.readOnly));
  env.cached('verified-new-account-cache', 'account-b'); await tick();
  assert.ok(env.elements().some(item => item.readOnly && item.value === 'paid-once-request'));
});

test("targets only RunComfy and keeps node widgets free of pricing and settings UI", () => {
  const env = setup();
  const other = new Node(); other.comfyClass = "Other";
  env.extension.nodeCreated(other);
  assert.equal(other.widgets.length, 4);
  const node = new Node();
  env.extension.nodeCreated(node);
  env.extension.nodeCreated(node);
  env.extension.loadedGraphNode(node);
  node.onConfigure({});
  assert.equal(node.widgets.filter(w => w.name === "runcomfy_pricing").length, 0);
  assert.equal(env.subscribers, 1);
  assert.match(node.color, /^#/);
  assert.ok(node.size[0] >= 420);
  for (const widget of node.widgets.slice(4)) {
    assert.equal(widget.serialize, false);
    assert.equal(widget.options.serialize, false);
  }
  const serialized = { widgets_values: node.widgets.map(w => w.value), properties: { ...node.properties } };
  assert.deepEqual(serialized.widgets_values, ["Prompt", 5, true, ""]);
  assert.doesNotMatch(JSON.stringify(serialized), /price|quote|token|reported|0\.15/);
});

test("keeps the standard context menu unchanged, including when a saved workflow resumes a request", () => {
  const env = setup();
  for (const requestId of ["", "saved-request"]) {
    const node = new Node();
    node.widgets[3].value = requestId;
    const original = (_canvas, options) => { options.push({ content: "Existing action" }); return "original"; };
    node.getExtraMenuOptions = original;
    env.extension.nodeCreated(node);
    env.extension.loadedGraphNode(node);
    node.onConfigure({});
    assert.equal(node.getExtraMenuOptions, original);
    const menu = [{ content: "Copy" }];
    assert.equal(node.getExtraMenuOptions(null, menu), "original");
    assert.deepEqual(menu, [{ content: "Copy" }, { content: "Existing action" }]);
  }
  const node = new Node();
  env.extension.nodeCreated(node);
  assert.equal(node.getExtraMenuOptions, undefined);
});

test("graph reload preserves serialized geometry so native undo and redo stay stable", () => {
  const env = setup(); const node = new Node(); env.extension.nodeCreated(node);
  node.size = [420, 180];
  node.onConfigure({});
  assert.deepEqual(node.size, [420, 180]);
});

test("duration, connections, and resume edits redraw the current estimate immediately", () => {
  const env = setup();
  const node = new Node();
  env.extension.nodeCreated(node);
  assert.match(badge(node), /\$0\.75/);
  const duration = node.widgets.find(w => w.name === "duration");
  duration.value = 8;
  duration.callback(8);
  assert.match(badge(node), /\$1\.20/);
  node.inputs.push({ name: "duration", link: 0 });
  node.onConnectionsChange();
  assert.equal(badge(node), "$0.15/s");
  const resume = node.widgets.find(w => w.name === "resume_request_id");
  resume.value = "existing"; resume.callback("existing");
  assert.equal(badge(node), "Resume request");
});

test("serialization preserves later widgets whether LiteGraph includes or skips transient values", () => {
  const env = setup(); const node = new Node(); env.extension.nodeCreated(node);
  node.addWidget("text", "another_extension_value", "keep-me");
  const legacy = { widgets_values: node.widgets.map(w => w.value) };
  assert.deepEqual(legacy.widgets_values, ["Prompt", 5, true, "", "keep-me"]);
  const modern = { widgets_values: node.widgets.filter(w => w.serialize !== false).map(w => w.value) };
  assert.deepEqual(modern.widgets_values, ["Prompt", 5, true, "", "keep-me"]);
});

test("preserves the backend submission quote across request ID assignment and editable input changes", () => {
  const env = setup(); const node = new Node(); env.extension.nodeCreated(node);
  const emit = detail => env.handlers.get("runcomfy.status")({ detail: { node_id: "12", ...detail } });
  emit({ state: "submitting", request_id: null, quote: executionQuote });
  assert.equal(badge(node), "$0.57/s · ~$2.85/Run");
  emit({ state: "submitted", request_id: "new-request" });
  assert.equal(badge(node), "$0.57/s · ~$2.85/Run");
  node.widgets[1].value = 8; node.widgets[1].callback(8);
  assert.equal(badge(node), "$0.57/s · ~$2.85/Run");
  node.inputs.push({ name: "duration", link: 1 }); node.onConnectionsChange();
  assert.equal(badge(node), "$0.57/s · ~$2.85/Run");
  emit({ state: "completed", request_id: "new-request", cost_usd: 2.7, quote: executionQuote });
  assert.equal(badge(node), "$0.15/s");
  node.inputs.pop(); node.onConnectionsChange();
  assert.equal(badge(node), "$0.15/s · ~$1.20/Run");
  assert.doesNotMatch(JSON.stringify({ properties: node.properties, widgets_values: node.widgets.map(w => w.value) }), /new-request|2.85|2.7|quote/);
});

test("a failed new submission discards the previous request's quote", () => {
  const env = setup(); const node = new Node(); env.extension.nodeCreated(node);
  const emit = detail => env.handlers.get("runcomfy.status")({ detail: { node_id: "12", ...detail } });
  emit({ state: "running", request_id: "old", quote: executionQuote });
  assert.equal(badge(node), "$0.57/s · ~$2.85/Run");
  emit({ state: "error", request_id: null, message: "price unavailable" });
  emit({ state: "running", request_id: "new", prompt_id: "next-prompt" });
  assert.equal(badge(node), "$0.15/s · ~$0.75/Run");
});

test("account switches discard the old quote and ignore late events from the prior account", () => {
  const env = setup(); const node = new Node(); env.extension.nodeCreated(node);
  const emit = detail => env.handlers.get("runcomfy.status")({ detail: { node_id: "12", ...detail } });
  emit({ state: "running", request_id: "old-account", quote: executionQuote });
  assert.equal(badge(node), "$0.57/s · ~$2.85/Run");
  env.client.state = { ...env.client.state, accountRevision: 1 }; env.update();
  assert.equal(badge(node), "$0.15/s · ~$0.75/Run");
  emit({ state: "running", request_id: "old-account", quote: executionQuote });
  assert.equal(badge(node), "$0.15/s · ~$0.75/Run");
  emit({ state: "submitting", request_id: null, quote: executionQuote });
  assert.equal(badge(node), "$0.57/s · ~$2.85/Run");
});

test("removed nodes release subscriptions while one scoped router survives workflow changes", async () => {
  const env = setup(); const node = new Node();
  let originalCalls = 0;
  const original = () => originalCalls++;
  node.widgets[1].callback = original;
  env.extension.nodeCreated(node);
  env.extension.loadedGraphNode(node);
  assert.ok(env.refreshes > 0);
  node.onRemoved();
  assert.equal(env.subscribers, 0);
  assert.equal(env.handlers.size, 6);
  assert.equal(node.widgets[1].callback, original);
  node.onAdded();
  await tick();
  assert.equal(env.subscribers, 1);
  assert.equal(node.widgets.filter(w => w.name === "runcomfy_pricing").length, 0);
  node.widgets[1].callback(7);
  assert.equal(originalCalls, 1);
});
