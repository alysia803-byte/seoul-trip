/* Golden route interaction reused with frozen map templates. */
let mapRoutes = [];
let mapInstance = 0;
const transportNames = {
  drive: "自驾", train: "火车", rail: "火车", "cable-car": "缆车",
  hike: "步行", walk: "步行", return: "返程", "rental-car": "租车",
  boat: "游船", ferry: "渡轮", flight: "飞行", transfer: "接驳"
};

function mapRouteDefinitions(source) {
  return routeLayersFor(source).map(({ day, color }) => ({ day, color }));
}

function dailyMapLayoutFor(source, dayNumber) {
  const authored = source.dailyLayouts?.[String(dayNumber)];
  if (authored) return { places: [], labels: {}, transport: [], ...authored };
  const route = routeLayersFor(source).find((candidate) => candidate.day === dayNumber);
  if (!route) return null;
  return { places: route.placeIds || [], labels: {}, transport: [] };
}

function placeOptions(source, placeId) {
  const place = placeLayersFor(source).find((item) => item.id === placeId);
  if (!place) return [[placeId, placeId]];
  if (Array.isArray(place.options) && place.options.length) return place.options.map((option) => [option.label, option.query]);
  return [[place.lines?.at(-1) || placeId, place.query || place.lines?.[0] || placeId]];
}

function scheduleItemsForPin(day, pin) {
  const references = Array.isArray(pin?.itemIds) && pin.itemIds.length ? pin.itemIds : pin?.items || [];
  return references.map((reference) => typeof reference === "number"
    ? day.schedule[reference]
    : day.schedule.find((item) => item.id === reference)
  ).filter(Boolean);
}

function dailyViewportFor(source) {
  const canvas = source.canvas || { width: 1448, height: 1086 };
  return { x: 0, y: 0, width: canvas.width, height: canvas.height };
}

function transportIcon(type) {
  const icons = {
    drive: '<path d="m5 9 2-5h10l2 5M4 9h16v9H4zM7 18v2m10-2v2M7 12h1m8 0h1"/>',
    "cable-car": '<path d="m2 4 20-2M12 3v5M6 9h12l2 9H4zM6 18v3h12v-3M9 9v9m6-9v9"/>',
    train: '<rect x="5" y="3" width="14" height="15" rx="3"/><path d="M5 10h14M12 3v7m-4 5h1m6 0h1M8 18l-3 4m11-4 3 4M7 20h10"/>',
    hike: '<circle cx="14" cy="4" r="2"/><path d="m11 8 4 2 3 4m-7-6-3 6-4 1m7-3 3 4-1 6m-2-10-3 7-4 3M8 8l-2 3"/>',
    boat: '<path d="M12 3v11M5 7h14v6M3 14l9-3 9 3-3 6H6zM2 22q3-3 5 0 3-3 5 0 3-3 5 0 3-3 5 0"/>',
    "rental-car": '<path d="m3 10 2-5h9l2 5M2 10h15v8H2zM5 18v2m9-2v2M5 13h1m7 0h1M18 4h4m-2-2 2 2-2 2"/>',
    flight: '<path d="M3 16 21 8M9 13 5 6l2-1 6 5m2-1 1-6 2-1 1 5M8 15l-1 4 2-1 3-4"/>'
  };
  const key = type === "rail" ? "train" : type === "ferry" ? "boat" : type === "walk" ? "hike" : ["return", "transfer"].includes(type) ? "drive" : type;
  return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${icons[key] || icons.drive}</svg>`;
}

function mapArtwork(source, selected, id, viewport) {
  if (!selected) return travelOverviewArtwork(state.data.days, source);
  const layout = dailyMapLayoutFor(source, selected.day);
  const day = state.data.days.find((item) => item.day === selected.day);
  const doc = new DOMParser().parseFromString(travelOverviewArtwork(state.data.days, source, { includeAllPlaces: true, useDetailedRoutes: true }), "image/svg+xml");
  const svg = doc.documentElement;
  svg.removeAttribute("data-overview-version");
  svg.setAttribute("data-daily-version", "3");
  svg.setAttribute("aria-label", day.title);
  svg.querySelector("title").textContent = day.title;
  svg.querySelector("desc").textContent = "仅显示当天路线；地点圆点打开地图，交通图标查看行程。";
  svg.querySelectorAll('[id^="overview-route-"]').forEach((group) => {
    if (group.id !== `overview-route-${selected.day}`) group.remove();
  });
  ["overview-date-legend", "overview-markers", "overview-geographic-names"].forEach((key) => svg.querySelector(`#${key}`)?.remove());
  svg.querySelectorAll('[id^="overview-label-"]').forEach((label) => {
    const placeId = label.id.replace("overview-label-", "");
    if (!layout?.places.includes(placeId)) { label.remove(); return; }
    const place = placeLayersFor(source).find((item) => item.id === placeId);
    const labelLayout = layout.labels?.[placeId] || { x: place?.tx, y: place?.ty, anchor: place?.anchor };
    if (!Number.isFinite(Number(labelLayout.x)) || !Number.isFinite(Number(labelLayout.y))) { label.remove(); return; }
    label.setAttribute("x", labelLayout.x);
    label.setAttribute("y", labelLayout.y);
    label.setAttribute("text-anchor", labelLayout.anchor || "start");
    label.querySelectorAll("tspan").forEach((line) => line.setAttribute("x", labelLayout.x));
  });
  svg.querySelectorAll("[id]").forEach((element) => { element.id = `${id}-${element.id}`; });
  return new XMLSerializer().serializeToString(svg);
}

