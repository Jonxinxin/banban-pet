const fs = require('node:fs');
const path = require('node:path');
const { defaults, validateConfig, defaultRuntime } = require('./config.cjs');
class Store {
  constructor(directory) {
    this.directory = directory; fs.mkdirSync(directory, { recursive: true });
    this.recovered = false;
    this.config = this.read('settings', defaults, validateConfig);
    this.runtime = this.read('runtime', defaultRuntime, value => {
      if (!value || !Array.isArray(value.recent) || !Array.isArray(value.cycle) || !value.loveCounts || typeof value.loveCounts !== 'object') throw new Error('Invalid runtime');
      return { recent: value.recent.filter(x => typeof x === 'string').slice(-10), cycle: value.cycle.filter(x => typeof x === 'string').slice(-500),
        lastQuote: typeof value.lastQuote === 'string' ? value.lastQuote : null,
        touchRecent: Array.isArray(value.touchRecent) ? value.touchRecent.filter(x => typeof x === 'string' && /^touch-(shared|cat|dog)-\d+$/.test(x)).slice(-8) : [],
        anniversarySeen:Array.isArray(value.anniversarySeen)?value.anniversarySeen.filter(x=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}:\d{4}-\d{2}-\d{2}$/.test(x)).slice(-32):[],
        loveCounts: Object.fromEntries(Object.entries(value.loveCounts).filter(([k, v]) => /^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isInteger(v) && v >= 0 && v <= 2)) };
    });
  }
  read(name, fallback, validate) {
    const file = path.join(this.directory, `${name}.json`);
    if (!fs.existsSync(file) && !fs.existsSync(`${file}.bak`)) return fallback();
    for (const candidate of [file, `${file}.bak`]) {
      try { const value = validate(JSON.parse(fs.readFileSync(candidate, 'utf8'))); if (candidate !== file) this.recovered = true; return value; }
      catch { this.recovered = true; }
    }
    return fallback();
  }
  write(name, value) {
    const file = path.join(this.directory, `${name}.json`);
    // Backup the last known valid value, never replace it with a corrupt disk file.
    const previous = name === 'settings' ? this.config : this.runtime;
    if (previous) fs.writeFileSync(`${file}.bak`, JSON.stringify(previous), 'utf8');
    const temp = `${file}.tmp`;
    const fd = fs.openSync(temp, 'w');
    try { fs.writeFileSync(fd, JSON.stringify(value, null, 2), 'utf8'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, file);
  }
  saveConfig(value) { const valid = validateConfig(value); this.write('settings', valid); this.config = valid; return valid; }
  saveRuntime(value) { this.write('runtime', value); this.runtime = structuredClone(value); }
  clearPrivateBackups() {
    // Replace backups too, so clearing private content leaves no old text behind.
    for (const name of ['settings', 'runtime']) {
      const value = name === 'settings' ? this.config : this.runtime;
      fs.writeFileSync(path.join(this.directory, `${name}.json.bak`), JSON.stringify(value), 'utf8');
    }
  }
}
module.exports = { Store };
