/* ============ 最后一片大陆 · WebAudio 合成音频 ============ */
window.AudioEngine = (function () {
  'use strict';
  let ctx = null, master = null, musicBus = null, sfxBus = null;
  let noiseBuf = null, muted = false, started = false;
  let chordTimer = null, bellTimer = null, windNodes = null;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.85;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 6;
    master.connect(comp); comp.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
    sfxBus = ctx.createGain(); sfxBus.gain.value = 0.9; sfxBus.connect(master);
    const len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  function setMuted(m) {
    muted = m;
    if (master) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(m ? 0 : 0.85, t + 0.25);
    }
  }

  function tone(freq, dur, type, vol, slideTo, delay) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(0.02, dur * 0.3));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  function noise(dur, fType, freq, vol, q, delay, sweepTo) {
    if (!ctx || muted || !noiseBuf) return;
    const t0 = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource(); src.buffer = noiseBuf;
    src.loop = true; src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter(); f.type = fType || 'bandpass';
    f.frequency.setValueAtTime(freq, t0); f.Q.value = q || 1;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + dur * 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(sfxBus);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  function arp(notes, step, dur, type, vol) {
    notes.forEach((n, i) => tone(n, dur, type || 'sine', vol || 0.12, null, i * step));
  }

  /* ---- 环境音乐：柔和垫底和弦 + 风声 + 偶发风铃 ---- */
  const CHORDS = [
    [261.63, 329.63, 392.00, 493.88],
    [220.00, 261.63, 329.63, 392.00],
    [174.61, 220.00, 261.63, 329.63],
    [196.00, 246.94, 293.66, 392.00]
  ];
  let chordIdx = 0;

  function playChord() {
    if (!ctx || muted) return;
    const notes = CHORDS[chordIdx % CHORDS.length]; chordIdx++;
    const t0 = ctx.currentTime;
    notes.forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 8;
      lp.type = 'lowpass'; lp.frequency.value = 1100;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(0.045, t0 + 2.2);
      g.gain.linearRampToValueAtTime(0.0001, t0 + 7.4);
      o.connect(lp); lp.connect(g); g.connect(musicBus);
      o.start(t0); o.stop(t0 + 7.6);
    });
  }

  const BELLS = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.5];
  function playBell() {
    if (!ctx || muted) return;
    const f = BELLS[Math.floor(Math.random() * BELLS.length)];
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.035, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.6);
    o.connect(g); g.connect(musicBus);
    o.start(t0); o.stop(t0 + 2.8);
  }

  function startWind() {
    if (!ctx || windNodes) return;
    const src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6;
    const g = ctx.createGain(); g.gain.value = 0.018;
    const lfo = ctx.createOscillator(), lg = ctx.createGain();
    lfo.frequency.value = 0.08; lg.gain.value = 0.01;
    lfo.connect(lg); lg.connect(g.gain);
    src.connect(bp); bp.connect(g); g.connect(musicBus);
    src.start(); lfo.start();
    windNodes = { src, lfo };
  }

  function startAmbient() {
    if (!ensure()) return;
    resume();
    if (started) return;
    started = true;
    startWind();
    playChord();
    chordTimer = setInterval(playChord, 7000);
    bellTimer = setInterval(() => { if (Math.random() < 0.6) playBell(); }, 5200);
  }

  /* ---- 音效：全部绑定可见事件 ---- */
  const sfx = {
    click()    { tone(680, 0.07, 'sine', 0.09, 920); },
    hover()    { tone(1200, 0.03, 'sine', 0.025); },
    explore()  { noise(0.4, 'bandpass', 320, 0.14, 0.8, 0, 2200); arp([523.25, 783.99], 0.09, 0.3, 'sine', 0.11); },
    plant()    { tone(300, 0.13, 'sine', 0.13, 620); noise(0.1, 'highpass', 2600, 0.05, 0.7); },
    build()    { tone(170, 0.12, 'triangle', 0.16, 120); arp([392, 523.25], 0.07, 0.26, 'triangle', 0.1); },
    chop()     { noise(0.13, 'lowpass', 1300, 0.18, 0.6); tone(210, 0.09, 'square', 0.07, 130); },
    mine()     { noise(0.07, 'highpass', 2400, 0.12, 1); noise(0.07, 'highpass', 3000, 0.1, 1, 0.09); tone(880, 0.1, 'sine', 0.08, 660, 0.02); },
    rule()     { arp([523.25, 659.25, 783.99, 1046.5], 0.09, 0.5, 'sine', 0.13); noise(0.7, 'highpass', 4000, 0.04, 0.5, 0.1); },
    task()     { arp([783.99, 1046.5], 0.1, 0.34, 'sine', 0.13); },
    discover() { arp([659.25, 880, 1174.66], 0.08, 0.4, 'triangle', 0.11); },
    crystal()  { arp([1046.5, 1318.5, 1567.98, 2093], 0.07, 0.5, 'sine', 0.1); noise(0.6, 'highpass', 6000, 0.03, 0.4); },
    win()      { arp([523.25, 659.25, 783.99, 1046.5, 1318.5], 0.12, 0.8, 'sine', 0.14); arp([261.63, 329.63, 392], 0, 1.6, 'triangle', 0.07); noise(1.2, 'highpass', 5000, 0.03, 0.4, 0.2); },
    error()    { tone(180, 0.18, 'sine', 0.1, 120); },
    demolish() { noise(0.18, 'lowpass', 900, 0.12, 0.6); tone(140, 0.14, 'triangle', 0.08, 90); },
    terra()    { tone(120, 0.4, 'triangle', 0.13, 240); noise(0.5, 'lowpass', 600, 0.08, 0.5, 0, 1800); },
    start()    { arp([392, 523.25, 659.25], 0.1, 0.5, 'sine', 0.12); }
  };

  function play(name) { if (sfx[name]) { resume(); sfx[name](); } }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    if (document.hidden) ctx.suspend(); else resume();
  });

  return { ensure, resume, setMuted, startAmbient, play, isMuted: () => muted };
})();