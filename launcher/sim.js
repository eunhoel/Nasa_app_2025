// sim.js (full — English UI, clearer cards, impact summaries, continuous bands)
// Drop-in replacement. No external CSS edits required.

/* ===================== Config ===================== */
const API_KEY = "GfpMXgK61T0dYmZOMoghrM5Nh29JKy2ZieIAmwUV"; // ← put your NASA NeoWs API key

/* ===================== Utils ===================== */
const G = 9.81;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mean = (a, b) => (Number(a) + Number(b)) / 2;
const toMS = (kmps) => Number(kmps) * 1000;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const fmt = (n, digits = 2) =>
  Number(n).toLocaleString(undefined, { maximumFractionDigits: digits });
const fmtKM = (x, d = 1) =>
  (Number(x) || 0).toLocaleString(undefined, { maximumFractionDigits: d }) + " km";
const fmtM = (x, d = 0) =>
  (Number(x) || 0).toLocaleString(undefined, { maximumFractionDigits: d }) + " m";

/* ===== Visualization knobs (tune to taste) ===== */
const VizParams = {
  tsunami: {
    p: 1.0,           // far-field decay exponent (R^-p) outside source region
    drKm: 25,         // ring step (km)
    ampCutoff_m: 0.1, // stop drawing when height < cutoff (e.g., 10 cm)
    minMaxRangeKm: 150,
    maxMaxRangeKm: 1200
  },
  seismic: {
    // demo intensity curve (not a GMPE): I(R) = a + b*M - c*log10(R+R0) - d*R
    a: -1.5, b: 2.0, c: 3.0, d: 0.003, R0: 10,
    maxRangeKm: 800, drKm: 20
  },
  maxRings: 80 // performance cap
};

/* ===================== DOM refs ===================== */
const statusEl  = document.getElementById("status");
const resultsEl = document.getElementById("results");

/* ===================== Minimal inline styles (JS-injected) ===================== */
// Keeps cards readable without editing external CSS files.
function ensureResultStyles() {
  if (document.getElementById("sim-styles")) return;
  const css = `
  #results { padding:12px; }
  .results-header { display:flex; flex-wrap:wrap; align-items:center; gap:8px 12px; margin-bottom:12px; }
  .results-title { font-size:1.1rem; font-weight:700; color:#FFFFFF; }
  .chips { display:flex; flex-wrap:wrap; gap:6px; }
  .chip { display:inline-flex; align-items:center; gap:6px; padding:4px 8px; border-radius:999px; font-size:.85rem; line-height:1;
          background:#f1f5f9; color:#0f172a; border:1px solid #e2e8f0; }

  .results-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:12px; }

  .card { background:#fff; color:#0f172a; border:1px solid #e5e7eb; border-radius:12px; box-shadow:0 1px 3px rgba(0,0,0,.06); padding:14px; }
  .card h3 { margin:0 0 8px 0; font-size:1rem; font-weight:700; color:#0f172a; }

  .metrics { display:grid; grid-template-columns:1fr 1fr; gap:6px 12px; }
  .metric { display:flex; flex-direction:column; gap:2px; }
  .metric b { color:#334155; font-weight:600; font-size:.9rem; }
  .metric .val { color:#0f172a; font-weight:700; font-variant-numeric:tabular-nums; }

  .kv { display:grid; grid-template-columns: 140px 1fr; gap:6px 8px; }
  .kv .k { color:#475569; font-weight:600; font-size:.9rem; }
  .kv .v { color:#0f172a; font-weight:700; font-variant-numeric:tabular-nums; }

  .table { width:100%; border-collapse:collapse; font-size:.92rem; }
  .table th, .table td { padding:6px 8px; border-bottom:1px solid #f1f5f9; text-align:left; }
  .table thead th { color:#475569; font-weight:700; }

  .badge { display:inline-block; padding:2px 6px; border-radius:6px; font-size:.8rem; font-weight:700; border:1px solid transparent; }
  .badge-mmi-weak   { background:#e0f2fe; color:#075985; border-color:#bae6fd; }
  .badge-mmi-mod    { background:#fef9c3; color:#854d0e; border-color:#fde68a; }
  .badge-mmi-strong { background:#ffedd5; color:#9a3412; border-color:#fed7aa; }
  .badge-mmi-severe { background:#fee2e2; color:#7f1d1d; border-color:#fecaca; }
  `;
  const style = document.createElement("style");
  style.id = "sim-styles";
  style.textContent = css;
  document.head.appendChild(style);
}

