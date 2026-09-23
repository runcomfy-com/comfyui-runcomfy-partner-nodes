# Recent model coverage

Catalog reviewed on **September 23, 2026**, for the six-month window **March 23–September 23, 2026**. This expansion adds **108 nodes**, bringing the registry to **120 endpoints in 31 model families**: 90 video, 24 image and 6 audio outputs. The original twelve node contracts remain unchanged.

The selection combines verified recent vendor releases with related hosted variants added or updated in RunComfy during the window. A RunComfy page update is **not** a vendor launch date. Some included families, such as the original Kling 3.0 release, predate the window; their later variants and broader coverage are included deliberately.

All endpoint IDs and request contracts were checked against the live [RunComfy Model API catalog](https://docs.runcomfy.com/model-apis/model-catalog-endpoints). This verifies catalog availability, not a successful paid generation. No claim of identical output quality or official Comfy partner approval is implied.

## Available families

Search for `RunComfy` and the family name in ComfyUI. Each variant has its own node. T2I means text-to-image, I2I image-to-image, T2V text-to-video, I2V image-to-video, V2V video-to-video, A2V audio-to-video, and T2A text-to-audio. Reference nodes accept the reference types published for that endpoint.

| Family | Nodes | Native output | Variants |
| --- | ---: | --- | --- |
| `acestep-ai/ace-step` | 3 | AUDIO | ACE-Step AudioInpaint; ACE-Step AudioOutpaint; ACE-Step T2A |
| `acestep-ai/ace-step-1.5` | 1 | AUDIO | ACE-Step 1.5 T2A |
| `alibaba/happyhorse-1.1` | 3 | VIDEO | HappyHorse 1.1 I2V; HappyHorse 1.1 Reference; HappyHorse 1.1 T2V |
| `blackforestlabs/flux-2-klein` | 2 | IMAGE | FLUX 2 Klein 4B T2I; FLUX 2 Klein 9B T2I |
| `blackforestlabs/flux-3` | 9 | IMAGE, VIDEO | FLUX 3 Video; FLUX 3 Extend; FLUX 3 Extend Draft; FLUX 3 FirstLastFrame; FLUX 3 FirstLastFrame Draft; FLUX 3 Image; FLUX 3 I2V; FLUX 3 I2V Draft; FLUX 3 T2V Draft |
| `bytedance/seed-audio-1.0` | 1 | AUDIO | Seed Audio 1.0 T2A |
| `bytedance/seedance-2.0` | 2 | VIDEO | Seedance 2.0 Fast; Seedance 2.0 Pro |
| `bytedance/seedance-2.0-mini` | 3 | VIDEO | Seedance 2.0 Mini I2V; Seedance 2.0 Mini T2V; Seedance 2.0 Mini V2V |
| `bytedance/seedance-2.5` | 14 | VIDEO | Seedance 2.5 I2V 1080p; Seedance 2.5 T2V 1080p; Seedance 2.5 Reference to Video 1080p; Seedance 2.5 I2V 4K; Seedance 2.5 T2V 4K; Seedance 2.5 Reference to Video 4K; Seedance 2.5 FirstLastFrame 480p; Seedance 2.5 FirstLastFrame 720p; Seedance 2.5 I2V 480p; Seedance 2.5 I2V 720p; Seedance 2.5 Reference 480p; Seedance 2.5 Reference 720p; Seedance 2.5 T2V 480p; Seedance 2.5 T2V 720p |
| `bytedance/seedream-5.0-pro` | 2 | IMAGE | Seedream 5.0 Pro I2I; Seedream 5.0 Pro T2I |
| `elevenlabs/elevenlabs` | 1 | AUDIO | ElevenLabs Music |
| `google/gemini-omni-flash` | 4 | VIDEO | Gemini Omni Flash I2V; Gemini Omni Flash Reference; Gemini Omni Flash T2V; Gemini Omni Flash VideoEdit |
| `google/nano-banana-2-lite` | 2 | IMAGE | Nano Banana 2 Lite T2I; Nano Banana 2 Lite Edit |
| `happyhorse/happyhorse-1.0` | 4 | VIDEO | HappyHorse 1.0 I2V; HappyHorse 1.0 Reference; HappyHorse 1.0 T2V; HappyHorse 1.0 VideoEdit |
| `ideogram-ai/ideogram-v4` | 1 | IMAGE | Ideogram 4 T2I |
| `kling/kling-3.0` | 6 | VIDEO | Kling 3.0 4K I2V; Kling 3.0 4K T2V; Kling 3.0 Pro I2V; Kling 3.0 Pro T2V; Kling 3.0 Standard I2V; Kling 3.0 Standard T2V |
| `kling/kling-video-o3` | 11 | VIDEO | Kling O3 4K I2V; Kling O3 4K Reference; Kling O3 4K T2V; Kling O3 Pro I2V; Kling O3 Pro Reference; Kling O3 Pro T2V; Kling O3 Pro V2V; Kling O3 Standard I2V; Kling O3 Standard Reference; Kling O3 Standard T2V; Kling O3 Standard V2V |
| `lightricks/ltx-2.5` | 6 | VIDEO | LTX 2.5 A2V Fast; LTX 2.5 A2V Pro; LTX 2.5 I2V Fast; LTX 2.5 I2V Pro; LTX 2.5 T2V Fast; LTX 2.5 T2V Pro |
| `minimax/minimax-h3` | 3 | VIDEO | MiniMax H3 I2V; MiniMax H3 Reference; MiniMax H3 T2V |
| `minimax/minimax-h3-max` | 3 | VIDEO | MiniMax H3 Max I2V; MiniMax H3 Max Reference; MiniMax H3 Max T2V |
| `minimax/minimax-h3-open` | 3 | VIDEO | MiniMax H3 Open I2V; MiniMax H3 Open Reference; MiniMax H3 Open T2V |
| `openai/gpt-image-2` | 2 | IMAGE | GPT Image 2 Edit; GPT Image 2 T2I |
| `openai/gpt-image-2.5` | 4 | IMAGE | GPT Image 2.5 Flare Edit; GPT Image 2.5 Flare T2I; GPT Image 2.5 Sunburst Edit; GPT Image 2.5 Sunburst T2I |
| `pixverse/pixverse-c1` | 4 | VIDEO | PixVerse C1 I2V; PixVerse C1 Reference; PixVerse C1 T2V; PixVerse C1 Transition |
| `pixverse/pixverse-v6` | 5 | VIDEO | PixVerse V6 Extend; PixVerse V6 I2V; PixVerse V6 Reference; PixVerse V6 T2V; PixVerse V6 Transition |
| `qwen/qwen-image-2.1` | 2 | IMAGE | Qwen Image 2.1 Edit; Qwen Image 2.1 T2I |
| `qwen/qwen-image-3.0` | 4 | IMAGE | Qwen Image 3.0 Edit; Qwen Image 3.0 Pro Edit; Qwen Image 3.0 Pro T2I; Qwen Image 3.0 T2I |
| `runwayml/runway-aleph-2` | 1 | VIDEO | Runway Aleph 2 V2V |
| `wan-ai/wan-2.7` | 8 | IMAGE, VIDEO | Wan 2.7 Edit; Wan 2.7 VideoEdit; Wan 2.7 I2V; Wan 2.7 Pro Edit; Wan 2.7 Pro T2I; Wan 2.7 Reference; Wan 2.7 T2I; Wan 2.7 T2V |
| `wan-ai/wan-3.0` | 3 | VIDEO | Wan 3.0 I2V; Wan 3.0 Reference; Wan 3.0 T2V |
| `wan-ai/wan-3.0-prime` | 3 | VIDEO | Wan 3.0 Prime I2V; Wan 3.0 Prime Reference; Wan 3.0 Prime T2V |

Exact class IDs, field schemas and per-node limitations are in [runcomfy/models.json](../runcomfy/models.json). The original example workflows remain compatible and are listed in the [README](../README.md#models-and-example-workflows).

## Release evidence

The table distinguishes vendor announcements, API availability and open-weight releases. RunComfy availability was checked separately on September 23. A date does not establish that every endpoint or tier launched that day.

| Family or update | Date | What the source establishes | Source |
| --- | --- | --- | --- |
| GPT Image 2 | 2026-04-21 | Vendor launch.  | [Source 1](https://openai.com/index/introducing-chatgpt-images-2-0/) |
| GPT Image 2.5 Flare and Sunburst | 2026-09-08 | Vendor launch and API availability.  | [Source 1](https://openai.com/index/introducing-chatgpt-images-2-5/) |
| Gemini Omni Flash | 2026-06-30 | Developer API availability; consumer announcement preceded this.  | [Source 1](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni-flash-nano-banana-2-lite/) |
| Nano Banana 2 Lite | 2026-06-30 | Vendor launch and API availability.  | [Source 1](https://blog.google/innovation-and-ai/models-and-research/gemini-models/gemini-omni-flash-nano-banana-2-lite/) |
| HappyHorse 1.0 | 2026-04-28 | Vendor announcement of limited beta with API access.  | [Source 1](https://www.alibabacloud.com/blog/alibaba-rolls-out-happyhorse-1-0-in-limited-beta_603068) |
| HappyHorse 1.1 | 2026-06-23 | Vendor announcement that model is released and API accessible; exact prior rollout day not established.  | [Source 1](https://www.alibabacloud.com/blog/happyhorse-gets-stronger-motion-expressiveness-higher-generation-consistency-and-enhanced-visual-quality_603293) |
| Kling 3.0 and O3 base | 2026-02-05 | Original family launch outside window. Native 4K upgrade is separately within window. Do not label all base 3.0 variants newly launched within window. | [Source 1](https://ir.kuaishou.com/node/11216/pdf) |
| Kling 3.0 native 4K | 2026-04-23 | Vendor confirms rollout on Apr23 in article published May20.  | [Source 1](https://kling.ai/blog/kling-ai-introduces-native-4k-video-model) |
| MiniMax H3 | 2026-07-31 | Vendor launch.  | [Source 1](https://www.minimax.io/blog/minimax-h3) |
| MiniMax H3 Open | 2026-08-03 | Open-weight release.  | [Source 1](https://www.minimax.io/news/minimax-h3-open-source) |
| MiniMax H3 Max | 2026-08-27 | fal post-trained variant launch and API availability.  | [Source 1](https://blog.fal.ai/introducing-h3-max-by-fal/), [Source 2](https://design.minimax.io/tools/minimax-h3-max) |
| LTX 2.5 | 2026-08-11 | Official API changelog adds Fast and Pro for text/image/audio to video.  | [Source 1](https://docs.ltx.io/api-changelog) |
| Qwen Image 2.1 | 2026-09-20 | Vendor open-source launch.  | [Source 1](https://qwen.ai/blog?id=qwen-image-2.1) |
| Qwen Image 3.0 | 2026-07-21 | Vendor launch; no independent Pro-tier release date established.  | [Source 1](https://qwen.ai/blog?id=qwen-image-3.0) |
| Wan 2.7 Image and Pro | 2026-04-01 | Vendor launch.  | [Source 1](https://www.alibabacloud.com/en/press-room/alibaba-unveils-wan2-7-redefining-personalized-and?_p_lc=1) |
| Wan 2.7 Video | 2026-04-07 | Vendor launch announcement.  | [Source 1](https://www.alibabacloud.com/blog/alibaba-unveils-wan2-7-video-to-elevate-creators-from-executors-to-directors_603009) |
| Wan 3.0 and Prime | 2026-08-24 | General availability; beta documented by vendor on Aug7. GA source by Alibaba Cloud Director of Gen AI Product Strategy. Prime separately documented in live vendor model page; exact Prime-specific launch day not established. | [Source 1](https://www.alibabacloud.com/blog/wan3-0-at-general-availability-capabilities-benchmarks-pricing-and-the-workflows-it-changes_603505), [Source 2](https://www.alibabacloud.com/blog/alibaba-unveils-wan3-0-with-twice-as-long-video-outputs-from-a-richer-variety-of-inputs_603439), [Source 3](https://modelstudio.console.alibabacloud.com/model-releases/wan3.0-video) |
| PixVerse C1 | 2026-04-07 | Vendor launch and API availability.  | [Source 1](https://pixverse.ai/en/blog/pixverse-introduces-c1-ai-video-model-for-film-production) |
| PixVerse V6 | 2026-03-30 | Vendor launch.  | [Source 1](https://pixverse.ai/en/blog/pixverse-launches-v6-advancing-ai-video-generation) |
| Ideogram 4 | 2026-06-03 | Vendor launch.  | [Source 1](https://ideogram.ai/blog/ideogram-4.0/) |
| FLUX 3 Video | 2026-08-04 | General API availability; early access began Jul23. Aug4 launch includes text/image/keyframes, video continuation and draft mode. | [Source 1](https://bfl.ai/blog/flux-3-video), [Source 2](https://bfl.ai/blog/flux-3) |
| FLUX 3 Image | Not established | RunComfy catalog availability only; no dated vendor image launch verified. Jul23 announcement and Aug4 follow-up describe Image as forthcoming. Do not claim Jul23 or Aug4 image release. | [Source 1](https://bfl.ai/blog/flux-3), [Source 2](https://www.runcomfy.com/models/blackforestlabs/flux-3/image) |
| Runway Aleph 2 | 2026-05-21 | Vendor launch.  | [Source 1](https://runway.com/news/introducing-aleph-2-and-edit-studio) |
| Seed Audio 1.0 | 2026-07-20 | Vendor model announcement; earlier distribution already existed. Runway changelog records distribution Jun29, so Jul20 is the dated vendor announcement, not proven first availability. | [Source 1](https://seed.bytedance.com/en/blog/from-speech-to-audio-creation-introducing-the-seed-audio-1-0-audio-creation-model), [Source 2](https://runway.com/changelog) |
| Seedream 5.0 Pro | 2026-07-08 | Vendor launch.  | [Source 1](https://seed.bytedance.com/en/blog/beyond-generation-it-understands-design-introducing-seedream-5-0-pro) |
| Seedance 2.5 | 2026-07-31 | Vendor launch to consumer platforms; API soon at announcement, live RunComfy catalog separately confirms availability now.  | [Source 1](https://seed.bytedance.com/en/blog/one-take-creation-flexible-referencing-introducing-seedance-2-5) |

For the remaining families below, this review established recent RunComfy page activity and live catalog availability, without independently establishing an original vendor launch date. The dates below are explicitly **RunComfy page updates**.

| Family | RunComfy page update | Public RunComfy page |
| --- | --- | --- |
| `acestep-ai/ace-step` | 2026-05-14 | [Model page](https://www.runcomfy.com/models/acestep-ai/ace-step/audio-inpaint) |
| `acestep-ai/ace-step-1.5` | 2026-05-15 | [Model page](https://www.runcomfy.com/models/acestep-ai/ace-step-1.5/text-to-audio) |
| `blackforestlabs/flux-2-klein` | 2026-04-23 | [Model page](https://www.runcomfy.com/models/blackforestlabs/flux-2-klein/4b/text-to-image) |
| `bytedance/seedance-2.0` | 2026-04-03 | [Model page](https://www.runcomfy.com/models/bytedance/seedance-v2/fast) |
| `bytedance/seedance-2.0-mini` | 2026-06-24 | [Model page](https://www.runcomfy.com/models/bytedance/seedance-2.0-mini/image-to-video) |
| `elevenlabs/elevenlabs` | 2026-05-13 | [Model page](https://www.runcomfy.com/models/elevenlabs/elevenlabs/music-generation) |

## Input and output limits

- **Kling 3.0:** the nodes expose scalar controls and native media inputs. Optional `elements` and `multi_prompt` structured lists are omitted. These nodes do not offer the API's element editor or multi-scene timeline.
- **Kling O3:** optional `multi_prompt` lists are omitted. A source node using scene lists cannot be treated as an equivalent replacement.
- **Runway Aleph 2:** optional timestamped `keyframes` are omitted. The node supports its ordinary video and image guidance controls, without a keyframe timeline.
- **FLUX 3 keyframes:** `blackforestlabs/flux-3/keyframes-to-video` and its `/draft` variant require structured keyframe lists. They are excluded until a dedicated editor can represent that contract. First/last-frame nodes are included.
- **Seed Audio:** WAV, MP3 and Ogg Opus output are supported. Raw PCM is omitted because it has no self-describing channel or sample-rate information. Image and audio reference combinations remain subject to the model's rules.
- **Reference count:** published API limits are preserved. If the API omits a media-array maximum, this node package sets a local maximum of 16 references, disclosed in that node's limitations. This applies to some Seedance Mini, Gemini Omni Flash, Kling O3, PixVerse and Wan reference inputs. Inputs are never silently truncated.
- **Audio output:** downloaded output is capped at 64 MiB and decoded output at mono/stereo, ten minutes and 64 million total channel samples (256 MB of float32 samples). Native AUDIO connects to ComfyUI audio processing and saving nodes.
- **Input media:** per-input caps remain image PNG 6 MiB / 32 megapixels, video 32 MiB and audio 16 MiB PCM, with a combined request cap of 64 MiB. API-specific dimensions, durations, reference combinations and file limits still apply.
- **Pricing:** every added node uses base-only pricing obtained live from RunComfy. There are no hardcoded rates or fabricated parameter-sensitive totals.

Omitted fields are recorded in `omitted_inputs`, and user-visible restrictions in `limitations`. A switch must refuse to discard a populated or connected omitted field. Models without an exact official counterpart need an explicit changed-model choice or a clear unsupported explanation.

## Catalog maintenance

The registry is curated from public schemas, with sample prompts, lyrics, tags and media URLs removed. Enumerated settings and numeric/boolean defaults keep their API meanings. Nonstandard `float` schema fields become JSON Schema `number`.

Save the public `GET /v1/models?include_schema=true` response after fetching every page. Then use ComfyUI's Python environment to verify the checked-in registry without making any network or generation calls:

```sh
python scripts/update_model_catalog.py --catalog /path/to/catalog.json --check
```

For an intentional expansion, use `--selection /path/to/model-ids.json` with a reviewed JSON list of endpoint IDs and omit `--check`. Review the generated schema and frontend diff. The script leaves the original twelve Python contracts and frontend metadata intact. New families require an explicit naming entry, supported native output and reviewed input capabilities.

The updater checks supported price units and schema curation, but it does not prove runtime execution, provider revision equivalence, switch compatibility or successful paid output. Keep offline API tests, native ComfyUI tests and paid workflow proof clearly distinguished.
