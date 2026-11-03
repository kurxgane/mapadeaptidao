# Metodologia, fontes e limitações

Mapa de Aptidão Agrícola do Estado de São Paulo — Projeto Integrador (Fatec Bebedouro, Big Data no Agronegócio).

> **Resultado indicativo de um modelo simplificado.** As classes APTA, MODERADA e INAPTA não são laudo oficial de aptidão
> agrícola, recomendação de plantio nem o Zoneamento Agrícola de Risco Climático (ZARC). O projeto mantém seu modelo de
> classificação por faixas e não pretende reproduzir o ZARC.

**Como ler este documento.** As afirmações vêm acompanhadas do número da fonte, entre colchetes (seção 8). Quando algo é
medição ou teste do projeto, isso é dito. Quando algo não pôde ser verificado, isso também é dito. A bibliografia da seção 8 separa
o que foi lido por extração de texto, o que foi apenas identificado e o que é secundário.

---

## 1. Origem dos dados meteorológicos

O sistema consulta a API da NASA POWER (*Prediction Of Worldwide Energy Resources*) [1], comunidade `ag`, com quatro parâmetros:

| Parâmetro | Descrição usada neste projeto | Unidade na API (comunidade `ag`) |
|---|---|---|
| `T2M` | Temperatura do ar a 2 m | °C |
| `PRECTOTCORR` | **Precipitação total corrigida** | mm/dia |
| `RH2M` | Umidade relativa a 2 m | % |
| `ALLSKY_SFC_SW_DWN` | Radiação solar de superfície em céu real | MJ/m²/dia |

As unidades acima foram **conferidas pelo autor em consulta direta à API** (nov/2026). A conferência não foi reproduzida pelo
assistente de desenvolvimento, que não teve acesso à API real. A documentação da NASA diz que as unidades são "adequadas à
comunidade" escolhida [3], e não as lista; por isso a consulta fixa `community=ag` e o código lê a unidade declarada na resposta
(com um critério de plausibilidade como alternativa, descrito em `js/nasa-power.js`).

Segundo a NASA, a radiação vem do arquivo GEWEX SRB R4-IP e dos projetos CERES SYN1deg e FLASHFlux, e as variáveis
meteorológicas vêm de modelos de reanálise (MERRA-2 e GEOS) [1][2]. **A documentação consultada não permite afirmar qual produto
específico gera o `PRECTOTCORR`.** O texto "precipitação total corrigida" é o nome do parâmetro; este projeto não assume o método da
correção.

## 2. Resolução espacial e limitações

**Resolução nativa (NASA).** A documentação oficial informa grade de ½° × ⅝° (latitude × longitude) para as fontes meteorológicas
e de 1° × 1° para a fonte primária de radiação solar, sem reamostragem para uma grade comum [1][2]. Na latitude de São Paulo isso
equivale a células de cerca de 55 km × 65 km (meteorologia) e 110 km (radiação). Cada valor é a **média de uma célula**, não uma
medição no ponto clicado; microclima, relevo local e a propriedade em si não aparecem. Como a radiação é a variável de menor
resolução, ela limita também o ET₀ e o balanço hídrico.

**Grade de consulta do aplicativo (0,5°).** O aplicativo arredonda as coordenadas para múltiplos de 0,5° **apenas** para reaproveitar
consultas em cache e reduzir requisições. Esse arredondamento é uma escolha do aplicativo e **não é a resolução nativa** dos dados.
A grade regional usa os mesmos passos (0,5° e 1,0° com dados reais; 0,1° e 0,25° só em simulação).

**Teste do arredondamento.** Em consulta do autor em Bebedouro, as coordenadas -20,95/-48,48 e -21,0/-48,5 devolveram os mesmos
valores, o que indica que, nesse ponto, o arredondamento não mudou o dado recebido. **O teste não foi repetido em outros pontos**,
em particular perto de bordas de células nativas; a conclusão não deve ser generalizada.

## 3. Período climatológico

Os valores são **médias climatológicas mensais** que a NASA calcula a partir de valores diários [3].

- **Período lido da resposta da API.** Na resposta real da NASA POWER o período aparece em `header.range` (exemplo observado pelo
  autor em nov/2026: "25-year Meteorological and Solar Monthly & Annual Climatologies (January 2001 - December 2025)", ou seja,
  janeiro de 2001 a dezembro de 2025). O aplicativo extrai o trecho "(Mês AAAA - Mês AAAA)" e o exibe em português.
