<!-- Apresentação do projeto -->
<div align="center">

# 🌱 Mapa de Aptidão Agrícola — São Paulo

**Uma ferramenta web para explorar a compatibilidade climática de culturas agrícolas no estado de São Paulo.**

[🌐 Acessar o sistema](https://mapadeaptidao.netlify.app) · [📖 Metodologia e fontes](metodologia.md) · [🧪 Testes](tests/run.js)

![JavaScript](https://img.shields.io/badge/JavaScript-vanilla-F7DF1E?logo=javascript&logoColor=222)
![HTML5](https://img.shields.io/badge/HTML5-estrutura-E34F26?logo=html5&logoColor=fff)
![CSS3](https://img.shields.io/badge/CSS3-estilos-1572B6?logo=css3&logoColor=fff)
![NASA POWER](https://img.shields.io/badge/dados-NASA%20POWER-0B3D91)
![Projeto acadêmico](https://img.shields.io/badge/projeto-acadêmico-informational)

</div>

---

## Sobre o projeto

O **Mapa de Aptidão Agrícola** é um projeto desenvolvido para o **Projeto Integrador da Fatec Bebedouro**, no curso de Big Data no Agronegócio.

A aplicação permite selecionar pontos no estado de São Paulo e consultar uma estimativa indicativa de compatibilidade climática para cinco culturas:

- Cana-de-açúcar
- Milho
- Soja
- Laranja
- Amendoim

O resultado é apresentado em três classes: **Apta**, **Moderada** e **Inapta**. A proposta é reunir dados climáticos e recursos de visualização em uma interface interativa.

> **Importante:** as classificações são estimativas de um modelo simplificado. Não representam laudo oficial de aptidão agrícola, recomendação de plantio ou o Zoneamento Agrícola de Risco Climático (ZARC). Consulte [Metodologia, fontes e limitações](metodologia.md) para conhecer os critérios e as restrições do modelo.

## Recursos

- **Mapa interativo:** exploração de localidades dentro do estado de São Paulo.
- **Consulta climática:** obtenção de dados pela API NASA POWER, com alternativa de simulação local.
- **Cinco culturas agrícolas:** comparação indicativa de compatibilidade climática.
- **Visualização regional:** grade para explorar padrões espaciais.
- **Gráficos e relatório:** apresentação dos resultados da consulta.
- **Simulador climático:** ajuste de variáveis para observar como cenários simulados afetam a classificação.
- **Tema claro e escuro:** opção de aparência pela interface.

## Dados e funcionamento

A aplicação consulta a API **NASA POWER**, utilizando variáveis meteorológicas como:

| Variável | Descrição |
|---|---|
| `T2M` | Temperatura do ar a 2 metros |
| `PRECTOTCORR` | Precipitação total corrigida |
| `RH2M` | Umidade relativa do ar a 2 metros |
| `ALLSKY_SFC_SW_DWN` | Radiação solar de superfície em céu real |

Os dados representam médias de células de grade, não medições exatas no ponto selecionado. A resolução espacial e o período disponível variam conforme a variável e a fonte.

A classificação compara os dados climáticos com faixas e tolerâncias definidas no projeto. Parte dos parâmetros tem apoio técnico parcial; outros são ilustrativos e ainda não foram validados cientificamente.

O modelo não considera, entre outros fatores, as características físicas e químicas do solo, declividade, cultivar, fases de desenvolvimento, distribuição da chuva durante o ciclo e eventos extremos.

A descrição completa está em [metodologia.md](metodologia.md).

## Tecnologias utilizadas

- **HTML5** — estrutura da aplicação.
- **CSS3** — identidade visual, responsividade e temas.
- **JavaScript** — lógica, consultas, cálculos e interações.
- **Leaflet** — mapa interativo.
- **Chart.js** — gráficos.
- **OpenStreetMap** — mapa-base.
- **NASA POWER API** — dados meteorológicos.

O projeto utiliza JavaScript sem framework e não exige etapa de build.

## Estrutura do repositório

```text
mapadeaptidao/
├── css/
│   └── style.css
├── js/
│   ├── agronomia.js
│   ├── app.js
│   ├── clima.js
│   ├── culturas.js
│   ├── geo.js
│   ├── grade-regional.js
│   ├── graficos.js
│   ├── limites-sp.js
│   ├── mapa.js
│   ├── municipio.js
│   ├── nasa-power.js
│   ├── polos.js
│   ├── relatorio.js
│   ├── simulador.js
│   ├── tema.js
│   └── util.js
├── tests/
│   └── run.js
├── index.html
├── metodologia.md
├── netlify.toml
└── readme.md
```

## Executar localmente

É necessário ter Python 3 ou outro servidor HTTP simples. A aplicação depende de recursos externos, como Leaflet, Chart.js, OpenStreetMap e NASA POWER.

1. Faça o download ou clone este repositório.
2. Abra um terminal na pasta do projeto.
3. Inicie um servidor local:

```bash
python3 -m http.server 8000
```

4. Acesse [http://localhost:8000](http://localhost:8000).

> Abrir o arquivo HTML diretamente pelo navegador (`file://`) pode impedir o carregamento de recursos do mapa. Por isso, utilize um servidor local.

## Testes

Os testes automatizados podem ser executados com **Node.js 18 ou superior**, sem instalar dependências:

```bash
node tests/run.js
```

A suíte verifica partes do motor agronômico, cálculos, interpretação de dados da NASA POWER e tratamento de requisições. São utilizados dados sintéticos; os testes não consultam a API real e não cobrem todos os textos e elementos da interface.

## Documentação

- [Metodologia, fontes e limitações](metodologia.md) — detalhamento dos dados, critérios, cálculos, referências e limitações científicas.
- [Código dos testes](tests/run.js) — verificações automatizadas do projeto.

---

<div align="center">

**Projeto Integrador · Fatec Bebedouro · Big Data no Agronegócio**

</div>
