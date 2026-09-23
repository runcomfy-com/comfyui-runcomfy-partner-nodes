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
  },
  "RunComfyACEStep15T2A": {
    "modelId": "acestep-ai/ace-step-1.5/text-to-audio",
    "outputType": "AUDIO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 5,
    "durationMax": 240
  },
  "RunComfyACEStepAudioInpaint": {
    "modelId": "acestep-ai/ace-step/audio-inpaint",
    "outputType": "AUDIO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "audio"
      ]
    ]
  },
  "RunComfyACEStepAudioOutpaint": {
    "modelId": "acestep-ai/ace-step/audio-outpaint",
    "outputType": "AUDIO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "audio"
      ]
    ]
  },
  "RunComfyACEStepT2A": {
    "modelId": "acestep-ai/ace-step/text-to-audio",
    "outputType": "AUDIO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 5,
    "durationMax": 240
  },
  "RunComfyHappyHorse11I2V": {
    "modelId": "alibaba/happyhorse-1.1/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationChoices": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  "RunComfyHappyHorse11Reference": {
    "modelId": "alibaba/happyhorse-1.1/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image_url_1"
      ]
    ],
    "durationChoices": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  "RunComfyHappyHorse11T2V": {
    "modelId": "alibaba/happyhorse-1.1/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 3,
    "durationMax": 15
  },
  "RunComfyFlux2Klein4BT2I": {
    "modelId": "blackforestlabs/flux-2-klein/4b/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyFlux2Klein9BT2I": {
    "modelId": "blackforestlabs/flux-2-klein/9b/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyFlux3Extend": {
    "modelId": "blackforestlabs/flux-3/extend-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "video"
      ]
    ],
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
  "RunComfyFlux3ExtendDraft": {
    "modelId": "blackforestlabs/flux-3/extend-video/draft",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "video"
      ]
    ],
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
  "RunComfyFlux3FirstLastFrame": {
    "modelId": "blackforestlabs/flux-3/first-last-frame-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "end_image"
      ],
      [
        "start_image"
      ]
    ],
    "durationChoices": [
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20
    ]
  },
  "RunComfyFlux3FirstLastFrameDraft": {
    "modelId": "blackforestlabs/flux-3/first-last-frame-to-video/draft",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "end_image"
      ],
      [
        "start_image"
      ]
    ],
    "durationChoices": [
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20
    ]
  },
  "RunComfyFlux3Image": {
    "modelId": "blackforestlabs/flux-3/image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyFlux3I2V": {
    "modelId": "blackforestlabs/flux-3/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
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
  "RunComfyFlux3I2VDraft": {
    "modelId": "blackforestlabs/flux-3/image-to-video/draft",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
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
  "RunComfyFlux3T2VDraft": {
    "modelId": "blackforestlabs/flux-3/text-to-video/draft",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
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
  "RunComfySeedAudio10T2A": {
    "modelId": "bytedance/seed-audio-1.0/text-to-audio",
    "outputType": "AUDIO",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfySeedance20MiniI2V": {
    "modelId": "bytedance/seedance-2.0-mini/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationMin": 4,
    "durationMax": 15
  },
  "RunComfySeedance20MiniT2V": {
    "modelId": "bytedance/seedance-2.0-mini/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 4,
    "durationMax": 15
  },
  "RunComfySeedance20MiniV2V": {
    "modelId": "bytedance/seedance-2.0-mini/video-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "video"
      ]
    ],
    "durationMin": 4,
    "durationMax": 15
  },
  "RunComfySeedance20Fast": {
    "modelId": "bytedance/seedance-2.0/fast",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 4,
    "durationMax": 15
  },
  "RunComfySeedance20Pro": {
    "modelId": "bytedance/seedance-2.0/pro",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 4,
    "durationMax": 15
  },
  "RunComfySeedance25FirstLastFrame480p": {
    "modelId": "bytedance/seedance-2.5/first-last-frame/480p",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "first_frame"
      ],
      [
        "last_frame"
      ]
    ],
    "durationMin": 4,
    "durationMax": 30
  },
  "RunComfySeedance25FirstLastFrame720p": {
    "modelId": "bytedance/seedance-2.5/first-last-frame/720p",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "first_frame"
      ],
      [
        "last_frame"
      ]
    ],
    "durationMin": 4,
    "durationMax": 30
  },
  "RunComfySeedance25I2V480p": {
    "modelId": "bytedance/seedance-2.5/image-to-video/480p",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationMin": 4,
    "durationMax": 30
  },
  "RunComfySeedance25I2V720p": {
    "modelId": "bytedance/seedance-2.5/image-to-video/720p",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationMin": 4,
    "durationMax": 30
  },
  "RunComfySeedance25Reference480p": {
    "modelId": "bytedance/seedance-2.5/reference-to-video/480p",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 4,
    "durationMax": 30
  },
  "RunComfySeedance25Reference720p": {
    "modelId": "bytedance/seedance-2.5/reference-to-video/720p",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 4,
    "durationMax": 30
  },
  "RunComfySeedance25T2V480p": {
    "modelId": "bytedance/seedance-2.5/text-to-video/480p",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 4,
    "durationMax": 30
  },
  "RunComfySeedance25T2V720p": {
    "modelId": "bytedance/seedance-2.5/text-to-video/720p",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 4,
    "durationMax": 30
  },
  "RunComfySeedream50ProT2I": {
    "modelId": "bytedance/seedream-5.0-pro/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyElevenLabsMusic": {
    "modelId": "elevenlabs/elevenlabs/music-generation",
    "outputType": "AUDIO",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyGeminiOmniFlashI2V": {
    "modelId": "google/gemini-omni-flash/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationMin": 3,
    "durationMax": 10
  },
  "RunComfyGeminiOmniFlashReference": {
    "modelId": "google/gemini-omni-flash/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "images"
      ]
    ],
    "durationMin": 3,
    "durationMax": 10
  },
  "RunComfyGeminiOmniFlashT2V": {
    "modelId": "google/gemini-omni-flash/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 3,
    "durationMax": 10
  },
  "RunComfyGeminiOmniFlashVideoEdit": {
    "modelId": "google/gemini-omni-flash/video-edit",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "video"
      ]
    ]
  },
  "RunComfyHappyHorse10I2V": {
    "modelId": "happyhorse/happyhorse-1.0/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationChoices": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  "RunComfyHappyHorse10Reference": {
    "modelId": "happyhorse/happyhorse-1.0/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image_url_1"
      ]
    ],
    "durationChoices": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  "RunComfyHappyHorse10T2V": {
    "modelId": "happyhorse/happyhorse-1.0/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationChoices": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  "RunComfyHappyHorse10VideoEdit": {
    "modelId": "happyhorse/happyhorse-1.0/video-edit",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "video"
      ]
    ]
  },
  "RunComfyIdeogram4T2I": {
    "modelId": "ideogram-ai/ideogram-v4/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyKling304KI2V": {
    "modelId": "kling/kling-3.0/4k/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "start_image"
      ]
    ],
    "durationMin": 3,
    "durationMax": 15
  },
  "RunComfyKling304KT2V": {
    "modelId": "kling/kling-3.0/4k/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 3,
    "durationMax": 15
  },
  "RunComfyKling30ProI2V": {
    "modelId": "kling/kling-3.0/pro/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "start_image"
      ]
    ],
    "durationMin": 3,
    "durationMax": 15
  },
  "RunComfyKling30ProT2V": {
    "modelId": "kling/kling-3.0/pro/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 3,
    "durationMax": 15
  },
  "RunComfyKling30StandardI2V": {
    "modelId": "kling/kling-3.0/standard/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationMin": 3,
    "durationMax": 15
  },
  "RunComfyKling30StandardT2V": {
    "modelId": "kling/kling-3.0/standard/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 3,
    "durationMax": 15
  },
  "RunComfyKlingO34KI2V": {
    "modelId": "kling/kling-video-o3/4K/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationChoices": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  "RunComfyKlingO34KReference": {
    "modelId": "kling/kling-video-o3/4K/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationChoices": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  "RunComfyKlingO34KT2V": {
    "modelId": "kling/kling-video-o3/4K/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationChoices": [
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  "RunComfyKlingO3ProI2V": {
    "modelId": "kling/kling-video-o3/pro/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationMin": 3,
    "durationMax": 15
  },
  "RunComfyKlingO3ProReference": {
    "modelId": "kling/kling-video-o3/pro/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 3,
    "durationMax": 15
  },
  "RunComfyKlingO3ProT2V": {
    "modelId": "kling/kling-video-o3/pro/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationChoices": [
      5,
      10
    ]
  },
  "RunComfyKlingO3ProV2V": {
    "modelId": "kling/kling-video-o3/pro/video-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "video"
      ]
    ]
  },
  "RunComfyKlingO3StandardI2V": {
    "modelId": "kling/kling-video-o3/standard/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationMin": 3,
    "durationMax": 15
  },
  "RunComfyKlingO3StandardReference": {
    "modelId": "kling/kling-video-o3/standard/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 3,
    "durationMax": 15
  },
  "RunComfyKlingO3StandardT2V": {
    "modelId": "kling/kling-video-o3/standard/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 3,
    "durationMax": 15
  },
  "RunComfyKlingO3StandardV2V": {
    "modelId": "kling/kling-video-o3/standard/video-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "video"
      ]
    ]
  },
  "RunComfyLTX25A2VFast": {
    "modelId": "lightricks/ltx-2.5/audio-to-video/fast",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "audio"
      ]
    ]
  },
  "RunComfyLTX25A2VPro": {
    "modelId": "lightricks/ltx-2.5/audio-to-video/pro",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "audio"
      ]
    ]
  },
  "RunComfyLTX25I2VFast": {
    "modelId": "lightricks/ltx-2.5/image-to-video/fast",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationChoices": [
      "auto",
      "6",
      "8",
      "10",
      "12",
      "14",
      "16",
      "18",
      "20"
    ]
  },
  "RunComfyLTX25I2VPro": {
    "modelId": "lightricks/ltx-2.5/image-to-video/pro",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationChoices": [
      "auto",
      "6",
      "8",
      "10"
    ]
  },
  "RunComfyLTX25T2VFast": {
    "modelId": "lightricks/ltx-2.5/text-to-video/fast",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationChoices": [
      "auto",
      "6",
      "8",
      "10",
      "12",
      "14",
      "16",
      "18",
      "20"
    ]
  },
  "RunComfyLTX25T2VPro": {
    "modelId": "lightricks/ltx-2.5/text-to-video/pro",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationChoices": [
      "auto",
      "6",
      "8",
      "10"
    ]
  },
  "RunComfyMiniMaxH3MaxI2V": {
    "modelId": "minimax/minimax-h3-max/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationMin": 5,
    "durationMax": 15
  },
  "RunComfyMiniMaxH3MaxReference": {
    "modelId": "minimax/minimax-h3-max/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "images"
      ]
    ],
    "durationMin": 5,
    "durationMax": 15
  },
  "RunComfyMiniMaxH3MaxT2V": {
    "modelId": "minimax/minimax-h3-max/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 5,
    "durationMax": 15
  },
  "RunComfyMiniMaxH3OpenI2V": {
    "modelId": "minimax/minimax-h3-open/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationMin": 5,
    "durationMax": 15
  },
  "RunComfyMiniMaxH3OpenReference": {
    "modelId": "minimax/minimax-h3-open/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "images"
      ]
    ],
    "durationMin": 5,
    "durationMax": 15
  },
  "RunComfyMiniMaxH3OpenT2V": {
    "modelId": "minimax/minimax-h3-open/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationChoices": [
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  "RunComfyMiniMaxH3I2V": {
    "modelId": "minimax/minimax-h3/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationMin": 4,
    "durationMax": 15
  },
  "RunComfyMiniMaxH3Reference": {
    "modelId": "minimax/minimax-h3/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 4,
    "durationMax": 15
  },
  "RunComfyMiniMaxH3T2V": {
    "modelId": "minimax/minimax-h3/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationChoices": [
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  "RunComfyGPTImage25FlareEdit": {
    "modelId": "openai/gpt-image-2.5/flare/edit",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "images"
      ]
    ]
  },
  "RunComfyGPTImage25FlareT2I": {
    "modelId": "openai/gpt-image-2.5/flare/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyGPTImage25SunburstEdit": {
    "modelId": "openai/gpt-image-2.5/sunburst/edit",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "images"
      ]
    ]
  },
  "RunComfyGPTImage25SunburstT2I": {
    "modelId": "openai/gpt-image-2.5/sunburst/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyGPTImage2Edit": {
    "modelId": "openai/gpt-image-2/edit",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "images"
      ]
    ]
  },
  "RunComfyGPTImage2T2I": {
    "modelId": "openai/gpt-image-2/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyPixVerseC1I2V": {
    "modelId": "pixverse/pixverse-c1/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationMin": 1,
    "durationMax": 15
  },
  "RunComfyPixVerseC1Reference": {
    "modelId": "pixverse/pixverse-c1/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 1,
    "durationMax": 15
  },
  "RunComfyPixVerseC1T2V": {
    "modelId": "pixverse/pixverse-c1/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 1,
    "durationMax": 15
  },
  "RunComfyPixVerseC1Transition": {
    "modelId": "pixverse/pixverse-c1/transition",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "end_image"
      ],
      [
        "image"
      ]
    ],
    "durationMin": 1,
    "durationMax": 15
  },
  "RunComfyPixVerseV6Extend": {
    "modelId": "pixverse/pixverse-v6/extend",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "video"
      ]
    ],
    "durationMin": 1,
    "durationMax": 15
  },
  "RunComfyPixVerseV6I2V": {
    "modelId": "pixverse/pixverse-v6/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationMin": 1,
    "durationMax": 15
  },
  "RunComfyPixVerseV6Reference": {
    "modelId": "pixverse/pixverse-v6/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 1,
    "durationMax": 15
  },
  "RunComfyPixVerseV6T2V": {
    "modelId": "pixverse/pixverse-v6/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 1,
    "durationMax": 15
  },
  "RunComfyPixVerseV6Transition": {
    "modelId": "pixverse/pixverse-v6/transition",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "end_image"
      ],
      [
        "image"
      ]
    ],
    "durationMin": 1,
    "durationMax": 15
  },
  "RunComfyQwenImage21Edit": {
    "modelId": "qwen/qwen-image-2.1/edit",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "images"
      ]
    ]
  },
  "RunComfyQwenImage21T2I": {
    "modelId": "qwen/qwen-image-2.1/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyQwenImage30Edit": {
    "modelId": "qwen/qwen-image-3.0/edit",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "images"
      ]
    ]
  },
  "RunComfyQwenImage30ProEdit": {
    "modelId": "qwen/qwen-image-3.0/pro/edit",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "images"
      ]
    ]
  },
  "RunComfyQwenImage30ProT2I": {
    "modelId": "qwen/qwen-image-3.0/pro/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyQwenImage30T2I": {
    "modelId": "qwen/qwen-image-3.0/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyRunwayAleph2V2V": {
    "modelId": "runwayml/runway-aleph-2/video-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "video"
      ]
    ]
  },
  "RunComfyWan27Edit": {
    "modelId": "wan-ai/wan-2.7/edit",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "images"
      ]
    ]
  },
  "RunComfyWan27VideoEdit": {
    "modelId": "wan-ai/wan-2.7/edit-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "video"
      ]
    ],
    "durationChoices": [
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ]
  },
  "RunComfyWan27I2V": {
    "modelId": "wan-ai/wan-2.7/image-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "image"
      ]
    ],
    "durationChoices": [
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  "RunComfyWan27ProEdit": {
    "modelId": "wan-ai/wan-2.7/pro/edit",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": [
      [
        "images"
      ]
    ]
  },
  "RunComfyWan27ProT2I": {
    "modelId": "wan-ai/wan-2.7/pro/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyWan27Reference": {
    "modelId": "wan-ai/wan-2.7/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationChoices": [
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10
    ]
  },
  "RunComfyWan27T2I": {
    "modelId": "wan-ai/wan-2.7/text-to-image",
    "outputType": "IMAGE",
    "pricingMode": "base",
    "requiredMedia": []
  },
  "RunComfyWan27T2V": {
    "modelId": "wan-ai/wan-2.7/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationChoices": [
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15
    ]
  },
  "RunComfyWan30PrimeReference": {
    "modelId": "wan-ai/wan-3.0-prime/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 2,
    "durationMax": 30
  },
  "RunComfyWan30PrimeT2V": {
    "modelId": "wan-ai/wan-3.0-prime/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 2,
    "durationMax": 30
  },
  "RunComfyWan30Reference": {
    "modelId": "wan-ai/wan-3.0/reference-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 2,
    "durationMax": 30
  },
  "RunComfyWan30T2V": {
    "modelId": "wan-ai/wan-3.0/text-to-video",
    "outputType": "VIDEO",
    "pricingMode": "base",
    "requiredMedia": [],
    "durationMin": 2,
    "durationMax": 30
  }
};
