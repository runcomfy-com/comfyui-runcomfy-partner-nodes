/** Execution IDs are paths, not graph-local node IDs. No transport or queue calls. */
export function resolveExecutionNode(root, executionId) {
  const parts = String(executionId ?? "").split(":");
  if (!parts.length || parts.some(part => !/^\d+$/.test(part))) return null;
  let graph = root, node;
  for (let index = 0; index < parts.length; index++) {
    node = graph?.getNodeById?.(parts[index])
      ?? (graph?.nodes ?? graph?._nodes ?? []).find(item => String(item.id) === parts[index]);
    if (!node) return null;
    if (index < parts.length - 1) graph = node.subgraph;
  }
  return node ?? null;
}

export function createExecutionRouter({ getRoot, onRecord, limit = 100 }) {
  const prompts = new Map(), records = new Map();
  let sequence = 0;
  const trim = map => { while (map.size > limit) map.delete(map.keys().next().value); };
  const dispatch = record => {
    const root = getRoot();
    if (!root || String(root.id) !== record.workflow_id) return;
    const node = resolveExecutionNode(root, record.node_id);
    if (node) onRecord(node, record);
  };
  return {
    get sequence() { return sequence; },
    start(payload) {
      if (typeof payload?.prompt_id !== "string" || !payload.prompt_id) return;
      if (!prompts.has(payload.prompt_id)) prompts.set(payload.prompt_id, { sequence: ++sequence, ended: false });
      trim(prompts);
    },
    end(payload, reason = "ended") {
      const prompt = prompts.get(payload?.prompt_id);
      if (!prompt) return;
      prompt.ended = true;
      for (const [key, record] of records) {
        if (record.prompt_id !== payload.prompt_id || terminal(record.state)) continue;
        const local = reason === "interrupted" ? "Local execution stopped."
          : reason === "error" ? "The local workflow ended with an error."
          : "The local workflow ended before a final RunComfy status was received.";
        const recovery = record.request_id ? "Resume this request to check its result."
          : "Check RunComfy Generations before submitting again.";
        const stopped = { ...record, state: "stopped", message: `${local} Remote completion or cancellation is not confirmed; the request may still be running and charged. ${recovery}` };
        records.set(key, stopped); dispatch(stopped);
      }
    },
    receive(payload, { cached = false } = {}) {
      if (!payload || typeof payload.workflow_id !== "string" || !payload.workflow_id
        || typeof payload.prompt_id !== "string" || typeof payload.node_id !== "string") return false;
      const prompt = prompts.get(payload.prompt_id);
      if (!prompt) return false;
      const key = `${payload.workflow_id}\0${payload.node_id}\0${payload.model_id ?? payload.quote?.model_id ?? ""}`;
      const previous = records.get(key);
      if (previous && previous.sequence > prompt.sequence) return false;
      // Sibling async nodes can finish bounded remote cancellation after ComfyUI
      // announces execution_interrupted. Accept only final outcomes for an
      // execution already observed in this prompt, never a new request or run.
      if (prompt.ended && !(cached && payload.state === "completed")
        && (!previous || previous.prompt_id !== payload.prompt_id || !terminal(payload.state)
          || (previous.request_id && payload.request_id !== previous.request_id))) return false;
      // Preserve terminal states against delayed in-flight polling events.
      if (previous?.prompt_id === payload.prompt_id && terminal(previous.state)
        && (!terminal(payload.state) || (previous.state !== "stopped" && previous.state !== payload.state))) return false;
      const record = { ...(previous?.prompt_id === payload.prompt_id ? previous : {}), ...payload, cached, sequence: prompt.sequence };
      records.delete(key); records.set(key, record); trim(records);
      dispatch(record);
      return true;
    },
    restore() { for (const record of records.values()) dispatch(record); },
  };
}

/** Cached UI embeds the original run's IDs. Resolve the current prompt on the
 * server before associating that result with any workflow or graph node. */
export function createExecutedHandler({ router, fetchScope, models }) {
  const scopes = new Map();
  async function scopeFor(promptId) {
    if (!scopes.has(promptId)) {
      scopes.set(promptId, Promise.resolve().then(() => fetchScope(promptId)).catch(() => null));
      while (scopes.size > 100) scopes.delete(scopes.keys().next().value);
    }
    return scopes.get(promptId);
  }
  return async detail => {
    if (typeof detail?.prompt_id !== "string" || !detail.prompt_id || detail.node == null) return;
    const nodeId = String(detail.node);
    for (const payload of detail.output?.runcomfy ?? []) {
      if (payload?.prompt_id === detail.prompt_id && payload.node_id === nodeId) {
        router.receive(payload);
        continue;
      }
      if (payload?.state !== "completed" || typeof payload.request_id !== "string") continue;
      const scope = await scopeFor(detail.prompt_id);
      const model = models[scope?.nodes?.[nodeId]];
      if (!scope || scope.prompt_id !== detail.prompt_id || typeof scope.workflow_id !== "string" || !scope.workflow_id
        || !model || model.modelId !== payload.model_id) continue;
      router.receive({ ...payload, prompt_id: detail.prompt_id, workflow_id: scope.workflow_id, node_id: nodeId,
        message: "Cached result reused. No new RunComfy request was submitted by this node.", cached: true }, { cached: true });
    }
  };
}