- **Esse período não é permanente.** Materiais de terceiros descrevem outros períodos (por exemplo, janeiro/2001 a dezembro/2020 em um
  guia do pacote R `nasapower` [12]), o que indica que a NASA o atualiza com o tempo. A documentação oficial consultada não define
  o período padrão [1][3].
- **Informação dinâmica.** O período não está escrito no código (`periodoDaClimatologia` em `js/nasa-power.js`; exibição em
  `js/clima.js`). Se `header.range` estiver ausente, em formato diferente, com mês desconhecido ou com intervalo invertido, o
  aplicativo mostra apenas "média climatológica de longo prazo", sem inventar datas. O período fica guardado junto com os dados no
  cache do navegador (chave `aptidao-sp:nasa:v3`; entradas antigas, sem período, deixam de ser usadas). Limitação: o parser foi
  testado com respostas sintéticas que reproduzem o formato observado; a API real não pôde ser consultada a partir do ambiente de
  desenvolvimento. Para consultas de um ano específico (`monthly/point`), o rótulo é o próprio ano, sem período.
- **"Média multianual"** é uma descrição correta, porém imprecisa: são cerca de 25 anos, o que não equivale automaticamente a uma
  "normal climatológica" de 30 anos no sentido da OMM (conhecimento geral, não verificado nesta etapa). Por isso o aplicativo usa
  "média climatológica (longo prazo)".
- Não se deve presumir que o período seja o mesmo para todas as variáveis sem confirmação da API.

## 4. Evapotranspiração de referência (ET₀) por Makkink

```
ET₀ = 0,61 · Δ/(Δ+γ) · Rs/λ − 0,12        (mm/dia)
```

- `Rs`: radiação solar em MJ/m²/dia (`ALLSKY_SFC_SW_DWN`); `λ = 2,45 MJ/kg`.
- `Δ`: inclinação da curva de pressão de vapor de saturação, calculada da temperatura média mensal (`T2M`).
- `γ`: constante psicrométrica **fixa em 0,066 kPa/°C** (valor ao nível do mar). Em medição de auditoria (Fase 3, script fora do
  projeto), o ET₀ varia −0,6 %, +1,4 % e +2,7 % a 0, 600 e 1000 m de altitude; o efeito é pequeno diante das demais incertezas.
- Valores mensais: o ET₀ diário calculado com a temperatura e a radiação médias do mês é multiplicado pelos dias do mês.

**Não há calibração local demonstrada**, nem comparação do ET₀ com Penman-Monteith FAO-56 ou com estações para São Paulo neste
projeto. Um estudo no Cerrado brasileiro (resumo consultado) reportou o Makkink com o melhor desempenho (NSE = 0,85) apenas depois
de calibração anual [8]; o mesmo resumo observa que a abordagem Kc–ET₀ da FAO se aplica quando o ET₀ é calculado pelo método
FAO-56. Por isso o ET₀ deste projeto deve ser lido como indicativo. A referência original de Makkink (1957) é citada no código e
seus dados bibliográficos completos **não foram conferidos** (seção 8, grupo B).

## 5. Balanço hídrico simplificado

Em cada mês: `necessidade = ET₀ × Kc × dias do mês`, comparada com a **precipitação total corrigida** (`PRECTOTCORR` × dias).
Déficit = máx(0, necessidade − precipitação); excedente = máx(0, precipitação − necessidade).

O cálculo **não estima chuva efetiva** e **não desconta infiltração, escoamento nem armazenamento de água no solo** (não há
capacidade de água disponível). Déficit e excedente são calculados mês a mês e somados no período, **sem compensação entre meses**,
o que tende a superestimar ambos. O Kc é **único por cultura** (cana 0,9; milho 0,85; soja 0,85; laranja 0,7; amendoim 0,8),
enquanto a literatura usa Kc por fase de desenvolvimento — por exemplo, 0,50/0,95/1,20/0,70 para a cana [5] e valores de
Kc/Kcb entre 0,70 e 0,95 para citros conforme a densidade das plantas [10]. O balanço é **informativo e não altera a classe**;
não equivale a um balanço hídrico agronômico completo (ISNA, fases críticas, reserva do solo).

## 6. Critérios de classificação e limitações das faixas

Para cada cultura e variável (temperatura média, precipitação média mensal, umidade relativa e radiação) o modelo define uma faixa
adequada `[mín, máx]` e uma tolerância:

