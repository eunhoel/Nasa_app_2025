// pha-match-and-sim.js
// NeoWs PHA 배열 → Earth 접근 후보 추출 → 사용자 (D, v, θ)와 가장 유사한 접근 선택 → 시뮬레이션

const G = 9.81;

// ---------- 유틸 ----------
const mean = (a,b)=> (Number(a)+Number(b))/2;
const toMS = kmps => Number(kmps)*1000;
const pickDate = (s)=> new Date((s || "").replace(" ", "T") + "Z");
const safeNum = (x,fb=NaN)=> (x==null?fb:Number(x));

// ---------- 후보 추출: PHA + Earth 접근만 ----------
export function extractPHACandidates(neowsList) {
  const rows = [];
  for (const neo of neowsList) {
    if (!neo?.is_potentially_hazardous_asteroid) continue;
    const diam = neo?.estimated_diameter?.meters;
    if (!diam) continue;
    const D_api = mean(diam.estimated_diameter_min, diam.estimated_diameter_max); // meters

    const earthApproaches = (neo.close_approach_data||[]).filter(
      d => (d.orbiting_body||"").toLowerCase()==="earth"
    );
    if (earthApproaches.length===0) continue;

    for (const app of earthApproaches) {
      const v_api = toMS(app?.relative_velocity?.kilometers_per_second || NaN);
      const when = app.close_approach_date_full || app.close_approach_date;
      rows.push({
        neo,
        approach: app,
        D_api,
        v_api,
        when: when ? pickDate(when).toISOString() : null,
        miss_km: safeNum(app?.miss_distance?.kilometers),
        moid_au: safeNum(neo?.orbital_data?.minimum_orbit_intersection),
        orbit_uncertainty: safeNum(neo?.orbital_data?.orbit_uncertainty, 9)
      });
    }
  }
  return rows;
}

// ---------- 유사도 점수 (직경·속도) ----------
function scoreDV(userD_m, userV_m_s, D_api, v_api, {wD=1.0, wV=0.7, vScale=5000} = {}) {
  const dD = Math.abs(Math.log(userD_m) - Math.log(D_api));
  const dV = Math.abs(userV_m_s - v_api) / vScale;
  return wD*dD + wV*dV;
}

// ---------- 최적 후보 선택 ----------
export function pickClosestPHAByDV(candidates, userD_m, userV_m_s, opts={}) {
  const scored = candidates.map(c => ({
    ...c,
    score: scoreDV(userD_m, userV_m_s, c.D_api, c.v_api, opts)
  })).filter(c => Number.isFinite(c.score) && Number.isFinite(c.D_api) && Number.isFinite(c.v_api));

  if (scored.length===0) throw new Error("Earth 접근을 가진 PHA 후보가 없습니다.");

  // 우선순위: score → MOID 작음 → 접근시각이 현재와 가까움 → 궤도불확실성 낮음
  scored.sort((a,b)=>
    a.score - b.score ||
    (a.moid_au ?? 99) - (b.moid_au ?? 99) ||
    Math.abs(Date.now() - Date.parse(a.when||0)) - Math.abs(Date.now() - Date.parse(b.when||0)) ||
    a.orbit_uncertainty - b.orbit_uncertainty
  );

  return scored[0];
}

// ---------- Collins+ 2005 간이 스케일링 ----------
function impactEnergyJ(d_m, rho_i, v_m_s) {
  const volume = (Math.PI/6) * d_m**3;
  return 0.5 * rho_i * volume * v_m_s**2;
}

function transientCraterDiameterM(d_m, rho_i, rho_t, v_i, theta_deg, targetType="rock") {
  const C = (targetType==="ocean") ? 1.365 : 1.161;
  const sinTh = Math.max(Math.sin(theta_deg*Math.PI/180), 1e-3);
  return C * (rho_i/rho_t)**(1/3) * d_m**0.78 * v_i**0.44 * G**(-0.22) * sinTh**(1/3);
}

