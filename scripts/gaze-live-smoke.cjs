const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const env={...process.env,BANBAN_TEST:'1',BANBAN_TEST_DATA:path.join(out,`gaze-live-${Date.now()}`)};
delete env.ELECTRON_RUN_AS_NODE;delete env.BANBAN_TEST_SENSOR;delete env.BANBAN_GIFT_MANIFEST;
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),report={date:new Date().toISOString(),checks:[]};let app,settings,pet;
async function until(fn){for(let i=0;i<160;i++){if(await fn())return;await sleep(50);}throw Error('Timed out');}
const call=(name,...args)=>settings.evaluate(({name,args})=>window.banban.call(name,...args),{name,args});
(async()=>{try{
  const launch={env,args:[root,'--settings']};
  if(process.argv.includes('--packaged')){launch.executablePath=path.join(process.env.BANBAN_PACKAGED_DIR||path.join(root,'release','win-unpacked'),'伴伴.exe');launch.args=['--settings'];}
  app=await electron.launch(launch);await until(()=>Boolean(settings=app.windows().find(p=>p.url().endsWith('settings.html'))));await settings.waitForSelector('[data-action="start"]');
  await call('start');pet=app.windows().find(p=>p.url().endsWith('pet.html'));await pet.waitForSelector('.cat-pupils');
  await pet.evaluate(()=>{window.gazeSignals=[];window.banban.on('gaze',p=>window.gazeSignals.push(p));});
  assert.equal(await pet.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),false,'Run this real-system check with Windows animations enabled');
  // Do not mock screen coordinates or media preferences. Move only this test pet.
  const area=await app.evaluate(({screen})=>screen.getPrimaryDisplay().workArea);
  const corners=[{x:area.x,y:area.y},{x:area.x+area.width,y:area.y+area.height}];
  const measured=[];
  for(const character of ['cat','dog']){
    await call('save-settings',{petCharacter:character,petSize:'large'});await pet.waitForSelector(`#cat-art[data-character="${character}"] .cat-pupils`);
    for(const [i,position] of corners.entries()){
      await call('manual',i?'water':'preview','看着你，陪着你。');
      await call('test-control',{action:'position',value:position});await sleep(1100);
      const system=await app.evaluate(({screen,BrowserWindow})=>({cursor:screen.getCursorScreenPoint(),bounds:BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html')).getBounds()}));
      const sample=await pet.evaluate(({cursor,bounds})=>{
        const face=document.querySelector('.cat-look-face'),m=face.getScreenCTM(),point=new DOMPoint(cursor.x-bounds.x,cursor.y-bounds.y).matrixTransform(m.inverse());
        const expected=PetMotion.gazeTarget(point.x-120,point.y-motion.eyeY),actual=document.querySelector('.cat-pupils').transform.baseVal.consolidate().matrix;
        return {expected,actual:{x:actual.e,y:actual.f},headX:motion.pose.headX,headY:motion.pose.headY,lean:motion.pose.lean,aimHeadX:motion.poseTarget.headX,aimLean:motion.poseTarget.lean,received:window.gazeSignals.length,mood:document.querySelector('#cat-art').dataset.mood};
      },system);
      assert.ok(sample.received>0);assert.ok(Math.hypot(sample.expected.x-sample.actual.x,sample.expected.y-sample.actual.y)<.25,JSON.stringify(sample));
      assert.ok(Math.hypot(sample.actual.x,sample.actual.y)>1);assert.ok((await call('test-control',{action:'metrics'})).bubble);
      assert.ok(Math.abs(sample.headX-sample.aimHeadX)<.7,JSON.stringify(sample));assert.ok(Math.abs(sample.lean-sample.aimLean)<.25,JSON.stringify(sample));
      measured.push({character,...sample});await pet.screenshot({path:path.join(out,`v1.5.1-${character}-live-${i}.png`),omitBackground:true});
    }
  }
  report.checks.push('Actual Windows cursor coordinates reach visible pupils for both pets while message and reminder bubbles stay open');
  await call('manual','pet');await sleep(1800);
  assert.equal(await pet.locator('.cat-eyes').evaluate(el=>getComputedStyle(el).opacity),'1');assert.equal((await call('test-control',{action:'metrics'})).bubble.kind,'pet');
  report.checks.push('Touch smile finishes while its note remains open, so the gaze is visible again');
  await call('pause',30);await pet.waitForSelector('#cat-art[data-action]',{timeout:6000});
  const action=await pet.locator('#cat-art').getAttribute('data-action');assert.ok(['tilt','wave','stretch','tail'].includes(action));
  report.checks.push('New idle gestures start under the real Windows animation preference');
  report.version=(await call('get-state')).version;report.measured=measured;report.passed=true;console.log(JSON.stringify(report,null,2));
}catch(error){report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1;}
finally{if(app)await app.close().catch(()=>{});fs.writeFileSync(path.join(out,'gaze-live-report.json'),JSON.stringify(report,null,2));}})();
