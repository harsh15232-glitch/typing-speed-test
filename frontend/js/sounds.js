/* sounds.js — lightweight synthesized sound effects via WebAudio, no external files */

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.4;
  }

  _ensureCtx() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
    return this.ctx;
  }

  setEnabled(v) { this.enabled = v; }
  setVolume(v) { this.volume = v; }

  _beep({ freq = 440, duration = 0.045, type = "sine", gain = 1 }) {
    if (!this.enabled) return;
    try {
      const ctx = this._ensureCtx();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      g.gain.value = this.volume * gain;
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
      osc.connect(g).connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    } catch (e) { /* audio unsupported, fail silently */ }
  }

  keyPress()  { this._beep({ freq: 620, duration: 0.03, type: "square", gain: 0.5 }); }
  keyError()  { this._beep({ freq: 160, duration: 0.09, type: "sawtooth", gain: 0.8 }); }
  countdown() { this._beep({ freq: 300, duration: 0.12, type: "sine", gain: 0.8 }); }
  start()     { this._beep({ freq: 880, duration: 0.15, type: "sine", gain: 0.9 }); }
  finish()    {
    if (!this.enabled) return;
    [523, 659, 784, 1046].forEach((f, i) => {
      setTimeout(() => this._beep({ freq: f, duration: 0.18, type: "triangle", gain: 0.8 }), i * 90);
    });
  }
  newBest()   {
    if (!this.enabled) return;
    [660, 880, 1100, 1320].forEach((f, i) => {
      setTimeout(() => this._beep({ freq: f, duration: 0.15, type: "sine", gain: 0.9 }), i * 70);
    });
  }
}

window.soundEngine = new SoundEngine();
