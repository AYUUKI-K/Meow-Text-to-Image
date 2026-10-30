import test from 'node:test';
import assert from 'node:assert/strict';
import {bindImageGesture} from '../src/ui/interactions.js';
import {createFloatingEntry} from '../src/ui/interactions.js';
import {bindImageZoom,clampImageView} from '../src/ui/interactions.js';

test('mobile edge entry expands on first tap, then supports reroll; desktop never collapses',async()=>{
 for(const mobile of [true,false]){
  const button=new EventTarget(),win=new EventTarget();Object.assign(win,{innerWidth:400,innerHeight:800,matchMedia:()=>({matches:mobile})});Object.assign(button,{style:{},setAttribute(){},remove(){}});
  let opens=0,rolls=0;const dispose=createFloatingEntry({settings:{floatingEntry:true,floatingReroll:true},save(){},open:()=>opens++,reroll:()=>rolls++,icon:'',windowImpl:win,documentImpl:{createElement:()=>button,body:{append(){}}}});
  const tap=()=>{const e=new Event('click',{cancelable:true});Object.assign(e,{detail:1,button:0,clientX:10,clientY:10});button.dispatchEvent(e);};
  assert.equal(button.dataset.collapsed,String(mobile));
  if(mobile){tap();assert.equal(button.dataset.collapsed,'false');assert.equal(opens,0);assert.equal(rolls,0);}
  tap();tap();assert.equal(rolls,1);assert.equal(opens,0);dispose();
 }
});
test('viewer zoom respects image aspect ratio, reset and eight-times limit',()=>{
    const dimensions={width:400,height:600,imageWidth:1200,imageHeight:800};
    assert.deepEqual(clampImageView({scale:1,x:500,y:500},dimensions),{scale:1,x:0,y:0});
    assert.deepEqual(clampImageView({scale:2,x:900,y:900},dimensions),{scale:2,x:200,y:0});
    const dragged=clampImageView({scale:3,x:-900,y:-900},dimensions);
    assert.equal(dragged.x,-400);assert.ok(Math.abs(dragged.y+100)<1e-9);
    assert.equal(clampImageView({scale:100,x:0,y:0},dimensions).scale,8);
    assert.equal(clampImageView({scale:.5},dimensions).scale,1);
    assert.deepEqual(clampImageView({scale:2,x:100,y:100},{width:600,height:400,imageWidth:800,imageHeight:1200}),{scale:2,x:0,y:100});
});
function fixture(clicks=2){
    const image=new EventTarget();let time=1000,rerolls=0,singles=0;
    bindImageGesture(image,{getClicks:()=>clicks,onSingle:()=>singles++,onReroll:()=>rerolls++,now:()=>time,delay:15});
    const emit=(type,props={})=>{const e=new Event(type,{cancelable:true});Object.assign(e,{button:0,clientX:20,clientY:20,isPrimary:true,...props});image.dispatchEvent(e);};
    const tap=()=>{emit('pointerdown');time++;emit('pointerup');emit('click');time++;};
    return {tap,emit,advance:n=>time+=n,result:()=>({rerolls,singles})};
}
test('double tap produces one reroll, synthetic touchend and dblclick do not duplicate it',()=>{
    const f=fixture();f.tap();f.tap();f.emit('touchend');f.emit('dblclick');assert.equal(f.result().rerolls,1);
});
test('triple mode ignores a double tap and rerolls on the third tap only',()=>{
    const f=fixture(3);f.tap();f.tap();assert.equal(f.result().rerolls,0);f.tap();assert.equal(f.result().rerolls,1);
});
test('scrolling, pointer cancellation and long presses cannot count toward reroll',()=>{
    for(const action of ['drag','cancel','hold']){
        const f=fixture();f.emit('pointerdown');
        if(action==='drag')f.emit('pointermove',{clientY:70});
        if(action==='cancel')f.emit('pointercancel');
        if(action==='hold')f.advance(600);
        f.emit('pointerup');f.emit('click');f.tap();assert.equal(f.result().rerolls,0,action);
    }
});
test('widely spaced or distant clicks remain single taps',async()=>{
    const f=fixture();f.tap();f.advance(20);f.tap();assert.equal(f.result().rerolls,0);
    await new Promise(r=>setTimeout(r,25));assert.equal(f.result().singles,1);
    const far=fixture();far.tap();far.emit('click',{clientX:200});assert.equal(far.result().rerolls,0);
});
test('floating entry docks on nearby edges, persists through resize and releases to the middle',async()=>{
    const button=new EventTarget(),windowImpl=new EventTarget();
    Object.assign(windowImpl,{innerWidth:400,innerHeight:800});
    Object.assign(button,{style:{},setAttribute(){},setPointerCapture(){},remove(){}});
    Object.defineProperties(button,{offsetLeft:{get:()=>parseFloat(button.style.left)},offsetTop:{get:()=>parseFloat(button.style.top)}});
    const settings={floatingEntry:true,floatingPosition:{x:.5,y:.5,edgeX:null,edgeY:null}};let saves=0,opened=0;
    const dispose=createFloatingEntry({settings,save:()=>saves++,open:()=>opened++,icon:'',windowImpl,documentImpl:{createElement:()=>button,body:{append(){}}}});
    const emit=(type,props={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:1,button:0,isPrimary:true,detail:1,...props});button.dispatchEvent(event);};
    const dragTo=(x,y)=>{emit('pointerdown',{clientX:button.offsetLeft,clientY:button.offsetTop});emit('pointermove',{clientX:x,clientY:y});emit('pointerup');emit('click');};
    dragTo(330,250);assert.equal(button.offsetLeft,344);assert.equal(settings.floatingPosition.edgeX,'right');assert.equal(opened,0);
    windowImpl.innerWidth=900;windowImpl.dispatchEvent(new Event('resize'));assert.equal(button.offsetLeft,844);
    dragTo(20,10);assert.equal(button.offsetLeft,8);assert.equal(button.offsetTop,8);assert.equal(settings.floatingPosition.edgeY,'top');
    dragTo(400,350);assert.equal(button.offsetLeft,400);assert.equal(button.offsetTop,350);assert.equal(settings.floatingPosition.edgeX,null);assert.equal(settings.floatingPosition.edgeY,null);
    dragTo(420,730);assert.equal(button.offsetTop,744);assert.equal(settings.floatingPosition.edgeY,'bottom');
    emit('pointerdown',{clientX:420,clientY:744});emit('pointermove',{clientX:600,clientY:500});emit('pointercancel');assert.equal(button.offsetTop,744);
    emit('pointerdown');emit('pointerup');emit('click');await new Promise(resolve=>setTimeout(resolve,410));assert.equal(opened,1);assert.equal(saves,4);
    dispose();
});

