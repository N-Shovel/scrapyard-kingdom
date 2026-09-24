// Scrap dropped by enemies. Walk near it to collect (it's magnetic).
SK.Pickups = {
  list: [],
  geo: null,
  mat: null,

  init(scene) {
    this.scene = scene;
    this.geo = new THREE.OctahedronGeometry(0.24);
    // glowing blue crystal so drops stand out on the ground and on the map
    this.mat = new THREE.MeshStandardMaterial({ color: 0x5ab8ff, metalness: 0.3, roughness: 0.25,
                                                emissive: 0x1a7cff, emissiveIntensity: 1.6, flatShading: true });
    // soft additive halo around each drop (a sprite, much cheaper than a real light per drop)
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(120,200,255,0.9)');
    g.addColorStop(0.35, 'rgba(60,150,255,0.35)');
    g.addColorStop(1, 'rgba(40,120,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 64);
    this.glowMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true,
                                              blending: THREE.AdditiveBlending, depthWrite: false });
  },

  spawn(pos, amount) {
    const m = new THREE.Mesh(this.geo, this.mat);
    m.position.copy(pos);
    m.castShadow = true;
    const glow = new THREE.Sprite(this.glowMat);
    glow.scale.setScalar(1.3);
    m.add(glow);
    this.scene.add(m);
    // drops never expire: anything left on the ground is auto-collected when the round ends
    this.list.push({ m, amount, t: Math.random() * 6,
                     v: new THREE.Vector3(SK.U.rand(-2, 2), 4, SK.U.rand(-2, 2)) });
  },

  remove(p) {
    this.scene.remove(p.m);
    this.list.splice(this.list.indexOf(p), 1);
  },

  collectAll() {
    let total = 0;
    for (const p of [...this.list]) { total += p.amount; this.remove(p); }
    if (total) {
      SK.Game.addScrap(total);
      SK.HUD.message(`Collected all leftover drops: +${total} scrap`, "good", 3);
    }
  },

  update(dt) {
    const P = SK.Player;
    for (let n = this.list.length - 1; n >= 0; n--) {
      const p = this.list[n];
      p.t += dt;
      const pos = p.m.position;
      const dx = P.pos.x - pos.x, dy = P.pos.y + 0.9 - pos.y, dz = P.pos.z - pos.z;
      const d = Math.hypot(dx, dy, dz);

      if (P.alive && d < 6) {
        const pull = 14 * (1 - d / 6) + 4;
        p.v.set((dx / d) * pull, (dy / d) * pull, (dz / d) * pull);
      } else {
        p.v.x *= Math.exp(-3 * dt);
        p.v.z *= Math.exp(-3 * dt);
        p.v.y -= 15 * dt;
      }
      pos.addScaledVector(p.v, dt);
      if (pos.y < 0.35) { pos.y = 0.35 + Math.sin(p.t * 3) * 0.05; p.v.y = Math.max(0, p.v.y); }
      p.m.rotation.y += dt * 3;
      p.m.rotation.x += dt * 1.5;

      if (P.alive && d < 1.1) {
        SK.Game.addScrap(p.amount);
        SK.SFX.play('pickup', null, 0.04);
        this.remove(p);
      }
    }
  }
};
