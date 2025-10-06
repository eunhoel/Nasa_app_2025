// js/asteroidOrbits.js
import * as THREE from "https://unpkg.com/three@0.127.0/build/three.module.js";

const ASTEROIDS_JSON = new URL("./orbits_points.json", import.meta.url).href;

const defaults = {
  sphereSize: 0.5,       // 소행성 구체 크기(작게)
  stepPerFrame: 1,
  lineOpacity: 0.28,     // 라인 연하게
  targetRadius: 60,      // 소행성대 전체 크기 축소
  showHelpers: false,    // 디버그 헬퍼/점구름 OFF
  pointsHelperSize: 4,
  lockCenterToOrigin: true,
  drawBounds: false,     // 초록색 바운딩 박스 OFF
  drawRefRing: false,    // 파란 레퍼런스 링 OFF
};

let settings = { ...defaults };
let group = null;
let objects = []; // {name, mesh, line, points:Vector3[], idx}
let lines = [];   // 라인만 따로 토글하기 위해
let cloud = null; // 점구름
let helpers = null; // ref ring / bounds helpers container

function dispose(obj) {
  obj?.traverse?.(o => {
    o.geometry?.dispose?.();
    if (Array.isArray(o.material)) o.material.forEach(m => m.dispose?.());
    else o.material?.dispose?.();
  });
}

async function loadJSON() {
  console.time("[asteroids] fetch json");
  const res = await fetch(ASTEROIDS_JSON, { cache: "no-store" });
  console.log("[asteroids] fetch status:", res.status, res.statusText);
  if (!res.ok) throw new Error(`orbits_points.json load failed: ${res.status} ${res.statusText}`);
  const data = await res.json();
  console.timeEnd("[asteroids] fetch json");

  const names = Object.keys(data || {});
  if (!names.length) throw new Error("JSON ok but no keys");
  const first = data[names[0]];
  if (!Array.isArray(first) || !Array.isArray(first[0]) || first[0].length < 3)
    throw new Error("JSON must be {name:[[x,y,z],...]}");

  // 샘플 범위
  const flat = first.flat().map(Number).filter(Number.isFinite);
  const min = Math.min(...flat), max = Math.max(...flat);
  console.log("[asteroids] sample size:", first.length, "min/max:", min, max);

  // NaN/비정상 좌표 제거
  for (const k of names) {
    data[k] = data[k].filter(a => a && isFinite(a[0]) && isFinite(a[1]) && isFinite(a[2]));
  }
  return data;
}

function computeBounds(raw) {
  let minX=Infinity,minY=Infinity,minZ=Infinity;
  let maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for (const k in raw) {
    for (const p of raw[k]) {
      const [x,y,z] = p.map(Number);
      if (!isFinite(x) || !isFinite(y) || !isFinite(z)) continue;
      if (x<minX) minX=x; if (y<minY) minY=y; if (z<minZ) minZ=z;
      if (x>maxX) maxX=x; if (y>maxY) maxY=y; if (z>maxZ) maxZ=z;
    }
  }
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2, cz=(minZ+maxZ)/2;
  const dx=(maxX-minX), dy=(maxY-minY), dz=(maxZ-minZ);
  const radius=Math.max(dx,dy,dz)/2 || 1;
  return {center:[cx,cy,cz], radius, min:[minX,minY,minZ], max:[maxX,maxY,maxZ]};
}

function normalizeScale(raw, targetRadius, lockCenterToOrigin) {
  const {center:[cx,cy,cz], radius} = computeBounds(raw);
  const scale = targetRadius / radius;
  console.log("[asteroids] normalize:", {radius, scale, center:[cx,cy,cz]});

  const out = {};
  for (const k in raw) {
    out[k] = raw[k].map(([x,y,z]) => [
      (x - (lockCenterToOrigin ? cx : 0)) * scale,
      (y - (lockCenterToOrigin ? cy : 0)) * scale,
      (z - (lockCenterToOrigin ? cz : 0)) * scale,
    ]);
  }
  return out;
}

function forceVisible(root) {
  root.visible = true;
  root.traverse(o => o.visible = true);
}

function addHelpers(parent) {
  if (!settings.showHelpers) return;
  helpers = new THREE.Group();
  helpers.name = "AsteroidHelpers";
  parent.add(helpers);

  if (settings.drawRefRing) {
    // 기준 링(Y=0 평면) — targetRadius 반경 확인
    const R = settings.targetRadius;
    const ringGeo = new THREE.RingGeometry(R-0.8, R+0.8, 128);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x8888ff, side: THREE.DoubleSide, transparent:true, opacity:0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI/2;
    ring.name = "RefRing";
    helpers.add(ring);
  }
}