/* ===================== Section toggles & Filter bar ===================== */
function setSectionVisible(selector, visible) {
  document.querySelectorAll(selector).forEach((el) => { el.style.display = visible ? "" : "none"; });
}

function ensureFilterBar() {
  const host = document.querySelector(".control-pane") || resultsEl?.parentElement || document.body;
  if (!host || host.querySelector(".filter-bar")) return;

  const bar = document.createElement("div");
  bar.className = "filter-bar";
  bar.style.cssText = "display:flex; gap:8px; padding:8px 12px; flex-wrap:wrap; align-items:center;";
  bar.innerHTML = `
    <button type="button" class="btn" data-view="all">All</button>
    <button type="button" class="btn" data-view="crater">Crater</button>
    <button type="button" class="btn" data-view="tsunami">Tsunami</button>
    <button type="button" class="btn" data-view="seismic">Seismic</button>
  `;
  host.prepend(bar);

  bar.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (!btn) return;
    const view = btn.dataset.view;

    if (view === "all") {
      const t = (window.targetType || "land").toLowerCase();
      setSectionVisible(".card--crater", true);
      setSectionVisible(".card--tsunami", t === "ocean");
      setSectionVisible(".card--seismic", t === "land");
      setLayerVisible("crater", true);
      setLayerVisible("tsunami", t === "ocean");
      setLayerVisible("seismic", t === "land");
    } else if (view === "crater") {
      setSectionVisible(".card--crater", true);
      setSectionVisible(".card--tsunami,.card--seismic", false);
      setLayerVisible("crater", true);
      setLayerVisible("tsunami", false);
      setLayerVisible("seismic", false);
    } else if (view === "tsunami") {
      setSectionVisible(".card--crater,.card--seismic", false);
      setSectionVisible(".card--tsunami", true);
      setLayerVisible("crater", false);
      setLayerVisible("tsunami", true);
      setLayerVisible("seismic", false);
    } else if (view === "seismic") {
      setSectionVisible(".card--crater,.card--tsunami", false);
      setSectionVisible(".card--seismic", true);
      setLayerVisible("crater", false);
      setLayerVisible("tsunami", false);
      setLayerVisible("seismic", true);
    }
  });
}

/* ===================== NeoWs API ===================== */
async function neowsBrowsePage({ apiKey, page = 0, size = 200 }) {
  const url = `https://api.nasa.gov/neo/rest/v1/neo/browse?page=${page}&size=${size}&api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`browse failed: ${res.status}`);
  return res.json();
}

async function neowsLookup({ apiKey, neoId }) {
  const url = `https://api.nasa.gov/neo/rest/v1/neo/${neoId}?api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`lookup failed (${neoId}): ${res.status}`);
  return res.json();
}

async function fetchPHACandidatesFromAPI({
  apiKey,
  maxPages = 1,
  pageSize = 200,
  maxCandidates = 200,
  rateMs = 120,
} = {}) {
  const basics = [];
  for (let p = 0; p < maxPages; p++) {
    const data = await neowsBrowsePage({ apiKey, page: p, size: pageSize });
    for (const neo of data.near_earth_objects || []) {
      if (neo.is_potentially_hazardous_asteroid) {
        basics.push({ id: neo.neo_reference_id, name: neo.name });
      }
      if (basics.length >= maxCandidates) break;
    }
    if (basics.length >= maxCandidates) break;
  }

  const candidates = [];
  for (const b of basics) {
    await sleep(rateMs);
    const full = await neowsLookup({ apiKey, neoId: b.id });
    const est = full?.estimated_diameter?.meters;
    if (!est) continue;
    const D_api = mean(est.estimated_diameter_min, est.estimated_diameter_max); // m

    const apps = (full.close_approach_data || [])
      .filter((d) => (d.orbiting_body || "").toLowerCase() === "earth");

    for (const app of apps) {
      const when = app.close_approach_date_full || app.close_approach_date || null;
      const whenIso = when ? (when.replace(" ", "T") + "Z") : null;
      candidates.push({
        neo: full,
        approach: app,
        D_api,
        v_api: toMS(app?.relative_velocity?.kilometers_per_second || NaN),
        whenIso,
        miss_km: Number(app?.miss_distance?.kilometers ?? NaN),
        moid_au: Number(full?.orbital_data?.minimum_orbit_intersection ?? NaN),
        orbit_unc: Number(full?.orbital_data?.orbit_uncertainty ?? 9),
      });
    }
  }
  return candidates;
}

