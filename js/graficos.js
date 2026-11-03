/* graficos.js — Gráficos Chart.js: Balanço hídrico e Perfil térmico.
   Os dois gráficos são criados uma única vez; depois só os dados são trocados
   (update sem animação → sliders fluidos, sem recriar canvas). */
(function (global) {
  'use strict';

  /** Cores dos gráficos: vêm das variáveis CSS (--g-*) do tema atual. */
  const lerCores = () => {
    const v = (n) => global.Tema.cssVar(n);
    return {
      chuva: v('--g-chuva'), necessidade: v('--g-necessidade'), deficit: v('--g-deficit'), excedente: v('--g-excedente'),
      temp: v('--g-temp'), limInf: v('--g-liminf'), limSup: v('--g-limsup'), faixa: v('--g-faixa'),
      texto: v('--g-texto'), grade: v('--g-grade'), legenda: v('--g-legenda'),
    };
  };
  let COR = null;
  const MESES = global.Util.MESES;

  let gHidrico = null;
  let gTermico = null;
  let foraDoPeriodo = new Array(12).fill(false);

  /** Cor com transparência reduzida nos meses fora do período analisado. */
  const rgba = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };
  const comAlfa = (hex, normal = 0.85, apagado = 0.25) => (ctx) => rgba(hex, foraDoPeriodo[ctx.dataIndex] ? apagado : normal);

  const escalaBase = (titulo) => ({
    ticks: { color: COR.texto, font: { size: 10 } },
    grid: { color: COR.grade },
    title: titulo ? { display: true, text: titulo, color: COR.texto, font: { size: 10 } } : undefined,
  });

  const opcoesComuns = () => ({
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: COR.legenda, font: { size: 10 }, boxWidth: 12, boxHeight: 12 } },
    },
  });

  function iniciar({ canvasHidrico, canvasTermico }) {
    const Chart = global.Chart;
    COR = lerCores();
    Chart.defaults.font.family = "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

    gHidrico = new Chart(canvasHidrico.getContext('2d'), {
      type: 'bar',
      data: {
        labels: MESES,
        datasets: [
          { label: 'Precipitação (mm)', data: new Array(12).fill(0), backgroundColor: comAlfa(COR.chuva), borderRadius: 3, order: 3 },
          { label: 'Déficit (mm)', data: new Array(12).fill(0), backgroundColor: comAlfa(COR.deficit), borderRadius: 3, order: 4 },
          { label: 'Excedente (mm)', data: new Array(12).fill(0), backgroundColor: comAlfa(COR.excedente), borderRadius: 3, order: 5 },
          { label: 'Necessidade hídrica (mm)', type: 'line', data: new Array(12).fill(0), borderColor: COR.necessidade, backgroundColor: COR.necessidade, pointBackgroundColor: COR.necessidade, pointBorderColor: COR.necessidade, borderWidth: 2.5, pointRadius: 3, tension: 0.3, order: 1 },
        ],
      },
      options: {
        ...opcoesComuns(),
        scales: { x: escalaBase(), y: { ...escalaBase('mm/mês'), beginAtZero: true } },
      },
    });

    gTermico = new Chart(canvasTermico.getContext('2d'), {
      type: 'line',
      data: {
        labels: MESES,
        datasets: [
          { label: 'Limite térmico inferior', data: new Array(12).fill(0), borderColor: COR.limInf, borderDash: [6, 4], borderWidth: 1.8, pointRadius: 0, fill: false },
          { label: 'Limite térmico superior', data: new Array(12).fill(0), borderColor: COR.limSup, borderDash: [6, 4], borderWidth: 1.8, pointRadius: 0, fill: '-1', backgroundColor: COR.faixa },
          { label: 'Temperatura média (°C)', data: new Array(12).fill(0), borderColor: COR.temp, backgroundColor: COR.temp, borderWidth: 2.5, pointRadius: 3.5, tension: 0.3,
            pointBackgroundColor: (ctx) => (foraDoPeriodo[ctx.dataIndex] ? rgba(COR.temp, 0.35) : COR.temp) },
        ],
      },
      options: {
        ...opcoesComuns(),
        scales: { x: escalaBase(), y: escalaBase('°C') },
      },
    });
  }

  /**
   * @param {object} av     resultado de Agronomia.avaliar (com hidrico)
   * @param {object} clima  { meses }
   * @param {object} params parâmetros da cultura (limites de temperatura)
   */
  function atualizar(av, clima, params) {
    if (!gHidrico || !gTermico || !av || !av.hidrico) return;
    const periodo = new Set(av.periodo.meses);
    foraDoPeriodo = MESES.map((_, i) => !periodo.has(i));
    const h = av.hidrico.meses;
    const r1 = (v) => Math.round(v * 10) / 10;

    gHidrico.data.datasets[0].data = h.map((m) => r1(m.precip));
    gHidrico.data.datasets[1].data = h.map((m) => r1(m.deficit));
    gHidrico.data.datasets[2].data = h.map((m) => r1(m.excedente));
    gHidrico.data.datasets[3].data = h.map((m) => r1(m.necessidade));
    gHidrico.update('none');

    gTermico.data.datasets[0].data = new Array(12).fill(params.temperatura.min);
    gTermico.data.datasets[1].data = new Array(12).fill(params.temperatura.max);
    gTermico.data.datasets[2].data = clima.meses.map((m) => r1(m.temp));
    gTermico.update('none');
  }

  /** Reaplica as cores ao trocar de tema (sem recriar os gráficos). */
  function aplicarTema() {
    if (!gHidrico || !gTermico) return;
    COR = lerCores();
    const h = gHidrico.data.datasets, t = gTermico.data.datasets;
    h[0].backgroundColor = comAlfa(COR.chuva);
    h[1].backgroundColor = comAlfa(COR.deficit);
    h[2].backgroundColor = comAlfa(COR.excedente);
    h[3].borderColor = h[3].backgroundColor = h[3].pointBackgroundColor = h[3].pointBorderColor = COR.necessidade;
    t[0].borderColor = COR.limInf;
    t[1].borderColor = COR.limSup;
    t[1].backgroundColor = COR.faixa;
    t[2].borderColor = t[2].backgroundColor = t[2].pointBorderColor = COR.temp;
    [gHidrico, gTermico].forEach((g) => {
      Object.values(g.options.scales).forEach((e) => {
        e.ticks.color = COR.texto;
        e.grid.color = COR.grade;
        if (e.title) e.title.color = COR.texto;
      });
      g.options.plugins.legend.labels.color = COR.legenda;
      g.update('none');
    });
  }

  const redimensionar = () => { if (gHidrico) gHidrico.resize(); if (gTermico) gTermico.resize(); };
  const obterGraficos = () => ({ gHidrico, gTermico });

  global.Graficos = { iniciar, atualizar, aplicarTema, redimensionar, obterGraficos };
})(typeof window !== 'undefined' ? window : globalThis);
