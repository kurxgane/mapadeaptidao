/* culturas.js — PARÂMETROS DO MODELO DE APTIDÃO
   ---------------------------------------------------------------------------
   ATENÇÃO: os valores abaixo são VALORES INICIAIS do modelo, NÃO validados
   cientificamente e sem recomendação agronômica oficial. A investigação da
   Fase 3 encontrou APOIO PARCIAL na literatura apenas para algumas faixas de
   temperatura (e a ordem de grandeza de algumas faixas de chuva), em documentos
   como o ZARC/MAPA e a Embrapa; tolerâncias, pesos, umidade relativa, radiação
   e a maior parte dos Kc NÃO têm fundamentação encontrada. Detalhes e fontes
   (com suas limitações) em METODOLOGIA.md. Antes de uso técnico, valide cada
   valor em fontes oficiais (ex.: Embrapa, IAC, ZARC/MAPA) e registre-a em `fonte`.

   Estrutura de cada variável:
     min / max   → faixa considerada ADEQUADA pelo modelo
     tolerancia  → margem (na mesma unidade) além da faixa em que a condição
                   ainda é "moderada"; além disso é "inadequada"
     critico     → se true, condição inadequada torna a cultura INAPTA;
                   se false, rebaixa no máximo para MODERADA

   Unidades: temperatura (°C, média do período) · precipitação (mm/mês, média
   do período) · umidade relativa (%, média) · radiação (MJ/m²/dia, média).
   `periodoPadrao`: 'anual' | 'safra' (Out–Mar) | 'safrinha' (Abr–Set).
   `kc`: coeficiente de cultura médio (simplificação) usado na necessidade hídrica.
   --------------------------------------------------------------------------- */
(function (global) {
  'use strict';

  const FONTE_PADRAO = 'Valor inicial ilustrativo do modelo — não validado. Substituir por fonte técnica oficial.';

  const META = {
    rotulo: 'Parâmetros do modelo de aptidão',
    aviso: 'Algumas faixas têm apoio parcial em documentos técnicos; outras são ilustrativas. Nenhuma está validada cientificamente. Ajuste-as se tiver fonte técnica.',
  };

  const variavel = (min, max, tolerancia, critico, extra = {}) => (
    { min, max, tolerancia, critico, fonte: FONTE_PADRAO, validado: false, ...extra }
  );

  const CULTURAS = {
    cana: {
      nome: 'Cana-de-Açúcar',
      cientifico: 'Saccharum spp.',
      periodoPadrao: 'anual',
      kc: 0.9,
      temperatura:  variavel(21, 30, 3, true),
      precipitacao: variavel(90, 150, 40, true),
      umidade:      variavel(55, 85, 10, false),
      radiacao:     variavel(14, 25, 3, false),
    },
    milho: {
      nome: 'Milho',
      cientifico: 'Zea mays',
      periodoPadrao: 'safra',
      kc: 0.85,
      temperatura:  variavel(20, 28, 3, true),
      precipitacao: variavel(90, 170, 40, true),
      umidade:      variavel(50, 80, 10, false),
      radiacao:     variavel(14, 25, 3, false),
    },
    soja: {
      nome: 'Soja',
      cientifico: 'Glycine max',
      periodoPadrao: 'safra',
      kc: 0.85,
      temperatura:  variavel(20, 30, 3, true),
      precipitacao: variavel(90, 170, 40, true),
      umidade:      variavel(55, 85, 10, false),
      radiacao:     variavel(14, 25, 3, false),
    },
    laranja: {
      nome: 'Laranja',
      cientifico: 'Citrus sinensis',
      periodoPadrao: 'anual',
      kc: 0.7,
      temperatura:  variavel(20, 30, 3, true),
      precipitacao: variavel(75, 150, 40, true),
      umidade:      variavel(55, 80, 10, false),
      radiacao:     variavel(14, 25, 3, false),
    },
    amendoim: {
      nome: 'Amendoim',
      cientifico: 'Arachis hypogaea',
      periodoPadrao: 'safra',
      kc: 0.8,
      temperatura:  variavel(22, 30, 3, true),
      precipitacao: variavel(80, 170, 40, true),
      umidade:      variavel(50, 75, 10, false),
      radiacao:     variavel(15, 25, 3, false),
    },
  };

  /** Metadados das variáveis (rótulos, unidades e limites dos sliders). */
  const VARIAVEIS = {
    temperatura:  { rotulo: 'Temperatura',    unidade: '°C',        sliderMin: 5,  sliderMax: 40,  passo: 0.5, casas: 1 },
    precipitacao: { rotulo: 'Precipitação',   unidade: 'mm/mês',    sliderMin: 0,  sliderMax: 400, passo: 5,   casas: 0 },
    umidade:      { rotulo: 'Umidade relativa', unidade: '%',       sliderMin: 20, sliderMax: 100, passo: 1,   casas: 0 },
    radiacao:     { rotulo: 'Radiação solar', unidade: 'MJ/m²/dia', sliderMin: 5,  sliderMax: 30,  passo: 0.5, casas: 1 },
  };

  /** Peso de cada variável no índice numérico (0–100) — a classe NÃO depende dele. */
  const PESOS = { temperatura: 0.30, precipitacao: 0.35, umidade: 0.15, radiacao: 0.20 };

  const PERIODOS = {
    anual:    { rotulo: 'Ano todo (12 meses)',      meses: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    safra:    { rotulo: 'Safra principal (Out–Mar)', meses: [9, 10, 11, 0, 1, 2] },
    safrinha: { rotulo: 'Safrinha / Inverno (Abr–Set)', meses: [3, 4, 5, 6, 7, 8] },
  };

  const clonarParametros = (chave) => JSON.parse(JSON.stringify(CULTURAS[chave]));

  global.Culturas = { CULTURAS, VARIAVEIS, PESOS, PERIODOS, META, clonarParametros };
})(typeof window !== 'undefined' ? window : globalThis);
