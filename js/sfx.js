// Tiny synthesized sound effects (Web Audio) - no audio files needed.
SK.SFX = (function () {
  let ctx = null, master = null, noiseBuf = null;
  let vol = 1;
  const last = {};

  function init() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.35;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function noise(dur, freq, v, type = 'lowpass') {
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(master);
    src.start(t);
    src.stop(t + dur);
  }

  function tone(freq, dur, type = 'square', v = 0.2, slideTo) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(v * vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur);
  }

  const S = {
    shotgun() { noise(0.28, 1800, 0.9); tone(90, 0.18, 'sine', 0.6, 40); },
    hit() { tone(1100, 0.04, 'square', 0.07); },
    turret() { noise(0.07, 3200, 0.3); },
    build() { tone(220, 0.08, 'square', 0.15, 110); noise(0.12, 900, 0.35); },
    destroy() { noise(0.6, 500, 0.7); tone(70, 0.4, 'sawtooth', 0.2, 30); },
    pickup() { tone(700, 0.07, 'triangle', 0.12, 1200); },
    hurt() { tone(160, 0.2, 'sawtooth', 0.25, 70); },
    reload() { tone(300, 0.05, 'square', 0.08); setTimeout(() => ctx && tone(430, 0.05, 'square', 0.08), 160); },
    repair() { noise(0.06, 5000, 0.12, 'highpass'); },
    wave() { tone(110, 0.9, 'sawtooth', 0.25, 55); tone(165, 0.9, 'sawtooth', 0.15, 82); },
    clear() { tone(440, 0.15, 'triangle', 0.2); setTimeout(() => ctx && tone(660, 0.3, 'triangle', 0.2), 150); },
    error() { tone(140, 0.12, 'square', 0.12); },
    enemyDie() { tone(220, 0.25, 'sawtooth', 0.12, 50); },
    clank() { tone(180, 0.06, 'square', 0.1, 90); noise(0.05, 1500, 0.2); },
    stash() { tone(90, 0.15, 'square', 0.15, 60); }
  };

  // pos (optional): fades with distance from the player. throttle: min seconds between repeats.
  function play(name, pos, throttle = 0) {
    if (!ctx || !S[name]) return;
    const now = performance.now() / 1000;
    if (throttle && last[name] && now - last[name] < throttle) return;
    last[name] = now;
    vol = 1;
    if (pos && SK.Player) {
      const d = pos.distanceTo(SK.Player.pos);
      vol = Math.max(0.05, 1 - d / 45);
    }
    S[name]();
  }

  return { init, play };
})();
