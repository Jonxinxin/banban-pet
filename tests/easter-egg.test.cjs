const {test}=require('node:test'),assert=require('node:assert/strict');
const {HeartGesture}=require('../src/core/easter-egg.cjs');
test('exactly five quick taps trigger once; held clicks and dragging can break the sequence',()=>{
 const gesture=new HeartGesture();
 assert.deepEqual([0,200,400,600,800].map(t=>gesture.tap(t)),[false,false,false,false,true]);
 assert.ok([900,1000,1100,1200,1300].every(t=>gesture.tap(t)===false));
 gesture.cooldownUntil=0;gesture.reset();[2000,2200,2400,2600].forEach(t=>gesture.tap(t));gesture.reset();assert.equal(gesture.tap(2800),false);
});
test('slow, paused or reversed-time clicks cannot accumulate into an accidental surprise',()=>{
 const gesture=new HeartGesture();assert.ok([0,1000,2000,3000,4000].every(t=>!gesture.tap(t)));
 gesture.reset();assert.ok([5000,5850,6700,7550,8400].every(t=>!gesture.tap(t)));
 gesture.reset();[10000,10200,10400,10600].forEach(t=>gesture.tap(t));assert.equal(gesture.tap(9000),false);
});
test('new bursts work after the twelve-second cooldown',()=>{
 const gesture=new HeartGesture();[0,100,200,300,400].forEach(t=>gesture.tap(t));
 assert.deepEqual([12400,12500,12600,12700,12800].map(t=>gesture.tap(t)),[false,false,false,false,true]);
});
