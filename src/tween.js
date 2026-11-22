// Sistema di tween minimale, guidato dal game loop (dt in secondi).

export const Ease = {
  linear: (t) => t,
  inQuad: (t) => t * t,
  outQuad: (t) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t) => t * t * t,
  outCubic: (t) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  inOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  outBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  inOutQuint: (t) => (t < 0.5 ? 16 * t * t * t * t * t : 1 - Math.pow(-2 * t + 2, 5) / 2),
};

export class TweenManager {
  constructor() {
    this.items = [];
  }

  /**
   * Avvia un tween. update(e, k) riceve il valore con easing e il progresso lineare.
   * Ritorna una Promise risolta al termine (mai rigettata).
   */
  to({ duration = 1, delay = 0, ease = Ease.inOutCubic, update = null, group = 'default' } = {}) {
    return new Promise((resolve) => {
      this.items.push({
        elapsed: -delay,
        duration: Math.max(duration, 0.0001),
        ease,
        update,
        resolve,
        group,
        dead: false,
      });
    });
  }

  wait(seconds, group = 'default') {
    return this.to({ duration: seconds, ease: Ease.linear, group });
  }

  update(dt) {
    if (this.items.length === 0) return;
    const snapshot = this.items.slice();
    for (const tw of snapshot) {
      if (tw.dead) continue;
      tw.elapsed += dt;
      if (tw.elapsed < 0) continue;
      const k = Math.min(1, tw.elapsed / tw.duration);
      if (tw.update) tw.update(tw.ease(k), k);
      if (k >= 1) {
        tw.dead = true;
        const idx = this.items.indexOf(tw);
        if (idx >= 0) this.items.splice(idx, 1);
        tw.resolve();
      }
    }
  }

  /** Interrompe tutti i tween di un gruppo (le promise restano pendenti). */
  cancelGroup(group) {
    for (const tw of this.items) if (tw.group === group) tw.dead = true;
    this.items = this.items.filter((tw) => !tw.dead);
  }
}

export const tweens = new TweenManager();

export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
