// Top-down camera used during the preparation phase between rounds.
// WASD / arrow keys pan, hold RMB (drag) or Space (move the mouse) to grab the map, wheel zooms.
// The mouse is free for clicking on the map.
SK.TopView = {
  center: new THREE.Vector3(0, 0, 3),
  zoom: 0.8,
  _cur: new THREE.Vector3(),
  _look: new THREE.Vector3(),

  panning: false,
  _last: null,

  enter() {
    this.center.set(0, 0, 3);
    this.zoom = 0.8;
    this.panning = false;
    this._last = null;
    SK.Input.canvas.style.cursor = '';
    const cam = SK.World.camera;
    this._cur.copy(cam.position);
    this._look.set(0, 0, 0);
    SK.Player.mesh.visible = true;
    for (const k in SK.Weapons.fp) SK.Weapons.fp[k].g.visible = false; // first-person gun rides on the camera
  },

  update(dt) {
    const I = SK.Input, cam = SK.World.camera;
    const pan = 40 * this.zoom * dt;
    if (I.down('KeyW') || I.down('ArrowUp')) this.center.z -= pan;
    if (I.down('KeyS') || I.down('ArrowDown')) this.center.z += pan;
    if (I.down('KeyA') || I.down('ArrowLeft')) this.center.x -= pan;
    if (I.down('KeyD') || I.down('ArrowRight')) this.center.x += pan;

    // grab the map: hold right mouse and drag, or hold Space and move the mouse
    const m = I.mouse;
    const grab = m.right || I.down('Space');
    let gx = 0, gz = 0;
    if (grab && this._last) {
      // world units per screen pixel at the ground (camera sits ~94 * zoom away)
      const wpp = 2 * 94 * this.zoom * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) / window.innerHeight;
      gx = -(m.x - this._last.x) * wpp;
      gz = -(m.y - this._last.y) * wpp * 1.05;
    }
    this._last = grab ? { x: m.x, y: m.y } : null;
    if (grab !== this.panning) {
      this.panning = grab;
      I.canvas.style.cursor = grab ? 'grabbing' : '';
    }
    const lim = SK.Grid.HALF;
    const ox = this.center.x, oz = this.center.z;
    this.center.x = SK.U.clamp(this.center.x + gx, -lim, lim);
    this.center.z = SK.U.clamp(this.center.z + gz, -lim, lim);
    // grabbing moves the camera 1:1 with the cursor (no smoothing lag)
    if (gx || gz) {
      const sx = this.center.x - ox, sz = this.center.z - oz;
      this._cur.x += sx; this._cur.z += sz;
      this._look.x += sx; this._look.z += sz;
    }
    if (I.mouse.wheel) this.zoom = SK.U.clamp(this.zoom * (1 + I.mouse.wheel * 0.1), 0.35, 1.25);

    // smooth fly-in from wherever the camera was
    const want = new THREE.Vector3(this.center.x, 90 * this.zoom, this.center.z + 28 * this.zoom);
    const t = 1 - Math.exp(-6 * dt);
    this._cur.lerp(want, t);
    this._look.lerp(this.center, t);
    cam.position.copy(this._cur);
    cam.lookAt(this._look);
  }
};
