#!/usr/bin/env python3
"""Curate a saved public Model API response into native ComfyUI node catalogs.

This offline tool never requests credentials, contacts a service, or submits a job.
Pass --selection with a JSON list of model IDs, or an object containing candidates
with model_id fields. Without it, regenerate the models already in the registry.
The original twelve contracts and their frontend metadata are preserved verbatim.
"""

import argparse
import copy
import json
import sys
from pathlib import Path
from types import SimpleNamespace


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from runcomfy.inputs import media_ports
LEGACY_CLASSES = {
    "RunComfySeedance25I2V1080p", "RunComfySeedance25T2V1080p",
    "RunComfySeedance25Reference1080p", "RunComfySeedance25I2V4K",
    "RunComfySeedance25T2V4K", "RunComfySeedance25Reference4K",
    "RunComfyWan30PrimeI2V", "RunComfyWan30I2V", "RunComfyFlux3Video",
    "RunComfyNanoBanana2LiteT2I", "RunComfyNanoBanana2LiteEdit",
    "RunComfySeedream50ProI2I",
}
FAMILIES = {
    "ace-step-1.5": ("ACEStep15", "ACE-Step 1.5"),
    "ace-step": ("ACEStep", "ACE-Step"),
    "happyhorse-1.1": ("HappyHorse11", "HappyHorse 1.1"),
    "happyhorse-1.0": ("HappyHorse10", "HappyHorse 1.0"),
    "flux-2-klein": ("Flux2Klein", "FLUX 2 Klein"),
    "flux-3": ("Flux3", "FLUX 3"),
    "seed-audio-1.0": ("SeedAudio10", "Seed Audio 1.0"),
    "seedance-2.0-mini": ("Seedance20Mini", "Seedance 2.0 Mini"),
    "seedance-2.0": ("Seedance20", "Seedance 2.0"),
    "seedance-2.5": ("Seedance25", "Seedance 2.5"),
    "seedream-5.0-pro": ("Seedream50Pro", "Seedream 5.0 Pro"),
    "elevenlabs": ("ElevenLabs", "ElevenLabs"),
    "gemini-omni-flash": ("GeminiOmniFlash", "Gemini Omni Flash"),
    "nano-banana-2-lite": ("NanoBanana2Lite", "Nano Banana 2 Lite"),
    "ideogram-v4": ("Ideogram4", "Ideogram 4"),
    "kling-3.0": ("Kling30", "Kling 3.0"),
    "kling-video-o3": ("KlingO3", "Kling O3"),
    "ltx-2.5": ("LTX25", "LTX 2.5"),
    "minimax-h3-max": ("MiniMaxH3Max", "MiniMax H3 Max"),
    "minimax-h3-open": ("MiniMaxH3Open", "MiniMax H3 Open"),
    "minimax-h3": ("MiniMaxH3", "MiniMax H3"),
    "gpt-image-2.5": ("GPTImage25", "GPT Image 2.5"),
    "gpt-image-2": ("GPTImage2", "GPT Image 2"),
    "pixverse-c1": ("PixVerseC1", "PixVerse C1"),
    "pixverse-v6": ("PixVerseV6", "PixVerse V6"),
    "qwen-image-2.1": ("QwenImage21", "Qwen Image 2.1"),
    "qwen-image-3.0": ("QwenImage30", "Qwen Image 3.0"),
    "runway-aleph-2": ("RunwayAleph2", "Runway Aleph 2"),
    "wan-2.7": ("Wan27", "Wan 2.7"),
    "wan-3.0-prime": ("Wan30Prime", "Wan 3.0 Prime"),
    "wan-3.0": ("Wan30", "Wan 3.0"),
}
MODES = {
    "text-to-image": "T2I", "image-to-image": "I2I",
    "text-to-video": "T2V", "image-to-video": "I2V",
    "reference-to-video": "Reference", "video-to-video": "V2V",
    "audio-to-video": "A2V", "text-to-audio": "T2A",
    "first-last-frame": "FirstLastFrame",
    "first-last-frame-to-video": "FirstLastFrame",
    "audio-inpaint": "AudioInpaint", "audio-outpaint": "AudioOutpaint",
    "extend-video": "Extend", "edit-video": "VideoEdit",
    "video-edit": "VideoEdit", "music-generation": "Music",
    "4k": "4K", "4b": "4B", "9b": "9B",
    "480p": "480p", "720p": "720p", "1080p": "1080p",
}
MEDIA_FORMATS = {"image_uri", "image_uris", "video_uri", "video_uris", "audio_uri", "audio_uris"}


def names(model_id):
    _, family, *modes = model_id.split("/")
    class_family, display_family = FAMILIES[family]
    suffixes = [MODES.get(mode.lower(), mode.title()) for mode in modes]
    return "RunComfy" + class_family + "".join(suffixes), "RunComfy " + display_family + " " + " ".join(suffixes)


def output_type(entry):
    outputs = set()
    for category in entry["categories"]:
        if category.endswith("audio"):
            outputs.add("AUDIO")
        elif category.endswith("image"):
            outputs.add("IMAGE")
        elif category.endswith("video"):
            outputs.add("VIDEO")
    if len(outputs) != 1:
        raise ValueError(f"Ambiguous native output for {entry['model_id']}")
    return outputs.pop()


