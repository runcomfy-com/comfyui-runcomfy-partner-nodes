/** Explicit, non-executing provider switch. Modern ComfyUI getNodeMenuItems API. */
import { openSwitchPreview } from './runcomfy-switch-dialog.mjs';
import { MODELS } from './runcomfy-models.mjs';
import { mapRecentSwitch, recentSwitchTargets } from './runcomfy-recent-switch.mjs';

const FAMILIES = {
  ByteDance2TextToVideoNode: ['seedance', 'T2V'],
  ByteDance2FirstLastFrameNode: ['seedance', 'I2V'],
  ByteDance2ReferenceNodeV2: ['seedance', 'Reference'],
  ByteDance2ReferenceNode: ['seedance', 'Reference'],
  Wan3ImageToVideoApi: ['wan'], Flux3TextToVideoNode: ['flux'],
  GeminiNanoBanana2V2: ['gemini'],
  GeminiNanoBanana2: ['gemini', 'legacy'], GeminiImageNode: ['gemini', 'legacy'], GeminiImage2Node: ['gemini', 'legacy'],
  ByteDanceSeedreamNodeV3: ['seedream'], ByteDanceSeedreamNodeV2: ['seedream'], ByteDanceSeedreamNode: ['seedream', 'legacy'],
};
// Only flat presets also present as named 2K presets in the current 5.0 Pro schema.
const LEGACY_SEEDREAM_PRESETS = {
  '2048x2048 (1:1)': '1:1', '2304x1728 (4:3)': '4:3', '1728x2304 (3:4)': '3:4',
  '2496x1664 (3:2)': '3:2', '1664x2496 (2:3)': '2:3',
};
const copy = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const nodeType = node => node.comfyClass || node.constructor?.comfyClass || node.type;
const valuesOf = node => Object.fromEntries((node.widgets || []).map(w => [w.name, w.value]));
const shortName = name => name.split('.').at(-1);
const boundary = (graph, id, side) => { const node = graph?.[side + 'Node']; return node?.id === id ? node : null; };
const getLink = (graph, id) => graph?.getLink?.(id) ?? graph?.links?.get?.(id) ?? graph?.links?.[id];
const choiceList = spec => Array.isArray(spec?.[0]) ? spec[0] : spec?.[1]?.options;
const typeOf = spec => Array.isArray(spec?.[0]) ? 'COMBO' : spec?.[0];
const defaultOf = spec => spec?.[1]?.default ?? choiceList(spec)?.[0] ?? ({ BOOLEAN: false, STRING: '', INT: 0, FLOAT: 0 }[typeOf(spec)]);
const labelOf = (id, definitions) => definitions[id]?.display_name || id.replace(/^RunComfy/, 'RunComfy ');

function originalSwitchTargets(node) {
  const [family, kind] = FAMILIES[nodeType(node)] || [];
  const model = valuesOf(node).model;
  if (family === 'seedance') return [`RunComfySeedance25${kind}1080p`, `RunComfySeedance25${kind}4K`];
  if (family === 'wan') return [model === 'wan3.0-video-prime' ? 'RunComfyWan30PrimeI2V' : 'RunComfyWan30I2V'];
  if (family === 'flux') return ['RunComfyFlux3Video'];
  if (family === 'gemini') {
    const hasImages = (node.inputs || []).some(i => (i.name === 'images' || /(?:^|\.)images\./.test(i.name)) && i.link != null);
    return [hasImages ? 'RunComfyNanoBanana2LiteEdit' : 'RunComfyNanoBanana2LiteT2I'];
  }
  if (family === 'seedream') return ['RunComfySeedream50ProI2I'];
  return [];
}

export function switchTargets(node, definitions) {
  const original = originalSwitchTargets(node);
  // Keep the original API usable before definitions are registered. Runtime menus
  // add only installed targets from the matching, explicitly allowlisted family.
  if (!definitions && original.length) return original;
  return [...new Set([...original, ...recentSwitchTargets(node, definitions)])];
}

