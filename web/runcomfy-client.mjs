import { MODELS } from "./runcomfy-models.mjs";
import { tokenConfigError } from "./runcomfy-config-error.mjs?v=20260923-shared-token2";

const DEFAULT_MODEL = MODELS.RunComfySeedance25I2V1080p;
const PRICE_URL = "/runcomfy/seedance-25/price";
const CONFIG_URL = "/runcomfy/config";
const usd = new Intl.NumberFormat("en-US", {
  style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 6,
});

function validQuote(value, model = DEFAULT_MODEL) {
  return value && value.model_id === model.modelId
    && typeof value.unit_price_usd === "number" && Number.isFinite(value.unit_price_usd)
    && value.unit_price_usd >= 0 && value.price_unit === (model.outputType === "IMAGE" ? "output" : "second")
    && value.currency === "USD"
    && (value.estimate_supported === undefined || typeof value.estimate_supported === "boolean")
    && (value.account_scope === undefined || (typeof value.account_scope === "string" && value.account_scope.length > 0))
    && typeof value.fetched_at === "string" && Number.isFinite(Date.parse(value.fetched_at));
}

function publicQuote(value, model) {
  const { model_id, unit_price_usd, price_unit, currency, fetched_at } = value;
  return { model_id, unit_price_usd, price_unit, currency, fetched_at,
    ...(value.account_scope === undefined ? {} : { account_scope: value.account_scope }),
    estimate_supported: model.pricingMode === "fixed" && value.estimate_supported !== false,
    pricing_note: typeof value.pricing_note === "string" ? value.pricing_note : "" };
}

export function normalizeExecutionQuote(value, model = DEFAULT_MODEL) {
  if (!validQuote(value, model)) return null;
  const estimated = value.estimated_cost_usd;
  const supportsEstimate = model.pricingMode === "fixed" && value.estimate_supported !== false;
  if (supportsEstimate && (typeof estimated !== "number" || !Number.isFinite(estimated) || estimated < 0)) return null;
  if (!supportsEstimate && estimated !== null && estimated !== undefined
    && (typeof estimated !== "number" || !Number.isFinite(estimated) || estimated < 0)) return null;
  return { ...publicQuote(value, model), estimated_cost_usd: supportsEstimate ? estimated : null };
}

function publicConfig(value) {
  if (typeof value?.configured !== "boolean" || !["environment", "file", "none"].includes(value.source)) {
    throw new Error("The server returned an invalid configuration status.");
  }
  return { configured: value.configured, source: value.source };
}

/** Account changes invalidate every model before the server token is mutated. */
function createAccountCoordinator(fetchApi) {
  let revision = 0;
  let generation = 0;
  let changingToken = false;
  let config = null;
  let mutation = null;
  const clients = new Set();
  const publishConfig = value => {
    config = value;
    for (const client of clients) client.configChanged(value);
  };

  async function mutateConfig(method, token) {
    if (mutation) {
      await mutation.catch(() => {});
      return mutateConfig(method, token);
    }
    revision++;
    generation++;
    changingToken = true;
    config = null;
    for (const client of clients) client.invalidate();
    // Defer transport to keep the mutation guard installed even on synchronous errors.
    mutation = Promise.resolve().then(async () => {
      let error;
      try {
        const result = await fetchApi(CONFIG_URL, {
          method, cache: "no-store",
          headers: { "Content-Type": "application/json", "X-RunComfy-Client": "comfyui" },
          ...(method === "POST" ? { body: JSON.stringify({ token }) } : {}),
        });
        if (!result.ok) throw await tokenConfigError(result);
        publishConfig(publicConfig(await result.json()));
      } catch (caught) {
        error = caught;
      } finally {
        token = undefined;
        generation++;
        changingToken = false;
        for (const client of clients) client.mutationComplete();
        // A failed write can have an uncertain server outcome; read fresh prices either way.
        await Promise.all([...clients].map(client => client.refresh()));
      }
      if (error) throw error;
      return config;
    }).finally(() => { mutation = null; });
    return mutation;
  }

  return {
    get revision() { return revision; },
    get generation() { return generation; },
    get changingToken() { return changingToken; },
    get config() { return config; },
    register(client) { clients.add(client); },
    async getConfig() {
      const requestedGeneration = generation;
      const result = await fetchApi(CONFIG_URL, { cache: "no-store" });
      if (!result.ok) throw await tokenConfigError(result);
      const value = publicConfig(await result.json());
      if (requestedGeneration === generation && !changingToken) publishConfig(value);
      return value;
    },
    saveToken: token => mutateConfig("POST", token),
    clearToken: () => mutateConfig("DELETE"),
  };
}

