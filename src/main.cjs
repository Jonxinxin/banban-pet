const { app, BrowserWindow, Menu, Tray, nativeImage, ipcMain, screen, powerMonitor, dialog, session, shell, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { Store } = require('./core/store.cjs');
const { defaults, validateConfig, validateGift, exportGift, renderText, defaultRuntime } = require('./core/config.cjs');
const { Scheduler, nextMorning } = require('./core/scheduler.cjs');
const {petWindowSize,clampPet,positionBubble}=require('./core/geometry.cjs');
const {createCompanion,validateCompanion,companionConfig}=require('./core/companion.cjs');
const {makeCompanion}=require('./core/delivery.cjs');
const {pickTouch}=require('./core/touch.cjs');
const {HeartGesture}=require('./core/easter-egg.cjs');
const {anniversaryInfo,pendingAnniversary}=require('./core/moments.cjs');
const TEST = process.env.BANBAN_TEST === '1';
const ROOT = path.join(__dirname, '..');
let companion=null,bootstrapError=null;
if(process.env.BANBAN_GIFT_MANIFEST){try{companion=validateCompanion(JSON.parse(fs.readFileSync(process.env.BANBAN_GIFT_MANIFEST,'utf8')));}catch(error){bootstrapError=error;}}
const RECIPIENT=Boolean(companion);
app.setName(RECIPIENT?'BanbanGift':'Banban');
if(RECIPIENT)app.setPath('userData',path.join(app.getPath('appData'),'BanbanGifts',companion.id));
// A small 2D companion benefits more from low memory use than a dedicated GPU context.
app.disableHardwareAcceleration();
app.setAppUserModelId('local.banban.pet');
if (TEST && process.env.BANBAN_TEST_DATA) app.setPath('userData', process.env.BANBAN_TEST_DATA);
if (!app.requestSingleInstanceLock()) { app.quit(); }
else {
  let store, scheduler, pet, settings, bubbleWindow, tray, sensor, interval, currentBubble = null, dragStart = null, dragTimer=null;
  let quitting = false, fullscreenAvailable = process.platform !== 'win32', sensorBuffer = '', restartingSensor = false;
  let pendingGift = null, petReady = false, settingsClosing = false, lastClockOffset = Date.now() - performance.now();
  let bubbleReady=false,bubbleSize={width:344,height:160},firstCompanion=false,exporting=false,lastExport=null,positionTimer,nativeTestResolve;
  const heartGesture=new HeartGesture();
  let momentWindow=null,momentSession=null,momentTimer=null,momentEscape=false;
  let gazeTimer=null,gazeRequested=false,lastGaze=null;
  let surpriseWindow=null,surpriseTimer=null,surpriseEscape=false,surprisePayload=null;
  const iconPath = () => path.join(ROOT,'assets',store?.config.petCharacter==='dog'?'dog-icon.png':'icon.png');
  function updateIcon(){const icon=nativeImage.createFromPath(iconPath());tray?.setImage(icon.resize({width:32,height:32}));pet?.setIcon(icon);settings?.setIcon(icon);}
  const log = code => {
    try { const file=path.join(app.getPath('userData'),'errors.log'); if(fs.existsSync(file)&&fs.statSync(file).size>100000) fs.writeFileSync(file,''); fs.appendFileSync(file,`${new Date().toISOString()} ${code}\n`); } catch {}
  };
  const send = (win, channel, value) => { if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(channel,value); };
  const userAction = action => (...args) => {
    try { return action(...args); }
    catch(error) { log('USER_ACTION_FAILED');dialog.showMessageBox({type:'info',title:'伴伴',message:error.message||'操作暂时没有完成，请重试。',buttons:['知道啦']}).catch(()=>{}); }
  };
  function snapshot() {
    return { config: store.config, status: scheduler.status(Date.now()), version: app.getVersion(), recovered:store.recovered,
      fullscreenAvailable, packaged:app.isPackaged, recipient:RECIPIENT, exporting, lastExport, dataPath:app.getPath('userData') };
  }
  function broadcast() { const state=snapshot(); send(pet,'state',state); send(settings,'state',state); }
  function secure(win) {
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.on('render-process-gone',()=>{ log('RENDERER_EXIT'); if(!quitting) win.reload(); });
  }
  function clampPosition(position) {
    const size=petWindowSize(store.config.petSize);
    const display=position?screen.getDisplayMatching({...position,width:size,height:size}):screen.getPrimaryDisplay();
    const area=display.workArea;
    const candidate=position||{x:area.x+area.width-size-20,y:area.y+area.height-size-16};
    return clampPet(candidate,size,area);
  }
  function createPet() {
    const pos=clampPosition(store.config.position);
    const size=petWindowSize(store.config.petSize);
    pet=new BrowserWindow({ ...pos,width:size,height:size,frame:false,transparent:true,resizable:false,
      skipTaskbar:true,alwaysOnTop:store.config.alwaysOnTop,focusable:false,hasShadow:false,show:false,
      title:'伴伴 · 桌面伙伴',icon:iconPath(),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:true} });
    secure(pet); pet.setIgnoreMouseEvents(true,{forward:true});
    pet.loadFile(path.join(__dirname,'ui','pet.html'));
    pet.webContents.on('did-finish-load',()=>{petReady=true;lastGaze=null;syncVisibility();syncGazeTracking();broadcast();if(firstCompanion){firstCompanion=false;setTimeout(()=>showBubble({kind:'welcome',text:renderText(store.config.welcome||'我来陪你啦。',store.config),automatic:false}),350);}});
    pet.on('show',syncGazeTracking);pet.on('hide',syncGazeTracking);
    pet.on('move',()=>{if(dragStart)return;positionCurrentBubble();clearTimeout(positionTimer);positionTimer=setTimeout(persistPosition,250);});
    pet.on('close',event=>{if(!quitting){event.preventDefault();savePatch({hidden:true});}});
  }
  function sampleGaze(){
    if(!petReady||!pet||pet.isDestroyed()||!pet.isVisible()||dragStart)return;
    // Both coordinates use DIP, including scaled and negative-coordinate displays.
    const cursor=screen.getCursorScreenPoint(),bounds=pet.getBounds();
    const point={x:cursor.x-bounds.x,y:cursor.y-bounds.y,width:bounds.width,height:bounds.height};
    if(lastGaze&&Object.keys(point).every(key=>point[key]===lastGaze[key]))return;
    lastGaze=point;send(pet,'gaze',{x:point.x,y:point.y});
  }
  function syncGazeTracking(){
    const active=!quitting&&gazeRequested&&petReady&&pet&&!pet.isDestroyed()&&pet.isVisible();
    if(!active){clearInterval(gazeTimer);gazeTimer=null;lastGaze=null;return;}
    if(!gazeTimer){sampleGaze();gazeTimer=setInterval(sampleGaze,1000/30);}
  }
  function openSettings() {
    if(RECIPIENT)return;
    if(settings&&!settings.isDestroyed()){settings.show();settings.focus();return;}
    settingsClosing=false;
    settings=new BrowserWindow({width:1060,height:800,minWidth:880,minHeight:660,show:false,
      title:'伴伴 · 陪伴设置',icon:iconPath(),backgroundColor:'#f9f8f4',autoHideMenuBar:true,
      webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true} });
    secure(settings);settings.setMenu(null);
    settings.loadFile(path.join(__dirname,'ui','settings.html'));
    settings.once('ready-to-show',()=>{settings.show();settings.focus();});
    settings.on('close',event=>{if(!quitting&&!settingsClosing){event.preventDefault();send(settings,'prepare-close',{quit:false});}});
    settings.on('closed',()=>{settings=null;pendingGift=null;});
  }
  function createBubbleWindow(){
    bubbleWindow=new BrowserWindow({width:344,height:160,frame:false,transparent:true,resizable:false,skipTaskbar:true,alwaysOnTop:store.config.alwaysOnTop,focusable:false,hasShadow:false,show:false,title:'伴伴的小纸条',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    secure(bubbleWindow);bubbleWindow.setIgnoreMouseEvents(true,{forward:true});bubbleWindow.loadFile(path.join(__dirname,'ui','bubble.html'));
    bubbleWindow.webContents.on('did-finish-load',()=>{bubbleReady=true;if(currentBubble)send(bubbleWindow,'bubble',currentBubble);});
    bubbleWindow.on('close',event=>{if(!quitting){event.preventDefault();clearBubble();}});
  }
  function positionCurrentBubble(){
    if(!currentBubble||!bubbleReady||!pet?.isVisible()||dragStart){bubbleWindow?.hide();return;}
    const bounds=pet.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
    const next=positionBubble(bounds,bubbleSize,area);bubbleWindow.setBounds({x:next.x,y:next.y,width:next.width,height:next.height});bubbleWindow.showInactive();
  }
  function clearBubble() {currentBubble=null;send(pet,'bubble',null);send(bubbleWindow,'bubble',null);bubbleWindow?.hide();}
  function closeSurprise(){
    clearTimeout(surpriseTimer);surpriseTimer=null;heartGesture.reset();
    if(surpriseEscape){globalShortcut.unregister('Escape');surpriseEscape=false;}
    const win=surpriseWindow;surpriseWindow=null;surprisePayload=null;
    if(win&&!win.isDestroyed())win.destroy();send(pet,'bubble',null);
  }
  function startSurprise(){
    if(surpriseWindow||!pet?.isVisible()||scheduler.flags.fullscreen||scheduler.flags.locked||scheduler.flags.suspended)return false;
    clearBubble();const bounds=pet.getBounds(),display=screen.getDisplayMatching(bounds);
    const win=new BrowserWindow({...display.bounds,fullscreen:true,frame:false,transparent:true,resizable:false,movable:false,skipTaskbar:true,focusable:false,hasShadow:false,show:false,enableLargerThanScreen:true,title:'伴伴 · 藏不住的喜欢',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false}});
    surpriseWindow=win;surprisePayload={nickname:store.config.nickname,sender:store.config.sender,origin:{x:bounds.x+bounds.width/2-display.bounds.x,y:bounds.y+bounds.height/2-display.bounds.y}};
    win.setMenu(null);win.setAlwaysOnTop(true,'screen-saver');win.setIgnoreMouseEvents(true,{forward:true});
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
    win.webContents.on('render-process-gone',()=>{if(surpriseWindow===win)closeSurprise();});
    win.webContents.on('did-fail-load',()=>{if(surpriseWindow===win)closeSurprise();});
    win.on('closed',()=>{if(surpriseWindow===win)closeSurprise();});
    surpriseTimer=setTimeout(closeSurprise,5000);
    win.loadFile(path.join(__dirname,'ui','surprise.html')).catch(()=>{if(surpriseWindow===win)closeSurprise();});
    return true;
  }
  function closeMoment(){
    clearTimeout(momentTimer);momentTimer=null;
    if(momentEscape){globalShortcut.unregister('Escape');momentEscape=false;}
    const win=momentWindow;momentWindow=null;momentSession=null;
    if(win&&!win.isDestroyed())win.destroy();if(win)send(pet,'bubble',null);
  }
  function startMoment(kind,preview=false){
    if(!['hug','anniversary','umbrella'].includes(kind))throw Error('没有这个小惊喜');
    if(!store.config.onboarded){openSettings();return {shown:false};}
    if(scheduler.flags.fullscreen||scheduler.flags.locked||scheduler.flags.suspended)return {shown:false};
    const c=store.config,m=c.moments;
    if(!preview&&!(kind==='anniversary'?m.anniversary.enabled:m[kind+'Enabled']))return {shown:false};
    if(kind==='anniversary'&&!m.anniversary.date)throw Error('先在“藏起来的惊喜”里填写纪念日日期吧');
    if(c.hidden)savePatch({hidden:false});
    closeMoment();if(surpriseWindow)closeSurprise();heartGesture.reset();clearBubble();
    const info=anniversaryInfo(c),bounds=pet.getBounds(),area=screen.getDisplayMatching(bounds).workArea;
    const box=positionBubble(bounds,{width:420,height:610},area);
    const win=new BrowserWindow({x:box.x,y:box.y,width:box.width,height:box.height,frame:false,transparent:true,resizable:false,skipTaskbar:true,focusable:false,hasShadow:false,show:false,title:'伴伴 · 小小的惊喜',webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
    momentWindow=win;momentSession={kind,preview,config:structuredClone(c),info,painted:false};
    win.setAlwaysOnTop(true);win.setIgnoreMouseEvents(true,{forward:true});win.setMenu(null);
    win.webContents.setWindowOpenHandler(()=>({action:'deny'}));win.webContents.on('will-navigate',event=>event.preventDefault());
    for(const event of ['render-process-gone','did-fail-load'])win.webContents.on(event,()=>{if(momentWindow===win)closeMoment();});
    win.on('closed',()=>{if(momentWindow===win)closeMoment();});
    momentTimer=setTimeout(closeMoment,5000);win.loadFile(path.join(__dirname,'ui','moment.html')).catch(()=>{if(momentWindow===win)closeMoment();});
    return {shown:true};
  }
  function momentData(){
    const {kind,preview,config:c,info}=momentSession;
    const lines={hug:'{昵称}，今天辛苦啦。把毛茸茸的抱抱借给你，抱一会儿再去忙吧。',umbrella:'{昵称}，今天不用表现得很好。我喜欢的本来就是你。',anniversary:'{昵称}，这一束花，送给我们一起走过的日子。以后也想和你，慢慢走，好好爱。'};
    return {kind,preview,character:c.petCharacter,nickname:c.nickname||'亲爱的',signature:c.sender?`来自 ${c.sender} 的偏爱`:'来自一个一直喜欢你的人',text:renderText(lines[kind],c),againText:renderText('{昵称}，抱抱可以续杯。你不急着走，我就不松开。',c),hugEnabled:c.moments.hugEnabled,anniversaryTitle:c.moments.anniversary.title,days:info?.days};
  }
  function triggerHug(){if(!dragStart||dragStart.moved||dragStart.hugged||!store.config.moments.hugEnabled)return;dragStart.hugged=true;heartGesture.reset();userAction(()=>startMoment('hug'))();}
  function petTap(){
    if(surpriseWindow||momentWindow)return;
    if(!pet?.isVisible()||scheduler.flags.fullscreen||scheduler.flags.locked||scheduler.flags.suspended){heartGesture.reset();return;}
    if(pendingAnniversary(store.config,scheduler.runtime)&&startMoment('anniversary').shown)return;
    if(heartGesture.tap(performance.now())&&startSurprise())return;
    manual('pet');
  }
  function persistPosition(){if(!pet||pet.isDestroyed()||dragStart)return;const {x,y}=pet.getBounds();try{store.saveConfig({...store.config,position:{x,y},positionVersion:2});scheduler.config=store.config;}catch{log('POSITION_SAVE_FAILED');}}
  function finishDrag(moved){if(!dragStart)return;const held=performance.now()-dragStart.started,hugged=dragStart.hugged;clearInterval(dragTimer);dragTimer=null;dragStart=null;persistPosition();const cursor=screen.getCursorScreenPoint(),bounds=pet.getBounds();send(pet,'drag-finished',{x:cursor.x-bounds.x,y:cursor.y-bounds.y});positionCurrentBubble();if(moved||held>600)heartGesture.reset();if(!moved&&!hugged)userAction(()=>held>=2000?startMoment('hug'):held>600?manual('pet'):petTap())();}
  function beginDrag(){
    if(dragStart)return;if(momentWindow)closeMoment();clearTimeout(positionTimer);const position=pet.getBounds();dragStart={cursor:screen.getCursorScreenPoint(),position,moved:false,started:performance.now(),hugged:false,native:Boolean(sensor?.stdin?.writable&&fullscreenAvailable)};
    pet.setIgnoreMouseEvents(false);bubbleWindow?.hide();
    if(dragStart.native){const handle=pet.getNativeWindowHandle();const id=handle.length===8?handle.readBigUInt64LE():BigInt(handle.readUInt32LE());sensor.stdin.write(`drag ${id}\n`);}
    else{dragTimer=setInterval(()=>{if(!dragStart)return;const cursor=screen.getCursorScreenPoint();const dx=cursor.x-dragStart.cursor.x,dy=cursor.y-dragStart.cursor.y;if(Math.abs(dx)+Math.abs(dy)>4)dragStart.moved=true;if(!dragStart.moved&&performance.now()-dragStart.started>=2000)triggerHug();if(dragStart.moved){const p=clampPosition({x:dragStart.position.x+dx,y:dragStart.position.y+dy});pet.setPosition(p.x,p.y);}},16);}
  }
  function syncVisibility() {
    if(!petReady||!pet||pet.isDestroyed())return;
    const hidden=store.config.hidden||!store.config.onboarded||scheduler.flags.fullscreen||scheduler.flags.locked||scheduler.flags.suspended;
    if(hidden){if(dragStart){if(dragStart.native)sensor?.stdin?.write("cancel-drag\n");finishDrag(true);}if(momentWindow)closeMoment();heartGesture.reset();if(surpriseWindow)closeSurprise();clearBubble();pet.hide();send(pet,'sleep',true);}
    else {pet.showInactive();send(pet,'sleep',false);positionCurrentBubble();}
  }
  function trayMenu() {
    if(!tray)return;
    const paused=store.config.pauseUntil>Date.now();
    const menu=Menu.buildFromTemplate([
      {label:'伴伴 · 在桌角陪着你',enabled:false},
      {label:store.config.hidden?'显示桌宠':'隐藏桌宠',click:userAction(()=>savePatch({hidden:!store.config.hidden}))},
      {label:'来句情话',click:userAction(()=>manual('love'))},
      ...(store.config.moments.hugEnabled?[{label:'抱抱我',click:userAction(()=>startMoment('hug'))}]:[]),
      ...(store.config.moments.umbrellaEnabled?[{label:'今天有点累 · 情绪小伞',click:userAction(()=>startMoment('umbrella'))}]:[]),
      ...(store.config.moments.anniversary.enabled?[{label:'我们的纪念日 · 花束和信',click:userAction(()=>startMoment('anniversary'))}]:[]),
      {type:'separator'},
      {label:paused?'恢复自动提醒':'暂停提醒',...(paused?{click:userAction(()=>pause('resume'))}:{submenu:[
        {label:'30 分钟',click:userAction(()=>pause(30))},{label:'1 小时',click:userAction(()=>pause(60))},{label:'直到明天',click:userAction(()=>pause('tomorrow'))}]})},
      {label:'回到屏幕角落',click:userAction(()=>resetPosition())},
      ...(!RECIPIENT?[{label:'设置与制作礼物',click:openSettings}]:[]),
      {type:'separator'},{label:'退出伴伴',click:()=>requestQuit()}
    ]);
    tray.setContextMenu(menu);return menu;
  }
  function savePatch(patch) {
    const allowed=['nickname','sender','welcome','petSize','petCharacter','moments','alwaysOnTop','hidden','startAtLogin','water','stretch','windows','loveEnabled','useBuiltIn','pauseUntil','quotes'];
    if(!patch||typeof patch!=='object'||Object.keys(patch).some(k=>!allowed.includes(k)))throw new Error('设置项无效');
    const next=validateConfig({...store.config,...patch});
    if(next.startAtLogin!==store.config.startAtLogin){
      if(next.startAtLogin&&!app.isPackaged)throw new Error('安装正式版本后可开启开机启动');
      app.setLoginItemSettings({openAtLogin:next.startAtLogin,path:process.execPath,args:['--autostart']});
    }
    const previous=store.config;
    if(JSON.stringify(previous.moments)!==JSON.stringify(next.moments)){if(momentWindow)closeMoment();heartGesture.reset();}
    store.saveConfig(next);scheduler.update(next,Date.now());
    pet?.setAlwaysOnTop(next.alwaysOnTop);
    bubbleWindow?.setAlwaysOnTop(next.alwaysOnTop);
    if(previous.petCharacter!==next.petCharacter){if(momentWindow)closeMoment();heartGesture.reset();if(surpriseWindow)closeSurprise();clearBubble();updateIcon();}
    if(previous.petSize!==next.petSize&&pet){const old=pet.getBounds(),size=petWindowSize(next.petSize),pos=clampPosition({x:old.x+(old.width-size)/2,y:old.y+old.height-size});pet.setBounds({...pos,width:size,height:size});}
    if(scheduler.reason(Date.now())||['water','stretch','windows'].some(k=>JSON.stringify(previous[k])!==JSON.stringify(next[k])))clearBubble();
    scheduler.tick(Date.now(),Boolean(currentBubble||surpriseWindow||momentWindow));syncVisibility();trayMenu();broadcast();return snapshot();
  }
  function pause(value) {
    const until=value==='resume'?0:value==='tomorrow'?nextMorning(store.config,Date.now()):Date.now()+Number(value)*60000;
    if(!['resume','tomorrow',30,60].includes(value))throw new Error('暂停时间无效');
    savePatch({pauseUntil:until});return snapshot();
  }
  function requestQuit(){if(settings&&!settings.isDestroyed())send(settings,'prepare-close',{quit:true});else{quitting=true;app.quit();}}
  function resetPosition() {
    pet.setPosition(...Object.values(clampPosition(null)));
    store.saveConfig({...store.config,position:null,hidden:false});scheduler.update(store.config,Date.now());syncVisibility();broadcast();
  }
  function showBubble(event) {
    if(surpriseWindow||momentWindow||!store.config.onboarded||store.config.hidden||scheduler.flags.fullscreen||scheduler.flags.locked||scheduler.flags.suspended)return false;
    const texts={water:'忙了一会儿啦，喝两口水吧～',stretch:'陪我伸个懒腰，起来走两步吧。',combined:'喝点水，也起来活动一下吧。我在这里等你。'};
    currentBubble={...event,character:store.config.petCharacter,id:event.id??`manual-${Date.now()}-${Math.random()}`,text:event.text||texts[event.kind]||'我在这里呀。'};
    send(pet,'bubble',currentBubble);send(bubbleWindow,'bubble',currentBubble);return true;
  }
  function manual(kind,text) {
    if(!store.config.onboarded){openSettings();return {shown:false};}
    if(scheduler.flags.fullscreen||scheduler.flags.locked||scheduler.flags.suspended)throw new Error('退出全屏或解锁后，就能和伴伴互动啦');
    if(store.config.hidden)savePatch({hidden:false});
    if(kind==='love'){
      const quote=scheduler.pickQuote();if(!quote)throw new Error('还没有可用情话，去专属内容里写一句吧');
      store.saveRuntime(scheduler.runtime);return {shown:showBubble({kind:'love',text:quote,automatic:false})};
    }
    if(kind==='water'||kind==='stretch')return {shown:showBubble({kind,types:[kind],preview:true,automatic:false})};
    if(kind==='preview')return {shown:showBubble({kind:'love',text:renderText(String(text).slice(0,100),store.config),automatic:false})};
    const reply=pickTouch(store.config,scheduler.runtime);store.saveRuntime(scheduler.runtime);
    return {shown:showBubble({kind:'pet',text:reply,automatic:false})};
  }
  function setFlags(flags) {
    if(momentWindow)closeMoment();
    if(dragStart){sensor?.stdin?.write("cancel-drag\n");finishDrag(true);}
    heartGesture.reset();if(surpriseWindow)closeSurprise();
    scheduler.setFlags(flags);clearBubble();scheduler.tick(Date.now());syncVisibility();broadcast();
  }
  function startSensor() {
    if(process.platform!=='win32'||(TEST&&process.env.BANBAN_TEST_SENSOR!=='1'))return;
    const executable=app.isPackaged?path.join(process.resourcesPath,'FullscreenSensor.exe'):path.join(ROOT,'build','FullscreenSensor.exe');
    sensor=spawn(executable,[String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','ignore']});
    sensor.stdin.on('error',()=>{if(dragStart)finishDrag(true);});
    const current=sensor;sensorBuffer='';
    current.stdout.on('data',chunk=>{
      sensorBuffer+=chunk.toString();const lines=sensorBuffer.split(/\r?\n/);sensorBuffer=lines.pop().slice(-200);
      for(const line of lines){if(line==='H'){triggerHug();continue;}if(line.startsWith('T ')){nativeTestResolve?.(line==='T PASS');nativeTestResolve=null;continue;}if(line.startsWith('D 0 ')){finishDrag(line.endsWith('1'));continue;}if(line==='0'||line==='1'){
        const changed=!fullscreenAvailable;fullscreenAvailable=true;
        if(scheduler.flags.fullscreen!==(line==='1'))setFlags({fullscreen:line==='1'});else if(changed)broadcast();
      }}
    });
    const failed=()=>{
      if(sensor!==current)return;sensor=null;fullscreenAvailable=false;log('FULLSCREEN_SENSOR_UNAVAILABLE');
      if(dragStart)finishDrag(true);
      if(scheduler.flags.fullscreen)setFlags({fullscreen:false});else broadcast();
      if(!quitting&&!restartingSensor){restartingSensor=true;setTimeout(()=>{restartingSensor=false;if(!quitting)startSensor();},30000).unref();}
    };
    current.on('error',failed);current.on('exit',failed);
  }
  function handler(name, fn) {
    ipcMain.handle(name,async(event,...args)=>{
      if(event.sender===momentWindow?.webContents&&!['moment-ready','moment-action'].includes(name))return {ok:false,error:'操作无效'};
      if(['moment-ready','moment-action'].includes(name)&&event.sender!==momentWindow?.webContents)return {ok:false,error:'窗口无效'};
      if(![pet?.webContents,settings?.webContents,bubbleWindow?.webContents,momentWindow?.webContents].includes(event.sender))return {ok:false,error:'窗口无效'};
      if(RECIPIENT&&!['get-state','manual','pause','reset-position','quit','menu','bubble-action','open-moment','moment-ready','moment-action','test-control'].includes(name))return{ok:false,error:'你的伴伴已经准备好啦，直接陪伴你就好。'};
      try{return {ok:true,value:await fn(...args)};}catch(error){log(`ACTION_FAILED_${name}`);return {ok:false,error:error.message||'操作没有完成，请重试'};}
    });
  }
  function setupIPC() {
    handler('get-state',()=>snapshot());
    handler('open-moment',kind=>startMoment(kind));
    handler('preview-moment',kind=>startMoment(kind,true));
    handler('moment-ready',stage=>{
      if(stage==='data')return momentData();
      if(stage==='painted'&&!momentSession.painted){
        momentSession.painted=true;clearTimeout(momentTimer);momentTimer=null;
        try{momentEscape=globalShortcut.register('Escape',closeMoment);}catch{momentEscape=false;}
        momentWindow.showInactive();send(pet,'bubble',{kind:'happy'});
        if(momentSession.kind==='hug')momentTimer=setTimeout(closeMoment,9000);
        if(momentSession.kind==='anniversary'&&!momentSession.preview&&momentSession.info?.due){scheduler.runtime.anniversarySeen=[...new Set([...(scheduler.runtime.anniversarySeen||[]),momentSession.info.key])].slice(-32);store.saveRuntime(scheduler.runtime);}
      }
      return true;
    });
    handler('moment-action',action=>{
      const session=momentSession;
      if(action==='dismiss'){closeMoment();return true;}
      if(action==='again'&&session.kind==='hug'){clearTimeout(momentTimer);momentTimer=setTimeout(closeMoment,9000);return true;}
      if(action==='hug'&&session.kind==='umbrella'){setTimeout(()=>startMoment('hug'),0);return true;}
      if(action==='quiet'&&session.kind==='umbrella'){closeMoment();if(session.preview){showBubble({kind:'happy',text:'安静陪伴预览结束。真正选择时，自动提醒会暂停 30 分钟。',automatic:false});return true;}pause(30);showBubble({kind:'happy',text:renderText('{昵称}，好，我会安静陪你 30 分钟。',store.config),automatic:false});return true;}
      if(action==='letter'&&session.kind==='anniversary')return {letter:renderText(session.config.moments.anniversary.letter,session.config)};
      throw Error('这个小惊喜还没有准备好');
    });
    handler('save-settings',patch=>savePatch(patch));
    handler('start',()=>{
      if(!store.config.onboarded){store.saveConfig({...store.config,onboarded:true,hidden:false});scheduler.update(store.config,Date.now());scheduler.tick(Date.now());syncVisibility();
        setTimeout(()=>showBubble({kind:'welcome',text:renderText(store.config.welcome||'你好呀，以后就在这里陪着你。',store.config),automatic:false}),300);}
      else savePatch({hidden:false});
      broadcast();trayMenu();return snapshot();
    });
    handler('manual',(kind,text)=>manual(kind,text));
    handler('pause',value=>pause(value));
    handler('reset-position',()=>{resetPosition();return snapshot();});
    handler('open-settings',()=>openSettings());
    handler('close-settings',()=>settings?.close());
    handler('finish-close-settings',quit=>{settingsClosing=true;if(quit){quitting=true;app.quit();}else settings?.close();});
    handler('quit',()=>requestQuit());
    handler('menu',()=>{heartGesture.reset();return trayMenu()?.popup({window:pet});});
    handler('bubble-action',(id,action)=>{
      if(!currentBubble||currentBubble.id!==id)return;
      const event=currentBubble;clearBubble();
      if(action==='snooze'&&!event.preview&&!event.snoozed)scheduler.snooze(event,Date.now());
      if(action==='done')showBubble({kind:'happy',text:'好耶，照顾好自己。给你一颗小小的心。',automatic:false});
      broadcast();
    });
    handler('export-gift',async()=>{
      const result=await dialog.showSaveDialog(settings,{title:'保存这份小小的心意',defaultPath:'给你的伴伴.banban.json',filters:[{name:'伴伴礼物包',extensions:['json']}]});
      if(result.canceled)return {canceled:true};
      fs.writeFileSync(result.filePath,JSON.stringify(exportGift(store.config),null,2),'utf8');return {path:result.filePath};
    });
    handler('export-companion',async()=>{
      if(exporting)throw new Error('上一份桌宠还在准备中，请稍等。');
      if(!app.isPackaged)throw new Error('请在已安装的伴伴中制作她的桌宠。');
      const result=await dialog.showSaveDialog(settings,{title:'制作她直接打开就能用的桌宠',defaultPath:'送给你的伴伴.exe',filters:[{name:'伴伴桌宠',extensions:['exe']}]});if(result.canceled)return{canceled:true};
      const manifest=createCompanion(store.config);exporting=true;broadcast();
      try{lastExport=await makeCompanion({runtimeDirectory:path.dirname(process.execPath),launcherPath:path.join(process.resourcesPath,store.config.petCharacter==='dog'?'BanbanGiftLauncher-dog.exe':'BanbanGiftLauncher.exe'),manifest,destination:result.filePath,tempDirectory:path.join(app.getPath('temp'),'BanbanExports'),onProgress:message=>send(settings,'gift-progress',message)});return lastExport;}
      finally{exporting=false;broadcast();}
    });
    handler('reveal-companion',()=>{if(lastExport?.path)shell.showItemInFolder(lastExport.path);});
    handler('read-gift',async()=>{
      const result=await dialog.showOpenDialog(settings,{title:'打开伴伴礼物包',properties:['openFile'],filters:[{name:'伴伴礼物包',extensions:['json']}]});
      if(result.canceled)return {canceled:true};
      if(fs.statSync(result.filePaths[0]).size>512000)throw new Error('礼物包过大，请选择小于 500 KB 的文件');
      let value;try{value=JSON.parse(fs.readFileSync(result.filePaths[0],'utf8').replace(/^\uFEFF/,''));}catch{throw new Error('无法读取礼物包，请检查 JSON 文件是否完整');}
      pendingGift=validateGift(value);return {gift:pendingGift};
    });
    handler('apply-gift',()=>{
      if(!pendingGift)throw new Error('请先选择礼物包');const gift=pendingGift;pendingGift=null;
      return savePatch({nickname:gift.nickname,sender:gift.sender,welcome:gift.welcome,quotes:[...store.config.quotes.filter(q=>q.builtin),...gift.quotes]});
    });
    handler('reset-settings',async()=>{
      const {response}=await dialog.showMessageBox(settings,{type:'question',title:'恢复默认设置',message:'恢复提醒时段、桌宠外观和安静设置？',detail:'专属称呼、欢迎语和情话会保留。',buttons:['取消','恢复默认'],defaultId:0,cancelId:0});
      if(response!==1)return {canceled:true};
      const d=defaults();const keys=['petCharacter','petSize','alwaysOnTop','hidden','startAtLogin','water','stretch','windows','loveEnabled','useBuiltIn','pauseUntil'];
      return {state:savePatch(Object.fromEntries(keys.map(k=>[k,d[k]])))};
    });
    handler('clear-private',async()=>{
      const {response}=await dialog.showMessageBox(settings,{type:'warning',title:'清除专属内容',message:'清除称呼、欢迎语和所有自定义情话？',detail:'此操作无法撤销。已经导出的礼物包不受影响。',buttons:['取消','清除'],defaultId:0,cancelId:0});
      if(response!==1)return {canceled:true};
      closeMoment();clearBubble();const state=savePatch({nickname:'',sender:'',welcome:defaults().welcome,quotes:defaults().quotes,moments:defaults().moments});
      scheduler.runtime=defaultRuntime();store.saveRuntime(scheduler.runtime);store.clearPrivateBackups();return {state};
    });
    ipcMain.on('pointer',(event,interactive)=>{const win=event.sender===pet?.webContents?pet:event.sender===bubbleWindow?.webContents?bubbleWindow:event.sender===surpriseWindow?.webContents?surpriseWindow:event.sender===momentWindow?.webContents?momentWindow:null;if(win&&!win.isDestroyed()&&!(win===pet&&dragStart))win.setIgnoreMouseEvents(!interactive,{forward:true});});
    ipcMain.on('gaze-tracking',(event,enabled)=>{if(event.sender!==pet?.webContents)return;gazeRequested=enabled===true;syncGazeTracking();});
    ipcMain.on('surprise',(event,action)=>{
      if(!surpriseWindow||event.sender!==surpriseWindow.webContents)return;
      if(action==='ready'&&surprisePayload){
        clearTimeout(surpriseTimer);
        try{surpriseEscape=globalShortcut.register('Escape',closeSurprise);}catch{surpriseEscape=false;}
        send(surpriseWindow,'surprise',{...surprisePayload,escapeAvailable:surpriseEscape});surprisePayload=null;
        surpriseWindow.showInactive();send(pet,'bubble',{kind:'love'});surpriseTimer=setTimeout(closeSurprise,11500);
      }else if(action==='ended'||action==='dismiss')closeSurprise();
    });
    ipcMain.on('bubble-size',(event,value)=>{if(event.sender!==bubbleWindow?.webContents||!currentBubble||value?.id!==currentBubble.id)return;if(Number.isFinite(value.width)&&Number.isFinite(value.height)){bubbleSize={width:Math.max(200,Math.min(400,value.width)),height:Math.max(60,Math.min(500,value.height))};positionCurrentBubble();}});
    ipcMain.on('drag',(event,action)=>{
      if(event.sender!==pet?.webContents||!action||pet.isDestroyed())return;
      if(action==='start')beginDrag();
      else if(action==='end'&&dragStart&&!dragStart.native)finishDrag(dragStart.moved);
      else if(action==='cancel'&&dragStart){if(dragStart.native)sensor.stdin.write('cancel-drag\n');finishDrag(true);}
    });
    if(TEST)handler('test-control',async({action,value})=>{
      if(action==='flags'){setFlags(value);return snapshot();}
      if(action==='due'){scheduler.tick(Date.now());scheduler.lastAutomatic=0;scheduler.next[value]={due:Date.now()-1,snoozed:false};return snapshot();}
      if(action==='metrics')return {metrics:app.getAppMetrics(),bounds:pet.getBounds(),visible:pet.isVisible(),focused:pet.isFocused(),bubble:currentBubble,bubbleBounds:bubbleWindow?.getBounds(),bubbleVisible:bubbleWindow?.isVisible(),sensorPid:sensor?.pid,dragging:Boolean(dragStart),heartTaps:heartGesture.taps.length,moment:momentSession?{kind:momentSession.kind,visible:momentWindow.isVisible()}:null,surprise:surpriseWindow?{bounds:surpriseWindow.getBounds(),visible:surpriseWindow.isVisible(),focused:surpriseWindow.isFocused(),escape:surpriseEscape}:null};
      if(action==='finish-test-drag'){finishDrag(true);return true;}
      if(action==='reset-heart-gesture'){heartGesture.cooldownUntil=0;heartGesture.reset();return true;}
      if(action==='position'){const pos=clampPosition(value);pet.setPosition(pos.x,pos.y);positionCurrentBubble();return pet.getBounds();}
      if(action==='menu-labels')return trayMenu().items.map(item=>item.label);
      if(action==='native-drag-test'){if(!sensor?.stdin?.writable)throw new Error('Native bridge unavailable');return new Promise(resolve=>{const timeout=setTimeout(()=>{nativeTestResolve=null;resolve(false);},5000);nativeTestResolve=value=>{clearTimeout(timeout);resolve(value);};const handle=pet.getNativeWindowHandle();sensor.stdin.write(`test-path ${handle.readBigUInt64LE()}\n`);});}
      if(action==='corrupt-gift'){pendingGift=validateGift(value);return pendingGift;}
      if(action==='tick'){const event=scheduler.tick(value||Date.now(),Boolean(currentBubble||surpriseWindow||momentWindow));if(event){showBubble(event);store.saveRuntime(scheduler.runtime);}broadcast();return snapshot();}
    });
  }
  app.on('second-instance',()=>{if(store){if(RECIPIENT)savePatch({hidden:false});else openSettings();}});
  app.on('window-all-closed',()=>{});
  app.on('before-quit',()=>{quitting=true;syncGazeTracking();closeMoment();closeSurprise();clearInterval(interval);clearInterval(dragTimer);clearTimeout(positionTimer);if(sensor){sensor.kill();sensor=null;}tray?.destroy();});
  app.whenReady().then(()=>{
    Menu.setApplicationMenu(null);
    session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*','ws://*/*','wss://*/*']},(_details,callback)=>callback({cancel:true}));
    if(bootstrapError)throw bootstrapError;
    const directory=app.getPath('userData');firstCompanion=RECIPIENT&&!fs.existsSync(path.join(directory,'companion-seeded'));
    store=new Store(directory);if(firstCompanion){store.saveConfig(companionConfig(companion));fs.writeFileSync(path.join(directory,'companion-seeded'),companion.id,'utf8');}
    if(store.config.position&&store.config.positionVersion!==2){const size=petWindowSize(store.config.petSize);store.saveConfig({...store.config,position:{x:store.config.position.x+(352-size)/2,y:store.config.position.y+440-size-5},positionVersion:2});}
    scheduler=new Scheduler(store.config,store.runtime);
    createPet();createBubbleWindow();setupIPC();
    tray=new Tray(nativeImage.createFromPath(iconPath()).resize({width:32,height:32}));tray.setToolTip('伴伴 · 陪你生活的小伙伴');trayMenu();
    tray.on('double-click',userAction(()=>{if(!store.config.onboarded)openSettings();else{savePatch({hidden:false});resetPosition();}}));
    for(const [event,flags] of [['lock-screen',{locked:true}],['unlock-screen',{locked:false}],['suspend',{suspended:true}],['resume',{suspended:false}]])powerMonitor.on(event,()=>setFlags(flags));
    for(const event of ['display-added','display-removed','display-metrics-changed'])screen.on(event,()=>{
      if(momentWindow)closeMoment();heartGesture.reset();if(surpriseWindow)closeSurprise();
      if(!pet||pet.isDestroyed())return;const [x,y]=pet.getPosition();const pos=clampPosition({x,y});pet.setPosition(pos.x,pos.y);
      if(settings&&!settings.isDestroyed()){const b=settings.getBounds(),d=screen.getDisplayMatching(b);if(b.x<d.workArea.x||b.x+b.width>d.workArea.x+d.workArea.width||b.y<d.workArea.y||b.y+b.height>d.workArea.y+d.workArea.height)settings.center();}
    });
    startSensor();scheduler.tick(Date.now());
    interval=setInterval(()=>{
      try{
        const now=Date.now(),offset=now-performance.now();if(Math.abs(offset-lastClockOffset)>5000){scheduler.active=false;scheduler.next={};scheduler.lastAutomatic=0;clearBubble();}lastClockOffset=offset;
        const previousReason=scheduler.reason(now-1000);const reason=scheduler.reason(now);
        if(reason&&currentBubble?.automatic)clearBubble();
        if(previousReason!==reason){trayMenu();broadcast();}
        const event=scheduler.tick(now,Boolean(currentBubble||surpriseWindow||momentWindow));if(event){showBubble(event);store.saveRuntime(scheduler.runtime);broadcast();}
        if(settings&&!settings.isDestroyed())send(settings,'status',scheduler.status(now));
      }catch{log('TICK_FAILED');}
    },1000);
    if(!RECIPIENT&&(!store.config.onboarded||process.argv.includes('--settings')))openSettings();
  }).catch(()=>{dialog.showErrorBox('伴伴没有启动成功','无法读取或保存应用数据。请确认当前账户可以访问应用数据目录后重试。');app.quit();});
}