/** Expand the active V3 dynamic schema into the dotted names used by API prompts/widgets. */
export function activeInputs(definition, values, prefix = '') {
  const result = {};
  for (const category of ['required', 'optional']) {
    for (const [key, spec] of Object.entries(definition?.input?.[category] || {})) {
      const name = prefix + key;
      result[name] = spec;
      if (spec[0] === 'COMFY_DYNAMICCOMBO_V3') {
        const choice = spec[1].options.find(o => o.key === values[name]);
        if (choice) Object.assign(result, activeInputs({ input: choice.inputs }, values, name + '.'));
      }
    }
  }
  return result;
}

function acceptValue(name, value, spec) {
  const type = typeOf(spec), choices = choiceList(spec), opt = spec?.[1] || {};
  if (choices && !choices.includes(value)) return `${name}: ${JSON.stringify(value)} is not supported by RunComfy.`;
  if (type === 'INT' && /seed/.test(name) && !Number.isSafeInteger(value)) return `${name}: this seed cannot be represented exactly. Set the source seed to an integer from ${opt.min ?? 0} to ${Math.min(opt.max ?? Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER)} before switching.`;
  if (type === 'INT' && (!Number.isSafeInteger(value) || value < (opt.min ?? -Infinity) || value > (opt.max ?? Infinity))) return `${name} must be an integer between ${opt.min ?? 'the minimum'} and ${opt.max ?? 'the maximum'}.`;
  if (type === 'FLOAT' && (typeof value !== 'number' || !Number.isFinite(value) || value < (opt.min ?? -Infinity) || value > (opt.max ?? Infinity))) return `${name} must be a finite number between ${opt.min ?? 'the minimum'} and ${opt.max ?? 'the maximum'}.`;
  if (type === 'BOOLEAN' && typeof value !== 'boolean') return `${name} must be true or false.`;
  if (type === 'STRING' && typeof value !== 'string') return `${name} must be text.`;
  return null;
}

