const api=window.banban,bubble=document.querySelector('#bubble');let current=null,pages=[],page=0,timer=null,remaining=0,started=0,hover=false;
function splitText(text){const characters=Array.from(text),result=[];let start=0;while(start<characters.length){let end=Math.min(characters.length,start+80),breaks=0;for(let i=start;i<end;i++)if(characters[i]==='\n'&&++breaks>=4){end=i+1;break;}if(end<characters.length){for(let i=end-1;i>start+40;i--)if(/[。！？；\n]/.test(characters[i])){end=i+1;break;}}result.push(characters.slice(start,end).join(''));start=end;}return result.length?result:[''];}
function measure(){if(current)api.bubbleSize(current.id,344,Math.ceil(bubble.getBoundingClientRect().height)+16);}
new ResizeObserver(measure).observe(bubble);
function beginTimer(){clearTimeout(timer);if(!current||hover)return;started=performance.now();timer=setTimeout(()=>page<pages.length-1?advance():act('dismiss'),Math.max(100,remaining));}
function displayPage(){document.querySelector('#message').textContent=pages[page];document.querySelector('#pagination').hidden=pages.length<2;document.querySelector('#page-count').textContent=`${page+1} / ${pages.length}`;document.querySelector('#next-page').textContent=page<pages.length-1?'下一句 →':'从头看看 ↺';remaining=Math.max(current.types?12000:10000,pages[page].length*220);measure();beginTimer();}
function advance(){page=(page+1)%pages.length;displayPage();}
function show(event){clearTimeout(timer);current=event;bubble.hidden=!event;if(!event)return;pages=splitText(event.text);page=0;hover=false;
 const labels={water:'喝水时间',stretch:'给身体放个小假',combined:'照顾自己时间',love:'一封小小的情书',happy:'收到你的回应啦',welcome:'很高兴遇见你',pet:event.character==='dog'?'摇摇尾巴，贴贴你':'呼噜呼噜，贴贴你'};
 document.querySelector('#bubble-label').textContent=event.preview?'提醒效果预览':labels[event.kind]||'伴伴的小纸条';const actions=document.querySelector('#actions');actions.replaceChildren();
 if(event.types){const done=document.createElement('button');done.textContent=event.kind==='combined'?'都好啦':event.kind==='water'?'喝过啦':'活动过啦';done.onclick=()=>act('done');actions.append(done);
 if(!event.snoozed&&!event.preview){const snooze=document.createElement('button');snooze.textContent='10 分钟后';snooze.onclick=()=>act('snooze');actions.append(snooze);}
 const skip=document.createElement('button');skip.textContent='这次跳过';skip.onclick=()=>act('skip');actions.append(skip);}
 displayPage();
}
async function act(action){const event=current;if(!event)return;show(null);try{await api.call('bubble-action',event.id,action);}catch{}}
bubble.addEventListener('mouseenter',()=>{hover=true;if(timer){remaining-=performance.now()-started;clearTimeout(timer);timer=null;}});
bubble.addEventListener('mouseleave',()=>{hover=false;beginTimer();});
document.querySelector('#dismiss').onclick=()=>act('dismiss');document.querySelector('#next-page').onclick=advance;
document.addEventListener('mousemove',e=>api.pointer(Boolean(e.target.closest('#bubble'))));document.addEventListener('mouseleave',()=>api.pointer(false));
api.on('bubble',show);
