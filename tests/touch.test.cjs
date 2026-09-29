const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {defaults,validateConfig,defaultRuntime,renderText}=require('../src/core/config.cjs');
const {createCompanion,validateCompanion,companionConfig}=require('../src/core/companion.cjs');
const {touchPool,pickTouch}=require('../src/core/touch.cjs');
const {Store}=require('../src/core/store.cjs');
const {Scheduler}=require('../src/core/scheduler.cjs');

test('old settings and gifts retain cat; selected dog survives gift export',()=>{
 const old=defaults();delete old.petCharacter;assert.equal(validateConfig(old).petCharacter,'cat');
 assert.throws(()=>validateConfig({...old,petCharacter:'unknown'}));
 const gift=createCompanion({...defaults(),petCharacter:'dog',nickname:'小朋友'});
 assert.equal(companionConfig(gift).petCharacter,'dog');assert.equal(companionConfig(gift).nickname,'小朋友');
 delete gift.settings.petCharacter;assert.equal(validateCompanion(gift).settings.petCharacter,'cat');
});
test('40 distinct replies per pet, nicknames and sender stay literal, fallback is affectionate',()=>{
 for(const character of ['cat','dog']){
  const pool=touchPool(character);assert.equal(pool.length,40);assert.equal(new Set(pool.map(x=>x.text)).size,40);
  const c={...defaults(),petCharacter:character,nickname:'小朋友',sender:'大朋友'};
  const rendered=pool.map(q=>renderText(q.text,c));assert.ok(rendered.every(t=>!/[{}]/.test(t)));
  assert.ok(rendered.filter(t=>t.includes('小朋友')).length>=35);
  const other=character==='dog'?/小猫|呼噜|喵/:/大白狗|汪/;assert.ok(rendered.every(t=>!other.test(t)));
 }
 assert.ok(pickTouch(defaults(),defaultRuntime(),()=>0).includes('亲爱的'));
 assert.equal(renderText('{昵称} / {我的称呼}',{nickname:'{我的称呼}<b>',sender:'大朋友'}),'{我的称呼}<b> / 大朋友');
});
test('touch avoids the last eight replies across restarts and character changes',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'banban-touch-'));
 try{
  let store=new Store(dir),c={...defaults(),petCharacter:'dog'},runtime=store.runtime,seen=[];
  for(let i=0;i<120;i++){
   const reply=pickTouch(c,runtime,()=>0);assert.ok(!seen.slice(-8).includes(reply));seen.push(reply);
   store.saveRuntime(runtime);
   if(i===50){store=new Store(dir);assert.equal(store.runtime.touchRecent.length,8);runtime=store.runtime;}
  }
  c.petCharacter='cat';const reply=pickTouch(c,runtime,()=>0);assert.ok(!seen.slice(-8).includes(reply));
  fs.writeFileSync(path.join(dir,'runtime.json'),JSON.stringify({recent:[],cycle:[],lastQuote:null,loveCounts:{}}));
  assert.deepEqual(new Store(dir).runtime.touchRecent,[]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('dog adapts builtin cat wording while keeping authored notes exactly intact',()=>{
 const c={...defaults(),petCharacter:'dog'};
 for(const original of c.quotes.filter(q=>/猫/.test(q.text))){const s=new Scheduler({...c,quotes:[original]});assert.ok(!s.pickQuote().includes('猫'));}
 const custom={id:'custom',text:'我的小猫女朋友',enabled:true,builtin:false};
 assert.equal(new Scheduler({...c,quotes:[custom]}).pickQuote(),custom.text);
});
