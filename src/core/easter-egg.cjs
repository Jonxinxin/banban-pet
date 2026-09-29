// Only completed pet taps reach this detector. Dragging, hiding and sleep reset it.
class HeartGesture {
  constructor(){this.taps=[];this.cooldownUntil=0;}
  reset(){this.taps=[];}
  tap(now){
    if(!Number.isFinite(now)||now<this.cooldownUntil){this.reset();return false;}
    const last=this.taps.at(-1);
    if(last!==undefined&&(now<last||now-last>900))this.reset();
    this.taps=this.taps.filter(time=>now-time<=3000);
    this.taps.push(now);
    if(this.taps.length<5)return false;
    this.reset();this.cooldownUntil=now+12000;return true;
  }
}
module.exports={HeartGesture};
