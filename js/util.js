/* util.js — Funções utilitárias sem dependência de DOM/Leaflet. */
(function (global) {
  'use strict';

  const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  /** Escapa texto para uso seguro em innerHTML (nomes vindos de APIs externas). */
  function esc(valor) {
    return String(valor ?? '').replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const media = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : NaN);
  const soma = (arr) => arr.reduce((s, v) => s + v, 0);

  function fmt(v, casas = 1) {
    if (v === null || v === undefined || Number.isNaN(v)) return '—';
    return Number(v).toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  }

  function debounce(fn, ms) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  /** Dias de cada mês; ano nulo = climatologia (fevereiro = 28,25). */
  function diasDoMes(ano) {
    if (ano === null || ano === undefined) return [31, 28.25, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
    return [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  }

  /** Executa `tarefas` (funções async) com no máximo `limite` em paralelo. */
  async function executarComLimite(tarefas, limite, aoProgredir, sinal) {
    const resultados = new Array(tarefas.length);
    let proximo = 0;
    let concluidas = 0;
    async function trabalhador() {
      while (proximo < tarefas.length) {
        if (sinal && sinal.aborted) return;
        const i = proximo++;
        try { resultados[i] = { ok: true, valor: await tarefas[i]() }; }
        catch (erro) { resultados[i] = { ok: false, erro }; }
        concluidas++;
        if (aoProgredir) aoProgredir(concluidas, tarefas.length);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limite, tarefas.length) }, trabalhador));
    return resultados;
  }

  global.Util = { MESES, esc, clamp, media, soma, fmt, debounce, diasDoMes, executarComLimite };
})(typeof window !== 'undefined' ? window : globalThis);
