const {_electron:electron}=require('playwright');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const {execFileSync}=require('node:child_process');
const root=path.join(__dirname,'..'),out=path.join(root,'test-results');
const executable=path.join(process.env.LOCALAPPDATA,'Programs','Banban','伴伴.exe');
const env={...process.env,BANBAN_TEST:'1',BANBAN_TEST_SENSOR:'1',BANBAN_TEST_DATA:path.join(out,`installed-profile-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const result={date:new Date().toISOString(),executable,checks:[]};let app;
(async()=>{try{
 const started=performance.now();app=await electron.launch({executablePath:executable,args:['--settings'],env});let settings;
 for(let n=0;n<100;n++){settings=app.windows().find(w=>w.url().endsWith('settings.html'));if(settings)break;await sleep(100);}await settings.waitForSelector('[data-action="start"]');
 result.startupSeconds=+((performance.now()-started)/1000).toFixed(2);
 const call=(name,...args)=>settings.evaluate(({name,args})=>window.banban.call(name,...args),{name,args});
 assert.equal((await call('get-state')).packaged,true);result.checks.push('Installed production executable starts and loads local assets');
 await settings.screenshot({path:path.join(out,'installed-welcome.png')});
 await settings.locator('[data-action="start"]').click();const pet=app.windows().find(w=>w.url().endsWith('pet.html'));const bubble=app.windows().find(w=>w.url().endsWith('bubble.html'));await bubble.waitForSelector('#bubble:not([hidden])');await bubble.locator('#dismiss').click();
 const giftPath=path.join(out,'gift-roundtrip.banban.json');
 await app.evaluate(({dialog},filePath)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath});},giftPath);
 await call('save-settings',{nickname:'测试昵称',sender:'测试署名',quotes:[{id:'personal-test',text:'{昵称}，想念有一个很具体的方向。',enabled:true,builtin:false}]});
 await call('export-gift');const gift=JSON.parse(fs.readFileSync(giftPath,'utf8'));assert.equal(gift.nickname,'测试昵称');assert.equal(gift.quotes.length,1);assert.equal('windows'in gift,false);
 await app.evaluate(({dialog},filePath)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[filePath]});},giftPath);
 await call('save-settings',{nickname:'临时昵称'});const preview=await call('read-gift');assert.equal(preview.gift.nickname,'测试昵称');await call('apply-gift');assert.equal((await call('get-state')).config.nickname,'测试昵称');result.checks.push('Gift file export, preview and import round trip succeeds');
 fs.writeFileSync(giftPath,'{"version":99}');await assert.rejects(()=>call('read-gift'));assert.equal((await call('get-state')).config.nickname,'测试昵称');result.checks.push('Malformed gift files preserve existing settings');
 await app.evaluate(({dialog})=>{dialog.showMessageBox=async()=>({response:1});});await call('clear-private');const s=await call('get-state');assert.equal(s.config.nickname,'');assert.equal(s.config.sender,'');
 for(const name of ['settings.json','settings.json.bak'])assert.ok(!fs.readFileSync(path.join(env.BANBAN_TEST_DATA,name),'utf8').includes('测试昵称'));result.checks.push('Clear personal content also removes private text from backup');
 for(let n=0;n<80;n++){if((await call('get-state')).fullscreenAvailable)break;await sleep(150);}assert.equal((await call('get-state')).fullscreenAvailable,true);result.checks.push('Packaged native fullscreen sensor runs successfully');
 const before=await call('test-control',{action:'metrics'});await call('close-settings');await sleep(20000);
 const metrics=await app.evaluate(({app})=>app.getAppMetrics());result.privateMB=+(metrics.reduce((sum,m)=>sum+m.memory.privateBytes,0)/1024).toFixed(1);
 if(before.sensorPid){const ps=path.join(process.env.SystemRoot,'System32','WindowsPowerShell','v1.0','powershell.exe');const command=`Get-Process -Id ${Number(before.sensorPid)} | Select-Object PrivateMemorySize64,WorkingSet64 | ConvertTo-Json -Compress`;result.sensor=JSON.parse(execFileSync(ps,['-NoLogo','-NoProfile','-NonInteractive','-Command',command],{encoding:'utf8',windowsHide:true}));}
 result.passed=true;console.log(JSON.stringify(result,null,2));
}catch(error){result.passed=false;result.failure=error.stack;console.error(error);process.exitCode=1;}finally{if(app)await app.close().catch(()=>{});fs.writeFileSync(path.join(out,'installed-report.json'),JSON.stringify(result,null,2));}})();
