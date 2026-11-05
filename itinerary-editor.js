// 每日行程編輯模式：改字、改時間、調位、搬日子、刪除、新增。改動存喺呢部機嘅瀏覽器（localStorage）。
(function () {
  const VERSION = 1;
  let original = null; // trip-data.json 原本嘅 days（還原用）
  let editing = false;
  let saveTimer = null;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const keyFor = (data) => `itinerary-edits:${data?.metadata?.tripId || "trip"}`;
  const data = () => window.TRAVEL_PLAN_DATA;

  function readSaved(d) {
    try { const raw = localStorage.getItem(keyFor(d)); const saved = raw ? JSON.parse(raw) : null; return saved?.version === VERSION ? saved : null; } catch { return null; }
  }
  function writeSaved() {
    const d = data();
    const payload = { version: VERSION, savedAt: new Date().toISOString(), days: d.days.map((day) => ({ day: day.day, title: day.title, schedule: day.schedule })) };
    try { localStorage.setItem(keyFor(d), JSON.stringify(payload)); flash("已儲存"); } catch { flash("儲存唔到（瀏覽器唔畀存）"); }
  }
  function queueSave() { clearTimeout(saveTimer); saveTimer = setTimeout(writeSaved, 400); }

  function placeIdsOf(item) { return [...new Set([...(item.placeIds || []), ...(item.placeId ? [item.placeId] : [])])]; }
  function syncMapStops(day) {
    const ids = [];
    day.schedule.forEach((item) => placeIdsOf(item).forEach((id) => { if (!ids.includes(id)) ids.push(id); }));
    day.mapStops = ids;
    day.mapAltStops = [];
  }

  function applySaved(d) {
    const saved = readSaved(d);
    if (!saved) return false;
    saved.days.forEach((savedDay) => {
      const day = d.days.find((item) => item.day === savedDay.day);
      if (!day) return;
      day.title = savedDay.title;
      day.schedule = savedDay.schedule;
      syncMapStops(day);
    });
    return true;
  }

  document.addEventListener("travel-data-ready", (event) => {
    const d = event.detail;
    original = JSON.parse(JSON.stringify(d.days));
    d.__edited = applySaved(d);
  });

  function flash(text) {
    const el = document.getElementById("itinerary-editor-status");
    if (!el) return;
    el.textContent = text;
    clearTimeout(flash.t);
    flash.t = setTimeout(() => { el.textContent = data()?.__edited ? "用緊你改過嘅版本（只存喺呢部機）" : ""; }, 1800);
  }

  function placeOptions(selected) {
    const places = data().places || [];
    return `<option value="">（冇地點）</option>${places.map((p) => `<option value="${esc(p.id)}"${p.id === selected ? " selected" : ""}>${esc(p.nameZh || p.name)}</option>`).join("")}`;
  }
  function dayOptions(current) {
    return data().days.map((day) => `<option value="${day.day}"${day.day === current ? " selected" : ""}>${esc(day.date.slice(5).replace("-", "/"))}</option>`).join("");
  }

  function itemEditor(day, item, index) {
    const ids = placeIdsOf(item);
    return `<li class="ed-item" data-ed-day="${day.day}" data-ed-index="${index}">
      <div class="ed-row">
        <input class="ed-time" data-ed-field="time" value="${esc(item.time)}" aria-label="時間" placeholder="時間">
        <div class="ed-move">
          <button type="button" data-ed-act="up" aria-label="上移"${index === 0 ? " disabled" : ""}>↑</button>
          <button type="button" data-ed-act="down" aria-label="下移"${index === day.schedule.length - 1 ? " disabled" : ""}>↓</button>
          <select data-ed-act="moveday" aria-label="搬去另一日">${dayOptions(day.day)}</select>
          <button type="button" data-ed-act="delete" class="ed-delete" aria-label="刪除">刪除</button>
        </div>
      </div>
      <textarea data-ed-field="text" rows="2" aria-label="內容">${esc(item.text)}</textarea>
      <label class="ed-place">📍 地點 <select data-ed-field="place">${placeOptions(ids[0] || "")}</select>${ids.length > 1 ? `<small>（另有 ${ids.length - 1} 個地點，揀咗就會只留呢個）</small>` : ""}</label>
    </li>`;
  }

  function renderEditor() {
    const d = data();
    $("#timeline").innerHTML = d.days.map((day) => `<article class="ed-day" data-ed-day-card="${day.day}">
      <p class="day-meta">DAY ${String(day.day).padStart(2, "0")} · ${esc(day.date.slice(5).replace("-", "/"))}</p>
      <input class="ed-title" data-ed-title="${day.day}" value="${esc(day.title)}" aria-label="當日標題">
      <ol class="ed-list">${day.schedule.map((item, index) => itemEditor(day, item, index)).join("")}</ol>
      <button type="button" class="ed-add" data-ed-add="${day.day}">＋ 加一項</button>
    </article>`).join("");
    $("#timeline").onclick = onClick;
    $("#timeline").onchange = onChange;
    $("#timeline").oninput = onInput;
  }

  function target(el) {
    const li = el.closest(".ed-item");
    if (!li) return null;
    const day = data().days.find((item) => item.day === Number(li.dataset.edDay));
    return { day, index: Number(li.dataset.edIndex), item: day.schedule[Number(li.dataset.edIndex)] };
  }
  function changed(day, rerender = true) { if (day) syncMapStops(day); data().__edited = true; queueSave(); if (rerender) renderEditor(); }

  function onClick(event) {
    const add = event.target.closest("[data-ed-add]");
    if (add) {
      const day = data().days.find((item) => item.day === Number(add.dataset.edAdd));
      day.schedule.push({ id: `u-${Date.now()}`, time: "", type: "note", text: "" });
      changed(day);
      const items = $$(`[data-ed-day-card="${day.day}"] textarea`);
      items[items.length - 1]?.focus();
      return;
    }
    const btn = event.target.closest("button[data-ed-act]");
    if (!btn) return;
    const t = target(btn);
    if (!t) return;
    const { day, index } = t;
    if (btn.dataset.edAct === "up" && index > 0) [day.schedule[index - 1], day.schedule[index]] = [day.schedule[index], day.schedule[index - 1]];
    if (btn.dataset.edAct === "down" && index < day.schedule.length - 1) [day.schedule[index + 1], day.schedule[index]] = [day.schedule[index], day.schedule[index + 1]];
    if (btn.dataset.edAct === "delete") { if (!confirm("刪除呢一項？")) return; day.schedule.splice(index, 1); }
    changed(day);
  }

  function onChange(event) {
    const el = event.target;
    if (el.matches("select[data-ed-act='moveday']")) {
      const t = target(el);
      const to = data().days.find((item) => item.day === Number(el.value));
      if (!t || !to || to === t.day) return;
      const [moved] = t.day.schedule.splice(t.index, 1);
      to.schedule.push(moved);
      syncMapStops(to);
      changed(t.day);
      flash(`已搬去 ${to.date.slice(5).replace("-", "/")}（放咗喺最尾）`);
      return;
    }
    if (el.matches("select[data-ed-field='place']")) {
      const t = target(el);
      if (!t) return;
      delete t.item.placeIds;
      if (el.value) t.item.placeId = el.value; else delete t.item.placeId;
      changed(t.day, false);
    }
  }

  function onInput(event) {
    const el = event.target;
    if (el.matches("[data-ed-title]")) {
      const day = data().days.find((item) => item.day === Number(el.dataset.edTitle));
      day.title = el.value; changed(null, false); return;
    }
    const field = el.dataset.edField;
    if (field === "time" || field === "text") {
      const t = target(el);
      if (!t) return;
      t.item[field] = el.value;
      changed(null, false);
    }
  }

  function refreshMap() {
    try { if (typeof renderRoutePanel === "function" && document.getElementById("route-explorer")) renderRoutePanel(null, Number(document.getElementById("route-explorer").dataset.day || 0)); } catch (error) { console.warn(error); }
  }

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle("is-editing-itinerary", on);
    $("#ed-toggle").textContent = on ? "✓ 完成" : "✏️ 編輯行程";
    $("#ed-toggle").setAttribute("aria-pressed", String(on));
    if (on) renderEditor();
    else { clearTimeout(saveTimer); if (data().__edited) writeSaved(); renderTimeline(); refreshMap(); }
  }

  function reset() {
    if (!confirm("還原返原本嘅行程？你喺呢部機改過嘅嘢會冇晒。")) return;
    try { localStorage.removeItem(keyFor(data())); } catch {}
    const d = data();
    d.days = JSON.parse(JSON.stringify(original));
    d.__edited = false;
    if (editing) renderEditor(); else { renderTimeline(); refreshMap(); }
    flash("已還原");
  }

  function mountToolbar() {
    const timeline = document.getElementById("timeline");
    if (!timeline || document.getElementById("itinerary-editor-bar")) return;
    const bar = document.createElement("div");
    bar.id = "itinerary-editor-bar";
    bar.className = "ed-bar";
    bar.innerHTML = `<button type="button" id="ed-toggle" aria-pressed="false">✏️ 編輯行程</button><button type="button" id="ed-reset" class="ed-secondary">還原原版</button><span id="itinerary-editor-status" role="status"></span>`;
    timeline.before(bar);
    $("#ed-toggle").onclick = () => setEditing(!editing);
    $("#ed-reset").onclick = reset;
    if (data()?.__edited) flash("");
  }

  document.addEventListener("DOMContentLoaded", () => {
    const wait = setInterval(() => {
      if (!data() || !document.querySelector("#timeline .day-card")) return;
      clearInterval(wait);
      mountToolbar();
      if (data().__edited) refreshMap();
    }, 100);
    setTimeout(() => clearInterval(wait), 15000);
  });
})();
