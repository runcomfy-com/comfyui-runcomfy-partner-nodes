# Provider switching and runtime validation — 2026-09-22

Validated locally with ComfyUI 0.37.0 (commit `b33e2b5`), frontend 1.53.6 and Python 3.11.15. Tests used an isolated ComfyUI instance without a RunComfy token. No paid generation was submitted.

## Automated checks

- 83 Python tests: account/cache identity, mid-run account changes, async transport and concurrent cancellation, uncertain single-attempt submissions, download cleanup, media contracts, input validation, pricing, credentials, recovery journal and restricted execution-scope responses. Offline managed-credential checks verify environment precedence and prevent a missing injected account token from falling back to saved or legacy credentials.
- 100 JavaScript tests: mappings for every target, current and legacy official node definitions, unsupported inputs/outputs/settings, native transaction boundaries and rollback, subgraph paths, status/recovery, late cancellation, cached output routing, account changes, old workflow migration and automatic-queue guards.
- Real ComfyUI PromptExecutor integration: changing a downstream save input reused the generation; changing the nonce or account submitted again through an offline transport; fixed resume reused cache and never submitted a new generation.
- Native VIDEO → SaveVideo preserved 12 frames and embedded audio. Native VIDEO/AUDIO references and all three IMAGE outputs → SaveImage passed with synthetic local media.
- Python compilation and whitespace checks passed.

## Browser checks

- Instantiated real official nodes and used the installed `/object_info` definitions for all twelve targets. Every supported fixture preserved its media/output links, converted successfully, reloaded through ComfyUI, and produced correctly named API prompt inputs.
- Loaded all twelve existing example workflows. Existing prompts/settings/resume values survived the new fixed rerun controls.
- Used the actual right-click menu, preview and Switch button. The modal keeps its heading and actions visible while long settings/differences scroll.
- A loaded official FLUX → SaveVideo workflow switched, undid and redid through native keyboard commands with its connection preserved.
- Canvas and Vue renderers displayed the native status/recovery widget. Actual Resume and New generation clicks changed only the intended inputs; neither queued a workflow.
- Simulated scoped status events displayed request identity, cancellation uncertainty and reported cost. Delayed sibling outcomes remained usable after local interruption. Simulated prices/costs are UI fixtures, not live price or billing evidence.

## Boundaries and known upstream behavior

Provider switching is conditional compatibility, not universal equivalence. Model revisions, defaults, unsupported outputs and reference limits can differ. Separate image sockets require a dimension-matched batch; Seedance 2.5 4K is an explicit resolution change. See [the mapping rules](provider-switching.md).

A newly created native SaveVideo node in frontend 1.53.6 can reorder its format/codec input sockets on the first Undo reload, clearing Redo history. This also reproduced with an ordinary node move and no RunComfy conversion. Loaded workflows had stable serialization and passed Undo/Redo. No global ChangeTracker or official node override was added.

These checks prove local conversion, execution/cache behavior and native media integration. Managed-credential tests use fixtures; they do not verify a deployed cloud startup or real account-token provisioning. The checks do not prove paid output quality, exact provider revision equivalence, live cancellation success, actual model charges, or Registry/official partner approval.