- dentro da faixa → adequada; até a tolerância fora da faixa → moderada; além dela → inadequada;
- **APTA**: todas as variáveis adequadas; **MODERADA**: alguma variável fora da faixa, sem fator crítico além da tolerância;
  **INAPTA**: temperatura ou precipitação (variáveis críticas) além da tolerância;
- umidade e radiação nunca tornam a classe INAPTA; o índice 0–100 e seus pesos (0,30 / 0,35 / 0,15 / 0,20) são apenas informativos.

**Faixas atuais e situação da fundamentação** (resultado da investigação da Fase 3; nenhuma faixa foi considerada validada):

| Cultura (período padrão) | Temperatura (°C) | Precipitação (mm/mês) | Umidade (%) | Radiação (MJ/m²/dia) | Kc |
|---|---|---|---|---|---|
| Cana-de-açúcar (ano) | 21–30 · apoio parcial; as fontes divergem [5][4][11] | 90–150 · apoio parcial; limite inferior permissivo frente a [11] | 55–85 · sem fonte | 14–25 · sem fonte | 0,9 · apoio parcial [5] |
| Milho (safra) | 20–28 · apoio parcial [4][6] | 90–170 · apoio parcial [4][6] | 50–80 · sem fonte | 14–25 · sem fonte | 0,85 · sem fonte |
| Soja (safra) | 20–30 · apoio parcial (faixa de adaptação) [4][11] | 90–170 · apoio parcial [4][11] | 55–85 · sem fonte | 14–25 · sem fonte | 0,85 · sem fonte |
| Laranja (ano) | 20–30 · apoio parcial [7][11] | 75–150 · apoio parcial; a literatura usa déficit hídrico anual [7] | 55–80 · sem fonte | 14–25 · sem fonte | 0,7 · apoio parcial [10] |
| Amendoim (safra) | 22–30 · apoio parcial [4][11] | 80–170 · apoio parcial [4][9][11] | 50–75 · sem fonte | 15–25 · sem fonte | 0,8 · sem fonte |

Tolerâncias (3 °C, 40 mm/mês, 10 p.p. de umidade e 3 MJ/m²/dia, iguais para todas as culturas), pesos e a classificação de umidade e
radiação como variáveis não críticas **não têm fundamentação encontrada**. "Apoio parcial" significa que há documentos com valores
relacionados (muitos referem-se a faixas de desenvolvimento, a demanda de água por ciclo ou a fases específicas), o que **não equivale**
a um limite de aptidão com a mesma definição usada aqui. A comparação de chuva com demanda hídrica mistura grandezas diferentes.

Os períodos "safra (Out–Mar)" e "safrinha (Abr–Set)" são genéricos para todas as culturas e não correspondem às janelas de plantio
por decêndio e por cultivar do ZARC. O modelo usa médias do período e não considera geada, veranico, solo, cultivar, fase fenológica
nem a distribuição da chuva.

## 7. Diferença entre o aplicativo e o ZARC

| Aspecto | ZARC (portarias do MAPA consultadas [4]) | Este aplicativo |
|---|---|---|
| Base | Balanço hídrico decendial com séries de estações (≥ 15 anos na portaria da soja) | Médias climatológicas mensais da NASA POWER |
| Água | Índice de satisfação das necessidades de água (ISNA) nas fases críticas | Precipitação média mensal contra faixa; balanço só informativo |
| Temperatura | Temperaturas mínimas e probabilidade de geada (≤ 2 a 3 °C, conforme a cultura) | Temperatura média do período |
| Solo | Classes de água disponível e exclusões (APP, solos rasos ou pedregosos) | Não considera |
| Cultivar | Ciclos e grupos de maturação | Não considera |
| Janela de plantio | Decêndios, por município | Ano, safra ou safrinha (genéricos) |
| Resultado | Níveis de risco (20, 30 e 40 %) por município e decêndio | Apta/Moderada/Inapta indicativa por ponto |

## 8. Bibliografia e suas limitações

**Limitação geral.** Nenhum documento abaixo foi conferido abrindo o arquivo original e verificando a página: o conteúdo foi lido por
extração de texto (trechos e resumos). Antes de citar em trabalho acadêmico, abra cada documento e confirme trecho e página. Quando a
paginação aparece, ela vem da extração e deve ser conferida.

### A. Lidas por extração de texto (trechos usados; páginas a conferir)

