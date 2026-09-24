// Boot: renderer, scene, lights, game state, and the main loop.
(function () {
  const C = SK.CONFIG;

  // ---------- game state ----------
  // menu -> prep (top-down) -> paused (waiting for mouse capture) -> playing (combat) -> prep -> ...
  const Game = SK.Game = {
    state: 'menu', // menu | prep | playing | paused | over
    scrap: C.START_SCRAP,
    kills: 0,
    time: 0,
    addScrap(n) { this.scrap += n; },
    spend(n) {
      if (this.scrap < n) return false;
      this.scrap -= n;
      return true;
    },
    steal(n) {
      const s = Math.min(this.scrap, n);
      this.scrap -= s;
      return s;
    },
    gameOver(reason) {
      if (this.state === 'over') return;
      this.state = 'over';
      if (document.pointerLockElement) document.exitPointerLock();
      document.getElementById('go-reason').textContent = reason;
      document.getElementById('go-stats').innerHTML =
        `Rounds survived: <b>${Math.max(0, SK.Waves.round - 1)}</b><br>` +
        `Enemies scrapped: <b>${this.kills}</b><br>` +
        `Time: <b>${Math.floor(this.time / 60)}m ${Math.floor(this.time % 60)}s</b>`;
      document.getElementById('gameover').classList.remove('hidden');
      document.getElementById('hud').classList.add('hidden');
    }
  };

  // ---------- renderer / scene ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  document.getElementById('game').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const skyColor = 0xc4946a;
  scene.background = new THREE.Color(skyColor);
  scene.fog = new THREE.Fog(skyColor, 40, 130);

  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 300);
  scene.add(camera); // so the first-person weapon (a child of the camera) renders

  scene.add(new THREE.HemisphereLight(0xffe2c0, 0x4a3a2a, 0.9));
  const sun = new THREE.DirectionalLight(0xffcf9a, 2.2);
  sun.position.set(40, 60, 25);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 1, far: 160 });
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  // dusty ground
  function dirtTexture() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#8a6d4f';
    x.fillRect(0, 0, 256, 256);
    for (let n = 0; n < 6000; n++) {
      const dark = Math.random() < 0.5;
      x.fillStyle = dark ? `rgba(60,45,30,${Math.random() * 0.25})` : `rgba(180,150,110,${Math.random() * 0.2})`;
      const s = 1 + Math.random() * 3;
      x.fillRect(Math.random() * 256, Math.random() * 256, s, s);
    }
    for (let n = 0; n < 5; n++) {
      const px = Math.random() * 256, py = Math.random() * 256, r = 10 + Math.random() * 25;
      const g = x.createRadialGradient(px, py, 0, px, py, r);
      g.addColorStop(0, 'rgba(30,22,15,0.35)');
      g.addColorStop(1, 'rgba(30,22,15,0)');
      x.fillStyle = g;
      x.fillRect(px - r, py - r, r * 2, r * 2);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(50, 50);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(400, 400),
    new THREE.MeshStandardMaterial({ map: dirtTexture(), roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // ---------- world setup ----------
  SK.World = { scene, camera, renderer, ground };
  SK.FX.init(scene, camera);
  SK.Grid.generate((Math.random() * 1e9) | 0);
  SK.Grid.buildTerrain(scene);
  SK.Grid.buildDecor(scene);
  SK.Inventory.init();
  SK.Stash.init(scene);
  SK.Structures.init(scene);
  SK.Enemies.init(scene);
  SK.Pickups.init(scene);
  SK.Player.init(scene, camera);
  SK.Weapons.init(camera);
  SK.Build.init(scene);
  SK.Waves.init(scene);
  SK.HUD.init();
  SK.Upgrades.init();
  SK.Minimap.init();
  SK.World.solids = [SK.Grid.terrainGroup, SK.Structures.group, SK.Stash.group];
  SK.World.shootables = [SK.Enemies.group, SK.Grid.terrainGroup, SK.Structures.group, SK.Stash.group, ground];

  // ---------- menus / pointer lock ----------
  const $ = (id) => document.getElementById(id);
  SK.Input.init(renderer.domElement);
  SK.Input.onLockChange = (locked) => {
    if (locked) {
      if (Game.state === 'paused') {
        Game.state = 'playing';
        SK.HUD.showPause(false);
      }
    } else if (Game.state === 'playing') {
      Game.state = 'paused';
      SK.HUD.showPause(true);
    }
  };
  $('start-btn').addEventListener('click', () => {
    SK.SFX.init();
    $('menu').classList.add('hidden');
    $('hud').classList.remove('hidden');
    SK.Waves.beginPrep();
  });
  $('pause').addEventListener('click', () => SK.Input.lock());
  $('restart-btn').addEventListener('click', () => location.reload());

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- main loop ----------
  const clock = new THREE.Clock();
  let t = 0;
  let menuAngle = 0;

  function loop() {
    requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    t += dt;
    const I = SK.Input;

    if (Game.state === 'playing') {
      Game.time += dt;
      if (I.justPressed('KeyB') || I.justPressed('Tab')) SK.Build.toggle();
      if (I.justPressed('KeyV')) SK.Player.toggleView();
      if (I.justPressed('KeyM')) SK.Minimap.toggle();
      if (I.justPressed('KeyH')) SK.Upgrades.useMedkit();
      if (I.justPressed('KeyE') && SK.Weapons.nearStation) SK.Upgrades.show();

      SK.Player.update(dt);
      SK.Player.updateCamera();
      SK.Weapons.update(dt);
      SK.Build.update(dt);
      SK.Structures.update(dt);
      SK.Enemies.update(dt);
      SK.Pickups.update(dt);
      SK.Waves.update(dt, t);
      SK.Stash.update(dt, t);
      SK.Minimap.update(dt);
      SK.HUD.update(dt);
    } else if (Game.state === 'shop') {
      // fight is paused while the Workshop is open (E closes it and jumps back in)
      if (I.justPressed('KeyE')) SK.Upgrades.close();
    } else if (Game.state === 'prep') {
      // top-down planning: place / pick up / repair / refuel / shop
      if (I.justPressed('KeyU')) SK.Upgrades.toggle();
      if (SK.Upgrades.open && I.justPressed('Escape')) SK.Upgrades.close();
      if (!SK.Upgrades.open && (I.justPressed('KeyG') || I.justPressed('Enter'))) SK.Waves.startRound();
      if (Game.state === 'prep') {
        SK.TopView.update(dt);
        if (!SK.Upgrades.open) SK.Build.update(dt);
        SK.Weapons.updateRefuel(dt, I.down('KeyF'));
        SK.Structures.update(dt);
        SK.Waves.update(dt, t);
        SK.Stash.update(dt, t);
        SK.HUD.update(dt);
      }
    } else if (Game.state === 'menu') {
      // slow orbit around the yard behind the title screen
      menuAngle += dt * 0.08;
      camera.position.set(Math.sin(menuAngle) * 34, 20, Math.cos(menuAngle) * 34);
      camera.lookAt(0, 0, 0);
      SK.Stash.update(dt, t);
      SK.Waves.update(0, t);
    }

    SK.FX.update(dt);
    renderer.render(scene, camera);
    I.endFrame();
  }
  loop();
})();
