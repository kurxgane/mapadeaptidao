/* municipio.js — Identificação do município por geocodificação reversa (Nominatim/OSM).
   - Melhor esforço: se falhar, o sistema continua e exibe "não identificado".
   - Respeita a política de uso do Nominatim: consultas espaçadas (debounce feito no app),
     cancelamento da anterior e cache por ~1 km. Sem chave de API.
   - A região exibida é sempre calculada localmente (polo agrícola mais próximo). */
(function (global) {
  'use strict';

  const URL_BASE = 'https://nominatim.openstreetmap.org/reverse';
  const cache = new Map();

  const chave = (lat, lon) => `${lat.toFixed(2)}|${lon.toFixed(2)}`;

  /** @returns {Promise<{municipio:string|null, estado:string|null}>} */
  async function reverso(lat, lon, sinal) {
    const k = chave(lat, lon);
    if (cache.has(k)) return cache.get(k);

    const url = `${URL_BASE}?format=jsonv2&zoom=10&addressdetails=1&accept-language=pt-BR&lat=${lat}&lon=${lon}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    const aoAbortar = () => ctrl.abort();
    if (sinal) sinal.addEventListener('abort', aoAbortar, { once: true });
    try {
      const resp = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const json = await resp.json();
      const a = (json && json.address) || {};
      const estado = a.state || null;
      let municipio = a.city || a.town || a.village || a.municipality || a.county || null;
      // Se o serviço situar o ponto em outro estado (divisa vs. contorno simplificado), não afirma município.
      if (estado && !/s[ãa]o paulo/i.test(estado)) municipio = null;
      const resultado = { municipio, estado };
      cache.set(k, resultado);
      return resultado;
    } finally {
      clearTimeout(timer);
      if (sinal) sinal.removeEventListener('abort', aoAbortar);
    }
  }

  global.Municipio = { reverso };
})(typeof window !== 'undefined' ? window : globalThis);