export function planSwitch(node, targetId, definitions) {
  const sourceId = nodeType(node), [family, kind] = FAMILIES[sourceId] || [];
  const values = valuesOf(node), target = definitions[targetId];
  const errors = [], notes = [], settings = {}, inputMap = {}, transforms = new Set(), ignored = [];
  const plan = { sourceId, targetId, targetLabel: labelOf(targetId, definitions), errors, notes, settings, inputMap, outputMap: { 0: 0 }, ignored, source: node };
  if (!switchTargets(node, definitions).includes(targetId)) errors.push('This source and RunComfy model are not a supported switch.');
  if (!target || !definitions[sourceId]) { errors.push('Node definitions are not available. Refresh ComfyUI and try again.'); return plan; }
  const sourceSpecs = activeInputs(definitions[sourceId], values);
  const targetSpecs = activeInputs(target, {});
  const map = (source, destination, transform) => {
    inputMap[source] = destination;
    if (transform) transforms.add(source);
    if (targetSpecs[destination]?.[1]?.forceInput) {
      if (!(node.inputs || []).some(i => i.name === source && i.link != null)) errors.push(`“${destination}” is a connection-only target input. Connect a compatible value to the source “${source}” before switching; its fixed widget value cannot be carried over.`);
    } else if (source in values) settings[destination] = transform ? transform(values[source]) : values[source];
  };
  for (const link of node.graph?.floatingLinks?.values?.() || []) if (link.origin_id === node.id || link.target_id === node.id) errors.push('Finish or remove loose connections on this node before switching.');
  const model = values.model;
  const recent = !originalSwitchTargets(node).includes(targetId);
  if (recent) {
    mapRecentSwitch({ node, targetId, values, sourceSpecs, targetSpecs, map, inputMap, settings, errors, notes });
  } else if (family === 'seedance') {
    if (model !== 'Seedance 2.5') errors.push('Select Seedance 2.5 first. Other model versions are not equivalent.');
    for (const field of ['prompt', 'duration', 'generate_audio']) map('model.' + field, field);
    if (kind !== 'I2V') map('model.ratio', 'aspect_ratio');
    if (kind === 'I2V') map('first_frame', 'image');
    const resolution = targetId.endsWith('4K') ? '4K' : '1080p';
    notes.push(`Resolution: ${values['model.resolution'] ?? 'selected value'} → ${resolution}.`);
    if (resolution === '4K') notes.push('RunComfy Seedance 2.5 4K is an explicit resolution change; Comfy’s current Seedance 2.5 node has no 4K setting.');
    if ((node.inputs || []).some(i => i.name === 'model.resolution' && i.link != null)) errors.push('Disconnect the linked resolution before choosing a fixed-resolution RunComfy model.');
    inputMap['model.resolution'] = null;
  } else if (family === 'wan') {
    if (!['wan3.0-video', 'wan3.0-video-prime'].includes(model)) errors.push('Select a supported Wan 3.0 model first.');
    map('model.prompt', 'prompt'); map('model.ratio', 'aspect_ratio'); map('model.audio', 'enable_audio');
    map('model.resolution', 'resolution', value => typeof value === 'string' ? value.toLowerCase() : value);
    map('model.duration', 'duration', value => value === 'auto' ? value : Number(value));
    map('model.prompt_extend', 'prompt_extend'); map('first_frame', 'image'); map('last_frame', 'end_image');
  } else if (family === 'flux') {
    for (const field of ['prompt', 'aspect_ratio', 'duration', 'resolution', 'generate_audio', 'safety_tolerance']) map(field, field);
  } else if (family === 'gemini') {
    if (kind === 'legacy') errors.push(`This node uses ${model || 'an earlier Nano Banana model'} and cannot select Nano Banana 2 Lite. This RunComfy node pack supports Nano Banana 2 Lite, so there is no equivalent replacement. To use Lite, add the current Nano Banana 2 node and select Nano Banana 2 Lite before switching.`);
    else if (model !== 'Nano Banana 2 Lite') errors.push('Select Nano Banana 2 Lite first. Other Gemini models are not equivalent.');
    map('prompt', 'prompt'); map(kind === 'legacy' ? 'aspect_ratio' : 'model.aspect_ratio', 'aspect_ratio');
    if (kind === 'legacy') map('images', 'images');
    notes.push('RunComfy returns the generated image only. Text and thinking-image outputs are unavailable.');
  } else if (family === 'seedream') {
    if (model !== 'seedream 5.0 pro') errors.push('Select seedream 5.0 pro first. Other Seedream models are not equivalent.');
    map('prompt', 'prompt');
    const prefix = kind === 'legacy' ? '' : 'model.';
    const preset = values[prefix + 'size_preset'];
    const match = typeof preset === 'string' && preset.match(/^\((1K|2K)\) \d+x\d+ \(([^)]+)\)$/);
    if (kind === 'legacy' && Object.hasOwn(LEGACY_SEEDREAM_PRESETS, preset)) {
      settings.resolution = '2K'; settings.aspect_ratio = LEGACY_SEEDREAM_PRESETS[preset];
      notes.push(`Size preset: ${preset} → 2K, ${settings.aspect_ratio}.`);
    }
    else if (kind !== 'legacy' && match) { settings.resolution = match[1]; settings.aspect_ratio = match[2]; }
    else if (kind === 'legacy') errors.push('This legacy size preset cannot be preserved. Choose 2048x2048, 2304x1728, 1728x2304, 2496x1664, or 1664x2496 before switching. Custom dimensions and larger presets are unavailable.');
    else errors.push('Choose a named 1K or 2K size preset before switching. Custom dimensions cannot be preserved.');
    const sizeFields = ['size_preset', 'width', 'height'].map(field => prefix + field);
    for (const field of sizeFields) inputMap[field] = null;
    if ((node.inputs || []).some(i => sizeFields.includes(i.name) && i.link != null)) errors.push('Disconnect linked size settings before switching; dynamic dimensions cannot be mapped to a fixed preset.');
    if (kind === 'legacy') map('image', 'images');
  }
  // These seeds are rerun controls on some providers, and a provider seed on Wan.
  if (!recent) {
    map('seed', family === 'wan' ? 'seed' : 'generation_seed');
    if (family === 'seedream') map('model.seed', 'generation_seed');
  }
  const controls = (node.widgets || []).filter(w => /control_after_generate$/.test(w.name));
  if (controls.length === 1) {
    const targetHasControl = Object.values(targetSpecs).some(spec => spec[1]?.control_after_generate && !spec[1]?.forceInput);
    if (targetHasControl) {
      plan.controlAfterGenerate = controls[0].value;
      notes.push(`Rerun control: ${controls[0].value}. ${family === 'wan' ? 'The provider seed is preserved.' : 'This controls reruns; it does not guarantee identical generated results.'}`);
    } else if ((node.inputs || []).some(i => i.link != null && inputMap[i.name] === 'seed')) {
      notes.push('The seed connection is preserved. Its upstream node controls the value and reruns; the source node’s inactive seed widget control is not copied.');
    } else errors.push('The target has no widget rerun control. Connect the source seed to a compatible upstream value before switching.');
  }
  else if (controls.length > 1) errors.push('Multiple rerun controls cannot be mapped safely.');

  const images = [];
  for (const input of recent ? [] : node.inputs || []) {
    if (input.link == null) continue;
    const name = input.name;
    if (/^(?:model\.)?(?:reference_images|images)\.image_\d+$/.test(name)) images.push(input);
    const media = name.match(/^model\.reference_(videos|audios)\.(video|audio)_(\d+)$/);
    if (media) inputMap[name] = `${media[2]}_${media[3]}`;
  }
  if (images.length > 1) errors.push('Several separate image references are connected. Prepare one IMAGE batch with matching image dimensions, then connect it as image_1 before switching. No images will be resized or dropped automatically.');
  if (images.length === 1) inputMap[images[0].name] = 'images';

  for (const input of node.inputs || []) {
    if (input.link == null) continue;
    const destination = inputMap[input.name];
    if (!destination || !targetSpecs[destination]) { errors.push(`Connected input “${input.name}” has no compatible RunComfy input.`); continue; }
    if (transforms.has(input.name)) { errors.push(`Connected “${input.name}” needs value conversion. Set it to a supported fixed value before switching.`); continue; }
    const sourceType = input.type, destinationType = typeOf(targetSpecs[destination]);
    if (sourceType && sourceType !== '*' && sourceType !== destinationType && !(Array.isArray(sourceType) && destinationType === 'COMBO')) errors.push(`Connected “${input.name}” has type ${sourceType}; RunComfy requires ${destinationType}.`);
    const link = getLink(node.graph, input.link);
    if (!link) errors.push(`The connection to “${input.name}” is missing. Reconnect it before switching.`);
    else if (!node.graph.getNodeById(link.origin_id) && !boundary(node.graph, link.origin_id, 'input')?.slots[link.origin_slot]?.connect) errors.push(`The source of “${input.name}” cannot be safely rewired.`);
  }
  for (const [index, output] of (node.outputs || []).entries()) {
    if (!output.links?.length) continue;
    if (index !== 0 || target.output?.[0] !== output.type) errors.push(`Connected output “${output.name || index}” is unavailable on this RunComfy node.`);
    for (const id of output.links) {
      const link = getLink(node.graph, id);
      if (!link || (!node.graph.getNodeById(link.target_id) && !boundary(node.graph, link.target_id, 'output')?.slots[link.target_slot]?.connect)) errors.push('A downstream connection cannot be safely rewired.');
    }
  }
  // Never silently drop a nondefault unsupported setting. Default omissions are disclosed.
  for (const widget of node.widgets || []) {
    const name = widget.name;
    if (name === 'model' || /control_after_generate$/.test(name) || name in inputMap || widget.options?.serialize === false || widget.type === 'button') continue;
    const spec = sourceSpecs[name];
    if (!spec) { if (widget.serialize !== false && widget.value != null && widget.value !== '') errors.push(`Unrecognized setting “${name}” cannot be preserved.`); continue; }
    if (['COMFY_AUTOGROW_V3', 'COMFY_DYNAMICCOMBO_V3'].includes(spec[0])) continue;
    if (JSON.stringify(widget.value) !== JSON.stringify(defaultOf(spec))) errors.push(`“${name}” is set to a nondefault value that RunComfy cannot preserve. Restore its default before switching.`);
    else ignored.push(name);
  }
  for (const [name, value] of Object.entries(settings)) {
    if (!targetSpecs[name]) { errors.push(`RunComfy is missing “${name}”. Update the node pack and restart ComfyUI.`); continue; }
    const error = acceptValue(name, value, targetSpecs[name]);
    if (error) errors.push(error);
  }
  const linkedDestinations = new Set((node.inputs || []).filter(i => i.link != null).map(i => inputMap[i.name]));
  if (!recent && (/I2V/.test(targetId) || targetId === 'RunComfyNanoBanana2LiteEdit' || family === 'seedream') && !linkedDestinations.has(targetId === 'RunComfyNanoBanana2LiteEdit' || family === 'seedream' ? 'images' : 'image')) errors.push('Connect the required reference image before switching.');
  for (const group of MODELS[targetId]?.requiredMedia || []) {
    if (!group.some(name => linkedDestinations.has(name))) errors.push(`Connect the required reference input “${group.join(' / ')}” before switching.`);
  }
  if (targetId === 'RunComfySeedance25Reference4K' && ![1, 2, 3].some(i => linkedDestinations.has(`video_${i}`))) errors.push('RunComfy Seedance 2.5 Reference 4K requires at least one reference video.');
  if (family === 'seedance' && kind === 'Reference' && !linkedDestinations.has('images') && ![1, 2, 3].some(i => linkedDestinations.has(`video_${i}`) || linkedDestinations.has(`audio_${i}`))) errors.push('Connect at least one supported reference before switching.');
  if (ignored.length) notes.push(`Default controls not carried over: ${ignored.map(shortName).join(', ')}.`);
  notes.push('Your RunComfy account on this ComfyUI server will be charged when you choose Run. Comfy credits will not be used. Switching does not run the workflow.');
  notes.push('Provider revisions, generated results, and pricing can differ. Check the RunComfy price on the new node before running.');
  if (node.graph?.id && node.graph !== node.graph.rootGraph) notes.push('This node belongs to a subgraph. Changing its definition affects every instance of that subgraph.');
  plan.previewSignature = JSON.stringify({ values, inputs: (node.inputs || []).map(i => [i.name, i.type, i.link]), outputs: (node.outputs || []).map(o => [o.name, o.type, o.links]) });
  plan.errors = [...new Set(errors)];
  return plan;
}