/** One in-memory client per model and one account, with no browser persistence. */
export function createPriceHub(options) {
  const account = createAccountCoordinator(options.fetchApi);
  const clients = new Map();
  return {
    forModel(model) {
      if (!clients.has(model.modelId)) clients.set(model.modelId, createPriceClient({ ...options, model, account }));
      return clients.get(model.modelId);
    },
    getConfig: account.getConfig,
    saveToken: account.saveToken,
    clearToken: account.clearToken,
  };
}

/** The default client retains the original route; explicit models use the registry route. */
export function createPriceClient({ fetchApi, model: requestedModel, modelId,
  account = createAccountCoordinator(fetchApi), documentTarget = globalThis.document,
  windowTarget = globalThis.window, setInterval = globalThis.setInterval,
  clearInterval = globalThis.clearInterval }) {
  const model = requestedModel ?? (modelId ? Object.values(MODELS).find(item => item.modelId === modelId) : DEFAULT_MODEL);
  if (!model) throw new Error("Unknown RunComfy pricing model.");
  const priceUrl = requestedModel || modelId
    ? `/runcomfy/models/price?model_id=${encodeURIComponent(model.modelId)}` : PRICE_URL;
  let state = { phase: account.changingToken ? "loading" : "idle", quote: null,
    config: account.config, accountRevision: account.revision, changingToken: account.changingToken };
  let inFlight = null;
  let timer = null;
  const subscribers = new Set();
  const visible = () => documentTarget?.visibilityState !== "hidden";
  const publish = patch => {
    state = { ...state, ...patch };
    for (const listener of subscribers) listener(state);
  };

  function refresh() {
    if (account.changingToken) return Promise.resolve(state);
    if (inFlight) return inFlight;
    publish({ phase: "loading" });
    // Defer finally to a microtask so even synchronous transport errors clear inFlight.
    inFlight = (async () => {
      do {
        const requestedGeneration = account.generation;
        let patch;
        try {
          const result = await fetchApi(priceUrl, { cache: "no-store" });
          if (!result.ok) {
            patch = { phase: [401, 403].includes(result.status) ? "configure" : "unavailable", quote: null };
          } else {
            const payload = await result.json();
            if (!validQuote(payload, model)) throw new Error("Invalid price response");
            patch = { phase: "ready", quote: publicQuote(payload, model) };
          }
        } catch {
          patch = { phase: "unavailable", quote: null };
        }
        if (requestedGeneration === account.generation) {
          publish(patch);
          return state;
        }
        // A completed request from the previous account cannot become a current quote.
        if (account.changingToken) return state;
      } while (true);
    })().finally(() => { inFlight = null; });
    return inFlight;
  }

  function syncTimer() {
    if (timer !== null) { clearInterval(timer); timer = null; }
    if (subscribers.size && visible()) timer = setInterval(() => { void refresh(); }, 30_000);
  }
  const onFocus = () => { if (subscribers.size && visible()) void refresh(); };
  const onVisibility = () => { syncTimer(); onFocus(); };

  account.register({ refresh,
    invalidate: () => publish({ quote: null, config: null, phase: "loading", accountRevision: account.revision, changingToken: true }),
    mutationComplete: () => publish({ changingToken: false }),
    configChanged: config => publish({ config }),
  });

  return {
    model,
    get state() { return state; },
    refresh,
    getConfig: account.getConfig,
    saveToken: account.saveToken,
    clearToken: account.clearToken,
    subscribe(listener) {
      const first = subscribers.size === 0;
      subscribers.add(listener);
      if (first) {
        windowTarget?.addEventListener("focus", onFocus);
        documentTarget?.addEventListener("visibilitychange", onVisibility);
        syncTimer();
      }
      listener(state);
      void refresh();
      return () => {
        subscribers.delete(listener);
        if (!subscribers.size) {
          syncTimer();
          windowTarget?.removeEventListener("focus", onFocus);
          documentTarget?.removeEventListener("visibilitychange", onVisibility);
        }
      };
    },
  };
}

