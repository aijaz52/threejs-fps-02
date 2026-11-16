export class Audio {
  constructor() {
    this.ctx = null; this.master = null; this.buffer = null; this.voices = []; this.cursor = 0;
    this.profiles = { raven: 230, talon: 150, wasp: 300, hornet: 360, lance: 75, breach: 95 };
  }
  start() {
    if (this.ctx) { this.ctx.resume(); return; }
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    this.ctx = new Context(); this.master = this.ctx.createGain();
    this.master.gain.value = .22; this.master.connect(this.ctx.destination);
    this.buffer = this.ctx.createBuffer(1, this.ctx.sampleRate, this.ctx.sampleRate);
    const data = this.buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    for (let i = 0; i < 24; i++) {
      const oscillator = this.ctx.createOscillator(), noise = this.ctx.createBufferSource();
      const toneGain = this.ctx.createGain(), noiseGain = this.ctx.createGain();
      oscillator.type = 'triangle'; toneGain.gain.value = noiseGain.gain.value = 0;
      noise.buffer = this.buffer; noise.loop = true;
      oscillator.connect(toneGain).connect(this.master); noise.connect(noiseGain).connect(this.master);
      oscillator.start(); noise.start(); this.voices.push({ oscillator, toneGain, noiseGain });
    }
    this.ctx.resume();
  }
  sound(frequency, duration, tone = .1, noise = 0, distance = 0, delay = 0) {
    if (!this.ctx) return;
    const v = this.voices[this.cursor++ % this.voices.length], t = this.ctx.currentTime + delay;
    const attenuation = 1 / (1 + distance * .12);
    v.oscillator.frequency.setValueAtTime(frequency, t);
    v.oscillator.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * .6), t + duration);
    v.toneGain.gain.cancelScheduledValues(t); v.noiseGain.gain.cancelScheduledValues(t);
    v.toneGain.gain.setValueAtTime(Math.max(.0001, tone * attenuation), t);
    v.noiseGain.gain.setValueAtTime(Math.max(.0001, noise * attenuation), t);
    v.toneGain.gain.exponentialRampToValueAtTime(.0001, t + duration);
    v.noiseGain.gain.exponentialRampToValueAtTime(.0001, t + duration);
  }
  gunshot(id, distance = 0) { this.sound(this.profiles[id] || 180, id === 'breach' || id === 'lance' ? .22 : .095, .5, .8, distance); }
  reload() { this.sound(500, .045, .12, .12); this.sound(720, .06, .1, .15, 0, .3); }
  footstep(distance = 0) { this.sound(85, .07, .06, .16, distance); }
  flashbang() { this.sound(2800, 1.6, .16, .1); }
  beep(seconds, distance = 0) { this.sound(800 + (40 - seconds) * 12, .065, .18, 0, distance); }
  stinger(win) {
    this.sound(win ? 523 : 220, .22, .25);
    this.sound(win ? 659 : 174, .22, .25, 0, 0, .16);
    this.sound(win ? 784 : 130, .4, .25, 0, 0, .32);
  }
}