/* ===================== Candidate matching ===================== */
function scoreDV(Du, Vu, Da, Va, { wD = 1.0, wV = 0.7, vScale = 5000 } = {}) {
  const dD = Math.abs(Math.log(Du) - Math.log(Da));
  const dV = Math.abs(Vu - Va) / vScale;
  return wD * dD + wV * dV;
}
function pickClosestByDV(cands, Du, Vu) {
  const scored = cands
    .map((c) => ({ ...c, score: scoreDV(Du, Vu, c.D_api, c.v_api) }))
    .filter((c) => Number.isFinite(c.score) && Number.isFinite(c.D_api) && Number.isFinite(c.v_api));

  if (!scored.length) throw new Error("No Earth-approaching PHA candidates.");

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      (a.moid_au ?? 99) - (b.moid_au ?? 99) ||
      Math.abs(Date.now() - Date.parse(a.whenIso || 0)) -
        Math.abs(Date.now() - Date.parse(b.whenIso || 0)) ||
      a.orbit_unc - b.orbit_unc
  );
  return scored[0];
}

/* ===================== Impact physics (simplified) ===================== */
function impactEnergyJ(D_m, rho_i, v) {
  const volume = (Math.PI / 6) * D_m ** 3;
  return 0.5 * rho_i * volume * v ** 2;
}

function transientCraterDiameterM(D_m, rho_i, rho_t, v, theta_deg, targetType) {
  const C = targetType === "ocean" ? 1.365 : 1.161;
  const sinTh = Math.max(Math.sin((theta_deg * Math.PI) / 180), 1e-3);
  return (
    C *
    (rho_i / rho_t) ** (1 / 3) *
    D_m ** 0.78 *
    v ** 0.44 *
    G ** -0.22 *
    sinTh ** (1 / 3)
  );
}

function finalCraterDiameterM(Dtc_m) {
  const Dtc_km = Dtc_m / 1000;
  const Dc = 3.2;
  if (Dtc_km <= 2.56) return { mode: "simple", Dfr_m: 1.25 * Dtc_km * 1000 };
  const Dfr_km = 1.17 * Dtc_km ** 1.13 * Dc ** 0.13;
  return { mode: "complex", Dfr_m: Dfr_km * 1000 };
}

// elevation(고도, m) 보정: +1 km → ~+1% effect
function finalCraterDepthM(mode, Dfr_m, Dtc_m, elevation = 0) {
  const elevation_factor = 1 + elevation / 1000;
  if (mode === "simple") {
    const d_tc = Dtc_m / 2;
    const h_fr = (0.07 * Dtc_m ** 4) / (Dfr_m ** 3 + 1e-9);
    const t_br = Math.min(0.1 * d_tc, d_tc);
    return Math.max(d_tc + h_fr - t_br, 0.2 * Dfr_m) * elevation_factor;
  }
  return 0.4 * (Dfr_m / 1000) ** 0.3 * 1000 * elevation_factor;
}

// elevation 보정: +1 km → ~+1% energy effect
function seismicMagnitude(E_J, elevation = 0) {
  const elevation_factor = 1 + elevation / 1000;
  const adjusted_E = E_J * elevation_factor;
  return 0.67 * Math.log10(Math.max(adjusted_E, 1)) - 5.87;
}

// English MMI band label (coarse)
function mmiBand(M) {
  if (M < 4) return "III–IV (Weak)";
  if (M < 5) return "IV–V (Light–Moderate)";
  if (M < 6) return "VI–VII (Moderate–Strong)";
  if (M < 7) return "VII–VIII (Strong–Very strong)";
  if (M < 8) return "IX–X (Severe)";
  if (M < 9) return "X–XI (Violent)";
  return "XII (Extreme)";
}

