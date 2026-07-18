/* VCare web UI — frontend logic.
   Talks to the tiny JSON API in app.py, which wraps the existing brain.
   No framework, no build step. */

const $ = (sel) => document.querySelector(sel);
let CONFIG = null;

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
init();

async function init() {
  wireTabs();
  wireChat();
  wireCall();
  wireRestock();
  try {
    CONFIG = await fetch("/api/config").then((r) => r.json());
  } catch (e) {
    CONFIG = { focus: { home: {}, countries: [], neighbours: [] }, field_guide: [] };
  }
  paintStatus();
  renderGuide();
  greet();
  initMap();          // async, self-contained
  loadSignals();
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
function wireTabs() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => showView(tab.dataset.view));
  });
  // The About page's "Launch VCare" buttons jump into the copilot.
  document.querySelectorAll("[data-goto]").forEach((el) => {
    el.addEventListener("click", () => showView(el.dataset.goto));
  });
}

// Switch the active tab + view. Generic over any <main class="view" id="view-X">
// so new pages (like About) work without editing this function again.
function showView(view) {
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.view === view)
  );
  document.querySelectorAll("main.view").forEach((v) =>
    v.classList.toggle("active", v.id === `view-${view}`)
  );
  if (view === "copilot") setTimeout(fitMap, 60);
  if (view === "restock") loadRestock();   // lazy: fetched on first open
}

function paintStatus() {
  const mode = (CONFIG.mode || "mock").toUpperCase();
  $("#pill-mode").textContent = `brain: ${mode}`;
  const live = CONFIG.live_signals;
  const ps = $("#pill-signals");
  ps.textContent = `signals: ${live ? "LIVE" : "MOCK"}`;
  ps.classList.toggle("live", !!live);
  const names = (CONFIG.focus.countries || []).map((c) => c.name).join(", ");
  if (names) $("#map-sub").textContent = names;
}

// ---------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------
function wireChat() {
  $("#composer").addEventListener("submit", (e) => {
    e.preventDefault();
    send($("#input").value);
  });
  $("#suggestions").addEventListener("click", (e) => {
    if (e.target.classList.contains("chip")) send(e.target.textContent);
  });
}

function wireRestock() {
  $("#refresh-restock").addEventListener("click", () => loadRestock(true));
}

function wireCall() {
  $("#call-close").addEventListener("click", closeCall);
  // Click the dark backdrop (outside the box) to end the call.
  $("#call-modal").addEventListener("click", (e) => {
    if (e.target.id === "call-modal") closeCall();
  });
  $("#call-copy").addEventListener("click", async () => {
    const link = $("#call-link").value;
    try {
      await navigator.clipboard.writeText(link);
      const b = $("#call-copy");
      b.textContent = "Copied";
      setTimeout(() => (b.textContent = "Copy"), 1400);
    } catch (e) {
      $("#call-link").select();
    }
  });
}

function greet() {
  addMsg(
    "bot",
    "Hi — I'm VCare. Tell me a patient's symptoms and I'll assess them and " +
      "flag when to call a doctor, or ask me what to reorder this month."
  );
}

function addMsg(who, text, opts = {}) {
  const el = document.createElement("div");
  el.className = `msg ${who}` + (opts.escalate ? " escalate" : "") + (opts.typing ? " typing" : "");
  el.textContent = text;
  $("#chat").appendChild(el);
  $("#chat").scrollTop = $("#chat").scrollHeight;
  return el;
}

// When triage escalates, drop a one-tap "connect to a doctor" action into the
// chat. Tapping it opens a live video consult (embedded Jitsi room).
function addCallButton(call) {
  const wrap = document.createElement("div");
  wrap.className = "call-action";
  const btn = document.createElement("button");
  btn.className = "call-btn";
  btn.innerHTML = `<span class="call-btn-ico">📞</span> Connect to a doctor`;
  btn.addEventListener("click", () => openCall(call));
  wrap.appendChild(btn);
  $("#chat").appendChild(wrap);
  $("#chat").scrollTop = $("#chat").scrollHeight;
}

// ---------------------------------------------------------------------------
// Doctor video call — embedded Jitsi (public meet.jit.si infra).
// ---------------------------------------------------------------------------
let _jitsi = null;   // live JitsiMeetExternalAPI instance, so we can dispose it

