// Minimap (corner) and full map (press M): terrain, gates, enemy routes, your gear, locked walls,
// scrap drops, enemies (ground + air) and you.
SK.Minimap = {
  big: false,
  bgKey: '',
  acc: 1, // start high so the first frame draws immediately
  pulse: 0,

  init() {
    this.canvas = document.getElementById('minimap');
    this.ctx = this.canvas.getContext('2d');
    this.bg = document.createElement('canvas');
    this.legend = document.getElementById('map-legend');
    this.resize();
    window.addEventListener('resize', () => this.resize());
  },

  toggle() {
    this.big = !this.big;
    this.canvas.classList.toggle('big', this.big);
    this.legend.classList.toggle('hidden', !this.big);
    this.resize();
  },

  resize() {
    const size = this.big ? Math.floor(Math.min(640, window.innerHeight - 140, window.innerWidth - 40)) : 200;
    this.canvas.width = this.canvas.height = size;
    this.px = size / SK.Grid.N;
    this.bgKey = '';
  },

  toMap(x, z) {
    const G = SK.Grid;
    return [((x + G.HALF) / G.S) * this.px, ((z + G.HALF) / G.S) * this.px];
  },

  cellCenter(c) { return [(c.i + 0.5) * this.px, (c.j + 0.5) * this.px]; },

  // Static terrain layer, redrawn only when the terrain or map size changes.
  renderBg() {
    const G = SK.Grid, N = G.N, px = this.px;
    const size = this.canvas.width;
    this.bg.width = this.bg.height = size;
    const b = this.bg.getContext('2d');
    b.fillStyle = '#7a6148';
    b.fillRect(0, 0, size, size);
    const R = SK.U.rng(G.terrainVersion || 1);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = G.idx(i, j);
        if (G.terrain[k] === G.ROCK) {
          const v = 30 + Math.floor(R() * 18);
          b.fillStyle = `rgb(${v + 14},${v + 4},${v - 4})`;
          b.fillRect(i * px, j * px, px + 0.5, px + 0.5);
        } else if (G.terrain[k] === G.STASH) {
          b.fillStyle = '#ffb347';
          b.fillRect(i * px, j * px, px + 0.5, px + 0.5);
        } else if (R() < 0.15) {
          b.fillStyle = 'rgba(0,0,0,0.06)';
          b.fillRect(i * px, j * px, px, px);
        }
      }
    }
    if (this.big) {
      b.strokeStyle = 'rgba(255,220,160,0.07)';
      b.lineWidth = 1;
      for (let n = 0; n <= N; n++) {
        b.beginPath(); b.moveTo(n * px, 0); b.lineTo(n * px, size); b.stroke();
        b.beginPath(); b.moveTo(0, n * px); b.lineTo(size, n * px); b.stroke();
      }
    }
    this.bgKey = `${G.terrainVersion}:${size}`;
  },

  update(dt) {
    this.pulse += dt;
    this.acc += dt;
    if (this.acc < 1 / 20) return; // 20 fps is plenty for a map
    this.acc = 0;
    this.draw();
  },

  draw() {
    const G = SK.Grid, W = SK.Waves, ctx = this.ctx, px = this.px;
    if (this.bgKey !== `${G.terrainVersion}:${this.canvas.width}`) this.renderBg();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.drawImage(this.bg, 0, 0);
    const blink = 0.5 + 0.5 * Math.sin(this.pulse * 6);
    const lw = this.big ? 2 : 1.3;

    // --- routes ---
    G.updateRoutes();
    const hot = W.hotGates();
    const line = (cells, style, width, dash) => {
      if (cells.length < 2) return;
      ctx.strokeStyle = style;
      ctx.lineWidth = width;
      ctx.setLineDash(dash);
      ctx.beginPath();
      cells.forEach((c, n) => { const [x, y] = this.cellCenter(c); n ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    };
    for (const g of G.gates) {
      const isHot = hot.includes(g);
      if (!isHot) { line(g.route, 'rgba(230,215,190,0.25)', 1, [2, 3]); continue; }
      line(g.bruteRoute, 'rgba(192,80,255,0.55)', lw, [3, 3]);
      line(g.route, 'rgba(255,160,48,0.95)', lw * 1.3, [5, 3]);
      if (W.expectsAir()) {
        const [gx, gy] = this.toMap(g.center.x, g.center.z), [sx, sy] = this.toMap(0, 0);
        ctx.strokeStyle = 'rgba(102,200,255,0.7)';
        ctx.lineWidth = lw;
        ctx.setLineDash([2, 4]);
        ctx.beginPath(); ctx.moveTo(gx, gy); ctx.lineTo(sx, sy); ctx.stroke();
      }
    }
    ctx.setLineDash([]);

    // --- gates ---
    for (const g of G.gates) {
      const [x, y] = this.toMap(g.center.x, g.center.z);
      const isHot = hot.includes(g);
      ctx.fillStyle = isHot ? `rgba(255,60,40,${0.5 + blink * 0.5})` : 'rgba(160,60,40,0.6)';
      ctx.fillRect(x - px * 1.5, y - px * 0.5, px * 3, px);
      if (isHot) {
        ctx.strokeStyle = `rgba(255,80,60,${0.3 + blink * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, px * (2 + blink), 0, Math.PI * 2); ctx.stroke();
      }
    }

    // --- your gear ---
    for (const s of SK.Structures.list) {
      const x = s.i * px, y = s.j * px;
      const r = s.hp / s.maxHp;
      if (s.type === 'wreck' || s.type === 'container') {
        ctx.fillStyle = s.type === 'wreck' ? '#b9a88e' : '#4f86b8';
        ctx.fillRect(x + 0.5, y + 0.5, px - 1, px - 1);
      } else if (s.type === 'turret') {
        ctx.fillStyle = '#7ddc5a';
        ctx.beginPath(); ctx.arc(x + px / 2, y + px / 2, px * 0.45, 0, Math.PI * 2); ctx.fill();
      } else if (s.type === 'flak') {
        ctx.fillStyle = '#66e0ff';
        ctx.beginPath();
        ctx.moveTo(x + px / 2, y); ctx.lineTo(x + px, y + px / 2); ctx.lineTo(x + px / 2, y + px); ctx.lineTo(x, y + px / 2);
        ctx.fill();
      } else if (s.type === 'spikes') {
        ctx.strokeStyle = '#d0d0d0';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(x + 1, y + 1); ctx.lineTo(x + px - 1, y + px - 1);
        ctx.moveTo(x + px - 1, y + 1); ctx.lineTo(x + 1, y + px - 1);
        ctx.stroke();
      } else if (s.type === 'tar') {
        ctx.fillStyle = '#1a120c';
        ctx.fillRect(x + 0.5, y + 0.5, px - 1, px - 1);
        ctx.strokeStyle = 'rgba(150,130,110,0.7)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, px - 1, px - 1);
      } else if (s.type === 'mine') {
        ctx.fillStyle = '#ff3a2a';
        ctx.beginPath(); ctx.arc(x + px / 2, y + px / 2, px * 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255,58,42,${0.3 + blink * 0.4})`;
        ctx.beginPath(); ctx.arc(x + px / 2, y + px / 2, px * 0.55, 0, Math.PI * 2); ctx.stroke();
      }
      if (r < 0.999) { // damage tint
        ctx.fillStyle = `rgba(255,40,20,${(1 - r) * 0.6})`;
        ctx.fillRect(x, y, px, px);
      }
    }

    // --- walls a gate is locked onto ---
    if (W.phase === 'combat') {
      for (const g of W.activeGates) {
        for (const l of [g.lock, g.bruteLock]) {
          if (!l || l.dead) continue;
          ctx.strokeStyle = `rgba(255,30,20,${0.4 + blink * 0.6})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(l.i * px - 1, l.j * px - 1, px + 2, px + 2);
        }
      }
    }

    // --- scrap drops ---
    ctx.fillStyle = '#4fb8ff';
    ctx.shadowColor = '#4fb8ff';
    ctx.shadowBlur = 6;
    const pr = this.big ? 3 : 2;
    for (const p of SK.Pickups.list) {
      const [x, y] = this.toMap(p.m.position.x, p.m.position.z);
      ctx.beginPath(); ctx.arc(x, y, pr, 0, Math.PI * 2); ctx.fill();
    }
    ctx.shadowBlur = 0;

    // --- enemies ---
    for (const e of SK.Enemies.list) {
      const [x, y] = this.toMap(e.pos.x, e.pos.z);
      if (e.def.flying) {
        ctx.fillStyle = '#ff7ad9';
        const r = px * 0.6;
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.fill();
      } else {
        ctx.fillStyle = e.type === 'brute' ? '#b01010' : e.type === 'mutant' ? '#a8e04a' : '#ff4a3a';
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1.6, e.def.radius * px * 0.7), 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // --- you ---
    const P = SK.Player;
    if (P.alive) {
      const [x, y] = this.toMap(P.pos.x, P.pos.z);
      const r = this.big ? 9 : 6;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-P.yaw);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(0, -r); ctx.lineTo(r * 0.7, r * 0.8); ctx.lineTo(0, r * 0.4); ctx.lineTo(-r * 0.7, r * 0.8);
      ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
    }
  }
};
