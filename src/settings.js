// Impostazioni grafiche e di controllo, salvate a parte rispetto alla partita.

const KEY = 'sfp_settings_v1';

export const DEFAULT_SETTINGS = {
  sensitivity: 1.0, // moltiplicatore
  invertY: false,
  fov: 62,
  shadows: 'high', // 'high' | 'low' | 'off'
  quality: 'high', // 'high' | 'medium' | 'low' (pixel ratio)
  showMinimap: true,
};

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    return { ...DEFAULT_SETTINGS, ...(raw ? JSON.parse(raw) : {}) };
  } catch (e) {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage non disponibile */ }
}

export function pixelRatioFor(quality) {
  const dpr = window.devicePixelRatio || 1;
  if (quality === 'low') return Math.min(dpr, 0.85);
  if (quality === 'medium') return Math.min(dpr, 1.25);
  return Math.min(dpr, 2);
}