function openCall(call) {
  const modal = $("#call-modal");
  $("#call-room").textContent = "Room: " + call.room;
  $("#call-link").value = call.url;
  $("#call-open").href = call.url;
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");

  const stage = $("#call-stage");
  stage.innerHTML = "";
  // If the Jitsi script loaded, embed the call in-page; otherwise the footer
  // link ("Open in new tab") is the fallback — the call still works.
  if (window.JitsiMeetExternalAPI) {
    _jitsi = new JitsiMeetExternalAPI(call.host, {
      roomName: call.room,
      parentNode: stage,
      width: "100%",
      height: "100%",
      configOverwrite: { prejoinPageEnabled: false, startWithAudioMuted: false },
      userInfo: { displayName: "VCare — health worker" },
    });
    _jitsi.addEventListener("readyToClose", closeCall);
  } else {
    stage.innerHTML =
      `<div class="call-fallback">Live embed needs internet. Use
       <b>Open in new tab</b> below to start the video call.</div>`;
  }
}

function closeCall() {
  const modal = $("#call-modal");
  modal.classList.remove("open");
  modal.setAttribute("aria-hidden", "true");
  if (_jitsi) { try { _jitsi.dispose(); } catch (e) {} _jitsi = null; }
  $("#call-stage").innerHTML = "";
}

async function send(text) {
  text = (text || "").trim();
  if (!text) return;
  $("#input").value = "";
  $("#send").disabled = true;
  addMsg("user", text);
  const typing = addMsg("bot", "thinking…", { typing: true });

  try {
    const data = await fetch("/api/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text }),
    }).then((r) => r.json());
    typing.remove();
    const reply = data.reply || "(no reply)";
    // The backend decides escalation authoritatively and, when it fires,
    // hands us a fresh private video room for the doctor.
    const escalate = !!data.escalate;
    addMsg("bot", reply, { escalate });
    if (escalate && data.call && data.call.url) addCallButton(data.call);
  } catch (e) {
    typing.remove();
    addMsg("bot", "Sorry — I couldn't reach the brain. Is the server running?");
  } finally {
    $("#send").disabled = false;
    $("#input").focus();
  }
}

// ---------------------------------------------------------------------------
// Outbreak signals — grouped by country, selected country first.
// ---------------------------------------------------------------------------
let SIGNALS = null;          // last fetched payload ({by_country, live})
let SELECTED = null;         // iso3 of the currently selected focus country

$("#refresh-signals").addEventListener("click", loadSignals);

async function loadSignals() {
  const box = $("#signals");
  box.innerHTML = `<div class="empty">Loading signals…</div>`;
  try {
    SIGNALS = await fetch("/api/signals").then((r) => r.json());
  } catch (e) {
    box.innerHTML = `<div class="empty">Couldn't load signals.</div>`;
    return;
  }
  $("#signals-sub").textContent = SIGNALS.live
    ? "live via Oxylabs — selected area first"
    : "mock signals — selected area first";
  renderSignals();
}

function renderSignals() {
  const box = $("#signals");
  if (!SIGNALS) return;
  const groups = (SIGNALS.by_country || []).slice();
  if (!groups.length) {
    box.innerHTML = `<div class="empty">No active signals.</div>`;
    return;
  }
  // Order: selected country first, then the rest (as configured).
  groups.sort((a, b) => (b.iso3 === SELECTED) - (a.iso3 === SELECTED));

  box.innerHTML = "";
  groups.forEach((g) => {
    const isSel = g.iso3 === SELECTED;
    const group = document.createElement("div");
    group.className = "sig-group" + (isSel ? " selected" : "");
    group.innerHTML =
      `<div class="sig-group-head" data-iso="${g.iso3}">
         <span class="cname">${escapeHtml(g.name)}</span>
         ${isSel ? `<span class="sel-tag">selected</span>` : ""}
       </div>` +
      (g.signals || [])
        .map(
          (s) => `
        <div class="signal">
          <div class="name">${escapeHtml(s.disease)}</div>
          <div class="trend ${s.trend}">${s.trend}</div>
          <div class="bar"><i style="width:${Math.round((s.strength || 0) * 100)}%"></i></div>
          ${s.multiplier ? `<div class="mult">demand forecast <b>×${s.multiplier}</b> vs baseline</div>` : ""}
        </div>`
        )
        .join("");
    box.appendChild(group);
  });

  // Clicking a country name in the list selects it too (keeps map in sync).
  box.querySelectorAll(".sig-group-head").forEach((h) =>
    h.addEventListener("click", () => selectCountry(h.dataset.iso, true))
  );
}

