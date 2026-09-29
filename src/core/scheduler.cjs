const { minuteOfDay, renderText, defaultRuntime } = require('./config.cjs');
const MINUTE = 60000;
function dateKey(now) { const d = new Date(now); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
function activeWindow(config, now) {
  const d = new Date(now), minutes = d.getHours()*60 + d.getMinutes();
  return config.windows.find(w => w.enabled && minutes >= minuteOfDay(w.start) && minutes < minuteOfDay(w.end)) || null;
}
function nextMorning(config, now) {
  const earliest = config.windows.filter(w => w.enabled).map(w => minuteOfDay(w.start)).sort((a,b)=>a-b)[0] ?? 9*60;
  const d = new Date(now); d.setDate(d.getDate()+1); d.setHours(Math.floor(earliest/60),earliest%60,0,0); return +d;
}
class Scheduler {
  constructor(config, runtime = defaultRuntime(), rng = Math.random) {
    this.config = config; this.runtime = structuredClone(runtime); this.rng = rng;
    this.flags = { fullscreen: false, locked: false, suspended: false };
    this.active = false; this.activeKey = null; this.next = {}; this.lastAutomatic = 0;
    this.lastTick = null; this.lastTimezone = null; this.sequence = 0;
  }
  reason(now) {
    if (!this.config.onboarded) return '还未开始陪伴';
    if (this.config.hidden) return '桌宠已隐藏';
    if (this.flags.locked || this.flags.suspended) return '电脑正在休息';
    if (this.flags.fullscreen) return '全屏安静中';
    if (this.config.pauseUntil > now) return '提醒已暂停';
    if (!activeWindow(this.config, now)) return '安静时段';
    return null;
  }
  loveDelay() { return (120 + Math.floor(this.rng()*61))*MINUTE; }
  scheduled(kind, now, delay, snoozed = false) {
    const due = now + delay;
    const win = activeWindow(this.config, now);
    if (!win || activeWindow(this.config, due) !== win || dateKey(now) !== dateKey(due)) return null;
    return { due, snoozed };
  }
  reset(now) {
    this.next = {};
    for (const kind of ['water','stretch']) if (this.config[kind].enabled) this.next[kind] = this.scheduled(kind, now, this.config[kind].minutes*MINUTE);
    this.next.love = this.scheduled('love', now, this.loveDelay());
  }
  update(config, now) {
    const previous = this.config; this.config = config;
    const globalChanged = ['windows','onboarded','hidden','pauseUntil'].some(k=>JSON.stringify(previous[k]) !== JSON.stringify(config[k]));
    if (globalChanged) { this.active = false; this.activeKey = null; this.next = {}; }
    else {
      for (const kind of ['water','stretch']) if (JSON.stringify(previous[kind]) !== JSON.stringify(config[kind]))
        this.next[kind] = config[kind].enabled && !this.reason(now) ? this.scheduled(kind, now, config[kind].minutes*MINUTE) : null;
      if (previous.loveEnabled !== config.loveEnabled) this.next.love = this.scheduled('love',now,this.loveDelay());
    }
  }
  setFlags(flags) {
    if (Object.entries(flags).some(([k,v])=>this.flags[k]!==v)) { Object.assign(this.flags,flags); this.active=false; this.activeKey=null; this.next={}; }
  }
  pickQuote() {
    const pool = this.config.quotes.filter(q => q.enabled && (!q.builtin || this.config.useBuiltIn));
    if (!pool.length) return null;
    let candidates;
    if (pool.length > 10) candidates = pool.filter(q => !this.runtime.recent.includes(q.id));
    else {
      this.runtime.cycle = this.runtime.cycle.filter(id => pool.some(q=>q.id===id));
      candidates = pool.filter(q=>!this.runtime.cycle.includes(q.id));
      if (!candidates.length) { this.runtime.cycle=[]; candidates=pool.filter(q=>q.id!==this.runtime.lastQuote); }
    }
    if (!candidates.length) candidates = pool;
    const quote = candidates[Math.min(candidates.length-1, Math.floor(this.rng()*candidates.length))];
    this.runtime.recent = [...this.runtime.recent, quote.id].slice(-10);
    this.runtime.cycle = [...this.runtime.cycle, quote.id].slice(-500); this.runtime.lastQuote = quote.id;
    const text = quote.builtin && this.config.petCharacter === 'dog'
      ? quote.text.replaceAll('小猫','大白狗').replaceAll('一只猫','一只大白狗') : quote.text;
    return renderText(text, this.config);
  }
  tick(now, busy = false) {
    const timezone = new Date(now).getTimezoneOffset();
    const clockJump = this.lastTick !== null && (now < this.lastTick || now-this.lastTick > 90000 || timezone!==this.lastTimezone);
    this.lastTick=now; this.lastTimezone=timezone;
    const window = activeWindow(this.config, now);
    const key = window ? `${dateKey(now)}:${window.start}` : null;
    if (this.reason(now)) { this.active=false; this.activeKey=null; this.next={}; return null; }
    if (!this.active || clockJump || key!==this.activeKey) {
      this.active=true; this.activeKey=key; this.reset(now); if(clockJump) this.lastAutomatic=0; return null;
    }
    const health = ['water','stretch'].filter(k=>this.config[k].enabled && this.next[k] && now>=this.next[k].due);
    const tooSoon = this.lastAutomatic && now-this.lastAutomatic < 10*MINUTE;
    const loveDue = this.next.love && now>=this.next.love.due;
    if (loveDue && (health.length || tooSoon || busy)) this.next.love=this.scheduled('love',now,this.loveDelay());
    if (busy || tooSoon) return null;
    if (health.length) {
      const snoozed = health.some(k=>this.next[k].snoozed);
      for (const k of health) this.next[k]=this.scheduled(k,now,this.config[k].minutes*MINUTE);
      this.lastAutomatic=now;
      return { id: ++this.sequence, kind: health.length===2?'combined':health[0], types: health, snoozed, automatic:true };
    }
    if (loveDue) {
      this.next.love=this.scheduled('love',now,this.loveDelay());
      const key=dateKey(now), count=this.runtime.loveCounts[key]||0;
      if (this.config.loveEnabled && count<2) {
        const text=this.pickQuote();
        if(text) { this.runtime.loveCounts[key]=count+1; this.lastAutomatic=now; return {id:++this.sequence,kind:'love',text,automatic:true}; }
      }
    }
    return null;
  }
  snooze(event, now) {
    if (event.snoozed || this.reason(now)) return false;
    for(const type of event.types||[]) this.next[type]=this.scheduled(type,now,10*MINUTE,true);
    return true;
  }
  status(now) {
    return { reason:this.reason(now), next: structuredClone(this.next), pauseUntil:this.config.pauseUntil,
      loveToday:this.runtime.loveCounts[dateKey(now)]||0,
      quoteCount:this.config.quotes.filter(q=>q.enabled&&(!q.builtin||this.config.useBuiltIn)).length };
  }
}
module.exports={Scheduler,MINUTE,dateKey,activeWindow,nextMorning};
