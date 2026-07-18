/* Vantage web UI — frontend logic.
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
  // The About page's "Launch Vantage" buttons jump into the copilot.
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

function greet() {
  addMsg(
    "bot",
    "Hi — I'm Vantage. Tell me a patient's symptoms and I'll assess them and " +
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
    // The mock/real brain marks escalation with [SAFETY]; colour those red.
    const escalate = /\[safety\]|remote doctor|escalate/i.test(reply);
    addMsg("bot", reply, { escalate });
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
