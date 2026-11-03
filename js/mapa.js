/* mapa.js — Mapa Leaflet (base OpenStreetMap) restrito visualmente ao Estado de São Paulo.
   Camadas criadas UMA vez e reutilizadas: máscara, contorno, marcador, grupo da grade. */
(function (global) {
  'use strict';

  const MSG_FORA = 'A análise de aptidão agrícola está disponível exclusivamente para o Estado de São Paulo.';

  let mapa = null;
  let mascara = null;
  let marcador = null;
  let grupoGrade = null;
  let popupRejeicao = null;
  let timerRejeicao = null;
  const callbacks = { dentro: () => {}, fora: () => {} };

  const paraLatLng = (anel) => anel.map(([lon, lat]) => [lat, lon]);

  function iniciar({ elemento, geojson, aoClicarDentro, aoClicarFora }) {
    const L = global.L;
    mascara = global.Geo.prepararMascara(geojson);
    callbacks.dentro = aoClicarDentro;
    callbacks.fora = aoClicarFora;

    const [minX, minY, maxX, maxY] = mascara.bbox;
    const limitesSP = L.latLngBounds([minY, minX], [maxY, maxX]);

    mapa = L.map(elemento, {
      zoomControl: true,
      minZoom: 6,
      maxZoom: 14,
      maxBounds: limitesSP.pad(0.9),
      maxBoundsViscosity: 0.85,
      worldCopyJump: false,
    });

    // Toque: um dedo rola a PÁGINA; dois dedos movem e ampliam o MAPA (pinça). Em mouse/touchpad nada muda.
    // Com o arrastar desligado, o Leaflet libera `touch-action: pan-x pan-y` e o navegador rola a página sozinho.
    const toque = window.matchMedia('(pointer: coarse)');
    const aplicarGesto = () => { if (toque.matches) mapa.dragging.disable(); else mapa.dragging.enable(); };
    aplicarGesto();
    if (toque.addEventListener) toque.addEventListener('change', aplicarGesto);
    const dica = document.getElementById('dicaGesto');
    let vezesDica = 0, timerDica = null;
    elemento.addEventListener('touchmove', (e) => {
      if (!dica || !toque.matches || e.touches.length !== 1 || vezesDica >= 3 || !dica.hidden) return;
      vezesDica += 1;                                   // lembrete discreto: no máximo 3 vezes por visita
      dica.hidden = false;
      clearTimeout(timerDica);
      timerDica = setTimeout(() => { dica.hidden = true; }, 1800);
    }, { passive: true });

    // Mapa-base: OpenStreetMap (sem chave). Para voltar à CARTO, troque a URL (ver README).
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Limites: IBGE',
      maxZoom: 19,
      crossOrigin: true,
    }).addTo(mapa);

    // Painéis com z-index explícito: máscara < contorno < grade < marcador.
    mapa.createPane('paneMascara').style.zIndex = 380;
    mapa.createPane('paneContorno').style.zIndex = 390;
    mapa.createPane('paneGrade').style.zIndex = 420;

    // Máscara: "mundo" com buracos nos polígonos de SP → escurece tudo que não é SP.
    const mundo = [[-60, -95], [-60, -15], [15, -15], [15, -95]];
    const buracos = mascara.itens.map((p) => paraLatLng(p.aneis[0]));
    L.polygon([mundo, ...buracos], {
      pane: 'paneMascara', stroke: false, interactive: false, className: 'mascara-sp', // cor/opacidade: variáveis --mascara-* (CSS)
      fillColor: '#121212', fillOpacity: 0.55,
    }).addTo(mapa);

    // Contorno e leve preenchimento de SP.
    L.geoJSON(geojson, {
      pane: 'paneContorno', interactive: false,
      style: { weight: 2.5, className: 'contorno-sp', color: '#455A64', fillColor: '#455A64', fillOpacity: 0.05 }, // contorno neutro (limite territorial, não é aptidão); cores finais: --contorno (CSS)
    }).addTo(mapa);

    grupoGrade = L.layerGroup().addTo(mapa);

    mapa.on('click', (e) => {
      const lat = e.latlng.lat, lon = e.latlng.lng;
      if (global.Geo.pontoNaMascara(mascara, lat, lon)) callbacks.dentro(lat, lon);
      else callbacks.fora(lat, lon, e.latlng);
    });

    mapa.fitBounds(limitesSP, { padding: [10, 10] });

    // Recalcula o tamanho quando o contêiner muda (painéis, rotação do celular).
    if (global.ResizeObserver) {
      let primeira = true;
      new ResizeObserver(() => {
        mapa.invalidateSize();
        if (primeira) { primeira = false; mapa.fitBounds(limitesSP, { padding: [10, 10] }); }
      }).observe(elemento);
    }

    return mapa;
  }

  function iconePin() {
    return global.L.divIcon({
      className: 'pin-wrap',
      html: '<div class="pin" aria-hidden="true"></div>',
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -12],
    });
  }

  /** Cria (uma vez) ou move o marcador do ponto selecionado. */
  function definirMarcador(lat, lon) {
    if (!marcador) {
      marcador = global.L.marker([lat, lon], { icon: iconePin(), keyboard: false, title: 'Ponto selecionado' }).addTo(mapa);
      marcador.bindPopup('', { maxWidth: 280, className: 'popup-aptidao' });
    } else {
      marcador.setLatLng([lat, lon]);
    }
  }

  function atualizarMarcador({ cor, popupHtml }) {
    if (!marcador) return;
    const el = marcador.getElement();
    if (el) el.style.setProperty('--pin', cor || global.Tema.cssVarMapa('--info'));
    if (popupHtml !== undefined) marcador.setPopupContent(popupHtml);
  }

  function voar(lat, lon, zoom = 9) {
    mapa.flyTo([lat, lon], zoom, { duration: 1.1 });
  }

  /** Mostra aviso no local do clique rejeitado (fora de SP). */
  function mostrarRejeicao(latlng) {
    clearTimeout(timerRejeicao);
    if (!popupRejeicao) popupRejeicao = global.L.popup({ className: 'popup-rejeicao', closeButton: false, autoPan: false, maxWidth: 240 });
    popupRejeicao.setLatLng(latlng).setContent(`<strong>Fora do Estado de São Paulo</strong><br>${MSG_FORA}`).openOn(mapa);
    timerRejeicao = setTimeout(() => mapa.closePopup(popupRejeicao), 3500);
  }

  function ajustarParaSP() {
    const [minX, minY, maxX, maxY] = mascara.bbox;
    mapa.flyToBounds([[minY, minX], [maxY, maxX]], { padding: [10, 10], duration: 0.9 });
  }

  const obterMapa = () => mapa;
  const obterMascara = () => mascara;
  const obterGrupoGrade = () => grupoGrade;
  const dentroDeSP = (lat, lon) => global.Geo.pontoNaMascara(mascara, lat, lon);

  global.Mapa = {
    MSG_FORA, iniciar, definirMarcador, atualizarMarcador, voar, mostrarRejeicao, ajustarParaSP,
    obterMapa, obterMascara, obterGrupoGrade, dentroDeSP,
  };
})(typeof window !== 'undefined' ? window : globalThis);
