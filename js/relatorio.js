/* relatorio.js — Resultado da classificação para o usuário (cartão, relatório, diagnóstico).
   Camada 3 do sistema: apresentação do RESULTADO. Não calcula aptidão e não busca dados.
   O relatório é montado uma vez como estrutura e convertido em HTML e em texto puro. */
(function (global) {
  'use strict';

  const U = global.Util;
  const NOMES_STATUS = { adequada: 'adequada', moderada: 'moderada', inadequada: 'inadequada' };
  const ICONE = { adequada: '✔', moderada: '⚠', inadequada: '✖' };

  const valorFator = (f) => `${U.fmt(f.valor, f.casas)} ${f.unidade}`;
  const faixaFator = (f) => `${U.fmt(f.faixa.min, f.casas)}–${U.fmt(f.faixa.max, f.casas)} ${f.unidade}`;

  /** Texto de diagnóstico: quais fatores determinaram a classificação. */
  function diagnostico(av, cultura, kc) {
    const paragrafos = [];
    const crit = av.fatores.filter((f) => f.status === 'inadequada' && f.critico);

    if (!av.limitantes.length) {
      paragrafos.push(`Todas as variáveis climáticas do período (${av.periodo.rotulo.toLowerCase()}) estão dentro das faixas adequadas definidas pelo modelo para ${cultura.nome}. Por isso a classificação é APTA.`);
    } else {
      if (av.classe.id === 'INAPTA') {
        paragrafos.push(`A classificação é INAPTA porque ${crit.length > 1 ? 'fatores críticos estão' : 'um fator crítico está'} além da tolerância do modelo: ${crit.map((f) => f.nome.toLowerCase()).join(' e ')}.`);
      } else {
        paragrafos.push('A classificação é MODERADA porque há limitações parciais, sem nenhum fator crítico além da tolerância do modelo.');
      }
      av.limitantes.forEach((f) => {
        const gravidade = f.status === 'inadequada' ? 'além da tolerância' : 'dentro da tolerância';
        paragrafos.push(`${f.texto}: ${valorFator(f)} contra faixa adequada de ${faixaFator(f)} (desvio de ${U.fmt(f.desvio, f.casas)} ${f.unidade}, ${gravidade} de ${U.fmt(f.faixa.tolerancia, f.casas)} ${f.unidade})${f.critico ? ' — fator crítico' : ''}.`);
      });
    }

    if (av.hidrico) {
      const h = av.hidrico;
      paragrafos.push(`Balanço hídrico simplificado (indicativo) no período: necessidade de ${U.fmt(h.necessidadePeriodo, 0)} mm (ET₀ de Makkink × Kc único de ${U.fmt(kc, 2)}), precipitação total corrigida de ${U.fmt(av.resumo.precipTotal, 0)} mm, déficit acumulado de ${U.fmt(h.deficitPeriodo, 0)} mm e excedente de ${U.fmt(h.excedentePeriodo, 0)} mm. O cálculo não estima chuva efetiva nem desconta infiltração, escoamento ou armazenamento de água no solo.`);
    }
    return paragrafos;
  }

  /** Resumo interpretativo em linguagem simples. Apenas reescreve o resultado já calculado pelo modelo. */
  function resumoSimples(av, cultura, ponto) {
    const onde = ponto && ponto.municipio ? `em ${ponto.municipio}` : 'neste ponto';
    const per = `no período ${av.periodo.rotulo}`;
    const crit = av.fatores.filter((f) => f.status === 'inadequada' && f.critico);
    const paragrafos = [];
    if (!av.limitantes.length) {
      paragrafos.push(`O clima ${onde}, ${per}, atende às exigências de ${cultura.nome}: temperatura, chuva, umidade e radiação estão dentro das faixas que o modelo considera adequadas.`);
    } else if (av.classe.id === 'INAPTA') {
      paragrafos.push(`O clima ${onde}, ${per}, não atende às exigências de ${cultura.nome}: ${crit.map((f) => f.nome.toLowerCase()).join(' e ')} ${crit.length > 1 ? 'estão além' : 'está além'} do que a cultura tolera, segundo o modelo.`);
    } else {
      paragrafos.push(`O clima ${onde}, ${per}, atende em parte às exigências de ${cultura.nome}: ${av.limitantes.length > 1 ? 'há fatores fora' : 'há um fator fora'} da faixa ideal, mas nenhuma variável crítica passou da tolerância do modelo.`);
    }
    av.limitantes.forEach((f) => paragrafos.push(`${f.texto}: o ponto tem ${valorFator(f)} e a cultura pede ${faixaFator(f)}.`));
    return paragrafos;
  }

  const COMO_LER = 'Como ler a classificação (indicativa): APTA = todas as variáveis dentro da faixa da cultura; MODERADA = há limitações, mas nenhuma variável crítica passou da tolerância; INAPTA = uma variável crítica do modelo passou da tolerância.';

  /** Monta a estrutura do relatório. */
  function construir({ ponto, cultura, params, av, fonte }) {
    const meses = av.hidrico ? av.hidrico.meses.map((m, i) => (m.noPeriodo && m.deficit > 1 ? U.MESES[i] : null)).filter(Boolean) : [];

    const restricoes = av.limitantes.map((f) => `${f.texto} (${valorFator(f)} no ponto; faixa exigida ${faixaFator(f)})`);
    const observacoes = [];
    const rad = fonte.radiacao;
    if (rad) {
      observacoes.push(rad.origem === 'declarada'
        ? `Radiação solar (NASA POWER): unidade informada pela API = ${rad.unidade}${rad.fator !== 1 ? '; convertida ×3,6 para MJ/m²/dia' : '; usada sem conversão (MJ/m²/dia)'}.`
        : `Radiação solar (NASA POWER): a API não informou a unidade; ${rad.fator !== 1 ? 'valores baixos foram tratados como kWh/m²/dia e convertidos ×3,6 para MJ/m²/dia' : 'os valores foram tratados como MJ/m²/dia (sem conversão)'}.`);
    }
    if (meses.length) observacoes.push(`Meses com déficit no balanço hídrico simplificado, no período: ${meses.join(', ')} (informativo; não altera a classe).`);

    return {
      titulo: 'RELATÓRIO AGRONÔMICO',
      identificacao: [
        ['Estado', 'São Paulo'],
        ['Município', ponto.municipio || 'não identificado'],
        ['Região', ponto.regiaoTxt || '—'],
        ['Latitude', ponto.lat.toFixed(4)],
        ['Longitude', ponto.lon.toFixed(4)],
        ['Cultura', `${cultura.nome} (${cultura.cientifico})`],
        ['Período analisado', av.periodo.rotulo],
        ['Fonte dos dados', `${fonte.rotulo} — ${fonte.descricao}`],
      ],
      classificacao: { id: av.classe.id, emoji: av.classe.emoji, indice: av.indice },
      resumo: resumoSimples(av, cultura, ponto),
      comoLer: COMO_LER,
      condicoes: av.fatores.map((f) => [f.nome, valorFator(f)]),
      avaliacao: av.fatores.map((f) => ({ nome: f.nome, status: f.status, texto: NOMES_STATUS[f.status] })),
      restricoes: restricoes.length ? restricoes : ['Nenhuma restrição identificada pelo modelo.'],
      temRestricao: restricoes.length > 0,
      observacoes,
      limitante: av.principal ? av.principal.limitante : null,
      diagnostico: diagnostico(av, cultura, params.kc),
      aviso: fonte.aviso || null,
      nota: [
        'Resultado indicativo de um modelo simplificado de compatibilidade climática. Não é laudo oficial de aptidão agrícola, recomendação de plantio nem classificação do Zoneamento Agrícola de Risco Climático (ZARC).',
        'As faixas das culturas têm apoio parcial em documentos técnicos (ZARC/MAPA, Embrapa, FAO), mas tolerâncias, umidade, radiação e pesos ainda são valores ilustrativos, sem validação científica.',
        'O modelo usa médias do período e não considera solo, relevo, cultivar, fases da cultura, distribuição das chuvas nem eventos extremos (geada, veranico, granizo). O balanço hídrico é simplificado: ET₀ de Makkink sem calibração local demonstrada, Kc único e precipitação total corrigida (PRECTOTCORR) sem chuva efetiva, infiltração, escoamento ou armazenamento de água no solo.',
        'Quando vêm da NASA POWER, os dados representam uma célula de grade (de ~55 a ~110 km), não uma propriedade rural específica.',
      ],
    };
  }

  function paraHtml(r) {
    const e = U.esc;
    const classeCss = `classe-${r.classificacao.id.toLowerCase()}`;
    return `
      <h3 class="rel-titulo">${e(r.titulo)}</h3>
      ${r.aviso ? `<p class="rel-aviso">⚠ ${e(r.aviso)}</p>` : ''}
      <dl class="rel-id">${r.identificacao.map(([k, v]) => `<div><dt>${e(k)}</dt><dd>${e(v)}</dd></div>`).join('')}</dl>
      <div class="rel-classe ${classeCss}"><span>Classificação</span><strong>${r.classificacao.emoji} ${e(r.classificacao.id)}</strong><small>índice ${r.classificacao.indice}/100</small></div>
      <section class="rel-resumo"><h4>Em resumo</h4>${r.resumo.map((t) => `<p>${e(t)}</p>`).join('')}<p class="rel-como">${e(r.comoLer)}</p></section>
      ${r.limitante ? `<p class="rel-limitante">Principal fator limitante: <strong>${e(r.limitante)}</strong></p>` : ''}
      <details class="rel-tecnico">
        <summary>Detalhes técnicos: condições, avaliação, restrições e diagnóstico</summary>
        <div class="rel-colunas">
          <section><h4>Condições climáticas</h4><ul>${r.condicoes.map(([k, v]) => `<li><span>${e(k)}</span><b>${e(v)}</b></li>`).join('')}</ul></section>
          <section><h4>Avaliação</h4><ul>${r.avaliacao.map((a) => `<li class="st-${a.status}"><span>${e(a.nome)}</span><b>${ICONE[a.status]} ${e(a.texto)}</b></li>`).join('')}</ul></section>
        </div>
        <section><h4>Restrições</h4><ul class="rel-lista">${r.restricoes.map((t) => `<li>${e(t)}</li>`).join('')}</ul>
          ${r.observacoes.map((t) => `<p class="rel-obs">${e(t)}</p>`).join('')}</section>
        <section><h4>Diagnóstico</h4>${r.diagnostico.map((t) => `<p>${e(t)}</p>`).join('')}</section>
      </details>
      <footer class="rel-nota">${r.nota.map((t) => `<p>${e(t)}</p>`).join('')}</footer>`;
  }

  function paraTexto(r) {
    const linhas = [r.titulo, ''];
    if (r.aviso) linhas.push(`ATENÇÃO: ${r.aviso}`, '');
    r.identificacao.forEach(([k, v]) => linhas.push(`${k}: ${v}`));
    linhas.push('', `Classificação: ${r.classificacao.id} (índice ${r.classificacao.indice}/100)`, '', 'Em resumo');
    r.resumo.forEach((t) => linhas.push(t));
    linhas.push(r.comoLer, '', 'Condições climáticas');
    r.condicoes.forEach(([k, v]) => linhas.push(`- ${k}: ${v}`));
    linhas.push('', 'Avaliação');
    r.avaliacao.forEach((a) => linhas.push(`- ${a.nome}: ${a.texto}`));
    linhas.push('', 'Restrições');
    r.restricoes.forEach((t) => linhas.push(`- ${t}`));
    r.observacoes.forEach((t) => linhas.push(t));
    if (r.limitante) linhas.push('', `Principal fator limitante: ${r.limitante}`);
    linhas.push('', 'Diagnóstico');
    r.diagnostico.forEach((t) => linhas.push(t));
    linhas.push('', ...r.nota);
    return linhas.join('\n');
  }

  /* ---------- Cartão lateral (indicadores, badge, motivos) ---------- */

  const $ = (id) => document.getElementById(id);

  function renderResumo(av) {
    const r = av.resumo;
    $('valTemp').textContent = `${U.fmt(r.temperatura)} °C`;
    $('valChuva').textContent = `${U.fmt(r.precipitacao, 0)} mm/mês`;
    $('subChuva').textContent = `${U.fmt(r.precipTotal, 0)} mm no período`;
    $('valUmid').textContent = `${U.fmt(r.umidade, 0)} %`;
    $('valRad').textContent = `${U.fmt(r.radiacao)} MJ/m²/dia`;

    const marca = { temperatura: 'metTemp', precipitacao: 'metChuva', umidade: 'metUmid', radiacao: 'metRad' };
    av.fatores.forEach((f) => { $(marca[f.id]).dataset.status = f.status; });

    const badge = $('badgeClasse');
    badge.className = `badge-classe classe-${av.classe.id.toLowerCase()}`;
    badge.textContent = `${av.classe.emoji} ${av.classe.id}`;
    $('indiceTxt').textContent = `índice ${av.indice}/100`;

    $('listaMotivos').innerHTML = av.fatores.map((f) => {
      const detalhe = f.status === 'adequada' ? `${valorFator(f)}` : `${valorFator(f)} no ponto · faixa exigida ${faixaFator(f)}`;
      return `<li class="st-${f.status}"><span class="ic" aria-hidden="true">${ICONE[f.status]}</span><span><b>${U.esc(f.texto)}</b><small>${U.esc(detalhe)}</small></span></li>`;
    }).join('');

    $('limitante').innerHTML = av.principal
      ? `Principal fator limitante: <strong>${U.esc(av.principal.limitante)}</strong>`
      : 'Nenhum fator limitante identificado pelo modelo.';
  }

  function renderFonte(fonte) {
    const el = $('fonteDados');
    el.className = `fonte fonte-${fonte.fonte.tom}`;
    el.textContent = `${fonte.fonte.rotulo} · ${fonte.descricao}`;
    const aviso = $('avisoDados');
    const selo = $('seloFonte');
    if (fonte.fonte.tom === 'ok') { selo.hidden = true; selo.textContent = ''; } else {
      selo.hidden = false;
      selo.className = `selo-fonte selo-fonte-${fonte.fonte.tom}`;
      selo.title = fonte.fonte.tom === 'alerta' ? 'A NASA POWER não respondeu; os valores exibidos são simulados e não são dados reais.' : 'Os valores exibidos são gerados localmente e não são medições reais.';
      selo.textContent = fonte.fonte.tom === 'alerta' ? '⚠ NASA indisponível · dados simulados' : '⚠ Dados simulados';
    }
    if (fonte.aviso) { aviso.hidden = false; aviso.textContent = `⚠ ${fonte.aviso}`; } else { aviso.hidden = true; aviso.textContent = ''; }
  }

  /** Faixa compacta com o resultado, junto ao mapa (celular). Só apresenta o que o modelo já calculou. */
  function renderResumoRapido({ ponto, cultura, av, fonte }) {
    $('resumoRapido').hidden = false;
    const c = $('rrClasse');
    c.className = `rr-classe classe-${av.classe.id.toLowerCase()}`;
    c.textContent = `${av.classe.emoji} ${av.classe.id}`;
    $('rrCultura').textContent = `${cultura.nome} · ${av.periodo.rotulo}`;
    $('rrLocal').textContent = ponto.municipio || `Lat ${ponto.lat.toFixed(2)} · Lon ${ponto.lon.toFixed(2)}`;
    $('rrLimitante').innerHTML = av.principal
      ? `Principal fator limitante: <strong>${U.esc(av.principal.limitante)}</strong>`
      : 'Nenhum fator limitante identificado pelo modelo.';
    const f = $('rrFonte');
    const simulado = fonte && fonte.fonte.tom !== 'ok';
    f.hidden = !simulado;
    f.textContent = simulado ? (fonte.fonte.tom === 'alerta' ? '⚠ NASA POWER indisponível: dados simulados, não reais' : '⚠ Dados simulados: não são medições reais') : '';
  }

  function popup({ ponto, cultura, av, simulado }) {
    const e = U.esc;
    return `<div class="pp"><div class="pp-topo"><strong>${e(ponto.municipio || 'Ponto selecionado')}</strong>`
      + `<span class="pp-classe classe-${av.classe.id.toLowerCase()}">${av.classe.emoji} ${e(av.classe.id)}</span></div>`
      + `<div class="pp-linha">${e(cultura.nome)} · ${e(av.periodo.rotulo)}</div>`
      + `<div class="pp-linha">${U.fmt(av.resumo.temperatura)} °C · ${U.fmt(av.resumo.precipitacao, 0)} mm/mês</div>`
      + `<div class="pp-sub">${av.principal ? 'Limitante: ' + e(av.principal.limitante) : 'Sem fator limitante'}</div>`
      + (simulado ? '<div class="pp-sub">⚠ Dados simulados</div>' : '') + '</div>';
  }

  global.Relatorio = { construir, paraHtml, paraTexto, diagnostico, resumoSimples, renderResumo, renderResumoRapido, renderFonte, popup };
})(typeof window !== 'undefined' ? window : globalThis);