function dailyPointRole(layout, placeId, index) {
  if (layout.roles?.[placeId]) return layout.roles[placeId];
  if (layout.places.length === 1) return "起点 / 终点";
  if (index === 0) return "起点";
  if (index === layout.places.length - 1) return "终点";
  return "途经点";
}

function travelMapMarkup(source, route) {
  const id = `travel-map-${++mapInstance}`;
  const day = route && state.data.days.find((item) => item.day === route.day);
  const layout = route && dailyMapLayoutFor(source, route.day);
  const canvas = source.canvas || { width: 1448, height: 1086 };
  const viewport = route ? dailyViewportFor(source, layout) : { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const position = (x, y) => `left:${(x - viewport.x) / viewport.width * 100}%;top:${(y - viewport.y) / viewport.height * 100}%`;
  const placeLayers = placeLayersFor(source);
  const places = route && layout ? layout.places.map((placeId, index) => {
    const place = placeLayers.find((item) => item.id === placeId);
    if (!place) return "";
    const role = dailyPointRole(layout, placeId, index);
    return `<button type="button" class="map-place-dot" style="${position(place.x, place.y)}" data-map-region="${escapeHtml(source.id)}" data-place-id="${placeId}" data-place-day="${day.day}" data-place-role="${role}" aria-label="${role}：${escapeHtml(placeOptions(source, placeId)[0][0])}，打开 Google Maps" aria-haspopup="dialog" aria-expanded="false"><span></span></button>`;
  }).join("") : "";
  const transport = route && layout ? layout.transport.map((pin, index) => {
    const item = scheduleItemsForPin(day, pin)[0];
    if (!item) return "";
    return `<button class="transport-pin" type="button" style="${position(pin.x, pin.y)}" data-map-region="${escapeHtml(source.id)}" data-transport-day="${day.day}" data-transport-group="${index}" aria-expanded="false" aria-haspopup="dialog" aria-label="查看${escapeHtml(transportNames[item.type] || "交通")}：${escapeHtml(item.text)}">${transportIcon(item.type)}</button>`;
  }).join("") : "";
  const mapNote = source.disclaimer || "本图为模板化行程示意图，仅表达地点的相对方位与路线顺序，不代表真实比例或精确地理边界。如需使用真实国家或城市地图，可在生成后自行调整。";
  return `<div class="travel-map-block ${route ? "is-daily" : "is-overview"}" ${route ? `style="--route-color:${route.color}"` : ""}>
    <div class="travel-map-scroll"><div class="travel-map-canvas" id="${id}">${mapArtwork(source, route, id, viewport)}${places}${transport}</div></div>
    <div class="map-utility"><span>${route ? "点圆点看地图 · 点图标看交通" : escapeHtml(mapNote)}</span><button type="button" data-expand-map="${id}">放大 ↗</button></div>
  </div>`;
}

function activateDayMaps(root) {
  $$(".is-daily .travel-map-scroll", root).forEach((view) => {
    if (view.dataset.positioned || !view.clientWidth) return;
    view.scrollLeft = 0;
    view.dataset.positioned = "true";
  });
}

function gmapPoint(place) {
  if (!place) return "";
  return String(place.googleMapsQuery || place.address || `${place.name || place.nameZh || ""} ${place.cityOrArea || ""}`).trim();
}

function gmapHasLocation(place) {
  return Boolean(place && (place.geo || place.googleMapsQuery || place.address));
}

function gmapDayPlaceIds(dayNumber) {
  const day = state.data.days.find((item) => item.day === dayNumber);
  if (Array.isArray(day?.mapStops)) return day.mapStops.filter((id) => gmapHasLocation(canonicalPlaceFor(id)));
  const source = travelMapSource(state.data?.routeMap);
  const route = (source.routes || []).find((item) => item.day === dayNumber);
  const ids = [...(route?.placeIds || [])];
  (day?.schedule || []).forEach((item) => (item.placeIds || []).forEach((id) => { if (!ids.includes(id)) ids.push(id); }));
  return ids.filter((id) => gmapHasLocation(canonicalPlaceFor(id)));
}

function gmapDayAltIds(dayNumber) {
  const day = state.data.days.find((item) => item.day === dayNumber);
  return (day?.mapAltStops || []).filter((id) => gmapHasLocation(canonicalPlaceFor(id)));
}

function gmapRouteUrls(placeIds) {
  const points = placeIds.map((id) => gmapPoint(canonicalPlaceFor(id)));
  if (points.length < 2) {
    const q = points[0] || "37.5572,126.9245";
    return { embed: `https://maps.google.com/maps?q=${encodeURIComponent(q)}&z=13&output=embed`, open: mapsSearch(q) };
  }
  const [first, ...rest] = points;
  const last = rest[rest.length - 1];
  const middle = rest.slice(0, -1);
  return {
    embed: `https://maps.google.com/maps?saddr=${encodeURIComponent(first)}&daddr=${encodeURIComponent(last)}&dirflg=r&output=embed`,
    open: `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(first)}&destination=${encodeURIComponent(last)}${middle.length ? `&waypoints=${encodeURIComponent(middle.join("|"))}` : ""}&travelmode=transit`
  };
}

function gmapAreas() {
  return (state.data.googleMapAreas || []).map((area) => ({ ...area, stops: (area.stops || []).filter((id) => gmapHasLocation(canonicalPlaceFor(id))) })).filter((area) => area.stops.length);
}

function gmapPlaceLabel(id) {
  const place = canonicalPlaceFor(id);
  return place?.nameZh || place?.name || id;
}

function renderRoutePanel(regionId, dayNumber = 0, view, areaId, placeId) {
  const root = $("#route-explorer");
  view = view || root.dataset.view || "area";
  root.dataset.view = view;
  const viewTabs = `<div class="route-day-tabs" aria-label="地图模式"><button type="button" data-gmap-view="area" aria-pressed="${view === "area"}">區域地圖</button><button type="button" data-gmap-view="route" aria-pressed="${view === "route"}">單日路線</button></div>`;
  const open = (href, text = "用 KakaoMap 打開 ↗") => `<a class="gmap-open" data-gmap-open href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${text}</a>`;
  const holder = `<div class="gmap-frame seoul-map" data-seoul-map></div>`;
  if (view === "route") {
    const days = state.data.days || [];
    const day = days.find((item) => item.day === dayNumber) || days[0];
    const ids = gmapDayPlaceIds(day.day);
    const places = ids.map((id) => canonicalPlaceFor(id)).filter(Boolean);
    const list = ids.map((id, index) => `<li><b>${index + 1}</b> ${escapeHtml(gmapPlaceLabel(id))}</li>`).join("");
    root.dataset.day = String(day.day);
    root.innerHTML = `${viewTabs}<div class="route-day-tabs" aria-label="路线日期">${days.map((item) => `<button type="button" data-route-day="${item.day}" aria-pressed="${item === day}">${escapeHtml(item.date.slice(5).replace("-", "/"))}</button>`).join("")}</div>
    <p class="gmap-caption">Day ${day.day}｜${escapeHtml(day.title)}</p>${holder}<ol class="seoul-stop-list">${list}</ol>${open(window.SeoulMap.kakaoRouteUrl(places), "用 KakaoMap 睇地鐵路線 ↗")}`;
    window.SeoulMap.render($("[data-seoul-map]", root), places.map((place) => ({ place })), { route: true });
    return;
  }
  const areas = gmapAreas();
  const area = areas.find((item) => item.id === areaId) || areas.find((item) => item.id === root.dataset.area) || areas[0];
  const currentId = area.stops.includes(placeId) ? placeId : area.stops[0];
  const place = canonicalPlaceFor(currentId);
  root.dataset.area = area.id;
  root.innerHTML = `${viewTabs}<div class="route-day-tabs" aria-label="区域">${areas.map((item) => `<button type="button" data-gmap-area="${escapeHtml(item.id)}" aria-pressed="${item.id === area.id}">${escapeHtml(item.label)}</button>`).join("")}</div>
  <p class="gmap-caption"><strong>${escapeHtml(gmapPlaceLabel(currentId))}</strong>（撳下面地點或者地圖上嘅點）</p>${holder}
  <div class="gmap-places">${area.stops.map((id) => `<button type="button" data-gmap-place="${escapeHtml(id)}" aria-pressed="${id === currentId}">📍 ${escapeHtml(gmapPlaceLabel(id))}</button>`).join("")}</div>${open(window.SeoulMap.kakaoPlaceUrl(place))}`;
  window.SeoulMap.render($("[data-seoul-map]", root), area.stops.map((id) => ({ place: canonicalPlaceFor(id) })), { activeId: currentId, onPick: (id) => renderRoutePanel(null, 0, "area", area.id, id) });
}

function setupRouteExplorer() {
  renderRoutePanel();
  let activePin = null;
  let popover = null;
  const closePopover = (restoreFocus = false) => {
    const opener = activePin;
    if (opener) { opener.setAttribute("aria-expanded", "false"); opener.removeAttribute("aria-controls"); }
    popover?.remove(); popover = null; activePin = null;
    if (restoreFocus) opener?.focus({ preventScroll: true });
  };
  const positionPopover = () => {
    if (!popover || !activePin) return;
    const point = activePin.getBoundingClientRect();
    popover.style.left = `${Math.max(8, Math.min(innerWidth - popover.offsetWidth - 8, point.left + point.width / 2 - popover.offsetWidth / 2))}px`;
    popover.style.top = `${Math.max(8, Math.min(innerHeight - popover.offsetHeight - 8, point.top - popover.offsetHeight - 10))}px`;
  };
  const showPopover = (pin, content, map = false) => {
    const wasOpen = activePin === pin; closePopover(); if (wasOpen) return;
    activePin = pin; pin.setAttribute("aria-expanded", "true"); pin.setAttribute("aria-controls", "route-active-popover");
    popover = document.createElement("section"); popover.id = "route-active-popover"; popover.className = `route-popover ${map ? "route-place-popover" : "transport-popover"}`;
    popover.setAttribute("role", "dialog"); popover.setAttribute("aria-label", map ? "地點地圖" : "交通信息");
    popover.innerHTML = `<button type="button" class="route-popover-close" data-close-route-popover aria-label="关闭">×</button>${content}`;
    (pin.closest("dialog") || document.body).append(popover); positionPopover();
    popover.querySelector("[data-close-route-popover]").focus({ preventScroll: true });
  };
  document.addEventListener("click", (event) => {
    const viewButton = event.target.closest("[data-gmap-view]");
    if (viewButton) { renderRoutePanel(null, Number($("#route-explorer").dataset.day || 0), viewButton.dataset.gmapView); return; }
    const areaButton = event.target.closest("[data-gmap-area]");
    if (areaButton) { renderRoutePanel(null, 0, "area", areaButton.dataset.gmapArea); return; }
    const gmapPlace = event.target.closest("[data-gmap-place]");
    if (gmapPlace) { renderRoutePanel(null, 0, "area", $("#route-explorer").dataset.area, gmapPlace.dataset.gmapPlace); return; }
    const dayButton = event.target.closest("[data-route-day]");
    if (dayButton) { closePopover(); renderRoutePanel(null, Number(dayButton.dataset.routeDay || 0), "route"); return; }
    if (event.target.closest("[data-close-route-popover]")) { closePopover(true); return; }
    const placePin = event.target.closest("[data-place-id]");
    if (placePin) {
      const source = travelMapSource(state.data?.routeMap, placePin.dataset.mapRegion);
      const options = placeOptions(source, placePin.dataset.placeId);
      const [label, query] = options[0];
      showPopover(placePin, `<header><small>${escapeHtml(placePin.dataset.placeRole)}</small><strong data-popup-place-label>${escapeHtml(label)}</strong></header>
        ${options.length > 1 ? `<div class="popup-place-options">${options.map(([name, value], index) => `<button type="button" data-popup-query="${escapeHtml(value)}" data-popup-label="${escapeHtml(name)}" aria-pressed="${index === 0}">${escapeHtml(name)}</button>`).join("")}</div>` : ""}
        <footer><a data-popup-external href="${mapsSearch(query)}" target="_blank" rel="noopener noreferrer">用 KakaoMap 打開 ↗</a><small>页内地图供查看，实际导航以地图服务结果为准。</small></footer>`, true);
      return;
    }
    const pin = event.target.closest("[data-transport-day]");
    if (pin) {
      const day = state.data.days.find((item) => item.day === Number(pin.dataset.transportDay));
      const source = travelMapSource(state.data?.routeMap, pin.dataset.mapRegion);
      const group = dailyMapLayoutFor(source, day.day).transport[Number(pin.dataset.transportGroup)];
      showPopover(pin, scheduleItemsForPin(day, group).map((item) => `<div class="transport-leg"><strong>${escapeHtml(transportNames[item.type] || "交通")} · ${escapeHtml(item.time)}</strong><p>${escapeHtml(item.text)}</p></div>`).join(""));
      return;
    }
    const option = event.target.closest("[data-popup-query]");
    if (option && popover) {
      const query = option.dataset.popupQuery;
      const label = option.dataset.popupLabel;
      $$("[data-popup-query]", popover).forEach((button) => button.setAttribute("aria-pressed", String(button === option)));
      $("[data-popup-place-label]", popover).textContent = label;
            $("[data-popup-external]", popover).href = mapsSearch(query);
      return;
    }
    if (event.target.closest(".route-popover")) return;
    closePopover();
    const zoom = event.target.closest("[data-expand-map]");
    if (zoom) {
      const dialog = $("#map-dialog");
      const source = document.getElementById(zoom.dataset.expandMap);
      const copy = source.cloneNode(true);
      const svg = copy.querySelector("svg");
      const ids = [...svg.querySelectorAll("[id]")].map((element) => element.id);
      for (const oldId of ids) svg.innerHTML = svg.innerHTML.replaceAll(`id="${oldId}"`, `id="${oldId}-zoom"`).replaceAll(`url(#${oldId})`, `url(#${oldId}-zoom)`);
      copy.removeAttribute("id"); copy.classList.toggle("daily-fullscreen", Boolean(source.closest(".is-daily")));
      copy.style.setProperty("--route-color", getComputedStyle(source).getPropertyValue("--route-color"));
      $("#map-dialog-content").replaceChildren(copy); dialog.showModal();
      const viewport = $("#map-dialog-content"); viewport.scrollLeft = Math.max(0, (copy.scrollWidth - viewport.clientWidth) / 2);
    }
    const link = event.target.closest("[data-open-day]");
    if (link) {
      event.preventDefault();
      const button = $(`[data-day="${Number(link.dataset.openDay)}"] .day-toggle`);
      if (button.getAttribute("aria-expanded") !== "true") button.click();
      button.scrollIntoView({ behavior: "smooth" });
    }
    const toggle = event.target.closest(".day-toggle");
    if (toggle && toggle.getAttribute("aria-expanded") === "true") activateDayMaps(toggle.closest(".day-card"));
  });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape" && activePin) { event.preventDefault(); event.stopPropagation(); closePopover(true); } });
  window.addEventListener("resize", positionPopover);
  document.addEventListener("scroll", (event) => { if (!event.target.closest?.(".route-popover")) positionPopover(); }, true);
  document.addEventListener("focusin", (event) => { if (popover && !popover.contains(event.target) && event.target !== activePin) closePopover(); });
  window.addEventListener("travel-view:shown", () => {
    const roots = [$("#route-explorer"), ...$$(".day-detail:not([hidden])")].filter(Boolean);
    roots.forEach((root) => {
      $$(".is-daily .travel-map-scroll", root).forEach((view) => view.removeAttribute("data-positioned"));
      activateDayMaps(root);
    });
  });
  $("#map-close").onclick = () => $("#map-dialog").close();
  $("#map-dialog").addEventListener("close", () => closePopover());
  $$(".day-detail:not([hidden])").forEach(activateDayMaps);
}
