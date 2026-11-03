/* app.js — Orquestração: estado, eventos e ligação entre as camadas.
     Dados      → clima.js / nasa-power.js / simulador.js
     Processo   → agronomia.js (+ culturas.js)
     Resultado  → relatorio.js / graficos.js / mapa.js / grade-regional.js
   Nenhuma regra agronômica fica neste arquivo. */
(function (global) {
  'use strict';

  const { CULTURAS, VARIAVEIS, PERIODOS, META } = global.Culturas;
  const U = global.Util;
  const $ = (id) => document.getElementById(id);

  const POLO_INICIAL = 'ribeirao-preto';
  // Resoluções da GRADE DE CONSULTA do aplicativo (espaçamento dos pontos classificados). Não são as resoluções
  // nativas da NASA POWER (~0,5°×0,625° na meteorologia e ~1° na radiação).
  const RESOLUCOES = [
    { v: 0.1, rotulo: '0,1° (~11 km) · só simulação', soSim: true },
    { v: 0.25, rotulo: '0,25° (~28 km) · só simulação', soSim: true },
    { v: 0.5, rotulo: '0,5° (~55 km) · grade de consulta' },
    { v: 1, rotulo: '1,0° (~110 km) · rápida' },
  ];

  const estado = {
    modo: 'real',            // 'real' | 'sim'
    ano: null,               // null = média climatológica de longo prazo (NASA POWER)
    culturaKey: 'cana',
    periodo: 'anual',
    params: null,            // cópia editável da cultura (parâmetros do modelo)
    ponto: null,             // { lat, lon, municipio, regiaoTxt }
    clima: null,             // { meses, dias }
    fonte: null,             // resposta de Clima.obter (fonte, descricao, aviso)
    av: null,                // resultado de Agronomia.avaliar
    reqClima: 0,
    ctrlClima: null,
    ctrlMunicipio: null,
    timerMunicipio: null,
    timerCarregando: null,
    timerToast: null,
    rafPendente: false,
    relatorioSujo: true,
  };

  /* ====================== Utilidades de interface ====================== */

  function toast(msg, tipo = 'info') {
    const el = $('toast');
    el.textContent = msg;
    el.className = `toast toast-${tipo}`;
    el.hidden = false;
    clearTimeout(estado.timerToast);
    estado.timerToast = setTimeout(() => { el.hidden = true; }, tipo === 'info' ? 3500 : 6000);
  }

  function mostrarCarregando(mostrar, texto) {
    const el = $('carregando');
    clearTimeout(estado.timerCarregando);
    if (!mostrar) { el.hidden = true; return; }
    $('carregandoTxt').textContent = texto;
    estado.timerCarregando = setTimeout(() => { el.hidden = false; }, 150); // evita "piscar" em respostas de cache
  }

  const regiaoTexto = (lat, lon) => {
    const { polo, km } = global.Polos.maisProximo(lat, lon);
    return `Polo agrícola mais próximo: ${polo.nome} (~${Math.round(km)} km)`;
  };

  /* ====================== Seleção de ponto ====================== */

  function atualizarIdentificacao(carregandoMunicipio) {
    const p = estado.ponto;
    if (!p) return;
    $('pontoMunicipio').textContent = p.municipio || (carregandoMunicipio ? 'Identificando município…' : 'Município não identificado');
    $('pontoCoords').textContent = `Lat ${p.lat.toFixed(4)} · Lon ${p.lon.toFixed(4)}`;
    $('pontoRegiao').textContent = p.regiaoTxt;
    $('inLat').value = p.lat.toFixed(4);
    $('inLon').value = p.lon.toFixed(4);
    atualizarResumoRapido();
  }

  const dadosSimulados = () => !!(estado.fonte && estado.fonte.fonte.tom !== 'ok');

  function atualizarResumoRapido() {
    if (!estado.av || !estado.ponto) return;
    global.Relatorio.renderResumoRapido({ ponto: estado.ponto, cultura: CULTURAS[estado.culturaKey], av: estado.av, fonte: estado.fonte });
  }

  /** Seleciona um ponto — recusa qualquer coordenada fora do Estado de São Paulo. */
  function selecionarPonto(lat, lon, opcoes = {}) {
    if (!global.Mapa.dentroDeSP(lat, lon)) {
      toast(global.Mapa.MSG_FORA, 'erro');
      return false;
    }
    lat = Math.round(lat * 1e4) / 1e4;
    lon = Math.round(lon * 1e4) / 1e4;
    estado.ponto = { lat, lon, municipio: opcoes.nome || null, regiaoTxt: regiaoTexto(lat, lon) };
    // "Exemplo" vale só para o ponto inicial; qualquer escolha do usuário encerra a orientação de primeiro acesso.
    document.documentElement.dataset.exemplo = opcoes.exemplo ? '1' : '0';
    global.Mapa.definirMarcador(lat, lon);
    if (opcoes.voar) global.Mapa.voar(lat, lon, opcoes.zoom || 9);

    atualizarIdentificacao(!opcoes.nome);
    carregarClima();
    if (!opcoes.nome) agendarMunicipio(); else cancelarMunicipio();
    return true;
  }

  function cancelarMunicipio() {
    clearTimeout(estado.timerMunicipio);
    if (estado.ctrlMunicipio) estado.ctrlMunicipio.abort();
  }

  /** Geocodificação reversa com debounce (respeita o limite de ~1 req/s do Nominatim). */
  function agendarMunicipio() {
    cancelarMunicipio();
    const alvo = estado.ponto;
    estado.timerMunicipio = setTimeout(async () => {
      estado.ctrlMunicipio = new AbortController();
      try {
        const r = await global.Municipio.reverso(alvo.lat, alvo.lon, estado.ctrlMunicipio.signal);
        if (estado.ponto !== alvo) return;               // usuário já escolheu outro ponto
        alvo.municipio = r.municipio;
      } catch (e) {
        if (e && e.name === 'AbortError') return;
        if (estado.ponto !== alvo) return;
        alvo.municipio = null;                            // segue sem município (melhor esforço)
      }
      atualizarIdentificacao(false);
      estado.relatorioSujo = true;
      agendarRecalculo();
    }, 600);
  }

  /* ====================== Dados climáticos ====================== */

  async function carregarClima() {
    if (!estado.ponto) return;
    const id = ++estado.reqClima;
    if (estado.ctrlClima) estado.ctrlClima.abort();
    estado.ctrlClima = new AbortController();
    const { lat, lon } = estado.ponto;
    mostrarCarregando(true, estado.modo === 'real' ? 'Consultando NASA POWER…' : 'Gerando dados simulados…');
    try {
      const r = await global.Clima.obter(lat, lon, { modo: estado.modo, ano: estado.ano, sinal: estado.ctrlClima.signal });
      if (id !== estado.reqClima) return;                 // resposta antiga: descarta
      estado.clima = r.clima;
      estado.fonte = r;
      global.Relatorio.renderFonte(r);
      if (r.fonte.id === 'fallback') toast('NASA POWER indisponível — usando simulação local (indicado no mapa e no painel).', 'alerta');
      estado.relatorioSujo = true;
      recalcular();
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      console.error(e);
      toast('Erro inesperado ao obter os dados climáticos.', 'erro');
    } finally {
      if (id === estado.reqClima) mostrarCarregando(false);
    }
  }

  /* ====================== Cálculo e atualização (sem recarregar) ====================== */

  function agendarRecalculo() {
    if (estado.rafPendente) return;
    estado.rafPendente = true;
    requestAnimationFrame(() => { estado.rafPendente = false; recalcular(); });
  }

  function recalcular() {
    const cultura = CULTURAS[estado.culturaKey];

    if (estado.clima && estado.ponto) {
      const av = global.Agronomia.avaliar(estado.clima, estado.params, estado.periodo);
      estado.av = av;
      global.Relatorio.renderResumo(av);
      global.Mapa.atualizarMarcador({
        cor: global.Tema.corClasse(av.classe.id),
        popupHtml: global.Relatorio.popup({ ponto: estado.ponto, cultura, av, simulado: dadosSimulados() }),
      });
      global.Graficos.atualizar(av, estado.clima, estado.params);
      const chip = $('chipResultado');
      chip.hidden = false;
      chip.className = `chip-resultado classe-${av.classe.id.toLowerCase()}`;
      chip.textContent = `${av.classe.emoji} ${cultura.nome}: ${av.classe.id}${dadosSimulados() ? ' · simulado' : ''}`;
      atualizarResumoRapido();
      estado.relatorioSujo = true;
      if (!$('painelRelatorio').hidden) renderizarRelatorio();
    }

    if (global.GradeRegional.existe()) {
      global.GradeRegional.repintar();
      atualizarResumoGrade();
    }
  }

  function renderizarRelatorio() {
    if (!estado.av || !estado.fonte) return;
    const dados = global.Relatorio.construir({
      ponto: estado.ponto, cultura: CULTURAS[estado.culturaKey], params: estado.params, av: estado.av,
      fonte: {
        rotulo: estado.fonte.fonte.rotulo, descricao: estado.fonte.descricao, aviso: estado.fonte.aviso,
        radiacao: estado.fonte.fonte.id === 'nasa' && estado.fonte.clima.detalhe ? estado.fonte.clima.detalhe.radiacao : undefined,
      },
    });
    estado.relatorioDados = dados;
    const tecnicoAberto = !!document.querySelector('#relatorio .rel-tecnico[open]');   // preserva a escolha do usuário
    $('relatorio').innerHTML = global.Relatorio.paraHtml(dados);
    if (tecnicoAberto) document.querySelector('#relatorio .rel-tecnico').open = true;
    estado.relatorioSujo = false;
  }

  /* ====================== Cultura, período, parâmetros ====================== */

  function aplicarCultura(chave) {
    estado.culturaKey = chave;
    estado.params = global.Culturas.clonarParametros(chave);
    estado.periodo = estado.params.periodoPadrao;
    $('selCultura').value = chave;
    $('selPeriodo').value = estado.periodo;
    sincronizarSliders();
    agendarRecalculo();
  }

  function construirSliders() {
    $('avisoParam').textContent = `${META.rotulo}: ${META.aviso}`;
    $('sliders').innerHTML = Object.entries(VARIAVEIS).map(([id, v]) => `
      <div class="grupo-slider" data-var="${id}">
        <div class="grupo-topo">
          <span>${U.esc(v.rotulo)} <em class="tag-crit" id="crit-${id}" hidden>crítico</em></span>
          <output id="out-${id}" class="mono"></output>
        </div>
        <div class="duplo">
          <div class="lado">
            <label for="sl-${id}-min">Mínima</label>
            <input id="sl-${id}-min" type="range" min="${v.sliderMin}" max="${v.sliderMax}" step="${v.passo}" data-lado="min">
          </div>
          <div class="lado">
            <label for="sl-${id}-max">Máxima</label>
            <input id="sl-${id}-max" type="range" min="${v.sliderMin}" max="${v.sliderMax}" step="${v.passo}" data-lado="max">
          </div>
        </div>
        <small id="tol-${id}"></small>
      </div>`).join('');

    $('sliders').addEventListener('input', (ev) => {
      const input = ev.target.closest('input[type="range"]');
      if (!input) return;
      const id = input.closest('.grupo-slider').dataset.var;
      const lado = input.dataset.lado;
      const f = estado.params[id];
      const passo = VARIAVEIS[id].passo;
      let val = Number(input.value);
      // Mantém a faixa válida (mínima < máxima) limitando o slider que está sendo movido,
      // em vez de arrastar o outro junto — assim a faixa nunca "colapsa" (ex.: 40–40 °C).
      if (lado === 'min') { val = Math.min(val, f.max - passo); f.min = val; } else { val = Math.max(val, f.min + passo); f.max = val; }
      atualizarSlider(id);
      agendarRecalculo();
    });
  }

  function atualizarSlider(id) {
    const f = estado.params[id];
    const v = VARIAVEIS[id];
    const base = CULTURAS[estado.culturaKey][id];
    $(`sl-${id}-min`).value = f.min;
    $(`sl-${id}-max`).value = f.max;
    const out = $(`out-${id}`);
    out.textContent = `${U.fmt(f.min, v.casas)} – ${U.fmt(f.max, v.casas)} ${v.unidade}`;
    out.classList.toggle('editado', f.min !== base.min || f.max !== base.max);
    $(`tol-${id}`).textContent = `Tolerância moderada: ±${U.fmt(f.tolerancia, v.casas)} ${v.unidade}`;
    $(`crit-${id}`).hidden = !f.critico;
  }

  function sincronizarSliders() { Object.keys(VARIAVEIS).forEach(atualizarSlider); }

  /* ====================== Modo, ano ====================== */

  function definirModo(modo) {
    if (modo === estado.modo) return;
    estado.modo = modo;
    $('btnModoReal').classList.toggle('ativo', modo === 'real');
    $('btnModoSim').classList.toggle('ativo', modo === 'sim');
    $('btnModoReal').setAttribute('aria-pressed', String(modo === 'real'));
    $('btnModoSim').setAttribute('aria-pressed', String(modo === 'sim'));
    $('selAno').disabled = modo === 'sim';
    $('conteudoParametros').hidden = modo === 'sim';
    $('conteudoClimaSim').hidden = modo !== 'sim';
    $('tituloBloco4').textContent = modo === 'sim' ? 'Clima simulado' : 'Parâmetros do modelo de aptidão';
    $('tagBloco4').textContent = modo === 'sim' ? 'Teste' : 'Avançado';
    if (modo === 'sim') $('blocoAvancado').open = true;   // os ajustes são o motivo de entrar em Simulação
    atualizarOpcoesResolucao();
    invalidarGrade('Fonte de dados alterada: gere a análise regional novamente.');
    carregarClima();
  }

  function invalidarGrade(msg) {
    if (global.GradeRegional.existe() || global.GradeRegional.estaGerando()) {
      global.GradeRegional.limpar();
      restaurarBotoesGrade();
      $('resumoGrade').textContent = msg;
    }
  }

  /* ====================== Análise regional ====================== */

  function atualizarOpcoesResolucao() {
    const sel = $('selResolucao');
    Array.from(sel.options).forEach((o) => {
      const r = RESOLUCOES.find((x) => String(x.v) === o.value);
      o.disabled = estado.modo === 'real' && !!r.soSim;
    });
    if (sel.selectedOptions[0] && sel.selectedOptions[0].disabled) sel.value = '0.5';
  }

  function restaurarBotoesGrade() {
    $('btnGrade').disabled = false;
    $('btnCancelarGrade').hidden = true;
    $('progGrade').hidden = true;
    $('btnLimparGrade').hidden = !global.GradeRegional.existe();
  }

  function atualizarResumoGrade(prefixo) {
    const c = global.GradeRegional.resumo();
    if (!c.total) { $('resumoGrade').textContent = prefixo || ''; return; }
    const base = `🟢 ${c.APTA} · 🟡 ${c.MODERADA} · 🔴 ${c.INAPTA}${c.SEM_DADOS ? ` · ⚪ ${c.SEM_DADOS} sem dados` : ''} — ${c.total} pontos`;
    $('resumoGrade').textContent = prefixo ? `${prefixo} ${base}` : base;
  }

  async function gerarGrade() {
    if (global.GradeRegional.estaGerando()) return;
    const passo = Number($('selResolucao').value);
    const prog = $('progGrade');
    $('btnGrade').disabled = true;
    $('btnCancelarGrade').hidden = false;
    $('btnLimparGrade').hidden = true;
    prog.hidden = false; prog.value = 0; prog.max = 1;
    $('resumoGrade').textContent = estado.modo === 'real' ? 'Consultando NASA POWER (uma consulta por célula)…' : 'Gerando grade simulada…';

    let r;
    try {
      r = await global.GradeRegional.gerar({
        passo, modo: estado.modo, ano: estado.ano,
        aoProgredir: (feitos, total) => { prog.max = total; prog.value = feitos; },
      });
    } catch (e) {
      console.error(e);
      toast('Erro ao gerar a análise regional.', 'erro');
      restaurarBotoesGrade();
      return;
    }
    restaurarBotoesGrade();

    if (r.recusado) { $('resumoGrade').textContent = r.motivo; toast(r.motivo, 'alerta'); return; }
    if (r.abortadoPorFalhas) toast('A NASA POWER falhou em várias consultas seguidas; a geração foi interrompida. Tente a Simulação ou repita mais tarde.', 'erro');
    else if (r.cancelado) toast('Geração cancelada.');

    const nota = r.passoEfetivo && r.passoEfetivo !== passo ? `Resolução ajustada para ${String(r.passoEfetivo).replace('.', ',')}° (limite da NASA POWER).` : '';
    atualizarResumoGrade(nota);
  }

  /* ====================== Abas, relatório ====================== */

  /** Recolhe/expande o painel inferior (gráficos e relatório) para ampliar o mapa. */
  function alternarDock(recolher) {
    const dock = document.querySelector('.dock');
    const alvo = typeof recolher === 'boolean' ? recolher : !dock.classList.contains('recolhido');
    dock.classList.toggle('recolhido', alvo);
    document.querySelector('.layout').classList.toggle('dock-recolhido', alvo);
    const b = $('btnRecolher');
    b.setAttribute('aria-expanded', String(!alvo));
    const txt = alvo ? 'Expandir painel de gráficos e relatório' : 'Recolher painel de gráficos e relatório';
    b.title = alvo ? 'Expandir painel' : 'Recolher painel e ampliar o mapa';
    b.setAttribute('aria-label', txt);
    // O ResizeObserver do mapa cuida do Leaflet; os gráficos precisam ser redimensionados ao reabrir.
    if (!alvo) requestAnimationFrame(() => global.Graficos.redimensionar());
  }

  function mostrarAba(aba) {
    if (document.querySelector('.dock').classList.contains('recolhido')) alternarDock(false);
    const graficos = aba === 'graficos';
    $('painelGraficos').hidden = !graficos;
    $('painelRelatorio').hidden = graficos;
    $('tabGraficos').classList.toggle('ativa', graficos);
    $('tabRelatorio').classList.toggle('ativa', !graficos);
    $('tabGraficos').setAttribute('aria-selected', String(graficos));
    $('tabRelatorio').setAttribute('aria-selected', String(!graficos));
    if (graficos) requestAnimationFrame(() => global.Graficos.redimensionar());
    else if (estado.relatorioSujo) renderizarRelatorio();
  }

  async function copiarRelatorio() {
    if (estado.relatorioSujo) renderizarRelatorio();
    if (!estado.relatorioDados) { toast('Nenhum relatório para copiar ainda.', 'alerta'); return; }
    const texto = global.Relatorio.paraTexto(estado.relatorioDados);
    try {
      await navigator.clipboard.writeText(texto);
    } catch (_) {
      const ta = document.createElement('textarea');
      ta.value = texto; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); } catch (__) { /* sem suporte */ }
      ta.remove();
    }
    toast('Relatório copiado para a área de transferência.');
  }

  /* ====================== Inicialização ====================== */

  function erroFatal(msg) {
    const aviso = document.createElement('div');
    aviso.className = 'erro-fatal';
    aviso.textContent = msg;
    document.body.prepend(aviso);
  }

  function popularSelects() {
    $('selCultura').innerHTML = Object.entries(CULTURAS)
      .map(([k, c]) => `<option value="${k}">${U.esc(c.nome)} (${U.esc(c.cientifico)})</option>`).join('');
    $('selPeriodo').innerHTML = Object.entries(PERIODOS)
      .map(([k, p]) => `<option value="${k}">${U.esc(p.rotulo)}</option>`).join('');

    const anoAtual = new Date().getFullYear();
    const anos = Array.from({ length: 5 }, (_, i) => anoAtual - 1 - i);
    $('selAno').innerHTML = '<option value="clim">Média climatológica (longo prazo)</option>'
      + anos.map((a) => `<option value="${a}">Ano de ${a}</option>`).join('');

    $('selPolo').insertAdjacentHTML('beforeend', global.Polos.POLOS
      .map((p) => `<option value="${p.id}">${U.esc(p.nome)}</option>`).join(''));

    $('selResolucao').innerHTML = RESOLUCOES.map((r) => `<option value="${r.v}">${U.esc(r.rotulo)}</option>`).join('');
    $('selResolucao').value = '0.5';
  }

  function ligarEventos() {
    $('btnModoReal').addEventListener('click', () => definirModo('real'));
    $('btnModoSim').addEventListener('click', () => definirModo('sim'));

    $('selCultura').addEventListener('change', (e) => aplicarCultura(e.target.value));
    $('selPeriodo').addEventListener('change', (e) => { estado.periodo = e.target.value; agendarRecalculo(); }); // sem nova consulta: os 12 meses já estão em memória
    $('selAno').addEventListener('change', (e) => {
      estado.ano = e.target.value === 'clim' ? null : Number(e.target.value);
      invalidarGrade('Base de dados alterada: gere a análise regional novamente.');
      carregarClima();
    });

    $('selPolo').addEventListener('change', (e) => {
      const polo = global.Polos.POLOS.find((p) => p.id === e.target.value);
      e.target.value = '';
      if (polo) selecionarPonto(polo.lat, polo.lon, { nome: polo.nome, voar: true, zoom: 9 });
    });

    $('formCoord').addEventListener('submit', (e) => {
      e.preventDefault();
      let lat = Number($('inLat').value.trim().replace(',', '.'));
      let lon = Number($('inLon').value.trim().replace(',', '.'));
      // O teclado numérico do celular não tem a tecla "−". O sistema só analisa SP (hemisfério sul/oeste),
      // então um valor positivo é interpretado como negativo; o campo é reescrito com o sinal ao selecionar.
      if (Number.isFinite(lat) && lat > 0) lat = -lat;
      if (Number.isFinite(lon) && lon > 0) lon = -lon;
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
        toast('Informe latitude e longitude válidas (ex.: -21.1775 e -47.8103).', 'alerta');
        return;
      }
      selecionarPonto(lat, lon, { voar: true, zoom: 9 });
    });

    $('btnRestaurar').addEventListener('click', () => aplicarCultura(estado.culturaKey));
    $('btnVerSP').addEventListener('click', () => global.Mapa.ajustarParaSP());

    $('btnGrade').addEventListener('click', gerarGrade);
    $('btnCancelarGrade').addEventListener('click', () => global.GradeRegional.cancelar());
    $('btnLimparGrade').addEventListener('click', () => {
      global.GradeRegional.limpar();
      restaurarBotoesGrade();
      $('resumoGrade').textContent = '';
    });

    // Resumo rápido (celular): leva aos detalhes sem duplicar conteúdo.
    const rolarPara = (el) => el.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    $('btnRrDetalhes').addEventListener('click', () => rolarPara($('blocoAptidao')));
    $('btnRrRelatorio').addEventListener('click', () => { mostrarAba('relatorio'); rolarPara(document.querySelector('.dock')); });

    // Impressão: "<details>" fechado não é impresso; abre os detalhes técnicos durante a impressão.
    let reabrir = [];
    window.addEventListener('beforeprint', () => {
      if (!$('painelRelatorio').hidden && estado.relatorioSujo) renderizarRelatorio();
      reabrir = Array.from(document.querySelectorAll('.rel-tecnico:not([open])'));
      reabrir.forEach((d) => { d.open = true; });
    });
    window.addEventListener('afterprint', () => { reabrir.forEach((d) => { d.open = false; }); reabrir = []; });

    $('btnRecolher').addEventListener('click', () => alternarDock());
    $('tabGraficos').addEventListener('click', () => mostrarAba('graficos'));
    $('tabRelatorio').addEventListener('click', () => mostrarAba('relatorio'));
    // Ajuste manual do clima simulado (Modo Simulação)
    const aplicarAjuste = () => {
      const t = Number($('slAjTemp').value), c = Number($('slAjChuva').value);
      const u = Number($('slAjUmid').value), r = Number($('slAjRad').value);
      global.Simulador.definirAjuste({ temperatura: t, chuva: c, umidade: u, radiacao: r });
      const sinal = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
      const num = (v) => Math.abs(v).toString().replace('.', ',');
      $('outAjTemp').textContent = `${sinal(t)}${num(t)} °C`;
      $('outAjChuva').textContent = `${sinal(c)}${num(c)}%`;
      $('outAjUmid').textContent = `${sinal(u)}${num(u)} p.p.`;
      $('outAjRad').textContent = `${sinal(r)}${num(r)} MJ/m²/dia`;
      if (estado.modo === 'sim') {
        carregarClima();
        clearTimeout(estado.timerAjuste);
        estado.timerAjuste = setTimeout(() => { if (global.GradeRegional.existe()) gerarGrade(); }, 250);
      }
    };
    $('slAjTemp').addEventListener('input', aplicarAjuste);
    $('slAjChuva').addEventListener('input', aplicarAjuste);
    $('slAjUmid').addEventListener('input', aplicarAjuste);
    $('slAjRad').addEventListener('input', aplicarAjuste);
    $('btnAjZerar').addEventListener('click', () => { ['slAjTemp', 'slAjChuva', 'slAjUmid', 'slAjRad'].forEach((id) => { $(id).value = 0; }); aplicarAjuste(); });
    $('btnCopiar').addEventListener('click', copiarRelatorio);
    $('btnImprimir').addEventListener('click', () => { mostrarAba('relatorio'); setTimeout(() => window.print(), 50); });
  }

  function iniciar() {
    if (!global.L || !global.Chart) {
      erroFatal('Não foi possível carregar o Leaflet ou o Chart.js (verifique a conexão com a internet / CDN).');
      return;
    }

    popularSelects();

    global.Mapa.iniciar({
      elemento: $('mapa'),
      geojson: global.LIMITES_SP,
      aoClicarDentro: (lat, lon) => selecionarPonto(lat, lon),
      aoClicarFora: (lat, lon, latlng) => {
        global.Mapa.mostrarRejeicao(latlng);
        toast(global.Mapa.MSG_FORA, 'erro');
      },
    });
    global.Graficos.iniciar({ canvasHidrico: $('cvHidrico'), canvasTermico: $('cvTermico') });
    global.Tema.iniciar({
      botao: $('btnTema'),
      aoMudar: () => {            // o que é desenhado em canvas/Leaflet precisa ser repintado com as cores do novo tema
        global.Graficos.aplicarTema();
        global.GradeRegional.repintar();
        recalcular();
      },
    });
    global.GradeRegional.configurar({
      avaliar: (clima) => global.Agronomia.avaliar(clima, estado.params, estado.periodo, { hidrico: false }),
      aoSelecionarPonto: (lat, lon) => selecionarPonto(lat, lon),
    });

    construirSliders();
    ligarEventos();
    atualizarOpcoesResolucao();
    aplicarCultura(estado.culturaKey);

    const inicial = global.Polos.POLOS.find((p) => p.id === POLO_INICIAL);
    selecionarPonto(inicial.lat, inicial.lon, { nome: inicial.nome, exemplo: true });
  }

  // Exposto para depuração/testes no console (não é API pública).
  global.AptidaoApp = { estado, selecionarPonto, definirModo, aplicarCultura, gerarGrade, recalcular };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})(window);
