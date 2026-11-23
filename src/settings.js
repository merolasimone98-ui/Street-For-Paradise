// Impostazioni grafiche, audio e di controllo, salvate a parte rispetto alla partita.

const KEY = 'sfp_settings_v1';

export const DEFAULT_SETTINGS = {
  masterVolume: 0.8, // 0..1
  musicVolume: 0.55,
  sfxVolume: 0.8,
  sensitivity: 1.0, // moltiplicatore
  invertY: false,
  fov: 62,
  shadows: 'high', // 'high' | 'low' | 'off'
  quality: 'high', // 'high' | 'medium' | 'low' (pixel ratio)
  showMinimap: true,
  lang: 'it', // 'it' | 'en'
  gearbox: 'auto', // 'auto' | 'manual' (E marcia su, Q marcia giù)
  speedUnit: 'kmh', // 'kmh' | 'mph'
};

let cache = null;
const listeners = new Set();

export function loadSettings() {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    cache = { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch (e) {
    cache = { ...DEFAULT_SETTINGS };
  }
  return cache;
}

export function saveSettings(s) {
  cache = s;
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage non disponibile */ }
  for (const fn of listeners) fn(s);
}

/** Aggiorna una singola impostazione e notifica audio/gioco. */
export function setSetting(key, value) {
  const s = loadSettings();
  s[key] = value;
  saveSettings(s);
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function pixelRatioFor(quality) {
  const dpr = window.devicePixelRatio || 1;
  if (quality === 'low') return Math.min(dpr, 0.85);
  if (quality === 'medium') return Math.min(dpr, 1.25);
  // Tetto a 1,5: oltre, su schermi HiDPI e telefoni, il costo in pixel cresce senza un guadagno visibile
  return Math.min(dpr, 1.5);
}

/** HTML dei controlli impostazioni (usato nel menu principale e nella pausa). */
export function settingsFormHtml(s, { full = true } = {}) {
  const pct = (v) => Math.round(v * 100);
  const slider = (key, label, min, max, step, value, fmt) =>
    `<label class="set-row"><span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-set="${key}"><b data-out="${key}">${fmt(value)}</b></label>`;
  let html = `<div class="settings">
    ${slider('masterVolume', 'Volume generale', 0, 1, 0.01, s.masterVolume, (v) => pct(v) + '%')}
    ${slider('musicVolume', 'Volume musica', 0, 1, 0.01, s.musicVolume, (v) => pct(v) + '%')}
    ${slider('sfxVolume', 'Volume effetti (SFX)', 0, 1, 0.01, s.sfxVolume, (v) => pct(v) + '%')}
    ${slider('fov', 'Campo visivo (FOV)', 50, 95, 1, s.fov, (v) => v + '°')}`;
  if (full) {
    html += `
    ${slider('sensitivity', 'Sensibilità del mouse', 0.3, 2.5, 0.05, s.sensitivity, (v) => Number(v).toFixed(2) + '×')}
    <label class="set-row"><span>Inverti asse Y</span><input type="checkbox" ${s.invertY ? 'checked' : ''} data-set="invertY"><b></b></label>
    <label class="set-row"><span>Ombre</span><select data-set="shadows">${[['high', 'Alte'], ['low', 'Basse'], ['off', 'Disattivate']].map(([v, l]) => `<option value="${v}" ${s.shadows === v ? 'selected' : ''}>${l}</option>`).join('')}</select><b></b></label>
    <label class="set-row"><span>Qualità grafica</span><select data-set="quality">${[['high', 'Alta'], ['medium', 'Media'], ['low', 'Bassa']].map(([v, l]) => `<option value="${v}" ${s.quality === v ? 'selected' : ''}>${l}</option>`).join('')}</select><b></b></label>
    <label class="set-row"><span>Minimappa</span><input type="checkbox" ${s.showMinimap ? 'checked' : ''} data-set="showMinimap"><b></b></label>
    <div class="set-group">Guida</div>
    <label class="set-row"><span>Cambio</span><select data-set="gearbox">${[['auto', 'Automatico'], ['manual', 'Manuale (E marcia su · Q marcia giù)']].map(([v, l]) => `<option value="${v}" ${s.gearbox === v ? 'selected' : ''}>${l}</option>`).join('')}</select><b></b></label>
    <label class="set-row"><span>Tachimetro</span><select data-set="speedUnit">${[['kmh', 'km/h'], ['mph', 'mph']].map(([v, l]) => `<option value="${v}" ${s.speedUnit === v ? 'selected' : ''}>${l}</option>`).join('')}</select><b></b></label>
    <div class="set-group">Lingua</div>
    <label class="set-row"><span>Lingua</span><select data-set="lang">${[['it', 'Italiano'], ['en', 'English']].map(([v, l]) => `<option value="${v}" ${s.lang === v ? 'selected' : ''}>${l}</option>`).join('')}</select><b></b></label>`;
  }
  html += '<p class="muted">Le impostazioni vengono salvate automaticamente su questo browser.</p></div>';
  return html;
}

/** Collega gli input generati da settingsFormHtml a setSetting (con aggiornamento delle etichette). */
export function bindSettingsForm(root) {
  const handler = (e) => {
    const el = e.target.closest('[data-set]');
    if (!el) return;
    const key = el.dataset.set;
    let value;
    if (el.type === 'checkbox') value = el.checked;
    else if (el.type === 'range') value = Number(el.value);
    else value = el.value;
    const out = root.querySelector(`[data-out="${key}"]`);
    if (out) {
      if (key.endsWith('Volume')) out.textContent = Math.round(value * 100) + '%';
      else if (key === 'fov') out.textContent = value + '°';
      else if (key === 'sensitivity') out.textContent = value.toFixed(2) + '×';
    }
    setSetting(key, value);
  };
  root.addEventListener('input', handler);
  root.addEventListener('change', handler);
  return () => {
    root.removeEventListener('input', handler);
    root.removeEventListener('change', handler);
  };
}