export const terminal = state => ["completed", "error", "failed", "cancelled", "interrupted", "timeout", "stopped"].includes(state);

const widget = (node, name) => node.widgets?.find(item => item.name === name);
const connected = (node, name) => node.inputs?.some(input => input.name === name && input.link != null);
function setWidget(node, name, value) {
  const target = widget(node, name);
  if (!target) return false;
  target.value = value; target.callback?.(value); return true;
}
function fixedControl(node) {
  for (const item of node.widgets ?? []) {
    if (item.name === "control_after_generate" || item.name?.endsWith("_control_after_generate")) {
      item.value = "fixed"; item.callback?.("fixed");
    }
  }
}

export function assertManualQueue(app) {
  const mode = app?.extensionManager?.queueSettings?.mode;
  if ((mode != null && mode !== "disabled") || app?.ui?.autoQueueEnabled === true) {
    throw new Error("Turn off Run on Change / Run Instant before preparing recovery or a new generation. This prevents an automatic paid generation.");
  }
}

export function prepareRecovery(node, requestId, app) {
  assertManualQueue(app);
  const id = String(requestId ?? "").trim();
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(id)) throw new Error("Enter the existing RunComfy request ID.");
  if (connected(node, "resume_request_id")) throw new Error("Disconnect the resume request input before changing it here.");
  if (!widget(node, "resume_request_id")) throw new Error("Reload the node to enable recovery.");
  node.graph?.beforeChange?.();
  setWidget(node, "resume_request_id", id); fixedControl(node);
  node.graph?.afterChange?.(); node.setDirtyCanvas?.(true, true);
}

export function prepareNewGeneration(node, app) {
  assertManualQueue(app);
  const seed = widget(node, "generation_seed") ?? widget(node, "seed");
  if (!seed) throw new Error("Reload the updated node to enable generation controls.");
  if (connected(node, "resume_request_id") || connected(node, seed.name)) {
    throw new Error("Disconnect the resume or rerun-control input before changing it here.");
  }
  const min = Number.isFinite(seed.options?.min) ? seed.options.min : 0;
  const max = Number.isFinite(seed.options?.max) ? seed.options.max : 2147483647;
  const current = Number(seed.value);
  const next = Number.isSafeInteger(current) && current >= min && current < max ? current + 1 : Math.max(0, min);
  node.graph?.beforeChange?.();
  setWidget(node, "resume_request_id", ""); setWidget(node, seed.name, next); fixedControl(node);
  node.graph?.afterChange?.(); node.setDirtyCanvas?.(true, true);
}

