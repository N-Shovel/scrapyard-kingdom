// Visual effects: bullet tracers, particle bursts, muzzle flash light, floating health bars.
SK.FX = (function () {
  let scene, camera, flashLight;
  const tracers = [];
  const parts = [];
  const partGeo = new THREE.BoxGeometry(1, 1, 1);
  const partMats = {};

  function init(s, c) {
    scene = s;
    camera = c;
    flashLight = new THREE.PointLight(0xffc070, 0, 14, 2);
    scene.add(flashLight);
  }

  function tracer(a, b, color = 0xffe08a, life = 0.07, opacity = 0.9) {
    const geo = new THREE.BufferGeometry().setFromPoints([a.clone(), b.clone()]);
    const m = new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const line = new THREE.Line(geo, m);
    scene.add(line);
    tracers.push({ line, life, max: life, op: opacity });
  }

  function matFor(color) {
    if (!partMats[color]) partMats[color] = new THREE.MeshBasicMaterial({ color });
    return partMats[color];
  }

  function burst(pos, color, count = 8, speed = 4, size = 0.12, life = 0.6) {
    for (let n = 0; n < count; n++) {
      const m = new THREE.Mesh(partGeo, matFor(color));
      const s = size * (0.6 + Math.random() * 0.8);
      m.scale.setScalar(s);
      m.position.copy(pos);
      scene.add(m);
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5)
        .normalize().multiplyScalar(speed * (0.4 + Math.random() * 0.8));
      parts.push({ m, v, life: life * (0.6 + Math.random() * 0.6), max: life, s });
    }
  }

  function flash(pos, intensity = 4) {
    flashLight.position.copy(pos);
    flashLight.intensity = intensity;
  }

  // Billboard health bar floating in the world.
  function makeBar(w) {
    const g = new THREE.Group();
    const bg = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 0.08, 0.2),
      new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7, depthWrite: false })
    );
    const fgGeo = new THREE.PlaneGeometry(w, 0.12);
    fgGeo.translate(w / 2, 0, 0); // scale from the left edge
    const fg = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({ color: 0x6cff6c }));
    fg.position.set(-w / 2, 0, 0.01);
    g.add(bg, fg);
    g.visible = false;
    scene.add(g);
    return { g, fg };
  }

  function updateBar(bar, x, y, z, ratio, always) {
    bar.g.position.set(x, y, z);
    bar.g.quaternion.copy(camera.quaternion);
    bar.g.visible = (always || ratio < 0.999) && ratio > 0;
    bar.fg.scale.x = Math.max(0.001, ratio);
    bar.fg.material.color.setHSL(ratio * 0.33, 0.9, 0.5);
  }

  function removeBar(bar) {
    scene.remove(bar.g);
    bar.g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) o.material.dispose();
    });
  }

  function update(dt) {
    for (let n = tracers.length - 1; n >= 0; n--) {
      const t = tracers[n];
      t.life -= dt;
      t.line.material.opacity = t.op * Math.max(0, t.life / t.max);
      if (t.life <= 0) {
        scene.remove(t.line);
        t.line.geometry.dispose();
        t.line.material.dispose();
        tracers.splice(n, 1);
      }
    }
    for (let n = parts.length - 1; n >= 0; n--) {
      const p = parts[n];
      p.life -= dt;
      p.v.y -= 14 * dt;
      p.m.position.addScaledVector(p.v, dt);
      if (p.m.position.y < 0.03) { p.m.position.y = 0.03; p.v.set(p.v.x * 0.5, 0, p.v.z * 0.5); }
      p.m.scale.setScalar(p.s * Math.max(0, p.life / p.max));
      if (p.life <= 0) {
        scene.remove(p.m);
        parts.splice(n, 1);
      }
    }
    flashLight.intensity *= Math.exp(-dt * 25);
  }

  return { init, tracer, burst, flash, makeBar, updateBar, removeBar, update };
})();
