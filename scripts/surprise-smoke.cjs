const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {createCompanion}=require('../src/core/companion.cjs'),{defaults}=require('../src/core/config.cjs');
const root=path.join(__dirname,'..'),out=path.join(root,'test-results');fs.mkdirSync(out,{recursive:true});
const env={...process.env,BANBAN_TEST:'1',BANBAN_TEST_DATA:path.join(out,`hearts-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;delete env.BANBAN_TEST_SENSOR;delete env.BANBAN_GIFT_MANIFEST;
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),report={date:new Date().toISOString(),checks:[]},errors=[];let app;
async function until(fn){for(let i=0;i<120;i++){if(await fn())return;await sleep(50);}throw Error('Timed out');}
(async()=>{try{
 const launch={env,args:[root,'--settings']};if(process.argv.includes('--packaged')){launch.executablePath=path.join(root,'release','win-unpacked','伴伴.exe');launch.args=['--settings'];}
 app=await electron.launch(launch);app.on('window',page=>page.on('pageerror',e=>errors.push(e.message)));
 let settings;await until(()=>Boolean(settings=app.windows().find(p=>p.url().endsWith('settings.html'))));await settings.waitForSelector('[data-action="start"]');
 const call=(name,...args)=>settings.evaluate(({name,args})=>window.banban.call(name,...args),{name,args});
 await call('save-settings',{nickname:'小朋友',sender:'你的大朋友',petCharacter:'dog'});await call('start');
 const pet=app.windows().find(p=>p.url().endsWith('pet.html'));await pet.waitForSelector('svg');await sleep(350);
 async function tap(){await pet.locator('.cat-head').click({position:{x:50,y:55},force:true});await until(async()=>!(await call('test-control',{action:'metrics'})).dragging);}
 async function burst(){await call('test-control',{action:'reset-heart-gesture'});for(let i=0;i<5;i++)await tap();let window;await until(()=>Boolean(window=app.windows().find(p=>p.url().endsWith('surprise.html'))));await window.waitForSelector('#scene.playing');return window;}
 for(let i=0;i<4;i++)await tap();assert.equal((await call('test-control',{action:'metrics'})).surprise,null);
 await tap();let overlay;await until(()=>Boolean(overlay=app.windows().find(p=>p.url().endsWith('surprise.html'))));await overlay.waitForSelector('#scene.playing');
 assert.equal(await overlay.locator('#nickname').innerText(),'小朋友');assert.ok((await overlay.locator('#signature').innerText()).includes('你的大朋友'));
 const metrics=await call('test-control',{action:'metrics'});assert.equal(metrics.surprise.focused,false);assert.equal(metrics.bubble,null);
 const display=await app.evaluate(({screen,BrowserWindow})=>screen.getDisplayMatching(BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html')).getBounds()).bounds);
 assert.deepEqual(metrics.surprise.bounds,display);assert.equal(await overlay.evaluate(()=>document.documentElement.scrollHeight>innerHeight),false);
 await sleep(4500);await overlay.screenshot({path:path.join(out,'v1.3-hearts.png')});report.checks.push('Five actual pet clicks open a display-sized animation with nickname and sender; four do not; no focus theft or scrolling');
 await until(async()=>overlay.isClosed());assert.equal((await call('test-control',{action:'metrics'})).surprise,null);
 assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Escape')),false);report.checks.push('Animation closes itself after ten seconds and releases temporary Escape shortcut');
 await call('test-control',{action:'reset-heart-gesture'});for(let i=0;i<4;i++)await tap();
 await pet.mouse.down();await call('test-control',{action:'finish-test-drag'});await pet.mouse.up();await tap();assert.equal((await call('test-control',{action:'metrics'})).surprise,null);
 await call('test-control',{action:'reset-heart-gesture'});for(let i=0;i<4;i++)await tap();await sleep(1000);await tap();assert.equal((await call('test-control',{action:'metrics'})).surprise,null);
 report.checks.push('Dragging and a pause between clicks reset the gesture through the actual event handlers');
 // Preview buttons and manual text do not count as pet taps.
 for(let i=0;i<6;i++)await call('manual','pet');assert.equal((await call('test-control',{action:'metrics'})).surprise,null);
 overlay=await burst();await overlay.locator('#close').click({force:true});await until(()=>overlay.isClosed());report.checks.push('Close button works; preview/manual replies do not trigger the hidden gesture');
 overlay=await burst();await call('test-control',{action:'flags',value:{locked:true}});await until(()=>overlay.isClosed());await call('test-control',{action:'flags',value:{locked:false}});report.checks.push('Locking dismisses the overlay immediately');
 overlay=await burst();await call('save-settings',{hidden:true});await until(()=>overlay.isClosed());await call('save-settings',{hidden:false});
 await call('save-settings',{petCharacter:'cat',nickname:'<b>名字</b>{昵称}'});overlay=await burst();assert.equal(await overlay.locator('#nickname').innerText(),'<b>名字</b>{昵称}');assert.equal(await overlay.locator('#nickname b').count(),0);
 await overlay.emulateMedia({reducedMotion:'reduce'});assert.equal(await overlay.locator('.dedication').evaluate(el=>getComputedStyle(el).animationDuration),'0.4s');await overlay.locator('#close').click({force:true});await until(()=>overlay.isClosed());report.checks.push('Cat also triggers; nickname stays plain text; hiding cleans up; reduced-motion styles apply');
 assert.deepEqual(errors,[]);await app.close();app=null;
 // The recipient has the same gesture, without enabling creator settings.
 const manifest=path.join(out,`heart-recipient-${Date.now()}.json`);fs.writeFileSync(manifest,JSON.stringify(createCompanion({...defaults(),nickname:'接收端昵称',petCharacter:'dog'})));
 app=await electron.launch({...launch,env:{...env,BANBAN_TEST_DATA:env.BANBAN_TEST_DATA+'-recipient',BANBAN_GIFT_MANIFEST:manifest}});
 let received;await until(()=>Boolean(received=app.windows().find(p=>p.url().endsWith('pet.html'))));await received.waitForSelector('svg');await sleep(350);
 assert.equal(app.windows().some(p=>p.url().endsWith('settings.html')),false);
 for(let i=0;i<5;i++){await received.locator('.cat-head').click({position:{x:50,y:55},force:true});await sleep(60);}
 await until(()=>Boolean(overlay=app.windows().find(p=>p.url().endsWith('surprise.html'))));await overlay.waitForSelector('#scene.playing');assert.equal(await overlay.locator('#nickname').innerText(),'接收端昵称');
 await overlay.locator('#close').click({force:true});report.checks.push('Recipient edition triggers the same surprise with its embedded nickname and no setup window');
 report.passed=true;console.log(JSON.stringify(report,null,2));
}catch(error){report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1;}finally{if(app)await app.close().catch(()=>{});report.errors=errors;fs.writeFileSync(path.join(out,'surprise-report.json'),JSON.stringify(report,null,2));}})();
