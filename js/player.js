// The player: movement, health, respawn, and the first-person / third-person camera.
(function () {
  const C = SK.CONFIG, PC = C.PLAYER, U = SK.U;
  const SPAWN = new THREE.Vector3(0, 0, 6);

  SK.Player = {
    pos: SPAWN.clone(),
    vel: new THREE.Vector3(),
    yaw: 0,
    pitch: -0.1,
    onGround: true,
    radius: PC.radius,
    hp: PC.maxHp,
    maxHp: PC.maxHp,
    alive: true,
    respawnTimer: 0,
    sinceHit: 99,
    view: 'fps',
    walkPhase: 0,
    speedNow: 0,
    camDist: 0,
    mesh: null,
    handR: null,
    raycaster: new THREE.Raycaster(),
    _pivot: new THREE.Vector3(),
    _fwd: new THREE.Vector3(),
    _right: new THREE.Vector3(),
    _dir: new THREE.Vector3(),

    init(scene, camera) {
      this.camera = camera;
      const g = new THREE.Group();
      const jacket = U.mat(0x5a6b3a), pants = U.mat(0x3b3a36), skin = U.mat(0xd1a17a),
            metal = U.mat(0x444a50, { metalness: 0.6, roughness: 0.4 }), scarf = U.mat(0xa33b2a),
            pack = U.mat(0x7a5a3a);

      const leg = (x) => {
        const hip = new THREE.Group();
        hip.position.set(x, 0.82, 0);
        hip.add(U.box(0.2, 0.82, 0.22, pants, 0, -0.41, 0));
        g.add(hip);
        return hip;
      };
      this.legL = leg(-0.12);
      this.legR = leg(0.12);
      g.add(U.box(0.5, 0.66, 0.3, jacket, 0, 1.15, 0));
      g.add(U.box(0.4, 0.5, 0.22, pack, 0, 1.18, 0.25));
      g.add(U.box(0.36, 0.1, 0.32, scarf, 0, 1.47, 0));
      g.add(U.sphere(0.18, skin, 0, 1.64, 0));
      g.add(U.box(0.3, 0.08, 0.1, metal, 0, 1.68, -0.15));
      g.add(U.cyl(0.2, 0.21, 0.12, 10, metal, 0, 1.78, 0));

      const arm = (x) => {
        const sh = new THREE.Group();
        sh.position.set(x, 1.4, 0);
        sh.add(U.box(0.14, 0.6, 0.14, jacket, 0, -0.3, 0));
        g.add(sh);
        return sh;
      };
      this.armR = arm(0.3);
      this.armL = arm(-0.3);
      this.handR = new THREE.Object3D();
      this.handR.position.set(0, -0.58, 0);
      this.handR.rotation.x = -Math.PI / 2;
      this.armR.add(this.handR);

      g.visible = false;
      this.mesh = g;
      scene.add(g);
    },

    toggleView() {
      this.view = this.view === 'fps' ? 'tps' : 'fps';
      SK.HUD.message(this.view === 'fps' ? 'First-person view' : 'Third-person view');
    },

    takeDamage(n) {
      if (!this.alive) return;
      this.hp -= n * SK.Upgrades.armorMul();
      this.sinceHit = 0;
      SK.SFX.play('hurt', null, 0.15);
      SK.HUD.damageFlash();
      if (this.hp <= 0) this.die();
    },

    die() {
      this.alive = false;
      this.hp = 0;
      this.respawnTimer = PC.respawn;
      const lost = Math.floor(SK.Game.scrap * 0.2);
      SK.Game.scrap -= lost;
      SK.Deaths = (SK.Deaths || 0) + 1;
      SK.HUD.message(`You went down! Lost ${lost} scrap`, 'bad');
      SK.FX.burst(this._pivot.copy(this.pos).setY(1), 0x8b1a1a, 20, 5, 0.12, 1);
      this.mesh.visible = false;
    },

    respawn(quiet) {
      this.alive = true;
      this.hp = this.maxHp;
      this.placeAtFreeSpot();
      this.vel.set(0, 0, 0);
      if (!quiet) SK.HUD.message('Back in action!', 'good');
    },

    // Put the player on the nearest open cell to the spawn point (you may have built on it).
    placeAtFreeSpot() {
      const G = SK.Grid;
      const c0 = G.worldToCell(SPAWN.x, SPAWN.z);
      for (let r = 0; r < 12; r++) {
        for (let dj = -r; dj <= r; dj++) {
          for (let di = -r; di <= r; di++) {
            if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
            const i = c0.i + di, j = c0.j + dj;
            if (G.walkable(i, j) && !G.gateSet.has(G.idx(i, j))) {
              G.cellToWorld(i, j, this.pos);
              this.vel.set(0, 0, 0);
              return;
            }
          }
        }
      }
      this.pos.copy(SPAWN);
    },

    update(dt) {
      const I = SK.Input;
      if (!this.alive) {
        this.respawnTimer -= dt;
        if (this.respawnTimer <= 0) this.respawn();
        return;
      }

      this.yaw -= I.mouse.dx * C.MOUSE_SENS;
      this.pitch = U.clamp(this.pitch - I.mouse.dy * C.MOUSE_SENS, -1.45, 1.45);

      let f = 0, r = 0;
      if (I.down('KeyW')) f++;
      if (I.down('KeyS')) f--;
      if (I.down('KeyD')) r++;
      if (I.down('KeyA')) r--;
      const sprint = (I.down('ShiftLeft') || I.down('ShiftRight')) && f > 0;
      const spd = (sprint ? PC.sprint : PC.speed) * SK.Upgrades.speedMul();
      const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
      const rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
      let wx = fx * f + rx * r, wz = fz * f + rz * r;
      const wl = Math.hypot(wx, wz);
      if (wl > 0) { wx /= wl; wz /= wl; }

      const t = 1 - Math.exp(-(this.onGround ? 14 : 3) * dt);
      this.vel.x += (wx * spd - this.vel.x) * t;
      this.vel.z += (wz * spd - this.vel.z) * t;
      if (this.onGround && I.justPressed('Space')) { this.vel.y = PC.jump; this.onGround = false; }
      this.vel.y -= PC.gravity * dt;

      this.pos.x += this.vel.x * dt;
      this.pos.z += this.vel.z * dt;
      this.pos.y += this.vel.y * dt;
      if (this.pos.y <= 0) { this.pos.y = 0; this.vel.y = 0; this.onGround = true; }
      SK.Grid.resolveCircle(this.pos, this.radius);

      this.speedNow = Math.hypot(this.vel.x, this.vel.z);
      this.walkPhase += this.speedNow * dt * 1.4;

      this.sinceHit += dt;
      if (this.sinceHit > PC.regenDelay) this.hp = Math.min(this.maxHp, this.hp + PC.regenRate * dt);

      // third-person body animation
      const swing = this.onGround ? Math.sin(this.walkPhase * 2) * 0.7 * Math.min(1, this.speedNow / 5) : 0.3;
      this.legL.rotation.x = swing;
      this.legR.rotation.x = -swing;
      this.armR.rotation.x = Math.PI / 2 + this.pitch;
      this.armL.rotation.x = Math.PI / 2.4 + this.pitch;
      this.armL.rotation.z = -0.5;
    },

    updateCamera() {
      const cam = this.camera;
      cam.rotation.order = 'YXZ';
      cam.rotation.set(this.pitch, this.yaw, 0);
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.y = this.yaw;

      if (this.view === 'fps') {
        const bob = this.onGround ? Math.sin(this.walkPhase * 2) * 0.05 * Math.min(1, this.speedNow / 6) : 0;
        cam.position.set(this.pos.x, this.pos.y + PC.eye + bob, this.pos.z);
        this.mesh.visible = false;
        this.camDist = 0;
        return;
      }

      // Over-the-shoulder camera, pulled in if something is in the way.
      const pivot = this._pivot.set(this.pos.x, this.pos.y + 1.65, this.pos.z);
      const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
      const fwd = this._fwd.set(-Math.sin(this.yaw) * cp, sp, -Math.cos(this.yaw) * cp);
      const right = this._right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const dir = this._dir.copy(right).multiplyScalar(0.75).addScaledVector(fwd, -3.8);
      const len = dir.length();
      dir.divideScalar(len);
      this.raycaster.set(pivot, dir);
      this.raycaster.far = len;
      const hits = this.raycaster.intersectObjects(SK.World.solids, true);
      const dist = hits.length ? Math.max(0.3, hits[0].distance - 0.25) : len;
      cam.position.copy(pivot).addScaledVector(dir, dist);
      cam.position.y = Math.max(cam.position.y, 0.25);
      this.mesh.visible = this.alive;
      this.camDist = dist;
    }
  };
})();