// ---------------------------------------------------------------------------
// Restock — forecast-adjusted reorder plan for the next 30 days.
// Reads /api/restock (baseline usage × Oxylabs outbreak multiplier). Lazy:
// only fetched when the tab is first opened, then cached (a live fetch is slow).
// ---------------------------------------------------------------------------
let RESTOCK = null;        // last payload
let RESTOCK_LOADING = false;

async function loadRestock(force = false) {
  if (RESTOCK && !force) { renderRestock(); return; }   // use cache
  if (RESTOCK_LOADING) return;
  RESTOCK_LOADING = true;
  const box = $("#restock");
  box.innerHTML =
    `<div class="empty">Calculating from ${
      CONFIG && CONFIG.live_signals ? "live outbreak signals — this can take ~30s…" : "outbreak signals…"
    }</div>`;
  try {
    RESTOCK = await fetch("/api/restock").then((r) => r.json());
  } catch (e) {
    box.innerHTML = `<div class="empty">Couldn't load the restock plan.</div>`;
    RESTOCK_LOADING = false;
    return;
  }
  RESTOCK_LOADING = false;
  renderRestock();
}

function renderRestock() {
  const box = $("#restock");
  const orders = (RESTOCK && RESTOCK.orders) || [];
  if (!orders.length) {
    box.innerHTML = `<div class="empty">No restock recommendations.</div>`;
    return;
  }
  $("#restock-sub").textContent = (CONFIG && CONFIG.live_signals)
    ? "forecast-adjusted from live Oxylabs signals"
    : "forecast-adjusted from mock signals";

  // Sort most-urgent first (highest multiplier at the top).
  const rows = orders.slice().sort((a, b) => (b.multiplier || 1) - (a.multiplier || 1));

  box.innerHTML =
    `<div class="rx-head">
       <span>Medicine</span><span>Forecast</span><span class="rx-num">Order (30d)</span>
     </div>` +
    rows.map((o) => {
      const m = o.multiplier || 1;
      const tone = m > 1 ? "rising" : m < 1 ? "falling" : "steady";
      const label = m > 1 ? "trending up" : m < 1 ? "easing" : "steady";
      return `
      <div class="rx">
        <div class="rx-med">
          <span class="rx-name">${escapeHtml((o.medicine || "").replace(/_/g, " "))}</span>
          <span class="rx-reason">${escapeHtml(o.reason || "")}</span>
        </div>
        <div class="rx-forecast">
          <span class="rx-mult ${tone}">×${m}</span>
          <span class="rx-mlabel ${tone}">${label}</span>
          <span class="rx-base">baseline ${o.baseline}/mo</span>
        </div>
        <div class="rx-order ${tone}">${o.order}<small>units</small></div>
      </div>`;
    }).join("");
}

// ---------------------------------------------------------------------------
// Field Guide
// ---------------------------------------------------------------------------
function renderGuide() {
  const grid = $("#guide-grid");
  grid.innerHTML = "";
  (CONFIG.field_guide || []).forEach((d) => {
    const card = document.createElement("article");
    card.className = "guide-card";
    card.innerHTML = `
      <h3>${escapeHtml(d.title)} <span class="tag">${escapeHtml(d.disease)}</span></h3>
      <p class="spread">Spread by ${escapeHtml(d.spread)}</p>
      <div class="hotspots">${(d.hotspots || []).map((h) => `<span>${escapeHtml(h)}</span>`).join("")}</div>
      <div><h4>Common symptoms</h4><ul>${list(d.symptoms)}</ul></div>
      <div class="danger"><h4>Danger signs → escalate</h4><ul>${list(d.danger_signs)}</ul></div>
      <div><h4>Prevention</h4><ul>${list(d.prevention)}</ul></div>
      <p class="med-line">Clinic supply driven: <b>${escapeHtml((d.medicine || "").replace(/_/g, " "))}</b></p>
      <div class="guide-note">${escapeHtml(d.note || "")}</div>
    `;
    grid.appendChild(card);
  });
}