/* ===================== Continuous profiles ===================== */
// Tsunami: distance profile with adaptive max range & amplitude cutoff
function buildTsunamiProfile({ Dtc_m, water_depth_m = 4000, elevation_m = 0 }) {
  const { p, drKm, ampCutoff_m, minMaxRangeKm, maxMaxRangeKm } = VizParams.tsunami;

  const Dtc_km = Dtc_m / 1000;
  const maxRangeKm = clamp(Dtc_km * 30, minMaxRangeKm, maxMaxRangeKm); // scale with source size

  const R_rw = 0.75 * Dtc_m;               // near-field reference
  const base = (Dtc_m / 14.1);             // base height scale
  const elevFactor = Math.max(0, 1 - elevation_m / 5000); // inland elevation weakens land impact
  const c = Math.sqrt(G * water_depth_m);  // wave speed (shallow-water approx)

  const out = [];
  for (let Rkm = drKm; Rkm <= maxRangeKm; Rkm += drKm) {
    const r_m = Rkm * 1000;
    const A0 = (r_m <= R_rw) ? base : base * (R_rw / r_m) ** p;
    const A  = A0 * elevFactor;

    if (A < ampCutoff_m) break; // stop if below visibility cutoff

    const t_min = (r_m / c) / 60;
    out.push({ range_km: Rkm, amplitude_m: A, arrival_time_min: t_min });

    if (out.length >= VizParams.maxRings) break; // perf guard
  }
  return out;
}

// Seismic: simple intensity curve (demo — not GMPE)
function buildSeismicProfile({ M, maxRangeKm = VizParams.seismic.maxRangeKm, drKm = VizParams.seismic.drKm }) {
  const { a, b, c, d, R0 } = VizParams.seismic;
  const out = [];
  for (let Rkm = drKm; Rkm <= maxRangeKm; Rkm += drKm) {
    const I = a + b * M - c * Math.log10(Rkm + R0) - d * Rkm;
    out.push({ range_km: Rkm, intensity: I });
    if (out.length >= VizParams.maxRings) break;
  }
  return out;
}
function seismicStyle(I) {
  if (I >= 9.5) return { stroke: "#b71c1c", fill: 0.16 };
  if (I >= 7.5) return { stroke: "#e53935", fill: 0.14 };
  if (I >= 6.0) return { stroke: "#fb8c00", fill: 0.12 };
  if (I >= 4.5) return { stroke: "#fdd835", fill: 0.10 };
  if (I >= 3.5) return { stroke: "#43a047", fill: 0.08 };
  return { stroke: "#1e88e5", fill: 0.06 };
}

/* ===================== Map overlay layers ===================== */
const Layers = {
  crater: [],   // final/transient crater rings
  tsunami: [],  // continuous tsunami bands
  seismic: [],  // continuous seismic bands
};
function clearLayer(name) { (Layers[name] || []).forEach(g => g.setMap(null)); Layers[name] = []; }
function clearAllLayers() { Object.keys(Layers).forEach(k => clearLayer(k)); }
function setLayerVisible(name, visible) { (Layers[name] || []).forEach(g => g.setOptions({ visible })); }
function addCircleToLayer(layerName, circle) { Layers[layerName].push(circle); }
function addCircle({ centerLatLng, radiusMeters, strokeColor, fillOpacity=0.08, visible=true, zIndex=1 }) {
  const map = window.getMap && window.getMap();
  if (!map) return null;
  return new google.maps.Circle({
    map,
    center: centerLatLng,
    radius: radiusMeters,
    strokeColor,
    strokeOpacity: 0.7,
    strokeWeight: 2,
    fillColor: strokeColor,
    fillOpacity,
    clickable: false,
    visible,
    zIndex
  });
}

// Draw all layers using computed results
function drawAllLayers(res, centerLatLng) {
  clearAllLayers();

  // A) Crater (central two rings)
  if (res?.crater?.final_diameter_m) {
    const finalR = res.crater.final_diameter_m / 2;
    const c1 = addCircle({ centerLatLng, radiusMeters: finalR, strokeColor: "#d32f2f", fillOpacity: 0.14, zIndex: 10 });
    if (c1) addCircleToLayer("crater", c1);
  }
  if (res?.crater?.transient_diameter_m) {
    const transR = res.crater.transient_diameter_m / 2;
    const c2 = addCircle({ centerLatLng, radiusMeters: transR, strokeColor: "#f57c00", fillOpacity: 0.10, zIndex: 9 });
    if (c2) addCircleToLayer("crater", c2);
  }

  // B) Tsunami: continuous bands
  if ((res.target_type || "land") === "ocean" && Array.isArray(res.tsunami_profile)) {
    const prof = res.tsunami_profile;
    prof.forEach((tz, idx) => {
      const r = tz.range_km * 1000;
      const c = addCircle({
        centerLatLng,
        radiusMeters: r,
        strokeColor: "#0288d1",
        fillOpacity: 0.04 + 0.0004 * (prof.length - idx), // inner rings a bit denser
        zIndex: 1 + idx
      });
      if (c) addCircleToLayer("tsunami", c);
    });
  }

  // C) Seismic: continuous bands
  if (res?.seismic?.M && res.target_type === "land") {
    const prof = buildSeismicProfile({ M: Number(res.seismic.M) });
    prof.forEach((p, idx) => {
      const style = seismicStyle(p.intensity);
      const r = p.range_km * 1000;
      const c = addCircle({
        centerLatLng,
        radiusMeters: r,
        strokeColor: style.stroke,
        fillOpacity: style.fill,
        zIndex: 1 + idx
      });
      if (c) addCircleToLayer("seismic", c);
    });
  }

  // Default visibility based on target type
  const t = (res.target_type || "land").toLowerCase();
  setLayerVisible("crater", true);
  setLayerVisible("tsunami", t === "ocean");
  setLayerVisible("seismic", t === "land");
}

