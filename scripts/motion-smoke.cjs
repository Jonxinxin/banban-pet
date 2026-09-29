const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const env={...process.env,BANBAN_TEST:'1',BANBAN_TEST_DATA:path.join(out,`motion-${Date.now()}`)};
delete env.ELECTRON_RUN_AS_NODE;delete env.BANBAN_TEST_SENSOR;delete env.BANBAN_GIFT_MANIFEST;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));const report={date:new Date().toISOString(),checks:[]},errors=[];
let app,settings,pet;
async function until(fn){for(let i=0;i<160;i++){if(await fn())return;await sleep(50);}throw Error('Timed out');}
const call=(name,...args)=>settings.evaluate(({name,args})=>window.banban.call(name,...args),{name,args});
const eyes=()=>pet.locator('.cat-pupils').evaluate(el=>{const m=el.transform.baseVal.consolidate().matrix;return {x:m.e,y:m.f};});
async function cursor(x,y){
  await app.evaluate(({BrowserWindow},p)=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html')),b=w.getBounds();global.motionCursor={x:b.x+p.x,y:b.y+p.y};},{x,y});
}
(async()=>{try{
  const launch={env,args:[root,'--settings']};if(process.argv.includes('--packaged')){launch.executablePath=path.join(process.env.BANBAN_PACKAGED_DIR||path.join(root,'release','win-unpacked'),'伴伴.exe');launch.args=['--settings'];}
  app=await electron.launch(launch);app.on('window',p=>p.on('pageerror',e=>errors.push(e.message)));
  await until(()=>Boolean(settings=app.windows().find(p=>p.url().endsWith('settings.html'))));await settings.waitForSelector('[data-action="start"]');
  await call('start');pet=app.windows().find(p=>p.url().endsWith('pet.html'));await pet.waitForSelector('.cat-pupils');
  await pet.emulateMedia({reducedMotion:'no-preference'});await sleep(400);await call('pause',30);
  // Replace only the OS sampling source; exercise the real main-process timer and IPC.
  await app.evaluate(({screen})=>{global.motionCursor=screen.getCursorScreenPoint();screen.getCursorScreenPoint=()=>global.motionCursor;});
  for(const character of ['cat','dog'])for(const size of ['small','medium','large']){
    await call('save-settings',{petCharacter:character,petSize:size});await pet.waitForSelector(`#cat-art[data-character="${character}"] .cat-pupils`);
    await pet.evaluate(()=>motion.cancelIdle());
    await cursor(-1500,-1000);await sleep(450);let p=await eyes();assert.ok(p.x<-2&&p.y<-1,`${character}/${size}: upper left gaze`);
    await cursor(2000,1600);await sleep(450);p=await eyes();assert.ok(p.x>2&&p.y>1,`${character}/${size}: lower right gaze`);
    assert.ok((p.x/5.2)**2+(p.y/3.6)**2<1.002);
    await pet.evaluate(()=>{document.querySelector('#cat-art').dataset.blink='single';});
    await sleep(90);assert.ok(await pet.locator('.cat-eyes').evaluate(el=>new DOMMatrix(getComputedStyle(el).transform).d<.6));
    const blink=await eyes();assert.ok(Math.abs(blink.x-p.x)<.15&&Math.abs(blink.y-p.y)<.15);await pet.evaluate(()=>delete document.querySelector('#cat-art').dataset.blink);
  }
  report.checks.push('Both pets at all three sizes follow screen-wide cursor positions, stay bounded and keep gaze while blinking');
  // A complete real-time transition should have intermediate frames and settle without jitter.
  await cursor(-1500,0);await sleep(500);
  await pet.evaluate(()=>{window.eyeFrames=[];window.recordEyes=true;function sample(){if(!window.recordEyes)return;const m=document.querySelector('.cat-pupils').transform.baseVal.consolidate().matrix;window.eyeFrames.push(m.e);requestAnimationFrame(sample);}requestAnimationFrame(sample);});
  await cursor(2000,0);await sleep(650);
  const frames=await pet.evaluate(()=>{window.recordEyes=false;return window.eyeFrames;});
  assert.ok(frames.length>=12);assert.ok(frames.some(x=>x>-3&&x<3));assert.ok(frames.at(-1)>4);assert.ok(Math.max(...frames.slice(1).map((x,i)=>Math.abs(x-frames[i])))<3);
  report.checks.push('Cursor reversal is interpolated across animation frames and settles smoothly');
  // Continuous pointer movement should hold attention instead of starting an unrelated idle gesture.
  await pet.evaluate(()=>{motion.cancelIdle();motion.scheduleAction(true);window.attentionActions=[];window.attentionObserver=new MutationObserver(()=>{const action=document.querySelector('#cat-art').dataset.action;if(action)window.attentionActions.push(action);});window.attentionObserver.observe(document.querySelector('#cat-art'),{attributes:true,attributeFilter:['data-action']});});
  for(let i=0;i<24;i++){await cursor(350+Math.sin(i/3)*300,100+Math.cos(i/3)*220);await sleep(200);}
  assert.deepEqual(await pet.evaluate(()=>{window.attentionObserver.disconnect();return window.attentionActions;}),[]);
  const center=await pet.evaluate(()=>{const p=new DOMPoint(120,motion.eyeY).matrixTransform(document.querySelector('#cat-art svg').getScreenCTM());return {x:p.x,y:p.y};});
  await cursor(center.x,center.y);await sleep(800);assert.ok(await pet.evaluate(()=>motion.pose.scale>1.015));
  report.checks.push('Eyes lead head and body tracking; nearby cursor gets a subtle lean-in; continuous movement postpones idle gestures');
  const actionTargets={tilt:'.cat-head',wave:'.cat-paw-left',stretch:'.cat-rig',tail:'.cat-tail'};
  for(const character of ['cat','dog']){
    await call('save-settings',{petCharacter:character,petSize:'large'});await pet.waitForSelector(`#cat-art[data-character="${character}"] .cat-pupils`);
    await pet.evaluate(()=>motion.cancelIdle());await cursor(-1000,-400);await sleep(450);
    await pet.screenshot({path:path.join(out,`v1.5-${character}-gaze.png`),omitBackground:true});
    for(const [action,selector] of Object.entries(actionTargets)){
      await pet.evaluate(action=>{document.querySelector('#cat-art').dataset.action=action;},action);
      await sleep(40);
      const count=await pet.locator(selector).evaluate(el=>el.getAnimations().length);assert.ok(count>0,`${character}/${action}: animation attached`);
      await pet.evaluate(()=>{for(const a of document.querySelector('#cat-art').getAnimations({subtree:true})){a.pause();a.currentTime=1050;}});
      assert.notEqual(await pet.locator(selector).evaluate(el=>getComputedStyle(el).transform),'none');
      const clipped=await pet.evaluate(()=>[...document.querySelectorAll('.cat-rig path,.cat-rig ellipse')].filter(el=>getComputedStyle(el).visibility!=='hidden').some(el=>{const r=el.getBoundingClientRect();return r.left<-1||r.top<-1||r.right>innerWidth+1||r.bottom>innerHeight+1;}));
      assert.equal(clipped,false,`${character}/${action}: stays inside pet window`);
      await pet.screenshot({path:path.join(out,`v1.5-${character}-${action}.png`),omitBackground:true});
      await pet.evaluate(()=>{delete document.querySelector('#cat-art').dataset.action;for(const a of document.querySelector('#cat-art').getAnimations({subtree:true}))a.play();});
    }
  }
  report.checks.push('Tilt, paw wave, stretch and tail animations render for both pets without clipping');
  await pet.evaluate(()=>motion.refresh());await pet.waitForSelector('#cat-art[data-action]',{timeout:6000});
  await call('manual','stretch');await until(async()=>await pet.locator('#cat-art').getAttribute('data-mood')==='stretch');
  assert.equal(await pet.locator('#cat-art').getAttribute('data-action'),null);assert.equal(await pet.locator('.cat-rig').evaluate(el=>getComputedStyle(el).animationName),'stretch');
  await call('manual','pet');await sleep(350);assert.equal(await pet.locator('.cat-happy-eyes').evaluate(el=>getComputedStyle(el).visibility),'visible');
  await sleep(1400);assert.equal(await pet.locator('.cat-eyes').evaluate(el=>getComputedStyle(el).opacity),'1');
  await cursor(2000,1200);await sleep(450);assert.ok((await eyes()).x>2);
  assert.equal((await call('test-control',{action:'metrics'})).bubble.kind,'pet');
  await call('pause',30);await pet.locator('.cat-head').hover({force:true});await pet.mouse.down();await sleep(120);
  assert.equal(await pet.locator('#cat-art').getAttribute('data-busy'),'true');assert.equal(await pet.locator('#cat-art').getAttribute('data-action'),null);
  await call('test-control',{action:'finish-test-drag'});await pet.mouse.up();
  report.checks.push('Idle actions start automatically and yield to reminders, touch and dragging');
  await pet.evaluate(()=>{window.gazeCount=0;window.banban.on('gaze',()=>window.gazeCount++);});
  await call('save-settings',{hidden:true});await sleep(100);const hiddenCount=await pet.evaluate(()=>window.gazeCount);
  await cursor(500,600);await sleep(180);assert.equal(await pet.evaluate(()=>window.gazeCount),hiddenCount);
  assert.equal(await pet.evaluate(()=>motion.frame),0);
  await call('save-settings',{hidden:false});await cursor(1800,-500);await sleep(450);assert.ok((await eyes()).x>2);
  await pet.emulateMedia({reducedMotion:'reduce'});await sleep(100);assert.deepEqual(await eyes(),{x:0,y:0});assert.equal(await pet.locator('#cat-art').getAttribute('data-action'),null);
  const reducedCount=await pet.evaluate(()=>window.gazeCount);await cursor(-800,300);await sleep(180);assert.equal(await pet.evaluate(()=>window.gazeCount),reducedCount);
  assert.equal(await pet.locator('.cat-rig').evaluate(el=>getComputedStyle(el).animationName),'none');
  report.checks.push('Hidden pets and reduced-motion preference stop polling and animation; showing resumes tracking');
  assert.deepEqual(errors,[]);report.passed=true;console.log(JSON.stringify(report,null,2));
}catch(error){report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{if(app)await app.close().catch(()=>{});report.errors=errors;fs.writeFileSync(path.join(out,'motion-report.json'),JSON.stringify(report,null,2));}})();
