import { simulateWithClosestPHA } from "./pha-match-and-sim.js";

// 1) neowsList: NeoWs /neo/browse(/?is_potentially_hazardous=true) 등을 호출해
//    응답 객체들을 배열로 준비 (Earth 접근 포함)
const result = simulateWithClosestPHA({
  neowsList,
  user_diameter_m: 180,      // m
  user_speed_m_s: 21000,     // m/s
  theta_deg: 35,             // ★ 사용자 입력 입사각
  target_type: "ocean",      // or "rock"
  water_depth_m: 3500
});

console.log(JSON.stringify(result, null, 2));
