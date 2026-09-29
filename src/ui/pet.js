const api=window.banban,art=document.querySelector('#cat-art'),pet=document.querySelector('#pet');
let current=null,dragging=false,lastInteractive=null;
art.dataset.mood='idle';
const motion=new PetMotion.Motion(art,enabled=>api.trackGaze(enabled));
let character=null,artRequest=0;
async function updateCharacter(state){
 const next=state.config.petCharacter==='dog'?'dog':'cat';if(next===character)return;character=next;
 const request=++artRequest;
 try{const response=await fetch(`../../assets/${next}.svg`);if(!response.ok)throw new Error('Artwork unavailable');const svg=await response.text();if(request===artRequest){art.innerHTML=svg;art.dataset.character=next;motion.setArtwork();}}
 catch{if(request===artRequest){art.textContent=next==='dog'?'🐶':'🐱';character=null;}}
}
api.on('state',updateCharacter);api.call('get-state').then(updateCharacter);
function setInteractive(value){if(value!==lastInteractive){lastInteractive=value;api.pointer(value);}}
document.addEventListener('mousemove',e=>{setInteractive(dragging||Boolean(e.target.closest('.interactive')));motion.setPointer({x:e.clientX,y:e.clientY});});
api.on('gaze',point=>motion.setPointer(point));
document.addEventListener('mouseleave',()=>{if(!dragging)setInteractive(false);});
pet.addEventListener('pointerdown',e=>{if(e.button!==0)return;e.preventDefault();dragging=true;motion.setDragging(true);motion.setBusy(true);pet.setPointerCapture(e.pointerId);setInteractive(true);api.drag('start');});
pet.addEventListener('pointerup',e=>{if(e.button!==0)return;if(pet.hasPointerCapture(e.pointerId))pet.releasePointerCapture(e.pointerId);api.drag('end');});
pet.addEventListener('pointercancel',()=>api.drag('cancel'));
api.on('drag-finished',point=>{dragging=false;motion.setDragging(false);motion.setBusy(Boolean(current));motion.setPointer(point);setInteractive(Boolean(point&&document.elementFromPoint(point.x,point.y)?.closest('.interactive')));});
pet.addEventListener('contextmenu',e=>{e.preventDefault();api.call('menu').catch(()=>{});});
let smileTimer;
api.on('bubble',event=>{
 current=event;art.dataset.mood=event?.kind||'idle';motion.setBusy(Boolean(current)||dragging);
 clearTimeout(smileTimer);delete art.dataset.smiling;
 if(['pet','happy'].includes(event?.kind)){art.dataset.smiling='true';smileTimer=setTimeout(()=>delete art.dataset.smiling,1600);}
});
let sleeping=false;
function syncSleep(){const asleep=sleeping||document.hidden;document.body.classList.toggle('asleep',asleep);motion.setSleeping(asleep);}
api.on('sleep',sleep=>{sleeping=sleep;syncSleep();});
document.addEventListener('visibilitychange',syncSleep);
window.addEventListener('pagehide',()=>motion.destroy(),{once:true});
