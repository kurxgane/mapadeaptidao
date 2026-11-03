/* Testes sem dependências: `node tests/run.js` (Node 18+).
   Cobrem o motor agronômico, a leitura/conversão/interpolação da NASA POWER (inclusive o período lido de header.range),
   o texto da fonte de dados (clima.js) e o cancelamento de requisições.
   Não acessam a rede (usam respostas sintéticas e um fetch simulado). */
'use strict';
const path = require('path');
const J = (f) => path.join(__dirname, '..', 'js', f);
['util.js', 'culturas.js', 'agronomia.js', 'nasa-power.js'].forEach((f) => require(J(f)));
const { Agronomia, Culturas, NasaPower, Util } = globalThis;

const resultados = [];
const grupos = [];
function teste(nome, fn) { grupos.push({ nome, fn }); }
const igual = (a, b, msg) => { if (a !== b) throw new Error(`${msg || 'valor'}: esperado ${JSON.stringify(b)}, recebido ${JSON.stringify(a)}`); };
const perto = (a, b, tol, msg) => { if (!(Math.abs(a - b) <= tol)) throw new Error(`${msg || 'valor'}: esperado ${b} ±${tol}, recebido ${a}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg || 'condição falsa'); };
const esperarErro = async (fn, teste) => { try { await fn(); } catch (e) { return e; } throw new Error('esperava erro e nada foi lançado'); };

/* ---------- utilitários de clima sintético ---------- */
const DIAS = Util.diasDoMes(null);
const climaConst = ({ temp, chuvaMes, umid, rad }) => ({
  meses: Array.from({ length: 12 }, () => ({ temp, precip: chuvaMes, umidade: umid, radiacao: rad })), dias: DIAS,
});
const cana = () => Culturas.clonarParametros('cana');   // T 21–30 (tol 3, crítica) · P 90–150 (tol 40, crítica) · UR 55–85 (tol 10) · Rad 14–25 (tol 3)
const base = { temp: 25, chuvaMes: 120, umid: 70, rad: 19 };
const av = (over, params) => Agronomia.avaliar(climaConst({ ...base, ...over }), params || cana(), 'anual');

/* ================= MOTOR: limites, tolerâncias e fora ================= */
teste('avaliarFator: dentro da faixa e exatamente nos limites = adequada', () => {
  const f = { min: 21, max: 30, tolerancia: 3 };
  for (const v of [21, 25, 30]) igual(Agronomia.avaliarFator(v, f).status, 'adequada', `valor ${v}`);
});
teste('avaliarFator: dentro da tolerância = moderada (inclui a borda exata)', () => {
  const f = { min: 21, max: 30, tolerancia: 3 };
  for (const v of [20.99, 19, 18, 30.01, 32, 33]) igual(Agronomia.avaliarFator(v, f).status, 'moderada', `valor ${v}`);
});
teste('avaliarFator: além da tolerância = inadequada', () => {
  const f = { min: 21, max: 30, tolerancia: 3 };
  for (const v of [17.99, 10, 33.01, 40]) igual(Agronomia.avaliarFator(v, f).status, 'inadequada', `valor ${v}`);
});
teste('avaliarFator: severidade contínua e monotônica (0 → 0,5 na borda → 1)', () => {
  const f = { min: 21, max: 30, tolerancia: 3 };
  igual(Agronomia.avaliarFator(25, f).severidade, 0);
  perto(Agronomia.avaliarFator(18, f).severidade, 0.5, 1e-9, 'borda inferior');
  perto(Agronomia.avaliarFator(33, f).severidade, 0.5, 1e-9, 'borda superior');
  perto(Agronomia.avaliarFator(15, f).severidade, 1, 1e-9, 'muito fora (clamp)');
  ok(Agronomia.avaliarFator(17, f).severidade > Agronomia.avaliarFator(18, f).severidade, 'não monotônica');
});
teste('avaliarFator: lado (abaixo/acima) correto', () => {
  const f = { min: 21, max: 30, tolerancia: 3 };
  igual(Agronomia.avaliarFator(20, f).lado, 'abaixo'); igual(Agronomia.avaliarFator(31, f).lado, 'acima'); igual(Agronomia.avaliarFator(25, f).lado, null);
});

/* ================= MOTOR: classificação ================= */
teste('classificação: tudo adequado → APTA, índice 100, sem limitante', () => {
  const r = av({}); igual(r.classe.id, 'APTA'); igual(r.indice, 100); igual(r.principal, null); igual(r.limitantes.length, 0);
});
teste('classificação: fator crítico na tolerância → MODERADA', () => {
  const r = av({ temp: 19.5 }); igual(r.classe.id, 'MODERADA'); igual(r.principal.id, 'temperatura');
});
teste('classificação: fator crítico além da tolerância (frio) → INAPTA', () => {
  const r = av({ temp: 15 }); igual(r.classe.id, 'INAPTA'); igual(r.principal.limitante, 'Frio / temperatura baixa');
});
teste('classificação: fator crítico além da tolerância (calor) → INAPTA', () => {
  const r = av({ temp: 36 }); igual(r.classe.id, 'INAPTA'); igual(r.principal.limitante, 'Estresse térmico');
});
teste('classificação: precipitação crítica muito baixa/alta → INAPTA', () => {
  igual(av({ chuvaMes: 30 }).classe.id, 'INAPTA'); igual(av({ chuvaMes: 300 }).classe.id, 'INAPTA');
  igual(av({ chuvaMes: 60 }).classe.id, 'MODERADA'); igual(av({ chuvaMes: 180 }).classe.id, 'MODERADA');
});
teste('classificação: fator NÃO crítico além da tolerância → só MODERADA', () => {
  igual(av({ umid: 20 }).classe.id, 'MODERADA'); igual(av({ rad: 5 }).classe.id, 'MODERADA');
});
teste('classificação: crítico moderado + não crítico inadequado → MODERADA', () => {
  igual(av({ temp: 19.5, umid: 20 }).classe.id, 'MODERADA');
});
teste('classificação respeita a criticidade editada nos parâmetros', () => {
  const p = cana(); p.umidade.critico = true; igual(av({ umid: 20 }, p).classe.id, 'INAPTA');
  const q = cana(); q.temperatura.critico = false; igual(av({ temp: 15 }, q).classe.id, 'MODERADA');
});
teste('índice 0–100: dentro do intervalo e decrescente com o desvio', () => {
  const a = av({ temp: 19.5 }).indice, b = av({ temp: 17 }).indice, c = av({ temp: 5, chuvaMes: 0, umid: 5, rad: 1 }).indice;
  ok(a < 100 && b < a && c >= 0 && c < b, `índices ${a}, ${b}, ${c}`);
  perto(Object.values(Culturas.PESOS).reduce((s, v) => s + v, 0), 1, 1e-9, 'soma dos pesos');
});

/* ================= MOTOR: fator limitante ================= */
teste('limitante: ordena pela maior severidade entre os fatores fora da faixa', () => {
  const r = av({ temp: 19.5, chuvaMes: 60, umid: 20 });   // temp 0,25 · chuva 0,25… umid (não crítico) muito fora
  ok(r.limitantes.length === 3, 'esperava 3 limitantes');
  for (let i = 1; i < r.limitantes.length; i++) ok(r.limitantes[i - 1].severidade >= r.limitantes[i].severidade, 'fora de ordem');
});
teste('limitante: com classe INAPTA, o principal é um fator CRÍTICO (o que decidiu a classe)', () => {
  // temperatura crítica inadequada (sev. 0,6) + umidade NÃO crítica muito pior (sev. 1,0)
  const r = av({ temp: 17.4, umid: 10 });
  igual(r.classe.id, 'INAPTA');
  ok(r.fatores.find((f) => f.id === 'umidade').severidade > r.fatores.find((f) => f.id === 'temperatura').severidade, 'cenário inválido');
  igual(r.principal.id, 'temperatura', 'o limitante principal deve explicar a classe INAPTA');
});
teste('limitante: com classe MODERADA, o principal é o de maior severidade', () => {
  const r = av({ temp: 19.5, umid: 20 }); igual(r.classe.id, 'MODERADA'); igual(r.principal.id, 'umidade');
});

/* ================= MOTOR: ET0, balanço hídrico, Kc ================= */
teste('ET0 Makkink: valor de referência (25 °C, 20 MJ/m²/dia ≈ 3,57 mm/dia)', () => {
  perto(Agronomia.et0Makkink(25, 20), 3.57, 0.05);
});
teste('ET0 Makkink: cresce com temperatura e radiação; nunca negativa', () => {
  ok(Agronomia.et0Makkink(30, 20) > Agronomia.et0Makkink(20, 20), 'temperatura');
  ok(Agronomia.et0Makkink(25, 24) > Agronomia.et0Makkink(25, 16), 'radiação');
  igual(Agronomia.et0Makkink(25, 0), 0); ok(Agronomia.et0Makkink(5, 2) >= 0, 'negativo');
  ok(Agronomia.et0Makkink(25, 20) < 8, 'ordem de grandeza (mm/dia)');
});
teste('balanço hídrico: necessidade = ET0 · Kc · dias do mês (mm/mês)', () => {
  const clima = climaConst(base); const b = Agronomia.balancoHidrico(clima, 0.9, [0, 1, 2]);
  const et0 = Agronomia.et0Makkink(25, 19);
  perto(b.meses[0].necessidade, et0 * 0.9 * 31, 1e-9, 'janeiro'); perto(b.meses[1].necessidade, et0 * 0.9 * 28.25, 1e-9, 'fevereiro');
  perto(b.meses[0].et0, et0 * 31, 1e-9, 'ET0 mensal');
});
teste('balanço hídrico: déficit/excedente corretos e mutuamente exclusivos', () => {
  const faltando = Agronomia.balancoHidrico(climaConst({ ...base, chuvaMes: 20 }), 1, [0]).meses[0];
  ok(faltando.deficit > 0 && faltando.excedente === 0, 'déficit'); perto(faltando.deficit, faltando.necessidade - 20, 1e-9);
  const sobrando = Agronomia.balancoHidrico(climaConst({ ...base, chuvaMes: 400 }), 1, [0]).meses[0];
  ok(sobrando.excedente > 0 && sobrando.deficit === 0, 'excedente'); perto(sobrando.excedente, 400 - sobrando.necessidade, 1e-9);
});
teste('balanço hídrico: totais só somam os meses do período; Kc maior → mais necessidade', () => {
  const clima = climaConst(base); const b = Agronomia.balancoHidrico(clima, 0.8, Culturas.PERIODOS.safra.meses);
  perto(b.necessidadePeriodo, [9, 10, 11, 0, 1, 2].reduce((s, i) => s + b.meses[i].necessidade, 0), 1e-9);
  ok(Agronomia.balancoHidrico(clima, 1.1, [0]).necessidadePeriodo > Agronomia.balancoHidrico(clima, 0.7, [0]).necessidadePeriodo, 'Kc');
});
teste('períodos: safra = Out–Mar; safrinha = Abr–Set; anual = 12 meses', () => {
  igual(JSON.stringify(Culturas.PERIODOS.safra.meses), '[9,10,11,0,1,2]'); igual(JSON.stringify(Culturas.PERIODOS.safrinha.meses), '[3,4,5,6,7,8]'); igual(Culturas.PERIODOS.anual.meses.length, 12);
});
teste('média do período usa só os meses do período (safra vs safrinha)', () => {
  const clima = climaConst(base); clima.meses.forEach((m, i) => { m.temp = [9, 10, 11, 0, 1, 2].includes(i) ? 28 : 18; });
  perto(Agronomia.avaliar(clima, cana(), 'safra').resumo.temperatura, 28, 1e-9); perto(Agronomia.avaliar(clima, cana(), 'safrinha').resumo.temperatura, 18, 1e-9);
});
teste('as 5 culturas: faixas coerentes (min < max, tolerância > 0, valores marcados como não validados)', () => {
  igual(Object.keys(Culturas.CULTURAS).length, 5);
  for (const [k, c] of Object.entries(Culturas.CULTURAS)) for (const v of ['temperatura', 'precipitacao', 'umidade', 'radiacao']) {
    ok(c[v].min < c[v].max && c[v].tolerancia > 0 && c[v].validado === false, `${k}.${v}`);
  }
});

/* ================= NASA POWER: unidades, mm/dia→mm/mês, interpolação ================= */
const MES = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const serie = (valores) => Object.fromEntries(MES.map((m, i) => [m, valores[i]]).concat([['ANN', 0]]));
const resposta = ({ T, P, RH, SW, unidades } = {}) => ({
  properties: { parameter: {
    T2M: serie(T || Array(12).fill(24)), PRECTOTCORR: serie(P || Array(12).fill(4)),
    RH2M: serie(RH || Array(12).fill(70)), ALLSKY_SFC_SW_DWN: serie(SW || Array(12).fill(19)) } },
  ...(unidades ? { parameters: { ALLSKY_SFC_SW_DWN: { units: unidades } } } : {}),
});
teste('NASA: precipitação mm/dia × dias → mm/mês (climatologia e ano bissexto)', () => {
  const c = NasaPower.interpretar(resposta(), null); perto(c.meses[0].precip, 4 * 31, 1e-9); perto(c.meses[1].precip, 4 * 28.25, 1e-9);
  perto(NasaPower.interpretar(resposta(), 2024).meses[1].precip, 4 * 29, 1e-9, 'fev/2024');
});
teste('NASA: radiação em MJ/m²/dia (unidade declarada) NÃO é convertida', () => {
  perto(NasaPower.interpretar(resposta({ SW: Array(12).fill(19), unidades: 'MJ/m^2/day' }), null).meses[0].radiacao, 19, 1e-9);
});
teste('NASA: radiação declarada em kW-hr/m²/dia é convertida (×3,6)', () => {
  perto(NasaPower.interpretar(resposta({ SW: Array(12).fill(5.3), unidades: 'kW-hr/m^2/day' }), null).meses[0].radiacao, 19.08, 1e-9);
});
teste('NASA: a unidade DECLARADA vence a heurística (MJ baixo declarado como MJ não é multiplicado)', () => {
  perto(NasaPower.interpretar(resposta({ SW: Array(12).fill(6), unidades: 'MJ/m^2/day' }), null).meses[0].radiacao, 6, 1e-9);
});
teste('NASA: sem unidade declarada, mantém o critério anterior (média < 9 → kWh → ×3,6)', () => {
  perto(NasaPower.interpretar(resposta({ SW: Array(12).fill(5.3) }), null).meses[0].radiacao, 19.08, 1e-9);
  perto(NasaPower.interpretar(resposta({ SW: Array(12).fill(19) }), null).meses[0].radiacao, 19, 1e-9);
});
teste('NASA: registra qual unidade/critério foi usado na radiação (transparência no relatório)', () => {
  const a = NasaPower.interpretar(resposta({ unidades: 'MJ/m^2/day' }), null).detalhe.radiacao;
  const b = NasaPower.interpretar(resposta({ SW: Array(12).fill(5.3), unidades: 'kW-hr/m^2/day' }), null).detalhe.radiacao;
  const c = NasaPower.interpretar(resposta({ SW: Array(12).fill(5.3) }), null).detalhe.radiacao;
  igual(a.origem, 'declarada'); igual(a.fator, 1); igual(b.origem, 'declarada'); igual(b.fator, 3.6); igual(c.origem, 'estimada'); igual(c.fator, 3.6);
});
/* ---- período da climatologia (header.range) ---- */
const RANGE_REAL = '25-year Meteorological and Solar Monthly & Annual Climatologies (January 2001 - December 2025)';
const comRange = (range) => ({ ...resposta(), header: { range } });
teste('período: lê header.range no formato observado e devolve texto em português', () => {
  const p = NasaPower.interpretar(comRange(RANGE_REAL), null).detalhe.periodo;
  igual(p.texto, 'janeiro de 2001 a dezembro de 2025'); igual(p.inicio.mes, 1); igual(p.inicio.ano, 2001); igual(p.fim.mes, 12); igual(p.fim.ano, 2025);
});
teste('período: dinâmico — outro intervalo na resposta aparece como veio (nada fixo no código)', () => {
  igual(NasaPower.periodoDaClimatologia(comRange('20-year Climatologies (March 2001 - February 2020)')).texto, 'março de 2001 a fevereiro de 2020');
  igual(NasaPower.periodoDaClimatologia(comRange('x (Jan 2002 - Dec 2026)')).texto, 'janeiro de 2002 a dezembro de 2026', 'mês abreviado');
});
teste('período: ausente ou ilegível → null (não inventa período)', () => {
  [undefined, null, 123, {}, '', 'sem parênteses', '25-year Climatologies', '(January 2001)', '(Foo 2001 - December 2025)',
    '(January 2001 - Bar 2025)', '(December 2025 - January 2001)', '(January 1800 - December 2025)', '(January 2001 - December 9999)']
    .forEach((r) => igual(NasaPower.periodoDaClimatologia(comRange(r)), null, `range=${JSON.stringify(r)}`));
  igual(NasaPower.periodoDaClimatologia({}), null, 'sem header'); igual(NasaPower.periodoDaClimatologia({ header: null }), null, 'header nulo');
  igual(NasaPower.periodoDaClimatologia(null), null, 'json nulo'); igual(NasaPower.interpretar(resposta(), null).detalhe.periodo, null, 'resposta sem header');
});
teste('período: o texto bruto da resposta nunca é repetido (só mês e ano validados)', () => {
  const p = NasaPower.periodoDaClimatologia(comRange('<img src=x onerror=alert(1)> (January 2001 - December 2025)'));
  igual(p.texto, 'janeiro de 2001 a dezembro de 2025'); ok(!/[<>]/.test(p.texto));
});
teste('período: ler header.range não altera nenhum valor climático', () => {
  const a = NasaPower.interpretar(resposta(), null), b = NasaPower.interpretar(comRange(RANGE_REAL), null);
  igual(JSON.stringify(a.meses), JSON.stringify(b.meses)); igual(JSON.stringify(a.dias), JSON.stringify(b.dias));
});
teste('NASA: sem lacunas → nenhum valor alterado', () => {
  const T = [20, 21, 22, 23, 24, 25, 26, 25, 24, 23, 22, 21]; const c = NasaPower.interpretar(resposta({ T }), null);
  T.forEach((v, i) => igual(c.meses[i].temp, v)); igual(c.detalhe.lacunas, 0);
});
teste('interpolação: 1 mês ausente = média dos vizinhos', () => {
  const T = [20, 21, 22, 23, 24, 25, 26, 25, 24, 23, 22, 21]; T[3] = -999;
  perto(NasaPower.interpretar(resposta({ T }), null).meses[3].temp, 23, 1e-9);
});
teste('interpolação: 2 meses CONSECUTIVOS ausentes → interpolação linear entre os vizinhos válidos', () => {
  const T = [20, 21, 22, 23, 24, 25, 26, 25, 24, 23, 22, 21]; T[3] = -999; T[4] = -999;   // vizinhos válidos: 22 (mar) e 25 (jun)
  const c = NasaPower.interpretar(resposta({ T }), null);
  perto(c.meses[3].temp, 23, 1e-9, 'abril'); perto(c.meses[4].temp, 24, 1e-9, 'maio'); igual(c.detalhe.lacunas, 2);
});
teste('interpolação: lacuna que cruza dez→jan (série cíclica da climatologia)', () => {
  const T = [20, 21, 22, 23, 24, 25, 26, 25, 24, 23, 22, 21]; T[11] = -999; T[0] = -999;   // vizinhos: 22 (nov) e 21 (fev)
  const c = NasaPower.interpretar(resposta({ T }), null);
  perto(c.meses[11].temp, 22 + (21 - 22) / 3, 1e-9, 'dez'); perto(c.meses[0].temp, 22 + 2 * (21 - 22) / 3, 1e-9, 'jan');
});
teste('interpolação: 2 meses ausentes NÃO consecutivos (cada um pela média dos vizinhos)', () => {
  const T = [20, 21, 22, 23, 24, 25, 26, 25, 24, 23, 22, 21]; T[1] = -999; T[7] = -999;
  const c = NasaPower.interpretar(resposta({ T }), null); perto(c.meses[1].temp, 21, 1e-9); perto(c.meses[7].temp, 25, 1e-9);
});
teste('interpolação: mais de 2 ausentes → erro SEM_DADOS (não inventa dados)', async () => {
  const T = Array(12).fill(24); T[2] = -999; T[3] = -999; T[4] = -999;
  const e = await esperarErro(() => NasaPower.interpretar(resposta({ T }), null)); igual(e.codigo, 'SEM_DADOS');
});
teste('interpolação: valores -999 e ausentes tratados como lacuna; chaves YYYYMM aceitas e ANN/YYYY13 ignoradas', () => {
  const p = { T2M: {}, PRECTOTCORR: {}, RH2M: {}, ALLSKY_SFC_SW_DWN: {} };
  for (let m = 1; m <= 12; m++) { const k = `2023${String(m).padStart(2, '0')}`; p.T2M[k] = 20 + m; p.PRECTOTCORR[k] = 3; p.RH2M[k] = 70; p.ALLSKY_SFC_SW_DWN[k] = 19; }
  p.T2M['202313'] = 999; p.T2M['202306'] = -999;
  const c = NasaPower.interpretar({ properties: { parameter: p } }, 2023); perto(c.meses[5].temp, (25 + 27) / 2, 1e-9); igual(c.meses[11].temp, 32);
});

/* ================= NASA POWER: cancelamento com requisição compartilhada ================= */
function simularFetch() {
  const estado = { chamadas: 0, abortadas: 0, pendentes: [] };
  globalThis.fetch = (url, { signal } = {}) => new Promise((resolve, reject) => {
    estado.chamadas += 1;
    const item = { resolver: () => resolve({ ok: true, status: 200, json: async () => resposta() }) };
    estado.pendentes.push(item);
    if (signal) signal.addEventListener('abort', () => { estado.abortadas += 1; const e = new Error('abort'); e.name = 'AbortError'; reject(e); }, { once: true });
  });
  return estado;
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ponto = 0; const novoPonto = () => { ponto += 1; return [-20 - ponto * 0.5, -48]; };

teste('cancelamento: quem cancela sai da espera NA HORA, mesmo com a requisição ainda pendente', async () => {
  const f = simularFetch(); const [la, lo] = novoPonto(); const ctrl = new AbortController();
  const t0 = Date.now(); const p = NasaPower.obter(la, lo, { sinal: ctrl.signal });
  await espera(20); ctrl.abort(); const e = await esperarErro(() => p);
  igual(e.name, 'AbortError'); ok(Date.now() - t0 < 500, `demorou ${Date.now() - t0} ms para cancelar`); igual(f.abortadas, 1, 'sem consumidores restantes, a requisição é interrompida');
});
teste('cancelamento: cancelar um consumidor NÃO derruba o outro que compartilha a requisição', async () => {
  const f = simularFetch(); const [la, lo] = novoPonto(); const a = new AbortController(), b = new AbortController();
  const pa = NasaPower.obter(la, lo, { sinal: a.signal }); const pb = NasaPower.obter(la, lo, { sinal: b.signal });
  await espera(20); igual(f.chamadas, 1, 'deduplicação: 1 única requisição'); a.abort();
  const ea = await esperarErro(() => pa); igual(ea.name, 'AbortError'); igual(f.abortadas, 0, 'a requisição compartilhada continua');
  f.pendentes[0].resolver(); const rb = await pb; ok(rb.clima.meses.length === 12, 'B deve receber os dados');
});
teste('cancelamento: cache preservado — depois de concluir, nova consulta não refaz a requisição', async () => {
  const f = simularFetch(); const [la, lo] = novoPonto(); const p = NasaPower.obter(la, lo, {}); await espera(20); f.pendentes[0].resolver(); await p;
  const r2 = await NasaPower.obter(la, lo, {}); igual(r2.origemCache, true); igual(f.chamadas, 1);
});
teste('cancelamento: todos cancelam → requisição interrompida e a próxima consulta recomeça do zero', async () => {
  const f = simularFetch(); const [la, lo] = novoPonto(); const a = new AbortController(), b = new AbortController();
  const pa = NasaPower.obter(la, lo, { sinal: a.signal }), pb = NasaPower.obter(la, lo, { sinal: b.signal }); await espera(20);
  a.abort(); b.abort(); await esperarErro(() => pa); await esperarErro(() => pb); igual(f.abortadas, 1);
  const p3 = NasaPower.obter(la, lo, {}); await espera(20); igual(f.chamadas, 2, 'nova requisição'); f.pendentes[1].resolver(); await p3;
});
teste('cancelamento: sinal já cancelado antes de começar → AbortError sem deixar requisição órfã', async () => {
  const f = simularFetch(); const [la, lo] = novoPonto(); const c = new AbortController(); c.abort();
  const e = await esperarErro(() => NasaPower.obter(la, lo, { sinal: c.signal })); igual(e.name, 'AbortError'); await espera(20);
  ok(f.abortadas === f.chamadas, 'toda requisição iniciada deve ter sido interrompida');
});
teste('cancelamento: consumidor sem sinal não é afetado por outro que cancela', async () => {
  const f = simularFetch(); const [la, lo] = novoPonto(); const a = new AbortController();
  const pa = NasaPower.obter(la, lo, { sinal: a.signal }); const pb = NasaPower.obter(la, lo, {}); await espera(20); a.abort(); await esperarErro(() => pa);
  f.pendentes[0].resolver(); ok((await pb).clima.meses.length === 12);
});

/* ================= Clima (fachada): texto da fonte de dados com o período ================= */
function fetchCom(json) {
  globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => json });
}
teste('clima.js: média climatológica mostra o período lido da resposta, na descrição da fonte', async () => {
  require(J('clima.js'));
  fetchCom(comRange(RANGE_REAL)); const [la, lo] = novoPonto();
  const r = await globalThis.Clima.obter(la, lo, { modo: 'real', ano: null });
  ok(r.descricao.startsWith('média climatológica de longo prazo (janeiro de 2001 a dezembro de 2025) · grade de consulta de 0,5°'), r.descricao);
  igual(r.fonte.id, 'nasa');
  const r2 = await globalThis.Clima.obter(la, lo, { modo: 'real', ano: null });   // vem do cache: o período acompanha os dados
  igual(r2.origemCache, true); ok(r2.descricao.includes('(janeiro de 2001 a dezembro de 2025)') && r2.descricao.endsWith('· cache'), r2.descricao);
});
teste('clima.js: sem header.range → texto genérico, sem período inventado', async () => {
  require(J('clima.js'));
  fetchCom(resposta()); const [la, lo] = novoPonto();
  const r = await globalThis.Clima.obter(la, lo, { modo: 'real', ano: null });
  ok(r.descricao.startsWith('média climatológica de longo prazo · grade de consulta'), r.descricao);
  ok(!/\d{4}/.test(r.descricao.split('·')[0]), 'não deve haver ano antes da grade');
});
teste('clima.js: consulta de um ano específico mostra o ano, não o período da climatologia', async () => {
  require(J('clima.js'));
  fetchCom(comRange(RANGE_REAL)); const [la, lo] = novoPonto();
  const r = await globalThis.Clima.obter(la, lo, { modo: 'real', ano: 2023 });
  ok(r.descricao.startsWith('ano 2023 · grade'), r.descricao);
});
teste('clima.js: NASA indisponível → fallback sinalizado, sem período', async () => {
  require(J('clima.js'));
  require(J('simulador.js'));
  globalThis.fetch = () => Promise.resolve({ ok: false, status: 500, json: async () => ({}) }); const [la, lo] = novoPonto();
  const r = await globalThis.Clima.obter(la, lo, { modo: 'real', ano: null });
  igual(r.fonte.id, 'fallback'); ok(r.descricao.includes('indisponível') && !/\d{4}/.test(r.descricao), r.descricao); ok(/NÃO são dados reais/.test(r.aviso), r.aviso);
});

/* ---------------- execução ---------------- */
(async () => {
  const orfas = [];
  process.on('unhandledRejection', (e) => { orfas.push(e && e.message); });   // promessa rejeitada sem ninguém esperando
  const comLimite = (fn) => Promise.race([Promise.resolve().then(fn), new Promise((_, rej) => setTimeout(() => rej(new Error('tempo limite do teste (3 s) — ficou preso esperando')), 3000))]);
  for (const g of grupos) {
    try { await comLimite(g.fn); resultados.push({ nome: g.nome, ok: true }); } catch (e) { resultados.push({ nome: g.nome, ok: false, erro: e.message }); }
  }
  let falhas = 0;
  for (const r of resultados) { if (!r.ok) falhas += 1; console.log(`${r.ok ? '✔ PASSOU ' : '✖ FALHOU '} ${r.nome}${r.ok ? '' : `\n          → ${r.erro}`}`); }
  if (orfas.length) console.log(`\n⚠ ${orfas.length} promessa(s) rejeitada(s) sem tratamento: ${orfas.join(' | ')}`);
  console.log(`\n${resultados.length - falhas}/${resultados.length} testes aprovados${falhas ? `, ${falhas} reprovado(s)` : ''}.`);
  process.exit(falhas ? 1 : 0);
})();