const list = (arr) => (arr || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");

// ---------------------------------------------------------------------------
// Map — Leaflet on a plain light canvas (no tiles). Highlights focus
// countries green, home base with a marker. GeoJSON from a CDN; if it can't
// load, the panel degrades to a simple country list.
// ---------------------------------------------------------------------------
const GEO_URL =
  "https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json";

// Fill colours per state — kept here so the map + legend stay in one palette.
const MAP = {
  focus:    { color: "#93b4f2", weight: 1,   fillColor: "#2563eb", fillOpacity: 0.4 },
  selected: { color: "#12224e", weight: 1.6, fillColor: "#1d4ed8", fillOpacity: 0.85 },
  home:     { color: "#12224e", weight: 1.4, fillColor: "#12224e", fillOpacity: 0.28 },
  neighbour:{ color: "#cbd5e1", weight: 0.8, fillColor: "#dbe3ee", fillOpacity: 0.75 },
};

let _focusLayers = {};       // iso3 -> Leaflet layer, for restyling on select
let _mapBounds = null;       // bounds of the drawn countries, for (re)fitting

// Recompute size + refit — call after the container becomes visible/resized.
function fitMap() {
  if (!window._map) return;
  window._map.invalidateSize();
  if (_mapBounds) window._map.fitBounds(_mapBounds.pad(0.15));
}
window.addEventListener("resize", () => setTimeout(fitMap, 120));

async function initMap() {
  const home = CONFIG.focus.home || {};
  const focusList = CONFIG.focus.countries || [];
  const focusIso = new Set(focusList.map((c) => c.iso3));
  const neighbourIso = new Set(CONFIG.focus.neighbours || []);

  const map = L.map("map", {
    zoomControl: false,
    attributionControl: false,
    scrollWheelZoom: false,
  }).setView([5, 112], 4);
  window._map = map;

  let geo;
  try {
    geo = await fetch(GEO_URL).then((r) => r.json());
  } catch (e) {
    document.getElementById("map").innerHTML =
      `<div class="empty" style="padding:20px">Map needs internet to load country shapes.</div>`;
    return;
  }

  const layer = L.geoJSON(geo, {
    filter: (f) => focusIso.has(f.id) || neighbourIso.has(f.id) || f.id === home.iso3,
    style: (f) => {
      if (focusIso.has(f.id)) return MAP.focus;
      if (f.id === home.iso3) return MAP.home;
      return MAP.neighbour;
    },
    onEachFeature: (f, lyr) => {
      if (!focusIso.has(f.id)) return;         // only deployment areas are selectable
      _focusLayers[f.id] = lyr;
      // Click a country -> select it (colour change, no popup box).
      lyr.on("click", () => selectCountry(f.id, false));
      // Subtle hover cue (no box, just a slight lift in opacity).
      lyr.on("mouseover", () => {
        if (f.id !== SELECTED) lyr.setStyle({ fillOpacity: 0.6 });
      });
      lyr.on("mouseout", () => {
        if (f.id !== SELECTED) lyr.setStyle({ fillOpacity: MAP.focus.fillOpacity });
      });
    },
  }).addTo(map);

  // Home base — a small navy marker, no tooltip box.
  if (home.lat && home.lng) {
    L.circleMarker([home.lat, home.lng], {
      radius: 6, color: "#fff", weight: 2, fillColor: "#12224e", fillOpacity: 1,
    }).addTo(map);
  }

  try {
    _mapBounds = layer.getBounds();
  } catch (e) {
    _mapBounds = null;
  }
  // Fit once now, and again on the next frames — the container may still be
  // settling its final width when the GeoJSON first lands.
  fitMap();
  setTimeout(fitMap, 120);
  setTimeout(fitMap, 400);

  // Select the first deployment area by default so signals have a clear order.
  if (focusList.length) selectCountry(focusList[0].iso3, false);
}

// Central place that keeps map colours + signal order + label in sync.
function selectCountry(iso3, recenter) {
  if (!iso3) return;
  const prev = SELECTED;
  SELECTED = iso3;

  // Restyle the previous and new selection on the map.
  if (prev && _focusLayers[prev]) _focusLayers[prev].setStyle(MAP.focus);
  const lyr = _focusLayers[iso3];
  if (lyr) {
    lyr.setStyle(MAP.selected);
    lyr.bringToFront();
    if (recenter && window._map) window._map.panTo(lyr.getBounds().getCenter());
  }

  const name = ((CONFIG.focus.countries || []).find((c) => c.iso3 === iso3) || {}).name || iso3;
  $("#map-sub").textContent = `Selected: ${name} — click a country to change`;

  renderSignals();
}

// ---------------------------------------------------------------------------
function escapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
