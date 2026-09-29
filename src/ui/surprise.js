const api=window.banban,canvas=document.querySelector('#hearts'),ctx=canvas.getContext('2d'),scene=document.querySelector('#scene');
const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
const colors=['#ffd8bc','#f7a8b8','#ef7d9c','#ffe5d1','#dba6ce'];
let frame=0,started=0,lastFrame=0,leaving=false,finished=false,origin={x:0,y:0},particles=[],constellation=[];
const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,1.5);
canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);ctx.scale(dpr,dpr);
const heart=new Path2D('M0 8 C-3 5 -11 0 -10 -5 C-9 -13 -2 -12 0 -7 C2 -12 9 -13 10 -5 C11 0 3 5 0 8 Z');
const ease=t=>1-Math.pow(1-Math.max(0,Math.min(1,t)),3);
// Small cached sprites keep the soft particles light on the CPU renderer.
const sprites=colors.map(color=>{const tile=document.createElement('canvas');tile.width=64;tile.height=64;const c=tile.getContext('2d');c.translate(32,35);c.scale(2,2);c.fillStyle=color;c.shadowColor=color;c.shadowBlur=5;c.fill(heart);return tile;});
function point(angle,scale=1){const radius=Math.min(w*.29,h*.37)*scale;return{x:w*.5+16*Math.sin(angle)**3/17*radius,y:h*.43-(13*Math.cos(angle)-5*Math.cos(2*angle)-2*Math.cos(3*angle)-Math.cos(4*angle))/17*radius};}
function drawHeart(x,y,size,rotation,alpha,color){ctx.save();ctx.globalAlpha=alpha;ctx.translate(x,y);ctx.rotate(rotation);ctx.drawImage(sprites[color],-size/2,-size/2,size,size);ctx.restore();}
function draw(elapsed){
 ctx.clearRect(0,0,w,h);
 const pulse=reduced?1:1+Math.sin(elapsed*1.8)*.012;
 // Two fine rose-gold outlines emerge after the flying hearts arrive.
 const trace=Math.max(0,Math.min(1,(elapsed-1.2)/2.4));
 for(let ring=0;ring<2;ring++){
  ctx.beginPath();for(let i=0;i<=180*trace;i++){const p=point(i/180*Math.PI*2,pulse*(ring?1.055:1));if(i===0)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);}
  ctx.globalAlpha=1-Math.max(0,Math.min(1,(elapsed-6.7)/2.5));ctx.strokeStyle=ring?'#f5c5a42b':'#ffbaca66';ctx.lineWidth=ring?.8:1.5;ctx.stroke();ctx.globalAlpha=1;
 }
 for(const star of constellation){
  const destination=point(star.angle,pulse),progress=reduced?1:ease((elapsed-star.delay)/1.9);
  if(progress<=0)continue;
  const curve=Math.sin(progress*Math.PI)*star.arc;
  const release=reduced?0:ease((elapsed-6.7)/2.8);
  const x=origin.x+(destination.x-origin.x)*progress+curve+Math.sin(star.angle)*release*w*.12,y=origin.y+(destination.y-origin.y)*progress-Math.sin(progress*Math.PI)*h*.16+release*release*h*.27;
  const glow=.5+Math.sin(elapsed*1.6+star.angle*4)*.2;
  drawHeart(x,y,star.size,star.tilt+release*.7,progress*glow*(1-release*.55),star.color);
 }
 for(const p of particles){
  const life=reduced?p.phase:((elapsed*p.speed+p.phase)%1),y=h+45-life*(h+90);
  const x=p.x+(reduced?0:Math.sin(elapsed*.65+p.phase*8)*p.sway);
  const centerDistance=Math.abs(x-w*.5)/w;
  const alpha=p.alpha*Math.min(1,life*5,(1-life)*5)*(centerDistance<.22&&y>h*.22&&y<h*.7?.22:1);
  drawHeart(x,y,p.size,p.tilt+(reduced?0:Math.sin(elapsed*.4+p.phase)*.25),alpha,p.color);
 }
 // A handful of warm pinpricks between the hearts, without flashing.
 for(let i=0;i<34;i++){const x=(i*.618033%1)*w,y=(i*.381966+.12)%1*h;ctx.globalAlpha=.12+.15*(1+Math.sin(elapsed*.7+i))/2;ctx.fillStyle='#ffe1bd';ctx.beginPath();ctx.arc(x,y,i%3===0?1.6:.8,0,Math.PI*2);ctx.fill();}
 ctx.globalAlpha=1;
}
function tick(now){
 if(finished)return;const elapsed=(now-started)/1000;
 if(now-lastFrame>=32){draw(elapsed);lastFrame=now;}
 if(elapsed>=8.7&&!leaving){leaving=true;scene.classList.add('leaving');}
 if(elapsed>=10){finish('ended');return;}
 frame=requestAnimationFrame(tick);
}
function finish(action){if(finished)return;finished=true;cancelAnimationFrame(frame);api.surprise(action);}
api.on('surprise',data=>{
 if(started)return;
 document.querySelector('#nickname').textContent=data.nickname||'亲爱的';
 document.querySelector('#signature').textContent=data.sender?`—— ${data.sender}，一直偏爱你`:'—— 一直偏爱你的我';
 document.querySelector('.escape').hidden=!data.escapeAvailable;
 origin={x:Math.max(0,Math.min(w,data.origin.x)),y:Math.max(0,Math.min(h,data.origin.y))};
 particles=Array.from({length:reduced?36:100},()=>({x:Math.random()*w,phase:Math.random(),size:12+Math.random()*38,speed:.035+Math.random()*.05,sway:10+Math.random()*36,alpha:.22+Math.random()*.38,color:Math.floor(Math.random()*colors.length),tilt:(Math.random()-.5)*.6}));
 constellation=Array.from({length:64},(_,i)=>({angle:i/64*Math.PI*2,delay:reduced?0:Math.random()*.9,size:10+Math.random()*13,arc:(Math.random()-.5)*w*.25,color:i%colors.length,tilt:(Math.random()-.5)*.6}));
 scene.classList.add('playing');started=performance.now();frame=requestAnimationFrame(tick);
});
document.querySelector('#close').onclick=()=>finish('dismiss');
document.addEventListener('keydown',event=>{if(event.key==='Escape')finish('dismiss');});
document.addEventListener('mousemove',event=>api.pointer(Boolean(event.target.closest('#close'))));
document.addEventListener('mouseleave',()=>api.pointer(false));
window.addEventListener('pagehide',()=>cancelAnimationFrame(frame));
api.surprise('ready');
