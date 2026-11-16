export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Map();
    this.buttons = new Set();
    this.pressed = new Set();
    this.dx = 0;
    this.dy = 0;
    this.wheel = 0;
    this.mouseDelta = { dx: 0, dy: 0 };
    this.listeners = [];
    canvas.tabIndex = 0;
    const on = (target, type, handler, options) => {
      target.addEventListener(type, handler, options);
      this.listeners.push(() => target.removeEventListener(type, handler, options));
    };
    on(window, 'keydown', (event) => {
      if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') return;
      if (!this.keys.get(event.code)) this.pressed.add(event.code);
      this.keys.set(event.code, true);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
    });
    // Releases can arrive after focus has moved to a menu or outside the canvas.
    on(window, 'keyup', (event) => this.keys.set(event.code, false));
    on(canvas, 'mousedown', (event) => {
      canvas.focus();
      if (this.locked) this.buttons.add(event.button);
    });
    on(window, 'mouseup', (event) => this.buttons.delete(event.button));
    on(document, 'mousemove', (event) => {
      if (!this.locked) return;
      this.dx += event.movementX || 0;
      this.dy += event.movementY || 0;
    });
    on(canvas, 'wheel', (event) => {
      if (this.locked) this.wheel += event.deltaY;
      event.preventDefault();
    }, { passive: false });
    on(canvas, 'contextmenu', (event) => event.preventDefault());
    on(document, 'pointerlockchange', () => { if (!this.locked) this.clear(); });
    on(window, 'blur', () => this.clear());
  }

  get locked() { return document.pointerLockElement === this.canvas; }
  isDown(code) { return this.keys.get(code) === true; }
  isMouseDown(button = 0) { return this.buttons.has(button); }
  consumePress(code) {
    const value = this.pressed.has(code);
    this.pressed.delete(code);
    return value;
  }
  consumeMouseDelta() {
    const delta = this.mouseDelta;
    delta.dx = this.dx; delta.dy = this.dy;
    this.dx = this.dy = 0;
    return delta;
  }
  consumeWheel() {
    const value = this.wheel;
    this.wheel = 0;
    return value;
  }
  clear() {
    this.keys.clear();
    this.buttons.clear();
    this.pressed.clear();
    this.dx = this.dy = this.wheel = 0;
  }
  dispose() { this.listeners.forEach((remove) => remove()); this.clear(); }
}