/* ===================== Impact summaries ===================== */
function summarizeImpacts(res) {
  const out = { crater: null, tsunami: null, seismic: null };

  // Crater radii (derived bands)
  if (res?.crater?.final_diameter_m) {
    const Dfr = res.crater.final_diameter_m;
    out.crater = {
      severe_radius_km: (0.5 * Dfr) / 1000,   // inner
      moderate_radius_km: Dfr / 1000,         // middle
      light_radius_km: (1.6 * Dfr) / 1000     // outer
    };
  }

  // Tsunami profile summary
  if (Array.isArray(res?.tsunami_profile) && res.tsunami_profile.length) {
    let maxAmp = -Infinity, atKm = 0, reachKm = 0;
    const cutoff = VizParams.tsunami.ampCutoff_m;
    for (const p of res.tsunami_profile) {
      if (p.amplitude_m > maxAmp) { maxAmp = p.amplitude_m; atKm = p.range_km; }
      if (p.amplitude_m >= cutoff) reachKm = Math.max(reachKm, p.range_km);
    }
    out.tsunami = { max_height_m: maxAmp, max_at_km: atKm, reach_km: reachKm, cutoff_m: cutoff };
  }

  // Seismic reach at thresholds (demo scale)
  if (res?.target_type === "land" && res?.seismic?.M) {
    const prof = buildSeismicProfile({ M: Number(res.seismic.M) });
    const reach = (thr) => prof.reduce((r, p) => p.intensity >= thr ? Math.max(r, p.range_km) : r, 0);
    out.seismic = {
      strong_km:   reach(6.0),  // "Strong" (≈ VI)
      moderate_km: reach(4.5),  // "Moderate" (≈ IV–V)
      light_km:    reach(3.5)   // "Light" (≈ III–IV)
    };
  }

  return out;
}

/* ===================== Render results (English UI) ===================== */
function mmiBadgeClassEn(band) {
  if (!band) return "badge-mmi-weak";
  const s = band.toUpperCase();
  if (s.includes("XII") || s.includes("XI") || s.includes("X ")) return "badge-mmi-severe";
  if (s.includes("VIII") || s.includes("VII") || s.includes("VI")) return "badge-mmi-strong";
  if (s.includes("V ") || s.includes("IV")) return "badge-mmi-mod";
  return "badge-mmi-weak";
}

