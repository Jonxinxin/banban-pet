const {_electron:electron}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{execFile}=require('node:child_process'),{promisify}=require('node:util');
const run=promisify(execFile),root=path.join(__dirname,'..'),out=path.join(root,'test-results');
const env={...process.env,BANBAN_TEST:'1',BANBAN_TEST_SENSOR:'1',BANBAN_TEST_DATA:path.join(out,`hearts-native-${Date.now()}`)};delete env.ELECTRON_RUN_AS_NODE;delete env.BANBAN_GIFT_MANIFEST;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));let app;const report={date:new Date().toISOString(),checks:[]};
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await sleep(80);}throw Error('Timed out');}
(async()=>{try{
 app=await electron.launch({args:[root,'--settings'],env});let settings;await until(()=>Boolean(settings=app.windows().find(p=>p.url().endsWith('settings.html'))));await settings.waitForSelector('[data-action="start"]');
 const call=(name,...args)=>settings.evaluate(({name,args})=>window.banban.call(name,...args),{name,args});
 await call('save-settings',{petCharacter:'dog'});await call('start');await until(async()=>(await call('get-state')).fullscreenAvailable);
 await call('test-control',{action:'position',value:{x:300,y:300}});await sleep(450);
 const point=await app.evaluate(({screen,BrowserWindow})=>{const b=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().endsWith('pet.html')).getBounds();return screen.dipToScreenPoint({x:Math.round(b.x+b.width*.5),y:Math.round(b.y+b.height*.45)});});
 const inject=`Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class HeartTestMouse { [DllImport("user32.dll")] public static extern bool SetProcessDPIAware(); [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y); [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint data,UIntPtr extra); }'; [HeartTestMouse]::SetProcessDPIAware() | Out-Null; if (-not [HeartTestMouse]::SetCursorPos(${point.x},${point.y})) { Write-Output 'NO_INPUT_DESKTOP'; exit 42 }; Start-Sleep -Milliseconds 300; 1..5 | ForEach-Object { [HeartTestMouse]::mouse_event(2,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 70; [HeartTestMouse]::mouse_event(4,0,0,0,[UIntPtr]::Zero); Start-Sleep -Milliseconds 160 }`;
 await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',inject],{windowsHide:true});
 let overlay;await until(()=>Boolean(overlay=app.windows().find(p=>p.url().endsWith('surprise.html'))));await overlay.waitForSelector('#scene.playing');
 const metrics=await call('test-control',{action:'metrics'});assert.equal(metrics.surprise.focused,false);assert.equal(metrics.surprise.escape,true);report.checks.push('Five real Windows mouse clicks pass through native drag detection and open the surprise');
 await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',`(New-Object -ComObject WScript.Shell).SendKeys('{ESC}')`],{windowsHide:true});
 await until(()=>overlay.isClosed());assert.equal(await app.evaluate(({globalShortcut})=>globalShortcut.isRegistered('Escape')),false);report.checks.push('Real Escape key closes the unfocused overlay and releases its hotkey');
 report.passed=true;console.log(JSON.stringify(report,null,2));
}catch(error){if(error.code===42||String(error.stdout).includes('NO_INPUT_DESKTOP')){report.skipped='Windows input desktop unavailable: physical mouse and keyboard injection could not be verified';console.log(report.skipped);}else{report.passed=false;report.failure=error.stack;console.error(error);process.exitCode=1;}}finally{if(app)await app.close().catch(()=>{});fs.writeFileSync(path.join(out,'surprise-native-report.json'),JSON.stringify(report,null,2));}})();
