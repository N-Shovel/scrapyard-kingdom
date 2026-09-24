// The map grid: terrain, gates, stash cells, structures, collision and enemy pathfinding (flow fields).
(function () {
  const C = SK.CONFIG, U = SK.U;
  const N = C.GRID, S = C.CELL, HALF = (N * S) / 2;
  const EMPTY = 0, ROCK = 1, STASH = 2;

  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

  class MinHeap {
    constructor() { this.k = []; this.p = []; this.lastP = 0; }
    get size() { return this.k.length; }
    push(key, pri) {
      const k = this.k, p = this.p;
      k.push(key); p.push(pri);
      let i = k.length - 1;
      while (i > 0) {
        const pa = (i - 1) >> 1;
        if (p[pa] <= p[i]) break;
        [k[pa], k[i]] = [k[i], k[pa]];
        [p[pa], p[i]] = [p[i], p[pa]];
        i = pa;
      }
    }
    pop() {
      const k = this.k, p = this.p;
      const topK = k[0];
      this.lastP = p[0];
      const lk = k.pop(), lp = p.pop();
      if (k.length) {
        k[0] = lk; p[0] = lp;
        let i = 0;
        const n = k.length;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < n && p[l] < p[m]) m = l;
          if (r < n && p[r] < p[m]) m = r;
          if (m === i) break;
          [k[m], k[i]] = [k[i], k[m]];
          [p[m], p[i]] = [p[i], p[m]];
          i = m;
        }
      }
      return topK;
    }
  }

  const Grid = {
    N, S, HALF, EMPTY, ROCK, STASH,
    terrain: new Uint8Array(N * N),
    structs: new Array(N * N).fill(null),
    gateSet: new Set(),     // unbuildable cell indices near gates
    gates: [],              // { name, cells:[{i,j}], center:Vector3 }
    stashCells: [],
    flowNormal: null,
    flowBrute: null,
    version: 0,
    terrainGroup: new THREE.Group(),

    idx(i, j) { return j * N + i; },
    inBounds(i, j) { return i >= 0 && j >= 0 && i < N && j < N; },
    cellToWorld(i, j, out) {
      out = out || new THREE.Vector3();
      return out.set((i + 0.5) * S - HALF, 0, (j + 0.5) * S - HALF);
    },
    worldToCell(x, z) {
      return { i: Math.floor((x + HALF) / S), j: Math.floor((z + HALF) / S) };
    },

    // Can an enemy stand here? (no rock, no stash, no blocking structure)
    walkable(i, j) {
      if (!this.inBounds(i, j)) return false;
      const k = this.idx(i, j);
      if (this.terrain[k] !== EMPTY) return false;
      const s = this.structs[k];
      return !(s && s.def.blocks);
    },

    // Is this cell a solid block for collision?
    solid(i, j) { return !this.walkable(i, j); },

    // Push a circle (player/enemy) out of solid cells.
    resolveCircle(pos, r) {
      const c = this.worldToCell(pos.x, pos.z);
      const hw = S / 2;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ci = c.i + di, cj = c.j + dj;
          if (!this.solid(ci, cj)) continue;
          const cx = (ci + 0.5) * S - HALF, cz = (cj + 0.5) * S - HALF;
          const nx = U.clamp(pos.x, cx - hw, cx + hw);
          const nz = U.clamp(pos.z, cz - hw, cz + hw);
          const dx = pos.x - nx, dz = pos.z - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= r * r) continue;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            pos.x += (dx / d) * (r - d);
            pos.z += (dz / d) * (r - d);
          } else {
            // Center is inside the box: push out along the shallowest axis.
            const px = hw - Math.abs(pos.x - cx) + r;
            const pz = hw - Math.abs(pos.z - cz) + r;
            if (px < pz) pos.x += Math.sign(pos.x - cx || 1) * px;
            else pos.z += Math.sign(pos.z - cz || 1) * pz;
          }
        }
      }
    },

    // Straight-line visibility across the grid (used by mutants chasing the player).
    losClear(ax, az, bx, bz) {
      const d = Math.hypot(bx - ax, bz - az);
      const steps = Math.ceil(d / 0.5);
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const c = this.worldToCell(ax + (bx - ax) * t, az + (bz - az) * t);
        if (this.solid(c.i, c.j)) return false;
      }
      return true;
    },

    // Dijkstra from the stash outwards. dist[cell] = cost for an enemy there to reach the stash.
    // Walls are passable at a cost (the enemy must break them), so fully sealing a route
    // makes enemies attack the cheapest wall instead of getting stuck.
    computeFlow(wallMul) {
      // Float64 on purpose: Float32 rounding vs the heap's float64 priorities can re-queue nodes forever.
      const dist = new Float64Array(N * N).fill(Infinity);
      const h = new MinHeap();
      for (const c of this.stashCells) {
        const k = this.idx(c.i, c.j);
        dist[k] = 0;
        h.push(k, 0);
      }
      while (h.size) {
        const k = h.pop();
        const d = h.lastP;
        if (d > dist[k]) continue;
        const i = k % N, j = (k / N) | 0;
        const s = this.structs[k];
        const kBlock = !!(s && s.def.blocks);
        const enterCost = kBlock ? 1 + (wallMul * s.def.hp) / 100 : 1;
        for (const [di, dj] of DIRS) {
          const ni = i + di, nj = j + dj;
          if (!this.inBounds(ni, nj)) continue;
          const nk = this.idx(ni, nj);
          if (this.terrain[nk] !== EMPTY) continue;
          const diag = di !== 0 && dj !== 0;
          if (diag) {
            if (kBlock) continue; // walls are only attacked head-on
            if (!this.walkable(i, nj) || !this.walkable(ni, j)) continue; // no corner cutting
          }
          const nd = d + enterCost * (diag ? 1.4142 : 1);
          if (nd < dist[nk]) {
            dist[nk] = nd;
            h.push(nk, nd);
          }
        }
      }
      return dist;
    },

    recompute() {
      this.flowNormal = { dist: this.computeFlow(C.WALL_COST_NORMAL), mul: C.WALL_COST_NORMAL };
      this.flowBrute = { dist: this.computeFlow(C.WALL_COST_BRUTE), mul: C.WALL_COST_BRUTE };
      this.version++;
    },

    // Best neighbouring cell to step into, following a flow field.
    // Includes the cost of breaking into a wall, so a single blocking wall gets walked around.
    nextCell(i, j, flow) {
      if (!this.inBounds(i, j)) return null;
      const dist = flow.dist;
      let best = null;
      let bd = Infinity;
      for (const [di, dj] of DIRS) {
        const ni = i + di, nj = j + dj;
        if (!this.inBounds(ni, nj)) continue;
        const nk = this.idx(ni, nj);
        if (this.terrain[nk] === ROCK) continue;
        const diag = di !== 0 && dj !== 0;
        if (diag) {
          if (!this.walkable(i + di, j) || !this.walkable(i, j + dj)) continue;
          if (!this.walkable(ni, nj) && this.terrain[nk] !== STASH) continue;
        }
        const s = this.structs[nk];
        const enter = s && s.def.blocks ? 1 + (flow.mul * s.def.hp) / 100 : 1;
        const v = dist[nk] + enter * (diag ? 1.4142 : 1);
        if (v < bd) { bd = v; best = { i: ni, j: nj }; }
      }
      return best;
    },

    // Follow a flow field from a gate to the stash. breach = first wall on the way (null if the route is open).
    traceRoute(gate, flow) {
      const mid = gate.cells[1];
      let i = mid.i, j = mid.j;
      const cells = [{ i, j }];
      let breach = null;
      for (let n = 0; n < 400; n++) {
        const nx = this.nextCell(i, j, flow);
        if (!nx) break;
        const s = this.structs[this.idx(nx.i, nx.j)];
        if (s && s.def.blocks && !breach) breach = s;
        cells.push(nx);
        i = nx.i; j = nx.j;
        if (this.terrain[this.idx(i, j)] === STASH) break;
      }
      return { cells, breach };
    },

    // Recompute every gate's route (cached until the grid changes).
    updateRoutes() {
      if (this.routesVersion === this.version) return;
      this.routesVersion = this.version;
      for (const g of this.gates) {
        const n = this.traceRoute(g, this.flowNormal);
        const b = this.traceRoute(g, this.flowBrute);
        g.route = n.cells; g.breach = n.breach;
        g.bruteRoute = b.cells; g.bruteBreach = b.breach;
      }
    },

    // Distance field toward one specific wall (for enemies locked onto it). Cached per grid version.
    flowTo(s) {
      if (this._toVer !== this.version) { this._toVer = this.version; this._toCache = new Map(); }
      const k0 = this.idx(s.i, s.j);
      let d = this._toCache.get(k0);
      if (d) return d;
      d = new Float64Array(N * N).fill(Infinity);
      const h = new MinHeap();
      d[k0] = 0;
      h.push(k0, 0);
      while (h.size) {
        const k = h.pop();
        const dk = h.lastP;
        if (dk > d[k]) continue;
        const i = k % N, j = (k / N) | 0;
        for (const [di, dj] of DIRS) {
          const diag = di !== 0 && dj !== 0;
          if (k === k0 && diag) continue; // walls are attacked head-on
          const ni = i + di, nj = j + dj;
          if (!this.walkable(ni, nj)) continue;
          if (diag && (!this.walkable(i, nj) || !this.walkable(ni, j))) continue;
          const nk = this.idx(ni, nj);
          const nd = dk + (diag ? 1.4142 : 1);
          if (nd < d[nk]) { d[nk] = nd; h.push(nk, nd); }
        }
      }
      this._toCache.set(k0, d);
      return d;
    },

    // Next step toward a specific wall. null if it can't be reached by walking.
    nextCellTo(i, j, s) {
      const d = this.flowTo(s);
      const k0 = this.idx(s.i, s.j);
      let best = null, bv = Infinity;
      for (const [di, dj] of DIRS) {
        const ni = i + di, nj = j + dj;
        if (!this.inBounds(ni, nj)) continue;
        const nk = this.idx(ni, nj);
        const diag = di !== 0 && dj !== 0;
        let v;
        if (nk === k0) {
          if (diag) continue;
          v = 1;
        } else {
          if (!this.walkable(ni, nj)) continue;
          if (diag && (!this.walkable(i + di, j) || !this.walkable(i, j + dj))) continue;
          v = d[nk] + (diag ? 1.4142 : 1);
        }
        if (v < bv) { bv = v; best = { i: ni, j: nj }; }
      }
      return isFinite(bv) ? best : null;
    },

    // How many solid cells (walls, junk, stash) lie between two points, not counting the end cells.
    obstaclesBetween(ax, az, bx, bz, max) {
      const a = this.worldToCell(ax, az), b = this.worldToCell(bx, bz);
      const ka = this.idx(a.i, a.j), kb = this.idx(b.i, b.j);
      const d = Math.hypot(bx - ax, bz - az);
      const steps = Math.ceil(d / 0.3);
      const seen = [];
      for (let s = 1; s < steps; s++) {
        const t = s / steps;
        const c = this.worldToCell(ax + (bx - ax) * t, az + (bz - az) * t);
        if (!this.inBounds(c.i, c.j)) continue;
        const k = this.idx(c.i, c.j);
        if (k === ka || k === kb || seen.includes(k) || !this.solid(c.i, c.j)) continue;
        seen.push(k);
        if (seen.length > max) break;
      }
      return seen.length;
    },

    // ---------- map generation ----------
    generate(seed) {
      const R = U.rng(seed);
      const T = this.terrain;
      T.fill(EMPTY);

      // Outer fence of junk
      for (let j = 0; j < N; j++)
        for (let i = 0; i < N; i++)
          if (i === 0 || j === 0 || i === N - 1 || j === N - 1) T[this.idx(i, j)] = ROCK;

      // Stash in the middle (2x2)
      const m = N / 2;
      this.stashCells = [{ i: m - 1, j: m - 1 }, { i: m, j: m - 1 }, { i: m - 1, j: m }, { i: m, j: m }];
      for (const c of this.stashCells) T[this.idx(c.i, c.j)] = STASH;

      // Gates: gaps in the fence where enemies come in
      const defs = [
        { name: 'North',      cells: [[m - 1, 0], [m, 0], [m + 1, 0]] },
        { name: 'South',      cells: [[m - 2, N - 1], [m - 1, N - 1], [m, N - 1]] },
        { name: 'West',       cells: [[0, m - 2], [0, m - 1], [0, m]] },
        { name: 'East',       cells: [[N - 1, m - 1], [N - 1, m], [N - 1, m + 1]] },
        { name: 'North-East', cells: [[N - 9, 0], [N - 8, 0], [N - 7, 0]] },
        { name: 'South-West', cells: [[6, N - 1], [7, N - 1], [8, N - 1]] }
      ];
      // Gate objects are created once and reused when the terrain is regenerated each round.
      if (!this.gates.length) {
        for (const g of defs) {
          const cells = g.cells.map(([i, j]) => ({ i, j }));
          const center = new THREE.Vector3();
          for (const c of cells) center.add(this.cellToWorld(c.i, c.j));
          center.divideScalar(cells.length);
          this.gates.push({ name: g.name, cells, center, route: [], bruteRoute: [],
                            breach: null, bruteBreach: null, lock: null, bruteLock: null });
        }
      }
      this.gateSet.clear();
      for (const g of this.gates) {
        g.lock = g.bruteLock = null;
        for (const c of g.cells) {
          T[this.idx(c.i, c.j)] = EMPTY;
          // gate cell + the cell just inside it can't be built on
          this.gateSet.add(this.idx(c.i, c.j));
          const ii = c.i === 0 ? 1 : c.i === N - 1 ? N - 2 : c.i;
          const jj = c.j === 0 ? 1 : c.j === N - 1 ? N - 2 : c.j;
          this.gateSet.add(this.idx(ii, jj));
        }
      }

      // Junk pile clusters that create multiple lanes. Reject any that seal off an area.
      let placed = 0, tries = 0;
      while (placed < 46 && tries < 700) {
        tries++;
        let ci = 2 + Math.floor(R() * (N - 4));
        let cj = 2 + Math.floor(R() * (N - 4));
        if (Math.hypot(ci - (m - 0.5), cj - (m - 0.5)) < 6.5) continue;
        let nearGate = false;
        for (const g of this.gates)
          for (const c of g.cells)
            if (Math.max(Math.abs(c.i - ci), Math.abs(c.j - cj)) < 4) nearGate = true;
        if (nearGate) continue;

        const cells = [];
        const size = 4 + Math.floor(R() * 7);
        for (let n = 0; n < size; n++) {
          if (this.inBounds(ci, cj) && T[this.idx(ci, cj)] === EMPTY &&
              Math.hypot(ci - (m - 0.5), cj - (m - 0.5)) >= 5) {
            cells.push(this.idx(ci, cj));
            T[this.idx(ci, cj)] = ROCK;
          }
          const d = DIRS[Math.floor(R() * 4)];
          ci += d[0]; cj += d[1];
        }
        const flow = this.computeFlow(0);
        let ok = true;
        for (let k = 0; k < N * N; k++) {
          if (T[k] === EMPTY && !isFinite(flow[k])) { ok = false; break; }
        }
        if (ok) placed++;
        else for (const k of cells) T[k] = EMPTY;
      }
      this.recompute();
    },

    makeInstanced(geo, list, parent) {
      const dummy = new THREE.Object3D();
      const col = new THREE.Color();
      const inst = new THREE.InstancedMesh(
        geo, new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0.2, flatShading: true }), Math.max(1, list.length));
      inst.count = list.length;
      list.forEach((b, n) => {
        dummy.position.set(b.x, b.y, b.z);
        dummy.rotation.set(0, b.ry || 0, 0);
        dummy.scale.set(b.w || 1, b.h || 1, b.d || 1);
        dummy.updateMatrix();
        inst.setMatrixAt(n, dummy.matrix);
        inst.setColorAt(n, col.setHex(b.color));
      });
      inst.castShadow = true;
      inst.receiveShadow = true;
      inst.frustumCulled = false;
      parent.add(inst);
      return inst;
    },

    // Instanced junk piles for the current terrain. Called again whenever the terrain is regenerated.
    buildTerrain(scene) {
      if (!this.terrainGroup.parent) scene.add(this.terrainGroup);
      for (const old of [...this.terrainGroup.children]) {
        this.terrainGroup.remove(old);
        old.material.dispose();
        old.dispose();
      }
      const R = U.rng((Math.random() * 1e9) | 0);
      const boxes = [], barrels = [];
      const p = new THREE.Vector3();
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          if (this.terrain[this.idx(i, j)] !== ROCK) continue;
          this.cellToWorld(i, j, p);
          const border = i === 0 || j === 0 || i === N - 1 || j === N - 1;
          const layers = border ? 2 + Math.floor(R() * 2) : 1 + Math.floor(R() * 2);
          let y = 0;
          for (let l = 0; l < layers; l++) {
            const w = S * (0.8 + R() * 0.3), d = S * (0.8 + R() * 0.3);
            const h = (border ? 0.9 : 0.6) + R() * 1.0;
            boxes.push({ x: p.x + (R() - 0.5) * 0.3, y: y + h / 2, z: p.z + (R() - 0.5) * 0.3,
                         w: w * (1 - l * 0.15), h, d: d * (1 - l * 0.15), ry: (R() - 0.5) * 0.7,
                         color: U.RUST[Math.floor(R() * U.RUST.length)] });
            y += h * 0.92;
          }
          if (R() < 0.3) barrels.push({ x: p.x + (R() - 0.5) * 0.8, y: y + 0.45, z: p.z + (R() - 0.5) * 0.8,
                                        color: R() < 0.5 ? 0x2f5d7a : 0x9a3a22 });
        }
      }
      if (!this._boxGeo) {
        this._boxGeo = new THREE.BoxGeometry(1, 1, 1);
        this._barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.9, 10);
      }
      this.makeInstanced(this._boxGeo, boxes, this.terrainGroup);
      this.makeInstanced(this._barrelGeo, barrels, this.terrainGroup);
      this.terrainVersion = (this.terrainVersion || 0) + 1;
    },

    // Distant junk mountains outside the fence (decor only, built once).
    buildDecor(scene) {
      const R = U.rng(777);
      const decor = [];
      for (let n = 0; n < 320; n++) {
        const x = (R() - 0.5) * (N * S + 70);
        const z = (R() - 0.5) * (N * S + 70);
        if (Math.abs(x) < HALF + 2 && Math.abs(z) < HALF + 2) continue;
        const h = 1 + R() * 5;
        decor.push({ x, y: h / 2 - 0.3, z, w: 2 + R() * 4, h, d: 2 + R() * 4, ry: R() * Math.PI,
                     color: U.RUST[Math.floor(R() * U.RUST.length)] });
      }
      this.makeInstanced(new THREE.BoxGeometry(1, 1, 1), decor, scene);
    }
  };

  SK.Grid = Grid;
})();