/** Native graph transaction: all links are preflighted before mutation; rollback uses the exact graph snapshot. */
export function applySwitch(plan, { createNode, canvas, definitions, canSwitch = () => true }) {
  if (!canSwitch()) throw new Error('Turn off Run on Change / Run Instant before switching. This prevents an automatic paid generation.');
  const node = plan.source, graph = node.graph;
  if (!graph || graph.getNodeById(node.id) !== node) throw new Error('The source node changed. Open the switch preview again.');
  const fresh = planSwitch(node, plan.targetId, definitions);
  if (fresh.errors.length) throw new Error(fresh.errors.join('\n'));
  if (fresh.previewSignature !== plan.previewSignature) throw new Error('The node changed while the preview was open. Open it again to review the new settings.');
  const replacement = createNode(plan.targetId);
  if (!replacement) throw new Error('The RunComfy node could not be created.');
  let mutationStarted = false;
  try {
    const snapshot = copy(graph.serialize());
    const sourceData = copy(node.serialize());
    const inputs = [], outputs = [];
    for (const [slot, input] of (node.inputs || []).entries()) {
      if (input.link == null) continue;
      const link = getLink(graph, input.link), dest = fresh.inputMap[input.name];
      const targetSlot = (replacement.inputs || []).findIndex(i => i.name === dest);
      if (targetSlot < 0) throw new Error(`The target socket “${dest}” is unavailable. Update ComfyUI before switching.`);
      inputs.push({ link: { ...link }, targetSlot, sourceSlot: slot });
    }
    for (const [slot, output] of (node.outputs || []).entries()) for (const id of output.links || []) outputs.push({ link: { ...getLink(graph, id) }, sourceSlot: slot });
    for (const [name, value] of Object.entries(fresh.settings)) {
      const widget = replacement.widgets?.find(w => w.name === name);
      if (!widget) throw new Error(`The target setting “${name}” is unavailable.`);
      widget.value = value;
    }
    if (fresh.controlAfterGenerate !== undefined) {
      const control = replacement.widgets?.find(w => /control_after_generate$/.test(w.name));
      if (!control) throw new Error('The target rerun control is unavailable.');
      control.value = fresh.controlAfterGenerate;
    }
    const targetSize = Array.from(replacement.computeSize?.() || replacement.size);
    replacement.id = node.id;
    for (const key of ['pos', 'size', 'flags', 'mode', 'color', 'bgcolor', 'shape']) if (sourceData[key] !== undefined) replacement[key] = copy(sourceData[key]);
    replacement.size = [Math.max(replacement.size[0], targetSize[0]), Math.max(replacement.size[1], targetSize[1])];
    const properties = copy(sourceData.properties || {});
    for (const key of ['cnr_id', 'ver', 'aux_id', 'Node name for S&R']) delete properties[key];
    replacement.properties = { ...replacement.properties, ...properties, 'Node name for S&R': plan.targetId };
    if (sourceData.title && sourceData.title !== definitions[fresh.sourceId]?.display_name) replacement.title = sourceData.title;
    // emitBefore/AfterChange drive the frontend ChangeTracker, including nested graphs.
    mutationStarted = true;
    canvas?.emitBeforeChange?.();
    graph.beforeChange?.();
    try {
      graph.remove(node);
      graph.add(replacement);
      for (const { link, targetSlot } of inputs) {
        const origin = graph.getNodeById(link.origin_id);
        const boundarySlot = boundary(graph, link.origin_id, 'input')?.slots[link.origin_slot];
        const result = origin ? origin.connect(link.origin_slot, replacement, targetSlot, link.parentId) : boundarySlot?.connect(replacement.inputs[targetSlot], replacement, link.parentId);
        if (!result) throw new Error('An incoming connection could not be preserved.');
      }
      for (const { link } of outputs) {
        const destination = graph.getNodeById(link.target_id);
        const boundarySlot = boundary(graph, link.target_id, 'output')?.slots[link.target_slot];
        const result = destination ? replacement.connect(0, destination, link.target_slot, link.parentId) : boundarySlot?.connect(replacement.outputs[0], replacement, link.parentId);
        if (!result) throw new Error('An outgoing connection could not be preserved.');
      }
      replacement.onConnectionsChange?.();
      graph.change?.();
      canvas?.setDirty?.(true, true);
      return replacement;
    } catch (error) {
      graph.configure(snapshot);
      canvas?.setDirty?.(true, true);
      throw new Error(`Switch cancelled; the original graph was restored. ${error.message}`);
    } finally {
      graph.afterChange?.();
      canvas?.emitAfterChange?.();
    }
  } catch (error) {
    if (!mutationStarted) replacement.onRemoved?.();
    throw error;
  }
}

