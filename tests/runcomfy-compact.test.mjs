import test from 'node:test';
import assert from 'node:assert/strict';
import { installRunComfyExtension } from '../web/runcomfy-node.mjs';
import { describePricing } from '../web/runcomfy-client.mjs';

const quote = { model_id: 'bytedance/seedance-2.5/image-to-video/1080p', unit_price_usd: 0.57, price_unit: 'second', currency: 'USD', fetched_at: '2026-09-15T10:00:00Z' };
function setup(settingsHost = null) {
  let extension;
  const elements = [];
  const documentTarget = { body: { append() {} }, createElement(tag) {
    const el = { tag, style: {}, children: [], events: {}, append(...xs) { this.children.push(...xs); },
      replaceChildren(...xs) { this.children = xs; },
      setAttribute() {}, addEventListener(name, handler) { this.events[name] = handler; },
      closest(selector) { assert.equal(selector, 'dialog, [role="dialog"]'); return settingsHost; },
      showModal() {}, focus() {}, close() {}, remove() {} };
    elements.push(el); return el;
  } };
  const client = { state: { phase: 'ready', quote }, subscribe(fn) { fn(); return () => {}; },
    refresh() {}, getConfig: async () => ({ configured: false, source: 'none' }) };
  installRunComfyExtension({ app: { registerExtension(e) { extension = e; } },
    api: { addEventListener() {}, removeEventListener() {} }, client, documentTarget });
  const node = { comfyClass: 'RunComfySeedance25I2V1080p', id: 1, size: [460, 600], flags: {}, properties: {},
    widgets: [{ name: 'prompt', value: 'hello' }, { name: 'duration', value: 5 },
      { name: 'generate_audio', value: true }, { name: 'resume_request_id', value: '' }], inputs: [],
    addCustomWidget(w) { this.widgets.push(w); return w; },
    addDOMWidget(name, type, element, options) { const w = { name, type, element, options }; this.widgets.push(w); return w; },
    addWidget(type, name, value, callback, options) { const w = { type, name, value, callback, options }; this.widgets.push(w); return w; },
    computeSize() { return [460, 260]; }, setSize(size) { this.size = size; }, setDirtyCanvas() {} };
  extension.nodeCreated(node);
  return { node, extension, elements };
}

test('compact badge has per-second and run price without API label', () => {
  const view = describePricing({ phase: 'ready', quote }, { duration: 5 });
  assert.equal(view.badge, '$0.57/s · ~$2.85/Run');
  assert.doesNotMatch(view.badge, /API/);
});

test('native status exposes recovery without adding transient values to saved controls', () => {
  const { node, elements } = setup();
  assert.equal(node.widgets.length, 5);
  assert.equal(node.widgets.filter(w => w.type === 'button').length, 0);
  assert.ok(node.widgets[3].computeSize()[1] <= 0);
  assert.equal(node.widgets[4].name, 'runcomfy_status');
  assert.equal(node.widgets[4].serialize, false);
  assert.ok(elements.some(element => element.textContent === 'Resume existing request'));
  assert.ok(elements.some(element => element.textContent === 'New generation'));
  assert.deepEqual(node.widgets.filter(widget => widget.serialize !== false).map(w => w.value), ['hello', 5, true, '']);
  node.onConfigure({});
  assert.ok(node.size[1] < 700, 'status fits inside a bounded node layout');
});

test('token setup is a global setting action, not a persisted secret setting', () => {
  const { extension, elements } = setup();
  const setting = extension.settings.find(s => s.id === 'RunComfy.Account.APIToken');
  assert.equal(typeof setting.type, 'function');
  let stored = false;
  const button = setting.type('API Token', () => { stored = true; });
  button.events.click();
  assert.equal(stored, false);
  assert.ok(elements.some(el => el.tag === 'input' && el.type === 'password'));
});

test('account action mounts the token dialog in the enclosing Settings dialog', () => {
  let child;
  const host = { append(element) { child = element; } };
  const { extension } = setup(host);
  const button = extension.settings.find(s => s.id === 'RunComfy.Account.APIToken').type();
  assert.equal(button.type, 'button');
  button.events.click();
  assert.equal(child.tag, 'dialog');
});

test('old saved workflows drop metadata outputs while preserving their video connection', () => {
  const { node } = setup();
  node.outputs = [{ name: 'video', type: 'VIDEO', links: [12] },
    { name: 'video_url', type: 'STRING', links: null }, { name: 'request_id', type: 'STRING', links: null }];
  node.removeOutput = index => node.outputs.splice(index, 1);
  node.onConfigure({});
  assert.deepEqual(node.outputs, [{ name: 'video', type: 'VIDEO', links: [12] }]);
});

test('badge draws at the top right with an icon and no permanent detail text', () => {
  const { node } = setup();
  const rectangles = [], texts = [];
  let iconStrokes = 0;
  const ctx = { save() {}, restore() {}, beginPath() {}, fill() {}, stroke() { iconStrokes++; },
    roundRect(...args) { rectangles.push(args); }, ellipse() {}, moveTo() {}, lineTo() {},
    measureText: value => ({ width: value.length * 6 }), fillText(text, x, y) { texts.push({ text, x, y }); } };
  node.onDrawForeground(ctx);
  assert.equal(texts.length, 1);
  assert.equal(texts[0].text, '$0.57/s · ~$2.85/Run');
  assert.ok(rectangles[0][0] > 0);
  assert.equal(rectangles[0][0] + rectangles[0][2], node.size[0]);
  assert.ok(iconStrokes > 0);
});
