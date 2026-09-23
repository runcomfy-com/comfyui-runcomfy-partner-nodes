/** Family-scoped adapters for official ComfyUI API nodes. No adapter submits a job. */
import { MODELS } from './runcomfy-models.mjs';

// Explicit class allowlist: never infer compatibility from a third-party display name.
export const RECENT_SOURCES = {
  ByteDance2TextToVideoNode: ['seedance', ['T2V', 'Fast', 'Pro']],
  ByteDance2FirstLastFrameNode: ['seedance', ['I2V', 'FirstLastFrame', 'Fast', 'Pro']],
  ByteDance2ReferenceNode: ['seedance', ['Reference', 'V2V', 'Fast', 'Pro']],
  ByteDance2ReferenceNodeV2: ['seedance', ['Reference', 'V2V', 'Fast', 'Pro']],
  ByteDanceSeedreamNode: ['seedream'], ByteDanceSeedreamNodeV2: ['seedream'], ByteDanceSeedreamNodeV3: ['seedream'],
  Flux3TextToVideoNode: ['fluxvideo', ['T2V']],
  Flux3ImageToVideoNode: ['fluxvideo', ['I2V', 'FirstLastFrame']],
  Flux3VideoContinuationNode: ['fluxvideo', ['Extend']],
  Flux2ImageNode: ['fluximage'],
  OpenAIGPTImage1: ['gpt'], OpenAIGPTImageNodeV2: ['gpt'],
  GeminiVideoOmni: ['omni'], GeminiVideoOmniV2: ['omni'],
  HappyHorseTextToVideoApi: ['happyhorse', ['T2V']], HappyHorseImageToVideoApi: ['happyhorse', ['I2V']],
  HappyHorseReferenceVideoApi: ['happyhorse', ['Reference']], HappyHorseVideoEditApi: ['happyhorse', ['VideoEdit']],
  MinimaxHailuo03TextToVideoNode: ['minimax', ['T2V']], MinimaxHailuo03FirstLastFrameNode: ['minimax', ['I2V']],
  MinimaxHailuo03ReferenceNode: ['minimax', ['Reference']],
  LtxApi25TextToVideo: ['ltx', ['T2V']], LtxApi25ImageToVideo: ['ltx', ['I2V']], LtxApi25AudioToVideo: ['ltx', ['A2V']],
  QwenImageTextToImageApi: ['qwen', ['T2I']], QwenImageEditApi: ['qwen', ['Edit']],
  KlingVideoNode: ['kling', ['T2V', 'I2V']], KlingFirstLastFrameNode: ['kling', ['I2V']],
  KlingOmniProTextToVideoNode: ['klingo3', ['T2V']], KlingOmniProFirstLastFrameNode: ['klingo3', ['I2V']],
  KlingOmniProImageToVideoNode: ['klingo3', ['Reference']], KlingOmniProVideoToVideoNode: ['klingo3', ['Reference']],
  KlingOmniProEditVideoNode: ['klingo3', ['V2V']],
  PixverseV6TextToVideoNode: ['pixverse', ['T2V']], PixverseV6ImageToVideoNode: ['pixverse', ['I2V']],
  PixverseV6FirstLastFrameNode: ['pixverse', ['Transition']], PixverseV6ExtendVideoNode: ['pixverse', ['Extend']],
  PixverseV6FusionVideoNode: ['pixverse', ['Reference']],
  PixverseTextToVideoNode: ['pixverse', ['T2V']], PixverseImageToVideoNode: ['pixverse', ['I2V']],
  PixverseTransitionVideoNode: ['pixverse', ['Transition']],
  RunwayAleph2VideoToVideoNode: ['aleph'], IdeogramV4: ['ideogram'], IdeogramV3: ['ideogram'],
  ByteDanceSeedAudio: ['seedaudio'],
  Wan3ImageToVideoApi: ['wanvideo', ['I2V']], Wan3ReferenceToVideoApi: ['wanvideo', ['Reference', 'T2V']],
  WanTextToVideoApi: ['wanvideo', ['T2V']], WanImageToVideoApi: ['wanvideo', ['I2V']],
  WanReferenceVideoApi: ['wanvideo', ['Reference']],
  Wan2TextToVideoApi: ['wanvideo', ['T2V']], Wan2ImageToVideoApi: ['wanvideo', ['I2V']],
  Wan2VideoEditApi: ['wanvideo', ['VideoEdit']], Wan2ReferenceVideoApi: ['wanvideo', ['Reference']],
  Wan2VideoContinuationApi: ['wanvideo', ['I2V']],
  WanTextToImageApi: ['wanimage', ['T2I']], WanImageToImageApi: ['wanimage', ['Edit']],
};
const FAMILY_PREFIX = {
  seedance: /^RunComfySeedance/, seedream: /^RunComfySeedream/, fluxvideo: /^RunComfyFlux3(?!Image$)/,
  fluximage: /^RunComfyFlux(?:2Klein|3Image)/, gpt: /^RunComfyGPTImage/, omni: /^RunComfyGeminiOmni/,
  happyhorse: /^RunComfyHappyHorse/, minimax: /^RunComfyMiniMax/, ltx: /^RunComfyLTX25/,
  qwen: /^RunComfyQwenImage/, kling: /^RunComfyKling30/, klingo3: /^RunComfyKlingO3/,
  pixverse: /^RunComfyPixVerse/, aleph: /^RunComfyRunwayAleph2/, ideogram: /^RunComfyIdeogram4/,
  seedaudio: /^RunComfySeedAudio/, wanvideo: /^RunComfyWan(?:27|30)/,
  wanimage: /^RunComfyWan27(?:Pro)?(?:T2I|Edit)$/,
};
const sourceType = node => node.comfyClass || node.constructor?.comfyClass || node.type;
const linked = (node, expression) => (node.inputs || []).filter(i => i.link != null && expression.test(i.name));
const targetKind = id => id === 'RunComfyFlux3Video' ? 'T2V' : id.match(/(FirstLastFrame|Transition|VideoEdit|Reference|Extend|T2V|I2V|V2V|A2V|T2I|Edit)/)?.[1] || id.match(/(Fast|Pro)$/)?.[1];