const installed = new WeakSet();
export function installRunComfySwitch({ app, api, createNode = type => globalThis.LiteGraph.createNode(type), preview = openSwitchPreview }) {
  if (installed.has(app)) return;
  installed.add(app);
  const definitions = {};
  const canSwitch = () => {
    const mode = app.extensionManager?.queueSettings?.mode;
    return (mode == null || mode === 'disabled') && app.ui?.autoQueueEnabled !== true;
  };
  const makePlan = (node, target) => {
    const plan = planSwitch(node, target, definitions);
    if (!canSwitch()) plan.errors.push('Turn off Run on Change / Run Instant before switching. This prevents an automatic paid generation.');
    return plan;
  };
  app.registerExtension({
    name: 'RunComfy.ProviderSwitch',
    beforeRegisterNodeDef(_nodeType, definition) { definitions[definition.name] = definition; },
    getNodeMenuItems(node) {
      if (!switchTargets(node, definitions).length) return [];
      return [{ content: 'Switch to RunComfy…', callback: () => {
        preview({ node, targets: switchTargets(node, definitions), definitions, api,
          makePlan: target => makePlan(node, target),
          apply: plan => applySwitch(plan, { createNode, canvas: app.canvas, definitions, canSwitch }) });
      } }];
    },
  });
}
