// Enemies: Raiders (go for the stash, hate turrets, steal scrap), Mutants (hunt the player),
// Brutes (slow tanks that bash through walls), Scrap Drones (fly over everything and shoot).
//
// Wall lock-on: when a gate's cheapest route means smashing a wall, the gate locks onto that wall and
// every enemy from that gate goes for it until it falls, even if the maze changes. "Aggressive"
// enemies still break off to chase the player when the player gets close.
(function () {
  const C = SK.CONFIG, U = SK.U;

  function buildEnemy(type) {
    const g = new THREE.Group();
    const mats = [];
    const M = (color, opts) => {
      const m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, flatShading: true }, opts));
      mats.push(m);
      return m;
    };
    const body = new THREE.Group();
    g.add(body);
    let head, legL = null, legR = null;
    const rotors = [];

    if (type === 'raider') {
      const leather = M(0x5e4128), skin = M(0xb88660), cloth = M(U.pick([0xa0302a, 0x2a4ea0, 0x303030])),
            metal = M(0x55585c, { metalness: 0.6, roughness: 0.4 }), pants = M(0x3a3530);
      legL = U.box(0.18, 0.8, 0.2, pants, -0.12, 0.4, 0);
      legR = U.box(0.18, 0.8, 0.2, pants, 0.12, 0.4, 0);
      body.add(legL, legR);
      body.add(U.box(0.52, 0.62, 0.32, leather, 0, 1.12, 0));
      body.add(U.box(0.6, 0.12, 0.38, metal, 0, 1.4, 0));
      body.add(U.box(0.14, 0.55, 0.16, leather, -0.34, 1.1, 0));
      body.add(U.box(0.14, 0.55, 0.16, leather, 0.34, 1.1, -0.1));
      head = U.sphere(0.2, skin, 0, 1.64, 0);
      body.add(head);
      body.add(U.box(0.42, 0.14, 0.42, cloth, 0, 1.57, 0));
      body.add(U.box(0.3, 0.07, 0.08, metal, 0, 1.7, -0.18));
      body.add(U.box(0.07, 0.07, 0.9, metal, 0.34, 0.9, -0.4));
    }

    if (type === 'mutant') {
      const skin = M(0x7d9a3e), dark = M(0x4a5e24),
            eye = M(0xffee55, { emissive: 0xffcc00, emissiveIntensity: 1.5 });
      legL = U.box(0.16, 0.6, 0.18, dark, -0.13, 0.3, 0);
      legR = U.box(0.16, 0.6, 0.18, dark, 0.13, 0.3, 0);
      body.add(legL, legR);
      const torso = U.box(0.5, 0.5, 0.4, skin, 0, 0.85, -0.05);
      torso.rotation.x = 0.5;
      body.add(torso);
      body.add(U.sphere(0.2, dark, 0, 1.05, 0.1));
      head = U.sphere(0.24, skin, 0, 1.18, -0.28);
      body.add(head);
      body.add(U.sphere(0.05, eye, -0.09, 1.23, -0.49), U.sphere(0.05, eye, 0.09, 1.23, -0.49));
      for (const x of [-0.33, 0.33]) {
        const arm = U.box(0.12, 0.85, 0.12, skin, x, 0.72, -0.2);
        arm.rotation.x = 0.45;
        body.add(arm);
      }
    }

    if (type === 'brute') {
      const armor = M(0x5a5f6a), skin = M(0x9a7560), rust = M(0x8a4b2a),
            metal = M(0x3a3d42, { metalness: 0.6, roughness: 0.4 }),
            visor = M(0xff4020, { emissive: 0xff2000, emissiveIntensity: 2 });
      legL = U.box(0.38, 1.0, 0.42, armor, -0.3, 0.5, 0);
      legR = U.box(0.38, 1.0, 0.42, armor, 0.3, 0.5, 0);
      body.add(legL, legR);
      body.add(U.box(1.0, 0.5, 0.7, skin, 0, 1.15, 0));
      body.add(U.box(1.2, 1.0, 0.8, armor, 0, 1.75, 0));
      body.add(U.box(0.5, 0.35, 0.6, rust, -0.78, 2.2, 0), U.box(0.5, 0.35, 0.6, rust, 0.78, 2.2, 0));
      body.add(U.box(0.35, 1.0, 0.35, skin, -0.82, 1.5, 0), U.box(0.35, 1.0, 0.35, skin, 0.82, 1.5, -0.1));
      head = U.sphere(0.32, skin, 0, 2.5, 0);
      body.add(head);
      body.add(U.box(0.56, 0.3, 0.56, metal, 0, 2.62, 0));
      body.add(U.box(0.45, 0.07, 0.05, visor, 0, 2.52, -0.3));
      const handle = U.cyl(0.06, 0.06, 1.4, 6, metal, 0.85, 1.1, -0.5);
      handle.rotation.x = 1.2;
      body.add(handle);
      body.add(U.box(0.55, 0.45, 0.45, metal, 0.85, 0.9, -1.1));
    }

    if (type === 'drone') {
      const shell = M(0x4a4f55, { metalness: 0.6, roughness: 0.4 }), rust = M(0x8a4b2a),
            eye = M(0xff3020, { emissive: 0xff2010, emissiveIntensity: 2.5 }), blade = M(0x1c1c1c);
      head = U.box(0.7, 0.3, 0.7, shell, 0, 0, 0);
      body.add(head);
      body.add(U.box(0.4, 0.2, 0.4, rust, 0, -0.22, 0));
      body.add(U.sphere(0.1, eye, 0, 0, -0.37));
      body.add(U.cyl(0.03, 0.03, 0.4, 5, shell, 0, -0.45, -0.1));
      for (const [x, z] of [[-0.55, -0.55], [0.55, -0.55], [-0.55, 0.55], [0.55, 0.55]]) {
        const arm = U.box(0.5, 0.06, 0.08, shell, x / 2, 0.05, z / 2);
        arm.rotation.y = Math.atan2(z, x) * -1;
        body.add(arm);
        const r = U.box(0.6, 0.02, 0.08, blade, x, 0.14, z);
        r.castShadow = false;
        body.add(r);
        rotors.push(r);
      }
    }

    head.userData.isHead = true;
    return { g, body, mats, head, legL, legR, rotors };
  }

  class Enemy {
    constructor(type, pos, hpMul, gate) {
      this.type = type;
      this.def = C.ENEMIES[type];
      this.hp = this.maxHp = Math.round(this.def.hp * hpMul);
      // later rounds hit harder and move faster (see CONFIG.SCALING)
      this.damage = this.def.damage * SK.Waves.dmgMul();
      this.speed = this.def.speed * SK.Waves.speedMul();
      this.slowT = 0; // > 0 while wading through a Tar Pit
      this.pos = pos.clone();
      this.gate = gate || null;
      this.aggressive = Math.random() < (this.def.aggroChance || 0);
      this.chasing = false;
      this.yaw = 0;
      this.targetYaw = 0;
      this.attackCd = Math.random() * 0.5;
      this.flash = 0;
      this.lunge = 0;
      this.anim = Math.random() * 10;
      this.moving = false;
      this.orbit = Math.random() * Math.PI * 2;
      const m = buildEnemy(type);
      Object.assign(this, { mesh: m.g, body: m.body, mats: m.mats, legL: m.legL, legR: m.legR, rotors: m.rotors });
      U.tagRef(this.mesh, this);
      this.mesh.position.copy(this.pos);
      this.bar = SK.FX.makeBar(this.def.barW);
    }
  }

  const Enemies = {
    list: [],
    group: new THREE.Group(),
    _v: new THREE.Vector3(),
    _c: new THREE.Vector3(),
    _a: new THREE.Vector3(),

    init(scene) { scene.add(this.group); },

    spawn(type, pos, hpMul = 1, gate = null) {
      const e = new Enemy(type, pos, hpMul, gate);
      if (e.def.flying) e.pos.y = e.def.flyHeight;
      this.list.push(e);
      this.group.add(e.mesh);
      return e;
    },

    // Where to aim at this enemy (chest height, or the drone body).
    aimHeight(e) { return e.def.flying ? e.pos.y : e.def.height * 0.6; },

    damage(e, amount, hitPoint, isHead) {
      if (e.dead) return;
      e.hp -= amount;
      e.flash = 0.1;
      const col = e.type === 'mutant' ? 0x9acd32 : e.type === 'drone' ? 0xffaa33 : 0x8b1a1a;
      if (hitPoint) SK.FX.burst(hitPoint, col, isHead ? 6 : 3, 3, 0.08, 0.4);
      if (e.hp <= 0) this.kill(e);
    },

    remove(e) {
      e.dead = true;
      this.group.remove(e.mesh);
      e.mats.forEach((m) => m.dispose());
      SK.FX.removeBar(e.bar);
      this.list.splice(this.list.indexOf(e), 1);
    },

    kill(e) {
      this.remove(e);
      const p = this._v.set(e.pos.x, e.def.flying ? e.pos.y : e.def.height * 0.5, e.pos.z);
      SK.FX.burst(p, e.type === 'mutant' ? 0x6b8e23 : e.type === 'drone' ? 0x444444 : 0x6b1010, 14, 5, 0.14, 0.8);
      SK.Pickups.spawn(p, e.def.scrap);
      SK.SFX.play('enemyDie', e.pos);
      SK.Game.kills++;
    },

    // End of round: survivors retreat (no drops).
    clearAll() {
      for (const e of [...this.list]) {
        SK.FX.burst(this._v.set(e.pos.x, e.pos.y + 1, e.pos.z), 0x9a8a78, 8, 3, 0.3, 0.8);
        this.remove(e);
      }
    },

    // The wall this enemy's gate is locked onto, if any.
    lockFor(e) {
      if (!e.gate) return null;
      const l = e.def.wallBreaker ? e.gate.bruteLock : e.gate.lock;
      return l && !l.dead ? l : null;
    },

    update(dt) {
      for (let n = this.list.length - 1; n >= 0; n--) {
        const e = this.list[n];
        if (e.def.flying) this.thinkAir(e, dt);
        else this.think(e, dt);
      }

      // keep enemies from stacking, and push ground enemies off the player
      const L = this.list, P = SK.Player;
      for (let a = 0; a < L.length; a++) {
        const A = L[a];
        for (let b = a + 1; b < L.length; b++) {
          const B = L[b];
          if (!!A.def.flying !== !!B.def.flying) continue;
          const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z;
          const min = A.def.radius + B.def.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-6) {
            const d = Math.sqrt(d2), push = (min - d) * 0.5;
            A.pos.x -= (dx / d) * push; A.pos.z -= (dz / d) * push;
            B.pos.x += (dx / d) * push; B.pos.z += (dz / d) * push;
          }
        }
        if (P.alive && !A.def.flying) {
          const dx = A.pos.x - P.pos.x, dz = A.pos.z - P.pos.z;
          const min = A.def.radius + P.radius;
          const d2 = dx * dx + dz * dz;
          if (d2 < min * min && d2 > 1e-6 && P.pos.y < A.def.height) {
            const d = Math.sqrt(d2), push = min - d;
            A.pos.x += (dx / d) * push * 0.7; A.pos.z += (dz / d) * push * 0.7;
            P.pos.x -= (dx / d) * push * 0.3; P.pos.z -= (dz / d) * push * 0.3;
          }
        }
      }

      for (const e of L) {
        if (!e.def.flying) SK.Grid.resolveCircle(e.pos, e.def.radius);
        this.animate(e, dt);
      }
    },

    think(e, dt) {
      const def = e.def, G = SK.Grid, P = SK.Player;
      e.attackCd -= dt;
      let moveTo = null, attack = null;

      const pd = P.alive ? Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) : Infinity;
      const distStash = U.distToRect(e.pos.x, e.pos.z, 0, 0, G.S, G.S);
      // aggressive enemies chase you once you're close, and give up if you get far enough away
      const chaseRange = e.chasing ? def.aggro * 1.5 : def.aggro;

      if (pd < def.range + P.radius && P.pos.y < def.height) {
        attack = { kind: 'player', x: P.pos.x, z: P.pos.z };
      } else if (e.aggressive && pd < chaseRange && G.losClear(e.pos.x, e.pos.z, P.pos.x, P.pos.z)) {
        moveTo = P.pos;
        e.chasing = true;
      } else {
        e.chasing = false;
        // Raiders go after turrets that are right next to them.
        if (def.hatesTurrets) {
          for (const s of SK.Structures.list) {
            if ((s.type === 'turret' || s.type === 'flak') &&
                U.distToRect(e.pos.x, e.pos.z, s.pos.x, s.pos.z, 1, 1) < def.range + 0.3) {
              attack = { kind: 'struct', s, x: s.pos.x, z: s.pos.z };
              break;
            }
          }
        }
        const c = G.worldToCell(e.pos.x, e.pos.z);
        // Locked onto a wall? Go straight for it.
        const lock = attack ? null : this.lockFor(e);
        if (lock) {
          if (U.distToRect(e.pos.x, e.pos.z, lock.pos.x, lock.pos.z, 1, 1) < def.range + 0.2) {
            attack = { kind: 'struct', s: lock, x: lock.pos.x, z: lock.pos.z };
          } else {
            const nx = G.nextCellTo(c.i, c.j, lock);
            if (nx) moveTo = G.cellToWorld(nx.i, nx.j, this._c);
          }
        }
        if (!attack && !moveTo) {
          const flow = def.wallBreaker ? G.flowBrute : G.flowNormal;
          const nx = G.nextCell(c.i, c.j, flow);
          if (!nx) {
            if (distStash < def.range + 0.4) attack = { kind: 'stash', x: 0, z: 0 };
            else moveTo = SK.Stash.pos;
          } else {
            const k = G.idx(nx.i, nx.j);
            const s = G.structs[k];
            const center = G.cellToWorld(nx.i, nx.j, this._c);
            if (G.terrain[k] === G.STASH) {
              if (distStash < def.range + 0.2) attack = { kind: 'stash', x: 0, z: 0 };
              else moveTo = center;
            } else if (s && s.def.blocks) {
              if (U.distToRect(e.pos.x, e.pos.z, s.pos.x, s.pos.z, 1, 1) < def.range + 0.2)
                attack = { kind: 'struct', s, x: s.pos.x, z: s.pos.z };
              else moveTo = center;
            } else {
              moveTo = center;
            }
          }
        }
      }

      this.act(e, dt, moveTo, attack);
    },

    // Drones fly straight over walls toward the Stash, circle it and shoot.
    thinkAir(e, dt) {
      const def = e.def, P = SK.Player;
      e.attackCd -= dt;
      const pd = P.alive ? Math.hypot(P.pos.x - e.pos.x, P.pos.z - e.pos.z) : Infinity;
      const chaseRange = e.chasing ? def.aggro * 1.5 : def.aggro;
      let target, tx, tz, ty;

      if (e.aggressive && pd < chaseRange) {
        e.chasing = true;
        target = 'player'; tx = P.pos.x; tz = P.pos.z; ty = P.pos.y + 1.2;
      } else {
        e.chasing = false;
        target = 'stash'; tx = 0; tz = 0; ty = 2;
      }
      const dx = tx - e.pos.x, dz = tz - e.pos.z;
      const d = Math.hypot(dx, dz);
      e.targetYaw = U.yawTo(dx, dz);
      e.moving = false;

      if (d > def.range * 0.8) {
        const step = Math.min(d - def.range * 0.7, e.speed * dt);
        e.pos.x += (dx / d) * step;
        e.pos.z += (dz / d) * step;
        e.moving = true;
      } else {
        // strafe around the target while shooting
        e.orbit += dt * 0.6;
        e.pos.x += Math.cos(e.orbit) * dt * 1.5;
        e.pos.z += Math.sin(e.orbit) * dt * 1.5;
        if (e.attackCd <= 0) {
          e.attackCd = def.attackRate;
          const from = this._a.set(e.pos.x, e.pos.y - 0.3, e.pos.z);
          const to = this._v.set(tx, ty, tz);
          SK.FX.tracer(from, to, 0xff5030, 0.08);
          SK.SFX.play('turret', e.pos, 0.1);
          if (target === 'player') P.takeDamage(e.damage);
          else SK.Stash.damage(e.damage, e);
        }
      }
      e.pos.y = def.flyHeight + Math.sin(e.anim * 2) * 0.3;
      e.anim += dt;
      e.yaw = U.angleLerp(e.yaw, e.targetYaw, 1 - Math.exp(-6 * dt));
    },

    act(e, dt, moveTo, attack) {
      const def = e.def, P = SK.Player;
      e.moving = false;
      if (attack) {
        e.targetYaw = U.yawTo(attack.x - e.pos.x, attack.z - e.pos.z);
        if (e.attackCd <= 0) {
          e.attackCd = def.attackRate;
          e.lunge = 0.25;
          if (attack.kind === 'player') P.takeDamage(e.damage);
          else if (attack.kind === 'struct') SK.Structures.damage(attack.s, e.damage);
          else SK.Stash.damage(e.damage, e);
        }
      } else if (moveTo) {
        const dx = moveTo.x - e.pos.x, dz = moveTo.z - e.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.05) {
          const step = Math.min(d, e.speed * (e.slowT > 0 ? C.STRUCTURES.tar.slow : 1) * dt);
          e.pos.x += (dx / d) * step;
          e.pos.z += (dz / d) * step;
          e.targetYaw = U.yawTo(dx, dz);
          e.moving = true;
        }
      }
      e.yaw = U.angleLerp(e.yaw, e.targetYaw, 1 - Math.exp(-10 * dt));
    },

    animate(e, dt) {
      e.flash -= dt;
      e.slowT -= dt;
      e.lunge = Math.max(0, e.lunge - dt);
      if (e.def.flying) {
        for (const r of e.rotors) r.rotation.y += dt * 40;
        e.mesh.position.copy(e.pos);
        e.body.rotation.x = e.moving ? -0.25 : 0;
      } else {
        if (e.moving) e.anim += dt * e.def.speed * 2.2;
        const swing = e.moving ? Math.sin(e.anim) * 0.6 : 0;
        e.legL.rotation.x = swing;
        e.legR.rotation.x = -swing;
        e.mesh.position.set(e.pos.x, e.moving ? Math.abs(Math.sin(e.anim)) * 0.06 : 0, e.pos.z);
        e.body.position.z = -Math.sin((e.lunge / 0.25) * Math.PI) * 0.35;
      }
      e.mesh.rotation.y = e.yaw;
      const fl = e.flash > 0 ? 1 : 0;
      for (const m of e.mats) {
        if (m.userData.baseEmissive === undefined) {
          m.userData.baseEmissive = m.emissive.getHex();
          m.userData.baseIntensity = m.emissiveIntensity;
        }
        if (fl) { m.emissive.setHex(0xffffff); m.emissiveIntensity = 0.6; }
        else { m.emissive.setHex(m.userData.baseEmissive); m.emissiveIntensity = m.userData.baseIntensity; }
      }
      const barY = e.def.flying ? e.pos.y + 0.8 : e.def.height + 0.35;
      SK.FX.updateBar(e.bar, e.pos.x, barY, e.pos.z, e.hp / e.maxHp);
    }
  };

  SK.Enemies = Enemies;
})();