export function recentSwitchTargets(node, definitions) {
  const [family, modes] = RECENT_SOURCES[sourceType(node)] || [];
  if (!family) return [];
  const hasImages = linked(node, /(?:^image$|(?:^|\.)images\.)/).length > 0;
  return Object.keys(MODELS).filter(id => {
    if (!FAMILY_PREFIX[family].test(id) || (definitions && !definitions[id])) return false;
    const kind = targetKind(id);
    if (modes && !modes.includes(kind)) return false;
    if (family === 'gpt' && kind !== (hasImages ? 'Edit' : 'T2I')) return false;
    if (sourceType(node) === 'KlingVideoNode' && kind !== (linked(node, /^start_frame$/).length ? 'I2V' : 'T2V')) return false;
    return true;
  });
}

/** All schema-sensitive value conversion happens here, before the native graph transaction. */
export function mapRecentSwitch({ node, targetId, values, sourceSpecs, targetSpecs, map, inputMap, settings, errors, notes }) {
  const sourceId = sourceType(node), [family] = RECENT_SOURCES[sourceId] || [];
  const target = MODELS[targetId], kind = targetKind(targetId), model = values.model ?? values.model_name;
  if (!family || !target) { errors.push('This official model has no verified switch adapter.'); return; }
  notes.push(`Explicit model/settings choice: ${model || sourceId} → ${target.modelId}. This is not a promise of identical provider output.`);
  const inputs = node.inputs || [];
  if (kind === 'Reference' && !inputs.some(i => i.link != null && ['IMAGE', 'VIDEO', 'AUDIO'].includes(i.type))) errors.push('Connect at least one supported media reference before choosing a reference-to-video target.');
  const hasSource = name => name in sourceSpecs || name in values || inputs.some(i => i.name === name);
  const field = (names, destination, transform) => {
    if (!targetSpecs[destination]) return;
    const source = [].concat(names).find(hasSource);
    if (source) map(source, destination, transform);
  };
  const simple = (names, destination = names) => field(names, destination);
  const ignore = (name, reason) => {
    if (!hasSource(name)) return;
    inputMap[name] = null;
    if (inputs.some(i => i.name === name && i.link != null)) errors.push(`Connected “${name}” cannot be converted to fixed target settings.`);
    if (reason) notes.push(reason);
  };
  const requireModel = allowed => {
    if (!allowed.includes(model)) errors.push(`The selected official model “${model ?? 'unknown'}” has no verified mapping. Select ${allowed.join(' or ')} first; other versions cannot be treated as equivalent.`);
  };
  const disabled = name => {
    if (hasSource(name) && values[name] !== 'disabled') errors.push(`“${name}” contains storyboards. RunComfy's structured storyboard input is not supported by this switch.`);
  };
  const firstPort = type => Object.keys(targetSpecs).find(n => targetSpecs[n][0] === type);
  const imagePort = () => targetSpecs.images ? 'images' : firstPort('IMAGE');
  const batch = (expression, destination = imagePort()) => {
    const refs = linked(node, expression);
    if (refs.length > 1) errors.push('Several separate image references are connected. Prepare one IMAGE batch with matching image dimensions before switching. No images will be resized or dropped automatically.');
    if (refs.length === 1 && destination) map(refs[0].name, destination);
  };
  const mediaSeries = (expression, type) => {
    const ports = Object.keys(targetSpecs).filter(n => targetSpecs[n][0] === type);
    for (const input of linked(node, expression)) {
      const index = Number(input.name.match(/(\d+)$/)?.[1]) - 1;
      if (index >= 0 && index < ports.length) map(input.name, ports[index]);
    }
  };
  const fixedResolution = source => {
    if (!hasSource(source)) return;
    const resolution = targetId.match(/(480p|720p|1080p|4K)$/)?.[1]
      || (/4K/.test(targetId) ? '4K' : /Standard/.test(targetId) ? '720p' : /Pro/.test(targetId) ? '1080p' : 'provider default');
    ignore(source, `Resolution: ${values[source]} → ${resolution}; an explicit target setting change.`);
  };
  const sizePreset = (name, widthName, heightName) => {
    const preset = values[name];
    if (preset === 'Custom' || preset === 'custom') { errors.push('Custom image dimensions cannot be preserved by this target. Select a named size first.'); return; }
    const dimensions = typeof preset === 'string' && preset.match(/(\d+)x(\d+)/);
    if (!dimensions) { errors.push('Automatic or input-dependent image dimensions cannot be preserved. Select a named size before switching.'); return; }
    const width = Number(dimensions[1]), height = Number(dimensions[2]);
    const gcd = (a, b) => b ? gcd(b, a % b) : a;
    const factor = gcd(width, height);
    settings.aspect_ratio = `${width / factor}:${height / factor}`;
    settings.resolution = Math.max(width, height) >= 3000 ? '4k' : Math.max(width, height) >= 2000 ? '2k' : '1k';
    ignore(name, `Image size: ${preset} → ${settings.resolution}, ${settings.aspect_ratio}. The endpoint chooses final pixel dimensions; this is an explicit size-setting change.`);
    // These dimensions are dormant when an official named preset is selected.
    if (widthName) ignore(widthName);
    if (heightName) ignore(heightName);
  };

  // These are true prompt aliases in the allowlisted official schemas.
  field(['model.prompt', 'prompt', 'text_prompt'], 'prompt');
  const seedSource = ['model.seed', 'seed'].find(hasSource);
  if (seedSource) {
    field(seedSource, targetSpecs.seed ? 'seed' : 'generation_seed');
    notes.push(targetSpecs.seed ? 'The seed value is copied to the target provider seed; reproducibility can differ.' : 'The copied seed controls reruns only; the target provider does not accept a reproducible seed.');
  }

  if (family === 'seedance') {
    requireModel(['Seedance 2.5', 'Seedance 2.0', 'Seedance 2.0 Fast', 'Seedance 2.0 Mini']);
    for (const name of ['duration', 'generate_audio', 'enable_web_search']) field('model.' + name, name);
    field('model.ratio', 'aspect_ratio');
    if (targetSpecs.resolution) field('model.resolution', 'resolution'); else fixedResolution('model.resolution');
    if (kind === 'FirstLastFrame') { field('first_frame', 'first_frame'); field('last_frame', 'last_frame'); }
    else { field('first_frame', 'image'); field('last_frame', 'last_image'); }
    batch(/^(?:model\.)?(?:reference_images|images)\.image_?\d+$/);
    mediaSeries(/^(?:model\.)?reference_videos\.video_?\d+$/, 'VIDEO');
    mediaSeries(/^(?:model\.)?reference_audios\.audio_?\d+$/, 'AUDIO');
    if (['Fast', 'Pro'].includes(kind) && linked(node, /^first_frame$/).length) errors.push('First/last-frame conditioning cannot be converted to generic reference images without changing its meaning. Use an image-to-video target.');
  } else if (family === 'seedream') {
    requireModel(['seedream 5.0 pro']);
    const prefix = sourceId === 'ByteDanceSeedreamNode' ? '' : 'model.';
    const preset = values[prefix + 'size_preset'];
    const match = typeof preset === 'string' && preset.match(/^\((1K|2K)\) \d+x\d+ \(([^)]+)\)$/);
    if (match) { settings.resolution = match[1]; settings.aspect_ratio = match[2]; }
    else errors.push('Select a named 1K or 2K size preset before switching.');
    for (const name of ['size_preset', 'width', 'height']) ignore(prefix + name);
    // Text-to-image deliberately has no reference image socket: connected edits block below.
  } else if (family === 'fluxvideo') {
    for (const name of ['aspect_ratio', 'generate_audio', 'safety_tolerance', 'resolution']) simple(name);
    if (kind === 'FirstLastFrame') field('duration', 'duration', Number); else simple('duration');
    if (!targetSpecs.resolution) fixedResolution('resolution');
    if (sourceId === 'Flux3VideoContinuationNode') field('video', 'video');
    if (sourceId === 'Flux3ImageToVideoNode') {
      if (values.placement !== 'spread across the clip') errors.push('Timed keyframe placement is not supported by this target.');
      const refs = linked(node, /^keyframes\.image_\d+$/);
      const expected = kind === 'FirstLastFrame' ? 2 : 1;
      if (refs.length !== expected) errors.push(`This target requires exactly ${expected} connected FLUX keyframe image${expected === 1 ? '' : 's'} in order.`);
      // Preserve index semantics; never compress a missing intermediate reference.
      field('keyframes.image_1', expected === 2 ? 'start_image' : 'image');
      if (expected === 2) field('keyframes.image_2', 'end_image');
    }
  } else if (family === 'fluximage') {
    errors.push('The installed official FLUX.2 pro/max node is a different model from FLUX Klein and FLUX 3 Image. Add the RunComfy node directly; there is no verified replacement.');
  } else if (family === 'gpt') {
    requireModel(['gpt-image-2', 'gpt-image-2.5-flare', 'gpt-image-2.5-sunburst']);
    const prefix = sourceId === 'OpenAIGPTImageNodeV2' ? 'model.' : '';
    field(prefix + 'quality', 'quality');
    sizePreset(prefix + 'size', prefix + 'custom_width', prefix + 'custom_height');
    field('image', 'images'); batch(/^model\.images\.image_\d+$/, 'images');
  } else if (family === 'omni') {
    requireModel(['Omni Flash']);
    field('model.aspect_ratio', 'aspect_ratio');
    const expectedTask = { T2V: 'text_to_video', I2V: 'image_to_video', Reference: 'reference_to_video', VideoEdit: 'edit' }[kind];
    if (values['model.task_type'] !== expectedTask) errors.push(`Select the explicit official task “${expectedTask}” first. Auto task detection cannot be preserved safely.`);
    else ignore('model.task_type');
    if (kind === 'I2V') batch(/^model\.images\.image_\d+$/, 'image');
    if (kind === 'Reference') batch(/^model\.images\.image_\d+$/, 'images');
    if (kind === 'VideoEdit') mediaSeries(/^model\.videos\.video_\d+$/, 'VIDEO');
    if (targetSpecs.duration) notes.push(`RunComfy exposes duration explicitly (default ${targetSpecs.duration[1]?.default} seconds); the official node describes duration in its prompt. Review the duration after switching.`);
  } else if (family === 'happyhorse') {
    requireModel(['happyhorse-1.1-t2v', 'happyhorse-1.0-t2v', 'happyhorse-1.1-i2v', 'happyhorse-1.0-i2v', 'happyhorse-1.1-r2v', 'happyhorse-1.0-r2v', 'happyhorse-1.0-video-edit']);
    for (const name of ['duration', 'resolution']) field('model.' + name, name);
    field('model.ratio', targetSpecs.ratio ? 'ratio' : 'aspect_ratio');
    simple('watermark'); field('first_frame', 'image'); field('video', 'video');
    for (const input of linked(node, /^model\.reference_images\.image\d+$/)) {
      const number = input.name.match(/\d+$/)[0];
      const port = (kind === 'VideoEdit' ? 'reference_image_url_' : 'image_url_') + number;
      if (targetSpecs[port]) map(input.name, port);
    }
  } else if (family === 'minimax') {
    requireModel(['MiniMax H3', 'MiniMax H3 Max']);
    field('model.duration', 'duration'); field('model.ratio', 'aspect_ratio');
    field('model.resolution', 'resolution', v => typeof v === 'string' ? v.toLowerCase() : v);
    field('first_frame', 'image'); field('last_frame', targetSpecs.end_image ? 'end_image' : 'last_image');
    batch(/^model\.reference_images\.image_\d+$/);
    mediaSeries(/^model\.reference_videos\.video_\d+$/, 'VIDEO');
    mediaSeries(/^model\.reference_audios\.audio_\d+$/, 'AUDIO');
  } else if (family === 'ltx') {
    requireModel(['LTX-2.5 (Fast)', 'LTX-2.5 (Pro)']);
    field('model.duration', 'duration'); field('model.fps', 'fps', Number); field('model.generate_audio', 'generate_audio');
    const resolution = values['model.resolution'];
    const sizes = { '1280x720': ['720p', '16:9'], '720x1280': ['720p', '9:16'], '1920x1080': ['1080p', '16:9'], '1080x1920': ['1080p', '9:16'], '2560x1440': ['1440p', '16:9'], '1440x2560': ['1440p', '9:16'], '3840x2160': ['2160p', '16:9'], '2160x3840': ['2160p', '9:16'] };
    if (!sizes[resolution]) errors.push('This LTX resolution has no verified mapping.');
    else { if (targetSpecs.resolution) settings.resolution = sizes[resolution][0]; settings.aspect_ratio = sizes[resolution][1]; ignore('model.resolution', `Resolution/aspect: ${resolution} → ${targetSpecs.resolution ? settings.resolution : 'provider default'}, ${settings.aspect_ratio}.`); }
    field('image', 'image'); field('last_frame', 'end_image'); field('audio', 'audio');
  } else if (family === 'qwen') {
    requireModel(['qwen-image-3.0', 'qwen-image-3.0-pro']);
    field('prompt_extend', targetSpecs.enhance_prompt ? 'enhance_prompt' : 'enable_prompt_expansion');
    batch(/^model\.images\.image_\d+$/, 'images');
    if (kind === 'Edit') errors.push('Official Qwen edit sizing (match input / auto / custom) cannot be preserved by this target. Add the RunComfy edit node and choose its aspect ratio and resolution explicitly.');
    else {
      const width = values['model.width'], height = values['model.height'];
      if (width === height && [1024, 2048].includes(width)) { settings.aspect_ratio = '1:1'; settings.resolution = (width === 1024 ? '1' : '2') + (/21/.test(targetId) ? 'K' : 'k'); ignore('model.width'); ignore('model.height'); }
      else errors.push('Only named 1024×1024 or 2048×2048 Qwen image dimensions have a verified size mapping.');
    }
  } else if (family === 'kling' || family === 'klingo3') {
    requireModel(family === 'kling' ? ['kling-v3'] : ['kling-v3-omni']);
    disabled('multi_shot'); disabled('storyboards');
    field(['multi_shot.prompt', 'prompt'], 'prompt'); field(['multi_shot.duration', 'duration'], 'duration');
    field(['multi_shot.negative_prompt', 'negative_prompt'], 'negative_prompt');
    field(['model.aspect_ratio', 'aspect_ratio'], 'aspect_ratio');
    field('generate_audio', targetSpecs.sound ? 'sound' : 'generate_audio');
    field(['start_frame', 'first_frame'], targetSpecs.start_image ? 'start_image' : 'image');
    field('end_frame', 'end_image'); field('reference_images', 'images');
    field(['reference_video', 'video'], 'video'); simple('keep_original_sound');
    fixedResolution(family === 'kling' ? 'model.resolution' : 'resolution');
    // Neither endpoint exposes the official nested storyboard/element editors.
    if (targetSpecs.shot_type) { settings.shot_type = 'customize'; notes.push('Single-prompt shot type: customize. Structured storyboards and elements are not converted.'); }
  } else if (family === 'pixverse') {
    requireModel(['PixVerse V6']);
    field('model.aspect_ratio', 'aspect_ratio'); field('model.quality', 'resolution'); field('model.duration_seconds', 'duration');
    field('model.generate_audio', 'generate_audio_switch'); field('model.multi_clip', 'generate_multi_clip_switch');
    field(['image', 'first_frame'], 'image'); field('last_frame', 'end_image'); field('video', 'video');
    if (kind === 'Reference') errors.push('PixVerse subjects/backgrounds use distinct reference roles and prompt tags. A flat RunComfy reference list cannot preserve them; add and configure the reference node directly.');
  } else if (family === 'aleph') {
    field('video', 'video');
    if (linked(node, /^(keyframes|prompt_images)$/).length) errors.push('Aleph keyframes and prompt-image objects need a dedicated structured input adapter and cannot be preserved.');
  } else if (family === 'ideogram') {
    if (sourceId !== 'IdeogramV4') errors.push('The installed source is an earlier Ideogram model. Select Ideogram V4 first.');
    const match = values.resolution?.match(/\(([^)]+)\)$/);
    if (!match) errors.push('Select a named Ideogram V4 size. Automatic dimensions cannot be preserved.');
    else { settings.size = match[1]; ignore('resolution', `Size preset: ${values.resolution} → ${settings.size}; the RunComfy endpoint chooses pixel dimensions.`); }
    // The explicit shared modes are preserved, but DEFAULT is not assumed to mean BALANCED.
    if (['TURBO', 'QUALITY'].includes(values.rendering_speed)) simple('rendering_speed');
    else errors.push('Ideogram V4 default rendering-speed enums differ between providers. Select the explicit TURBO or QUALITY mode first, or add the RunComfy node directly.');
  } else if (family === 'seedaudio') {
    requireModel(['seed-audio-1.0']);
    field('sample_rate', 'sample_rate', Number); field('speech_rate', 'speed', v => 1 + v / 100);
    field('loudness_rate', 'volume', v => 1 + v / 100); field('pitch_rate', 'pitch');
    if (values.reference_mode === 'preset voice') {
      if (values['reference_mode.preset_voice'] === 'Vivi (Female, multilingual)') { settings.voice = 'vivi_mixed_en_zh_ja_es_id'; ignore('reference_mode.preset_voice'); }
      else errors.push('This named Seed Audio voice has no verified RunComfy voice mapping.');
    } else if (values.reference_mode === 'audio reference') mediaSeries(/^reference_mode\.reference_audio_\d+$/, 'AUDIO');
    else if (values.reference_mode === 'image reference') field('reference_mode.reference_image', 'image');
    else if (values.reference_mode === 'text only') notes.push('RunComfy uses its default Vivi voice; review this explicit voice-setting change before generation.');
    else errors.push('This Seed Audio reference mode has no verified mapping.');
  } else if (family === 'wanvideo') {
    const is27 = targetId.startsWith('RunComfyWan27');
    requireModel(is27 ? ['wan2.7-t2v', 'wan2.7-i2v', 'wan2.7-r2v', 'wan2.7-videoedit'] : ['wan3.0-video', 'wan3.0-video-prime']);
    field('model.duration', 'duration', v => v === 'auto' ? v : Number(v));
    field('model.ratio', 'aspect_ratio'); field('model.audio', 'enable_audio');
    field('model.negative_prompt', 'negative_prompt');
    field('model.resolution', 'resolution', v => typeof v === 'string' ? v.toLowerCase() : v);
    field(['model.prompt_extend', 'prompt_extend'], targetSpecs.prompt_extend ? 'prompt_extend' : 'enable_prompt_expansion');
    field('first_frame', 'image'); field('last_frame', 'end_image');
    field('audio', 'audio'); field('video', 'video'); simple('audio_setting');
    batch(/^model\.reference_images\.image_?\d+$/);
    mediaSeries(/^model\.reference_videos\.video_?\d+$/, 'VIDEO');
    mediaSeries(/^model\.reference_audios\.audio_?\d+$/, 'AUDIO');
    if (sourceId === 'Wan2VideoContinuationApi') errors.push('Video continuation cannot be replaced with image-to-video. This target cannot preserve the first clip.');
  } else if (family === 'wanimage') {
    errors.push('The installed official Wan image model is an earlier version. Wan 2.7 has no verified official switch mapping; add the RunComfy target directly.');
  }
  const defaults = Object.entries(targetSpecs).filter(([name, spec]) => !(name in settings) && !Object.values(inputMap).includes(name) && !['resume_request_id', 'generation_seed'].includes(name) && spec[1]?.default !== undefined && !['IMAGE', 'VIDEO', 'AUDIO'].includes(spec[0]));
  if (defaults.length) notes.push(`Target defaults to review: ${defaults.map(([name, spec]) => `${name}=${JSON.stringify(spec[1].default)}`).join(', ')}.`);
}