function finalCraterDiameterM(Dtc_m) {
  const Dtc_km = Dtc_m/1000;
  const Dc=3.2;
  if (Dtc_km<=2.56) return {mode:"simple", Dfr_m: 1.25*Dtc_km*1000};
  const Dfr_km = 1.17 * (Dtc_km**1.13) * (Dc**0.13);
  return {mode:"complex", Dfr_m: Dfr_km*1000};
}

function finalCraterDepthM(mode, Dfr_m, Dtc_m, elevation = 0) {
  // elevation을 기반으로 분화구 깊이를 조정 (단위: 미터)
  const elevation_factor = 1 + (elevation / 1000); // 고도가 1km 증가하면 영향 증가 (1%)
  
  if (mode === "simple") {
    const d_tc = Dtc_m / 2;
    const h_fr = 0.07 * (Dtc_m ** 4) / (Dfr_m ** 3 + 1e-9);
    const t_br = Math.min(0.1 * d_tc, d_tc);
    return Math.max(d_tc + h_fr - t_br, 0.2 * Dfr_m) * elevation_factor;
  }
  
  // 복잡한 분화구의 경우
  return 0.4 * ((Dfr_m / 1000) ** 0.3) * 1000 * elevation_factor;
}


function seismicMagnitude(E_J, elevation = 0) {
  // 고도에 따른 지진 에너지 영향 조정
  const elevation_factor = 1 + (elevation / 1000); // 1km 고도 증가 시 1% 영향 증가
  const adjusted_E_J = E_J * elevation_factor;
  return 0.67 * Math.log10(Math.max(adjusted_E_J, 1)) - 5.87;
}


function mmiBand(M) {
  if (M < 4) return "III–IV (약함)";
  if (M < 5) return "IV–V (약~보통)";
  if (M < 6) return "VI–VII (보통~강함)";
  if (M < 7) return "VII–VIII (강함~매우 강함)";
  if (M < 8) return "IX–X (격심)";
  if (M < 9) return "X–XI (파괴적)";
  return "XII (전면 파괴적)";
}

function tsunamiTable(Dtc_m, H_m, rangesKm = [100, 500, 1000], elevation = 0) {
  // 고도를 고려하여 쓰나미 영향을 수정
  const elevation_factor = 1 - (elevation / 5000); // 고도가 높으면 영향이 약해짐
  const h_tr = Dtc_m / 14.1 * elevation_factor; // 영향 크기 감소
  const R_rw = 0.75 * Dtc_m;
  const c = Math.sqrt(G * H_m);
  
  return rangesKm.map(R_km => {
    const r_m = R_km * 1000;
    const A = (r_m <= R_rw) ? h_tr : h_tr * (R_rw / r_m);
    const t_min = (r_m / c) / 60;
    return { range_km: R_km, amplitude_m: A, arrival_time_min: t_min };
  });
}


