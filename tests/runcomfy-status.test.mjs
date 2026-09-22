import test from 'node:test';
import assert from 'node:assert/strict';
import { createExecutionRouter, createExecutedHandler, resolveExecutionNode, prepareRecovery, prepareNewGeneration,
  createStatusWidget, migrateWorkflowWidgets } from '../web/runcomfy-status.mjs';

function routing() {
  const rootNode = { id: 12 }, nested = { id: 12 };
  const shared = { id: 'shared-definition', nodes: [nested] };
  let root = { id: 'workflow-a', nodes: [rootNode, { id: 1, subgraph: shared }, { id: 2, subgraph: shared }] };
  const seen = [];
  const router = createExecutionRouter({ getRoot: () => root, onRecord: (node, record) => seen.push({ node, record }) });
  router.start({ prompt_id: 'first' });
  const emit = payload => router.receive({ workflow_id: 'workflow-a', prompt_id: 'first', node_id: '1:12',
    model_id: 'test-model', state: 'processing', ...payload });
  return { rootNode, nested, router, seen, emit, root, setRoot: value => { root = value; } };
}

test('full execution paths distinguish root collisions and repeated subgraph occurrences', () => {
  const env = routing();
  env.emit({ node_id: '1:12', request_id: 'nested-one' });
  env.emit({ node_id: '2:12', request_id: 'nested-two' });
  env.emit({ node_id: '12', request_id: 'root' });
  assert.deepEqual(env.seen.map(item => [item.node === env.nested, item.record.node_id, item.record.request_id]),
    [[true, '1:12', 'nested-one'], [true, '2:12', 'nested-two'], [false, '12', 'root']]);
  assert.equal(resolveExecutionNode(env.root, '3:12'), null);
  assert.equal(resolveExecutionNode(env.root, '1:12:5'), null);
});

test('workflow switching never routes same-path events to a different document and restores matching history', () => {
  const env = routing(), otherNode = { id: 12 };
  env.setRoot({ id: 'workflow-b', nodes: [otherNode] });
  env.emit({ node_id: '12', state: 'completed', request_id: 'a-request', cost_usd: 0.7 });
  assert.equal(env.seen.length, 0);
  env.router.restore(); assert.equal(env.seen.length, 0);
  env.setRoot(env.root); env.router.restore();
  assert.equal(env.seen[0].node, env.rootNode);
  assert.equal(env.seen[0].record.cost_usd, 0.7);
});

test('unknown, ended, stale and unscoped prompts cannot overwrite a current execution', () => {
  const env = routing();
  assert.equal(env.emit({ prompt_id: 'unknown' }), false);
  assert.equal(env.emit({ workflow_id: null }), false);
  assert.equal(env.emit({ prompt_id: null }), false);
  env.emit({ request_id: 'old' });
  env.router.start({ prompt_id: 'second' });
  env.emit({ prompt_id: 'second', request_id: 'new' });
  assert.equal(env.emit({ request_id: 'old', state: 'completed' }), false);
  env.emit({ prompt_id: 'second', request_id: 'new', state: 'completed' });
  assert.equal(env.emit({ prompt_id: 'second', state: 'processing' }), false);
  env.router.end({ prompt_id: 'second' });
  assert.equal(env.emit({ prompt_id: 'second', state: 'error' }), false);
  assert.equal(env.seen.at(-1).record.state, 'completed');
});

test('parallel cancellation accepts a known sibling terminal outcome after the prompt interruption', () => {
  const env = routing();
  env.emit({ node_id: '1:12', request_id: 'first-request' });
  env.emit({ node_id: '2:12', request_id: 'sibling-request' });
  env.emit({ node_id: '1:12', request_id: 'first-request', state: 'interrupted', message: 'Queued request cancelled.' });
  env.router.end({ prompt_id: 'first' }, 'interrupted');
  const provisional = env.seen.at(-1).record;
  assert.equal(provisional.node_id, '2:12'); assert.equal(provisional.state, 'stopped');
  assert.match(provisional.message, /Remote completion or cancellation is not confirmed/);
  assert.match(provisional.message, /may still be running and charged/);
  assert.equal(env.emit({ node_id: '2:12', request_id: 'sibling-request', state: 'interrupted',
    message: 'The remote request is already running and may be charged.' }), true);
  assert.equal(env.seen.at(-1).record.state, 'interrupted');
  assert.match(env.seen.at(-1).record.message, /already running/);
  assert.equal(env.emit({ node_id: '2:12', request_id: 'sibling-request', state: 'processing' }), false);
});

