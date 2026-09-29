const api=window.banban,$=s=>document.querySelector(s),content=$('#content');
let state,page='home',quoteFilter='custom',petSVG={},saveChain=Promise.resolve(),toastTimer,saveError=null;
const pendingInputs=new Map();
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titles={home:'伴伴的家',reminders:'温柔提醒',love:'专属心意',appearance:'桌宠模样',general:'通用设置',moments:'藏起来的惊喜',delivery:'送给她'};
const characters={cat:'奶油小猫',dog:'云朵大白狗'};
const artFor=()=>petSVG[state.config.petCharacter]||petSVG.cat;
const names={water:'喝水提醒',stretch:'起身活动'};
function toggle(setting,checked,label){return `<label class="switch"><input type="checkbox" data-setting="${setting}" aria-label="${label}" ${checked?'checked':''}><span></span></label>`;}
function heading(title,subtitle,extra=''){return `<div class="page-title"><div><h1>${title}</h1><p class="subtitle">${subtitle}</p></div>${extra}</div>`;}
function toast(text){clearTimeout(toastTimer);$('#toast').textContent=text;$('#toast').hidden=false;toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function saved(message,error=false){$('#save-state').textContent=message;$('#save-state').classList.toggle('error',error);}
function queueSave(patchOrFactory){
  saved('正在收好你的心意…');
  saveChain=saveChain.catch(()=>{}).then(async()=>{
    try{const patch=typeof patchOrFactory==='function'?patchOrFactory():patchOrFactory;state=await api.call('save-settings',patch);saveError=null;saved('已保存 · 只在这台电脑');updateStatus();return state;}
    catch(error){saveError=error;saved('尚未保存，请检查设置',true);toast(error.message);throw error;}
  });saveChain.catch(()=>{});return saveChain;
}
async function flush(){for(const [key,entry] of pendingInputs){clearTimeout(entry.timer);pendingInputs.delete(key);queueSave(entry.patch).catch(()=>{});}await saveChain;if(saveError)throw saveError;}
function timeLabel(task){if(!task)return '本时段暂无待提醒';return `下次 ${new Date(task.due).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})}${task.snoozed?' · 已延后':''}`;}
function statusText(){if(!state.config.onboarded)return '准备好了，就开始陪伴吧';if(state.status.reason==='提醒已暂停')return `安静陪伴至 ${new Date(state.config.pauseUntil).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})}`;return state.status.reason||'轻轻陪着你，提醒已安排';}
function updateStatus(){
  document.querySelectorAll('[data-status]').forEach(el=>el.textContent=statusText());
  document.querySelectorAll('[data-next]').forEach(el=>{const kind=el.dataset.next;el.textContent=!state.config[kind].enabled?'已关闭':state.status.reason||timeLabel(state.status.next[kind]);});
  document.querySelectorAll('[data-quote-count]').forEach(el=>el.textContent=state.status.quoteCount);
  document.querySelectorAll('[data-status-wrap]').forEach(el=>el.classList.toggle('paused',Boolean(state.status.reason)));
}
function home(){const c=state.config,started=c.onboarded;
  return heading(started?`${esc(c.nickname||'嗨')}，今天也在哦`:'你好，初次见面呀','一点点可爱，一点点关心。这里是伴伴的小小角落。',`<span class="chip-status">${started?'陪伴进行中':'等待与你相遇'}</span>`)+`
  <section class="hero"><div class="hero-copy"><div class="eyebrow">A LITTLE LOVE, EVERY DAY</div><h1>一只${c.petCharacter==='dog'?'大白狗':'小猫'}，<br>替我陪在你身边。</h1><p>${esc(started?'记得喝水，记得休息。\n也记得，有人在认真地喜欢你。':c.welcome||'从今天起，在桌角陪你工作、放松，\n把日常过得柔软一点。')}</p><div class="button-row"><button class="primary" data-action="${started?'show-pet':'start'}">${started?'去桌面找伴伴':'开始陪伴'} <span>↗</span></button><button class="quiet" data-action="${started?'manual-love':'import'}">${started?'收一句情话 ♡':'打开专属礼物'}</button></div></div><div class="hero-scene"><span class="scene-star">✦</span><span class="scene-star two">✧</span><div class="cat-art hero-cat" data-mood="idle">${artFor()}</div><span class="scene-note">YOUR LITTLE DESKTOP FRIEND</span></div></section>
  ${!started?`<p class="onboard-note">开始前可以调整 <button data-page="reminders">提醒时间</button> 与 <button data-page="love">专属称呼</button>。默认静音、不开机自启，右键伴伴即可暂停或退出。</p>`:''}
  <div class="section-label">让关心，刚刚好 <span>小提醒，也是一种惦记</span></div><div class="grid-2">${['water','stretch'].map(kind=>`<article class="card"><div class="card-top"><div class="card-heading"><div class="icon-tile ${kind==='stretch'?'peach':''}">${kind==='water'?'♧':'⌁'}</div><div><h3>${names[kind]}</h3><p class="mini-detail">${kind==='water'?'给忙碌补充一点水分':'起来走走，舒展一下身体'}</p></div></div>${toggle(`${kind}.enabled`,c[kind].enabled,names[kind])}</div><div class="number">${c[kind].minutes}<span>分钟 / 次</span></div><div class="card-bottom"><span class="note" data-next="${kind}"></span><button class="link" data-page="reminders">调整时间 →</button></div></article>`).join('')}</div>
  <div class="status-strip"><div class="status-line" data-status-wrap><i class="status-dot"></i><span data-status></span></div><div class="button-row"><button class="quiet" data-action="pause" data-value="30">专注 30 分钟</button><button class="quiet" data-action="resume">恢复提醒</button></div></div>
  ${state.recovered?'<div class="info-note warn">上次的配置文件没有完整保存。伴伴已尝试恢复备份，请检查提醒和专属内容。</div>':''}`;
}
function reminders(){const c=state.config;
  return heading('关心有时，安静有度','给生活留一点空隙。频率和时间，都由你决定。')+`<div class="stack">${['water','stretch'].map(kind=>`<section class="card"><div class="form-row"><div class="card-heading"><div class="icon-tile ${kind==='stretch'?'peach':''}">${kind==='water'?'♧':'⌁'}</div><div><h3>${names[kind]}</h3><p>${kind==='water'?'轻轻提醒你喝点水，不催促，也不打卡。':'工作一阵子，站起来走两步或伸个懒腰。'}</p></div></div>${toggle(`${kind}.enabled`,c[kind].enabled,names[kind])}</div><div class="form-row"><div><div class="label">提醒间隔</div><p data-next="${kind}"></p></div><select data-setting="${kind}.minutes" aria-label="${names[kind]}间隔">${[30,45,60,90,120].map(n=>`<option value="${n}" ${c[kind].minutes===n?'selected':''}>每 ${n} 分钟</option>`).join('')}</select></div><div class="card-bottom"><span class="note">支持完成、延后 10 分钟和跳过</span><button class="link" data-action="preview-reminder" data-value="${kind}">看看提醒效果 ↗</button></div></section>`).join('')}
  <section class="card"><h2 class="card-section-title">只在这些时间，轻轻提醒你</h2>${c.windows.map((w,i)=>`<div class="window-row"><span class="time-label">时段 ${i+1}</span><input type="time" data-window="${i}" data-part="start" value="${w.start}" aria-label="时段 ${i+1} 开始"><span class="dash">—</span><input type="time" data-window="${i}" data-part="end" value="${w.end}" aria-label="时段 ${i+1} 结束"><label class="switch"><input type="checkbox" data-window="${i}" data-part="enabled" aria-label="启用时段 ${i+1}" ${w.enabled?'checked':''}><span></span></label></div>`).join('')}<p class="field-help">每天重复，按电脑本地时间运行。时段不能重叠或跨午夜；两段都关闭时，仅保留主动互动。</p></section>
  <section class="card"><div class="card-top"><div><h3>想专心一会儿？</h3><p class="subtitle" data-status></p></div></div><div class="button-row"><button class="secondary" data-action="pause" data-value="30">暂停 30 分钟</button><button class="secondary" data-action="pause" data-value="60">暂停 1 小时</button><button class="secondary" data-action="pause" data-value="tomorrow">直到明天</button><button class="quiet" data-action="resume">恢复提醒</button></div></section></div>
  <div class="info-note">全屏时自动收起，锁屏或唤醒后重新计时，错过的提醒不补发。两次自动气泡至少相隔 10 分钟。屏幕共享前，也可以手动暂停。</div>`;
}
function love(){const c=state.config,quotes=c.quotes.filter(q=>quoteFilter==='custom'?!q.builtin:q.builtin);
  return heading('把心意，写成日常','不用华丽。你亲口想说的话，就是最好的礼物。')+`
  <section class="card"><div class="grid-2"><div class="field"><label for="nickname">她的昵称</label><input id="nickname" type="text" maxlength="20" data-setting="nickname" value="${esc(c.nickname)}" placeholder="例如：宝贝、小朋友"></div><div class="field"><label for="sender">你的称呼</label><input id="sender" type="text" maxlength="20" data-setting="sender" value="${esc(c.sender)}" placeholder="例如：阿辰、你的大朋友"></div></div><div class="field"><label for="welcome">初次见面的欢迎语</label><textarea id="welcome" maxlength="100" data-setting="welcome" rows="3" placeholder="写一段想让她第一眼看到的话…">${esc(c.welcome)}</textarea><div class="field-help">支持 {昵称} 和 {我的称呼}，最多 100 字。欢迎语在开始陪伴时自动出现一次。</div></div><button class="link" data-action="preview-welcome">在桌面预览欢迎语 ↗</button></section>
  <section class="card" style="margin-top:15px"><div class="form-row"><div><div class="label">偶尔，冒出一句情话</div><p>随机间隔 2～3 小时，每天最多 2 次；遵守安静规则。</p></div>${toggle('loveEnabled',c.loveEnabled,'自动情话')}</div><div class="form-row"><div><div class="label">也使用伴伴准备的温柔文案</div><p>目前有 <span data-quote-count>${state.status.quoteCount}</span> 条可用情话。只想留下你的话，可以关闭。</p></div>${toggle('useBuiltIn',c.useBuiltIn,'使用内置文案')}</div></section>
  ${state.status.quoteCount===0?'<div class="info-note warn">暂时没有可用情话，自动情话已安静等待。添加一句，或开启内置文案即可恢复。</div>':''}
  <div class="quote-toolbar"><div class="quote-tabs"><button data-filter="custom" class="${quoteFilter==='custom'?'active':''}">你的专属心意</button><button data-filter="builtin" class="${quoteFilter==='builtin'?'active':''}">伴伴的小纸条</button></div><button class="secondary" data-action="new-quote">＋ 写一句</button></div>
  <div class="quote-list">${quotes.length?quotes.map(q=>`<article class="quote-card ${q.enabled?'':'off'}"><div class="quote-content" data-action="edit-quote" data-id="${q.id}"><div class="quote-tag">${q.builtin?'BANBAN NOTE':'ONLY FOR YOU'} ${q.enabled?'':' · 已停用'}</div><p>${esc(q.text)}</p></div><div class="quote-actions"><button class="icon-btn" data-action="preview-quote" data-id="${q.id}" title="在桌面预览" aria-label="预览情话">▷</button><button class="icon-btn" data-action="edit-quote" data-id="${q.id}" title="编辑" aria-label="编辑情话">✎</button><button class="icon-btn" data-action="delete-quote" data-id="${q.id}" title="删除" aria-label="删除情话">×</button></div><label class="switch"><input type="checkbox" data-quote-toggle="${q.id}" aria-label="启用这条情话" ${q.enabled?'checked':''}><span></span></label></article>`).join(''):`<div class="empty-state"><b>♡</b><p>这里还空着，等你写下第一句喜欢。<br>一个只有你们懂的梗，也很好。</p><button class="link" data-action="new-quote">写下第一句 →</button></div>`}</div>
  <div class="gift-bar"><div><h3>你准备好，她打开就有一位小伙伴</h3><p>称呼、情话、提醒时间与外观，都一起带过去。</p></div><button class="primary" data-page="delivery">去制作她的桌宠 ↗</button></div>`;
}
function delivery(){const c=state.config,custom=c.quotes.filter(q=>!q.builtin&&q.enabled).length;return heading('你准备好，她只管收下','把所有小心意装进一个文件。她双击打开，伴伴就会来到桌角。')+`
 <section class="card"><div class="eyebrow">MADE BY YOU · ONLY FOR HER</div><h2>这份陪伴，已经装好了些什么</h2><div class="form-row"><div><div class="label">称呼与第一句话</div><p>给 ${esc(c.nickname||'亲爱的')} · 来自 ${esc(c.sender||'我')}</p></div><button class="link" data-page="love">去修改 →</button></div><div class="preview-letter">${esc(c.welcome||'我来陪你啦。')}</div><div class="form-row"><div><div class="label">喝水与起身提醒</div><p>喝水：${c.water.enabled?`每 ${c.water.minutes} 分钟`:'关闭'}　起身：${c.stretch.enabled?`每 ${c.stretch.minutes} 分钟`:'关闭'}</p><p>${c.windows.filter(w=>w.enabled).map(w=>w.start+'–'+w.end).join(' / ')||'自动提醒时段已关闭'}</p></div><button class="link" data-page="reminders">去调整 →</button></div><div class="form-row"><div><div class="label">偶尔冒出的情话</div><p>${custom} 条专属心意${c.useBuiltIn?'，也带上内置的温柔文案':''} · 自动情话${c.loveEnabled?'开启':'关闭'}</p></div><button class="link" data-page="love">再写一句 →</button></div><div class="form-row"><div><div class="label">桌宠的模样</div><p>${characters[c.petCharacter]} · ${({small:'小小只',medium:'刚刚好',large:'大一点'})[c.petSize]} · ${c.alwaysOnTop?'在窗口上方陪伴':'不置顶'}</p></div><button class="link" data-page="appearance">去看看 →</button></div></section>
 <section class="card" style="margin-top:16px"><div class="form-row"><div><div class="label">藏起来的惊喜</div><p>${c.moments.hugEnabled?'长按抱抱 · ':''}${c.moments.umbrellaEnabled?'情绪小伞 · ':''}五连击爱心</p><p>${c.moments.anniversary.enabled?`纪念日：${esc(c.moments.anniversary.date)} · ${esc(c.moments.anniversary.title)}`:'纪念日花束暂未开启'}</p></div><button class="link" data-page="moments">去准备 →</button></div></section>
 <section class="card delivery-card"><div class="delivery-heart">♡</div><h2>她收到的，就只是一只桌宠</h2><p class="subtitle">不用导入文件，不用填写设置。<br>你的配置会直接生效；她仍然可以暂停、隐藏和退出。</p><button class="primary" data-action="export-companion" ${state.exporting?'disabled':''}>${state.exporting?'正在准备伴伴…':'制作送给她的桌宠 .exe'} ↗</button><p class="note" id="gift-progress">${state.exporting?'伴伴正在准备行李，请稍等一会儿。':'生成后，把这一个文件发给她就好。首次打开会安顿运行文件。'}</p>${state.lastExport?'<button class="link" data-action="reveal-companion">打开刚刚生成的文件所在位置 →</button>':''}</section>
 <div class="info-note">你当前的拖动位置、暂停状态、隐藏状态和使用记录不会带过去。以后修改内容，重新制作一份发给她即可。此页面是你这边的制作工具，她收到的桌宠不会显示设置中心。</div>`;}
function appearance(){const c=state.config;return heading('你的桌角，我的小窝','选一位软乎乎的小伙伴，把喜欢带到她身边。')+`
  <div class="character-options" role="group" aria-label="选择桌宠形象">${Object.entries(characters).map(([value,label])=>`<button class="character-option ${c.petCharacter===value?'active':''}" data-action="character" data-value="${value}" aria-pressed="${c.petCharacter===value}"><span class="character-badge">${c.petCharacter===value?'正在陪伴':'点击选择'}</span><span class="cat-art character-art" data-mood="idle">${petSVG[value]}</span><strong>${label}</strong><span>${value==='dog'?'毛茸茸的大脑袋，摇着尾巴等你摸摸':'软软的小爪子，呼噜声里都是喜欢'}</span></button>`).join('')}</div>
  <div class="touch-preview"><div><h3>摸摸它，听听今天的小心意</h3><p>每个形象有 40 句回应，会叫她的昵称，最近 8 句不重复。</p></div><button class="secondary" data-action="manual-pet">摸摸试试看 ♡</button></div>
  <div class="stack" style="margin-top:16px"><section class="card"><div class="form-row"><div><div class="label">桌宠的大小</div><p>可以用鼠标拖动伴伴，放在喜欢的角落。</p></div><div class="size-options">${[['small','小小只'],['medium','刚刚好'],['large','大一点']].map(([v,label])=>`<button class="size-option ${c.petSize===v?'active':''}" data-action="size" data-value="${v}">${label}</button>`).join('')}</div></div><div class="form-row"><div><div class="label">保持在其他窗口上方</div><p>气泡不会抢走你正在输入的焦点。</p></div>${toggle('alwaysOnTop',c.alwaysOnTop,'置顶显示')}</div><div class="form-row"><div><div class="label">暂时藏起伴伴</div><p>隐藏后自动提醒也会暂停，托盘里仍然能找到它。</p></div>${toggle('hidden',c.hidden,'隐藏桌宠')}</div></section><section class="card"><div class="form-row"><div><div class="label">找不到伴伴了？</div><p>让它回到当前屏幕的右下角。</p></div><button class="secondary" data-action="reset-position">带它回家</button></div></section></div><div class="info-note">在“专属心意”里填写她的昵称，点击回应就会自然带上称呼。选好形象后，前往“送给她”制作桌宠，她打开就能看到你选好的小伙伴。</div>`;}
function general(){const c=state.config;return heading('安心地，陪伴下去','伴伴的习惯、数据与一些说明，都放在这里。')+`
  <div class="stack"><section class="card"><div class="form-row"><div><div class="label">开机时，伴伴也来报到</div><p>${state.packaged?'仅在你主动开启后生效，随时可以关闭。':'安装正式版本后可以开启；开发预览不会修改开机启动。'}</p></div>${toggle('startAtLogin',c.startAtLogin,'开机启动')}</div><div class="form-row"><div><div class="label">全屏自动避让</div><p>${state.fullscreenAvailable?'检测服务正在运行。全屏时隐藏，退出后恢复。':'检测服务尚未就绪，可先用手动暂停保持安静。'}</p></div><span class="badge">${state.fullscreenAvailable?'已就绪':'等待连接'}</span></div><div class="form-row"><div><div class="label">本地数据</div><p>无需账号，不联网，不上传你的专属内容。</p></div><span class="path">${esc(state.dataPath)}</span></div></section>
  <section class="card"><div class="form-row"><div><div class="label">恢复默认设置</div><p>重置外观、提醒与安静设置，保留你的专属内容。</p></div><button class="secondary" data-action="reset-settings">恢复默认</button></div><div class="form-row"><div><div class="label">清除专属内容</div><p>删除本机称呼、欢迎语和自定义文案，不能撤销。</p></div><button class="danger" data-action="clear-private">清除内容</button></div></section>
  <section class="card version-card"><img src="../../assets/${c.petCharacter==='dog'?'dog-icon':'icon'}.png" alt="伴伴"><h2>伴伴 <span class="badge">${esc(state.version)}</span></h2><p>陪你认真生活，也陪你偷偷放松的小伙伴。<br>Windows 桌面版 · 核心功能完全离线</p><div class="button-row" style="justify-content:center;margin-top:16px"><button class="quiet" data-action="quit">退出伴伴</button></div></section></div>`;}
function render(){
  $('#app-version').textContent=`v${state.version}`;
  const scroll=content.scrollTop;content.innerHTML=({home,reminders,love,appearance,general,delivery,moments})[page]();
  $('#page-name').textContent=titles[page];$('#brand-icon').src=state.config.petCharacter==='dog'?'../../assets/dog-icon.png':'../../assets/icon.png';document.querySelectorAll('.nav').forEach(button=>button.classList.toggle('active',button.dataset.page===page));updateStatus();content.scrollTop=scroll;
}
async function navigate(target){await flush();page=target;render();content.scrollTop=0;}
function openDialog(html){$('#dialog-body').innerHTML=html;$('#dialog').showModal();}
function closeDialog(){$('#dialog').close();}
function quoteEditor(id){const quote=state.config.quotes.find(q=>q.id===id);openDialog(`<h2>${quote?'再斟酌一下这句喜欢':'写一句，只属于你们的话'}</h2><p class="subtitle">温柔一点，自然一点。最长 100 字。</p><textarea id="quote-editor" maxlength="100" rows="5" placeholder="例如：{昵称}，今天也想把我的偏爱，偷偷放在你桌面上。">${esc(quote?.text||'')}</textarea><div class="count" id="quote-count">${quote?.text.length||0} / 100</div><p class="field-help">支持 {昵称} 和 {我的称呼}。${quote?.builtin?'修改后会成为你的专属文案，随礼物包一起导出。':'建议 10～50 字，短一点更适合桌面气泡。'}</p><p class="dialog-error" id="dialog-error"></p><div class="button-row"><button class="quiet" data-action="close-dialog">取消</button><button class="primary" data-action="save-quote" data-id="${esc(id||'')}">收好这句心意</button></div>`);$('#quote-editor').focus();}
async function importGift(){const result=await api.call('read-gift');if(result.canceled)return;const g=result.gift;openDialog(`<h2>收到一份小小的心意</h2><p class="subtitle">导入后会替换现有的专属内容，提醒与安静设置保持不变。</p><p class="note">给 ${esc(g.nickname||'亲爱的')} · 来自 ${esc(g.sender||'一个喜欢你的人')}</p><div class="preview-text">${esc(g.welcome||'没有填写欢迎语')}</div><p class="note">包含 ${g.quotes.length} 条专属情话。</p><div class="button-row"><button class="quiet" data-action="close-dialog">先不导入</button><button class="primary" data-action="apply-gift">收下这份礼物</button></div>`);}
async function action(button){const name=button.dataset.action,id=button.dataset.id,value=button.dataset.value;
  if(name==='close-dialog'){closeDialog();return;}
  await flush();
  if(name==='start'){state=await api.call('start');render();toast('伴伴已经到桌面啦。拖动移动，右键打开菜单。');}
  else if(name==='show-pet'){await queueSave({hidden:false});await api.call('close-settings');}
  else if(name==='manual-love'){const result=await api.call('manual','love');if(!result.shown)toast('先点击“开始陪伴”，伴伴就会来啦');else toast('看看桌角，伴伴有话想对你说。');}
  else if(name==='preview-reminder'){const result=await api.call('manual',value);toast(result.shown?'提醒预览已在桌面出现，不影响提醒周期。':'先回到伴伴的家，点击“开始陪伴”。');}
  else if(name==='pause'){state=await api.call('pause',value==='tomorrow'?'tomorrow':Number(value));render();toast('好呀，伴伴会安静陪着你。');}
  else if(name==='resume'){state=await api.call('pause','resume');render();toast('已恢复，按完整间隔开始下一轮提醒。');}
  else if(name==='character'){await queueSave({petCharacter:value});render();toast(characters[value]+'来陪你啦。');}
  else if(name==='manual-pet'){const result=await api.call('manual','pet');toast(result.shown?'看看桌角，伴伴收到你的摸摸啦。':'先回到伴伴的家，点击“开始陪伴”。');}
  else if(name==='preview-moment'){const result=await api.call('preview-moment',value);toast(result.shown?'小惊喜已经在桌角等你啦。':'先回到伴伴的家，点击“开始陪伴”。');}
  else if(name==='size'){await queueSave({petSize:value});render();}
  else if(name==='reset-position'){state=await api.call('reset-position');render();toast('伴伴回到屏幕右下角啦。');}
  else if(name==='new-quote')quoteEditor();
  else if(name==='edit-quote')quoteEditor(id);
  else if(name==='save-quote'){
    const text=$('#quote-editor').value.trim();if(!text){$('#dialog-error').textContent='先写点什么吧，这里还空着呢。';return;}
    const previous=state.config.quotes.find(q=>q.id===id);const quote={id:id||crypto.randomUUID(),text,enabled:previous?.enabled??true,builtin:false};
    await queueSave(()=>({quotes:previous?state.config.quotes.map(q=>q.id===id?quote:q):[...state.config.quotes,quote]}));quoteFilter='custom';closeDialog();render();toast('这句心意，收好啦。');
  }
  else if(name==='delete-quote'){const quote=state.config.quotes.find(q=>q.id===id);openDialog(`<h2>删除这条情话？</h2><div class="preview-text">${esc(quote.text)}</div><p class="note">也可以取消，然后关闭开关，暂时不展示这句。</p><div class="button-row"><button class="quiet" data-action="close-dialog">留下它</button><button class="danger" data-action="confirm-delete" data-id="${id}">删除</button></div>`);}
  else if(name==='confirm-delete'){await queueSave(()=>({quotes:state.config.quotes.filter(q=>q.id!==id)}));closeDialog();render();}
  else if(name==='preview-quote'||name==='preview-welcome'){
    const text=name==='preview-welcome'?state.config.welcome:state.config.quotes.find(q=>q.id===id).text;const result=await api.call('manual','preview',text);toast(result.shown?'已经放到伴伴的气泡里啦。':'先回到伴伴的家，点击“开始陪伴”。');
  }
  else if(name==='import')await importGift();
  else if(name==='apply-gift'){state=await api.call('apply-gift');closeDialog();render();toast('礼物收到了。专属内容已保存。');}
  else if(name==='export'){const result=await api.call('export-gift');if(!result.canceled)toast('礼物包已保存，和安装包一起送给她吧。');}
  else if(name==='export-companion'){const result=await api.call('export-companion');if(!result.canceled){state=await api.call('get-state');render();toast('她的桌宠准备好啦。把这一个 exe 文件送给她就行。');}}
  else if(name==='reveal-companion')await api.call('reveal-companion');
  else if(name==='reset-settings'||name==='clear-private'){const result=await api.call(name);if(result.state){state=result.state;render();toast(name==='clear-private'?'专属内容已清除。':'已经恢复默认设置。');}}
  else if(name==='quit')await api.call('quit');
}
document.addEventListener('click',e=>{
  const nav=e.target.closest('[data-page]');if(nav){navigate(nav.dataset.page).catch(error=>toast(error.message));return;}
  const filter=e.target.closest('[data-filter]');if(filter){flush().then(()=>{quoteFilter=filter.dataset.filter;render();}).catch(error=>toast(error.message));return;}
  const button=e.target.closest('[data-action]');if(button){if(button.disabled)return;button.disabled=true;action(button).catch(error=>toast(error.message)).finally(()=>{if(button.isConnected)button.disabled=false;});}
});
function settingPatch(el){const key=el.dataset.setting;let value=el.type==='checkbox'?el.checked:el.value;
  if(el.dataset.list)value=value.split(/\r?\n/).map(line=>line.trim()).filter(Boolean);
  const keys=key.split('.');if(keys.at(-1)==='minutes')value=Number(value);
  return ()=>{const root=keys[0];if(keys.length===1)return {[root]:value};const copy=structuredClone(state.config[root]);let target=copy;for(const part of keys.slice(1,-1))target=target[part];target[keys.at(-1)]=value;return {[root]:copy};};
}
document.addEventListener('input',e=>{
  const el=e.target;if(el.id==='quote-editor'){$('#quote-count').textContent=`${el.value.length} / 100`;return;}
  if(!el.dataset.setting||!['text','textarea'].includes(el.type))return;
  const key=el.dataset.setting;clearTimeout(pendingInputs.get(key)?.timer);const patch=settingPatch(el);
  const timer=setTimeout(()=>{pendingInputs.delete(key);queueSave(patch).catch(()=>{});},450);pendingInputs.set(key,{timer,patch});saved('正在写下这份心意…');
});
document.addEventListener('change',e=>{
  const el=e.target;
  if(el.dataset.setting){const key=el.dataset.setting;if(['text','textarea'].includes(el.type)){const entry=pendingInputs.get(key);if(entry){clearTimeout(entry.timer);pendingInputs.delete(key);queueSave(entry.patch).catch(()=>{});}}
    else queueSave(settingPatch(el)).then(()=>{if(page==='home'||page==='appearance'||page==='love'||page==='moments')render();}).catch(()=>{});
  }
  if(el.dataset.window!==undefined){const windows=state.config.windows.map((w,i)=>({start:content.querySelector(`[data-window="${i}"][data-part="start"]`).value,end:content.querySelector(`[data-window="${i}"][data-part="end"]`).value,enabled:content.querySelector(`[data-window="${i}"][data-part="enabled"]`).checked}));queueSave({windows}).catch(()=>{});}
  if(el.dataset.quoteToggle){const id=el.dataset.quoteToggle,enabled=el.checked;queueSave(()=>({quotes:state.config.quotes.map(q=>q.id===id?{...q,enabled}:q)})).then(()=>render()).catch(()=>{});}
});
$('#dialog').addEventListener('click',e=>{if(e.target===$('#dialog')){const r=$('#dialog').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeDialog();}});
api.on('state',value=>{state=value;if(content.children.length)updateStatus();});
api.on('status',value=>{if(state){state.status=value;updateStatus();}});
api.on('gift-progress',message=>{if($('#gift-progress'))$('#gift-progress').textContent=message;});
api.on('prepare-close',async({quit})=>{try{await flush();await api.call('finish-close-settings',quit);}catch(error){toast('请先修正尚未保存的设置：'+error.message);}});
Promise.all([api.call('get-state'),...['cat','dog'].map(value=>fetch(`../../assets/${value}.svg`).then(r=>r.text()))]).then(([initial,cat,dog])=>{state=initial;petSVG={cat,dog};render();}).catch(error=>{content.textContent='伴伴暂时没有准备好：'+error.message;});
document.addEventListener('visibilitychange',()=>document.body.classList.toggle('asleep',document.hidden));
