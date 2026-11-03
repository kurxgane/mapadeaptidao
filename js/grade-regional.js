/* grade-regional.js — "Análise Regional de São Paulo": mosaico de pontos classificados.
   - Pontos gerados com o contorno de SP como máscara (fora do estado = descartado).
   - Modo simulação: instantâneo (processado em lotes para não travar a interface).
   - Modo real: UMA consulta por célula de 0,5° da NASA POWER (pontos na mesma célula
     compartilham), no máximo 4 em paralelo, com cache, teto de células, cancelamento
     e parada automática após falhas consecutivas (evita centenas de chamadas inúteis).
   - Camadas Leaflet criadas só ao gerar; mudar cultura/parâmetros apenas REPINTA. */
(function (global) {
  'use strict';

  const PARALELISMO = 4;
  const MAX_CELULAS_REAL = 150;
  const FALHAS_CONSECUTIVAS_MAX = 5;
  const corSemDados = () => global.Tema.cssVarMapa('--sem-dados');
  const bordaSemDados = () => global.Tema.cssVarMapa('--grade-sem-dados-borda');

  let pontos = [];          // { lat, lon, clima|null, erro|null, camada, av|null }
  let controlador = null;
  let gerando = false;
  let avaliarFn = null;     // (clima) => avaliação (sem hidrico)
  let aoSelecionar = () => {};

  const raio = (passo) => (passo <= 0.1 ? 3.5 : passo <= 0.25 ? 6 : passo <= 0.5 ? 9 : 14);

  function html(p) {
    if (p.erro) return `<strong>Sem dados</strong><br>${global.Util.esc(p.erro)}`;
    if (!p.av) return 'Calculando…';
    const r = p.av.resumo;
    return `<strong>${p.av.classe.emoji} ${p.av.classe.rotulo}</strong> · índice ${p.av.indice}<br>`
      + `${global.Util.fmt(r.temperatura)} °C · ${global.Util.fmt(r.precipitacao, 0)} mm/mês<br>`
      + `<span class="tt-sub">${p.lat.toFixed(2)}, ${p.lon.toFixed(2)}${p.av.principal ? ' · ' + global.Util.esc(p.av.principal.limitante) : ''}</span>`;
  }

  function pintar(p) {
    if (!p.camada) return;
    if (p.erro) { p.camada.setStyle({ fillColor: corSemDados(), fillOpacity: 0.35, color: bordaSemDados() }); return; }
    if (!p.clima || !avaliarFn) { p.camada.setStyle({ fillColor: corSemDados(), fillOpacity: 0.2, color: bordaSemDados() }); return; }
    p.av = avaliarFn(p.clima);
    p.camada.setStyle({ fillColor: global.Tema.corClasse(p.av.classe.id), fillOpacity: 0.78, color: global.Tema.cssVarMapa('--grade-borda') });
  }

  function limpar() {
    if (controlador) controlador.abort();
    controlador = null;
    gerando = false;
    global.Mapa.obterGrupoGrade().clearLayers();
    pontos = [];
  }

  function desenhar(lista, passo) {
    const L = global.L;
    const grupo = global.Mapa.obterGrupoGrade();
    const renderer = L.canvas({ pane: 'paneGrade', padding: 0.3 });
    pontos = lista.map((pt) => {
      const p = { lat: pt.lat, lon: pt.lon, clima: null, erro: null, av: null, camada: null };
      p.camada = L.circleMarker([p.lat, p.lon], {
        renderer, pane: 'paneGrade', radius: raio(passo), weight: 1, color: bordaSemDados(),
        fillColor: corSemDados(), fillOpacity: 0.2, bubblingMouseEvents: false,
      });
      p.camada.bindTooltip(() => html(p), { sticky: true, direction: 'top', className: 'tt-grade' });
      p.camada.on('click', () => aoSelecionar(p.lat, p.lon));
      grupo.addLayer(p.camada);
      return p;
    });
  }

  const resumo = () => {
    const c = { APTA: 0, MODERADA: 0, INAPTA: 0, SEM_DADOS: 0, PENDENTE: 0, total: pontos.length };
    pontos.forEach((p) => {
      if (p.erro) c.SEM_DADOS++;
      else if (!p.clima) c.PENDENTE++;
      else if (p.av) c[p.av.classe.id]++;
    });
    return c;
  };

  /**
   * Gera a grade. Retorna { cancelado, abortadoPorFalhas, total, falhas }.
   * @param {{passo:number, modo:'real'|'sim', ano:number|null, aoProgredir:Function}} cfg
   */
  async function gerar({ passo, modo, ano, aoProgredir }) {
    if (gerando) return { cancelado: true };
    limpar();
    const mascara = global.Mapa.obterMascara();

    const passoEfetivo = modo === 'real' ? Math.max(passo, global.NasaPower.RESOLUCAO) : passo;
    const lista = global.Geo.gerarGrade(mascara, passoEfetivo);
    if (!lista.length) return { total: 0 };

    let celulas = null;
    if (modo === 'real') {
      celulas = new Map();
      lista.forEach((pt) => {
        const c = global.NasaPower.celula(pt.lat, pt.lon, ano);
        if (!celulas.has(c.chave)) celulas.set(c.chave, { lat: c.lat, lon: c.lon, pts: [] });
        celulas.get(c.chave).pts.push(pt);
      });
      if (celulas.size > MAX_CELULAS_REAL) {
        return { recusado: true, motivo: `A grade exigiria ${celulas.size} consultas à NASA POWER (limite: ${MAX_CELULAS_REAL}). Escolha uma resolução mais grossa.` };
      }
    }

    desenhar(lista, passoEfetivo);
    gerando = true;
    controlador = new AbortController();
    const sinal = controlador.signal;
    const mapaPt = new Map(pontos.map((p) => [`${p.lat}|${p.lon}`, p]));
    let falhas = 0;
    let abortadoPorFalhas = false;

    try {
      if (modo === 'sim') {
        const LOTE = 250;
        for (let i = 0; i < pontos.length; i += LOTE) {
          if (sinal.aborted) break;
          pontos.slice(i, i + LOTE).forEach((p) => { p.clima = global.Simulador.gerarAjustado(p.lat, p.lon); pintar(p); });
          if (aoProgredir) aoProgredir(Math.min(i + LOTE, pontos.length), pontos.length);
          await new Promise((r) => requestAnimationFrame(r)); // cede a thread para a interface
        }
      } else {
        const itens = Array.from(celulas.values());
        let falhasSeguidas = 0;
        const tarefas = itens.map((cel) => async () => {
          if (sinal.aborted) return;
          try {
            const r = await global.Clima.obterReal(cel.lat, cel.lon, { ano, sinal });
            cel.pts.forEach((pt) => { const p = mapaPt.get(`${pt.lat}|${pt.lon}`); p.clima = r.clima; pintar(p); });
            falhasSeguidas = 0;
          } catch (erro) {
            if (erro && erro.name === 'AbortError') return;
            falhas++; falhasSeguidas++;
            const msg = erro && erro.message ? erro.message : 'falha na consulta';
            cel.pts.forEach((pt) => { const p = mapaPt.get(`${pt.lat}|${pt.lon}`); p.erro = msg; pintar(p); });
            if (falhasSeguidas >= FALHAS_CONSECUTIVAS_MAX && !abortadoPorFalhas) {
              abortadoPorFalhas = true;
              controlador.abort();
            }
          }
        });
        await global.Util.executarComLimite(tarefas, PARALELISMO, aoProgredir, sinal);
      }
    } finally {
      gerando = false;
      // Células que não chegaram a ser consultadas (cancelamento/falhas) deixam de ficar "pendentes".
      pontos.forEach((p) => {
        if (!p.clima && !p.erro) { p.erro = 'Consulta interrompida antes de chegar a este ponto.'; pintar(p); }
      });
    }

    return { cancelado: sinal.aborted && !abortadoPorFalhas, abortadoPorFalhas, total: pontos.length, falhas, passoEfetivo, celulas: celulas ? celulas.size : null };
  }

  function cancelar() { if (controlador) controlador.abort(); }

  /** Repinta todos os pontos com a avaliação atual (sem recriar camadas). */
  function repintar() { pontos.forEach(pintar); }

  function configurar({ avaliar, aoSelecionarPonto }) {
    avaliarFn = avaliar;
    aoSelecionar = aoSelecionarPonto;
  }

  global.GradeRegional = {
    MAX_CELULAS_REAL, configurar, gerar, cancelar, limpar, repintar, resumo,
    existe: () => pontos.length > 0,
    estaGerando: () => gerando,
  };
})(typeof window !== 'undefined' ? window : globalThis);