test('late ended-prompt outcomes reject unknown executions, changed requests and newer prompt collisions', () => {
  const env = routing();
  env.emit({ request_id: 'known-request' });
  env.router.end({ prompt_id: 'first' }, 'error');
  assert.equal(env.emit({ request_id: 'different-request', state: 'completed' }), false);
  assert.equal(env.emit({ node_id: '2:12', request_id: 'unknown-sibling', state: 'interrupted' }), false);
  assert.equal(env.emit({ workflow_id: 'workflow-b', request_id: 'known-request', state: 'interrupted' }), false);
  env.router.start({ prompt_id: 'second' });
  env.emit({ prompt_id: 'second', request_id: 'newer-request' });
  assert.equal(env.emit({ request_id: 'known-request', state: 'completed' }), false);
  assert.equal(env.seen.at(-1).record.request_id, 'newer-request');
});

test('local end without a remote request ID gives an honest history check instead of claiming cancellation', () => {
  const env = routing(); env.emit({ state: 'submitting', request_id: null });
  env.router.end({ prompt_id: 'first' }, 'interrupted');
  assert.equal(env.seen.at(-1).record.state, 'stopped');
  assert.match(env.seen.at(-1).record.message, /Check RunComfy Generations before submitting again/);
  assert.doesNotMatch(env.seen.at(-1).record.message, /was cancelled/);
  assert.equal(env.emit({ request_id: 'late-assigned-request', state: 'interrupted', message: 'Cancellation confirmed.' }), true);
});

test('cached result uses authoritative current prompt scope after completion, retaining original cost and request', async () => {
  const env = routing();
  env.router.start({ prompt_id: 'cached-prompt' });
  env.router.end({ prompt_id: 'cached-prompt' }, 'success');
  let calls = 0;
  const handler = createExecutedHandler({ router: env.router, models: { RunComfyTest: { modelId: 'test-model' } },
    fetchScope: async promptId => { calls++; return { prompt_id: promptId, workflow_id: 'workflow-a', nodes: { '2:12': 'RunComfyTest' } }; } });
  const detail = { prompt_id: 'cached-prompt', node: '2:12', output: { runcomfy: [{ prompt_id: 'original-prompt',
    workflow_id: 'another-original-workflow', node_id: '12', model_id: 'test-model', state: 'completed', request_id: 'paid-once', cost_usd: 0.42 }] } };
  await handler(detail); await handler(detail);
  assert.equal(calls, 1);
  const record = env.seen.at(-1).record;
  assert.equal(record.workflow_id, 'workflow-a'); assert.equal(record.prompt_id, 'cached-prompt');
  assert.equal(record.node_id, '2:12'); assert.equal(record.cost_usd, 0.42); assert.equal(record.request_id, 'paid-once');
  assert.match(record.message, /No new RunComfy request/);
});

test('cached scope never guesses the visible workflow and rejects unknown or mismatched node classes', async () => {
  const env = routing(); env.router.start({ prompt_id: 'cached-prompt' });
  env.setRoot({ id: 'unrelated-visible-workflow', nodes: [{ id: 12 }] });
  const detail = { prompt_id: 'cached-prompt', node: '12', output: { runcomfy: [{ prompt_id: 'old', workflow_id: 'old',
    node_id: '12', model_id: 'test-model', state: 'completed', request_id: 'cached-id', cost_usd: 0.42 }] } };
  const handler = createExecutedHandler({ router: env.router, models: { RunComfyTest: { modelId: 'test-model' } },
    fetchScope: async () => ({ prompt_id: 'cached-prompt', workflow_id: 'workflow-a', nodes: { '12': 'RunComfyTest' } }) });
  await handler(detail); assert.equal(env.seen.length, 0);
  env.setRoot(env.root); env.router.restore(); assert.equal(env.seen.at(-1).node, env.rootNode);
  for (const nodes of [{}, { '12': 'OtherClass' }]) {
    const count = env.seen.length;
    await createExecutedHandler({ router: env.router, models: { RunComfyTest: { modelId: 'test-model' } },
      fetchScope: async () => ({ prompt_id: 'cached-prompt', workflow_id: 'workflow-a', nodes }) })(detail);
    assert.equal(env.seen.length, count);
  }
});

