/* geo.js — Geometria: ponto-em-polígono (máscara de SP), distâncias e grade.
   Trabalha com GeoJSON [lon, lat]. Sem dependência de Leaflet. */
(function (global) {
  'use strict';

  /** Ray casting em um anel [[lon,lat],...]. */
  function pontoNoAnel(lon, lat, anel) {
    let dentro = false;
    for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      const xi = anel[i][0], yi = anel[i][1];
      const xj = anel[j][0], yj = anel[j][1];
      if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  }

  /** Prepara um Feature/Geometry (Polygon|MultiPolygon) com bbox por polígono. */
  function prepararMascara(geojson) {
    const geom = geojson.type === 'Feature' ? geojson.geometry : geojson;
    const poligonos = geom.type === 'MultiPolygon' ? geom.coordinates : [geom.coordinates];
    const itens = poligonos.map((aneis) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      aneis[0].forEach(([x, y]) => {
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      });
      return { aneis, bbox: [minX, minY, maxX, maxY] };
    });
    const bbox = itens.reduce((b, p) => [
      Math.min(b[0], p.bbox[0]), Math.min(b[1], p.bbox[1]),
      Math.max(b[2], p.bbox[2]), Math.max(b[3], p.bbox[3]),
    ], [Infinity, Infinity, -Infinity, -Infinity]);
    return { geom, itens, bbox };
  }

  /** true se (lat, lon) está dentro da máscara (respeita buracos). */
  function pontoNaMascara(mascara, lat, lon) {
    const [minX, minY, maxX, maxY] = mascara.bbox;
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) return false;
    for (const p of mascara.itens) {
      const b = p.bbox;
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      if (!pontoNoAnel(lon, lat, p.aneis[0])) continue;
      let emBuraco = false;
      for (let k = 1; k < p.aneis.length; k++) {
        if (pontoNoAnel(lon, lat, p.aneis[k])) { emBuraco = true; break; }
      }
      if (!emBuraco) return true;
    }
    return false;
  }

  /** Distância em km (haversine). */
  function distanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const rad = (g) => (g * Math.PI) / 180;
    const dLat = rad(lat2 - lat1), dLon = rad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /**
   * Grade regular alinhada a múltiplos de `passo` graus, filtrada pela máscara.
   * Pontos fora do estado são descartados.
   */
  function gerarGrade(mascara, passo) {
    const [minX, minY, maxX, maxY] = mascara.bbox;
    const pontos = [];
    const arred = (v) => Math.round(v * 1e4) / 1e4;
    const lat0 = Math.ceil(minY / passo) * passo;
    const lon0 = Math.ceil(minX / passo) * passo;
    for (let lat = lat0; lat <= maxY; lat += passo) {
      for (let lon = lon0; lon <= maxX; lon += passo) {
        const la = arred(lat), lo = arred(lon);
        if (pontoNaMascara(mascara, la, lo)) pontos.push({ lat: la, lon: lo });
      }
    }
    return pontos;
  }

  global.Geo = { pontoNoAnel, prepararMascara, pontoNaMascara, distanciaKm, gerarGrade };
})(typeof window !== 'undefined' ? window : globalThis);
