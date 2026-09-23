import test from "node:test";
import assert from "node:assert/strict";
import { openTokenDialog } from "../web/runcomfy-token-dialog.mjs";
import { createPriceHub } from "../web/runcomfy-client.mjs";

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
function setup(client, options = {}) {
  const elements = [];
  const body = new Element("body");
  const documentTarget = { body, createElement: tag => { const element = new Element(tag); elements.push(element); return element; } };
  let closes = 0;
  const handle = openTokenDialog({ documentTarget, client, onClose: () => closes++, ...options });
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

test("environment fallback is visible and token failures never echo error payloads", async () => {
  const env = setup({ getConfig: async () => ({ configured: true, source: "environment" }),
    saveToken: async () => { throw new Error("sensitive-token-in-upstream-error"); } });
  await tick();
  assert.match(env.status().textContent, /environment/i);
  assert.match(env.status().textContent, /save.*override/i);
  env.input().value = "sensitive-token";
  await env.form().fire("submit");
  assert.match(env.status().textContent, /could not save/i);
  assert.doesNotMatch(env.status().textContent, /sensitive-token/);
  assert.equal(env.input().value, "");
});

test("saved tokens are visibly masked without storing a placeholder as a credential", async () => {
  let saves = 0;
  const env = setup({ getConfig: async () => ({ configured: true, source: "file" }),
    saveToken: async () => { saves++; },
    clearToken: async () => ({ configured: true, source: "environment" }) });
  await tick();
  assert.equal(env.input().value, "");
  assert.match(env.input().placeholder, /••••.*saved/i);
  assert.match(env.status().textContent, /saved.*in use.*priority/i);
  await env.form().fire("submit");
  assert.equal(saves, 0);
  await env.button("Clear saved token").fire("click");
  assert.doesNotMatch(env.input().placeholder, /••••/);
  assert.match(env.status().textContent, /environment/i);
});

test("dialog stays inside its settings host and Escape closes only the token dialog", () => {
  const parent = new Element("settings");
  const env = setup({ getConfig: async () => ({ configured: false, source: "none" }) }, { parent });
  const dialog = env.elements.find(el => el.tagName === "dialog");
  assert.equal(dialog.parent, parent);
  let stopped = false;
  let prevented = false;
  dialog.handlers.get("keydown")?.({ key: "Escape",
    stopPropagation() { stopped = true; }, preventDefault() { prevented = true; } });
  assert.equal(stopped, true);
  assert.equal(prevented, true);
  assert.equal(env.closes, 1);
});

test("hosted account persistence and legacy re-entry are explained without returning credentials", async () => {
  const client = createPriceHub({ fetchApi: async () => ({ ok: true, json: async () => ({
    configured: true, source: "environment", storage_scope: "account", legacy_config_removed: true,
    token: "never-show-this-secret", owner_id: "never-show-owner-id",
  }) }) });
  const env = setup(client);
  await tick();
  const text = env.elements.map(el => el.textContent ?? "").join(" ");
  assert.match(text, /private.*account/i);
  assert.match(text, /share link.*own account/i);
  assert.match(env.status().textContent, /re-enter.*once/i);
  assert.doesNotMatch(text, /never-show/);
  const config = await client.getConfig();
  assert.deepEqual(config, { configured: true, source: "environment", storage_scope: "account", legacy_config_removed: true });
});

test("unavailable private storage is explained on initial read, without exposing server error text", async () => {
  const client = createPriceHub({ fetchApi: async () => ({ ok: false, status: 503,
    json: async () => ({ code: "private_storage_unavailable", error: "secret-error" }) }) });
  const env = setup(client);
  await tick();
  assert.match(env.status().textContent, /private account storage.*unavailable/i);
  assert.doesNotMatch(env.status().textContent, /secret-error/);
});

test("save reports the API failure safely instead of blaming the local connection", async () => {
  const cases = [
    [401, { code: "unauthorized" }, /rejected.*token.*API environment/i],
    [400, { code: "invalid_config" }, /token format/i],
    [403, null, /blocked.*request/i],
    [500, { code: "config_error" }, /file permissions/i],
    [502, { code: "network_error" }, /server could not reach RunComfy/i],
    [502, { code: "api_error" }, /RunComfy.*unavailable/i],
    [502, { code: "price_unavailable" }, /pricing.*unavailable/i],
    [500, { code: "secret-token" }, /server could not update/i],
  ];
  for (const [status, body, expected] of cases) {
    const client = createPriceHub({ fetchApi: async (_url, options) => {
      if (options.method !== "POST") return { ok: true, json: async () => ({ configured: false, source: "none" }) };
      return { ok: false, status, json: async () => {
        if (!body) throw new SyntaxError("secret-token");
        return { ...body, error: "secret-token" };
      } };
    } });
    const env = setup(client);
    await tick();
    env.input().value = "secret-token";
    await env.form().fire("submit");
    assert.match(env.status().textContent, expected);
    assert.doesNotMatch(env.status().textContent, /secret-token/);
    assert.equal(env.input().value, "");
    assert.equal(env.button("Save token").disabled, false);
    env.handle.close();
  }
});

test("clear distinguishes filesystem errors from connection failures", async () => {
  const client = createPriceHub({ fetchApi: async (_url, options) => options.method === "DELETE"
    ? { ok: false, status: 500, json: async () => ({ code: "config_error", error: "secret-token" }) }
    : { ok: true, json: async () => ({ configured: true, source: "file" }) } });
  const env = setup(client);
  await tick();
  await env.button("Clear saved token").fire("click");
  assert.match(env.status().textContent, /could not clear.*file permissions/i);
  assert.doesNotMatch(env.status().textContent, /secret-token/);
});
