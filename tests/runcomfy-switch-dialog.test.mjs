import test from 'node:test';
import assert from 'node:assert/strict';
import { openSwitchPreview } from '../web/runcomfy-switch-dialog.mjs';
const tick = () => new Promise(resolve=>setImmediate(resolve));
class Element {
  children=[]; handlers=new Map(); style={};
  constructor(tag){this.tagName=tag;}
  append(...items){this.children.push(...items);}
  replaceChildren(...items){this.children=[...items];}
  setAttribute(name,value){this[name]=value;}
  addEventListener(name,handler){this.handlers.set(name,handler);}
  showModal(){this.open=true;}
  close(){this.open=false;this.handlers.get('close')?.();}
  remove(){this.removed=true;}
  focus(){this.focused=true;}
  fire(name){this.handlers.get(name)?.({preventDefault(){}});}
}
function env({errors=[],applyError=null}={}){
 const elements=[],requests=[],documentTarget={body:new Element('body'),createElement(tag){const e=new Element(tag);elements.push(e);return e;}};
 let switches=0;
 const handle=openSwitchPreview({documentTarget,node:{type:'Flux3TextToVideoNode',inputs:[],outputs:[]},targets:['RunComfyFlux3Video'],definitions:{RunComfyFlux3Video:{display_name:'RunComfy FLUX 3'}},api:{async fetchApi(url,options){requests.push({url,options});return{ok:true,json:async()=>url.includes('/config')?{configured:false,source:'none'}:{model_id:'blackforestlabs/flux-3/text-to-video',unit_price_usd:0.12,price_unit:'second',estimate_supported:false}};}},makePlan(){return{settings:{prompt:'A forest'},notes:['RunComfy balance is used when you choose Run.'],errors};},apply(){if(applyError)throw new Error(applyError);switches++;}});
 return{elements,requests,handle,get switches(){return switches;},button(text){return elements.find(e=>e.tagName==='button'&&e.textContent===text);},dialog:documentTarget.body.children[0]};
}
test('preview shows account and provider price, requires Switch, and uses read-only requests',async()=>{
 const e=env();await tick();assert.equal(e.switches,0);assert.equal(e.dialog.open,true);assert.equal(e.dialog.className.includes('comfy-modal'),false);assert(e.button('Cancel').focused);
 assert(e.elements.some(x=>x.textContent?.includes('No RunComfy account')));assert(e.elements.some(x=>x.textContent?.includes('RunComfy base rate: $0.12 / second')));
 assert(e.requests.every(r=>!r.options.method&& !r.options.body));e.button('Switch').fire('click');assert.equal(e.switches,1);assert(e.dialog.removed);
});
test('Cancel and Escape clean up without applying changes',()=>{
 for(const action of ['cancel','escape']){const e=env();if(action==='cancel')e.button('Cancel').fire('click');else e.dialog.fire('cancel');assert.equal(e.switches,0);assert(e.dialog.removed);}
});
test('blocked plan cannot switch, and apply failure stays reviewable without retrying',()=>{
 const e=env({errors:['Connected text output cannot be preserved.']});assert(e.button('Switch').disabled);e.button('Switch').fire('click');assert.equal(e.switches,0);assert(!e.dialog.removed);
 const failing=env({applyError:'Original graph restored.'});failing.button('Switch').fire('click');assert.equal(failing.switches,0);assert(failing.button('Switch').disabled);assert(failing.elements.some(x=>x.textContent==='Original graph restored.'));
});
