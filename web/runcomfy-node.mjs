import { createPriceHub, describePricing, normalizeExecutionQuote } from "./runcomfy-client.mjs";
import { openTokenDialog } from "./runcomfy-token-dialog.mjs";
import { MODELS } from "./runcomfy-models.mjs";
import { createExecutionRouter, createExecutedHandler, createStatusWidget, migrateWorkflowWidgets } from "./runcomfy-status.mjs";

export const NODE_CLASS = "RunComfySeedance25I2V1080p";
const BODY = "#665637";
const TITLE = "#443522";

function chain(target, name, after) {
  const original = target[name];
  target[name] = function (...args) {
    const result = original?.apply(this, args);
    after.apply(this, args);
    return result;
  };
}

function textFit(ctx, text, width) {
  let output = String(text ?? "");
  if (ctx.measureText(output).width <= width) return output;
  while (output.length && ctx.measureText(`${output}…`).width > width) output = output.slice(0, -1);
  return `${output}…`;
}

function drawBadge(ctx, node, view) {
  if (node.flags?.collapsed) return;
  // Keep ComfyUI's source / ID badges away from the price at the top right.
  if (node.badges?.length && node.badgePosition !== "top-left") {
    node.badgePosition = "top-left";
    node.setDirtyCanvas?.(true, true);
  }
  ctx.save();
  ctx.font = "600 12px Arial, sans-serif";
  const width = Math.min(ctx.measureText(view.badge).width + 34, node.size[0]);
  const x = node.size[0] - width;
  const y = -54;
  ctx.fillStyle = "#96712f";
  ctx.beginPath();
  ctx.roundRect(x, y, width, 23, 5);
  ctx.fill();
  // Two small gold coins, matching the visual language of Comfy's cost badge.
  ctx.strokeStyle = "#f1d079";
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.ellipse(x + 11, y + 13, 3.1, 4, -0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(x + 16, y + 9, 3.1, 4, -0.45, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  ctx.fillText(textFit(ctx, view.badge, width - 30), x + 25, y + 12);
  ctx.restore();
}

export function installRunComfyExtension({ app, api, client, priceHub,
  documentTarget = globalThis.document }) {
  const hub = priceHub ?? (client ? null : createPriceHub({
    fetchApi: (...args) => api.fetchApi(...args), documentTarget,
  }));
  const accountClient = client ?? hub;
  const runtime = new WeakMap();
  const active = new Set();
  const schemas = new Map();
  let dialog = null;
  const widgetValue = (node, name) => node.widgets?.find(w => w.name === name)?.value;
  const connected = (node, name) => node.inputs?.some(input => input.name === name && input.link != null) ?? false;
  const applyAppearance = node => {
    // Saved workflows from the first version may still carry these retired ports.
    if ((node.comfyClass ?? node.type) === NODE_CLASS) {
      for (let index = (node.outputs?.length ?? 0) - 1; index > 0; index--) {
        if (['video_url', 'request_id'].includes(node.outputs[index].name)) node.removeOutput(index);
      }
    }
    node.color = TITLE;
    node.bgcolor = BODY;
    node.boxcolor = '#999999';
    node.badgePosition = 'top-left';
    const widget = node.widgets?.find(item => item.name === 'resume_request_id');
    if (widget) {
      widget.hidden = true;
      widget.computeSize = () => [0, -4];
    }
  };
  const fitSize = node => {
    const size = node.computeSize?.() ?? node.size;
    const width = Math.max(440, node.size[0], size[0]);
    const slotHeight = globalThis.LiteGraph?.NODE_SLOT_HEIGHT ?? 20;
    const widgetHeight = globalThis.LiteGraph?.NODE_WIDGET_HEIGHT ?? 20;
    const nativeInputs = node.inputs?.filter(input => !input.widget).length ?? 0;
    const rows = Math.max(1, nativeInputs, node.outputs?.length ?? 0);
    let contentHeight = (node.constructor?.slot_start_y ?? 0) + rows * slotHeight + 14;
    for (const widget of node.widgets ?? []) {
      if (widget.hidden || widget.options?.hidden || widget.type === "hidden"
        || node.isWidgetVisible?.(widget) === false) continue;
      const measured = widget.computeSize?.(width)?.[1] ?? widget.computeLayoutSize?.(node)?.minHeight;
      if (typeof measured === "number" && measured < 0) continue;
      let height = Number.isFinite(measured) ? measured : widgetHeight;
      if (["customtext", "textarea"].includes(widget.type) || widget.options?.multiline) {
        // DOM textareas include top/bottom margins in their allocated widget height.
        const margin = widget.margin ?? widget.options?.margin ?? 10;
        height = Math.max(height, 140 + 2 * margin);
      }
      contentHeight += height + 4;
    }
    node.setSize?.([width, Math.max(260, size[1], contentHeight)]);
  };

  function syncAccount(data) {
    const revision = data.client.state.accountRevision ?? 0;
    const scope = data.client.state.quote?.account_scope;
    const hasScope = typeof scope === "string" && scope.length > 0;
    const scopeChanged = hasScope && data.accountScope !== null && data.accountScope !== scope;
    const revisionChanged = data.accountRevision !== revision;
    const authenticationLost = data.client.state.phase === "configure";
    // Transient price failures retain account identity for execution events. Token
    // changes and authentication failures revoke it until a fresh quote arrives.
    if (revisionChanged || authenticationLost) data.accountScope = null;
    if (hasScope && !authenticationLost && !data.client.state.changingToken) data.accountScope = scope;
    if (!revisionChanged && !scopeChanged && !authenticationLost) return;
    data.minimumSequence = router.sequence + 1;
    if (data.execution?.request_id) data.ignoredRequestIds.add(data.execution.request_id);
    data.execution = null;
    data.executions.clear();
    data.awaitingNewExecution = true;
    data.accountRevision = revision;
  }

  function render(node) {
    const data = runtime.get(node);
    if (!data) return;
    syncAccount(data);
    data.view = describePricing(data.client.state, {
      model: data.model,
      duration: widgetValue(node, "duration"), durationConnected: connected(node, "duration"),
      resumeRequestId: widgetValue(node, "resume_request_id"), resumeConnected: connected(node, "resume_request_id"),
      execution: data.execution,
    });
    data.statusWidget?.update(data.view, [...data.executions.values()]);
    node.setDirtyCanvas?.(true, true);
  }

  function receive(node, payload) {
    const data = runtime.get(node);
    if (!data || !payload || typeof payload !== "object") return;
    if ((payload.model_id !== undefined && payload.model_id !== data.model.modelId)
      || (payload.quote?.model_id !== undefined && payload.quote.model_id !== data.model.modelId)) return;
    syncAccount(data);
    if (payload.sequence < data.minimumSequence) return;
    const transientPriceFailure = ["loading", "unavailable"].includes(data.client.state.phase);
    const currentScope = data.client.state.quote?.account_scope ?? (transientPriceFailure ? data.accountScope : null);
    const eventScopes = [payload.account_scope, payload.quote?.account_scope].filter(scope => scope !== undefined);
    // A fresh quote establishes the scope; transient pricing errors do not revoke it.
    if (eventScopes.length && (!currentScope || eventScopes.some(scope => scope !== currentScope))) return;
    const selectedRequest = String(widgetValue(node, "resume_request_id") ?? "").trim();
    const deliberateResume = payload.state === "resuming"
      && (selectedRequest === payload.request_id || connected(node, "resume_request_id"));
    // A cache hit has no validating/submitting event. Its current execution
    // scope was checked server-side, and a fresh account quote must also match.
    const verifiedCached = payload.cached === true && payload.state === "completed"
      && typeof payload.request_id === "string" && !!payload.request_id
      && typeof currentScope === "string" && !!currentScope && eventScopes.length > 0;
    if (data.client.state.changingToken) {
      if (payload.request_id) data.ignoredRequestIds.add(payload.request_id);
      return;
    }
    if (data.awaitingNewExecution) {
      const starting = !payload.request_id && ["validating", "uploading", "submitting"].includes(payload.state);
      if (!starting && !deliberateResume && !verifiedCached) {
        if (payload.request_id) data.ignoredRequestIds.add(payload.request_id);
        return;
      }
      data.awaitingNewExecution = false;
    }
    if (data.ignoredRequestIds.has(payload.request_id)) {
      if (!deliberateResume) return;
      data.ignoredRequestIds.delete(payload.request_id);
    }
    const priorExecution = data.executions.get(payload.node_id) ?? data.execution;
    const newRequest = payload.request_id === null
      || (payload.request_id && priorExecution?.request_id && payload.request_id !== priorExecution.request_id)
      || ["submitting", "uploading", "validating", "resuming"].includes(payload.state);
    const previous = newRequest ? {} : priorExecution ?? {};
    // Execution data stays in the WeakMap, never node properties.
    data.execution = { ...previous };
    for (const key of ["state", "request_id", "message"]) {
      if (typeof payload[key] === "string") data.execution[key] = payload[key];
    }
    if (Object.hasOwn(payload, "quote")) data.execution.quote = normalizeExecutionQuote(payload.quote, data.model);
    if (typeof payload.cost_usd === "number" && Number.isFinite(payload.cost_usd) && payload.cost_usd >= 0) {
      data.execution.cost_usd = payload.cost_usd;
    }
    if (payload.node_id) data.executions.set(payload.node_id, { ...payload, ...data.execution });
    render(node);
  }

  const router = createExecutionRouter({ getRoot: () => app.rootGraph ?? app.graph,
    onRecord: (node, payload) => { if (active.has(node)) receive(node, payload); } });
  const executed = createExecutedHandler({ router, models: MODELS, fetchScope: async promptId => {
    const response = await api.fetchApi(`/runcomfy/execution-scope?prompt_id=${encodeURIComponent(promptId)}`, { cache: "no-store" });
    return response.ok ? response.json() : null;
  } });
  const listeners = {
    "runcomfy.status": event => router.receive(event.detail),
    execution_start: event => router.start(event.detail),
    execution_success: event => router.end(event.detail, "success"),
    execution_error: event => router.end(event.detail, "error"),
    execution_interrupted: event => router.end(event.detail, "interrupted"),
    executed: event => { void executed(event.detail); },
  };
  // One extension-level listener set survives switching to workflows without RunComfy nodes.
  // The router retains only bounded, scoped records and never retains graph nodes.
  for (const [name, listener] of Object.entries(listeners)) api.addEventListener(name, listener);

  function subscribe(node) {
    const data = runtime.get(node);
    if (data.unsubscribe) return;
    active.add(node);
    data.unsubscribe = data.client.subscribe(() => {
      render(node);
      if (data.client.state.phase === "ready") router.restore();
    });
    wrapInputs(node);
  }

  function wrapInputs(node) {
    const data = runtime.get(node);
    for (const widget of node.widgets ?? []) {
      const name = widget.name;
      if (!widget || data.inputCallbacks.some(item => item.widget === widget && item.wrapper === widget.callback)) continue;
      const original = widget.callback;
      const wrapper = function (...args) {
        const result = original?.apply(this, args);
        if (name === "resume_request_id" && String(widget.value ?? "").trim() !== data.execution?.request_id) {
          data.execution = null;
        }
        render(node);
        return result;
      };
      data.inputCallbacks.push({ widget, original, wrapper });
      widget.callback = wrapper;
    }
  }

  function detach(node) {
    const data = runtime.get(node);
    if (!data) return;
    data.unsubscribe?.();
    data.unsubscribe = null;
    for (const { widget, original, wrapper } of data.inputCallbacks) {
      if (widget.callback === wrapper) widget.callback = original;
    }
    data.inputCallbacks = [];
    active.delete(node);
  }

  function attach(node) {
    const model = MODELS[node.comfyClass ?? node.type];
    if (!model) return;
    if (runtime.has(node)) { subscribe(node); return; }
    applyAppearance(node);
    const modelClient = client ?? hub.forModel(model);
    const data = { model, client: modelClient, execution: null, executions: new Map(), minimumSequence: 0, awaitingNewExecution: false,
      unsubscribe: null, inputCallbacks: [], view: null,
      accountRevision: modelClient.state.accountRevision ?? 0, accountScope: null, ignoredRequestIds: new Set() };
    runtime.set(node, data);
    chain(node, "onSerialize", function (serialized) {
      serialized.properties ??= {};
      serialized.properties.runcomfy_widget_schema = 2;
    });
    // Native rerun controls start fixed; a saved workflow can restore randomize in onConfigure.
    for (const item of node.widgets ?? []) {
      if (item.name === "control_after_generate" || item.name?.endsWith("_control_after_generate")) item.value = "fixed";
    }
    data.statusWidget = createStatusWidget({ node, app, documentTarget, onChange: () => {
      data.execution = null;
      render(node);
    } });
    chain(node, "onDrawForeground", function (ctx) { if (data.view) drawBadge(ctx, this, data.view); });
    chain(node, "onConnectionsChange", () => render(node));
    chain(node, "onConfigure", () => {
      applyAppearance(node);
      wrapInputs(node);
      render(node);
      void data.client.refresh();
    });
    chain(node, "onRemoved", () => detach(node));
    chain(node, "onAdded", () => subscribe(node));
    subscribe(node);
    fitSize(node);
  }

  app.registerExtension({
    name: "RunComfy.Seedance25I2V1080p",
    settings: [{
      id: "RunComfy.Account.APIToken", name: "API Token", category: ["RunComfy", "Account", "API Token"],
      defaultValue: null, telemetry: { trackChanges: false },
      tooltip: "Connect your RunComfy account. Your token is stored securely on this ComfyUI server.",
      type: () => {
        const button = documentTarget.createElement("button");
        button.textContent = "Configure account";
        Object.assign(button.style, { background: "#333", color: "#eee", border: "1px solid #666",
          borderRadius: "5px", padding: "7px 14px", font: "inherit", cursor: "pointer" });
        button.addEventListener("click", () => {
          if (dialog) { dialog.focus(); return; }
          dialog = openTokenDialog({ documentTarget, client: accountClient, onClose: () => { dialog = null; } });
        });
        return button;
      },
    }],
    beforeRegisterNodeDef(nodeType, nodeData) {
      if (!Object.hasOwn(MODELS, nodeData.name)) return;
      const inputs = [];
      for (const section of ["required", "optional"]) {
        for (const [name, [type, options = {}]] of Object.entries(nodeData.input?.[section] ?? {})) {
          if (options.forceInput || !(Array.isArray(type) || ["STRING", "INT", "FLOAT", "BOOLEAN", "COMBO"].includes(type))) continue;
          inputs.push({ name, defaultValue: options.default ?? (Array.isArray(type) ? type[0] : ""), control: !!options.control_after_generate });
        }
      }
      schemas.set(nodeData.name, inputs);
    },
    beforeConfigureGraph(graphData) { migrateWorkflowWidgets(graphData, schemas); },
    afterConfigureGraph() { router.restore(); },
    nodeCreated: attach,
    loadedGraphNode(node) {
      attach(node);
      const data = runtime.get(node);
      if (data) { applyAppearance(node); render(node); void data.client.refresh(); }
    },
  });
}
