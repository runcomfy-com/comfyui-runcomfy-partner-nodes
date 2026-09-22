import { MODELS } from './runcomfy-models.mjs';

/** Accessible modal using ComfyUI theme tokens; no persistence, credentials, or execution. */
export function openSwitchPreview({ node, targets, definitions, api, makePlan, apply, documentTarget = globalThis.document }) {
  const el = (tag, text) => { const element = documentTarget.createElement(tag); if (text !== undefined) element.textContent = text; return element; };
  const dialog = el('dialog');
  dialog.className = 'runcomfy-switch-preview';
  dialog.setAttribute('aria-label', 'Switch to RunComfy');
  Object.assign(dialog.style, { display: 'flex', flexDirection: 'column', boxSizing: 'border-box', position: 'fixed', inset: '0', margin: 'auto', transform: 'none', color: 'var(--fg-color, #ddd)', background: 'var(--comfy-menu-bg, #222)', border: '1px solid var(--border-color, #555)', borderRadius: '10px', padding: '24px', width: '620px', maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100vh - 40px)', overflow: 'hidden', font: '14px/1.5 var(--comfy-font, sans-serif)' });
  const heading = el('h2', 'Switch to RunComfy');
  heading.style.marginTop = '0';
  const source = el('p', `From: ${definitions[node.comfyClass || node.constructor?.comfyClass || node.type]?.display_name || node.title || node.type}`);
  const label = el('label', 'RunComfy model');
  const select = el('select');
  select.setAttribute('aria-label', 'RunComfy model');
  Object.assign(select.style, { display: 'block', width: '100%', padding: '8px', margin: '6px 0 16px', color: 'inherit', background: 'var(--comfy-input-bg, #333)', border: '1px solid var(--border-color, #555)' });
  for (const target of targets) { const option = el('option', definitions[target]?.display_name || target); option.value = target; select.append(option); }
  select.value = targets[0];
  label.append(select);
  const account = el('p', 'Checking RunComfy account configuration…');
  const price = el('p', 'Loading RunComfy pricing…');
  account.setAttribute('role', 'status'); price.setAttribute('role', 'status');
  const details = el('div'), errors = el('div');
  errors.setAttribute('role', 'alert');
  const body = el('div'); Object.assign(body.style, { overflowY: 'auto', minHeight: '0', flex: '1 1 auto', paddingRight: '4px' });
  const actions = el('div'); Object.assign(actions.style, { flexShrink: '0', display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' });
  const cancel = el('button', 'Cancel'), commit = el('button', 'Switch');
  for (const button of [cancel, commit]) { button.type = 'button'; button.className = 'comfy-btn'; Object.assign(button.style, { padding: '8px 18px', font: 'inherit', cursor: 'pointer' }); }
  commit.setAttribute('data-testid', 'runcomfy-switch-confirm');
  actions.append(cancel, commit); body.append(source, label, account, price, details, errors); dialog.append(heading, body, actions);
  documentTarget.body.append(dialog);
  let plan, closed = false, revision = 0;
  const cleanup = () => { if (closed) return; closed = true; revision++; dialog.remove(); };
  const close = () => { dialog.close(); cleanup(); };
  const list = (parent, rows) => { const ul = el('ul'); ul.style.paddingLeft = '22px'; for (const row of rows) { const li = el('li', row); li.style.overflowWrap = 'anywhere'; ul.append(li); } parent.append(ul); };
  const render = () => {
    plan = makePlan(select.value); details.replaceChildren(); errors.replaceChildren();
    details.append(el('h3', 'Settings to preserve'));
    const rows = Object.entries(plan.settings).map(([key, value]) => `${key.replaceAll('_', ' ')}: ${String(value)}`);
    list(details, rows.length ? rows : ['No mapped settings.']);
    const wireCount = (node.inputs || []).filter(i => i.link != null).length + (node.outputs || []).reduce((n, o) => n + (o.links?.length || 0), 0);
    details.append(el('p', `${wireCount} existing graph connection${wireCount === 1 ? '' : 's'}. All must be preserved for the switch to proceed.`));
    list(details, plan.notes);
    if (plan.errors.length) { errors.append(el('h3', 'Resolve before switching')); list(errors, plan.errors); }
    commit.disabled = plan.errors.length > 0;
    const current = ++revision, model = MODELS[select.value];
    price.textContent = 'Loading RunComfy pricing…';
    if (api?.fetchApi && model) Promise.resolve(api.fetchApi(`/runcomfy/models/price?model_id=${encodeURIComponent(model.modelId)}`, { cache: 'no-store' }))
      .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(quote => {
        if (closed || current !== revision) return;
        if (quote.model_id !== model.modelId || typeof quote.unit_price_usd !== 'number' || !Number.isFinite(quote.unit_price_usd) || quote.unit_price_usd < 0) throw new Error();
        const unit = quote.price_unit === 'second' ? 'second' : 'output';
        price.textContent = `RunComfy ${quote.estimate_supported === false ? 'base ' : ''}rate: $${quote.unit_price_usd.toFixed(6).replace(/0+$/, '').replace(/\.$/, '')} / ${unit}. ${quote.estimate_supported === false ? 'Final price can depend on settings and references.' : 'The new node shows the current estimate before Run.'}`;
      }).catch(() => { if (!closed && current === revision) price.textContent = 'RunComfy pricing unavailable. Configure your RunComfy account and check the new node’s price before running.'; });
    else price.textContent = 'Check current RunComfy pricing on the new node before running.';
  };
  if (api?.fetchApi) Promise.resolve(api.fetchApi('/runcomfy/config', { cache: 'no-store' }))
    .then(async response => { if (!response.ok) throw new Error(); return response.json(); })
    .then(config => { if (!closed) account.textContent = config.configured ? 'RunComfy account configured for this ComfyUI server. Its balance will be used when you run.' : 'No RunComfy account is configured. Add your token in Settings → RunComfy → Account before running.'; })
    .catch(() => { if (!closed) account.textContent = 'Account status unavailable. RunComfy account settings are shared by this ComfyUI server.'; });
  else account.textContent = 'RunComfy account settings are shared by this ComfyUI server.';
  select.addEventListener('change', render);
  cancel.addEventListener('click', close);
  dialog.addEventListener('close', cleanup);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  commit.addEventListener('click', () => {
    if (commit.disabled || closed) return;
    commit.disabled = true;
    try { apply(plan); close(); }
    catch (error) { errors.replaceChildren(el('p', error.message)); commit.disabled = true; }
  });
  render(); dialog.showModal(); cancel.focus({ preventScroll: true }); body.scrollTop = 0;
  return { close };
}
