const crypto = require('node:crypto');
const {defaultMoments,validateMoments}=require('./moments.cjs');
const INTERVALS = [30, 45, 60, 90, 120];
const QUOTES = [
  '今天也想把我的偏爱，偷偷放在你桌面上。',
  '不用回复我，你忙你的，我就在这里。',
  '如果想念有形状，大概就是趴在你桌角的我。',
  '日子慢慢过，喜欢你这件事也慢慢说。',
  '今天辛苦啦，你已经做得很好了。',
  '想把平凡的小日子，都过成和你有关的纪念日。',
  '你认真生活的样子，是我眼里的小小光芒。',
  '忙里偷一个小懒吧，我替你保密。',
  '今天的云很好看，想到你也是。',
  '好好吃饭，慢慢长大，开心的事留一点给自己。',
  '喜欢你，是我每天都想重复的小事。',
  '世界很大，但我的偏心有一个很具体的方向。',
  '这只小猫不会说太多话，但它带来了很多想念。',
  '愿你今天的烦恼，都比昨天小一点。',
  '等你忙完，我们再一起把今天讲给彼此听。',
  '没有特别的事，只是特别想你。',
  '你可以慢一点，花也是慢慢开的。',
  '给今天的你，递上一颗小小的心。',
  '桌面有一只猫，心里有一个你。',
  '总有一些小事，让我又多喜欢你一点。',
  '希望你眼里的光，来自开心，也来自被爱。',
  '今天也在认真喜欢你，顺便认真等你下班。',
  '疲惫的时候，就把这一刻当作一个小小的拥抱。',
  '和你分享的日常，普通也会闪闪发亮。',
  '你的快乐，是我很想收集的小确幸。',
  '偷偷告诉你：你在我这里，一直很可爱。',
  '不用每一天都很厉害，平平安安也很好。',
  '我把想念装进口袋，让小猫一点一点拿给你。',
  '愿你忙有所获，也闲有所乐。',
  '路过你的桌面，留下一个轻轻的拥抱。',
  '喜欢你这件事，今天也没有休息。',
  '你往前走，我在小小的角落为你加油。',
  '想和你一起，把未来过成很多个舒服的今天。',
  '生活偶尔乱糟糟，但你一直值得被好好拥抱。',
  '如果今天很忙，就先把我的喜欢放在这里。',
  '你的出现，让很多普通时刻都有了特别的名字。'
];
function defaults() {
  return {
    version: 1, onboarded: false, nickname: '', sender: '',
    welcome: '你好呀，我是伴伴。以后就让我在桌角，陪你认真生活，也陪你偷偷放松。',
    petSize: 'medium', petCharacter: 'cat', moments:defaultMoments(), alwaysOnTop: true, hidden: false, startAtLogin: false,
    water: { enabled: true, minutes: 60 }, stretch: { enabled: true, minutes: 90 },
    windows: [{ start: '09:00', end: '12:00', enabled: true }, { start: '14:00', end: '18:00', enabled: true }],
    loveEnabled: true, useBuiltIn: true, pauseUntil: 0, position: null, positionVersion: 2,
    quotes: QUOTES.map((text, i) => ({ id: `builtin-${i + 1}`, text, enabled: true, builtin: true }))
  };
}
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function cleanText(value, limit, label, allowEmpty = true) {
  requireValue(typeof value === 'string', `${label}应为文字`);
  const s = value.trim();
  requireValue(s.length <= limit && (allowEmpty || s.length > 0), `${label}${allowEmpty ? '最多' : '需为 1～'}${limit} 个字符`);
  requireValue(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(s), `${label}包含无法显示的字符`);
  return s;
}
function minuteOfDay(s) { const [h, m] = s.split(':').map(Number); return h * 60 + m; }
function validateWindows(windows) {
  requireValue(Array.isArray(windows) && windows.length === 2, '请设置两组陪伴时段');
  const out = windows.map(w => {
    requireValue(w && typeof w.enabled === 'boolean', '时段开关格式不正确');
    for (const key of ['start', 'end']) requireValue(typeof w[key] === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(w[key]), '请填写正确的时间');
    requireValue(minuteOfDay(w.start) < minuteOfDay(w.end), '开始时间必须早于结束时间；暂不支持跨午夜');
    return { start: w.start, end: w.end, enabled: w.enabled };
  });
  const active = out.filter(w => w.enabled).sort((a, b) => a.start.localeCompare(b.start));
  requireValue(active.length < 2 || active[0].end <= active[1].start, '两个有效时段不能重叠');
  return out;
}
function validateQuotes(quotes, forceCustom = false) {
  requireValue(Array.isArray(quotes) && quotes.length <= 500, '最多保存 500 条情话');
  const seen = new Set();
  return quotes.map(q => {
    requireValue(q && typeof q.enabled === 'boolean', '文案开关格式不正确');
    const text = cleanText(q.text, 100, '单条情话', false);
    const id = !forceCustom && typeof q.id === 'string' && /^[\w-]{1,80}$/.test(q.id) ? q.id : crypto.randomUUID();
    requireValue(!seen.has(id), '文案编号重复'); seen.add(id);
    return { id, text, enabled: q.enabled, builtin: !forceCustom && q.builtin === true };
  });
}
function validateConfig(value) {
  const d = defaults();
  requireValue(value && typeof value === 'object' && !Array.isArray(value) && value.version === 1, '配置版本不受支持');
  const out = { ...d };
  for (const key of ['onboarded', 'alwaysOnTop', 'hidden', 'startAtLogin', 'loveEnabled', 'useBuiltIn']) {
    requireValue(typeof value[key] === 'boolean', '设置开关格式不正确'); out[key] = value[key];
  }
  out.nickname = cleanText(value.nickname, 20, '她的昵称'); out.sender = cleanText(value.sender, 20, '你的称呼');
  out.welcome = cleanText(value.welcome, 100, '欢迎语');
  requireValue(['small', 'medium', 'large'].includes(value.petSize), '桌宠尺寸无效'); out.petSize = value.petSize;
  out.petCharacter = value.petCharacter === undefined ? 'cat' : value.petCharacter;
  requireValue(['cat','dog'].includes(out.petCharacter), '桌宠形象无效');
  for (const k of ['water', 'stretch']) {
    requireValue(value[k] && typeof value[k].enabled === 'boolean' && INTERVALS.includes(value[k].minutes), '提醒间隔无效');
    out[k] = { enabled: value[k].enabled, minutes: value[k].minutes };
  }
  out.windows = validateWindows(value.windows);
  requireValue(Number.isFinite(value.pauseUntil) && value.pauseUntil >= 0 && value.pauseUntil < 8640000000000000, '暂停时间无效');
  out.pauseUntil = value.pauseUntil;
  out.positionVersion = value.positionVersion === 2 ? 2 : 1;
  if (value.position !== null) {
    requireValue(value.position && ['x', 'y'].every(k => Number.isFinite(value.position[k]) && Math.abs(value.position[k]) < 100000), '桌宠位置无效');
    out.position = { x: Math.round(value.position.x), y: Math.round(value.position.y) };
  }
  out.quotes = validateQuotes(value.quotes);
  out.moments = validateMoments(value.moments,cleanText);
  return out;
}
function validateGift(gift) {
  requireValue(gift && gift.format === 'banban-gift' && gift.version === 1, '这不是受支持的伴伴礼物包（版本 1）');
  return {
    format: 'banban-gift', version: 1,
    nickname: cleanText(gift.nickname, 20, '她的昵称'), sender: cleanText(gift.sender, 20, '你的称呼'),
    welcome: cleanText(gift.welcome, 100, '欢迎语'), quotes: validateQuotes(gift.quotes, true)
  };
}
function exportGift(config) {
  return { format: 'banban-gift', version: 1, nickname: config.nickname, sender: config.sender, welcome: config.welcome,
    quotes: config.quotes.filter(q => !q.builtin).map(q => ({ text: q.text, enabled: q.enabled })) };
}
function renderText(text, config) {
  const values = {'{昵称}':config.nickname || '亲爱的','{我的称呼}':config.sender || '我'};
  return text.replace(/\{昵称\}|\{我的称呼\}/g, token => values[token]);
}
function defaultRuntime() { return { recent: [], cycle: [], lastQuote: null, loveCounts: {}, touchRecent: [], anniversarySeen:[] }; }
module.exports = { defaults, validateConfig, validateGift, exportGift, renderText, minuteOfDay, defaultRuntime, INTERVALS };