function numericDuration(value, model) {
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return null;
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < model.durationMin || duration > model.durationMax) return null;
  if (model.durationChoices && !model.durationChoices.some(choice => String(choice) === String(value))) return null;
  return duration;
}

export function describePricing(state, { duration, durationConnected = false,
  resumeRequestId = "", resumeConnected = false, execution = null, model = DEFAULT_MODEL } = {}) {
  const quote = state.quote;
  const image = model.outputType === "IMAGE";
  const unit = image ? "image" : "second";
  const shortUnit = image ? "image" : "s";
  const baseOnly = value => model.pricingMode === "base" || value?.estimate_supported === false;
  const unitLabel = (value, compact = false) => `${baseOnly(value) ? "Base " : ""}${usd.format(value.unit_price_usd)}${compact ? `/${shortUnit}` : ` / ${unit}`}`;
  const seconds = numericDuration(duration, model);
  const resumed = String(resumeRequestId ?? "").trim().length > 0;
  const price = quote ? unitLabel(quote) : "Price unavailable";
  const nextEstimate = quote && !baseOnly(quote) && (image || (!durationConnected && seconds !== null))
    ? quote.unit_price_usd * (image ? 1 : seconds) : null;
  let estimate;
  if (resumed) estimate = "Resume existing request · no new submission";
  else if (resumeConnected) estimate = "Resume input connected · estimate unavailable";
  else if (!quote) estimate = "Estimate unavailable";
  else if (baseOnly(quote)) estimate = "Base rate only · run estimate unavailable";
  else if (image) estimate = `${usd.format(nextEstimate)} estimated / image`;
  else if (durationConnected) estimate = "Duration connected · estimate at execution";
  else if (String(duration).toLowerCase() === "auto") estimate = "Automatic duration · estimate unavailable";
  else if (seconds === null) estimate = `Enter a duration from ${model.durationMin} to ${model.durationMax} seconds`;
  else estimate = `${usd.format(nextEstimate)} estimated / ${seconds}s`;
  const status = state.phase === "configure" ? "Set up your account in Settings → RunComfy"
    : state.phase === "unavailable" ? "Price unavailable · retrying automatically"
    : state.phase === "loading" ? "Checking current API price…"
    : quote ? (baseOnly(quote) ? "Current API base rate" : "Current API quote · estimate only") : "Waiting for API pricing";
  const cost = execution?.cost_usd;
  const submissionQuote = normalizeExecutionQuote(execution?.quote, model);
  const running = execution && !["completed", "error", "failed", "cancelled", "interrupted", "timeout", "stopped"].includes(execution.state);
  let badge;
  if (resumed || resumeConnected) badge = "Resume request";
  else if (running && submissionQuote) {
    badge = unitLabel(submissionQuote, true);
    if (submissionQuote.estimated_cost_usd !== null) badge += ` · ~${usd.format(submissionQuote.estimated_cost_usd)}/Run`;
  } else if (quote) {
    badge = unitLabel(quote, true);
    if (nextEstimate !== null) badge += ` · ~${usd.format(nextEstimate)}/Run`;
  } else badge = state.phase === "configure" ? "Set up account" : state.phase === "loading" ? "Checking price…" : "Price unavailable";
  return {
    price, estimate, status,
    submission: submissionQuote
      ? submissionQuote.estimated_cost_usd === null ? unitLabel(submissionQuote)
        : `${usd.format(submissionQuote.estimated_cost_usd)} at ${unitLabel(submissionQuote)}`
      : "Not available",
    submissionChecked: submissionQuote ? new Date(submissionQuote.fetched_at).toLocaleString() : "Not available",
    badge,
    checked: quote ? new Date(quote.fetched_at).toLocaleString() : "Not available",
    note: quote?.pricing_note ?? "",
    actual: typeof cost === "number" && Number.isFinite(cost) && cost >= 0
      ? `${usd.format(cost)} · reported by API` : "Not reported by API",
    requestId: execution?.request_id || (resumed ? String(resumeRequestId).trim() : "—"),
    executionStatus: execution ? [execution.state, execution.message].filter(Boolean).join(" · ") : "Ready",
  };
}
