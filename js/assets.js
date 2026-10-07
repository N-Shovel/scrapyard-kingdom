// 3D models made in Blender (.glb), described in SK.CONFIG.MODELS.
// Each model is loaded once, cleaned up (scaled, turned to face -Z, feet on the ground) and then
// handed out as independent copies, so many enemies can share one file.
// Loading needs http(s); when it fails (e.g. index.html opened straight from disk) callers keep their box models.
SK.Assets = (function () {
  const { GLTFLoader, SkeletonUtils } = window.THREE_ADDONS;
  const loader = new GLTFLoader();
  const templates = {};
  const sanitize = (name) => THREE.PropertyBinding.sanitizeNodeName(name);

  // A one-key clip holding the average of a few frames of another clip (e.g. an idle stance
  // made from the two mirrored "passing" frames of a walk).
  function poseClip(source, def) {
    const fps = def.fps || 24;
    const tracks = source.tracks.map((track) => {
      const sample = track.createInterpolant();
      const out = new Float32Array(sample.valueSize);
      def.poses.forEach((frame, i) => {
        const v = sample.evaluate(frame / fps);
        const w = 1 / (i + 1); // running average
        if (track.ValueTypeName === 'quaternion') THREE.Quaternion.slerpFlat(out, 0, i ? out : v, 0, v, 0, w);
        else for (let k = 0; k < out.length; k++) out[k] += (v[k] - out[k]) * w;
      });
      return new track.constructor(track.name, [0], out);
    });
    return new THREE.AnimationClip(def.name, 0, tracks);
  }

  // Cut one loop out of a long clip and pin the root bone in place.
  // Returns the clip plus how fast the root was travelling (model units per second, before scaling).
  function prepareClip(source, def) {
    let clip = source;
    if (def.poses) clip = poseClip(source, def);
    else if (def.from != null) clip = THREE.AnimationUtils.subclip(source, def.name, def.from, def.to + 1, def.fps || 24);
    let speed = 0;
    if (def.root) {
      const name = sanitize(def.root) + '.position';
      const track = clip.tracks.find((t) => t.name === name);
      if (track) {
        const v = track.values, n = v.length;
        const dist = Math.hypot(v[n - 3] - v[0], v[n - 2] - v[1], v[n - 1] - v[2]);
        speed = clip.duration > 0 ? dist / clip.duration : 0;
        clip.tracks.splice(clip.tracks.indexOf(track), 1);
      }
    }
    return { clip, speed };
  }

  function prepare(gltf, def) {
    let model = gltf.scene;
    if (def.node) {
      model = gltf.scene.getObjectByName(sanitize(def.node));
      if (!model) throw new Error(`Model node "${def.node}" not found in ${def.file}`);
    }
    model.removeFromParent();
    model.position.set(0, 0, 0); // drop whatever offset it had in the Blender scene

    const hide = new Set((def.hide || []).map(sanitize));
    model.traverse((o) => {
      if (hide.has(o.name)) o.visible = false;
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      if (o.isSkinnedMesh) o.frustumCulled = false; // its bounds don't follow the animation
      if (def.vertexColors === false) {
        for (const m of [].concat(o.material)) { m.vertexColors = false; m.needsUpdate = true; }
      }
    });

    const clips = {}, speeds = {};
    for (const [key, c] of Object.entries(def.clips || {})) {
      const source = THREE.AnimationClip.findByName(gltf.animations, c.clip);
      if (!source) { console.warn(`Clip "${c.clip}" not found in ${def.file}`); continue; }
      const out = prepareClip(source, Object.assign({ name: key }, c));
      clips[key] = out.clip;
      speeds[key] = out.speed;
    }
    // additive clips only store the difference from another clip's first frame,
    // so they can be layered on top (at weights above 1 they exaggerate the motion)
    for (const [key, c] of Object.entries(def.clips || {})) {
      if (c.additive && clips[key] && clips[c.additive]) {
        THREE.AnimationUtils.makeClipAdditive(clips[key], 0, clips[c.additive]);
      }
    }
    // measure (and later stand) the model in its idle pose rather than whatever pose Blender exported
    if (clips.idle) {
      const mixer = new THREE.AnimationMixer(model);
      mixer.clipAction(clips.idle).play();
      mixer.update(0);
      mixer.stopAllAction();
    }

    // Wrap it so the turn / scale / offset live on the wrapper and the model itself stays untouched.
    const root = new THREE.Group();
    root.name = def.name;
    const turn = new THREE.Group();
    turn.rotation.y = def.turn || 0;
    turn.add(model);
    root.add(turn);
    root.updateMatrixWorld(true);
    const box = new THREE.Box3(), part = new THREE.Box3();
    turn.traverseVisible((o) => { if (o.isMesh) box.union(part.setFromObject(o, true)); });
    const size = box.getSize(new THREE.Vector3());
    const scale = def.height ? def.height / size.y : 1;
    // stand it over the origin: on a bone if given (a backpack shouldn't shift the body), else the box middle
    const mid = box.getCenter(new THREE.Vector3());
    const bone = def.center && model.getObjectByName(sanitize(def.center));
    if (bone) bone.getWorldPosition(mid);
    turn.scale.setScalar(scale);
    turn.position.set(-mid.x * scale, -box.min.y * scale, -mid.z * scale);
    for (const k in speeds) speeds[k] *= scale;
    return { root, clips, speeds };
  }

  // Load a model by its SK.CONFIG.MODELS key (only the first call hits the network).
  function load(key) {
    if (!templates[key]) {
      const def = Object.assign({ name: key }, SK.CONFIG.MODELS[key]);
      templates[key] = loader.loadAsync(def.file).then((gltf) => prepare(gltf, def));
    }
    return templates[key];
  }

  // A fresh copy of a model with its own animation mixer:
  //   { object, mixer, actions: { walk, ... }, speeds: { walk: metres per second at timeScale 1 } }
  async function instance(key) {
    const t = await load(key);
    const object = SkeletonUtils.clone(t.root);
    const mixer = new THREE.AnimationMixer(object);
    const actions = {};
    for (const k in t.clips) actions[k] = mixer.clipAction(t.clips[k]);
    return { object, mixer, actions, speeds: t.speeds };
  }

  return { load, instance };
})();