test('floating double taps reroll once without opening settings; disposal cancels a delayed single tap',async()=>{
 const button=new EventTarget(),win=new EventTarget();Object.assign(win,{innerWidth:400,innerHeight:800});Object.assign(button,{style:{},setAttribute(){},remove(){}});
 let opened=0,rolls=0;const dispose=createFloatingEntry({settings:{floatingEntry:true,floatingReroll:true},save(){},open:()=>opened++,reroll:()=>rolls++,icon:'',windowImpl:win,documentImpl:{createElement:()=>button,body:{append(){}}}});
 const click=detail=>{const event=new Event('click',{cancelable:true});Object.assign(event,{detail,button:0,clientX:10,clientY:10});button.dispatchEvent(event);};
 click(1);click(2);button.dispatchEvent(new Event('dblclick',{cancelable:true}));await new Promise(resolve=>setTimeout(resolve,410));assert.equal(rolls,1);assert.equal(opened,0);
 click(0);assert.equal(opened,1);click(1);dispose();await new Promise(resolve=>setTimeout(resolve,410));assert.equal(opened,1);
});

test('floating reroll is opt-in; disabled double clicks only open settings',()=>{
 for(const enabled of [undefined,false]){
  const button=new EventTarget(),win=new EventTarget();Object.assign(win,{innerWidth:400,innerHeight:800});Object.assign(button,{style:{},setAttribute(){},remove(){}});
  let opens=0,rolls=0;const dispose=createFloatingEntry({settings:{floatingEntry:true,floatingReroll:enabled},save(){},open:()=>opens++,reroll:()=>rolls++,icon:'',windowImpl:win,documentImpl:{createElement:()=>button,body:{append(){}}}});
  for(const detail of [1,2]){const event=new Event('click',{cancelable:true});Object.assign(event,{detail,button:0,clientX:10,clientY:10});button.dispatchEvent(event);}
  assert.equal(rolls,0);assert.equal(opens,2);dispose();
 }
});

test('viewer taps toggle controls; swipes navigate; pinch, drag and cancellation never toggle',t=>{
 const oldDocument=globalThis.document,oldObserver=globalThis.ResizeObserver;
 const make=()=>Object.assign(new EventTarget(),{style:{},dataset:{},setAttribute(){},append(){},remove(){},closest(){return null;},getBoundingClientRect:()=>({left:0,top:0,width:400,height:600})});
 globalThis.document={createElement:make};globalThis.ResizeObserver=class{observe(){}disconnect(){}};
 t.after(()=>{globalThis.document=oldDocument;globalThis.ResizeObserver=oldObserver;});
 const viewer=make(),image=make();Object.assign(image,{naturalWidth:800,naturalHeight:1200});
 let toggled=0,previous=0,next=0;const dispose=bindImageZoom(viewer,image,{onTap:()=>toggled++,onPrevious:()=>previous++,onNext:()=>next++});
 const emit=(type,props={})=>{const event=new Event(type,{cancelable:true});Object.assign(event,{pointerId:1,button:0,clientX:200,clientY:300,...props});Object.defineProperty(event,'target',{value:image});viewer.dispatchEvent(event);};
 const tap=()=>{emit('pointerdown');emit('pointerup');};
 emit('click');assert.equal(toggled,1,'click-only mouse or accessibility activation works');toggled=0;
 tap();emit('click');assert.equal(toggled,1,'pointerup plus compatibility click toggles only once');
 for(const x of [90,310]){emit('pointerdown');emit('pointermove',{clientX:x});emit('pointerup',{clientX:x});}assert.equal(next,1);assert.equal(previous,1);assert.equal(toggled,1);
 emit('pointerdown');emit('pointermove',{clientY:400});emit('pointerup',{clientY:400});
 emit('pointerdown');emit('pointercancel');emit('pointerup');emit('click');
 emit('pointerdown');emit('pointermove',{clientX:250});emit('pointermove');emit('pointerup');
 emit('pointerdown');emit('pointerdown',{pointerId:2,clientX:260});emit('pointermove',{pointerId:2,clientX:320});emit('pointerup',{pointerId:2,clientX:320});emit('pointerup');assert.equal(toggled,1);assert.equal(next,1);
 emit('keydown',{key:'0'});emit('keydown',{key:'ArrowRight'});assert.equal(next,2);
 emit('keydown',{key:'+'});emit('keydown',{key:'ArrowLeft'});assert.equal(previous,1);
 emit('keydown',{key:'Enter'});assert.equal(toggled,2);dispose();
});
