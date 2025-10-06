
let map;
let impactMarker = null;

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 40.1215, lng: -100.4503 },
    zoom: 6,
  });

  // 지도 클릭 → 마커 없을 때만 생성
  map.addListener("click", (e) => {
    if (!impactMarker) {
      impactMarker = new google.maps.Marker({
        position: e.latLng,
        map,
        title: "충돌 지점",
      });
      console.log(`마커 고정 좌표: ${e.latLng.lat()}, ${e.latLng.lng()}`);
      checkElevation(e.latLng.lat(), e.latLng.lng());
    }
  });
}


function checkElevation(lat, lng) {
  const elevator = new google.maps.ElevationService();
  const location = new google.maps.LatLng(lat, lng);

  elevator.getElevationForLocations(
    { locations: [location] },
    (results, status) => {
      if (status !== google.maps.ElevationStatus.OK) {
        updateResult("Failed to get elevation data", "orange");
        return;
      }

      const first = results && results[0];
      if (!first || typeof first.elevation !== "number") {
        updateResult("No elevation value in response", "orange");
        return;
      }

      const elev = first.elevation; // m (해양이면 보통 음수)
      const isOcean = elev < 0;

      // 전역 상태 업데이트 (sim.js에서 사용)
      window.impactElevation = elev;
      window.targetType = isOcean ? "ocean" : "land";
      window.getImpactLatLng = () => ({ lat, lng }); // 마커 좌표 제공

      // 화면 메시지 (한 번만)
      const msg = `Location is ${isOcean ? "OCEAN" : "LAND"}\nElevation: ${elev}m`;
      updateResult(msg, isOcean ? "blue" : "green");

      const resultEl = document.getElementById("result");
      if (resultEl) {
        resultEl.textContent =
          `Location is ${isOcean ? "OCEAN" : "LAND"}  Elevation: ${elev} m`;
      }
    }
  );
}




// 결과를 HTML 화면에 업데이트하는 함수
function updateResult(message, color) {
  const resultDiv = document.getElementById("result");
  resultDiv.textContent = message;
  resultDiv.style.color = color;
}

// Google Maps API callback이 찾도록 
// 역에 등록
window.initMap = initMap;
window.getMap = () => map || null;
window.getImpactLatLng = () => (impactMarker ? impactMarker.getPosition() : null);
