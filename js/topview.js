// Top-down camera used during the preparation phase between rounds.
// WASD / arrow keys pan, mouse wheel zooms. The mouse is free for clicking on the map.
SK.TopView = {
  center: new THREE.Vector3(0, 0, 3),
  zoom: 0.8,
  _cur: new THREE.Vector3(),
  _look: new THREE.Vector3(),

  enter() {
    this.center.set(0, 0, 3);
    this.zoom = 0.8;
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
    const lim = SK.Grid.HALF;
    this.center.x = SK.U.clamp(this.center.x, -lim, lim);
    this.center.z = SK.U.clamp(this.center.z, -lim, lim);
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
