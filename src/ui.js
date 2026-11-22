// Helper DOM condivisi: fade a schermo intero, toast, modale di conferma.

export const $ = (id) => document.getElementById(id);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Dissolvenza a schermo intero (indipendente dal game loop). */
export function fadeTo(opacity, duration = 0.6, color = null) {
  const el = $('fade');
  if (color) el.style.background = color;
  el.style.transition = `opacity ${duration}s ease`;
  void el.offsetWidth; // forza il reflow per far partire la transizione
  el.style.opacity = String(opacity);
  el.style.pointerEvents = opacity > 0.01 ? 'all' : 'none';
  return sleep(duration * 1000 + 30);
}

export function setFade(opacity, color = null) {
  const el = $('fade');
  if (color) el.style.background = color;
  el.style.transition = 'none';
  el.style.opacity = String(opacity);
  el.style.pointerEvents = opacity > 0.01 ? 'all' : 'none';
}

let toastTimer = null;
export function toast(text, ms = 2200) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

/** Modale di conferma. Ritorna Promise<boolean>. */
export function confirmDialog({ title, text, ok = 'Conferma', cancel = 'Annulla' }) {
  const modal = $('modal');
  const okBtn = $('modal-ok');
  const cancelBtn = $('modal-cancel');
  $('modal-title').textContent = title;
  $('modal-text').textContent = text;
  okBtn.textContent = ok;
  cancelBtn.textContent = cancel;
  modal.classList.remove('hidden');
  okBtn.focus();

  return new Promise((resolve) => {
    const close = (value) => {
      modal.classList.add('hidden');
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
      modal.removeEventListener('click', onBackdrop);
      window.removeEventListener('keydown', onKey, true);
      resolve(value);
    };
    const onOk = () => close(true);
    const onCancel = () => close(false);
    const onBackdrop = (e) => { if (e.target === modal) close(false); };
    const onKey = (e) => {
      if (e.code === 'Escape') { e.stopPropagation(); e.preventDefault(); close(false); }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') { e.stopPropagation(); e.preventDefault(); close(document.activeElement === cancelBtn ? false : true); }
    };
    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
    modal.addEventListener('click', onBackdrop);
    window.addEventListener('keydown', onKey, true);
  });
}

export function isModalOpen() {
  return !$('modal').classList.contains('hidden');
}

/** Libera ricorsivamente geometrie, materiali e texture di un oggetto Three.js. */
export function disposeObject3D(root) {
  if (!root) return;
  const textures = new Set();
  root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const mats = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    for (const m of mats) {
      for (const key of ['map', 'emissiveMap', 'specularMap', 'normalMap', 'roughnessMap', 'alphaMap', 'bumpMap']) {
        if (m[key]) textures.add(m[key]);
      }
      if (m.uniforms) {
        for (const u of Object.values(m.uniforms)) if (u && u.value && u.value.isTexture) textures.add(u.value);
      }
      m.dispose();
    }
  });
  textures.forEach((t) => t.dispose());
}
