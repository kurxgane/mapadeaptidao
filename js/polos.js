/* polos.js — Atalhos para polos/regiões agrícolas do Estado de São Paulo.
   Somente municípios paulistas (coordenadas do centro urbano, WGS84). */
(function (global) {
  'use strict';

  const POLOS = [
    { id: 'ribeirao-preto',  nome: 'Ribeirão Preto',        lat: -21.1775, lon: -47.8103 },
    { id: 'bebedouro',       nome: 'Bebedouro',             lat: -20.9493, lon: -48.4790 },
    { id: 'barretos',        nome: 'Barretos',              lat: -20.5573, lon: -48.5678 },
    { id: 'jaboticabal',     nome: 'Jaboticabal',           lat: -21.2554, lon: -48.3222 },
    { id: 'piracicaba',      nome: 'Piracicaba',            lat: -22.7253, lon: -47.6492 },
    { id: 'sao-jose-rio-preto', nome: 'São José do Rio Preto', lat: -20.8113, lon: -49.3758 },
    { id: 'presidente-prudente', nome: 'Presidente Prudente', lat: -22.1256, lon: -51.3889 },
    { id: 'aracatuba',       nome: 'Araçatuba',             lat: -21.2089, lon: -50.4328 },
    { id: 'bauru',           nome: 'Bauru',                 lat: -22.3147, lon: -49.0587 },
    { id: 'marilia',         nome: 'Marília',               lat: -22.2139, lon: -49.9456 },
    { id: 'campinas',        nome: 'Campinas',              lat: -22.9056, lon: -47.0608 },
    { id: 'franca',          nome: 'Franca',                lat: -20.5386, lon: -47.4009 },
    { id: 'assis',           nome: 'Assis',                 lat: -22.6619, lon: -50.4119 },
    { id: 'ourinhos',        nome: 'Ourinhos',              lat: -22.9797, lon: -49.8697 },
    { id: 'itapetininga',    nome: 'Itapetininga',          lat: -23.5917, lon: -48.0531 },
    { id: 'araraquara',      nome: 'Araraquara',            lat: -21.7947, lon: -48.1756 },
    { id: 'limeira',         nome: 'Limeira',               lat: -22.5647, lon: -47.4017 },
  ];

  /** Polo mais próximo de (lat, lon) com a distância em km. */
  function maisProximo(lat, lon) {
    let melhor = null;
    POLOS.forEach((p) => {
      const d = global.Geo.distanciaKm(lat, lon, p.lat, p.lon);
      if (!melhor || d < melhor.km) melhor = { polo: p, km: d };
    });
    return melhor;
  }

  global.Polos = { POLOS, maisProximo };
})(typeof window !== 'undefined' ? window : globalThis);
