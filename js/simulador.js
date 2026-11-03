/* simulador.js — Gerador LOCAL de clima sintético para o Estado de São Paulo.
   Usado no Modo Simulação e como fallback quando a NASA POWER está indisponível.
   - Determinístico: o mesmo ponto sempre gera os mesmos valores (sem Math.random
     solto), então a classificação não "pisca" a cada clique.
   - Aproximação qualitativa (gradientes de latitude/longitude, sazonalidade
     úmida no verão e seca no inverno). NÃO representa dados observados. */
(function (global) {
  'use strict';

  function mulberry32(semente) {
    let a = semente >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const hash = (lat, lon) => Math.imul(Math.round(lat * 100) + 9000, 73856093) ^ Math.imul(Math.round(lon * 100) + 18000, 19349663);

  /** Retorna { meses: [{temp, precip, umidade, radiacao}×12], dias } */
  function gerar(lat, lon) {
    const rnd = mulberry32(hash(lat, lon));
    const sul = Math.max(0, -lat - 20);                  // 0 (norte de SP) → ~5 (sul)
    const oeste = (-47.5 - lon) / 5;                     // >0 a oeste, <0 a leste
    // Regiões qualitativas (aproximações grosseiras, só para dar variação espacial ao simulador):
    const litoral = lat < -23.2 && lon > -47.3 ? 1 : (lat < -24 && lon > -48.5 ? 0.7 : 0); // costa/Vale do Ribeira: úmido
    const planaltoSul = lat < -23.4 && lon > -49.5 && !litoral ? 1 : 0;                       // planalto sul: mais frio
    const mantiqueira = lat > -23.2 && lon > -46.6 ? 1 : 0;                                    // serra a nordeste: mais frio

    const tAnual = 25.2 - 0.85 * sul + 0.8 * oeste - 0.6 * litoral - 1.6 * planaltoSul - 2.4 * mantiqueira;
    const amplitude = 2.3 + 0.45 * sul;
    const chuvaAnual = 1250 + 60 * sul - 80 * Math.max(0, oeste) + 750 * litoral + 120 * mantiqueira;
    const sazonalChuva = 0.55 + 0.4 * (1 - sul / 5);     // verão úmido mais marcante ao norte

    const fase = (m) => Math.cos((2 * Math.PI * (m - 0.5)) / 12); // pico em jan/fev
    const pesos = Array.from({ length: 12 }, (_, m) => Math.max(0.05, 1 + sazonalChuva * fase(m)));
    const somaPesos = pesos.reduce((s, v) => s + v, 0);

    const meses = Array.from({ length: 12 }, (_, m) => {
      const f = fase(m);
      const ruido = () => rnd() * 2 - 1;
      const chuva = chuvaAnual * (pesos[m] / somaPesos) * (1 + 0.1 * ruido());
      return {
        temp: Math.round((tAnual + amplitude * f + 0.3 * ruido()) * 10) / 10,
        precip: Math.max(0, Math.round(chuva)),
        umidade: Math.round(Math.min(95, Math.max(35, 70 + 7 * f + 5 * litoral - 2 * Math.max(0, oeste) + 2 * ruido()))),
        radiacao: Math.round((17.9 + 4.5 * f - 1.2 * (chuva / (chuvaAnual / 6)) - 1.6 * litoral - 0.5 * sul + 0.4 * ruido()) * 10) / 10,
      };
    });
    return { meses, dias: global.Util.diasDoMes(null) };
  }

  /* Ajuste manual do clima simulado (só Modo Simulação): permite forçar calor/frio e
     mais/menos chuva para testar a classificação. Não afeta dados da NASA POWER. */
  const ajuste = { temperatura: 0, chuva: 0, umidade: 0, radiacao: 0 };  // °C; % sobre a chuva; pontos percentuais; MJ/m²/dia

  function definirAjuste(novo) {
    if (novo && Number.isFinite(novo.temperatura)) ajuste.temperatura = novo.temperatura;
    if (novo && Number.isFinite(novo.chuva)) ajuste.chuva = novo.chuva;
    if (novo && Number.isFinite(novo.umidade)) ajuste.umidade = novo.umidade;
    if (novo && Number.isFinite(novo.radiacao)) ajuste.radiacao = novo.radiacao;
  }
  const obterAjuste = () => ({ ...ajuste });

  /** Igual a gerar(), aplicando o ajuste manual atual. */
  function gerarAjustado(lat, lon) {
    const c = gerar(lat, lon);
    if (!ajuste.temperatura && !ajuste.chuva && !ajuste.umidade && !ajuste.radiacao) return c;
    const fator = Math.max(0, 1 + ajuste.chuva / 100);
    return {
      ...c,
      meses: c.meses.map((m) => ({
        ...m,
        temp: Math.round((m.temp + ajuste.temperatura) * 10) / 10,
        precip: Math.max(0, Math.round(m.precip * fator)),
        umidade: Math.min(100, Math.max(0, Math.round(m.umidade + ajuste.umidade))),
        radiacao: Math.max(0, Math.round((m.radiacao + ajuste.radiacao) * 10) / 10),
      })),
    };
  }

  global.Simulador = { gerar, gerarAjustado, definirAjuste, obterAjuste };
})(typeof window !== 'undefined' ? window : globalThis);