1. NASA POWER. *Data Sources*. https://power.larc.nasa.gov/docs/methodology/data/sources/ — resoluções (½°×⅝° meteorologia; 1°×1° radiação), fontes GEWEX SRB R4-IP, CERES SYN1deg/FLASHFlux, MERRA-2/GEOS.
2. NASA POWER. *Methodology*. https://power.larc.nasa.gov/docs/methodology/ — resoluções e sistema de referência WGS84.
3. NASA POWER. *FAQ — dados*. https://power.larc.nasa.gov/docs/faqs/data/ — "original source spatial resolution"; unidades adequadas à comunidade; médias mensais climatológicas calculadas a partir de médias diárias.
4. MAPA/SPA — Portarias do ZARC (anexos técnicos; as portarias de 2022 podem ter sido substituídas, conferir a versão vigente em gov.br):
   - Portaria SPA/MAPA nº 381, de 24/06/2025 — soja, São Paulo, safra 2025/26: https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/sao-paulo/PORTN381SOJASP.pdf
   - Portaria SPA/MAPA nº 186, de 23/05/2022 — milho 1ª safra, São Paulo, safra 2022/23: https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/2022-2023/sao-paulo-sp/port-no-186-milho-1a-safra-sp-retifica.pdf
   - Portaria SPA/MAPA nº 47, de 12/04/2022 (retificada em 02/06/2022) — amendoim, São Paulo, safra 2022/23: https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/2022-2023/sao-paulo-sp/port-no-47-amendoim-sp-ret.pdf
   - Portaria SPA/MAPA nº 45, de 30/04/2018 (retificada em 25/08/2023) — cana-de-açúcar (arquivo lido é o da versão Rio Grande do Sul; a versão de São Paulo não foi lida): https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico/portarias/safra-vigente/rio-grande-do-sul/PORTN45CANADEACARSEQRS.ret.pdf
5. FIETZ, C. R.; SILVA, C. J.; COMUNELLO, É.; FLUMIGNAN, D. L. (2015). *Cana-de-Açúcar: Risco Climático para Plantios de Inverno na Região Sul de Mato Grosso do Sul*. Embrapa Agropecuária Oeste, Comunicado Técnico 209. https://www.infoteca.cnptia.embrapa.br/infoteca/bitstream/doc/1043916/1/COT2015209.pdf
6. LANDAU, SANS e SANTANA (2008, conforme o texto extraído; confirmar autores e ano). "Clima e solo", *Cultivo do Milho*. Embrapa Milho e Sorgo. https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/491176/4/Climasolo.pdf
7. MACEDO JÚNIOR, C.; ASSAD, E. D.; MARIN, F. R. (2009). *Zoneamento agrícola de riscos climáticos da laranja no estado de São Paulo*. XVI Congresso Brasileiro de Agrometeorologia, Belo Horizonte. https://www.alice.cnptia.embrapa.br/alice/bitstream/doc/513550/1/379.pdf
9. BARBIERI, J. D. et al. (2015). Zoneamento agroclimático de amendoinzeiro para a Bacia do Alto Paraguai (MT). *Pesquisa Agropecuária Tropical*, v. 45, n. 2, p. 231–240. https://www.redalyc.org/pdf/2530/253038431011.pdf
10. ALLEN, R. G.; PEREIRA, L. S. (2009). Estimating crop coefficients from fraction of ground cover and height. *Irrigation Science*, 28:17–34 (Tabela 3, citros). https://core.ac.uk/download/61479872.pdf
11. FAO. *EcoCrop* — fichas de *Glycine max* (id 1150), *Zea mays* (id 2175), *Saccharum officinarum* (id 1884), *Citrus sinensis* (id 720) e *Arachis hypogaea* (id 2199): https://ecocrop.apps.fao.org/ecocrop/srv/en/dataSheet?id=1150 (substituir o id). Base de dados de apoio; **não** é critério de aptidão.

### B. Identificadas, mas não lidas ou não identificadas (não citar como fonte antes de localizar e ler)

