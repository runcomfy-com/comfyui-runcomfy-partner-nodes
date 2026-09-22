/** The password exists only in this temporary dialog and the config request. */
export function openTokenDialog({ documentTarget = globalThis.document, client, onClose = () => {} }) {
  const el = (tag, text) => {
    const element = documentTarget.createElement(tag);
    if (text !== undefined) element.textContent = text;
    return element;
  };
  const dialog = el("dialog");
  dialog.setAttribute("aria-label", "RunComfy API token");
  Object.assign(dialog.style, { background: "#28231c", color: "#f3ead9", border: "1px solid #927340",
    borderRadius: "12px", padding: "26px", width: "440px", maxWidth: "calc(100vw - 48px)",
    font: "14px/1.5 Arial, sans-serif", boxShadow: "0 20px 60px #0009" });
  const form = el("form");
  form.autocomplete = "off";
  const title = el("h2", "RunComfy API token");
  Object.assign(title.style, { margin: "0 0 8px", fontSize: "20px", color: "#e4c17c" });
  const help = el("p", "Use your RunComfy API token for image and video models. It is saved on this ComfyUI server and shared by everyone who can run this instance. Generations use this RunComfy account's balance, separately from Comfy credits.");
  Object.assign(help.style, { color: "#c6bba7", margin: "0 0 18px" });
  const label = el("label", "API token");
  label.style.display = "block";
  const input = el("input");
  input.type = "password";
  input.autocomplete = "new-password";
  input.spellcheck = false;
  input.placeholder = "Paste a RunComfy API token";
  input.setAttribute("aria-label", "RunComfy API token");
  Object.assign(input.style, { boxSizing: "border-box", width: "100%", margin: "6px 0 12px",
    padding: "11px 12px", background: "#191714", color: "#f3ead9", border: "1px solid #78603a",
    borderRadius: "6px", font: "inherit" });
  label.append(input);
  const status = el("p", "Checking token configuration…");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  Object.assign(status.style, { color: "#d7c19a", minHeight: "44px", margin: "0 0 14px" });
  const actions = el("div");
  Object.assign(actions.style, { display: "flex", flexWrap: "wrap", gap: "8px" });
  const button = (text, type = "button") => {
    const control = el("button", text);
    control.type = type;
    Object.assign(control.style, { padding: "9px 12px", borderRadius: "6px", border: "1px solid #78603a",
      background: "#3b3123", color: "#f3ead9", cursor: "pointer", font: "inherit" });
    actions.append(control);
    return control;
  };
  const save = button("Save token", "submit");
  Object.assign(save.style, { background: "#d0ac62", color: "#211c14", fontWeight: "bold" });
  const clear = button("Clear saved token");
  const cancel = button("Close");
  form.append(title, help, label, status, actions);
  dialog.append(form);
  documentTarget.body.append(dialog);
  let closed = false;
  let busy = false;
  let statusVersion = 0;

  const describeConfig = config => config.source === "environment"
    ? "Environment token is configured and takes priority over a saved token."
    : config.configured ? "A saved API token is configured." : "No API token is configured.";
  const setBusy = value => {
    busy = value;
    input.disabled = value;
    save.disabled = value;
    clear.disabled = value;
  };
  const cleanup = () => {
    if (closed) return;
    closed = true;
    input.value = "";
    dialog.remove();
    onClose();
  };
  const close = () => { input.value = ""; dialog.close(); cleanup(); };
  dialog.addEventListener("close", cleanup);
  dialog.addEventListener("cancel", event => { event.preventDefault(); close(); });
  cancel.addEventListener("click", close);
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (busy) return;
    let token = input.value.trim();
    input.value = "";
    if (!token) { status.textContent = "Enter an API token before saving."; input.focus(); return; }
    statusVersion++;
    setBusy(true);
    status.textContent = "Saving token and refreshing API pricing…";
    try {
      const operation = client.saveToken(token);
      token = "";
      const config = await operation;
      if (!closed) status.textContent = `Token saved. ${describeConfig(config)}`;
    } catch {
      if (!closed) status.textContent = "Could not save the token. Check your ComfyUI server connection and try again.";
    } finally {
      token = "";
      input.value = "";
      setBusy(false);
    }
  });
  clear.addEventListener("click", async () => {
    if (busy) return;
    input.value = "";
    statusVersion++;
    setBusy(true);
    status.textContent = "Clearing the saved token…";
    try {
      const config = await client.clearToken();
      if (!closed) status.textContent = `Saved token cleared. ${describeConfig(config)}`;
    } catch {
      if (!closed) status.textContent = "Could not clear the saved token. Check your ComfyUI server connection and try again.";
    } finally { setBusy(false); }
  });
  void client.getConfig().then(config => {
    if (!closed && statusVersion === 0) status.textContent = describeConfig(config);
  }).catch(() => {
    if (!closed && statusVersion === 0) status.textContent = "Could not read token configuration. Check your ComfyUI server connection.";
  });
  dialog.showModal();
  input.focus();
  return { close, focus: () => input.focus() };
}