// ---------- 메인: 사용자 입력 + 가장 유사한 PHA로 시뮬 ----------
export function simulateWithClosestPHA({
  neowsList,
  user_diameter_m,
  user_speed_m_s,
  theta_deg,
  elevation = 0, // 고도 입력값
  target_type, // "land" 또는 "ocean"
  rho_target_kg_m3 = 2700, // 목표 물질 밀도 (암석 기본값)
  rho_impactor_kg_m3 = 3000, // 충돌체 밀도 (암석 기본값)
  matchWeights = { wD: 1.0, wV: 0.7, vScale: 5000 }
}) {
  const cands = extractPHACandidates(neowsList);
  const pick = pickClosestPHAByDV(cands, user_diameter_m, user_speed_m_s, matchWeights);

  const D = user_diameter_m;
  const v = user_speed_m_s;
  const th = theta_deg;
  const rho_i = rho_impactor_kg_m3;

  const E = impactEnergyJ(D, rho_i, v);
  const Dtc = transientCraterDiameterM(D, rho_i, rho_target_kg_m3, v, th, target_type);
  const { mode, Dfr_m } = finalCraterDiameterM(Dtc);
  const d_fr = finalCraterDepthM(mode, Dfr_m, Dtc);

  const M = seismicMagnitude(E);
  const tsunami = target_type === "ocean" ? tsunamiTable(Dtc, 4000) : null;  // 4000m로 가정한 해양 깊이

  return {
    matching: {
      score: pick.score,
      neo_reference_id: pick.neo?.neo_reference_id,
      name: pick.neo?.name || pick.neo?.name_limited || pick.neo?.designation,
      approach_when: pick.when,
      approach_v_km_s: (pick.v_api / 1000),
      approach_miss_distance_km: pick.miss_km,
      moid_au: pick.moid_au,
      orbit_uncertainty: pick.orbit_uncertainty,
      api_diameter_m: pick.D_api
    },
    inputs: {
      user_diameter_m,
      user_speed_m_s,
      theta_deg,
      elevation,
      target_type,
      rho_target_kg_m3,
      rho_impactor_kg_m3,
      water_depth_m: target_type === "ocean" ? 4000 : null
    },
    energy: {
      E_joules: E,
      E_megatons_TNT: E / 4.18e15
    },
    crater: {
      mode,
      transient_diameter_m: Dtc,
      final_diameter_m: Dfr_m,
      final_depth_m: d_fr
    },
    seismic: target_type === "land" ? {
      M,
      MMI_epicentral_band: mmiBand(M)
    } : null,
    tsunami: target_type === "ocean" ? tsunami : null
  };
}

// 쓰나미 결과 화면에 띄우는 부분
function displayTsunamiResults(tsunami) {
  if (!tsunami) return;
  
  const tsunamiContainer = document.getElementById('tsunami-results');
  
  tsunami.forEach(range => {
    const tsunamiDiv = document.createElement('div');
    tsunamiDiv.innerHTML = `
      <h3>쓰나미 정보</h3>
      <p>범위: ${range.range_km} km</p>
      <p>파도 높이: ${range.amplitude_m.toFixed(2)} m</p>
      <p>도달 시간: ${range.arrival_time_min.toFixed(2)} 분</p>
    `;
    tsunamiContainer.appendChild(tsunamiDiv);
  });
}

// 분화구 정보 화면에 띄우는 부분
function displayCraterResults(crater) {
  const craterContainer = document.getElementById('crater-results');
  const { mode, transient_diameter_m, final_diameter_m, final_depth_m } = crater;

  const craterDiv = document.createElement('div');
  craterDiv.innerHTML = `
    <h3>분화구 정보</h3>
    <p>유형: ${mode}</p>
    <p>일시 직경: ${transient_diameter_m.toFixed(2)} m</p>
    <p>최종 직경: ${final_diameter_m.toFixed(2)} m</p>
    <p>최종 깊이: ${final_depth_m.toFixed(2)} m</p>
  `;
  craterContainer.appendChild(craterDiv);
}

// 결과 화면에 출력
function displayResults(simulationResult) {
  // 기본 정보 출력
  const resultContainer = document.getElementById('simulation-results');
  resultContainer.innerHTML = `
    <h2>매칭된 PHA: ${simulationResult.matching.name}</h2>
    <p>접근 시각: ${simulationResult.matching.approach_when}</p>
    <p>접근 속도: ${simulationResult.matching.approach_v_km_s} km/s</p>
    <p>근접 거리: ${simulationResult.matching.approach_miss_distance_km} km</p>
    <p>에너지: ${simulationResult.energy.E_megatons_TNT} Mt TNT</p>
  `;

  // 분화구 정보
  displayCraterResults(simulationResult.crater);

  // 해양일 경우 쓰나미 결과도 출력
  displayTsunamiResults(simulationResult.tsunami);
}

export { displayResults };