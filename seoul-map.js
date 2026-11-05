// 首爾版地圖：Leaflet + CARTO 底圖，外部導航用 KakaoMap（韓國 Google Maps 冇詳細步行／交通路線）。
(function () {
  const TILE = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
  const ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
  const maps = new WeakMap();

  function clean(text) { return String(text || "").replace(/[,/]/g, " ").trim(); }
  function placeName(place) { return place.nameZh || place.name || place.id; }
  function kakaoName(place) { return clean(place.kakaoName || place.name || place.nameZh); }

  function kakaoPlaceUrl(place) {
    if (place?.geo) return `https://map.kakao.com/link/map/${encodeURIComponent(kakaoName(place))},${place.geo.lat},${place.geo.lng}`;
    return kakaoSearchUrl(place?.googleMapsQuery || place?.name || "");
  }
  function kakaoSearchUrl(query) { return `https://map.kakao.com/link/search/${encodeURIComponent(String(query || "").trim())}`; }
  function kakaoRouteUrl(places) {
    const pts = places.filter((p) => p?.geo);
    if (pts.length < 2) return pts[0] ? kakaoPlaceUrl(pts[0]) : "https://map.kakao.com/";
    return `https://map.kakao.com/link/by/traffic/${pts.map((p) => `${encodeURIComponent(kakaoName(p))},${p.geo.lat},${p.geo.lng}`).join("/")}`;
  }

  function pinIcon(label, active) {
    return L.divIcon({ className: "seoul-pin-wrap", html: `<span class="seoul-pin${active ? " is-active" : ""}">${label}</span>`, iconSize: [28, 28], iconAnchor: [14, 14] });
  }

  // container: element; places: [{place, label?}]; opts: {route: bool, activeId}
  function render(container, places, opts = {}) {
    if (typeof L === "undefined") { container.innerHTML = '<p class="gmap-caption">地圖載入唔到（要上網），請用下面 KakaoMap 按鈕。</p>'; return null; }
    let map = maps.get(container);
    if (map) { map.remove(); }
    container.innerHTML = "";
    map = L.map(container, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
    maps.set(container, map);
    L.tileLayer(TILE, { attribution: ATTR, maxZoom: 19 }).addTo(map);
    const pts = places.filter((item) => item.place?.geo);
    const latlngs = pts.map((item) => [item.place.geo.lat, item.place.geo.lng]);
    if (opts.route && latlngs.length > 1) {
      L.polyline(latlngs, { color: "#ffffff", weight: 7, opacity: 0.9 }).addTo(map);
      L.polyline(latlngs, { color: "#d6453d", weight: 4, opacity: 0.95, dashArray: "8 7" }).addTo(map);
    }
    pts.forEach((item, index) => {
      const active = item.place.id === opts.activeId;
      const marker = L.marker([item.place.geo.lat, item.place.geo.lng], { icon: pinIcon(opts.route ? String(index + 1) : "●", active), zIndexOffset: active ? 1000 : 0 }).addTo(map);
      marker.bindTooltip(placeName(item.place), { permanent: true, direction: "right", offset: [12, 0], className: `seoul-label${active ? " is-active" : ""}` });
      marker.bindPopup(`<strong>${placeName(item.place)}</strong><br><a href="${kakaoPlaceUrl(item.place)}" target="_blank" rel="noopener noreferrer">用 KakaoMap 打開 ↗</a>`);
      if (opts.onPick) marker.on("click", () => opts.onPick(item.place.id));
    });
    const fit = () => {
      if (latlngs.length > 1) map.fitBounds(latlngs, { padding: [40, 40], maxZoom: 16 });
      else if (latlngs.length === 1) map.setView(latlngs[0], 16);
      else map.setView([37.5572, 126.9245], 12);
    };
    fit();
    setTimeout(() => { map.invalidateSize(); fit(); }, 80);
    return map;
  }

  window.SeoulMap = { render, kakaoPlaceUrl, kakaoRouteUrl, kakaoSearchUrl };
})();
