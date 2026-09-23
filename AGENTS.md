# RunComfy partner nodes

## Product contract

This package lets ComfyUI users run RunComfy models with their own RunComfy account. Users must be able to explicitly switch a supported official partner node to a RunComfy node while preserving compatible settings and graph connections. The supported RunComfy classes are listed in `runcomfy/models.json`; derive counts from this registry and keep Python and frontend catalogs consistent.

- Keep RunComfy class IDs unique. Never replace official registrations, impersonate Comfy billing, mark active official nodes deprecated, or reroute workflows during loading.
- Switching is an explicit user action. Preview the target, account/billing change, mapped settings, and material differences before applying. Switching must never submit a generation.
- Block switching and recovery/rerun preparation while Run on Change / Run Instant is enabled. Do not let automatic queue listeners turn these preparatory edits into paid submissions.
- Map settings by name and semantic meaning, never by positional widget index alone. Handle official dynamic inputs, converted widget inputs, native media sockets, outputs, and subgraphs.
- Preserve position, useful node metadata, supported incoming and outgoing links, and undo/redo. Apply graph changes atomically; leave the original intact on failure.
- Do not silently discard connected outputs, reference inputs, non-default unsupported settings, or model capabilities. Explain incompatible cases and leave the graph unchanged until they are resolved.
- Cover every RunComfy target. Where there is no exact official model/resolution equivalent (currently Seedance 2.5 4K), present it only as an explicit changed-model/settings choice, never as an equivalent replacement. A blocked mapping is preferable to fabricating compatibility.
- Check every installed source class sharing a model-family display name, including legacy variants. Show a clear compatibility explanation for recognized unsupported versions instead of silently omitting the action. Verify the user's actual tab loaded the extension; a server restart alone does not update already loaded JavaScript.
- Model-family names do not prove identical provider revisions, output quality, or costs. Show RunComfy pricing/account context rather than copying Comfy rates.

## Paid execution, caching, and recovery

- Fixed inputs and a fixed generation seed/nonce must reuse ComfyUI's cache when available. A downstream-only change must not force a new upstream paid request.
- Provide normal fixed/randomize rerun controls. When a provider does not accept a seed, describe it as rerun control, not reproducibility. Include account identity safely in cache invalidation; never expose tokens in fingerprints, workflows, or logs.
- Preserve existing widget values when adding fields. Treat changes to old always-rerun behavior as an intentional documented migration.
- Never automatically retry a paid submission. An uncertain submission must explain how to check the existing generation before trying again.
- Resume retrieves the existing request without submitting a new generation. Make request identity, recovery, actual reported cost, and cancellation outcomes available in the UI.
- Cancellation is cooperative and remote cancellation may not stop a running charged job. Report the actual outcome; do not claim cancellation merely because local waiting stopped.
- Use asynchronous, cancellable network requests and waits during generation. Do not block ComfyUI's execution loop with synchronous polling. Bound cancellation attempts and close transports/partial downloads reliably.

## ComfyUI integration

- Preserve native IMAGE (B,H,W,C), VIDEO, and AUDIO contracts. Use native save/load nodes and test video audio preservation.
- V1 is supported. Modernize selectively; do not rename IDs or rewrite the whole package solely to adopt V3.
- Use supported frontend extension hooks and native interaction conventions. Support both root graphs and nested/repeated subgraphs using full execution identity and workflow/prompt scoping, not graph-local `node.id` alone.
- Avoid making duplicated hooks/listeners on reconfiguration, undo, workflow switching, or reload. Release listeners and DOM resources when nodes are removed.
- Keep essential status, price, and recovery information readable; do not rely only on a painted canvas badge. Do not fabricate percentage progress.
- `API_NODE` / `is_api_node` has Comfy account integration semantics. Do not enable it blindly for RunComfy authentication.

## Adding model nodes

