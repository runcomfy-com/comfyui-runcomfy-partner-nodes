# Recent model expansion validation

Validated on September 23, 2026 with ComfyUI 0.37.0 (`b33e2b5`), frontend 1.53.6 and Python 3.11.

- The live RunComfy catalog contained 384 endpoints. The curated pack contains 120 model endpoints across 31 families, including 108 added nodes. Selection dates, sources and exclusions are documented in [recent model coverage](recent-models.md).
- All 119 Python tests and 178 JavaScript tests passed. The original twelve input contracts and frontend metadata remain unchanged. New tests cover every registered input contract and output adapter, optional values, fractional controls, native references, required inputs and bounds, catalog parity, audio decoding and conservative provider switching.
- Native VIDEO to Save Video retained frames and embedded audio. All 24 IMAGE adapters connected to Save Image. All six AUDIO adapters decoded synthetic media, connected to Save Audio and Save Audio (Advanced), and retained sample count, channels and sample rate when reloaded. WAV, MP3, Ogg Opus and FLAC decoding passed.
- The real ComfyUI executor reused cached output for downstream-only edits and fixed resumes. Rerun and account changes invalidated the cache; resume submitted no new request.
- A separate local browser instance registered and instantiated all 120 nodes, then serialized/reloaded their workflow without widget-value changes. All five new [example workflows](../examples/README.md) imported, saved to that instance and reloaded with their settings and connections intact.
- The actual right-click menu on the official MiniMax H3 node opened the switch preview. Selecting the RunComfy H3 target preserved its prompt and Save Video connection. Native keyboard undo restored the original node and connection. Automated graph tests additionally cover rollback, undo/redo, subgraphs and automatic-run guards.
- The final test-instance queue was empty. No real tokens, paid submissions, production deployments or repository merges were used for these checks.

These results prove local integration and offline transport behavior. They do not establish successful paid generation for every provider, equal output quality, exact parameter-sensitive prices or official partner approval. Some visible switch choices deliberately explain an incompatible configuration; see [provider switching](provider-switching.md). Two FLUX keyframe endpoints and some optional structured inputs remain explicitly unsupported.