function generationNode() {
  let changes = 0;
  const node = { widgets: [
    { name: 'resume_request_id', value: '' },
    { name: 'generation_seed', value: 9, options: { min: 0, max: 0xFFFFFFFFFFFFFFFF } },
    { name: 'control_after_generate', value: 'randomize' },
  ], inputs: [], graph: { beforeChange() { changes++; }, afterChange() { changes++; } }, setDirtyCanvas() {} };
  return { node, changes: () => changes };
}

test('resume only prepares an existing request with fixed control; new generation changes nonce without queueing', () => {
  const { node, changes } = generationNode();
  node.queuePrompt = () => assert.fail('must never queue');
  prepareRecovery(node, ' existing-request ');
  assert.deepEqual(node.widgets.map(widget => widget.value), ['existing-request', 9, 'fixed']);
  prepareNewGeneration(node);
  assert.deepEqual(node.widgets.map(widget => widget.value), ['', 10, 'fixed']);
  assert.equal(changes(), 4);
  node.widgets[1].value = 0xFFFFFFFFFFFFFFFF;
  prepareNewGeneration(node); assert.equal(node.widgets[1].value, 0);
});

test('connected recovery or seed inputs are left intact and invalid recovery IDs are rejected', () => {
  const { node, changes } = generationNode();
  node.inputs.push({ name: 'resume_request_id', link: 0 });
  assert.throws(() => prepareRecovery(node, 'existing'), /Disconnect/);
  assert.throws(() => prepareNewGeneration(node), /Disconnect/);
  node.inputs = [{ name: 'generation_seed', link: 0 }];
  assert.throws(() => prepareNewGeneration(node), /Disconnect/);
  assert.throws(() => prepareRecovery(node, '../unsafe'), /request ID/);
  assert.equal(changes(), 0);
});

test('automatic running blocks both preparation actions before graph hooks or widget callbacks can queue', () => {
  for (const app of [
    { extensionManager: { queueSettings: { mode: 'change' } } },
    { extensionManager: { queueSettings: { mode: 'instant' } } },
    { extensionManager: { queueSettings: { mode: 'disabled' } }, ui: { autoQueueEnabled: true } },
  ]) {
    const { node, changes } = generationNode();
    for (const item of node.widgets) item.callback = () => assert.fail('must not trigger an automatic queue listener');
    const before = node.widgets.map(item => item.value);
    assert.throws(() => prepareRecovery(node, 'existing-request', app), /Turn off Run on Change \/ Run Instant/);
    assert.throws(() => prepareNewGeneration(node, app), /Turn off Run on Change \/ Run Instant/);
    assert.deepEqual(node.widgets.map(item => item.value), before);
    assert.equal(changes(), 0);
  }
});

test('provider seed is changed by explicit New generation when no separate nonce exists', () => {
  const { node } = generationNode(); node.widgets[1].name = 'seed';
  prepareNewGeneration(node); assert.equal(node.widgets[1].value, 10);
});

class Element {
  children = []; style = {}; handlers = {}; value = ''; textContent = '';
  constructor(tag) { this.tag = tag; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = [...items]; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, handler) { this.handlers[name] = handler; }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
}
function statusUI(app) {
  const { node } = generationNode(), elements = [];
  node.size = [440, 500];
  node.addDOMWidget = (name, type, element, options) => ({ name, type, element, options });
  const ui = createStatusWidget({ node, app, documentTarget: { createElement: tag => {
    const element = new Element(tag); elements.push(element); return element;
  } }, onChange() {} });
  const view = { price: '$0.20 / image', estimate: '$0.20 estimated / image', note: '', status: 'Ready' };
  return { node, elements, ui, view };
}

test('native status widget shows price, cancellation outcome, copyable request ID and actual cost without canvas rendering', () => {
  const { ui, elements, view } = statusUI();
  ui.update(view, [{ node_id: '1:12', prompt_id: 'p', state: 'interrupted', request_id: 'existing-1', cost_usd: 0.125,
    message: 'Remote cancellation could not be confirmed. The request may still be charged.' }]);
  const text = elements.map(element => element.textContent).join('\n');
  assert.match(text, /\$0.20 \/ image/);
  assert.match(text, /cancellation could not be confirmed/);
  assert.match(text, /Reported cost: \$0.125 USD/);
  assert.ok(elements.some(element => element.readOnly && element.value === 'existing-1'));
  assert.equal(ui.widget.serialize, false);
  assert.equal(ui.widget.options.serialize, false);
  assert.equal(ui.widget.options.getValue(), undefined);
});

