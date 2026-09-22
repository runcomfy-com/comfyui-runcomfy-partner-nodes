// Node metadata mirrors runcomfy/models.json. Prices are always fetched at runtime.
export const MODELS = {
  "RunComfySeedance25I2V1080p": {
    "modelId": "bytedance/seedance-2.5/image-to-video/1080p",
    "outputType": "VIDEO",
    "pricingMode": "fixed",
    "durationMin": 4,
    "durationMax": 30,
    "durationChoices": null
  },
  "RunComfySeedance25T2V1080p": {
    "modelId": "bytedance/seedance-2.5/text-to-video/1080p",
    "outputType": "VIDEO",
    "pricingMode": "fixed",
    "durationMin": 4,
    "durationMax": 30,
    "durationChoices": null
  },
  "RunComfySeedance25Reference1080p": {
    "modelId": "bytedance/seedance-2.5/reference-to-video/1080p",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "durationMin": 4,
    "durationMax": 30,
    "durationChoices": null
  },
  "RunComfySeedance25I2V4K": {
    "modelId": "bytedance/seedance-2.5/image-to-video/4k",
    "outputType": "VIDEO",
    "pricingMode": "fixed",
    "durationMin": 4,
    "durationMax": 30,
    "durationChoices": null
  },
  "RunComfySeedance25T2V4K": {
    "modelId": "bytedance/seedance-2.5/text-to-video/4k",
    "outputType": "VIDEO",
    "pricingMode": "fixed",
    "durationMin": 4,
    "durationMax": 30,
    "durationChoices": null
  },
  "RunComfySeedance25Reference4K": {
    "modelId": "bytedance/seedance-2.5/reference-to-video/4k",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "durationMin": 4,
    "durationMax": 30,
    "durationChoices": null
  },
  "RunComfyWan30PrimeI2V": {
    "modelId": "wan-ai/wan-3.0-prime/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "durationMin": 2,
    "durationMax": 30,
    "durationChoices": null
  },
  "RunComfyWan30I2V": {
    "modelId": "wan-ai/wan-3.0/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "durationMin": 2,
    "durationMax": 30,
    "durationChoices": null
  },
  "RunComfyFlux3Video": {
    "modelId": "blackforestlabs/flux-3/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "durationMin": 4,
    "durationMax": 30,
    "durationChoices": [
      "auto",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
      "13",
      "14",
      "15",
      "16",
      "17",
      "18",
      "19",
      "20"
    ]
  },
  "RunComfyNanoBanana2LiteT2I": {
    "modelId": "google/nano-banana-2-lite/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "fixed",
    "durationMin": 4,
    "durationMax": 30,
    "durationChoices": null
  },
  "RunComfyNanoBanana2LiteEdit": {
    "modelId": "google/nano-banana-2-lite/edit",
    "outputType": "IMAGE",
    "pricingMode": "fixed",
    "durationMin": 4,
    "durationMax": 30,
    "durationChoices": null
  },
  "RunComfySeedream50ProI2I": {
    "modelId": "bytedance/seedream-5.0-pro/image-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "durationMin": 4,
    "durationMax": 30,
    "durationChoices": null
  }
};
