const {_electron:electron}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..'),out=path.join(root,'test-results');const env={...process.env,BANBAN_TEST:'1',BANBAN_TEST_SENSOR:'1',BANBAN_TEST_DATA:path.join(out,`revision-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;delete env.BANBAN_GIFT_MANIFEST;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let app,recipient,launcher;const report={date:new Date().toISOString(),checks:[]};
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await sleep(100);}throw new Error('Timed out waiting for app state');}
(async()=>{try{
 app=await electron.launch({executablePath:path.join(root,'release','win-unpacked','伴伴.exe'),args:['--settings'],env});app.process().stderr.on('data',chunk=>fs.appendFileSync(path.join(out,'revision-stderr.log'),chunk));let settings;await until(async()=>Boolean(settings=app.windows().find(p=>p.url().endsWith('settings.html'))));await settings.waitForSelector('h1');
 const call=(name,...args)=>settings.evaluate(({name,args})=>window.banban.call(name,...args),{name,args});
 await call('start');await call('save-settings',{petCharacter:'dog'});const bubble=app.windows().find(p=>p.url().endsWith('bubble.html'));
 await until(async()=>(await call('get-state')).fullscreenAvailable);
 await call('test-control',{action:'position',value:{x:300,y:300}});
 assert.equal(await call('test-control',{action:'native-drag-test'}),true);report.checks.push('Native physical-coordinate path moves up/down/left/right exactly with no cumulative drift');
 for(const size of ['small','medium','large'])for(const position of [{x:0,y:0},{x:99999,y:99999},{x:300,y:300}]){
  await call('save-settings',{petSize:size});const anchor=await call('test-control',{action:'position',value:position});
  for(const text of ['喝点水吧～','这是一段比较长但应该完整展开而不是滚动显示的消息。'.repeat(3),'字\n'.repeat(45)]){
   await call('manual','preview',text);await bubble.waitForSelector('#bubble:not([hidden])');await sleep(60);
   const layout=await bubble.evaluate(()=>{const element=document.querySelector('#bubble'),message=document.querySelector('#message');return{overflow:getComputedStyle(element).overflowY,scrollHeight:element.scrollHeight,clientHeight:element.clientHeight,bottom:element.getBoundingClientRect().bottom,viewport:innerHeight,text:message.textContent};});
   assert.notEqual(layout.overflow,'auto');assert.ok(layout.scrollHeight<=layout.clientHeight+1);assert.ok(layout.bottom<=layout.viewport+1);
   const metrics=await call('test-control',{action:'metrics'});assert.deepEqual(metrics.bounds,anchor);assert.ok(metrics.bubbleVisible);
  }
 }
 report.checks.push('All pet sizes and top/bottom/middle positions show full bubble pages without scrollbars or anchor movement');
 await bubble.screenshot({path:path.join(out,'v1.2-bubble.png'),omitBackground:true});
 await settings.locator('nav [data-page="delivery"]').click();await settings.screenshot({path:path.join(out,'v1.2-delivery.png')});
 await call('save-settings',{nickname:'小朋友',sender:'大朋友',water:{enabled:true,minutes:45},stretch:{enabled:false,minutes:90},petSize:'small',petCharacter:'dog',useBuiltIn:false,quotes:[{id:'authored-only',text:'{昵称}，今天也在认真喜欢你。',enabled:true,builtin:false}],hidden:true,pauseUntil:Date.now()+600000});
 const output=path.join(out,'送给她-回归测试.exe');await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},output);
 const bundle=await call('export-companion');assert.ok(fs.statSync(bundle.path).size>50000000);report.giftPath=bundle.path;report.giftId=bundle.id;report.checks.push('Creator exports one standalone EXE carrying all authored settings');
 // Validate launch format and extracted child through the same launcher delivered to users.
 const {spawn}=require('node:child_process');const receiverProfile=path.join(out,`receiver-${Date.now()}`);
 launcher=spawn(output,[],{env:{...env,BANBAN_TEST_DATA:receiverProfile},windowsHide:true,stdio:'ignore'});
 await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Gift launcher did not finish')),30000);launcher.once('exit',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Gift launcher exit '+code));});});
 const seed=path.join(receiverProfile,'settings.json');await until(async()=>fs.existsSync(seed));const received=JSON.parse(fs.readFileSync(seed,'utf8'));
 assert.equal(received.petCharacter,'dog');assert.equal(received.nickname,'小朋友');assert.equal(received.water.minutes,45);assert.equal(received.stretch.enabled,false);assert.equal(received.petSize,'small');assert.equal(received.quotes.length,1);assert.equal(received.onboarded,true);assert.equal(received.hidden,false);assert.equal(received.pauseUntil,0);
 report.checks.push('Double-click launcher extracts and starts the pet already configured, clearing sender hidden/pause state');
 // A separate isolated recipient launch permits inspection without touching the running gift.
 const manifest=path.join(process.env.LOCALAPPDATA,'BanbanGifts',bundle.id,'companion.json');
 recipient=await electron.launch({executablePath:path.join(root,'release','win-unpacked','伴伴.exe'),args:['--settings'],env:{...env,BANBAN_GIFT_MANIFEST:manifest,BANBAN_TEST_DATA:receiverProfile+'-inspect'}});
 let pet;await until(async()=>Boolean(pet=recipient.windows().find(p=>p.url().endsWith('pet.html'))));await pet.waitForSelector('svg[data-character="dog"]');
 const rc=(name,...args)=>pet.evaluate(({name,args})=>window.banban.call(name,...args),{name,args});
 assert.equal(recipient.windows().some(p=>p.url().endsWith('settings.html')),false);const labels=await rc('test-control',{action:'menu-labels'});assert.ok(!labels.some(label=>/设置|制作/.test(label)));await assert.rejects(()=>rc('open-settings'));assert.equal((await rc('get-state')).recipient,true);
 await rc('manual','pet');const touch=(await rc('test-control',{action:'metrics'})).bubble;assert.ok(!/小猫|喵|呼噜/.test(touch.text));assert.equal(touch.character,'dog');await pet.screenshot({path:path.join(out,'v1.2-recipient-dog.png'),omitBackground:true});await rc('pause',30);assert.equal((await rc('get-state')).status.reason,'提醒已暂停');report.checks.push('Recipient has no onboarding, settings window or configuration menu, and can still pause/exit');
 report.passed=true;console.log(JSON.stringify(report,null,2));
}catch(error){report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1;}finally{if(launcher&&launcher.exitCode===null)launcher.kill();if(recipient)await recipient.close().catch(()=>{});if(app)await app.close().catch(()=>{});if(report.giftId){const target=path.join(process.env.LOCALAPPDATA,'BanbanGifts',report.giftId);require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith('${target.replaceAll("'","''")}\\') } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`],{windowsHide:true});}fs.writeFileSync(path.join(out,'revision-report.json'),JSON.stringify(report,null,2));}})();