test('status recovery buttons prepare inputs without executing and remain disabled during active work', () => {
  const { node, ui, elements, view } = statusUI();
  ui.update(view, [{ node_id: '1', state: 'processing' }]);
  const resume = elements.find(element => element.textContent === 'Resume existing request');
  const fresh = elements.find(element => element.textContent === 'New generation');
  assert.equal(resume.disabled, true); assert.equal(fresh.disabled, true);
  ui.update(view, [{ node_id: '1', state: 'stopped', request_id: 'complete-1', message: 'Remote cancellation is not confirmed.' }]);
  assert.equal(resume.disabled, false); assert.equal(fresh.disabled, false);
  ui.update(view, [{ node_id: '1', state: 'completed', request_id: 'complete-1' }]);
  assert.equal(resume.disabled, false);
  elements.find(element => element.textContent === 'Use this request').handlers.click();
  resume.handlers.click();
  assert.equal(node.widgets[0].value, 'complete-1');
  assert.match(elements.find(element => element.role === 'status').textContent, /Recovery prepared/);
  fresh.handlers.click();
  assert.equal(node.widgets[0].value, ''); assert.equal(node.widgets[1].value, 10);
});

test('native status buttons recheck automatic running at click time and show the turnoff instruction', () => {
  const app = { extensionManager: { queueSettings: { mode: 'disabled' } } };
  const { node, ui, elements, view } = statusUI(app); ui.update(view);
  const before = node.widgets.map(item => item.value);
  app.extensionManager.queueSettings.mode = 'instant';
  elements.find(element => element['aria-label'] === 'Existing RunComfy request ID').value = 'recover-me';
  for (const name of ['Resume existing request', 'New generation']) {
    elements.find(element => element.textContent === name).handlers.click();
    assert.match(elements.find(element => element.role === 'status').textContent, /Turn off Run on Change \/ Run Instant/);
    assert.deepEqual(node.widgets.map(item => item.value), before);
  }
});

test('legacy widget migration preserves fields around provider seed and recurses into subgraph definitions', () => {
  const schemas = new Map([['Wan', [
    { name: 'prompt' }, { name: 'seed', control: true }, { name: 'resolution' }, { name: 'resume_request_id' },
  ]], ['Image', [{ name: 'prompt' }, { name: 'resume_request_id' }, { name: 'generation_seed', defaultValue: 0, control: true }]]]);
  const graph = { nodes: [{ type: 'Wan', widgets_values: ['keep prompt', 123, '1080p', 'old-request'] }],
    definitions: { subgraphs: [{ nodes: [{ type: 'Image', widgets_values: ['nested prompt', 'resume-2'] }] }] } };
  migrateWorkflowWidgets(graph, schemas);
  assert.deepEqual(graph.nodes[0].widgets_values, ['keep prompt', 123, 'fixed', '1080p', 'old-request']);
  assert.deepEqual(graph.definitions.subgraphs[0].nodes[0].widgets_values, ['nested prompt', 'resume-2', 0, 'fixed']);
  const snapshot = JSON.stringify(graph); migrateWorkflowWidgets(graph, schemas);
  assert.equal(JSON.stringify(graph), snapshot, 'modern saved controls stay untouched');
});

test('legacy migration preserves third-party tails instead of mistaking old recovery values for a native control', () => {
  const schemas = new Map([['Wan', [{ name: 'prompt' }, { name: 'seed', control: true }, { name: 'resume_request_id' }]]]);
  const graph = { nodes: [{ type: 'Wan', widgets_values: ['prompt', 42, 'old-request', 'extension-tail'] }] };
  migrateWorkflowWidgets(graph, schemas);
  assert.deepEqual(graph.nodes[0].widgets_values, ['prompt', 42, 'fixed', 'old-request', 'extension-tail']);
  assert.equal(graph.nodes[0].properties.runcomfy_widget_schema, 2);
  const ambiguous = { nodes: [{ type: 'Wan', widgets_values: ['prompt', 42, 'fixed', 'extension-tail'] }] };
  const before = JSON.stringify(ambiguous);
  assert.throws(() => migrateWorkflowWidgets(ambiguous, schemas), /cannot safely migrate/);
  assert.equal(JSON.stringify(ambiguous), before);
});
