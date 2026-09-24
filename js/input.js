// Keyboard + mouse state with pointer lock. Read with down()/justPressed(); cleared each frame by endFrame().
SK.Input = {
  keys: {},
  pressed: {},
  mouse: { left: false, right: false, leftPressed: false, rightPressed: false, dx: 0, dy: 0, wheel: 0,
           x: window.innerWidth / 2, y: window.innerHeight / 2 },
  locked: false,
  canvas: null,
  onLockChange: null,

  init(canvas) {
    this.canvas = canvas;
    const block = ['Space', 'Tab', 'ArrowUp', 'ArrowDown'];

    window.addEventListener('keydown', (e) => {
      if (block.includes(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed[e.code] = true;
      this.keys[e.code] = true;
    });
    window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = {}; this.mouse.left = this.mouse.right = false; });

    // Clicks count when the mouse is captured (combat) or when clicking the 3D view directly (top-down prep).
    const onGame = (e) => this.locked || e.target === this.canvas;
    window.addEventListener('mousedown', (e) => {
      if (!onGame(e)) return;
      if (e.button === 0) { this.mouse.left = true; this.mouse.leftPressed = true; }
      if (e.button === 2) { this.mouse.right = true; this.mouse.rightPressed = true; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (!this.locked) return;
      // clamp spikes some browsers produce when locking
      this.mouse.dx += Math.max(-200, Math.min(200, e.movementX || 0));
      this.mouse.dy += Math.max(-200, Math.min(200, e.movementY || 0));
    });
    window.addEventListener('wheel', (e) => { if (onGame(e)) this.mouse.wheel += Math.sign(e.deltaY); });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) { this.mouse.left = this.mouse.right = false; this.keys = {}; }
      if (this.onLockChange) this.onLockChange(this.locked);
    });
  },

  lock() {
    const p = this.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  },

  // Mouse position in normalized device coordinates (-1..1), for picking in the top-down view.
  mouseNDC() {
    return { x: (this.mouse.x / window.innerWidth) * 2 - 1, y: -(this.mouse.y / window.innerHeight) * 2 + 1 };
  },

  down(code) { return !!this.keys[code]; },
  justPressed(code) { return !!this.pressed[code]; },

  endFrame() {
    this.pressed = {};
    this.mouse.leftPressed = this.mouse.rightPressed = false;
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.wheel = 0;
  }
};
