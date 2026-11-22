// Input di gioco: tastiera, movimento del mouse (Pointer Lock) e rotella.

const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'Tab']);

export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.enabled = true;

    this._down = (e) => {
      if (!this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    };
    this._up = (e) => { this.keys.delete(e.code); };
    this._move = (e) => {
      if (!this.enabled || !document.pointerLockElement) return;
      // Alcuni browser generano picchi anomali al momento del lock: li scartiamo.
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    };
    this._wheel = (e) => {
      if (!this.enabled || !document.pointerLockElement) return;
      this.wheel += Math.sign(e.deltaY);
    };
    this._blur = () => this.reset();
    this.mouseDown = false;
    this.rightDown = false;
    this._mdown = (e) => {
      if (!this.enabled || !document.pointerLockElement) return;
      if (e.button === 0) {
        this.mouseDown = true;
        this.pressed.add('Mouse0');
      } else if (e.button === 2) {
        this.rightDown = true;
        this.pressed.add('Mouse2');
      }
    };
    this._mup = (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.rightDown = false;
    };
    // Il tasto destro serve per mirare: niente menu contestuale del browser durante il gioco
    this._ctx = (e) => { if (document.pointerLockElement) e.preventDefault(); };
  }

  attach() {
    window.addEventListener('keydown', this._down);
    window.addEventListener('keyup', this._up);
    window.addEventListener('mousemove', this._move);
    window.addEventListener('wheel', this._wheel, { passive: true });
    window.addEventListener('blur', this._blur);
    window.addEventListener('mousedown', this._mdown);
    window.addEventListener('mouseup', this._mup);
    window.addEventListener('contextmenu', this._ctx);
  }

  detach() {
    window.removeEventListener('contextmenu', this._ctx);
    window.removeEventListener('mousedown', this._mdown);
    window.removeEventListener('mouseup', this._mup);
    window.removeEventListener('keydown', this._down);
    window.removeEventListener('keyup', this._up);
    window.removeEventListener('mousemove', this._move);
    window.removeEventListener('wheel', this._wheel);
    window.removeEventListener('blur', this._blur);
    this.reset();
  }

  reset() {
    this.mouseDown = false;
    this.rightDown = false;
    this.keys.clear();
    this.pressed.clear();
    this.mouseDX = this.mouseDY = this.wheel = 0;
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** true una sola volta per pressione */
  consumePressed(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    return false;
  }

  consumeMouse() {
    const r = { dx: this.mouseDX, dy: this.mouseDY, wheel: this.wheel };
    this.mouseDX = this.mouseDY = this.wheel = 0;
    return r;
  }

  /** Da chiamare a fine frame: scarta le pressioni non consumate. */
  endFrame() {
    this.pressed.clear();
  }
}
