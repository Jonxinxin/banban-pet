const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {defaults,validateConfig,defaultRuntime}=require('../src/core/config.cjs');
const {anniversaryInfo,pendingAnniversary}=require('../src/core/moments.cjs');
const {Store}=require('../src/core/store.cjs'),{createCompanion,companionConfig}=require('../src/core/companion.cjs');
test('old configs get usable moments and no invented anniversary; author settings export intact',()=>{
 const c=defaults();delete c.moments;const migrated=validateConfig(c);assert.equal(migrated.moments.anniversary.enabled,false);assert.equal(migrated.moments.hugEnabled,true);assert.equal(migrated.moments.umbrellaEnabled,true);
 migrated.moments.anniversary={enabled:true,date:'2024-02-20',title:'在一起的日子',letter:'只给{昵称}的信'};
 assert.deepEqual(companionConfig(createCompanion(migrated)).moments,migrated.moments);
 for(const date of ['2024-02-30','2023-02-29','2024-13-01',''])assert.throws(()=>validateConfig({...migrated,moments:{...migrated.moments,anniversary:{...migrated.moments.anniversary,date}}}));
});
test('anniversary respects local dates, yearly repeat, first-day count, leap-day fallback and once-per-day record',()=>{
 const c=defaults(),r=defaultRuntime();c.moments.anniversary={...c.moments.anniversary,enabled:true,date:'2024-02-20'};
 assert.equal(anniversaryInfo(c,new Date(2024,1,20)).days,1);
 assert.equal(pendingAnniversary(c,r,new Date(2023,1,20)),null);assert.equal(pendingAnniversary(c,r,new Date(2026,1,19)),null);
 const info=pendingAnniversary(c,r,new Date(2026,1,20,23,59));assert.ok(info);r.anniversarySeen=[info.key];assert.equal(pendingAnniversary(c,r,new Date(2026,1,20)),null);assert.ok(pendingAnniversary(c,r,new Date(2027,1,20)));
 c.moments.anniversary.date='2024-02-29';assert.ok(pendingAnniversary(c,r,new Date(2025,1,28)));assert.equal(pendingAnniversary(c,r,new Date(2028,1,28)),null);assert.ok(pendingAnniversary(c,r,new Date(2028,1,29)));
});
test('retired capsule settings are ignored in old configs and companion manifests',()=>{
 const c=defaults();c.nickname='小朋友';c.moments.hugEnabled=false;c.moments.anniversary={enabled:true,date:'2024-02-20',title:'在一起的日子',letter:'只给{昵称}的信'};
 const legacy=structuredClone(c);Object.assign(legacy.moments,{gachaEnabled:true,compliments:['过去的一句夸奖'],coupons:['一起散步']});
 assert.deepEqual(validateConfig(legacy),c);
 const gift=createCompanion(c);gift.settings.moments=legacy.moments;
 assert.deepEqual(companionConfig(gift).moments,c.moments);assert.deepEqual(createCompanion(legacy).settings.moments,c.moments);
});
test('old store data loads without resetting settings or anniversary records',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'banban-moments-'));try{
  const c=defaults(),r=defaultRuntime();c.nickname='小朋友';c.moments.umbrellaEnabled=false;r.anniversarySeen=['2024-02-20:2026-02-20'];
  const legacy=structuredClone(c);Object.assign(legacy.moments,{gachaEnabled:true,compliments:['过去的一句夸奖'],coupons:[]});
  fs.writeFileSync(path.join(dir,'settings.json'),JSON.stringify(legacy));fs.writeFileSync(path.join(dir,'runtime.json'),JSON.stringify({...r,gachaRecent:['a'.repeat(64)]}));
  const restored=new Store(dir);assert.equal(restored.recovered,false);assert.deepEqual(restored.config,c);assert.deepEqual(restored.runtime,r);
  restored.saveConfig(restored.config);restored.saveRuntime(restored.runtime);const restarted=new Store(dir);assert.deepEqual(restarted.config,c);assert.deepEqual(restarted.runtime,r);
 }
 finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));fs.rmSync(dir,{recursive:true,force:true});}
});
