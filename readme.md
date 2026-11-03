# Mapa de Aptidão Agrícola — Estado de São Paulo

Sistema web (HTML/CSS/JS, sem build) que classifica, de forma **indicativa**, a compatibilidade climática de Cana-de-Açúcar,
Milho, Soja, Laranja e Amendoim em qualquer ponto dentro do Estado de São Paulo (Apta · Moderada · Inapta), com dados da
NASA POWER ou simulação local. Projeto Integrador — Fatec Bebedouro (Big Data no Agronegócio).

> **Resultado indicativo de um modelo simplificado.** Não é laudo oficial de aptidão agrícola, recomendação de plantio nem o
> Zoneamento Agrícola de Risco Climático (ZARC). Metodologia, fontes e limitações completas: [`METODOLOGIA.md`](METODOLOGIA.md).

## Como executar
Precisa de internet (Leaflet, Chart.js, mapa-base OpenStreetMap, NASA POWER, fontes).
Sirva a pasta (o OpenStreetMap bloqueia páginas abertas como arquivo local):

    python3 -m http.server 8000     # e abra http://localhost:8000

Ou use `mapa-aptidao-sp-arquivo-unico.html` (CSS e JS embutidos), por exemplo no celular.

## Temas e cores
Todas as cores ficam em `css/style.css` (variáveis): tema escuro (padrão) e claro, botão sol/lua no topo.
A área do mapa usa sempre as cores do tema claro. Para um mapa cinza: `--tile-filter: grayscale(1)` no bloco do tema claro.

## Arquitetura (js/)
culturas.js (parâmetros das culturas: apoio parcial ou ilustrativos, não validados) · agronomia.js (motor) ·
nasa-power.js / simulador.js / clima.js (dados) · geo.js / limites-sp.js (contorno IBGE) · mapa.js · grade-regional.js ·
graficos.js · relatorio.js · municipio.js · polos.js · tema.js · app.js.

## Modo Simulação
O bloco 4 vira "Clima simulado": ajusta temperatura, chuva, umidade e radiação do clima gerado, para testar calor, frio, seca etc.

## Dados da NASA POWER
- **Consulta:** API `temporal/climatology/point` (média climatológica) ou `temporal/monthly/point` (um ano), comunidade `ag`.
- **Variáveis e unidades** (conferidas em consulta direta à API): `T2M` temperatura do ar a 2 m (°C); `PRECTOTCORR` precipitação
  total corrigida (mm/dia, convertida para mm/mês); `RH2M` umidade relativa a 2 m (%); `ALLSKY_SFC_SW_DWN` radiação solar de
  superfície em céu real (MJ/m²/dia).
- **Resolução nativa (segundo a documentação da NASA):** ~0,5° × 0,625° (latitude × longitude) na meteorologia e ~1° × 1° na
  radiação solar. Cada valor é a média de uma célula, não uma medição no ponto clicado.
- **Grade de consulta do aplicativo (0,5°):** o aplicativo arredonda as coordenadas para múltiplos de 0,5° apenas para
  reaproveitar consultas em cache. **Isso não é a resolução nativa dos dados.** Num teste manual em Bebedouro, duas coordenadas
  (-20,95/-48,48 e -21,0/-48,5) devolveram os mesmos valores; o teste não foi repetido em outros pontos.
- **Período climatológico:** médias mensais de longo prazo calculadas pela NASA. O aplicativo **lê o período da própria resposta
  da API** (campo `header.range`, por exemplo "… (January 2001 - December 2025)") e o exibe em português, como "janeiro de 2001
  a dezembro de 2025", na fonte dos dados e no relatório. Não há período fixo no código: se o campo estiver ausente ou não puder
  ser interpretado, o aplicativo mostra apenas "média climatológica de longo prazo". A NASA pode atualizar o período com o tempo.

## Cálculos
- **ET₀ (Makkink):** `ET₀ = 0,61 · Δ/(Δ+γ) · Rs/λ − 0,12` (mm/dia), com γ fixo em 0,066 kPa/°C (nível do mar) e λ = 2,45 MJ/kg.
  Não há calibração local demonstrada.
- **Balanço hídrico simplificado (informativo; não altera a classe):** necessidade = ET₀ × Kc único × dias do mês, comparada
  com a precipitação total corrigida (`PRECTOTCORR`). **Não estima chuva efetiva** nem desconta infiltração, escoamento ou
  armazenamento de água no solo; déficit e excedente são somados mês a mês, sem compensação entre meses.
- **Classificação:** cada variável é comparada com uma faixa e uma tolerância por cultura (`culturas.js`). Temperatura e
  precipitação são críticas (INAPTA se passarem da tolerância); umidade e radiação só rebaixam para MODERADA.

## Limitações científicas
O resultado é uma **estimativa indicativa de compatibilidade climática**, não um laudo oficial de aptidão agrícola, recomendação
de plantio nem classificação do ZARC.

- **Parâmetros das culturas:** nenhum está validado cientificamente. Algumas faixas de temperatura têm apoio parcial em documentos
  técnicos (ZARC/MAPA, Embrapa, FAO EcoCrop); tolerâncias, pesos, umidade relativa, radiação e a maior parte dos Kc não têm
  fundamentação encontrada. Os períodos "safra" e "safrinha" são genéricos para todas as culturas.
- **Diferença para o ZARC:** o ZARC usa balanço hídrico por decêndio, índice de satisfação das necessidades de água em fases
  críticas, probabilidade de geada, solo, ciclo da cultivar e níveis de risco por município. Este modelo usa médias climatológicas.
- **Não considerados:** solo (física e química), declividade/relevo, cultivares, fases de desenvolvimento, distribuição das chuvas
  no ciclo, eventos extremos (geada, veranico, granizo) e variação do clima dentro da célula de dados (~55 a ~110 km).

## Publicação (Netlify)
Arraste no Netlify uma pasta com `index.html` e `netlify.toml` (cabeçalhos de segurança e CSP): pode ser este projeto inteiro ou
uma pasta só com a versão de arquivo único (`mapa-aptidao-sp-arquivo-unico.html` renomeado para `index.html`) e o `netlify.toml`.

## Testes
`node tests/run.js` (Node 18+, sem dependências): motor agronômico (limites, tolerâncias, classificação, ET₀, balanço hídrico),
leitura/conversão/interpolação da NASA POWER, leitura do período da climatologia (`header.range`), texto da fonte de dados e
cancelamento de requisições compartilhadas. Usam respostas sintéticas, não usam a rede e não cobrem os demais textos da interface.
