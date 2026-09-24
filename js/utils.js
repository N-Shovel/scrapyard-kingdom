// Small helpers: mesh builders (with cached geometry/materials), math, seeded RNG.
SK.U = (function () {
  const geoCache = {};
  const matCache = {};

  function geo(key, make) {
    if (!geoCache[key]) geoCache[key] = make();
    return geoCache[key];
  }

  // Shared (cached) material. Don't use for things that flash individually.
  function mat(color, opts) {
    const key = color + '|' + JSON.stringify(opts || {});
    if (!matCache[key]) {
      matCache[key] = new THREE.MeshStandardMaterial(
        Object.assign({ color, roughness: 0.85, metalness: 0.15, flatShading: true }, opts)
      );
    }
    return matCache[key];
  }

  function mesh(geometry, material, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  const box = (w, h, d, m, x, y, z) =>
    mesh(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), m, x, y, z);
  const cyl = (rt, rb, h, seg, m, x, y, z) =>
    mesh(geo(`c${rt},${rb},${h},${seg}`, () => new THREE.CylinderGeometry(rt, rb, h, seg)), m, x, y, z);
  const sphere = (r, m, x, y, z) =>
    mesh(geo(`s${r}`, () => new THREE.SphereGeometry(r, 10, 8)), m, x, y, z);
  const cone = (r, h, seg, m, x, y, z) =>
    mesh(geo(`k${r},${h},${seg}`, () => new THREE.ConeGeometry(r, h, seg)), m, x, y, z);

  // Mulberry32 seeded random
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Walk up the parent chain to find the game object a mesh belongs to.
  function findRef(obj) {
    while (obj) {
      if (obj.userData && obj.userData.ref) return obj.userData.ref;
      obj = obj.parent;
    }
    return null;
  }

  function tagRef(root, ref) {
    root.traverse((o) => { o.userData.ref = ref; });
  }

  // Smoothly rotate angle a toward b by factor t, taking the short way round.
  function angleLerp(a, b, t) {
    const TAU = Math.PI * 2;
    const d = ((((b - a + Math.PI) % TAU) + TAU) % TAU) - Math.PI;
    return a + d * t;
  }

  // Distance from point to an axis-aligned rectangle (0 if inside).
  function distToRect(x, z, cx, cz, hw, hd) {
    const dx = Math.max(Math.abs(x - cx) - hw, 0);
    const dz = Math.max(Math.abs(z - cz) - hd, 0);
    return Math.hypot(dx, dz);
  }

  // Yaw that makes an object's -Z axis face direction (dx, dz).
  const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

  const RUST = [0x8a4b2a, 0x6e3b22, 0x9c6b3e, 0x5b4a3a, 0x7a7466, 0x4f5a5e, 0xa0522d, 0x6b6b5a, 0x3f4a3c];

  return { mat, mesh, box, cyl, sphere, cone, rng, clamp, rand, pick, shuffle,
           findRef, tagRef, angleLerp, distToRect, yawTo, RUST };
})();