def normalize_property(name, prop):
    prop = copy.deepcopy(prop)
    if prop.get("type") == "float":
        prop["type"] = "number"
    if prop.get("format") in MEDIA_FORMATS:
        prop.pop("default", None)
    elif ("prompt" in name or name in {"text", "lyrics", "caption", "tags"}) and prop.get("type") == "string" and "enum" not in prop:
        prop["default"] = ""
    return prop


def curate(entry):
    model_id = entry["model_id"]
    if entry.get("kind") != "model":
        raise ValueError(f"Only hosted model endpoints are supported: {model_id}")
    if entry.get("price_unit") not in {"output", "second"}:
        raise ValueError(f"Unsupported live price unit: {model_id}")
    schema = copy.deepcopy(entry["input_schema"])
    required = schema.get("required", [])
    omitted = []
    limitations = []
    properties = {}
    for name, original in schema.get("properties", {}).items():
        prop = normalize_property(name, original)
        structured = prop.get("type") in {"array", "object"} and prop.get("format") not in MEDIA_FORMATS
        if structured:
            if name in required:
                return None, f"{model_id}: required structured input {name} needs a dedicated editor."
            omitted.append(name)
            continue
        if prop.get("type") not in {"string", "integer", "number", "boolean", "array"}:
            raise ValueError(f"Unsupported property type: {model_id}/{name}")
        if prop.get("format", "").endswith("_uris") and "maxItems" not in prop:
            prop["maxItems"] = 16
            limitations.append(f"{name} accepts at most 16 references in this node; the API does not publish a maximum.")
        if model_id == "bytedance/seed-audio-1.0/text-to-audio" and name == "output_format":
            prop["enum"] = [value for value in prop["enum"] if value != "pcm"]
            limitations.append("Raw PCM output is unavailable because it has no self-describing sample rate or channel layout; choose WAV, MP3 or Ogg Opus.")
        properties[name] = prop
    if omitted:
        limitations.insert(0, "This node does not expose the optional structured inputs: " + ", ".join(omitted) + ".")
    schema["properties"] = properties
    node_class, display_name = names(model_id)
    result = {"model_id": model_id, "node_class": node_class, "display_name": display_name,
              "output_type": output_type(entry), "pricing_mode": "base", "schema": schema}
    if limitations:
        result["limitations"] = limitations
    if omitted:
        result["omitted_inputs"] = omitted
    return result, None


def frontend_metadata(model):
    result = {"modelId": model["model_id"], "outputType": model["output_type"], "pricingMode": model["pricing_mode"]}
    ports = media_ports(SimpleNamespace(schema=model["schema"]))
    result["requiredMedia"] = [names for key, (_, names) in ports.items() if key in model["schema"].get("required", [])]
    duration = model["schema"].get("properties", {}).get("duration", {})
    for source, target in [("minimum", "durationMin"), ("maximum", "durationMax"), ("enum", "durationChoices")]:
        if source in duration:
            result[target] = duration[source]
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--catalog", required=True, type=Path)
    parser.add_argument("--selection", type=Path)
    parser.add_argument("--check", action="store_true", help="Verify the existing files without writing them")
    args = parser.parse_args()
    registry_path = ROOT / "runcomfy/models.json"
    frontend_path = ROOT / "web/runcomfy-models.mjs"
    current = json.loads(registry_path.read_text())
    frontend_text = frontend_path.read_text()
    current_frontend = json.loads(frontend_text.split("export const MODELS = ", 1)[1].strip().removesuffix(";"))
    original = [model for model in current if model["node_class"] in LEGACY_CLASSES]
    if len(original) != 12:
        raise ValueError("Original node contracts are missing")
    selected = [m["model_id"] for m in current]
    if args.selection:
        selected = json.loads(args.selection.read_text())
        if isinstance(selected, dict):
            selected = selected["candidates"]
        selected = [item["model_id"] if isinstance(item, dict) else item for item in selected]
    payload = json.loads(args.catalog.read_text())
    catalog = {model["model_id"]: model for model in payload["models"]}
    original_ids = {model["model_id"] for model in original}
    models = list(original)
    excluded = []
    for model_id in sorted(set(selected) - original_ids):
        model, reason = curate(catalog[model_id])
        if model:
            models.append(model)
        else:
            excluded.append(reason)
    if len({model["node_class"] for model in models}) != len(models):
        raise ValueError("Duplicate node class")
    frontend = {model["node_class"]: current_frontend[model["node_class"]] if model["node_class"] in LEGACY_CLASSES else frontend_metadata(model) for model in models}
    registry_content = json.dumps(models, indent=2, ensure_ascii=False) + "\n"
    frontend_content = "// Node metadata mirrors runcomfy/models.json. Prices are always fetched at runtime.\nexport const MODELS = " + json.dumps(frontend, indent=2, ensure_ascii=False) + ";\n"
    if args.check:
        if registry_path.read_text() != registry_content or frontend_text != frontend_content:
            raise SystemExit("Catalog drift: regenerate and review the changed schemas.")
    else:
        registry_path.write_text(registry_content)
        frontend_path.write_text(frontend_content)
    print(f"{len(models)} native nodes; {len(models) - len(original)} added contracts; {len(excluded)} excluded structured-input endpoints.")
    for reason in excluded:
        print(reason)


if __name__ == "__main__":
    main()
