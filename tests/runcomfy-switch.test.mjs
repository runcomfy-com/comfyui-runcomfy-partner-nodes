import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { activeInputs, applySwitch, installRunComfySwitch, planSwitch, switchTargets } from '../web/runcomfy-switch.mjs';
const defs = JSON.parse(readFileSync(new URL('./fixtures/runcomfy-switch-schemas.json', import.meta.url)));
const clone = v => JSON.parse(JSON.stringify(v));
const choices = spec => Array.isArray(spec[0]) ? spec[0] : spec[1]?.options;
const type = spec => Array.isArray(spec[0]) ? 'COMBO' : spec[0];
const defaults = spec => spec[1]?.default ?? choices(spec)?.[0] ?? ({ INT: 0, STRING: '', BOOLEAN: false, FLOAT: 0 }[type(spec)]);
class Node {
  constructor(id, widgets = [], inputs = [], outputs = []) { this.type = id; this.id = -1; this.widgets = widgets; this.inputs = inputs; this.outputs = outputs; this.pos = [35, 40]; this.size = [300, 280]; this.flags = {}; this.mode = 0; this.properties = {}; }
  serialize() { return clone(Object.fromEntries(['type','id','widgets','inputs','outputs','pos','size','flags','mode','properties','color','title'].filter(k=>this[k]!==undefined).map(k=>[k,this[k]]))); }
  connect(slot, target, targetSlot, parentId) {
    if (this.graph.failConnection) return null;
    const link = { id: ++this.graph.nextLink, origin_id:this.id, origin_slot:slot, target_id:target.id, target_slot:targetSlot, type: this.outputs[slot].type, parentId };
    this.graph.links[link.id]=link; (this.outputs[slot].links ||= []).push(link.id); target.inputs[targetSlot].link=link.id;
    return link;
  }
}
function makeNode(id, overrides = {}) {
  const definition = defs[id];
  let values = { ...overrides };
  for (const [name,spec] of Object.entries(activeInputs(definition,values))) if (!(name in values)) values[name] = type(spec)==='COMFY_DYNAMICCOMBO_V3' ? spec[1].options[0].key : defaults(spec);
  const specs = activeInputs(definition,values), widgets=[], inputs=[];
  for (const [name,spec] of Object.entries(specs)) {
    const kind = type(spec);
    if (kind==='COMFY_AUTOGROW_V3') continue;
    if (kind==='COMFY_DYNAMICCOMBO_V3') { widgets.push({name,value:values[name],type:'combo'}); continue; }
    inputs.push({name,type:kind,link:null});
    if (['STRING','INT','FLOAT','BOOLEAN','COMBO'].includes(kind)) widgets.push({name,value:name in values ? values[name] : defaults(spec),type:kind.toLowerCase()});
  }
  if (Object.values(specs).some(s=>s[1]?.control_after_generate)) widgets.push({name:'control_after_generate',value:'fixed',type:'combo'});
  return new Node(id,widgets,inputs,definition.output.map((t,i)=>({name:definition.output_name?.[i]||t,type:t,links:[]})));
}
class Graph {
  constructor(){this.nodes=[];this.links={};this.nextLink=0;this.id='root';this.rootGraph=this;}
  add(n){if(n.id===-1)n.id=Math.max(0,...this.nodes.map(n=>n.id))+1; n.graph=this;this.nodes.push(n);}
  getNodeById(id){return this.nodes.find(n=>n.id===id);}
  getLink(id){return this.links[id];}
  remove(n){this.nodes=this.nodes.filter(x=>x!==n);for(const [id,l] of Object.entries(this.links)){if(l.origin_id===n.id||l.target_id===n.id){const from=this.getNodeById(l.origin_id),to=this.getNodeById(l.target_id);if(from)from.outputs[l.origin_slot].links=from.outputs[l.origin_slot].links.filter(x=>x!==l.id);if(to)to.inputs[l.target_slot].link=null;delete this.links[id];}}n.graph=null;}
  serialize(){return {nodes:this.nodes.map(n=>n.serialize()),links:clone(this.links),nextLink:this.nextLink};}
  configure(data){this.nodes=data.nodes.map(d=>Object.assign(new Node(d.type),clone(d)));for(const n of this.nodes)n.graph=this;this.links=clone(data.links);this.nextLink=data.nextLink;}
  beforeChange(){} afterChange(){} change(){}
}
function addMedia(graph,node,name,mediaType='IMAGE') {
  const origin=new Node('Source',[],[],[{name:'out',type:mediaType,links:[]}]);graph.add(origin);
  let index=node.inputs.findIndex(i=>i.name===name);if(index<0){index=node.inputs.length;node.inputs.push({name,type:mediaType,link:null});}
  origin.connect(0,node,index);return origin;
}
function fixture(sourceId,values={},media=[]){const graph=new Graph(),node=makeNode(sourceId,values);graph.add(node);for(const [n,t] of media)addMedia(graph,node,n,t);return{graph,node};}
const cases = [
 ['ByteDance2FirstLastFrameNode','RunComfySeedance25I2V1080p',{'model':'Seedance 2.5'},[['first_frame','IMAGE']]],
 ['ByteDance2TextToVideoNode','RunComfySeedance25T2V1080p',{'model':'Seedance 2.5'},[]],
 ['ByteDance2ReferenceNodeV2','RunComfySeedance25Reference1080p',{'model':'Seedance 2.5'},[['model.reference_images.image_1','IMAGE']]],
 ['ByteDance2FirstLastFrameNode','RunComfySeedance25I2V4K',{'model':'Seedance 2.5'},[['first_frame','IMAGE']]],
 ['ByteDance2TextToVideoNode','RunComfySeedance25T2V4K',{'model':'Seedance 2.5'},[]],
 ['ByteDance2ReferenceNodeV2','RunComfySeedance25Reference4K',{'model':'Seedance 2.5'},[['model.reference_videos.video_1','VIDEO']]],
 ['Wan3ImageToVideoApi','RunComfyWan30PrimeI2V',{'model':'wan3.0-video-prime','model.duration':'5'},[['first_frame','IMAGE']]],
 ['Wan3ImageToVideoApi','RunComfyWan30I2V',{'model':'wan3.0-video','model.duration':'5'},[['first_frame','IMAGE']]],
 ['Flux3TextToVideoNode','RunComfyFlux3Video',{},[]],
 ['GeminiNanoBanana2V2','RunComfyNanoBanana2LiteT2I',{'model':'Nano Banana 2 Lite'},[]],
 ['GeminiNanoBanana2V2','RunComfyNanoBanana2LiteEdit',{'model':'Nano Banana 2 Lite'},[['model.images.image_1','IMAGE']]],
 ['ByteDanceSeedreamNodeV3','RunComfySeedream50ProI2I',{'model':'seedream 5.0 pro'},[['model.images.image_1','IMAGE']]],
];
for(const [source,target,values,media] of cases)test(`maps and applies ${target} with the official schema fixture`,()=>{
 const {graph,node}=fixture(source,values,media);const plan=planSwitch(node,target,defs);
 assert(switchTargets(node).includes(target));assert.deepEqual(plan.errors,[]);
 const result=applySwitch(plan,{createNode:makeNode,definitions:defs});assert.equal(result.type,target);assert.equal(result.id,node.id);
 for(const input of node.inputs.filter(i=>i.link!=null))assert(result.inputs.some(i=>i.name===plan.inputMap[input.name]&&i.link!=null));
 assert.equal(graph.nodes.filter(n=>n.type.startsWith('RunComfy')).length,1);
 if(target.endsWith('4K'))assert(plan.notes.some(n=>n.includes('explicit resolution change')));
});
test('FLUX settings use names despite reordered widgets; links, ID, useful metadata and seed mode survive',()=>{
 const {graph,node}=fixture('Flux3TextToVideoNode',{duration:'7',resolution:'1080p',seed:100});node.widgets.reverse();
 node.widgets.find(w=>w.name==='control_after_generate').value='randomize';node.color='#123456';node.title='My clip';node.properties={note:'keep',cnr_id:'comfy-core','Node name for S&R':'Flux3TextToVideoNode'};
 const text=addMedia(graph,node,'prompt','STRING'),sink=new Node('SaveVideo',[],[{name:'video',type:'VIDEO',link:null}],[]);graph.add(sink);node.connect(0,sink,0,17);
 const replacement=applySwitch(planSwitch(node,'RunComfyFlux3Video',defs),{createNode:makeNode,definitions:defs});
 assert.equal(replacement.widgets.find(w=>w.name==='duration').value,'7');assert.equal(replacement.widgets.find(w=>w.name==='resolution').value,'1080p');
 assert.equal(replacement.widgets.find(w=>w.name==='generation_seed').value,100);assert.equal(replacement.widgets.find(w=>w.name==='control_after_generate').value,'randomize');
 assert.equal(replacement.properties.note,'keep');assert.equal(replacement.properties.cnr_id,undefined);assert.equal(replacement.title,'My clip');assert.equal(replacement.color,'#123456');
 assert.equal(Object.values(graph.links).find(l=>l.target_id===sink.id).parentId,17);assert.equal(Object.values(graph.links).find(l=>l.origin_id===text.id).target_id,replacement.id);
});
test('rejects nondefault unsupported settings, connected secondary outputs, provider mismatch and unsafe seed precision',()=>{
 const {graph,node}=fixture('GeminiNanoBanana2V2',{model:'Nano Banana 2 Lite',temperature:1.5,seed:9007199254740992});
 const sink=new Node('Text',[],[{name:'text',type:'STRING',link:null}],[]);graph.add(sink);node.connect(1,sink,0);
 const before=graph.serialize(),plan=planSwitch(node,'RunComfyNanoBanana2LiteT2I',defs);
 assert(plan.errors.some(e=>e.includes('temperature')));assert(plan.errors.some(e=>e.includes('Connected output')));assert(plan.errors.some(e=>e.includes('generation_seed')));
 assert.throws(()=>applySwitch(plan,{createNode:makeNode,definitions:defs}));assert.deepEqual(graph.serialize(),before);
 node.widgets.find(w=>w.name==='model').value='Nano Banana 2 (Gemini 3.1 Flash Image)';assert(planSwitch(node,'RunComfyNanoBanana2LiteT2I',defs).errors.some(e=>e.includes('Select Nano Banana 2 Lite')));
});
test('multiple same-size and different-size references block instead of introducing resizes; excessive video sockets block',()=>{
 for(const dimensions of [[[512,512],[512,512]],[[512,512],[800,600]]]) {
  const {graph,node}=fixture('ByteDance2ReferenceNodeV2',{model:'Seedance 2.5'},[['model.reference_images.image_1','IMAGE'],['model.reference_images.image_2','IMAGE']]);
  graph.nodes.filter(n=>n.type==='Source').forEach((n,i)=>n.properties.dimensions=dimensions[i]);
  const before=graph.serialize();assert(planSwitch(node,'RunComfySeedance25Reference1080p',defs).errors.some(e=>e.includes('Several separate image')));assert.deepEqual(graph.serialize(),before);
 }
 const {node}=fixture('ByteDance2ReferenceNodeV2',{model:'Seedance 2.5'},[['model.reference_videos.video_4','VIDEO']]);assert(planSwitch(node,'RunComfySeedance25Reference1080p',defs).errors.some(e=>e.includes('video_4')));
});
test('Wan static conversions work, auto duration and linked transformed widgets block',()=>{
 const {graph,node}=fixture('Wan3ImageToVideoApi',{'model.duration':'5'},[['first_frame','IMAGE']]);
 let plan=planSwitch(node,'RunComfyWan30I2V',defs);assert.equal(plan.settings.duration,5);assert.equal(plan.settings.resolution,'1080p');assert.deepEqual(plan.errors,[]);
 node.widgets.find(w=>w.name==='model.duration').value='auto';assert(planSwitch(node,'RunComfyWan30I2V',defs).errors.some(e=>e.includes('duration must')));
 node.widgets.find(w=>w.name==='model.duration').value='5';addMedia(graph,node,'model.duration','COMBO');assert(planSwitch(node,'RunComfyWan30I2V',defs).errors.some(e=>e.includes('needs value conversion')));
});
test('Seedream ignores dormant dimensions for named preset; custom and missing reference are blocked',()=>{
 const {node}=fixture('ByteDanceSeedreamNodeV3',{'model':'seedream 5.0 pro'},[['model.images.image_1','IMAGE']]);
 let plan=planSwitch(node,'RunComfySeedream50ProI2I',defs);assert.deepEqual(plan.errors,[]);assert.equal(plan.settings.resolution,'1K');assert.equal(plan.settings.aspect_ratio,'1:1');
 node.widgets.find(w=>w.name==='model.size_preset').value='Custom';assert(planSwitch(node,'RunComfySeedream50ProI2I',defs).errors.some(e=>e.includes('Custom dimensions')));
 const empty=fixture('ByteDanceSeedreamNodeV3',{'model':'seedream 5.0 pro'});assert(planSwitch(empty.node,'RunComfySeedream50ProI2I',defs).errors.some(e=>e.includes('required reference')));
});
test('flat Seedream 5.0 Pro preserves named 2K presets, linked prompt, image batch, output and seed',()=>{
 for(const [preset,ratio] of [['2048x2048 (1:1)','1:1'],['2304x1728 (4:3)','4:3'],['1728x2304 (3:4)','3:4'],['2496x1664 (3:2)','3:2'],['1664x2496 (2:3)','2:3']]) {
  const {graph,node}=fixture('ByteDanceSeedreamNode',{model:'seedream 5.0 pro',size_preset:preset,seed:175,width:4096,height:3072},[['image','IMAGE'],['prompt','STRING']]);
  const sink=new Node('SaveImage',[],[{name:'images',type:'IMAGE',link:null}],[]);graph.add(sink);node.connect(0,sink,0);
  const plan=planSwitch(node,'RunComfySeedream50ProI2I',defs);
  assert.deepEqual(plan.errors,[]);assert.equal(plan.settings.resolution,'2K');assert.equal(plan.settings.aspect_ratio,ratio);assert.equal(plan.settings.generation_seed,175);assert.equal(plan.inputMap.image,'images');
  const result=applySwitch(plan,{createNode:makeNode,definitions:defs});
  assert.equal(result.id,node.id);assert(result.inputs.find(i=>i.name==='images').link);assert(result.inputs.find(i=>i.name==='prompt').link);assert.equal(result.outputs[0].links.length,1);
  assert.equal(graph.getLink(sink.inputs[0].link).origin_id,result.id);
 }
});
test('flat Seedream blocks other model versions, unsupported presets, missing image and nondefault batch settings',()=>{
 const cases=[
  [{model:'seedream-4-5-251128'},/Other Seedream models are not equivalent/],
  [{model:'seedream-4-0-250828'},/Other Seedream models are not equivalent/],
  [{model:'seedream 5.0 lite'},/Other Seedream models are not equivalent/],
  [{size_preset:'Custom'},/legacy size preset cannot be preserved/],
  [{size_preset:'4096x4096 (1:1)'},/legacy size preset cannot be preserved/],
  [{size_preset:'2560x1440 (16:9)'},/legacy size preset cannot be preserved/],
  [{sequential_image_generation:'auto',max_images:3},/nondefault value/],
 ];
 for(const [values,message] of cases) {
  const {graph,node}=fixture('ByteDanceSeedreamNode',values,[['image','IMAGE']]);const before=graph.serialize(),plan=planSwitch(node,'RunComfySeedream50ProI2I',defs);
  assert(plan.errors.some(e=>message.test(e)));assert.throws(()=>applySwitch(plan,{createNode:makeNode,definitions:defs}));assert.deepEqual(graph.serialize(),before);
 }
 const empty=fixture('ByteDanceSeedreamNode');assert(planSwitch(empty.node,'RunComfySeedream50ProI2I',defs).errors.some(e=>e.includes('required reference')));
 const linked=fixture('ByteDanceSeedreamNode',{},[['image','IMAGE'],['size_preset','COMBO']]);assert(planSwitch(linked.node,'RunComfySeedream50ProI2I',defs).errors.some(e=>e.includes('Disconnect linked size')));
});
test('legacy Nano Banana variants expose a blocked compatibility preview and never substitute model versions',()=>{
 const extensions=[],app={registerExtension(e){extensions.push(e)}};let opened;
 installRunComfySwitch({app,preview(options){opened=options}});
 for(const definition of Object.values(defs))extensions[0].beforeRegisterNodeDef(null,definition);
 for(const id of ['GeminiImageNode','GeminiImage2Node','GeminiNanoBanana2'])for(const media of [[],[['images','IMAGE']]]) {
  const {graph,node}=fixture(id,{},media);const before=graph.serialize();
  const target=media.length?'RunComfyNanoBanana2LiteEdit':'RunComfyNanoBanana2LiteT2I';assert.deepEqual(switchTargets(node),[target]);
  const menu=extensions[0].getNodeMenuItems(node);assert.equal(menu[0].content,'Switch to RunComfy…');menu[0].callback();
  const plan=opened.makePlan(target);assert(plan.errors.some(e=>e.includes('no equivalent replacement')));assert(plan.errors.some(e=>e.includes('add the current Nano Banana 2 node')));
  assert.throws(()=>opened.apply(plan),/no equivalent replacement/);assert.deepEqual(graph.serialize(),before);
 }
});
test('all Seedream and Seedance variants present the native switch action even when the selected model is incompatible',()=>{
 const extensions=[],app={registerExtension(e){extensions.push(e)}};installRunComfySwitch({app});
 for(const id of ['ByteDanceSeedreamNode','ByteDanceSeedreamNodeV3','ByteDance2TextToVideoNode','GeminiNanoBanana2V2'])assert.equal(extensions[0].getNodeMenuItems(makeNode(id))[0].content,'Switch to RunComfy…');
});
test('rollback restores the original graph after a connection failure',()=>{
 const {graph,node}=fixture('Flux3TextToVideoNode');addMedia(graph,node,'prompt','STRING');const before=graph.serialize();graph.failConnection=true;
 let began=0,ended=0;assert.throws(()=>applySwitch(planSwitch(node,'RunComfyFlux3Video',defs),{createNode:makeNode,definitions:defs,canvas:{emitBeforeChange(){began++},emitAfterChange(){ended++}}}),/original graph was restored/);
 assert.deepEqual(graph.serialize(),before);assert.equal(began,1);assert.equal(ended,1);
});
test('one native undo boundary restores and reapplies the replacement',()=>{
 const {graph,node}=fixture('Flux3TextToVideoNode');let before,after,events=0;
 const canvas={emitBeforeChange(){before=graph.serialize();events++},emitAfterChange(){after=graph.serialize();events++}};
 applySwitch(planSwitch(node,'RunComfyFlux3Video',defs),{createNode:makeNode,definitions:defs,canvas});assert.equal(events,2);
 graph.configure(before);assert.equal(graph.nodes[0].type,'Flux3TextToVideoNode');graph.configure(after);assert.equal(graph.nodes[0].type,'RunComfyFlux3Video');
});
test('nested graph operations use the owning graph, not another root node with the same ID',()=>{
 const {graph,node}=fixture('Flux3TextToVideoNode');const root=new Graph();const unrelated=makeNode('Flux3TextToVideoNode');root.add(unrelated);graph.rootGraph=root;graph.id='nested';
 const before=root.serialize(),plan=planSwitch(node,'RunComfyFlux3Video',defs);assert(plan.notes.some(n=>n.includes('every instance')));
 applySwitch(plan,{createNode:makeNode,definitions:defs});assert.deepEqual(root.serialize(),before);assert.equal(graph.nodes[0].type,'RunComfyFlux3Video');
});
test('a changed preview is rejected before graph mutation',()=>{
 const {graph,node}=fixture('Flux3TextToVideoNode');const plan=planSwitch(node,'RunComfyFlux3Video',defs);node.widgets.find(w=>w.name==='duration').value='8';const before=graph.serialize();
 assert.throws(()=>applySwitch(plan,{createNode:makeNode,definitions:defs}),/changed while the preview/);assert.deepEqual(graph.serialize(),before);
});
test('native menu installs once and only opens a preview, never mutating or queuing',()=>{
 const extensions=[],app={registerExtension(e){extensions.push(e)}};let opened=0;
 installRunComfySwitch({app,preview(){opened++}});installRunComfySwitch({app,preview(){opened++}});assert.equal(extensions.length,1);
 const {graph,node}=fixture('Flux3TextToVideoNode'),before=graph.serialize();const menu=extensions[0].getNodeMenuItems(node);assert.equal(menu[0].content,'Switch to RunComfy…');menu[0].callback();assert.equal(opened,1);assert.deepEqual(graph.serialize(),before);
 assert.deepEqual(extensions[0].getNodeMenuItems(makeNode('RunComfyFlux3Video')),[]);
});
test('preflight disposes a detached target when a required socket is unavailable',()=>{
 const {graph,node}=fixture('Flux3TextToVideoNode');addMedia(graph,node,'prompt','STRING');const before=graph.serialize();let disposed=0;
 assert.throws(()=>applySwitch(planSwitch(node,'RunComfyFlux3Video',defs),{definitions:defs,createNode(id){const n=makeNode(id);n.inputs=[];n.onRemoved=()=>disposed++;return n;}}),/target socket/);
 assert.equal(disposed,1);assert.deepEqual(graph.serialize(),before);
});
test('floating connections block before mutation rather than being discarded',()=>{
 const {graph,node}=fixture('Flux3TextToVideoNode');graph.floatingLinks=new Map([[5,{origin_id:node.id,target_id:-1}]]);
 assert(planSwitch(node,'RunComfyFlux3Video',defs).errors.some(e=>e.includes('loose connections')));
});
test('native subgraph boundary input and output sockets retain their connections',()=>{
 const {graph,node}=fixture('Flux3TextToVideoNode');graph.id='nested';graph.rootGraph={};
 const inputIndex=node.inputs.findIndex(i=>i.name==='prompt');
 const inLink={id:++graph.nextLink,origin_id:-10,origin_slot:0,target_id:node.id,target_slot:inputIndex,type:'STRING'};
 graph.links[inLink.id]=inLink;node.inputs[inputIndex].link=inLink.id;
 graph.inputNode={id:-10,slots:[{connect(input,target,parentId){const link={id:++graph.nextLink,origin_id:-10,origin_slot:0,target_id:target.id,target_slot:target.inputs.indexOf(input),type:'STRING',parentId};graph.links[link.id]=link;input.link=link.id;return link;}}]};
 const outLink={id:++graph.nextLink,origin_id:node.id,origin_slot:0,target_id:-20,target_slot:0,type:'VIDEO'};
 graph.links[outLink.id]=outLink;node.outputs[0].links=[outLink.id];
 graph.outputNode={id:-20,slots:[{connect(output,origin,parentId){const link={id:++graph.nextLink,origin_id:origin.id,origin_slot:origin.outputs.indexOf(output),target_id:-20,target_slot:0,type:'VIDEO',parentId};graph.links[link.id]=link;(output.links||=[]).push(link.id);return link;}}]};
 const plan=planSwitch(node,'RunComfyFlux3Video',defs);assert.deepEqual(plan.errors,[]);
 const replacement=applySwitch(plan,{createNode:makeNode,definitions:defs});assert.equal(Object.values(graph.links).length,2);assert.equal(graph.getLink(replacement.inputs.find(i=>i.name==='prompt').link).origin_id,-10);assert.equal(graph.getLink(replacement.outputs[0].links[0]).target_id,-20);
});
test('automatic queue modes block preview and confirmation, including changes while preview is open',()=>{
 const extensions=[],app={extensionManager:{queueSettings:{mode:'change'}},registerExtension(e){extensions.push(e)}};let preview;
 installRunComfySwitch({app,preview(options){preview=options}});
 for(const definition of Object.values(defs))extensions[0].beforeRegisterNodeDef(null,definition);
 const {graph,node}=fixture('Flux3TextToVideoNode');extensions[0].getNodeMenuItems(node)[0].callback();
 assert(preview.makePlan('RunComfyFlux3Video').errors.some(e=>e.includes('automatic paid generation')));
 app.extensionManager.queueSettings.mode='disabled';const plan=preview.makePlan('RunComfyFlux3Video');assert.deepEqual(plan.errors,[]);
 const before=graph.serialize();app.extensionManager.queueSettings.mode='instant-running';assert.throws(()=>preview.apply(plan),/automatic paid generation/);assert.deepEqual(graph.serialize(),before);
});
