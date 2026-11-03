/* nasa-power.js — Cliente da NASA POWER API (somente obtenção de dados).
   - Consulta mensal/climatológica (leve) em vez de séries diárias (365 × 4 valores).
   - Coordenadas arredondadas para múltiplos de 0,5° (GRADE DE CONSULTA do aplicativo): pontos vizinhos
     compartilham a mesma consulta → cache eficiente e menos requisições. Esse arredondamento é uma escolha do
     aplicativo e NÃO é a resolução nativa da NASA POWER, que é ~0,5°×0,625° (lat × lon) na meteorologia e
     ~1°×1° na radiação solar (https://power.larc.nasa.gov/docs/methodology/data/sources/). Num teste manual em
     Bebedouro, as coordenadas -20.95/-48.48 e -21.0/-48.5 devolveram os mesmos valores; não foi testado em
     outros pontos (em particular perto de bordas de célula).
   - Unidades da comunidade `ag` (conferidas em consulta direta à API): T2M °C · PRECTOTCORR (precipitação
     total corrigida) mm/dia · RH2M % · ALLSKY_SFC_SW_DWN MJ/m²/dia.
   - Cache em memória + localStorage (TTL 30 dias), deduplicação de requisições em
     andamento, timeout, 1 nova tentativa em erros transitórios e AbortSignal.
   Retorno canônico: { meses: [{temp, precip(mm/mês), umidade, radiacao}×12], dias: [12],
                       detalhe: { lacunas, radiacao, periodo (de header.range, ou null) } } */