- Verify exact endpoint IDs and request schemas against RunComfy's deployed Model API. Use vendor announcements for release dates; RunComfy page update dates establish availability only. Keep these date meanings separate and cite public sources in `docs/recent-models.md`.
- Preserve existing node IDs, input order, names, defaults and frontend metadata. The original twelve contracts are intentionally frozen by `scripts/update_model_catalog.py`; a schema migration needs explicit compatibility handling.
- Add unique, predictable class IDs and mirror every new entry in `web/runcomfy-models.mjs`. Use a native IMAGE, VIDEO or AUDIO output that matches the endpoint's verified output capability.
- New nodes use `pricing_mode: "base"`. Do not infer fixed prices from names, example requests or prose. Accept only supported live units and never commit monetary rates.
- Do not expose raw credentials, provider routing, internal repository references or private development history in public catalogs and documentation. A saved public catalog response is sufficient for schema curation.
- Remove sample prompts, lyrics, tags and media URL defaults. Preserve meaningful enum, numeric and boolean defaults. Normalize the catalog's nonstandard `float` type to JSON Schema `number`.
- Structured array/object inputs need dedicated editors and validation. Exclude endpoints that require them; record omitted optional fields in `omitted_inputs` and explain them through `limitations`. Switching must block when an omitted source field is populated or connected.
- Keep published media limits. Where a media array has no published maximum, impose and disclose a local maximum of 16 references. Never silently truncate references.
- Audio results must decode to native AUDIO with bounded channels, duration, sample count and download size. Do not offer raw PCM without an explicit format contract; Seed Audio currently excludes that option.
- Run the offline catalog updater with `--check` against a saved live catalog response. Updating the registry does not prove paid generation or official-node equivalence; test runtime/media behavior and switch mappings separately.

## Credentials and scope

- Hosted RunComfy startup installs this package beside ComfyUI-RunComfy-Helper and exports the machine owner's existing account token as `RUNCOMFY_API_TOKEN`. A token explicitly saved in Settings takes first priority for all partner nodes; without a saved override, use that environment value. Clearing the saved token restores the default account. `RUNCOMFY_API_TOKEN_FILE` marks a managed machine: without a saved override or injected token, fail closed instead of using legacy environment credentials. The startup script reads the file; nodes do not read its contents directly. Manually saved overrides use `runcomfy_config.json` in the plugin directory by default and are intentionally retained in Cloud Save snapshots together with token-scoped recovery records. Share-link recipients inherit that saved override until they replace or clear it. Keep existing saved token files at startup; do not remove them or require an owner-specific `/user` mount. Honor explicit and environment config paths on managed machines, including shared team paths. Never copy the injected environment token into saved configuration. Explain snapshot sharing and instance-wide account scope in the UI and documentation.
- The default machine account credentials must travel through a private read-only bind mount and be exported by startup, never be literal Docker Compose environment values (which can leak into logs or committed images). Keep the backend startup and plugin credential contracts compatible; offline fixtures only when testing.
- Tokens stay in protected server configuration or environment variables. Never read or print real token files for debugging, embed credentials in fixtures, return them to the browser, or place them in node properties.
- Keep authenticated API transport separate from hosted-media downloads. Preserve origin checks, host restrictions, redirect restrictions, size limits, and restrictive file permissions.
- Account configuration is currently shared by the ComfyUI server instance. Explain that scope; do not claim per-user isolation.
- Only use RunComfy's deployed model catalog for live price information. Preserve honest base-only pricing where no parameter-specific quote exists.
- Do not edit backend/website billing, provider keys, production settings, or unrelated repositories as part of node work.

## Verification and handoff

- Read the current ComfyUI source and official documentation for integration APIs. Do not assume API prompt JSON and visual workflow JSON use the same representation.
- Run `python -m unittest discover -s tests -v` using ComfyUI's Python and `node --test tests/*.test.mjs`.
- Run all native integration scripts with `COMFYUI_PATH` set: `tests/integration_native_video.py`, `tests/integration_partner_media.py`, and `tests/integration_workflow_cache.py`. The cache test must use the real ComfyUI execution engine with offline transports.
- Test switch mappings against real official schemas and representative graph fixtures for every registered target or its explicit unsupported explanation. Include linked widgets, multiple outputs, omitted structured fields, incompatible settings, reference limits, same/different image sizes, nested graphs, rollback and undo/redo.
- Test fixed-seed downstream reruns, deliberate reruns, account changes, resume, cancellation while waiting/downloading, and uncertain submissions with offline transports.
- Verify the actual browser interaction, saved/reloaded workflow, status/recovery UI, and no automatic execution. Use an isolated instance/profile for tests; do not queue real paid workflows or overwrite the user's active graph.
- Check the active queue before restarting the user's local instance. Preserve configuration and workflows. Leave the test link working and report the exact verification boundary.
- Do not present passing mocks, native local tests, Registry publication, or source inspection as paid end-to-end generation proof or official partner approval.