function buildFromData(scene, data) {
  group = new THREE.Group();
  group.name = "AsteroidsGroup";
  scene.add(group);
  addHelpers(group);

  const palette = [0xff5555, 0x55ff55, 0x5599ff, 0xffcc55, 0xff55ff, 0x00e5ff, 0xff7aa2];
  let colorIdx = 0;

  const allPts = [];

  for (const name of Object.keys(data)) {
    const pts = data[name].map(([x,y,z]) => new THREE.Vector3(x,y,z));
    if (!pts.length) { console.warn("[asteroids] empty:", name); continue; }

    // 궤도 라인
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const m = new THREE.LineBasicMaterial({
      color: palette[colorIdx++ % palette.length],
      transparent: true,
      opacity: settings.lineOpacity,
      depthWrite: false,   // ← 행성 가리지 않도록 z-buffer 기록 안 함
      depthTest: true,
    });
    const line = new THREE.LineLoop(g, m);
    line.name = `asteroid-orbit-${name}`;
    group.add(line);
    lines.push(line);

    // 소행성 본체 — 크게, 밝게
    const sg = new THREE.SphereGeometry(settings.sphereSize, 16, 16);
    const sm = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const mesh = new THREE.Mesh(sg, sm);
    mesh.name = `asteroid-${name}`;
    mesh.position.copy(pts[0]);
    group.add(mesh);

    objects.push({ name, mesh, line, points: pts, idx: 0 });

    if (settings.showHelpers) {
      // 첫 점에 마커(마젠타) 찍기 — 위치 확인용
      const mg = new THREE.SphereGeometry(Math.max(0.6, settings.sphereSize*0.6), 12, 12);
      const mm = new THREE.MeshBasicMaterial({ color: 0xff00ff });
      const marker = new THREE.Mesh(mg, mm);
      marker.position.copy(pts[0]);
      marker.name = `marker-${name}`;
      group.add(marker);
    }

    if (settings.showHelpers) allPts.push(...pts);
  }

  // 점구름
  if (settings.showHelpers && allPts.length) {
    const pos = new Float32Array(allPts.length * 3);
    for (let i=0;i<allPts.length;i++){
      const p=allPts[i];
      pos[i*3+0]=p.x; pos[i*3+1]=p.y; pos[i*3+2]=p.z;
    }
    const gg = new THREE.BufferGeometry();
    gg.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const mm = new THREE.PointsMaterial({ size: settings.pointsHelperSize, sizeAttenuation:false, color:0xffffff });
    cloud = new THREE.Points(gg, mm);
    cloud.name = "AsteroidPointsCloud";
    group.add(cloud);
  }

  // 바운딩 표시
  if (settings.showHelpers && settings.drawBounds) {
    const box = new THREE.Box3().setFromObject(group);
    const helper = new THREE.Box3Helper(box, 0x00ff88);
    helper.name = "BoundsBox";
    helpers.add(helper);
  }

  forceVisible(group);
  console.log("[asteroids] build ok:", { count: objects.length });
}

export async function initAsteroids(scene, opts={}) {
  settings = { ...defaults, ...opts };

  // clean
  if (group) { dispose(group); scene.remove(group); group=null; }
  objects.length = 0;
  lines.length = 0;
  cloud = null;
  helpers = null;

  let raw;
  try {
    raw = await loadJSON();
  } catch (e) {
    console.error("[asteroids] JSON error:", e);
    return;
  }

  const norm = normalizeScale(raw, settings.targetRadius, !!settings.lockCenterToOrigin);
  buildFromData(scene, norm);
}

export function updateAsteroids(speedScale=1) {
  if (!objects.length) return;
  const step = (settings.stepPerFrame|0) * Math.max(0, speedScale);
  if (!step) return;
  for (const o of objects) {
    o.idx = (o.idx + step) % o.points.length;
    o.mesh.position.copy(o.points[o.idx]);
  }
}

export function setAsteroidVisible(v=true) {
  if (!group) return;
  group.children.forEach(ch => {
    if (ch.name?.startsWith("asteroid-") || ch.name?.startsWith("marker-")) ch.visible = !!v;
  });
}

export function setAsteroidPathVisible(v=true) {
  if (!group) return;
  lines.forEach(ln => ln.visible = !!v);
  if (cloud) cloud.visible = !!v;
}

export function setAsteroidSpeed(step=1) {
  settings.stepPerFrame = step|0;
}


