(function(root){
  const ACTIONS={tilt:2800,wave:3000,stretch:3600,tail:2600};
  function gazeTarget(dx,dy){
    if(!Number.isFinite(dx)||!Number.isFinite(dy))return {x:0,y:0};
    const x=dx/90,y=dy/90,gain=1/Math.hypot(1,x,y);
    return {x:5.2*x*gain,y:3.6*y*gain};
  }
  // The easing response stays consistent at 30, 60 or 144 frames per second.
  function follow(current,target,elapsed,response=95){
    const alpha=-Math.expm1(-Math.max(0,Math.min(elapsed,64))/response);
    return {x:current.x+(target.x-current.x)*alpha,y:current.y+(target.y-current.y)*alpha};
  }
  const neutralPose=()=>({headX:0,headY:0,angle:0,scale:1,faceX:0,faceY:0,bodyX:0,lean:0});
  function attentionTarget(dx,dy){
    if(!Number.isFinite(dx)||!Number.isFinite(dy))return neutralPose();
    const distance=Math.hypot(dx,dy),gain=1/Math.hypot(1,dx/180,dy/180),x=dx/180*gain,y=dy/180*gain;
    const near=Math.max(0,1-distance/220);
    return {headX:6*x,headY:4*y,angle:4.5*x,scale:1+.018*near,
      faceX:2.8*x,faceY:1.8*y,bodyX:1.8*x,lean:1.1*x};
  }
  function followPose(current,target,elapsed){
    const next={};for(const key of Object.keys(target)){
      const response=key==='bodyX'||key==='lean'?340:key.startsWith('face')?135:210;
      const alpha=-Math.expm1(-Math.max(0,Math.min(elapsed,64))/response);
      next[key]=current[key]+(target[key]-current[key])*alpha;
    }return next;
  }
  function wrap(elements,name){
    const group=document.createElementNS('http://www.w3.org/2000/svg','g');group.setAttribute('class',name);
    elements[0].before(group);group.append(...elements);return group;
  }
  class Motion {
    constructor(art,onTracking){
      this.art=art;this.onTracking=onTracking;this.sleeping=document.hidden;this.busy=false;this.dragging=false;
      this.position={x:0,y:0};this.target={x:0,y:0};this.pointer=null;this.frame=0;
      this.pose=neutralPose();this.poseTarget=neutralPose();this.lastPointerMotion=-Infinity;this.wakeTimer=null;
      this.bag=[];this.lastAction=null;this.timers={};
      this.reduced=matchMedia('(prefers-reduced-motion: reduce)');
      this.preferenceChanged=()=>this.refresh();this.reduced.addEventListener('change',this.preferenceChanged);
      this.refresh();
    }
    get active(){return !this.sleeping&&!this.reduced.matches;}
    get idle(){return this.active&&!this.busy&&Boolean(this.pupils);}
    later(name,fn,delay){clearTimeout(this.timers[name]);this.timers[name]=setTimeout(fn,delay);}
    cancelIdle(){
      Object.values(this.timers).forEach(clearTimeout);this.timers={};
      delete this.art.dataset.action;delete this.art.dataset.blink;
    }
    refresh(){
      this.cancelIdle();this.art.dataset.busy=String(this.busy);this.onTracking(this.active);
      if(!this.active){cancelAnimationFrame(this.frame);clearTimeout(this.wakeTimer);this.frame=0;this.position={x:0,y:0};this.pose=neutralPose();this.paintPose();this.paint();}
      this.retarget();
      if(this.idle){this.scheduleAction(true);this.scheduleBlink();}
    }
    setArtwork(){
      this.head=this.art.querySelector('.cat-head');this.pupils=this.art.querySelector('.cat-pupils');
      this.svg=this.art.querySelector('svg');
      if(this.head&&this.pupils){
        const rig=this.art.querySelector('.cat-rig'),eyes=this.art.querySelector('.cat-eyes');
        this.bodyLook=this.art.querySelector('.cat-look-body')||wrap([rig],'cat-look-body');
        this.headLook=this.art.querySelector('.cat-look-head')||wrap([this.head],'cat-look-head');
        const features=[...this.head.children],start=features.indexOf(eyes.previousElementSibling);
        this.faceLook=this.art.querySelector('.cat-look-face')||wrap(features.slice(start),'cat-look-face');
      }
      this.eyeY=this.art.dataset.character==='dog'?101:109;
      this.position={x:0,y:0};this.pose=neutralPose();this.paintPose();this.paint();this.refresh();
    }
    setSleeping(value){if(this.sleeping!==value){this.sleeping=value;this.refresh();}}
    setBusy(value){if(this.busy!==value){this.busy=value;this.refresh();}}
    setDragging(value){if(this.dragging!==value){this.dragging=value;this.retarget();}}
    setPointer(point){
      if(!point||!Number.isFinite(point.x)||!Number.isFinite(point.y))return;
      if(!this.pointer||Math.hypot(point.x-this.pointer.x,point.y-this.pointer.y)>.5)this.lastPointerMotion=performance.now();
      this.pointer=point;this.retarget();
    }
    retarget(){
      this.poseTarget=neutralPose();
      if(this.active&&!this.dragging&&this.pointer&&this.svg){
        // Use the fixed SVG frame for head direction: its own movement must not feed back into its target.
        const matrix=this.svg.getScreenCTM();
        if(matrix){const point=new DOMPoint(this.pointer.x,this.pointer.y).matrixTransform(matrix.inverse());this.poseTarget=attentionTarget(point.x-120,point.y-this.eyeY);}
      }
      this.wake();
    }
    wake(){
      clearTimeout(this.wakeTimer);
      if(this.active&&this.pupils&&!this.frame){this.lastFrame=performance.now();this.frame=requestAnimationFrame(time=>this.tick(time));}
    }
    tick(time){
      this.frame=0;if(!this.active)return;
      const elapsed=time-this.lastFrame;this.lastFrame=time;
      this.pose=followPose(this.pose,this.poseTarget,elapsed);this.paintPose();
      this.target={x:0,y:0};
      if(!this.dragging&&this.pointer&&this.faceLook){
        // Re-aim from the moving face so the eyes stay on the cursor through head turns and idle gestures.
        const matrix=this.faceLook.getScreenCTM();
        if(matrix){const point=new DOMPoint(this.pointer.x,this.pointer.y).matrixTransform(matrix.inverse());this.target=gazeTarget(point.x-120,point.y-this.eyeY);}
      }
      this.position=follow(this.position,this.target,elapsed,75);
      const poseMoving=Object.keys(this.pose).some(key=>Math.abs(this.pose[key]-this.poseTarget[key])>(key==='scale'?.0001:.015));
      const moving=Math.hypot(this.target.x-this.position.x,this.target.y-this.position.y)>.015;
      if(!moving)this.position={...this.target};this.paint();
      if(moving||poseMoving||this.art.dataset.action||time-this.lastPointerMotion<160)this.frame=requestAnimationFrame(next=>this.tick(next));
      else this.wakeTimer=setTimeout(()=>this.wake(),120);
    }
    paint(){this.pupils?.setAttribute('transform',`translate(${this.position.x.toFixed(3)} ${this.position.y.toFixed(3)})`);}
    paintPose(){
      const p=this.pose,n=value=>value.toFixed(4);
      this.bodyLook?.setAttribute('transform',`translate(${n(p.bodyX)} 0) rotate(${n(p.lean)} 120 216)`);
      this.headLook?.setAttribute('transform',`translate(${n(p.headX)} ${n(p.headY)}) rotate(${n(p.angle)} 120 145) translate(120 145) scale(${n(p.scale)}) translate(-120 -145)`);
      this.faceLook?.setAttribute('transform',`translate(${n(p.faceX)} ${n(p.faceY)})`);
    }
    scheduleBlink(){
      this.later('blink',()=>{
        if(!this.idle)return;
        const double=Math.random()<.18;this.art.dataset.blink=double?'double':'single';
        this.later('blinkEnd',()=>{delete this.art.dataset.blink;this.scheduleBlink();},double?580:220);
      },2600+Math.random()*4000);
    }
    scheduleAction(first=false){
      this.later('action',()=>{
        if(!this.idle)return;
        if(performance.now()-this.lastPointerMotion<1500){this.scheduleAction(true);return;}
        if(!this.bag.length){
          this.bag=Object.keys(ACTIONS);
          for(let i=this.bag.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[this.bag[i],this.bag[j]]=[this.bag[j],this.bag[i]];}
          if(this.bag[this.bag.length-1]===this.lastAction)[this.bag[0],this.bag[this.bag.length-1]]=[this.bag[this.bag.length-1],this.bag[0]];
        }
        this.lastAction=this.bag.pop();this.art.dataset.action=this.lastAction;
        this.later('actionEnd',()=>{delete this.art.dataset.action;this.scheduleAction();},ACTIONS[this.lastAction]);
      },first?2000+Math.random()*2000:6500+Math.random()*5500);
    }
    destroy(){this.cancelIdle();clearTimeout(this.wakeTimer);cancelAnimationFrame(this.frame);this.frame=0;this.reduced.removeEventListener('change',this.preferenceChanged);this.onTracking(false);}
  }
  const exports={gazeTarget,follow,attentionTarget,followPose,Motion};
  if(typeof module==='object'&&module.exports)module.exports=exports;else root.PetMotion=exports;
})(globalThis);
