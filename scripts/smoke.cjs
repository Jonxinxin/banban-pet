const {_electron:electron}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..'),out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const testData=path.join(out,`profile-${Date.now()}`);const errors=[],results=[];
const env={...process.env,BANBAN_TEST:'1',BANBAN_TEST_DATA:testData};delete env.ELECTRON_RUN_AS_NODE;
async function check(name,fn){await fn();results.push({name,passed:true});console.log('PASS',name);}
(async()=>{
 let app;
 try{
  app=await electron.launch({args:[root],env,timeout:30000});
  app.on('window',window=>{window.on('pageerror',error=>errors.push(error.message));});
  let settings;
  for(let i=0;i<100;i++){settings=app.windows().find(w=>w.url().endsWith('settings.html'));if(settings)break;await new Promise(r=>setTimeout(r,100));}
  assert.ok(settings,'Settings window exists');await settings.waitForSelector('[data-action="start"]');
  const pet=app.windows().find(w=>w.url().endsWith('pet.html'));const bubble=app.windows().find(w=>w.url().endsWith('bubble.html'));assert.ok(pet);
  const call=(name,...args)=>settings.evaluate(({name,args})=>window.banban.call(name,...args),{name,args});
  await check('first run: welcome, original cat artwork and no automatic reminder',async()=>{
    assert.equal(await settings.locator('.hero-cat svg').count(),1);const s=await call('get-state');assert.equal(s.config.onboarded,false);assert.equal(s.status.reason,'还未开始陪伴');await settings.screenshot({path:path.join(out,'01-welcome.png')});
  });
  await check('onboarding starts the transparent pet without taking focus',async()=>{
    await settings.locator('[data-action="start"]').click();await bubble.waitForSelector('#bubble:not([hidden])');const m=await call('test-control',{action:'metrics'});assert.equal(m.visible,true);assert.equal(m.focused,false);await pet.screenshot({path:path.join(out,'02-pet.png'),omitBackground:true});await bubble.locator('#dismiss').click();
  });
  await check('personal fields autosave; quote editor saves plain text safely',async()=>{
    await settings.locator('nav [data-page="love"]').click();await settings.locator('#nickname').fill('小朋友');await settings.locator('#sender').fill('你的大朋友');await settings.locator('[data-action="new-quote"]').first().click();
    await settings.locator('#quote-editor').fill('{昵称}，今天也很想你。<script>bad()</script>');await settings.locator('[data-action="save-quote"]').click();await settings.waitForSelector('.quote-card');
    const s=await call('get-state');assert.equal(s.config.nickname,'小朋友');assert.equal(s.config.sender,'你的大朋友');assert.equal(s.config.quotes.filter(q=>!q.builtin).length,1);assert.ok(await settings.locator('.quote-content p').innerText().then(t=>t.includes('<script>')));
    await settings.screenshot({path:path.join(out,'03-personal.png')});
  });
  await check('manual love and all health reminder previews work',async()=>{
    await call('manual','love');await bubble.waitForSelector('#bubble:not([hidden])');assert.ok((await bubble.locator('#message').innerText()).length>0);await bubble.locator('#dismiss').click();
    for(const kind of ['water','stretch']){await call('manual',kind);await bubble.waitForSelector('#actions button');assert.equal(await bubble.locator('#actions button').count(),2);await bubble.locator('#actions button').first().click();await bubble.waitForSelector('#message');assert.ok((await bubble.locator('#message').innerText()).includes('好耶'));await bubble.locator('#dismiss').click();}
  });
  await check('actual scheduled reminder fires and snooze replaces its cycle',async()=>{
    await call('save-settings',{windows:[{start:'00:00',end:'23:59',enabled:true},{start:'00:00',end:'01:00',enabled:false}]});
    await call('test-control',{action:'due',value:'water'});await call('test-control',{action:'tick'});await bubble.waitForSelector('#actions button');assert.equal(await bubble.locator('#actions button').count(),3);
    await bubble.locator('#actions button').nth(1).click();const s=await call('get-state');assert.equal(s.status.next.water.snoozed,true);assert.ok(Math.abs(s.status.next.water.due-Date.now()-600000)<2000);
  });
  await check('focus, fullscreen, lock and pause restore without catch-up',async()=>{
    await call('test-control',{action:'flags',value:{fullscreen:true}});assert.equal((await call('test-control',{action:'metrics'})).visible,false);
    await call('test-control',{action:'flags',value:{fullscreen:false}});assert.equal((await call('test-control',{action:'metrics'})).visible,true);
    let s=await call('get-state');if(s.status.next.water){assert.equal(s.status.next.water.snoozed,false);assert.ok(s.status.next.water.due-Date.now()>3590000);}else{const {activeWindow,dateKey}=require('../src/core/scheduler.cjs'),now=Date.now(),due=now+3600000;assert.ok(dateKey(now)!==dateKey(due)||activeWindow(s.config,now)!==activeWindow(s.config,due),'Next reminder can be absent only when its full interval leaves today’s window');}
    await call('test-control',{action:'flags',value:{locked:true}});assert.equal((await call('test-control',{action:'metrics'})).visible,false);await call('test-control',{action:'flags',value:{locked:false}});
    await settings.locator('nav [data-page="reminders"]').click();await settings.locator('[data-action="pause"][data-value="30"]').click();assert.equal((await call('get-state')).status.reason,'提醒已暂停');
    await settings.screenshot({path:path.join(out,'04-reminders.png')});await settings.locator('[data-action="resume"]').click();assert.equal((await call('get-state')).status.reason,null);
  });
  await check('valid gift imports replace personal content without changing reminders',async()=>{
    const gift={format:'banban-gift',version:1,nickname:'礼物昵称',sender:'礼物署名',welcome:'很高兴遇见你。',quotes:[{text:'一起慢慢生活吧。',enabled:true}]};
    await call('test-control',{action:'corrupt-gift',value:gift});const s=await call('apply-gift');assert.equal(s.config.nickname,'礼物昵称');assert.equal(s.config.water.minutes,60);assert.equal(s.config.quotes.filter(q=>!q.builtin).length,1);
  });
  await check('desktop size, hide/show and offscreen recovery work',async()=>{
    await settings.locator('nav [data-page="appearance"]').click();await settings.locator('[data-action="size"][data-value="large"]').click();assert.equal((await call('get-state')).config.petSize,'large');
    await settings.locator('[data-setting="hidden"]').check();assert.equal((await call('test-control',{action:'metrics'})).visible,false);await settings.locator('[data-action="reset-position"]').click();assert.equal((await call('test-control',{action:'metrics'})).visible,true);
    await settings.screenshot({path:path.join(out,'05-appearance.png')});
    for(const scale of [1,1.25,1.5,2]){await app.evaluate(({BrowserWindow},factor)=>{const w=BrowserWindow.getAllWindows().find(w=>w.getTitle().includes('陪伴设置'));w.webContents.setZoomFactor(factor);},scale);assert.ok(await settings.locator('h1').isVisible());}
    await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.getTitle().includes('陪伴设置'));w.webContents.setZoomFactor(1);});
  });
  await check('dog selection switches live; touch responses use nickname without scrolling or repetition',async()=>{
    await settings.locator('[data-action="character"][data-value="dog"]').click();
    await pet.waitForSelector('svg[data-character="dog"]');
    assert.equal((await call('get-state')).config.petCharacter,'dog');
    await settings.screenshot({path:path.join(out,'v1.2-characters.png')});
    await settings.locator('[data-action="character"][data-value="cat"]').click();
    await pet.waitForSelector('svg:not([data-character="dog"])');
    await settings.locator('[data-action="character"][data-value="dog"]').click();
    await pet.waitForSelector('svg[data-character="dog"]');
    const replies=[];
    for(let i=0;i<16;i++){
      await call('manual','pet');await bubble.waitForSelector('#bubble:not([hidden])');
      const text=await bubble.locator('#message').innerText();assert.ok(!replies.slice(-8).includes(text));replies.push(text);
      assert.ok(!/小猫|喵|呼噜/.test(text));
      assert.equal(await bubble.locator('#bubble-label').innerText(),'摇摇尾巴，贴贴你');
      const layout=await bubble.evaluate(()=>{const b=document.querySelector('#bubble');return {scroll:b.scrollHeight,client:b.clientHeight,overflow:getComputedStyle(b).overflowY};});
      assert.ok(layout.scroll<=layout.client+1);assert.notEqual(layout.overflow,'auto');
    }
    assert.ok(replies.filter(t=>t.includes('礼物昵称')).length>=10);
    assert.equal(await pet.locator('.cat-happy-eyes').evaluate(el=>getComputedStyle(el).visibility),'visible');
    await pet.screenshot({path:path.join(out,'v1.2-dog-touch.png'),omitBackground:true});
    await bubble.screenshot({path:path.join(out,'v1.2-touch-bubble.png'),omitBackground:true});
    for(const kind of ['love','water','stretch']){
      await call('manual',kind);assert.equal(await pet.locator('#cat-art').getAttribute('data-mood'),kind);
      if(kind==='love'||kind==='water')assert.equal(await pet.locator(kind==='love'?'.cat-heart':'.cat-cup').evaluate(el=>getComputedStyle(el).visibility),'visible');
      await pet.screenshot({path:path.join(out,`v1.2-dog-${kind}.png`),omitBackground:true});
    }
    await bubble.locator('#dismiss').click();
    await settings.locator('nav [data-page="delivery"]').click();assert.ok((await settings.locator('#content').innerText()).includes('云朵大白狗'));
  });
  await check('renderer isolation and no outbound requests',async()=>{
    assert.equal(await settings.evaluate(()=>typeof require),'undefined');assert.equal(await settings.evaluate(()=>typeof process),'undefined');
    assert.equal(await settings.evaluate(()=>fetch('https://example.com').then(()=>true).catch(()=>false)),false);
  });
  await check('persistence and pause survive a complete app restart',async()=>{
    await call('pause',60);await app.close();app=await electron.launch({args:[root,'--settings'],env,timeout:30000});
    for(let i=0;i<100;i++){settings=app.windows().find(w=>w.url().endsWith('settings.html'));if(settings)break;await new Promise(r=>setTimeout(r,100));}
    await settings.waitForSelector('h1');const s=await call('get-state');assert.equal(s.config.nickname,'礼物昵称');assert.equal(s.config.petSize,'large');assert.equal(s.status.reason,'提醒已暂停');
    assert.equal(s.config.petCharacter,'dog');await app.windows().find(p=>p.url().endsWith('pet.html')).waitForSelector('svg[data-character="dog"]');
  });
  assert.deepEqual(errors,[]);results.push({name:'No renderer errors',passed:true});
  fs.writeFileSync(path.join(out,'smoke-report.json'),JSON.stringify({date:new Date().toISOString(),results,errors},null,2));
 }catch(error){console.error(error);fs.writeFileSync(path.join(out,'smoke-report.json'),JSON.stringify({date:new Date().toISOString(),results,errors,failure:error.stack},null,2));process.exitCode=1;}
 finally{if(app)await app.close().catch(()=>{});}
})();
