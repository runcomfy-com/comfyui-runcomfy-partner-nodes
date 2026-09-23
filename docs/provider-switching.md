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

The expanded adapters were checked against official ComfyUI schemas at revision [`b33e2b55cae074eca5aec96283cceac19aa249ba`](https://github.com/Comfy-Org/ComfyUI/tree/b33e2b55cae074eca5aec96283cceac19aa249ba/comfy_api_nodes). The fixtures record that revision. Future official schema changes need validation before extending mappings. Menus contain installed targets from the selected node's family, not the entire catalog.

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

The original mappings above remain available. The expanded catalog adds these choices; the preview labels model or setting changes explicitly instead of calling them equivalent replacements.

| Official family / classes | Added RunComfy choices | Supported mapping and important blockers |
| --- | --- | --- |
| `ByteDance2*` | Seedance 2.5 480p/720p and first/last frame, Seedance 2.0 Mini, Fast and Pro | Preserves named prompt, ratio, duration, audio and compatible references. A fixed endpoint resolution is disclosed. Required first/last frames must both be connected. Asset IDs, unsupported task settings and first/last-frame-to-generic-reference changes block. |
| `ByteDanceSeedreamNodeV2/V3` | Seedream 5.0 Pro T2I | Named 1K/2K presets only. Connected reference images block a text-only target. |
| `OpenAIGPTImage1`, `OpenAIGPTImageNodeV2` | GPT Image 2 and 2.5 Flare/Sunburst T2I/Edit | Named image sizes become explicit resolution/aspect choices; final pixel dimensions may differ. Automatic/custom dimensions, masks, nondefault background or batch count, unsupported quality values and older GPT versions block. |
| `GeminiVideoOmni/V2` | Omni Flash T2V, I2V, reference and video edit | Requires **Omni Flash** and a matching explicit task selection. Omni Flash 1.1, automatic task detection, unsupported video references and secondary connected outputs block. The new duration control/default is disclosed. |
| `HappyHorse*Api` | HappyHorse 1.0/1.1 video modes | Prompt, duration, ratio, resolution and compatible media map by name. Separate numbered image sockets retain their order. Target seed/watermark availability varies and omissions are disclosed or blocked when nondefault. |
| `MinimaxHailuo03*` | MiniMax H3, H3 Max and H3 Open | T2V, first/last frame and reference choices; resolution case is converted and validated. Max Turbo is a recognized unsupported version. Variant changes, target prompt expansion and safety defaults are shown. |
| `LtxApi25*` | LTX 2.5 Fast/Pro T2V, I2V and A2V | Converts named dimensions to resolution/aspect and fixed FPS strings to numeric FPS. Unsupported short durations or FPS values, and linked values requiring conversion, block. Audio-driven targets require audio. |
| `QwenImage*Api` | Qwen Image 2.1 and 3.0/Pro | T2I supports verified square 1024/2048 dimension mappings. The edit choices show a blocker because official match-input/auto/custom sizing cannot be preserved. Nondefault negative prompts and image counts block. |
| `KlingVideoNode`, `KlingFirstLastFrameNode`, `KlingOmniPro*` | Kling 3.0 and O3 standard/pro/4K | Maps compatible single-prompt generation, media, duration and audio. Resolution/variant changes are explicit. Storyboards, omitted elements, Turbo/O1 versions and unsupported end frames or linked settings block. |
| `PixverseV6*` and recognized legacy classes | PixVerse V6 and C1 video modes | Maps T2V, I2V, transition and extension settings. Fusion/reference choices explain that subject/background roles and prompt tags cannot be preserved as a flat reference list. Older model versions block. |
| `Flux3ImageToVideoNode`, `Flux3VideoContinuationNode`, `Flux3TextToVideoNode` | FLUX 3 I2V, first/last frame, continuation and draft | Exactly one keyframe for I2V or two ordered keyframes for first/last frame; timed placement and extra keyframes block. Draft resolution changes are disclosed. |
| `Flux2ImageNode` | FLUX 2 Klein and FLUX 3 Image | Visible blocked choices: official FLUX.2 pro/max is a different model without a verified replacement. Add and configure the desired node directly. |
| `Wan2*Api`, `Wan3*Api`, recognized legacy classes | Wan 2.7/3.0/Prime video modes, Wan 2.7 image choices | The installed `Wan2*` API classes select **2.7** models. Compatible video prompt, duration, ratio, media, audio and prompt-expansion settings map by name. Auto duration, earlier versions and video-continuation-to-image generation block. Legacy Wan image nodes expose a version blocker for 2.7 image choices. |
| `RunwayAleph2VideoToVideoNode` | Runway Aleph 2 V2V | Preserves video/prompt and a connected seed. Structured keyframes or prompt-image inputs block. |
| `IdeogramV4` and recognized V3 | Ideogram V4 | Named supported aspect ratios and explicit TURBO/QUALITY speed modes map. DEFAULT is not assumed to mean BALANCED; automatic dimensions, V3 and unsupported ratios block. |
| `ByteDanceSeedAudio` | Seed Audio 1.0 | Converts numeric sample rates, percentage speed/volume to bounded FLOAT multipliers, pitch and supported reference inputs. The multilingual model version and unverified named voice mappings block; the default Vivi voice change is disclosed. |

Original Nano Banana, Nano Banana Pro, and the legacy Nano Banana 2 node also expose the menu action. Their preview explains that this pack has Nano Banana 2 **Lite**, so these different models cannot be replaced equivalently. Use the current official Nano Banana 2 node with Lite selected for a supported switch. Seedream 4.5 likewise is not silently changed to 5.0 Pro.

All 120 registered targets are accounted for. Of these, 115 have a family-specific official-node choice, including choices that deliberately open a blocked explanation. The four ACE-Step audio nodes and ElevenLabs Music have no corresponding installed official API class in the validated revision; add those RunComfy nodes directly. Availability in the catalog does not establish official-node equivalence.

A target can be unavailable for a particular graph because of required media, unsupported source settings or a model/version mismatch. Showing a target and its blocker is part of coverage, not permission to invent compatibility. Some choices become available after selecting supported values; others intentionally require creating and configuring a new node.

## Settings and links

Visual workflow JSON stores widget values positionally. API prompt JSON uses named fields and may flatten dynamic inputs with dotted names. Do not implement switching as a text replacement of a class ID or copy raw widget arrays between node types.

The converter must inspect current widget names, values, connected widget inputs, selected dynamic model fields, output indices and graph links. Conversion must preserve compatible downstream IMAGE/VIDEO consumers and distinguish actual connected inputs from optional unused slots. Preserve node position and useful metadata, and fail atomically when a connection cannot be restored.

For targets with one IMAGE batch socket, several separately connected references must first be prepared as one dimension-matched IMAGE batch. HappyHorse's separate numbered image sockets can retain separate references. The switch does not resize or crop images automatically. A single existing batch is preserved; the RunComfy runtime validates its count and media limits. Required media groups are generated from the deployed catalog schema, including target modes that use optional native sockets for resume support.

Connected widget values that need conversion (for example a string FPS to an integer, or uppercase to lowercase resolution) block until replaced with a supported fixed value. FLOAT controls must be finite and within their schema bounds. Unsupported nondefault values and connected data block; default controls not carried over and new target defaults appear in the preview.

Some new endpoints expose an optional provider seed as a connection-only input because their catalog has no seed default. A fixed official seed widget cannot be copied into a nonexistent target widget. Connect a compatible upstream seed value before switching. That connection is preserved and its upstream node determines reruns; the source node's inactive widget rerun control is not copied. Targets with a normal seed/rerun widget retain the compatible control.

## Paid execution and recovery

Fixed inputs and a fixed seed reuse the local ComfyUI cache when available. A seed that the provider does not accept is a rerun nonce, not a promise of reproducibility. Randomize deliberately requests a new generation when the workflow is run.

The account belongs to this ComfyUI server instance. Provider switching never copies a Comfy token into RunComfy or charges Comfy credits. Changing RunComfy accounts must invalidate cached results without exposing credentials.

An existing request can be resumed without a new paid submission. Preparing a resume or a new generation in the node UI never queues the workflow. Status information must identify cancellation uncertainty accurately, including the possibility that a remote job continues and is charged after local waiting stops.

## Verification boundary

The offline suites exercise the original mappings and the new family candidates against captured official schemas and generated native target layouts, including successful apply and explicit unsupported previews. They cover graph mutation/rollback, linked widgets, required media, numeric validation, multiple outputs, subgraphs and undo/redo. Verify the actual browser interaction and reload behavior against supported ComfyUI versions. Native media tests prove local IMAGE/VIDEO/AUDIO integration; mocked transport tests prove request behavior. Neither proves provider generation quality, cost equivalence, or every live model's behavior.

See [AGENTS.md](../AGENTS.md) for implementation and verification rules.
