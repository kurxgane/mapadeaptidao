/* clima.js — Fachada de DADOS CLIMÁTICOS (escolhe a fonte; não classifica nada).
   Camada 1 do sistema: obtenção de dados. A camada 2 (agronomia.js) só recebe
   o objeto canônico { meses, dias } e não sabe de onde ele veio. */
(function (global) {
  'use strict';

  const FONTES = {
    nasa:      { id: 'nasa',      rotulo: 'NASA POWER',           tom: 'ok' },
    simulado:  { id: 'simulado',  rotulo: 'Simulação local',      tom: 'sim' },
    fallback:  { id: 'fallback',  rotulo: 'Simulação (fallback)', tom: 'alerta' },
  };

  /* Período da média climatológica: lido da própria resposta da NASA POWER (campo `header.range`, extraído em
     nasa-power.js e guardado em `clima.detalhe.periodo`). Não há período fixo no código: se o campo estiver ausente
     ou não puder ser interpretado, mostra-se apenas "média climatológica de longo prazo", sem inventar datas. */
  const rotuloPeriodo = (ano, periodo) => {
    if (ano !== null && ano !== undefined) return `ano ${ano}`;
    return periodo && periodo.texto ? `média climatológica de longo prazo (${periodo.texto})` : 'média climatológica de longo prazo';
  };

  /**
   * @param {{modo:'real'|'sim', ano:number|null, sinal?:AbortSignal}} opcoes
   * @returns {{clima, fonte, descricao, aviso?, celula?, origemCache?}}
   * Em modo real, falhas da NASA caem para o simulador e isso é SINALIZADO em `fonte`/`aviso`.
   */
  async function obter(lat, lon, { modo, ano = null, sinal } = {}) {
    if (modo === 'sim') {
      const aj = global.Simulador.obterAjuste();
      const txt = [];
      if (aj.temperatura) txt.push(`${aj.temperatura > 0 ? '+' : '−'}${Math.abs(aj.temperatura).toString().replace('.', ',')} °C`);
      if (aj.chuva) txt.push(`${aj.chuva > 0 ? '+' : '−'}${Math.abs(aj.chuva)}% chuva`);
      if (aj.umidade) txt.push(`${aj.umidade > 0 ? '+' : '−'}${Math.abs(aj.umidade)} p.p. umidade`);
      if (aj.radiacao) txt.push(`${aj.radiacao > 0 ? '+' : '−'}${Math.abs(aj.radiacao).toString().replace('.', ',')} MJ/m²/dia radiação`);
      return {
        clima: global.Simulador.gerarAjustado(lat, lon), fonte: FONTES.simulado,
        descricao: 'dados sintéticos gerados localmente' + (txt.length ? ` · ajuste manual: ${txt.join(', ')}` : ''),
      };
    }
    try {
      const r = await global.NasaPower.obter(lat, lon, { ano, sinal });
      return {
        clima: r.clima, fonte: FONTES.nasa, celula: r.celula, origemCache: r.origemCache,
        // "grade de consulta" = coordenada arredondada pelo aplicativo (não é a célula nativa da NASA POWER).
        descricao: `${rotuloPeriodo(ano, r.clima.detalhe && r.clima.detalhe.periodo)} · grade de consulta de ${String(global.NasaPower.RESOLUCAO).replace('.', ',')}° (centro ${r.celula.lat.toFixed(1)}°, ${r.celula.lon.toFixed(1)}°)${r.origemCache ? ' · cache' : ''}`,
        aviso: r.clima.detalhe && r.clima.detalhe.lacunas ? `${r.clima.detalhe.lacunas} valor(es) ausente(s) foram interpolados.` : undefined,
      };
    } catch (erro) {
      if (erro && erro.name === 'AbortError') throw erro;
      const motivo = erro && erro.message ? erro.message : 'erro desconhecido';
      return {
        clima: global.Simulador.gerar(lat, lon), fonte: FONTES.fallback,
        descricao: 'NASA POWER indisponível — usando simulador local',
        aviso: `${motivo} Os resultados NÃO são dados reais.`,
      };
    }
  }

  /** Versão estrita (sem fallback) — usada pela grade em modo real. Lança em caso de erro. */
  async function obterReal(lat, lon, { ano = null, sinal } = {}) {
    const r = await global.NasaPower.obter(lat, lon, { ano, sinal });
    return { clima: r.clima, celula: r.celula };
  }

  global.Clima = { FONTES, obter, obterReal };
})(typeof window !== 'undefined' ? window : globalThis);