function renderResult(res) {
  ensureResultStyles();
  const impacts = summarizeImpacts(res);

  const hdr = `
    <div class="results-header">
      <div class="results-title">Matched PHA: ${res.matching.name || "-"}</div>
      <div class="chips">
        <span class="chip">Approach (UTC): <b>${res.matching.approach_when_utc || "-"}</b></span>
        <span class="chip">Rel. speed: <b>${fmt(res.matching.approach_v_km_s, 2)} km/s</b></span>
        <span class="chip">Miss distance: <b>${fmt(res.matching.approach_miss_distance_km, 0)} km</b></span>
        <span class="chip">Target: <b>${(res.target_type||"").toUpperCase()}</b></span>
        <span class="chip">Elevation: <b>${fmt(res.elevation_m||0,0)} m</b></span>
      </div>
    </div>
  `;

  const cardEnergy = `
    <div class="card card--energy">
      <h3>Energy</h3>
      <div class="metrics">
        <div class="metric"><b>E (J)</b><div class="val">${fmt(res.energy.E_joules)}</div></div>
        <div class="metric"><b>Yield (Mt TNT)</b><div class="val">${fmt(res.energy.E_megatons_TNT, 1)}</div></div>
      </div>
    </div>
  `;

  const craterImp = impacts.crater
    ? `<div class="kv" style="margin-top:8px">
         <div class="k">Impact radii</div>
         <div class="v">
           Severe: ${fmtKM(impacts.crater.severe_radius_km,2)} ·
           Moderate: ${fmtKM(impacts.crater.moderate_radius_km,2)} ·
           Light: ${fmtKM(impacts.crater.light_radius_km,2)}
         </div>
       </div>` : "";

  const cardCrater = `
    <div class="card card--crater">
      <h3>Crater</h3>
      <div class="metrics">
        <div class="metric"><b>Type</b><div class="val">${res.crater.mode}</div></div>
        <div class="metric"><b>Transient dia.</b><div class="val">${fmt(res.crater.transient_diameter_m, 0)} m</div></div>
        <div class="metric"><b>Final dia.</b><div class="val">${fmt(res.crater.final_diameter_m, 0)} m</div></div>
        <div class="metric"><b>Final depth</b><div class="val">${fmt(res.crater.final_depth_m, 0)} m</div></div>
      </div>
      ${craterImp}
    </div>
  `;

  const cardSeismic = res.seismic ? (() => {
    const band = res.seismic.MMI_epicentral_band;
    const cls = mmiBadgeClassEn(band);
    const imp = impacts.seismic
      ? `<div class="kv" style="margin-top:8px">
           <div class="k">Reach (MMI)</div>
           <div class="v">
             Strong (≥VI): ${fmtKM(impacts.seismic.strong_km,0)} ·
             Moderate (≥IV–V): ${fmtKM(impacts.seismic.moderate_km,0)} ·
             Light (≥III–IV): ${fmtKM(impacts.seismic.light_km,0)}
           </div>
         </div>`
      : "";
    return `
      <div class="card card--seismic">
        <h3>Seismic</h3>
        <div class="metrics">
          <div class="metric"><b>Magnitude (M)</b><div class="val">${fmt(res.seismic.M, 2)}</div></div>
          <div class="metric"><b>MMI band</b><div class="val"><span class="badge ${cls}">${band}</span></div></div>
        </div>
        ${imp}
      </div>
    `;
  })() : "";

  const tsunamiRows = (res.tsunami_sample || []).map(r => `
    <tr>
      <td>${r.range_km} km</td>
      <td>${fmt(r.amplitude_m, 2)} m</td>
      <td>${fmt(r.arrival_time_min, 1)} min</td>
    </tr>`).join("");

  const tsunamiImp = impacts.tsunami
    ? `<div class="kv" style="margin-top:8px">
         <div class="k">Impact reach</div>
         <div class="v">
           Max height: ${fmtM(impacts.tsunami.max_height_m,2)} at ${fmtKM(impacts.tsunami.max_at_km,0)} ·
           Visible to cutoff (${impacts.tsunami.cutoff_m} m): ${fmtKM(impacts.tsunami.reach_km,0)}
         </div>
       </div>` : "";

  const cardTsunami = (res.target_type === "ocean")
    ? `
      <div class="card card--tsunami">
        <h3>Tsunami</h3>
        ${tsunamiImp}
        ${tsunamiRows
          ? `<table class="table" style="margin-top:8px">
               <thead><tr><th>Range</th><th>Height</th><th>Arrival</th></tr></thead>
               <tbody>${tsunamiRows}</tbody>
             </table>`
          : `<div class="kv" style="margin-top:8px"><div class="k">Note</div><div class="v">No sample rows (100/500/1000 km) available.</div></div>`
        }
      </div>
    ` : "";

  resultsEl.innerHTML = `
    ${hdr}
    <div class="results-grid">
      ${cardEnergy}
      ${cardCrater}
      ${cardSeismic}
      ${cardTsunami}
    </div>
  `;

  const t = (res.target_type || "land").toLowerCase();
  setSectionVisible(".card--crater", true);
  setSectionVisible(".card--tsunami", t === "ocean");
  setSectionVisible(".card--seismic", t === "land");
}