(function (global) {
  'use strict';

  const BASE = 'https://power.larc.nasa.gov/api/temporal';
  const PARAMETROS = 'T2M,PRECTOTCORR,RH2M,ALLSKY_SFC_SW_DWN';
  const RESOLUCAO = 0.5;          // passo do arredondamento da consulta (grade do aplicativo), não a resolução nativa
  const TIMEOUT_MS = 15000;
  const TTL_MS = 30 * 24 * 3600 * 1000;
  const LS_CHAVE = 'aptidao-sp:nasa:v3';   // v2: guarda a unidade da radiação (detalhe.radiacao) · v3: guarda o período da climatologia (detalhe.periodo)
  const ABREV = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  class NasaPowerError extends Error {
    constructor(codigo, mensagem) { super(mensagem); this.name = 'NasaPowerError'; this.codigo = codigo; }
  }

  const memoria = new Map();      // chave → { t, dados }
  const emAndamento = new Map();  // chave → Promise
  let armazenamento = null;       // objeto espelhado no localStorage

  function carregarLS() {
    if (armazenamento) return armazenamento;
    armazenamento = {};
    try {
      const bruto = global.localStorage && global.localStorage.getItem(LS_CHAVE);
      if (bruto) armazenamento = JSON.parse(bruto) || {};
    } catch (_) { armazenamento = {}; }
    return armazenamento;
  }
  const salvarLS = (() => {
    let timer;
    return () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        try {
          const chaves = Object.keys(armazenamento);
          if (chaves.length > 400) { // poda os mais antigos
            chaves.sort((a, b) => armazenamento[a].t - armazenamento[b].t)
              .slice(0, chaves.length - 400).forEach((k) => delete armazenamento[k]);
          }
          global.localStorage.setItem(LS_CHAVE, JSON.stringify(armazenamento));
        } catch (_) { /* quota cheia / modo privado: segue só com memória */ }
      }, 500);
    };
  })();

  const encaixar = (v) => Math.round(v / RESOLUCAO) * RESOLUCAO;
  const arred = (v) => Math.round(v * 1e4) / 1e4;

  /** Coordenadas arredondadas para a grade de consulta de 0,5° (não a célula nativa da NASA) e chave de cache. */
  function celula(lat, lon, ano) {
    const la = arred(encaixar(lat)), lo = arred(encaixar(lon));
    return { lat: la, lon: lo, chave: `${la}|${lo}|${ano ?? 'clim'}` };
  }

  function montarUrl(lat, lon, ano) {
    const comum = `parameters=${PARAMETROS}&community=ag&longitude=${lon}&latitude=${lat}&format=json`;
    if (ano === null || ano === undefined) return `${BASE}/climatology/point?${comum}`;
    return `${BASE}/monthly/point?${comum}&start=${ano}&end=${ano}`;
  }

  /** Extrai 12 valores de um objeto {JAN..DEC, ANN} ou {YYYYMM.., YYYY13}. Ausentes → null. */
  function serieMensal(obj) {
    const saida = new Array(12).fill(null);
    Object.keys(obj || {}).forEach((k) => {
      let m = -1;
      if (/^[A-Z]{3}$/.test(k)) m = ABREV.indexOf(k);
      else if (/^\d{6}$/.test(k)) { const mm = Number(k.slice(4)); if (mm >= 1 && mm <= 12) m = mm - 1; }
      if (m >= 0) {
        const v = obj[k];
        saida[m] = typeof v === 'number' && Number.isFinite(v) && v > -900 ? v : null; // -999 = sem dado
      }
    });
    return saida;
  }

  /**
   * Preenche até 2 meses ausentes por interpolação linear entre os dois meses VÁLIDOS mais próximos
   * (um de cada lado, série tratada como cíclica: dez → jan). Usa apenas valores originais, nunca valores já
   * preenchidos. Para 1 mês ausente equivale à média dos vizinhos; para 2 consecutivos, a dois terços/um terço
   * do caminho. Mais de 2 ausentes → erro (sem inventar dados).
   */
  function preencherLacunas(serie, nome) {
    const faltas = serie.reduce((n, v) => n + (v === null ? 1 : 0), 0);
    if (faltas === 0) return { serie, faltas: 0 };
    if (faltas > 2) throw new NasaPowerError('SEM_DADOS', `Dados insuficientes para ${nome} (${faltas} meses ausentes).`);
    const copia = serie.slice();
    serie.forEach((v, i) => {
      if (v !== null) return;
      let dAnt = 1, dPos = 1;
      while (dAnt < 12 && serie[(i - dAnt + 12) % 12] === null) dAnt += 1;
      while (dPos < 12 && serie[(i + dPos) % 12] === null) dPos += 1;
      const ant = serie[(i - dAnt + 12) % 12], pos = serie[(i + dPos) % 12];
      if (ant === null || pos === null) throw new NasaPowerError('SEM_DADOS', `Dados insuficientes para ${nome}.`);
      copia[i] = ant + (pos - ant) * (dAnt / (dAnt + dPos));
    });
    return { serie: copia, faltas };
  }

  /**
   * Fator de conversão da radiação para MJ/m²/dia. Prioriza a unidade DECLARADA pela própria API
   * (json.parameters.ALLSKY_SFC_SW_DWN.units); só se ela não vier, usa o critério anterior de plausibilidade
   * (média < 9 ⇒ valores em kWh/m²/dia; em SP a média real fica em ~15–22 MJ/m²/dia).
   */
  function fatorRadiacao(json, serie) {
    const meta = json && json.parameters && json.parameters.ALLSKY_SFC_SW_DWN;
    const un = meta && typeof meta.units === 'string' ? meta.units : null;
    if (un && /kw\s*-?\s*h/i.test(un)) return { fator: 3.6, origem: 'declarada', unidade: un };
    if (un && /mj/i.test(un)) return { fator: 1, origem: 'declarada', unidade: un };
    const media = serie.reduce((s, v) => s + v, 0) / 12;
    return { fator: media < 9 ? 3.6 : 1, origem: 'estimada', unidade: un };
  }

  const MESES_EN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
  const NOMES_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

  /** Número do mês (1–12) a partir de "January", "Jan" etc.; 0 se não reconhecido. */
  function numeroDoMes(nome) {
    const n = String(nome).toLowerCase();
    if (n.length === 3) return MESES_EN[n] || 0;
    const i = NOMES_EN.indexOf(n);
    return i >= 0 ? i + 1 : 0;
  }

  /**
   * Período da climatologia, lido de `header.range` da resposta da NASA POWER. Exemplo observado:
   * "25-year Meteorological and Solar Monthly & Annual Climatologies (January 2001 - December 2025)".
   * Só interpreta o trecho "(Mês AAAA - Mês AAAA)". Campo ausente, formato diferente, mês desconhecido ou intervalo
   * invertido → null (nenhum período é inventado). O texto devolvido é montado só com nomes de mês e anos validados
   * (nunca repete o texto bruto da resposta).
   * Retorna { texto: 'janeiro de 2001 a dezembro de 2025', inicio: {mes, ano}, fim: {mes, ano} } ou null.
   */
  function periodoDaClimatologia(json) {
    const faixa = json && json.header && json.header.range;
    if (typeof faixa !== 'string') return null;
    const m = /\(\s*([A-Za-z]{3,9})\.?\s+(\d{4})\s*[-–—]\s*([A-Za-z]{3,9})\.?\s+(\d{4})\s*\)/.exec(faixa);
    if (!m) return null;
    const inicio = { mes: numeroDoMes(m[1]), ano: Number(m[2]) };
    const fim = { mes: numeroDoMes(m[3]), ano: Number(m[4]) };
    if (!inicio.mes || !fim.mes) return null;
    if (inicio.ano < 1950 || fim.ano > 2200) return null;
    if (fim.ano * 12 + fim.mes < inicio.ano * 12 + inicio.mes) return null;
    return { texto: `${MESES_PT[inicio.mes - 1]} de ${inicio.ano} a ${MESES_PT[fim.mes - 1]} de ${fim.ano}`, inicio, fim };
  }

  /** Converte a resposta JSON da API para o formato canônico. */
  function interpretar(json, ano) {
    const p = json && json.properties && json.properties.parameter;
    if (!p) throw new NasaPowerError('FORMATO', 'Resposta da NASA POWER sem o bloco de parâmetros.');
    const falta = ['T2M', 'PRECTOTCORR', 'RH2M', 'ALLSKY_SFC_SW_DWN'].filter((k) => !p[k]);
    if (falta.length) throw new NasaPowerError('SEM_DADOS', `Parâmetros ausentes na resposta: ${falta.join(', ')}.`);

    const T = preencherLacunas(serieMensal(p.T2M), 'temperatura');
    const P = preencherLacunas(serieMensal(p.PRECTOTCORR), 'precipitação');
    const R = preencherLacunas(serieMensal(p.RH2M), 'umidade');
    const S = preencherLacunas(serieMensal(p.ALLSKY_SFC_SW_DWN), 'radiação');
    const dias = global.Util.diasDoMes(ano ?? null);

    const rad = fatorRadiacao(json, S.serie);
    const fatorRad = rad.fator;

    const meses = Array.from({ length: 12 }, (_, i) => ({
      temp: T.serie[i],
      precip: Math.max(0, P.serie[i]) * dias[i],   // PRECTOTCORR (precipitação total corrigida), mm/dia → mm/mês; não é chuva efetiva
      umidade: R.serie[i],
      radiacao: S.serie[i] * fatorRad,
    }));
    return { meses, dias, detalhe: { lacunas: T.faltas + P.faltas + R.faltas + S.faltas, radiacao: rad, periodo: periodoDaClimatologia(json) } };
  }

  async function requisitar(url, sinalExterno) {
    const ctrl = new AbortController();
    let expirou = false;
    const timer = setTimeout(() => { expirou = true; ctrl.abort(); }, TIMEOUT_MS);
    const aoAbortar = () => ctrl.abort();
    if (sinalExterno) {
      if (sinalExterno.aborted) { clearTimeout(timer); throw new DOMException('Cancelado', 'AbortError'); }
      sinalExterno.addEventListener('abort', aoAbortar, { once: true });
    }
    try {
      const resp = await fetch(url, { signal: ctrl.signal });
      if (!resp.ok) throw new NasaPowerError(resp.status === 429 || resp.status >= 500 ? 'TRANSITORIO' : 'HTTP', `NASA POWER respondeu HTTP ${resp.status}.`);
      return await resp.json();
    } catch (e) {
      if (e instanceof NasaPowerError) throw e;
      if (e.name === 'AbortError') {
        if (sinalExterno && sinalExterno.aborted) throw e;                       // cancelamento do usuário
        if (expirou) throw new NasaPowerError('TRANSITORIO', 'Tempo esgotado ao consultar a NASA POWER.');
      }
      throw new NasaPowerError('TRANSITORIO', 'Falha de rede ou bloqueio (CORS/offline) ao consultar a NASA POWER.');
    } finally {
      clearTimeout(timer);
      if (sinalExterno) sinalExterno.removeEventListener('abort', aoAbortar);
    }
  }

  async function baixar(url, ano, sinal) {
    let ultimo;
    for (let tentativa = 0; tentativa < 2; tentativa++) {
      try { return interpretar(await requisitar(url, sinal), ano); }
      catch (e) {
        ultimo = e;
        if (e.name === 'AbortError' || !(e instanceof NasaPowerError) || e.codigo !== 'TRANSITORIO') throw e;
        await new Promise((r) => setTimeout(r, 800));
      }
    }
    throw ultimo;
  }

  /**
   * Espera o resultado de uma requisição compartilhada. Cancelar `sinal` faz ESTE consumidor sair na hora com
   * AbortError; a requisição só é interrompida quando o último consumidor desiste (e então é descartada, para
   * que a próxima consulta comece do zero). Cache e deduplicação continuam valendo para os demais.
   */
  function aguardar(entrada, sinal) {
    entrada.consumidores += 1;
    return new Promise((resolve, reject) => {
      let ativo = true;
      const sair = () => {
        if (!ativo) return false;
        ativo = false;
        entrada.consumidores -= 1;
        if (sinal) sinal.removeEventListener('abort', aoCancelar);
        return true;
      };
      function aoCancelar() {
        if (!sair()) return;
        if (entrada.consumidores === 0) {
          if (emAndamento.get(entrada.chave) === entrada) emAndamento.delete(entrada.chave);
          entrada.ctrl.abort();
        }
        reject(new DOMException('Cancelado', 'AbortError'));
      }
      // O tratamento é ligado antes de qualquer cancelamento, para a rejeição da requisição nunca ficar "órfã".
      entrada.promise.then((dados) => { if (sair()) resolve(dados); }, (erro) => { if (sair()) reject(erro); });
      if (sinal) { if (sinal.aborted) aoCancelar(); else sinal.addEventListener('abort', aoCancelar, { once: true }); }
    });
  }

  /**
   * Obtém clima mensal para (lat, lon). `ano` nulo = média climatológica de longo prazo (período definido pela NASA).
   * Resultado: { clima, celula:{lat,lon}, origemCache }
   */
  async function obter(lat, lon, { ano = null, sinal } = {}) {
    const c = celula(lat, lon, ano);
    const agora = Date.now();

    const emMem = memoria.get(c.chave);
    if (emMem && agora - emMem.t < TTL_MS) return { clima: emMem.dados, celula: c, origemCache: true };

    const ls = carregarLS();
    if (ls[c.chave] && agora - ls[c.chave].t < TTL_MS) {
      memoria.set(c.chave, ls[c.chave]);
      return { clima: ls[c.chave].dados, celula: c, origemCache: true };
    }

    let entrada = emAndamento.get(c.chave);
    if (!entrada) {
      // A requisição compartilhada tem um controlador PRÓPRIO: o cancelamento de um consumidor não a derruba
      // enquanto houver outro esperando por ela (ver `aguardar`).
      const ctrl = new AbortController();
      entrada = { chave: c.chave, ctrl, consumidores: 0 };
      entrada.promise = baixar(montarUrl(c.lat, c.lon, ano), ano, ctrl.signal)
        .then((dados) => {
          const reg = { t: Date.now(), dados };
          memoria.set(c.chave, reg);
          carregarLS()[c.chave] = reg;
          salvarLS();
          return dados;
        })
        .finally(() => { if (emAndamento.get(c.chave) === entrada) emAndamento.delete(c.chave); });
      emAndamento.set(c.chave, entrada);
    }
    const dados = await aguardar(entrada, sinal);
    return { clima: dados, celula: c, origemCache: false };
  }

  const emCache = (lat, lon, ano = null) => {
    const c = celula(lat, lon, ano);
    const reg = memoria.get(c.chave) || carregarLS()[c.chave];
    return !!reg && Date.now() - reg.t < TTL_MS;
  };

  function limparCache() {
    memoria.clear();
    armazenamento = {};
    try { global.localStorage.removeItem(LS_CHAVE); } catch (_) { /* ignora */ }
  }

  global.NasaPower = { RESOLUCAO, NasaPowerError, celula, montarUrl, interpretar, periodoDaClimatologia, obter, emCache, limparCache };
})(typeof window !== 'undefined' ? window : globalThis);
