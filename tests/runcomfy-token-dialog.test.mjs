import test from "node:test";
import assert from "node:assert/strict";
import { openTokenDialog } from "../web/runcomfy-token-dialog.mjs";

const tick = () => new Promise(resolve => setImmediate(resolve));
class Element {
  children = [];
  handlers = new Map();
  value = "";
  style = {};
  constructor(tag) { this.tagName = tag; }
  append(...children) { this.children.push(...children); for (const child of children) child.parent = this; }
  addEventListener(name, handler) { this.handlers.set(name, handler); }
  setAttribute(name, value) { this[name] = value; }
  showModal() { this.open = true; }
  close() { this.open = false; this.handlers.get("close")?.(); }
  remove() { this.removed = true; }
  focus() { this.focused = true; }
  fire(name) { return this.handlers.get(name)?.({ preventDefault() {} }); }
}
function setup(client) {
  const elements = [];
  const body = new Element("body");
  const documentTarget = { body, createElement: tag => { const element = new Element(tag); elements.push(element); return element; } };
  let closes = 0;
  const handle = openTokenDialog({ documentTarget, client, onClose: () => closes++ });
  return { elements, handle, body, get closes() { return closes; },
    input: () => elements.find(el => el.tagName === "input"),
    status: () => elements.find(el => el.role === "status"),
    button: text => elements.find(el => el.tagName === "button" && el.textContent === text),
    form: () => elements.find(el => el.tagName === "form") };
}

test("token is a transient password field erased as soon as save starts", async () => {
  let resolveSave;
  let saved;
  const env = setup({ getConfig: async () => ({ configured: false, source: "none" }),
    saveToken: token => { saved = token; return new Promise(resolve => { resolveSave = resolve; }); } });
  await tick();
  assert.equal(env.input().type, "password");
  assert.equal(env.input().autocomplete, "new-password");
  env.input().value = "private-token";
  const saving = env.form().fire("submit");
  assert.equal(saved, "private-token");
  assert.equal(env.input().value, "");
  resolveSave({ configured: true, source: "file" });
  await saving;
  assert.match(env.status().textContent, /saved/i);
  assert.equal(env.elements.some(el => String(el.textContent).includes("private-token")), false);
  env.handle.close();
  assert.equal(env.closes, 1);
  assert.equal(env.body.children[0].removed, true);
});

test("closing erases unsaved tokens and clearing uses the client deletion operation", async () => {
  let deleted = 0;
  const env = setup({ getConfig: async () => ({ configured: true, source: "file" }),
    clearToken: async () => { deleted++; return { configured: false, source: "none" }; } });
  await tick();
  env.input().value = "unsaved";
  await env.button("Clear saved token").fire("click");
  assert.equal(deleted, 1);
  assert.equal(env.input().value, "");
  assert.match(env.status().textContent, /cleared/i);
  env.input().value = "another-unsaved";
  env.handle.close();
  assert.equal(env.input().value, "");
  assert.equal(env.closes, 1);
});

test("environment precedence is visible and token failures never echo error payloads", async () => {
  const env = setup({ getConfig: async () => ({ configured: true, source: "environment" }),
    saveToken: async () => { throw new Error("sensitive-token-in-upstream-error"); } });
  await tick();
  assert.match(env.status().textContent, /environment.*priority/i);
  env.input().value = "sensitive-token";
  await env.form().fire("submit");
  assert.match(env.status().textContent, /could not save/i);
  assert.doesNotMatch(env.status().textContent, /sensitive-token/);
  assert.equal(env.input().value, "");
});