/** Native DOM widgets are rendered by ComfyUI rather than a canvas paint hook. */
export function createStatusWidget({ node, app, documentTarget, onChange }) {
  if (!documentTarget?.createElement || typeof node.addDOMWidget !== "function") return null;
  const el = (tag, text) => { const item = documentTarget.createElement(tag); if (text !== undefined) item.textContent = text; return item; };
  const root = el("div");
  let notice = "", lastExecutionSignature = "";
  Object.assign(root.style, { boxSizing: "border-box", width: "100%", padding: "10px", borderRadius: "6px",
    background: "var(--comfy-input-bg, #282828)", color: "var(--input-text, #eee)",
    font: "12px/1.4 Arial, sans-serif", overflowY: "auto", overflowWrap: "anywhere" });
  root.addEventListener("pointerdown", event => event.stopPropagation());
  const price = el("div"), note = el("div"), status = el("div"), history = el("div");
  status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  const label = el("label", "Existing request ID");
  const input = el("input"); input.type = "text"; input.autocomplete = "off";
  input.setAttribute("aria-label", "Existing RunComfy request ID");
  Object.assign(input.style, { boxSizing: "border-box", width: "100%", margin: "4px 0", font: "inherit" });
  label.append(input);
  const actions = el("div"); Object.assign(actions.style, { display: "flex", flexWrap: "wrap", gap: "6px" });
  const button = (text, action) => {
    const item = el("button", text); item.type = "button";
    Object.assign(item.style, { whiteSpace: "normal", font: "inherit", cursor: "pointer" });
    item.addEventListener("click", () => { try { action(); onChange(); status.textContent = notice; } catch (error) { notice = error.message; status.textContent = notice; } });
    actions.append(item); return item;
  };
  const resume = button("Resume existing request", () => {
    prepareRecovery(node, input.value, app);
    notice = "Recovery prepared. Click Run to retrieve this request; no new generation is submitted.";
  });
  const fresh = button("New generation", () => {
    prepareNewGeneration(node, app); input.value = "";
    notice = "New generation prepared. Check the price, then click Run to submit.";
  });
  const hint = el("div", "These buttons prepare the node only. Run executes it. Fixed rerun control reuses cached output when available.");
  hint.style.opacity = "0.8";
  root.append(price, note, status, history, label, actions, hint);
  const domWidget = node.addDOMWidget("runcomfy_status", "runcomfy_status", root,
    { serialize: false, hideOnZoom: false, getMinHeight: () => 250, getMaxHeight: () => 500,
      getHeight: () => 260, getValue: () => undefined, setValue() {} });
  domWidget.serialize = false; domWidget.options ??= {}; domWidget.options.serialize = false;
  domWidget.computeSize = () => [node.size?.[0] ?? 440, 250];
  const update = (view, executions = []) => {
    price.textContent = `${view.price} · ${view.estimate}`;
    note.textContent = view.note || "";
    const signature = executions.map(entry => `${entry.prompt_id}:${entry.node_id}:${entry.state}`).join("|");
    if (signature !== lastExecutionSignature) notice = "";
    lastExecutionSignature = signature;
    status.textContent = notice || (executions.length ? "" : view.status);
    history.replaceChildren();
    for (const entry of executions) {
      const row = el("div"); row.style.margin = "6px 0";
      const text = [executions.length > 1 ? `Node ${entry.node_id}` : null, entry.state, entry.message].filter(Boolean).join(" · ");
      row.append(el("div", text));
      if (typeof entry.cost_usd === "number" && Number.isFinite(entry.cost_usd)) row.append(el("div", `Reported cost: $${entry.cost_usd.toFixed(6).replace(/0+$/, "").replace(/\.$/, "")} USD`));
      if (entry.request_id) {
        const request = el("input"); request.type = "text"; request.readOnly = true; request.value = entry.request_id;
        request.setAttribute("aria-label", `RunComfy request ID ${entry.node_id}`);
        Object.assign(request.style, { width: "100%", boxSizing: "border-box", font: "inherit" });
        const use = el("button", "Use this request"); use.type = "button";
        use.addEventListener("click", () => { input.value = entry.request_id; input.focus(); });
        row.append(request, use);
      }
      history.append(row);
    }
    const running = executions.some(entry => !terminal(entry.state));
    resume.disabled = running; fresh.disabled = running;
  };
  return { update, element: root, widget: domWidget, remove: () => root.remove() };
}

/** Inject newly introduced controls without shifting old positional widget values. */
export function migrateWorkflowWidgets(graphData, schemas) {
  const visit = value => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value.nodes)) for (const node of value.nodes) {
      const schema = schemas.get(node.type);
      if (!schema || !Array.isArray(node.widgets_values)) continue;
      if (node.properties?.runcomfy_widget_schema === 2) continue;
      const legacy = schema.filter(input => input.name !== "generation_seed");
      if (node.widgets_values.length < legacy.length) continue;
      const modes = ["fixed", "increment", "decrement", "randomize"];
      let index = 0;
      const hasModernControls = schema.every(input => {
        const value = node.widgets_values[index++];
        if (input.name === "generation_seed" && typeof value !== "number") return false;
        return !input.control || modes.includes(node.widgets_values[index++]);
      });
      // Before this version, third-party widgets may follow the legacy prefix.
      // A native-looking unversioned control is ambiguous with a request ID / tail.
      if (node.widgets_values.length > legacy.length && hasModernControls) {
        throw new Error(`RunComfy cannot safely migrate ${node.type}: unversioned widget values could be old recovery fields or new rerun controls. Verify the saved fields before setting properties.runcomfy_widget_schema to 2.`);
      }
      const trailing = node.widgets_values.slice(legacy.length);
      const old = Object.fromEntries(legacy.map((input, index) => [input.name, node.widgets_values[index]]));
      node.widgets_values = schema.flatMap(input => {
        const current = Object.hasOwn(old, input.name) ? old[input.name] : input.defaultValue;
        return input.control ? [current, "fixed"] : [current];
      }).concat(trailing);
      node.properties ??= {};
      node.properties.runcomfy_widget_schema = 2;
    }
    for (const [key, child] of Object.entries(value)) if (key !== "nodes") {
      if (Array.isArray(child)) child.forEach(visit); else if (child && typeof child === "object") visit(child);
    }
  };
  visit(graphData);
}
