const {test}=require('node:test'),assert=require('node:assert/strict');
const {gazeTarget,follow,attentionTarget,followPose}=require('../src/ui/pet-motion.js');

test('gaze follows every direction and stays within an ellipse even on distant monitors',()=>{
  assert.deepEqual(gazeTarget(0,0),{x:0,y:0});
  for(const dx of [-200000,-300,-1,0,1,300,200000])for(const dy of [-200000,-300,-1,0,1,300,200000]){
    const p=gazeTarget(dx,dy);assert.equal(Math.sign(p.x),Math.sign(dx));assert.equal(Math.sign(p.y),Math.sign(dy));
    assert.ok((p.x/5.2)**2+(p.y/3.6)**2<=1.000001);
  }
  assert.deepEqual(gazeTarget(NaN,10),{x:0,y:0});
});
test('gaze eases without overshoot and responds consistently at different refresh rates',()=>{
  const target=gazeTarget(800,-200),samples=[];
  for(const hz of [30,60,144]){
    let p={x:0,y:0};for(let i=0;i<hz/2;i++){
      const next=follow(p,target,1000/hz);assert.ok(next.x>=p.x&&next.x<=target.x);assert.ok(next.y<=p.y&&next.y>=target.y);p=next;
    }
    assert.ok(Math.hypot(p.x-target.x,p.y-target.y)<.03);samples.push(p);
  }
  for(const p of samples)assert.ok(Math.hypot(p.x-samples[0].x,p.y-samples[0].y)<1e-10);
});
test('sudden reversals and stalled frames do not teleport the eyes',()=>{
  const from=gazeTarget(1000,0),target=gazeTarget(-1000,0);
  const first=follow(from,target,1000/60);assert.ok(first.x<from.x&&first.x>0);
  const afterStall=follow(from,target,5000);assert.ok(afterStall.x>target.x+1);
  assert.deepEqual(follow(from,target,0),from);
});
test('head and body turn toward the same target with restrained depth and a near-cursor response',()=>{
  for(const dx of [-100000,-250,250,100000])for(const dy of [-100000,-250,250,100000]){
    const pose=attentionTarget(dx,dy);assert.equal(Math.sign(pose.headX),Math.sign(dx));assert.equal(Math.sign(pose.headY),Math.sign(dy));
    assert.equal(Math.sign(pose.angle),Math.sign(dx));assert.equal(Math.sign(pose.bodyX),Math.sign(dx));
    assert.ok(Math.abs(pose.headX)<=6&&Math.abs(pose.headY)<=4&&Math.abs(pose.angle)<=4.5&&Math.abs(pose.lean)<=1.1);
    assert.ok(pose.scale>=1&&pose.scale<=1.018);
  }
  assert.ok(attentionTarget(0,0).scale>attentionTarget(1000,1000).scale);
});
test('eyes lead the head and the body follows later, without overshooting or self-chasing',()=>{
  const rest=attentionTarget(NaN,NaN),target=attentionTarget(800,-300),eyes=gazeTarget(800,-300);
  const pose=followPose(rest,target,16),eye=follow({x:0,y:0},eyes,16,75);
  assert.ok(eye.x/eyes.x>pose.headX/target.headX);assert.ok(pose.headX/target.headX>pose.bodyX/target.bodyX);
  let current=rest;for(let i=0;i<180;i++){current=followPose(current,target,1000/60);assert.ok(current.headX<=target.headX&&current.bodyX<=target.bodyX);}
  for(const key of Object.keys(target))assert.ok(Math.abs(current[key]-target[key])<.001);
});
