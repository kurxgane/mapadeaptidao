/* tema.js — Tema escuro/claro. As cores ficam em css/style.css (variáveis); aqui só guardamos a escolha
   no navegador e avisamos os módulos que desenham fora do CSS (gráficos, marcador, grade do mapa). */
(function (global) {
  'use strict';

  const CHAVE = 'aptidao-sp:tema';
  const raiz = document.documentElement;
  const ouvintes = [];
  let botao = null;

  const atual = () => (raiz.dataset.tema === 'claro' ? 'claro' : 'escuro');
  const cssVar = (nome) => getComputedStyle(raiz).getPropertyValue(nome).trim();
  /** Variável como vista pela área do mapa (que mantém as cores do tema claro mesmo no escuro). */
  const cssVarMapa = (nome) => getComputedStyle(document.querySelector('.mapa-wrap') || raiz).getPropertyValue(nome).trim();
  const VAR_CLASSE = { APTA: '--apta', MODERADA: '--moderada', INAPTA: '--inapta' };
  /** Cor de preenchimento da classe de aptidão no tema atual. */
  const corClasse = (id) => cssVarMapa(VAR_CLASSE[id]) || cssVarMapa('--sem-dados');

  function guardar(tema) {
    try { localStorage.setItem(CHAVE, tema); } catch (e) { /* navegação privada / bloqueado: segue sem guardar */ }
  }

  function atualizarInterface() {
    const claro = atual() === 'claro';
    if (botao) {
      const txt = claro ? 'Alternar para o tema escuro' : 'Alternar para o tema claro';
      botao.setAttribute('aria-label', txt);
      botao.title = txt;
    }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = claro ? '#FFFFFF' : '#2C2C2C';
  }

  function definir(tema, { salvar = true } = {}) {
    raiz.dataset.tema = tema === 'claro' ? 'claro' : 'escuro';
    if (salvar) guardar(atual());
    atualizarInterface();
    ouvintes.forEach((fn) => { try { fn(atual()); } catch (e) { console.error(e); } });
  }

  function iniciar({ botao: el, aoMudar } = {}) {
    botao = el || null;
    if (aoMudar) ouvintes.push(aoMudar);
    if (botao) botao.addEventListener('click', () => definir(atual() === 'claro' ? 'escuro' : 'claro'));
    atualizarInterface();
  }

  global.Tema = { iniciar, definir, atual, cssVar, cssVarMapa, corClasse };
})(typeof window !== 'undefined' ? window : globalThis);
