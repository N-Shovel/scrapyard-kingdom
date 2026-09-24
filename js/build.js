// Placing / picking up gear on the grid, plus the route preview.
// Works in two modes:
//  - Top-down prep phase: always on, aim with the mouse cursor. Slot 6 = repair tool.
//  - Combat (first/third person): toggle with B, aim with the crosshair.
// Placing uses an item from your inventory; if you have none of that type, it buys a new one with scrap.
(function () {
  const C = SK.CONFIG, U = SK.U;

  SK.Build = {
    active: false,      // build mode in first/third person
    selected: 'wreck',  // a structure type, or 'repair' (prep only)
    target: null,       // { i, j, valid, reason, struct, point }
    lastPlaced: -1,
    pathVersion: -1,
    pathLines: [],
    raycaster: new THREE.Raycaster(),
    plane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    _p: new THREE.Vector3(),
    _c: new THREE.Vector3(),

    init(scene) {
      this.scene = scene;
      const S = SK.Grid.S;
      this.ghostMat = new THREE.MeshBasicMaterial({ color: 0x44ff66, transparent: true, opacity: 0.35, depthWrite: false });
      this.ghost = new THREE.Mesh(new THREE.BoxGeometry(S * 0.98, 1, S * 0.98), this.ghostMat);
      this.ghost.visible = false;
      scene.add(this.ghost);
      this.ghost.add(new THREE.LineSegments(
        new THREE.EdgesGeometry(new THREE.BoxGeometry(S * 0.98, 1, S * 0.98)),
        new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8 })));

      // range preview: where the selected turret/mine would reach, or a hovered turret's reach
      this.rangeRing = SK.Structures.makeRangeRing(0xffffff, 0.9, 0.1);
      this.rangeRing.visible = false;
      scene.add(this.rangeRing);

      this.gridHelper = new THREE.GridHelper(SK.Grid.N * S, SK.Grid.N, 0xffd27a, 0xffd27a);
      this.gridHelper.material.transparent = true;
      this.gridHelper.material.opacity = 0.18;
      this.gridHelper.position.y = 0.02;
      this.gridHelper.visible = false;
      scene.add(this.gridHelper);
      this.pathGroup = new THREE.Group();
      scene.add(this.pathGroup);
    },

    isPrep() { return SK.Game.state === 'prep'; },
    isOn() { return this.isPrep() || this.active; },

    toggle() {
      if (!SK.Player.alive) return;
      this.active = !this.active;
      this.lastPlaced = -1;
      if (this.selected === 'repair') this.selected = 'wreck';
      SK.HUD.message(this.active ? 'BUILD MODE: press B to exit' : 'Combat mode');
    },

    // slots: 1-5 structures, 6 = repair (top-down only)
    select(idx) {
      if (idx === C.BUILD_ORDER.length) { if (this.isPrep()) this.selected = 'repair'; return; }
      const t = C.BUILD_ORDER[idx];
      if (t) this.selected = t;
    },

    cycle(dir) {
      const opts = this.isPrep() ? [...C.BUILD_ORDER, 'repair'] : C.BUILD_ORDER;
      const i = Math.max(0, opts.indexOf(this.selected));
      this.selected = opts[(i + dir + opts.length * 4) % opts.length];
    },

    canAfford(type) {
      return SK.Inventory.count(type) > 0 || SK.Game.scrap >= C.STRUCTURES[type].cost;
    },

    // Which cell is being pointed at, and can we build there?
    findTarget() {
      const G = SK.Grid, P = SK.Player, cam = SK.World.camera, prep = this.isPrep();
      this.raycaster.setFromCamera(prep ? SK.Input.mouseNDC() : { x: 0, y: 0 }, cam);
      this.raycaster.far = 200;
      let point = null, struct = null;
      const hits = this.raycaster.intersectObjects([SK.Structures.group], true);
      if (hits.length) { struct = U.findRef(hits[0].object); point = hits[0].point.clone(); }
      else point = this.raycaster.ray.intersectPlane(this.plane, this._p);
      if (!point) return null;
      const cellPoint = struct ? struct.pos : point;

      const { i, j } = G.worldToCell(cellPoint.x, cellPoint.z);
      if (!G.inBounds(i, j)) return null;
      const center = G.cellToWorld(i, j, this._c);
      const k = G.idx(i, j);
      const t = { i, j, valid: true, reason: '', struct: G.structs[k], point: point.clone() };
      if (this.selected === 'repair') return t;

      const def = C.STRUCTURES[this.selected];
      const fail = (r) => { t.valid = false; t.reason = t.reason || r; };
      if (!prep && Math.hypot(center.x - P.pos.x, center.z - P.pos.z) > C.BUILD_RANGE) fail('Too far away');
      if (G.terrain[k] !== G.EMPTY) fail('Can\'t build on junk');
      if (t.struct) fail('Occupied');
      if (G.gateSet.has(k)) fail('Gates must stay open');
      if (def.blocks) {
        if (!prep && U.distToRect(P.pos.x, P.pos.z, center.x, center.z, 1, 1) < P.radius) fail('You\'re standing there');
        for (const e of SK.Enemies.list)
          if (!e.def.flying && U.distToRect(e.pos.x, e.pos.z, center.x, center.z, 1, 1) < e.def.radius) {
            fail('Enemy in the way'); break;
          }
      }
      if (!this.canAfford(this.selected)) fail('None in inventory and not enough scrap');
      return t;
    },

    place() {
      const t = this.target;
      if (!t) return;
      if (!t.valid) {
        if (SK.Input.mouse.leftPressed) { SK.HUD.message(t.reason, 'bad', 1); SK.SFX.play('error'); }
        return;
      }
      const type = this.selected, def = C.STRUCTURES[type];
      let hp = SK.Inventory.take(type);
      if (hp === null) {
        if (!SK.Game.spend(def.cost)) return;
        hp = def.hp;
        SK.HUD.message(`Bought a ${def.name} (-${def.cost} scrap)`, '', 1.2);
      }
      const s = SK.Structures.create(type, t.i, t.j, hp);
      this.lastPlaced = SK.Grid.idx(t.i, t.j);
      SK.FX.burst(this._p.copy(s.pos).setY(0.3), 0xc8a070, 8, 3, 0.12, 0.5);
      SK.SFX.play('build');
    },

    // Pick a placed structure back up into the inventory (keeps its HP).
    pickUp() {
      const t = this.target;
      if (!t || !t.struct) return;
      const s = t.struct;
      SK.Inventory.add(s.type, Math.ceil(s.hp));
      SK.Structures.destroy(s, true);
      SK.FX.burst(this._p.copy(s.pos).setY(0.5), 0x8a4b2a, 10, 4, 0.18, 0.6);
      SK.SFX.play('clank');
      SK.HUD.message(`Picked up ${s.def.name} → inventory`, 'good', 1.2);
    },

    update(dt) {
      const I = SK.Input, prep = this.isPrep();
      const on = this.isOn() && SK.Player.alive;
      this.pathGroup.visible = on;
      if (on && this.pathVersion !== SK.Grid.version) this.refreshPaths();
      this.gridHelper.visible = on;
      SK.Structures.rangeGroup.visible = on;
      this.rangeRing.visible = false;

      if (!SK.Player.alive) this.active = false;
      if (!on) {
        this.ghost.visible = false;
        this.target = null;
        return;
      }
      if (!prep && this.selected === 'repair') this.selected = 'wreck';

      const slots = C.BUILD_ORDER.length + (prep ? 1 : 0);
      for (let n = 0; n < slots; n++)
        if (I.justPressed('Digit' + (n + 1))) this.select(n);
      if (I.mouse.wheel && !prep) this.cycle(I.mouse.wheel);
      if (prep && (I.justPressed('KeyQ') || I.justPressed('KeyE'))) this.cycle(I.justPressed('KeyE') ? 1 : -1);

      this.target = this.findTarget();
      const t = this.target;
      if (!t) { this.ghost.visible = false; return; }

      // repair tool (top-down): hold LMB on a damaged structure
      if (this.selected === 'repair') {
        this.ghost.visible = !!t.struct;
        if (t.struct) { this.showGhost(t, 0x66e0ff); this.showRange(t); }
        if (t.struct && I.mouse.left) SK.Weapons.repairStruct(t.struct, dt, t.point, null);
        if (I.mouse.rightPressed) this.pickUp();
        return;
      }

      this.showGhost(t, t.struct ? 0xff8844 : t.valid ? 0x44ff66 : 0xff3b30);
      this.showRange(t);
      const k = SK.Grid.idx(t.i, t.j);
      if (I.mouse.left && (I.mouse.leftPressed || k !== this.lastPlaced)) this.place();
      if (!I.mouse.left) this.lastPlaced = -1;
      if (I.justPressed('KeyX') || I.mouse.rightPressed) this.pickUp();
    },

    showGhost(t, color) {
      const def = C.STRUCTURES[this.selected];
      const center = SK.Grid.cellToWorld(t.i, t.j, this._c);
      const h = t.struct ? t.struct.def.height + 0.1 : def ? def.height : 1;
      this.ghost.visible = true;
      this.ghost.position.set(center.x, h / 2, center.z);
      this.ghost.scale.set(1, h, 1);
      this.ghostMat.color.setHex(color);
      this.ghostMat.opacity = 0.25 + Math.sin(performance.now() / 150) * 0.08;
    },

    // Circle showing how far the hovered turret (or the one about to be placed) reaches.
    showRange(t) {
      const type = t.struct ? t.struct.type : this.selected;
      const def = C.STRUCTURES[type];
      const r = def && (def.range || (type === 'mine' ? def.radius : 0));
      if (!r) return;
      const center = SK.Grid.cellToWorld(t.i, t.j, this._c);
      const ring = this.rangeRing, color = SK.Structures.rangeColor(type);
      ring.visible = true;
      ring.position.set(center.x, 0.07, center.z);
      ring.scale.setScalar(r);
      ring.userData.line.material.color.setHex(color);
      ring.userData.fill.material.color.setHex(color);
    },

    // Arrows on the ground tracing every gate's route to the Stash, so you can see your maze working.
    // Gates used by the next (or current) round are bright; the others are faint.
    // Drones ignore walls, so their route is a straight line in the sky.
    refreshPaths() {
      this.pathVersion = SK.Grid.version;
      for (const m of this.pathLines) {
        this.pathGroup.remove(m);
        m.material.dispose();
        if (m.isInstancedMesh) m.dispose(); else m.geometry.dispose();
      }
      this.pathLines = [];
      if (!this.arrowGeo) {
        const shape = new THREE.Shape();
        shape.moveTo(0, 0.45);
        shape.lineTo(-0.32, -0.25);
        shape.lineTo(0, -0.08);
        shape.lineTo(0.32, -0.25);
        shape.closePath();
        this.arrowGeo = new THREE.ShapeGeometry(shape);
        this.arrowGeo.rotateX(-Math.PI / 2); // lay flat, tip pointing -Z
      }

      const G = SK.Grid, W = SK.Waves;
      G.updateRoutes();
      const hot = W.hotGates();
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();

      for (const gate of G.gates) {
        const isHot = hot.includes(gate);
        const routes = isHot
          ? [[gate.route, 0xffa030, 0.06, 1.6, 0.95, true], [gate.bruteRoute, 0xc050ff, 0.09, 1.0, 0.75, false]]
          : [[gate.route, 0xd8c8a8, 0.05, 1.1, 0.35, true]];

        for (const [cells, color, y, size, opacity, markWalls] of routes) {
          if (cells.length < 2) continue;
          const n = cells.length - 1;
          const mesh = new THREE.InstancedMesh(this.arrowGeo,
            new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity,
                                          depthWrite: false, side: THREE.DoubleSide }), n);
          const a = new THREE.Vector3(), b = new THREE.Vector3();
          for (let s = 0; s < n; s++) {
            G.cellToWorld(cells[s].i, cells[s].j, a);
            G.cellToWorld(cells[s + 1].i, cells[s + 1].j, b);
            dummy.position.set((a.x + b.x) / 2, y, (a.z + b.z) / 2);
            dummy.rotation.set(0, U.yawTo(b.x - a.x, b.z - a.z), 0);
            dummy.scale.setScalar(size);
            dummy.updateMatrix();
            mesh.setMatrixAt(s, dummy.matrix);
            const st = G.structs[G.idx(cells[s + 1].i, cells[s + 1].j)];
            // red where this route has to smash through one of your walls
            mesh.setColorAt(s, col.setHex(markWalls && st && st.def.blocks ? 0xff2a20 : color));
          }
          mesh.frustumCulled = false;
          mesh.renderOrder = 2;
          this.pathGroup.add(mesh);
          this.pathLines.push(mesh);
        }

        if (isHot && W.expectsAir()) {
          const h = C.ENEMIES.drone.flyHeight;
          const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(gate.center.x, h, gate.center.z), new THREE.Vector3(0, h, 0)]);
          const line = new THREE.Line(geo, new THREE.LineDashedMaterial({
            color: 0x66c8ff, dashSize: 1.2, gapSize: 0.8, transparent: true, opacity: 0.8 }));
          line.computeLineDistances();
          this.pathGroup.add(line);
          this.pathLines.push(line);
        }
      }
    }
  };
})();