/* ===================== Simulation pipeline ===================== */
async function simulateWithCandidates({
  candidates, // optional pre-fetched list
  user_diameter_m,
  user_speed_m_s,
  theta_deg,
  target_type = "land",
  elevation_m = 0,
  water_depth_m = 4000,
  rho_impactor_kg_m3 = 3000,
  rho_target_kg_m3 = 2700,
}) {
  const cands = (Array.isArray(candidates) && candidates.length)
    ? candidates
    : await fetchPHACandidatesFromAPI({
        apiKey: API_KEY,
        maxPages: 1, pageSize: 200,
        maxCandidates: 200, rateMs: 120
      });

  const best = pickClosestByDV(cands, user_diameter_m, user_speed_m_s);

  // calculations
  const D = user_diameter_m, v = user_speed_m_s, th = theta_deg;
  const E = impactEnergyJ(D, rho_impactor_kg_m3, v);
  const Dtc = transientCraterDiameterM(D, rho_impactor_kg_m3, rho_target_kg_m3, v, th, target_type);
  const { mode, Dfr_m } = finalCraterDiameterM(Dtc);
  const d_fr = finalCraterDepthM(mode, Dfr_m, Dtc, elevation_m);

  const seismic =
    target_type === "land"
      ? {
          M: seismicMagnitude(E, elevation_m),
          MMI_epicentral_band: mmiBand(seismicMagnitude(E, elevation_m)),
        }
      : null;

  const tsunami_profile =
    target_type === "ocean"
      ? buildTsunamiProfile({ Dtc_m: Dtc, water_depth_m, elevation_m })
      : null;

  const sampleForTable = tsunami_profile
    ? tsunami_profile.filter(p => p.range_km === 100 || p.range_km === 500 || p.range_km === 1000)
    : null;

  return {
    target_type,
    elevation_m,
    inputs: { water_depth_m },
    matching: {
      name: best.neo?.name || best.neo?.name_limited || best.neo?.designation,
      approach_when_utc: best.whenIso,
      approach_v_km_s: best.v_api / 1000,
      approach_miss_distance_km: best.miss_km,
    },
    energy: {
      E_joules: E,
      E_megatons_TNT: E / 4.18e15,
    },
    crater: {
      mode,
      transient_diameter_m: Dtc,
      final_diameter_m: Dfr_m,
      final_depth_m: d_fr,
    },
    seismic,
    tsunami_profile,
    tsunami_sample: sampleForTable || [],
  };
}

/* ===================== Form wiring ===================== */
const form = document.getElementById("simForm");
if (form) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const center = (window.getImpactLatLng && window.getImpactLatLng()) || null;
    if (!center) {
      statusEl && (statusEl.textContent = "Please click the map to set the impact point first.");
      resultsEl && (resultsEl.innerHTML = "");
      clearAllLayers();
      return;
    }

    const f = new FormData(form);

    // robust global reads
    let autoType = (window.targetType ?? "").toString().toLowerCase().trim();
    const rawElev = window.impactElevation ?? null;
    const elevNum = Number.parseFloat(rawElev);
    const elevation = Number.isFinite(elevNum) ? elevNum : 0;
    if (!autoType) autoType = elevation < 0 ? "ocean" : "land";

    const user = {
      user_diameter_m: Number(f.get("diameter")),
      user_speed_m_s : Number(f.get("speed")),
      theta_deg      : Number(f.get("theta")),
      target_type    : autoType,
      elevation_m    : elevation,
      water_depth_m  : autoType === "ocean" ? 4000 : null,
    };

    statusEl && (statusEl.textContent = `Fetching candidates | Target: ${autoType} | Elevation: ${fmt(elevation,0)} m`);
    resultsEl && (resultsEl.innerHTML = "");
    clearAllLayers();

    try {
      const candidates = Array.isArray(window.neowsList) ? window.neowsList : null;
      const res = await simulateWithCandidates({ candidates, ...user });

      statusEl && (statusEl.textContent = `Done ✅  |  Target: ${res.target_type}  |  Elev: ${fmt(elevation, 0)} m`);
      renderResult(res);

      const centerLatLng = (window.google && new google.maps.LatLng(center.lat, center.lng)) || center;
      drawAllLayers(res, centerLatLng);

    } catch (err) {
      console.error(err);
      statusEl && (statusEl.textContent = "Error: " + (err.message || err));
      clearAllLayers();
    }
  });
}

/* ===================== Init ===================== */
window.addEventListener("DOMContentLoaded", () => {
  ensureResultStyles();
  ensureFilterBar();
});
