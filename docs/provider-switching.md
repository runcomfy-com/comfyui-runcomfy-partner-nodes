# Switching to RunComfy

The switch action converts a selected supported official node into a RunComfy node. It does not submit a job, transfer credits, replace official node registrations, or claim that the two providers use identical model revisions.

## Interaction

1. Right-click the official node and select **Switch to RunComfy**.
2. Select a supported target and review setting differences and the RunComfy billing context.
3. Resolve any incompatible settings or connections. Unsupported linked data must never be silently discarded.
4. Apply the switch. Compatible inputs and outputs remain connected. The graph change can be undone.
5. Configure a RunComfy account if needed, review the live price, and run the workflow separately.

Turn off **Run on Change / Run Instant** before switching or preparing a recovery/new generation. These automatic modes could otherwise execute a graph edit; the controls block the edit and explain how to disable them.

Installing the extension and opening a workflow never switch providers automatically. Changing a provider must always remain a user decision.

## Mapping coverage

Official class names below describe the ComfyUI 0.37.0 contracts used for validation. Future official schema changes should be checked before adding or extending mappings.

| Official node | RunComfy targets | Main constraints |
| --- | --- | --- |
| `ByteDance2FirstLastFrameNode`, Seedance 2.5 | Seedance 2.5 I2V 1080p and 4K | A single first frame maps to `image`; unsupported last-frame or asset references cannot be discarded. 4K requires an explicit resolution change. |
| `ByteDance2TextToVideoNode`, Seedance 2.5 | Seedance 2.5 T2V 1080p and 4K | Flatten model settings and map ratio/duration/audio controls. 4K is an explicit change. |
| `ByteDance2ReferenceNodeV2`, Seedance 2.5 | Seedance 2.5 Reference 1080p and 4K | Respect image/video/audio limits. The RunComfy 4K model requires at least one reference video. Additional official task/asset controls may be unsupported. |
| `Wan3ImageToVideoApi` | Wan 3.0 and Wan 3.0 Prime I2V | Map model selection, frame names, ratios, audio and resolution values. Automatic duration has no direct integer equivalent. |
| `Flux3TextToVideoNode` | FLUX 3 Video | Transfer settings by name; official duration/resolution widget positions differ. Transfer the rerun control to `generation_seed`. |
| `GeminiNanoBanana2V2`, Nano Banana 2 Lite | Nano Banana 2 Lite T2I and Edit | Only the first IMAGE output has a counterpart. Text and thought-image output connections cannot be discarded. Edit accepts at most ten reference images. |
| `ByteDanceSeedreamNodeV3`, Seedream 5.0 Pro | Seedream 5.0 Pro I2I | Requires an image and a supported aspect ratio/resolution. Not all official width/height or text-only settings have an equivalent. |
| `ByteDanceSeedreamNode`, legacy flat settings | Seedream 5.0 Pro I2I | Only model 5.0 Pro and matching named 2K presets; preserves the image connection. Other versions and custom dimensions are blocked. |

Original Nano Banana, Nano Banana Pro, and the legacy Nano Banana 2 node also expose the menu action. Their preview explains that this pack has Nano Banana 2 **Lite**, so these different models cannot be replaced equivalently. Use the current official Nano Banana 2 node with Lite selected for a supported switch. Seedream 4.5 likewise is not silently changed to 5.0 Pro.

All twelve targets are represented. A target can be unavailable for a particular graph because of its required media or unsupported source settings. Showing that reason is part of coverage, not permission to invent a replacement.

## Settings and links

Visual workflow JSON stores widget values positionally. API prompt JSON uses named fields and may flatten dynamic inputs with dotted names. Do not implement switching as a text replacement of a class ID or copy raw widget arrays between node types.

The converter must inspect current widget names, values, connected widget inputs, selected dynamic model fields, output indices and graph links. Conversion must preserve compatible downstream IMAGE/VIDEO consumers and distinguish actual connected inputs from optional unused slots. Preserve node position and useful metadata, and fail atomically when a connection cannot be restored.

Several separately connected image references must first be prepared as one dimension-matched IMAGE batch. The switch does not resize or crop references automatically. A single existing batch is preserved; the RunComfy runtime validates its image count and media limits.

## Paid execution and recovery

Fixed inputs and a fixed seed reuse the local ComfyUI cache when available. A seed that the provider does not accept is a rerun nonce, not a promise of reproducibility. Randomize deliberately requests a new generation when the workflow is run.

The account belongs to this ComfyUI server instance. Provider switching never copies a Comfy token into RunComfy or charges Comfy credits. Changing RunComfy accounts must invalidate cached results without exposing credentials.

An existing request can be resumed without a new paid submission. Preparing a resume or a new generation in the node UI never queues the workflow. Status information must identify cancellation uncertainty accurately, including the possibility that a remote job continues and is charged after local waiting stops.

## Verification boundary

Use offline fixtures for all target mappings, graph mutation/rollback, linked widgets, multiple outputs, subgraphs, and undo/redo. Verify the actual browser interaction and reload behavior against supported ComfyUI versions. Native media tests prove local IMAGE/VIDEO/AUDIO integration; mocked transport tests prove request behavior. Neither proves provider generation quality, cost equivalence, or every live model's behavior.

See [AGENTS.md](../AGENTS.md) for implementation and verification rules.
