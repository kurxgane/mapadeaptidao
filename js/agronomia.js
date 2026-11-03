/* agronomia.js — MOTOR AGRONÔMICO (função pura: clima + parâmetros → resultado)
   Não acessa DOM, rede ou mapa. Recebe:
     clima:   { meses: [{ temp, precip, umidade, radiacao } × 12], dias: [12] }
              (precip = total do mês em mm)
     params:  objeto de cultura (ver culturas.js), possivelmente editado
     periodo: chave de PERIODOS
   Devolve um resultado estruturado usado pelo mapa, grade, gráficos e relatório. */
(function (global) {
  'use strict';

  const { PESOS, PERIODOS, VARIAVEIS } = global.Culturas;
  const U = global.Util;

  const CLASSES = {
    APTA:     { id: 'APTA',     rotulo: 'Apta',     emoji: '🟢', cor: '#2E7D32' },
    MODERADA: { id: 'MODERADA', rotulo: 'Moderada', emoji: '🟡', cor: '#FFB300' },
    INAPTA:   { id: 'INAPTA',   rotulo: 'Inapta',   emoji: '🔴', cor: '#D32F2F' },
  };

  /** Textos de cada limitação (abaixo/acima da faixa). */
  const TEXTOS = {
    temperatura:  { abaixo: 'Temperatura abaixo da faixa do modelo (limitação térmica por frio)', acima: 'Estresse térmico (temperatura acima da faixa do modelo)', limAbaixo: 'Frio / temperatura baixa', limAcima: 'Estresse térmico' },
    precipitacao: { abaixo: 'Precipitação abaixo da faixa do modelo (déficit hídrico)',           acima: 'Precipitação acima da faixa do modelo (excesso hídrico)',  limAbaixo: 'Déficit hídrico',          limAcima: 'Excesso hídrico' },
    umidade:      { abaixo: 'Umidade relativa abaixo da faixa do modelo',                          acima: 'Umidade relativa acima da faixa do modelo',                limAbaixo: 'Umidade inadequada (baixa)', limAcima: 'Umidade inadequada (alta)' },
    radiacao:     { abaixo: 'Radiação solar insuficiente para a faixa do modelo',                 acima: 'Radiação solar acima da faixa do modelo',                  limAbaixo: 'Radiação insuficiente',    limAcima: 'Radiação elevada' },
  };

  /** Avalia um valor contra {min,max,tolerancia}. Severidade 0 (ok) → 1 (muito fora). */
  function avaliarFator(valor, faixa) {
    const tol = Math.max(faixa.tolerancia, 1e-9);
    let desvio = 0;
    let lado = null;
    if (valor < faixa.min) { desvio = faixa.min - valor; lado = 'abaixo'; }
    else if (valor > faixa.max) { desvio = valor - faixa.max; lado = 'acima'; }

    if (!lado) return { status: 'adequada', lado: null, severidade: 0, desvio: 0 };
    if (desvio <= tol) return { status: 'moderada', lado, severidade: 0.5 * (desvio / tol), desvio };
    return { status: 'inadequada', lado, severidade: U.clamp(0.5 + 0.5 * ((desvio - tol) / tol), 0, 1), desvio };
  }

  /**
   * Evapotranspiração de referência (mm/dia) pelo método de Makkink (1957):
   * ET0 = 0,61 · Δ/(Δ+γ) · Rs/λ − 0,12, com Rs em MJ/m²/dia e λ = 2,45 MJ/kg.
   * Estimativa simples, baseada só em temperatura média e radiação (dados da NASA POWER).
   */
  function et0Makkink(tempC, radiacao) {
    const gama = 0.066; // kPa/°C (pressão ao nível do mar — simplificação)
    const delta = (4098 * 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3))) / (tempC + 237.3) ** 2;
    return Math.max(0, 0.61 * (delta / (delta + gama)) * (radiacao / 2.45) - 0.12);
  }

  /** Balanço hídrico mensal (12 meses): precipitação × necessidade (Kc·ET0). */
  function balancoHidrico(clima, kc, mesesPeriodo) {
    const noPeriodo = new Set(mesesPeriodo);
    const meses = clima.meses.map((m, i) => {
      const dias = clima.dias[i];
      const et0 = et0Makkink(m.temp, m.radiacao);
      const necessidade = et0 * kc * dias;
      const deficit = Math.max(0, necessidade - m.precip);
      const excedente = Math.max(0, m.precip - necessidade);
      return { precip: m.precip, et0: et0 * dias, necessidade, deficit, excedente, noPeriodo: noPeriodo.has(i) };
    });
    const doPeriodo = meses.filter((m) => m.noPeriodo);
    return {
      meses,
      deficitPeriodo: U.soma(doPeriodo.map((m) => m.deficit)),
      excedentePeriodo: U.soma(doPeriodo.map((m) => m.excedente)),
      necessidadePeriodo: U.soma(doPeriodo.map((m) => m.necessidade)),
    };
  }

  /**
   * Avaliação completa de uma cultura em um ponto.
   * opcoes.hidrico = false pula o balanço hídrico (usado ao colorir centenas de pontos da grade).
   */
  function avaliar(clima, params, periodoChave, opcoes = {}) {
    const periodo = PERIODOS[periodoChave] || PERIODOS.anual;
    const idx = periodo.meses;
    const sel = idx.map((i) => clima.meses[i]);

    const resumo = {
      temperatura: U.media(sel.map((m) => m.temp)),
      precipitacao: U.media(sel.map((m) => m.precip)),            // mm/mês (média do período)
      umidade: U.media(sel.map((m) => m.umidade)),
      radiacao: U.media(sel.map((m) => m.radiacao)),
      precipTotal: U.soma(sel.map((m) => m.precip)),              // mm no período
    };

    const fatores = Object.keys(VARIAVEIS).map((id) => {
      const faixa = params[id];
      const valor = resumo[id];
      const av = avaliarFator(valor, faixa);
      const t = TEXTOS[id];
      return {
        id,
        nome: VARIAVEIS[id].rotulo,
        unidade: VARIAVEIS[id].unidade,
        casas: VARIAVEIS[id].casas,
        valor,
        faixa: { min: faixa.min, max: faixa.max, tolerancia: faixa.tolerancia },
        critico: !!faixa.critico,
        ...av,
        texto: av.lado ? t[av.lado] : `${VARIAVEIS[id].rotulo} adequada`,
        limitante: av.lado ? (av.lado === 'abaixo' ? t.limAbaixo : t.limAcima) : null,
      };
    });

    // Classe: qualquer fator crítico inadequado → INAPTA; qualquer limitação → MODERADA.
    let classe = CLASSES.APTA;
    if (fatores.some((f) => f.status !== 'adequada')) classe = CLASSES.MODERADA;
    if (fatores.some((f) => f.status === 'inadequada' && f.critico)) classe = CLASSES.INAPTA;

    // Índice numérico 0–100 (apenas informativo).
    const indice = Math.round(100 * fatores.reduce((s, f) => s + PESOS[f.id] * (1 - f.severidade), 0));

    // Fatores fora da faixa, do mais severo ao menos severo (empate favorece fator crítico).
    const limitantes = fatores.filter((f) => f.status !== 'adequada')
      .sort((a, b) => (b.severidade - a.severidade) || (Number(b.critico) - Number(a.critico)));
    // Principal fator limitante: o mais severo. Se a classe é INAPTA, ele precisa ser um dos fatores críticos
    // que decidiram essa classe (um fator não crítico mais severo não pode "explicar" um INAPTA que ele não causou).
    const decisivos = classe.id === 'INAPTA' ? limitantes.filter((f) => f.status === 'inadequada' && f.critico) : limitantes;
    const principal = decisivos[0] || null;

    const hidrico = opcoes.hidrico === false ? null : balancoHidrico(clima, params.kc, idx);

    return {
      classe, indice, resumo, fatores, principal, limitantes, hidrico,
      periodo: { chave: periodoChave, rotulo: periodo.rotulo, meses: idx },
    };
  }

  global.Agronomia = { CLASSES, avaliar, avaliarFator, et0Makkink, balancoHidrico };
})(typeof window !== 'undefined' ? window : globalThis);
