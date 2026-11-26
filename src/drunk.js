// Effetto visivo dell'ubriachezza: la scena viene renderizzata su una texture e poi distorta
// (onde, visione doppia, colori che ruotano, vignettatura). Intensità 0..1.
import * as THREE from 'three';

export class DrunkEffect {
  constructor(renderer) {
    this.renderer = renderer;
    this.size = new THREE.Vector2();
    renderer.getDrawingBufferSize(this.size);
    this.target = new THREE.WebGLRenderTarget(this.size.x, this.size.y, { type: THREE.HalfFloatType, depthBuffer: true });
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: this.target.texture }, amount: { value: 0 }, time: { value: 0 }, trip: { value: 0 } },
      vertexShader: `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float amount; uniform float time; uniform float trip;
        varying vec2 vUv;
        vec3 hueShift(vec3 c, float a) {
          const vec3 k = vec3(0.57735);
          float ca = cos(a);
          return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
        }
        void main() {
          vec2 uv = vUv;
          // Effetto allucinogeno (sostanze illegali): zoom pulsante, vortice, specchiatura a caleidoscopio
          if (trip > 0.001) {
            vec2 p = uv - 0.5;
            float r = length(p);
            float ang = atan(p.y, p.x) + sin(time * 0.7 + r * 9.0) * 0.55 * trip;
            float zoom = 1.0 + sin(time * 1.9) * 0.08 * trip;
            p = vec2(cos(ang), sin(ang)) * r / zoom;
            p.x = mix(p.x, abs(p.x), 0.5 * min(trip, 1.0) * (0.5 + 0.5 * sin(time * 0.35)));
            uv = p + 0.5;
          }
          uv += vec2(sin(uv.y * 11.0 + time * 2.1), cos(uv.x * 9.0 + time * 1.7)) * 0.013 * amount;
          vec2 off = vec2(sin(time * 0.8), cos(time * 0.63)) * 0.016 * amount;
          vec4 a = texture2D(tDiffuse, uv);
          vec4 b = texture2D(tDiffuse, uv + off);
          vec4 c = mix(a, b, 0.45 * amount);
          c.rgb = hueShift(c.rgb, sin(time * 0.6) * 1.3 * amount);
          if (trip > 0.001) {
            // Aberrazione cromatica forte e colori che ruotano senza sosta
            vec2 sp = vec2(0.012 + 0.01 * sin(time * 3.0), 0.0) * trip;
            c.r = mix(c.r, texture2D(tDiffuse, uv + sp).r, min(trip, 1.0));
            c.b = mix(c.b, texture2D(tDiffuse, uv - sp).b, min(trip, 1.0));
            c.rgb = hueShift(c.rgb, time * 1.6 * trip);
            c.rgb += vec3(0.25, 0.05, 0.35) * trip * (0.5 + 0.5 * sin(time * 4.0 + vUv.y * 20.0)) * 0.35;
          }
          float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
          c.rgb = mix(vec3(l), c.rgb, 1.0 + 0.7 * amount);
          float v = smoothstep(0.95, 0.25, length(vUv - 0.5));
          c.rgb *= mix(1.0, v, 0.55 * amount);
          gl_FragColor = c;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** Disegna la scena: normale se amount è ~0, altrimenti con l'effetto. */
  render(scene, camera, amount, time, trip = 0) {
    // trip 0..1.6: le sostanze più pesanti superano 1 (vortice, zoom e colori più forti; i mix restano limitati a 1)
    this.material.uniforms.trip.value = Math.min(1.6, trip);
    amount = Math.max(amount, Math.min(1, trip * 0.8));
    if (amount < 0.01) {
      this.renderer.render(scene, camera);
      return;
    }
    this.renderer.getDrawingBufferSize(this.size);
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) this.target.setSize(this.size.x, this.size.y);
    this.renderer.setRenderTarget(this.target);
    this.renderer.render(scene, camera);
    this.renderer.setRenderTarget(null);
    this.material.uniforms.amount.value = Math.min(1, amount);
    this.material.uniforms.time.value = time;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.target.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
