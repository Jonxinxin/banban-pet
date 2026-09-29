const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {defaults,validateConfig,validateGift,exportGift,renderText,defaultRuntime}=require('../src/core/config.cjs');
const {Store}=require('../src/core/store.cjs');const {Scheduler,MINUTE,nextMorning}=require('../src/core/scheduler.cjs');
function at(h,m=0,day=28){return +new Date(2026,8,day,h,m,0);}
function config(){const c=defaults();c.onboarded=true;c.windows=[{start:'00:00',end:'23:59',enabled:true},{start:'00:00',end:'01:00',enabled:false}];return c;}
function advance(s,from,to,busy=false){let out=[];for(let now=from+MINUTE;now<=to;now+=MINUTE){const event=s.tick(now,busy);if(event)out.push(event);}return out;}
test('onboarding, quiet time and empty windows suppress all automatic prompts',()=>{
 const c=defaults(),s=new Scheduler(c);assert.equal(s.tick(at(9)),null);assert.equal(s.reason(at(9)),'还未开始陪伴');c.onboarded=true;assert.equal(s.reason(at(13)),'安静时段');c.windows.forEach(w=>w.enabled=false);assert.equal(s.reason(at(9)),'安静时段');
});
test('health cycles, coincident reminders and minimum global gap',()=>{
 const c=config();c.water.minutes=30;c.stretch.minutes=45;const s=new Scheduler(c);s.tick(at(9));const events=advance(s,at(9),at(10,30));
 assert.deepEqual(events.map(e=>e.kind),['water','stretch','water','combined']);
});
test('snooze replaces cycle and is available only once',()=>{
 const c=config();c.water.minutes=30;c.stretch.enabled=false;const s=new Scheduler(c);s.tick(at(9));const [first]=advance(s,at(9),at(9,30));
 assert.equal(s.snooze(first,at(9,30)),true);assert.equal(s.next.water.due,at(9,40));const [retry]=advance(s,at(9,30),at(9,40));assert.equal(retry.snoozed,true);assert.equal(s.snooze(retry,at(9,40)),false);assert.equal(s.next.water.due,at(10,10));
});
test('suppression clears due and snoozed reminders, restoring a full interval',()=>{
 const c=config();const s=new Scheduler(c);s.tick(at(9));s.setFlags({fullscreen:true});assert.equal(s.tick(at(10)),null);assert.deepEqual(s.next,{});s.setFlags({fullscreen:false});s.tick(at(10,1));assert.equal(s.next.water.due,at(11,1));
 const next={...c,pauseUntil:at(12)};s.update(next,at(10,1));assert.equal(s.reason(at(10,1)),'提醒已暂停');
});
test('resume after a long timer gap and backwards clock changes does not catch up',()=>{
 const s=new Scheduler(config());s.tick(at(9));assert.equal(s.tick(at(12)),null);assert.equal(s.next.water.due,at(13));assert.equal(s.tick(at(8)),null);assert.equal(s.next.water.due,at(9));
});
test('active window boundaries cancel tasks and begin a fresh cycle',()=>{
 const c=defaults();c.onboarded=true;const s=new Scheduler(c);s.tick(at(11,30));assert.equal(s.next.water,null);s.tick(at(12));s.tick(at(14));assert.equal(s.next.water.due,at(15));
});
test('busy health prompts remain queued, love prompts are skipped',()=>{
 const c=config();const s=new Scheduler(c,defaultRuntime(),()=>0);s.tick(at(9));advance(s,at(9),at(11),true);assert.equal(s.next.love.due,at(13));const event=s.tick(at(11,1));assert.equal(event.kind,'combined');
});
test('automatic love stops at two per local date; manual selection is unrestricted',()=>{
 const c=config();c.water.enabled=false;c.stretch.enabled=false;const s=new Scheduler(c,defaultRuntime(),()=>0);s.tick(at(0));const events=advance(s,at(0),at(12));assert.equal(events.length,2);assert.ok(s.pickQuote());assert.equal(s.runtime.loveCounts['2026-09-28'],2);
 const restored=new Scheduler(c,s.runtime,()=>0);restored.tick(at(0));assert.equal(advance(restored,at(0),at(12)).length,0);
});
test('small quote pool completes cycles with no consecutive repeat across cycles',()=>{
 const c=config();c.quotes=c.quotes.slice(0,3);const s=new Scheduler(c,defaultRuntime(),()=>0);const result=Array.from({length:9},()=>s.pickQuote());assert.equal(new Set(result.slice(0,3)).size,3);assert.equal(new Set(result.slice(3,6)).size,3);for(let i=1;i<result.length;i++)assert.notEqual(result[i],result[i-1]);
});
test('larger pools avoid last ten and empty pool is harmless',()=>{
 const c=config(),s=new Scheduler(c,defaultRuntime(),()=>0);const values=Array.from({length:24},()=>s.pickQuote());for(let i=1;i<values.length;i++)assert.ok(!values.slice(Math.max(0,i-10),i).includes(values[i]));c.useBuiltIn=false;assert.equal(s.pickQuote(),null);
});
test('editing text does not restart timers, editing interval does',()=>{
 const c=config(),s=new Scheduler(c);s.tick(at(9));s.update({...c,nickname:'小朋友'},at(9,10));assert.equal(s.next.water.due,at(10));s.update({...s.config,water:{enabled:true,minutes:45}},at(9,15));assert.equal(s.next.water.due,at(10));s.update({...s.config,water:{enabled:false,minutes:45}},at(9,16));assert.equal(s.next.water,null);
});
test('gift files whitelist private content and refuse invalid data',()=>{
 const c=config();c.nickname='小朋友';c.position={x:12,y:34};c.quotes.push({id:'custom-1',text:'{昵称}，我在这里。',enabled:true,builtin:false});const gift=exportGift(c);assert.equal(gift.quotes.length,1);assert.equal('position'in gift,false);assert.equal('water'in gift,false);assert.equal(validateGift(gift).quotes[0].builtin,false);
 assert.throws(()=>validateGift({...gift,version:99}));assert.throws(()=>validateGift({...gift,quotes:[{text:'x'.repeat(101),enabled:true}]}));assert.throws(()=>validateGift({...gift,quotes:[{text:42,enabled:true}]}));assert.equal(renderText('{昵称}，{我的称呼}在这里。',c),'小朋友，我在这里。');
});
test('configuration rejects malformed times, overlapping windows and invalid intervals',()=>{
 const c=defaults();assert.deepEqual(validateConfig(c),c);assert.throws(()=>validateConfig({...c,water:{enabled:true,minutes:1}}));assert.throws(()=>validateConfig({...c,windows:[{start:'12:00',end:'09:00',enabled:true},c.windows[1]]}));assert.throws(()=>validateConfig({...c,windows:[c.windows[0],{start:'11:00',end:'13:00',enabled:true}]}));
});
test('tomorrow pause respects the next calendar day and earliest enabled window',()=>{assert.equal(nextMorning(defaults(),at(23)),at(9,0,29));});
test('atomic store recovers its backup and clearing content removes private backups',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'banban-store-'));try{
  const store=new Store(dir);store.saveConfig({...store.config,nickname:'first'});store.saveConfig({...store.config,nickname:'second'});fs.writeFileSync(path.join(dir,'settings.json'),'{broken');const recovered=new Store(dir);assert.equal(recovered.config.nickname,'first');assert.equal(recovered.recovered,true);
  recovered.saveConfig({...recovered.config,nickname:''});recovered.clearPrivateBackups();assert.ok(!fs.readFileSync(path.join(dir,'settings.json.bak'),'utf8').includes('first'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
