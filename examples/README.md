# Recent model workflows

Drag a JSON file onto ComfyUI or use **Workflow → Open**. These are visual workflows, with native save nodes already connected. Import with Run on Change / Run Instant turned off; importing does not submit a generation.

| Workflow | What it does | Before choosing Run |
| --- | --- | --- |
| [GPT Image 2.5 Flare](gpt-image-2.5-flare.json) | Text → IMAGE → Save Image | Review the prompt, quality, resolution, and current RunComfy rate. |
| [MiniMax H3](minimax-h3-text-to-video.json) | Text → VIDEO → Save Video | Review the prompt and five-second duration. |
| [LTX 2.5 Audio to Video](ltx-2.5-audio-to-video.json) | Load Audio → VIDEO → Save Video | Upload a 2–20 second audio clip in Load Audio, then review the visual prompt. |
| [Seed Audio 1.0](seed-audio-1.0-speech.json) | Text → AUDIO → Save Audio | Review the spoken text and voice. Optional image and audio references cannot be combined. |
| [ACE-Step 1.5](ace-step-1.5-music.json) | Tags and lyrics → AUDIO → Save Audio | Review the music tags and 20-second duration. The sample is instrumental. |

Configure the account in **Settings → RunComfy** if your hosted machine has not supplied it. Choosing **Run** submits a paid generation using that RunComfy account. No credentials or request IDs are included in these files.

The rerun controls start fixed. A cached result can be reused; change the prompt or seed/rerun control when you want a new generation. Audio examples use the current native Save Audio (Advanced) node with FLAC output. Update ComfyUI if that node is missing.

These examples have been checked locally with native ComfyUI node definitions and offline media tests. They are not evidence of paid live generation. Older examples remain in [example_workflows](../example_workflows).