- ALLEN, R. G. et al. (1998). *Crop evapotranspiration — Guidelines for computing crop water requirements*. FAO Irrigation and Drainage Paper 56, Tabela 12 (valores de Kc). https://www.fao.org/3/x0490E/x0490e00.htm — o título foi confirmado em busca, mas os valores da Tabela 12 **não foram lidos**.
- DOORENBOS, J.; KASSAM, A. H. (1979, 1994). Estudos FAO sobre resposta das culturas à água: citados por [5] e por outros artigos; **não lidos**.
- CAMARGO, A. P. de et al. (1974, 1977): citados por [7] e por outro documento; **não lidos**.
- MAKKINK, G. F. (1957): citado em `js/agronomia.js`; dados bibliográficos completos **não conferidos**.
- Zoneamento Agroecológico da Cana-de-Açúcar (Embrapa Solos, 2009): relatório completo **não lido**. Um resumo de congresso (MANZATTO et al., XXXII CBCS, ano não informado) foi lido e **não traz critérios numéricos utilizáveis**.
- Publicação da Embrapa Soja sobre exigências climáticas da soja: **não encontrada**.
- Documento do repositório `core.ac.uk` (id 296821028) que cita Camargo et al. (1974): **título e autores não identificados**.
- Material complementar de apresentação da NASA (NTRS 20210023687, "ASA-CSSA-SSSA 2021"): lido por extração; **título e autores não confirmados**. https://ntrs.nasa.gov/api/citations/20210023687/downloads/ASA-CSSA-SSSA_2021_Final.pdf

### C. Secundárias (citam outras fontes ou só o resumo foi lido)

8. Estudo sobre ET₀ com dados limitados no Cerrado brasileiro — *Improvement of reference crop evapotranspiration estimates using limited data for the Brazilian Cerrado*: foi lido **apenas o resumo**; autores, periódico e ano a conferir. https://www.sidalc.net/search/Record/oai:scielo:S0103-90162023000100302
12. rOpenSci. *nasapower* (cliente R da NASA POWER) — guia e referência de `get_power`: usados apenas para comparar períodos de climatologia entre versões (2001–2020 no guia atual; 22 e 30 anos em versão anterior). https://docs.ropensci.org/nasapower/articles/nasapower.html · https://docs.ropensci.org/nasapower/reference/get_power.html
- OLIVEIRA, A. R. de; BRAGA, M. B.; WALKER, A. M. (2015). *Rev. Bras. Geografia Física*, v. 8 (número especial), p. 525–541: cita Doorenbos e Kassam (1979) e Allen et al. (1998) para a cana.
- CUNHA SOBRINHO, A. P. da et al. *Cultivo dos Citros*. Embrapa-CNPMF, Circular Técnica 26 (ano 1996 ou 1998, a confirmar); texto extraído com erros de OCR.
- LAPERA, C. A. I.; LIMA, M. W. de P.; VILARINHO, M. S. "Ecofisiologia da soja" (capítulo de livro da UEMG, ~2018; título do livro, editora e ano não confirmados): capítulo universitário, não institucional.

### Evidência própria do projeto (não é fonte bibliográfica)

- Consulta direta do autor à API da NASA POWER (nov/2026, `community=ag`): unidades dos quatro parâmetros; período da climatologia (jan/2001–dez/2025); radiação média anual em Bebedouro-SP de 19,31 MJ/m²/dia; mesmos valores para -20,95/-48,48 e -21,0/-48,5.
- `node tests/run.js` (53 testes, sem rede): cobre motor agronômico, leitura/conversão/interpolação da NASA POWER, leitura do período (`header.range`) e texto da fonte de dados, com **respostas sintéticas**; não comprova o comportamento da API real.

## 9. Pendências que exigem validação humana

1. Abrir cada documento do grupo A e confirmar trechos e páginas; localizar e ler os itens do grupo B antes de citá-los; identificar o documento do `core.ac.uk`.
2. Obter os dados bibliográficos completos de Makkink (1957) e de FAO-56 (Allen et al., 1998) e ler a Tabela 12.
3. Conferir, no navegador, com a API real, que o período exibido na fonte dos dados e no relatório coincide com o `header.range` da resposta (o parser só foi testado com respostas sintéticas).
4. Repetir o teste de arredondamento (seção 2) em dois ou três pontos, de preferência perto de bordas de células.
5. Confirmar qual produto gera o `PRECTOTCORR` e sua resolução.
6. Conferir no gov.br se as portarias do ZARC de 2022 (milho e amendoim) foram substituídas e ler a portaria da cana para São Paulo.
7. Se o grupo quiser sustentar o ET₀ de Makkink, comparar com Penman-Monteith FAO-56 ou com dados de estações (hoje não existe essa comparação).
8. Decidir, para o relatório acadêmico, quais faixas serão revisadas com base em fontes lidas e quais permanecerão ilustrativas.
