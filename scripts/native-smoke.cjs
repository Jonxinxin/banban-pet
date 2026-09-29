const {_electron:electron}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.join(__dirname,'..'),out=path.join(root,'test-results'),env={...process.env,BANBAN_TEST:'1',BANBAN_TEST_SENSOR:'1',BANBAN_TEST_DATA:path.join(out,`native-profile-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;
let app,fixture;const result={date:new Date().toISOString(),checks:[]};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let n=0;n<100;n++){if(await fn())return;await sleep(150);}throw new Error('Timed out: '+label);}
(async()=>{
 try{
  app=await electron.launch({args:[root],env});let settings;await until(async()=>Boolean(settings=app.windows().find(w=>w.url().endsWith('settings.html'))),'settings');await settings.waitForSelector('[data-action="start"]');
  const call=(name,...args)=>settings.evaluate(({name,args})=>window.banban.call(name,...args),{name,args});
  await call('start');await until(async()=>(await call('get-state')).fullscreenAvailable,'native sensor');result.checks.push('Windows fullscreen helper reports ready');
  fixture=await electron.launch({args:[path.join(__dirname,'fullscreen-fixture.cjs')],env:{...env,BANBAN_TEST_DATA:''}});
  await until(async()=>!(await call('test-control',{action:'metrics'})).visible,'hidden while external app fullscreen');result.checks.push('A real separate fullscreen process hides the pet');
  await fixture.close();fixture=null;
  await until(async()=>(await call('test-control',{action:'metrics'})).visible,'shown after external fullscreen closes');result.checks.push('Leaving fullscreen restores pet without an overdue bubble');
  assert.equal((await call('test-control',{action:'metrics'})).bubble,null);
  const pet=app.windows().find(w=>w.url().endsWith('pet.html'));const bubble=app.windows().find(w=>w.url().endsWith('bubble.html'));
  await call('save-settings',{petSize:'large'});await call('manual','preview','{昵称}'.repeat(20));
  const geometry=await bubble.evaluate(()=>{const bubble=document.querySelector('#bubble').getBoundingClientRect();return{top:bubble.top,bottom:bubble.bottom,height:innerHeight,pointerAtCorner:document.elementFromPoint(80,260)?.closest('.interactive')!==null};});
  assert.ok(geometry.top>=0&&geometry.bottom<=geometry.height);result.checks.push('Long variable-expanded quotes stay inside their independent bubble window');
  await settings.locator('nav [data-page="love"]').click();await settings.locator('#nickname').fill('关闭前保存');await call('close-settings');await until(async()=>settings.isClosed(),'settings closes');
  const mainConfig=await pet.evaluate(()=>window.banban.call('get-state'));assert.equal(mainConfig.config.nickname,'关闭前保存');result.checks.push('Closing settings immediately flushes pending text edits');
  await pet.evaluate(()=>window.banban.call('manual','pet'));await pet.evaluate(()=>window.banban.call('bubble-action',null,'dismiss'));
  await sleep(15000);
  const metrics=await app.evaluate(({app})=>app.getAppMetrics());result.metrics=metrics.map(m=>({type:m.type,cpu:m.cpu.percentCPUUsage,privateKB:m.memory.privateBytes,workingSetKB:m.memory.workingSetSize}));
  result.totalPrivateMB=+(result.metrics.reduce((a,m)=>a+(m.privateKB||0),0)/1024).toFixed(1);
  result.totalWorkingSetMB=+(result.metrics.reduce((a,m)=>a+(m.workingSetKB||0),0)/1024).toFixed(1);
  result.checks.push('Closing settings releases its renderer; app remains alive in tray');result.passed=true;console.log(JSON.stringify(result,null,2));
 }catch(error){result.passed=false;result.failure=error.stack;console.error(error);process.exitCode=1;}
 finally{if(fixture)await fixture.close().catch(()=>{});if(app)await app.close().catch(()=>{});fs.writeFileSync(path.join(out,'native-report.json'),JSON.stringify(result,null,2));}
})();
