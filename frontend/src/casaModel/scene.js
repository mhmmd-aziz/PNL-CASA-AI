import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import selSpermaUrl from '../assets/sel_sperma_3d.glb?url';
import { PARTS as BASE_PARTS, MX, CX, PW, PH, SCRW, SCREEN, FPS, UM, STAGE_TITLES, SIM_THRESHOLDS } from './parts';

// Simulasi layar pada model: 22 sperma buatan, bukan data pasien.
const SW = 512;
const SH = 320;
const CLS = { PR: '#5DCAA5', NP: '#EF9F27', IM: '#E24B4A' };
const PAL = ['#5DCAA5', '#EF9F27', '#E24B4A', '#85B7EB', '#ED93B1', '#AFA9EC', '#97C459', '#F0997B'];
const WHITE = 0xF1F3F6;
const DARK = 0x2A3139;
const METAL = 0xB9C0C8;
const UP = new THREE.Vector3(0, 1, 0);

const { progSpeed: PROG_SPEED, progLinearity: PROG_LINEARITY, immotileSpeed: IMMOTILE_SPEED, minObservations: MIN_OBSERVATIONS } = SIM_THRESHOLDS;

const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const dec = (n, d) => n.toFixed(d).replace('.', ',');
const font = (weight, size) => `${weight} ${size}px "Plus Jakarta Sans",sans-serif`;
const median = (values) => {
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (a, b, h) => new THREE.CylinderGeometry(a, b, h, 32);
const mat = (color, options) => new THREE.MeshStandardMaterial({ color, roughness: 0.42, metalness: 0.08, ...(options || {}) });

function textureFrom(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  return new THREE.CanvasTexture(canvas);
}

function createSimulation() {
  const sperm = [];
  for (let i = 0; i < 22; i += 1) {
    const type = i < 11 ? 0 : i < 16 ? 1 : 2;
    sperm.push({
      id: i + 1,
      t: type,
      bx: i === 0 ? 70 : Math.random() * SW,
      by: i === 0 ? 190 : 56 + Math.random() * 250,
      a: i === 0 ? 0.04 : Math.random() * 6.28,
      v: type === 0 ? 2 : type === 1 ? 0.5 : 0,
      amp: type === 2 ? 0 : type === 0 ? 1.5 : 2,
      ph: Math.random() * 6,
      x: 0,
      y: 0,
      tr: [],
      conf: (0.86 + Math.random() * 0.13).toFixed(2).replace('.', ','),
      cls: null,
      spd: 0,
      lin: 0,
    });
  }
  const counts = [];
  const heat = document.createElement('canvas');
  heat.width = SW;
  heat.height = SH;
  const hg = heat.getContext('2d');
  hg.fillStyle = '#0A0E12';
  hg.fillRect(0, 0, SW, SH);
  const sim = { sperm, counts, heat, stepNo: 0 };

  const pathLength = (tr) => {
    let total = 0;
    for (let k = 1; k < tr.length; k += 1) total += Math.hypot(tr[k][0] - tr[k - 1][0], tr[k][1] - tr[k - 1][1]);
    return total;
  };

  const classify = (s) => {
    const tr = s.tr;
    if (tr.length < MIN_OBSERVATIONS) {
      s.cls = null;
      return;
    }
    const duration = (tr.length - 1) / FPS;
    const path = pathLength(tr) * UM;
    const straight = Math.hypot(tr[tr.length - 1][0] - tr[0][0], tr[tr.length - 1][1] - tr[0][1]) * UM;
    s.spd = path / duration;
    s.lin = path > 0 ? straight / path : 0;
    s.cls = s.spd < IMMOTILE_SPEED ? 'IM' : s.spd >= PROG_SPEED && s.lin >= PROG_LINEARITY ? 'PR' : 'NP';
  };

  sim.step = () => {
    sim.stepNo += 1;
    for (const s of sperm) {
      s.ph += 0.6;
      if (s.t === 0) s.a += (Math.random() - 0.5) * 0.05;
      if (s.t === 1) s.a += (Math.random() - 0.5) * 1.2;
      s.bx += Math.cos(s.a) * s.v;
      s.by += Math.sin(s.a) * s.v;
      let wrapped = false;
      if (s.bx < 0) { s.bx = SW; wrapped = true; }
      if (s.bx > SW) { s.bx = 0; wrapped = true; }
      if (s.by < 44) { s.by = SH - 4; wrapped = true; }
      if (s.by > SH - 4) { s.by = 44; wrapped = true; }
      if (wrapped) s.tr = [];
      const offset = s.amp * Math.sin(s.ph);
      const jitter = s.t === 2 ? 0.05 : 0;
      s.x = s.bx - Math.sin(s.a) * offset + (Math.random() - 0.5) * jitter;
      s.y = s.by + Math.cos(s.a) * offset + (Math.random() - 0.5) * jitter;
      const prev = s.tr[s.tr.length - 1];
      s.tr.push([s.x, s.y]);
      if (s.tr.length > 45) s.tr.shift();
      classify(s);
      if (prev) {
        // Heatmap aplikasi: garis kuning di atas latar hitam
        hg.strokeStyle = '#F2C94C';
        hg.globalAlpha = 0.32;
        hg.lineWidth = 1.5;
        hg.beginPath();
        hg.moveTo(prev[0], prev[1]);
        hg.lineTo(s.x, s.y);
        hg.stroke();
        hg.globalAlpha = 1;
      }
    }
    if (sim.stepNo % 4 === 0) {
      hg.fillStyle = 'rgba(10,14,18,0.025)';
      hg.fillRect(0, 0, SW, SH);
    }
    counts.push(sperm.length - Math.floor(Math.random() * 4));
    if (counts.length > 120) counts.shift();
  };

  for (let i = 0; i < 60; i += 1) sim.step();
  return sim;
}

function drawSperm(g, s, color) {
  g.strokeStyle = color;
  g.lineWidth = 1.3;
  g.beginPath();
  g.moveTo(s.x, s.y);
  for (let k = 1; k <= 7; k += 1) {
    const back = k * 2.3;
    const wiggle = s.t === 2 ? 0 : Math.sin(s.ph - k * 0.8) * k * 0.5;
    g.lineTo(s.x - Math.cos(s.a) * back - Math.sin(s.a) * wiggle, s.y - Math.sin(s.a) * back + Math.cos(s.a) * wiggle);
  }
  g.stroke();
  g.fillStyle = color;
  g.beginPath();
  g.ellipse(s.x, s.y, 4.4, 2.7, s.a, 0, 6.28);
  g.fill();
}

function drawPath(g, tr, color, width, dash) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.setLineDash(dash || []);
  g.beginPath();
  g.moveTo(tr[0][0], tr[0][1]);
  for (let k = 1; k < tr.length; k += 1) g.lineTo(tr[k][0], tr[k][1]);
  g.stroke();
  g.setLineDash([]);
}

function motilitySummary(sperm) {
  let pr = 0;
  let np = 0;
  let im = 0;
  sperm.forEach((s) => {
    if (s.cls === 'PR') pr += 1;
    else if (s.cls === 'NP') np += 1;
    else if (s.cls === 'IM') im += 1;
  });
  const total = Math.max(1, pr + np + im);
  return { pr: Math.round((pr / total) * 100), np: Math.round((np / total) * 100), im: Math.round((im / total) * 100) };
}

function drawStage(g, mode, sim) {
  const { sperm, counts, heat } = sim;
  g.fillStyle = '#141B22';
  g.fillRect(0, 0, SW, SH);
  if (mode === 5) g.drawImage(heat, 0, 0);
  g.fillStyle = '#1B2530';
  g.fillRect(0, 0, SW, 32);
  g.font = font(600, 15);
  g.fillStyle = '#D3DDE6';
  g.fillText(STAGE_TITLES[mode], 12, 22);

  if (mode === 0) {
    g.fillStyle = '#7FB4FF';
    g.beginPath();
    g.arc(318, 16, 5, 0, 6.28);
    g.fill();
    g.fillStyle = '#D3DDE6';
    g.font = font(400, 13);
    g.fillText(`FPS ${FPS} (metadata)`, 330, 21);
  }

  if (mode === 3) {
    const med = median(counts);
    const areaUm2 = (640 * UM) * (480 * UM);
    const volumeMl = areaUm2 * 10 * 1e-12;
    const concentration = med / volumeMl / 1e6;
    const x0 = 20;
    const y0 = 60;
    const w = SW - 40;
    const h = 120;
    g.fillStyle = '#1B2530';
    g.fillRect(x0, y0, w, h);
    const barW = w / 120;
    counts.forEach((c, i) => {
      const barH = (c / 26) * h;
      g.fillStyle = '#F07F7F';
      g.globalAlpha = 0.75;
      g.fillRect(x0 + i * barW, y0 + h - barH, Math.max(1, barW - 1), barH);
    });
    g.globalAlpha = 1;
    const medY = y0 + h - (med / 26) * h;
    g.strokeStyle = '#ffffff';
    g.setLineDash([6, 4]);
    g.beginPath();
    g.moveTo(x0, medY);
    g.lineTo(x0 + w, medY);
    g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#ffffff';
    g.font = font(600, 12);
    g.fillText(`median ${dec(med, 1)}`, x0 + w - 86, medY - 6);
    g.fillStyle = '#9fb0bf';
    g.font = font(400, 12.5);
    g.fillText('Jumlah sperma terdeteksi per frame', x0, y0 - 8);
    const lines = [
      ['Median deteksi per frame', `${dec(med, 1)} sperma`],
      ['Bidang pandang', `640 × 480 px × ${dec(UM, 1)} µm/px`],
      ['Bilik', 'Makler 10 µm, tanpa pengenceran'],
      ['Estimasi konsentrasi', `≈ ${dec(concentration, 0)} juta/mL`],
    ];
    lines.forEach((line, i) => {
      const y = 212 + i * 25;
      g.fillStyle = '#9fb0bf';
      g.font = font(400, 14);
      g.fillText(line[0], 20, y);
      g.fillStyle = i === 3 ? '#F07F7F' : '#E6EDF3';
      g.font = font(i === 3 ? 700 : 600, 14);
      g.fillText(line[1], 250, y);
    });
    return;
  }

  if (mode === 4) {
    g.fillStyle = '#9fb0bf';
    g.font = font(400, 11.5);
    g.fillText(`PR: VCL ≥ ${PROG_SPEED} µm/s dan LIN ≥ ${dec(PROG_LINEARITY, 1)}   IM: VCL < ${IMMOTILE_SPEED} µm/s   NP: sisanya`, 12, 48);
  }

  for (const s of sperm) {
    if (mode === 4) {
      if (s.tr.length > 2) drawPath(g, s.tr, s.cls ? CLS[s.cls] : '#55606b', 1.2);
      drawSperm(g, s, s.cls ? CLS[s.cls] : '#8899aa');
      continue;
    }
    if (mode === 5) continue;
    if (mode === 2 && s.tr.length > 2) drawPath(g, s.tr, PAL[s.id % 8], 1.4);
    drawSperm(g, s, mode === 0 ? '#cfd5db' : '#eef2f5');
    if (mode === 1 || mode === 2) {
      const color = mode === 1 ? '#3FBF6F' : PAL[s.id % 8];
      g.strokeStyle = color;
      g.lineWidth = 1.3;
      g.strokeRect(s.x - 10, s.y - 10, 20, 20);
      g.fillStyle = color;
      g.font = font(400, 11);
      g.fillText(mode === 1 ? `sperma ${s.conf}` : `#${s.id}`, s.x - 10, s.y - 13);
    }
  }

  if (mode === 4) {
    const s = sperm[0];
    if (s.cls) {
      drawPath(g, [s.tr[0], s.tr[s.tr.length - 1]], '#ffffff', 1.4, [5, 4]);
      g.fillStyle = 'rgba(0,0,0,0.62)';
      g.fillRect(SW - 178, 58, 168, 92);
      g.font = font(600, 13.5);
      g.fillStyle = '#D3DDE6';
      g.fillText('Sperma #1', SW - 168, 78);
      g.font = font(400, 13.5);
      g.fillText(`VCL ${dec(s.spd, 0)} µm/s`, SW - 168, 100);
      g.fillText(`LIN ${dec(s.lin, 2)}`, SW - 168, 120);
      g.fillStyle = CLS[s.cls];
      g.font = font(700, 13.5);
      g.fillText(`Kelas: ${s.cls}`, SW - 168, 140);
    }
    const m = motilitySummary(sperm);
    g.fillStyle = 'rgba(0,0,0,0.62)';
    g.fillRect(8, SH - 30, 280, 24);
    g.font = font(600, 12.5);
    g.fillStyle = CLS.PR;
    g.fillText(`PR ${m.pr}%`, 18, SH - 13);
    g.fillStyle = CLS.NP;
    g.fillText(`NP ${m.np}%`, 100, SH - 13);
    g.fillStyle = CLS.IM;
    g.fillText(`IM ${m.im}%`, 182, SH - 13);
  }

  if (mode === 5) {
    g.fillStyle = 'rgba(0,0,0,0.62)';
    g.fillRect(8, SH - 30, 232, 24);
    g.font = font(600, 12.5);
    g.fillStyle = '#F2C94C';
    g.fillText('Garis kuning: lintasan sperma', 18, SH - 13);
  }
}

function paperTexture(kind) {
  return textureFrom(300, 400, (g, w, h) => {
    g.fillStyle = '#FFFFFF';
    g.fillRect(0, 0, w, h);
    g.fillStyle = '#122133';
    if (kind === 'review') {
      g.font = '700 20px sans-serif';
      g.fillText('Review analis', 18, 36);
      g.font = '13px sans-serif';
      g.fillStyle = '#4B5A69';
      g.fillText('Status: IN_PROGRESS', 18, 58);
      ['Video beranotasi diperiksa', 'Heatmap diperiksa', 'Deteksi keliru dikoreksi', 'Data makroskopis lengkap'].forEach((label, i) => {
        const y = 96 + i * 44;
        g.strokeStyle = '#3FAE6A';
        g.lineWidth = 2;
        g.strokeRect(18, y - 14, 18, 18);
        g.beginPath();
        g.moveTo(21, y - 5);
        g.lineTo(26, y);
        g.lineTo(34, y - 11);
        g.stroke();
        g.fillStyle = '#122133';
        g.font = '14px sans-serif';
        g.fillText(label, 46, y);
      });
      g.fillStyle = '#2F8F5B';
      g.fillRect(18, 300, 264, 46);
      g.fillStyle = '#FFFFFF';
      g.font = '700 14px sans-serif';
      g.textAlign = 'center';
      g.fillText('Kirim ke dokter', 150, 328);
      g.textAlign = 'left';
      return;
    }
    g.font = '700 18px sans-serif';
    g.fillText('Laporan pemeriksaan semen', 18, 34);
    g.font = '12px sans-serif';
    g.fillStyle = '#4B5A69';
    g.fillText('Contoh tampilan · Status: RELEASED', 18, 54);
    [['Volume', '2,5 mL'], ['Likuefaksi', '30 menit'], ['Viskositas', 'Normal'], ['pH', '7,6']].forEach((row, i) => {
      const y = 84 + i * 24;
      g.fillStyle = '#4B5A69';
      g.font = '13px sans-serif';
      g.fillText(row[0], 18, y);
      g.fillStyle = '#122133';
      g.font = '600 13px sans-serif';
      g.fillText(row[1], 150, y);
    });
    [['PR', 50, '#3FAE6A'], ['NP', 23, '#E8A33A'], ['IM', 27, '#D9534F']].forEach((bar, i) => {
      g.fillStyle = bar[2];
      g.fillRect(18 + i * 90, 262 - bar[1] * 1.2, 60, bar[1] * 1.2);
      g.fillStyle = '#122133';
      g.font = '12px sans-serif';
      g.fillText(`${bar[0]} ${bar[1]}%`, 22 + i * 90, 278);
    });
    g.fillStyle = '#122133';
    g.font = '700 12px sans-serif';
    g.fillText('Interpretasi dokter', 18, 304);
    g.fillStyle = '#D9E0E6';
    g.fillRect(18, 312, 264, 4);
    g.fillRect(18, 322, 200, 4);
    g.strokeStyle = '#2E5C9E';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(160, 366);
    g.bezierCurveTo(180, 340, 195, 380, 215, 352);
    g.bezierCurveTo(228, 338, 240, 372, 270, 356);
    g.stroke();
    g.fillStyle = '#4B5A69';
    g.font = '11px sans-serif';
    g.fillText('Dokter penanggung jawab', 150, 390);
  });
}

/**
 * Membangun scene 3D. Melempar error jika WebGL tidak tersedia.
 * hotspots: { [id]: HTMLElement } untuk titik label yang posisinya dihitung tiap frame.
 */
export function createCasaScene({ canvas, viewer, hotspots, onPick, animate = true }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(34, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a96a3, 0.85));
  const key = new THREE.DirectionalLight(0xffffff, 0.85);
  key.position.set(5, 9, 7);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xcfe3ff, 0.35);
  rim.position.set(-6, 4, -5);
  scene.add(rim);

  const sim = createSimulation();
  const parts = BASE_PARTS.map((p) => ({ ...p }));
  const byId = {};
  const allMeshes = [];
  parts.forEach((p) => {
    byId[p.id] = p;
    p.g = new THREE.Group();
    p.meshes = [];
    p.col = new THREE.Color(p.c);
    p.el = hotspots[p.id];
    scene.add(p.g);
    p.anchor = new THREE.Object3D();
    if (p.a) p.anchor.position.set(p.a[0], p.a[1], p.a[2]);
    p.g.add(p.anchor);
    if (p.kind === 'pivot') {
      p.pivot = new THREE.Group();
      p.g.add(p.pivot);
      p.pivot.add(p.anchor);
    }
  });

  function reg(id, mesh, parent) {
    const p = byId[id];
    mesh.userData.part = id;
    mesh.userData.e0 = mesh.material && mesh.material.emissive ? mesh.material.emissive.clone() : null;
    (parent || p.g).add(mesh);
    p.meshes.push(mesh);
    allMeshes.push(mesh);
    return mesh;
  }
  function mk(id, geometry, material, pos, rot, parent) {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(pos[0], pos[1], pos[2]);
    if (rot) mesh.rotation.set(rot[0], rot[1], rot[2]);
    return reg(id, mesh, parent);
  }

  // Mikroskop
  mk('mikroskop', box(1.9, 0.32, 2.3), mat(WHITE), [MX, 0.16, 0]);
  mk('mikroskop', box(1.92, 0.05, 2.32), mat(DARK), [MX, 0.335, 0]);
  mk('mikroskop', box(0.5, 2.9, 0.6), mat(WHITE), [MX, 1.75, -0.85]);
  mk('mikroskop', box(0.62, 0.5, 1.1), mat(WHITE), [MX, 3.05, -0.45]);
  [-1, 1].forEach((s) => {
    mk('mikroskop', cyl(0.27, 0.27, 0.16), mat(DARK, { roughness: 0.7 }), [MX + s * 0.33, 1.35, -0.85], [0, 0, Math.PI / 2]);
    mk('mikroskop', cyl(0.16, 0.16, 0.14), mat(METAL, { metalness: 0.6, roughness: 0.3 }), [MX + s * 0.48, 1.35, -0.85], [0, 0, Math.PI / 2]);
  });
  mk('mikroskop', cyl(0.3, 0.34, 0.14), mat(DARK), [MX, 0.4, 0.25]);
  const lampGlass = mk('mikroskop', cyl(0.22, 0.22, 0.04), mat(0xFFF1C2, { emissive: new THREE.Color(0xC98A1A), emissiveIntensity: 0.6 }), [MX, 0.48, 0.25]);
  mk('mikroskop', cyl(0.24, 0.2, 0.36), mat(DARK), [MX, 0.95, 0.25]);
  mk('mikroskop', new THREE.TorusGeometry(0.25, 0.035, 12, 40), mat(METAL, { metalness: 0.6, roughness: 0.3 }), [MX, 1.06, 0.25], [Math.PI / 2, 0, 0]);
  mk('mikroskop', cyl(0.37, 0.3, 0.16), mat(METAL, { metalness: 0.55, roughness: 0.32 }), [MX, 2.45, 0.25]);
  [0xE24B4A, 0xF2C230, 0x3FAE6A].forEach((band, i) => {
    const a = i * 2.094 + 0.6;
    const x = MX + Math.cos(a) * 0.2;
    const z = 0.25 + Math.sin(a) * 0.2;
    mk('mikroskop', cyl(0.075, 0.1, 0.48), mat(0xE6E9EC, { metalness: 0.45, roughness: 0.3 }), [x, 2.12, z]);
    mk('mikroskop', cyl(0.102, 0.102, 0.04), mat(band), [x, 2.22, z]);
  });
  mk('mikroskop', box(0.82, 0.46, 0.95), mat(WHITE), [MX, 2.78, 0.2]);
  [-1, 1].forEach((s) => {
    mk('mikroskop', cyl(0.085, 0.085, 0.55), mat(DARK), [MX + s * 0.17, 3.12, 0.62], [0.62, 0, 0]);
    mk('mikroskop', cyl(0.105, 0.105, 0.07), mat(0x1b2027, { roughness: 0.8 }), [MX + s * 0.17, 3.37, 0.8], [0.62, 0, 0]);
  });
  mk('mikroskop', cyl(0.12, 0.12, 0.62), mat(DARK), [MX, 3.2, 0.05]);
  mk('mikroskop', cyl(0.15, 0.15, 0.08), mat(METAL, { metalness: 0.6, roughness: 0.3 }), [MX, 3.52, 0.05]);

  // Stage dan bilik
  mk('stage', box(1.55, 0.1, 1.35), mat(DARK), [MX, 1.24, 0.25]);
  const heater = mk('stage', box(0.9, 0.05, 0.62), mat(0xEE6A36, { emissive: new THREE.Color(0x5a1a00), emissiveIntensity: 1 }), [MX, 1.315, 0.25]);
  mk('stage', box(0.78, 0.03, 0.3), mat(0xCDEAF7, { transparent: true, opacity: 0.72, roughness: 0.1 }), [MX, 1.355, 0.25]);
  mk('stage', cyl(0.11, 0.11, 0.012), mat(0xF6D59A, { transparent: true, opacity: 0.9 }), [MX, 1.375, 0.25]);
  mk('stage', box(0.34, 0.16, 0.24), mat(DARK), [MX + 0.56, 1.37, 0.75]);
  mk('stage', box(0.2, 0.07, 0.02), mat(0x7CF0B0, { emissive: new THREE.Color(0x1f7a4a) }), [MX + 0.56, 1.39, 0.875]);

  // Kamera
  mk('kamera', box(0.5, 0.42, 0.5), mat(0x30343A, { roughness: 0.35, metalness: 0.3 }), [MX, 3.78, 0.05]);
  mk('kamera', cyl(0.13, 0.13, 0.05), mat(0x4C8DF6, { metalness: 0.4 }), [MX, 3.78, 0.31], [Math.PI / 2, 0, 0]);
  const led = mk('kamera', new THREE.SphereGeometry(0.032, 14, 14), mat(0xff5a5a, { emissive: new THREE.Color(0xcc0000), emissiveIntensity: 1 }), [MX + 0.16, 3.92, 0.3]);
  mk('kamera', box(0.04, 0.07, 0.13), mat(0x111111), [MX + 0.27, 3.74, 0.05]);

  // Slide mikrometer untuk kalibrasi
  const rulerTexture = textureFrom(512, 160, (x) => {
    x.fillStyle = '#DDEFF8';
    x.fillRect(0, 0, 512, 160);
    x.strokeStyle = '#1d2630';
    x.lineWidth = 2;
    x.beginPath();
    x.moveTo(156, 80);
    x.lineTo(356, 80);
    x.stroke();
    for (let i = 0; i <= 20; i += 1) {
      const h = i % 10 === 0 ? 26 : i % 5 === 0 ? 18 : 11;
      x.beginPath();
      x.moveTo(156 + i * 10, 80);
      x.lineTo(156 + i * 10, 80 - h);
      x.stroke();
    }
    x.fillStyle = '#1d2630';
    x.font = '600 18px sans-serif';
    x.fillText('1 mm / 100', 196, 120);
  });
  mk('kalibrasi', box(1.0, 0.03, 0.32), new THREE.MeshStandardMaterial({ map: rulerTexture, roughness: 0.2 }), [MX + 1.1, 0.015, 1.55], [0, 0.25, 0]);

  // Tabung sampel dengan barcode
  const barcodeTexture = textureFrom(512, 128, (x, w, h) => {
    x.fillStyle = '#ffffff';
    x.fillRect(0, 0, w, h);
    x.fillStyle = '#2FB5A8';
    x.fillRect(0, 0, w, 22);
    x.fillStyle = '#111';
    let px = 40;
    while (px < 470) {
      const bw = 2 + Math.floor(Math.random() * 5);
      x.fillRect(px, 34, bw, 62);
      px += bw + 2 + Math.floor(Math.random() * 4);
    }
    x.font = '600 16px sans-serif';
    x.fillText('SMP-CONTOH', 200, 118);
  });
  mk('sampel', new THREE.CylinderGeometry(0.2, 0.18, 0.42, 32), mat(0xF4F7F9, { transparent: true, opacity: 0.8, roughness: 0.2 }), [-0.75, 0.21, 0.6]);
  mk('sampel', new THREE.CylinderGeometry(0.17, 0.16, 0.18, 32), mat(0xEFE6C8, { transparent: true, opacity: 0.9 }), [-0.75, 0.1, 0.6]);
  mk('sampel', new THREE.CylinderGeometry(0.215, 0.215, 0.09, 32), mat(0x2FB5A8), [-0.75, 0.465, 0.6]);
  mk('sampel', new THREE.CylinderGeometry(0.203, 0.203, 0.16, 32, 1, true), new THREE.MeshStandardMaterial({ map: barcodeTexture, roughness: 0.6, side: THREE.DoubleSide }), [-0.75, 0.27, 0.6]);

  // Tumpukan dataset
  [0, 1, 2].forEach((i) => {
    mk('dataset', cyl(0.36, 0.36, 0.17), mat(0xE86FA6, { roughness: 0.35 }), [0.2, 0.1 + i * 0.23, 1.3]);
    mk('dataset', cyl(0.365, 0.365, 0.03), mat(0x8E2F5C), [0.2, 0.2 + i * 0.23, 1.3]);
  });

  // Komputer
  mk('laptop', box(2.6, 0.08, 1.75), mat(0xC9CED4, { metalness: 0.35, roughness: 0.35 }), [CX, 0.04, 0.05]);
  mk('laptop', box(2.2, 0.012, 0.75), mat(DARK), [CX, 0.086, -0.2]);
  mk('laptop', box(0.8, 0.01, 0.45), mat(0xB3B9C0, { metalness: 0.3 }), [CX, 0.085, 0.55]);
  mk('laptop', box(2.6, 1.65, 0.06), mat(0x2B3038, { roughness: 0.5 }), [CX, 0.9, -0.8]);
  const lapScreen = new THREE.Mesh(new THREE.PlaneGeometry(SCRW, (SCRW * PH) / PW), new THREE.MeshBasicMaterial());
  lapScreen.position.set(SCREEN[0], SCREEN[1], SCREEN[2] - 0.003);
  reg('laptop', lapScreen);

  // Kertas review dan laporan
  function buildPaper(id, texture, boardColor) {
    const p = byId[id];
    mk(id, box(0.66, 0.03, 0.88), mat(boardColor, { roughness: 0.8 }), [0, 0, 0], null, p.pivot);
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.74), new THREE.MeshBasicMaterial({ map: texture }));
    paper.rotation.x = -Math.PI / 2;
    paper.position.set(0, 0.018, 0.04);
    reg(id, paper, p.pivot);
    if (id === 'review') mk(id, box(0.24, 0.05, 0.07), mat(METAL, { metalness: 0.6 }), [0, 0.03, -0.38], null, p.pivot);
    p.anchor.position.set(0.36, 0.02, -0.44);
  }
  buildPaper('review', paperTexture('review'), 0xCFAE7E);
  buildPaper('laporan', paperTexture('laporan'), 0xE4E9EE);

  // Panel tahap analisis
  const stages = parts.filter((p) => p.kind === 'stage').sort((a, b) => a.stage - b.stage);
  stages.forEach((p) => {
    const stageCanvas = document.createElement('canvas');
    stageCanvas.width = SW;
    stageCanvas.height = SH;
    p.ctx = stageCanvas.getContext('2d');
    p.tex = new THREE.CanvasTexture(stageCanvas);
    p.panel = new THREE.Group();
    p.g.add(p.panel);
    const frame = new THREE.Mesh(box(PW + 0.1, PH + 0.1, 0.04), mat(0x20262E, { roughness: 0.5 }));
    frame.position.z = -0.025;
    reg(p.id, frame, p.panel);
    const edge = new THREE.Mesh(box(PW + 0.14, PH + 0.14, 0.02), new THREE.MeshBasicMaterial({ color: p.c }));
    edge.position.z = -0.05;
    p.panel.add(edge);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshBasicMaterial({ map: p.tex }));
    reg(p.id, plane, p.panel);
    const top = p.grid[1] > 3;
    p.anchor.position.set(0, top ? PH / 2 + 0.1 : -PH / 2 - 0.1, 0);
    p.side = 'right';
    p.panel.add(p.anchor);
    drawStage(p.ctx, p.stage, sim);
    p.tex.needsUpdate = true;
  });

  // Kabel kamera ke komputer
  const cableMaterial = mat(0x1f242b, { roughness: 0.8 });
  let cableMesh = null;
  function buildCable() {
    const start = new THREE.Vector3(MX + 0.3, 3.74, 0.05).add(byId.kamera.g.position);
    const end = new THREE.Vector3(CX - 1.3, 0.06, -0.15);
    const p1 = start.clone().add(new THREE.Vector3(0.75, 0.2, -0.4));
    const p2 = start.clone().lerp(end, 0.6).add(new THREE.Vector3(0, 0.1, -0.8));
    const geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([start, p1, p2, end]), 64, 0.03, 8, false);
    if (cableMesh) {
      cableMesh.geometry.dispose();
      cableMesh.geometry = geometry;
    } else {
      cableMesh = new THREE.Mesh(geometry, cableMaterial);
      reg('laptop', cableMesh);
    }
  }

  // Panah alur antartahap
  const flowMaterial = new THREE.MeshBasicMaterial({ color: 0x7B8896, transparent: true, opacity: 0 });
  const segGeometry = new THREE.CylinderGeometry(0.018, 0.018, 1, 8);
  const headGeometry = new THREE.ConeGeometry(0.07, 0.18, 16);
  const flows = [
    ['dataset', 'deteksi'], ['rekam', 'deteksi'], ['deteksi', 'lacak'], ['lacak', 'konsentrasi', 'wrap'],
    ['konsentrasi', 'motilitas'], ['motilitas', 'heatmap'], ['heatmap', 'review'], ['review', 'laporan'],
  ].map((f) => {
    const segs = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(segGeometry, flowMaterial);
      scene.add(m);
      return m;
    });
    const head = new THREE.Mesh(headGeometry, flowMaterial);
    scene.add(head);
    return { from: f[0], to: f[1], wrap: f[2] === 'wrap', segs, head };
  });
  const setSeg = (m, a, b) => {
    const d = b.clone().sub(a);
    const length = d.length();
    if (length < 1e-4) { m.visible = false; return; }
    m.visible = true;
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.scale.set(1, length, 1);
    m.quaternion.setFromUnitVectors(UP, d.normalize());
  };
  const centerOf = (p) => {
    const v = new THREE.Vector3();
    if (p.panel) return p.panel.getWorldPosition(v);
    if (p.pivot) return p.pivot.getWorldPosition(v);
    const c = p.fc || p.a;
    return v.set(c[0], c[1], c[2]).add(p.g.position);
  };
  const halfOf = (p) => {
    if (p.panel) return [PW / 2 + 0.14, PH / 2 + 0.14];
    if (p.pivot) return [(0.66 * p.s1) / 2 + 0.12, (0.88 * p.s1) / 2 + 0.12];
    return [0.5, 0.45];
  };
  const clipDist = (dir, h) => Math.min(h[0] / (Math.abs(dir.x) || 1e-6), h[1] / (Math.abs(dir.y) || 1e-6));
  function updateFlows() {
    flows.forEach((f) => {
      const A = byId[f.from];
      const Bp = byId[f.to];
      const a = centerOf(A);
      const b = centerOf(Bp);
      let pts;
      if (f.wrap) {
        const ha = halfOf(A);
        const hb = halfOf(Bp);
        const ya = a.y - ha[1];
        const yb = b.y + hb[1];
        const gy = (ya + yb) / 2;
        pts = [new THREE.Vector3(a.x, ya, a.z), new THREE.Vector3(a.x, gy, a.z), new THREE.Vector3(b.x, gy, b.z), new THREE.Vector3(b.x, yb, b.z)];
      } else {
        const dir = b.clone().sub(a).normalize();
        pts = [a.clone().add(dir.clone().multiplyScalar(clipDist(dir, halfOf(A)))), b.clone().sub(dir.clone().multiplyScalar(clipDist(dir, halfOf(Bp))))];
      }
      const last = pts[pts.length - 1];
      const prev = pts[pts.length - 2];
      const dir = last.clone().sub(prev).normalize();
      const baseP = last.clone().sub(dir.clone().multiplyScalar(0.17));
      const ps = pts.slice(0, -1).concat([baseP]);
      f.segs.forEach((m, i) => {
        if (i < ps.length - 1) setSeg(m, ps[i], ps[i + 1]);
        else m.visible = false;
      });
      f.head.position.copy(last.clone().sub(dir.clone().multiplyScalar(0.09)));
      f.head.quaternion.setFromUnitVectors(UP, dir);
    });
  }

  // Bayangan lembut di lantai
  const shadowTexture = textureFrom(128, 128, (x) => {
    const gr = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, 'rgba(18,33,51,0.3)');
    gr.addColorStop(1, 'rgba(18,33,51,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 128, 128);
  });
  [[MX, 0, 4.2, 3.4], [CX, 0, 4.0, 3.0]].forEach((s) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s[2], s[3]), new THREE.MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.set(s[0], 0.001, s[1]);
    scene.add(m);
  });

  // Kamera dan interaksi
  let theta = 0.3;
  let phi = 1.15;
  let eCur = 0;
  let eTarget = 0;
  let anim = animate;
  let screenStage = 1;
  let selectedId = 'deteksi';
  const target = new THREE.Vector3();
  const baseR = () => {
    const aspect = viewer.clientWidth / Math.max(1, viewer.clientHeight);
    // Layar sempit (ponsel): menjauh sebanding dengan lebar agar label di tepi tidak terpotong
    if (aspect < 0.9) return Math.min(40, Math.max(22, 20.5 / aspect));
    return aspect < 1.25 ? 17.5 : aspect < 1.6 ? 14.5 : 13;
  };
  function placeCam(e) {
    const R = baseR() + e * (baseR() * 0.42);
    // Saat tampilan awal model diturunkan sedikit agar tidak menabrak teks pengantar
    target.set(0.4 + e * 1.6, 1.55 + 0.85 * (1 - e) + e * 1.55, 0.1 - e * 0.3);
    cam.position.set(target.x + R * Math.sin(phi) * Math.sin(theta), target.y + R * Math.cos(phi), target.z + R * Math.sin(phi) * Math.cos(theta));
    cam.lookAt(target);
  }
  function resize() {
    const w = viewer.clientWidth;
    const h = viewer.clientHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    cam.aspect = w / Math.max(1, h);
    cam.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(viewer);
  resize();

  let down = null;
  let moved = 0;
  const ray = new THREE.Raycaster();
  const isShown = (m) => {
    let o = m;
    while (o) {
      if (!o.visible) return false;
      o = o.parent;
    }
    return true;
  };
  const onPointerDown = (e) => {
    down = { x: e.clientX, y: e.clientY, type: e.pointerType };
    moved = 0;
    canvas.classList.add('c3d-drag');
  };
  const onPointerMove = (e) => {
    if (!down) return;
    const dx = e.clientX - down.x;
    const dy = e.clientY - down.y;
    moved += Math.abs(dx) + Math.abs(dy);
    theta -= dx * 0.008;
    if (down.type === 'mouse') phi = Math.min(1.5, Math.max(0.45, phi - dy * 0.006));
    down.x = e.clientX;
    down.y = e.clientY;
  };
  const onPointerUp = (e) => {
    if (!down) return;
    canvas.classList.remove('c3d-drag');
    if (moved < 6 && e.target === canvas) {
      const r = canvas.getBoundingClientRect();
      ray.setFromCamera({ x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 }, cam);
      const hit = ray.intersectObjects(allMeshes.filter(isShown), false)[0];
      if (hit) onPick(hit.object.userData.part);
    }
    down = null;
  };
  const onPointerCancel = () => {
    down = null;
    canvas.classList.remove('c3d-drag');
  };
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);

  // Loop animasi
  const v = new THREE.Vector3();
  let frame = 0;
  let clock = 0;
  let lastE = -1;
  let lastScreen = -1;
  let running = false;
  let rafId = 0;
  let disposed = false;

  // Model 3D sel sperma dari berkas GLB; titik labelnya baru tampil setelah model termuat
  const selPart = byId.sel;
  selPart.pending = true;
  let cell = null;
  const disposeTree = (root) => root.traverse((obj) => {
    if (obj.geometry) obj.geometry.dispose();
    const list = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
    list.forEach((m) => m.dispose());
  });
  new GLTFLoader().loadAsync(selSpermaUrl).then((gltf) => {
    if (disposed) {
      disposeTree(gltf.scene);
      return;
    }
    const model = gltf.scene;
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    model.position.copy(center).multiplyScalar(-1);
    const spin = new THREE.Group();
    spin.scale.setScalar(selPart.length / size.x);
    spin.add(model);
    const holder = new THREE.Group();
    holder.position.set(selPart.pos[0], selPart.pos[1], selPart.pos[2]);
    holder.rotation.z = selPart.tilt;
    holder.add(spin);
    selPart.g.add(holder);
    model.traverse((obj) => {
      if (!obj.isMesh) return;
      // Berkas tidak menyertakan normal; hitung agar permukaan tampak halus
      obj.geometry.computeVertexNormals();
      const material = obj.material;
      material.flatShading = false;
      if (material.transparent) {
        material.depthWrite = false;
        obj.renderOrder = 2;
      }
      material.needsUpdate = true;
      obj.userData.part = 'sel';
      obj.userData.e0 = material.emissive ? material.emissive.clone() : null;
      selPart.meshes.push(obj);
      allMeshes.push(obj);
    });
    const tail = model.getObjectByName('Ekor');
    cell = { holder, spin, tailAttr: tail ? tail.geometry.attributes.position : null, tailOrig: null };
    if (cell.tailAttr) cell.tailOrig = cell.tailAttr.array.slice();
    selPart.pending = false;
    select(selectedId);
  }).catch(() => {});

  function loop() {
    if (!running) return;
    rafId = requestAnimationFrame(loop);
    frame += 1;
    eCur += (eTarget - eCur) * 0.12;
    if (Math.abs(eTarget - eCur) < 0.0005) eCur = eTarget;
    const e = ease(eCur);
    // Sel sperma mengecil saat alur analisis dibuka
    if (cell) cell.holder.scale.setScalar(1 + (selPart.endScale - 1) * e);

    if (Math.abs(e - lastE) > 0.0008) {
      parts.forEach((p) => {
        if (p.kind === 'obj') p.g.position.set(p.off[0] * e, p.off[1] * e, p.off[2] * e);
        if (p.kind === 'pivot') {
          p.pivot.position.set(p.b[0] + (p.t[0] - p.b[0]) * e, p.b[1] + (p.t[1] - p.b[1]) * e, p.b[2] + (p.t[2] - p.b[2]) * e);
          p.pivot.rotation.set((Math.PI / 2) * e, p.ry * (1 - e), 0);
          const s = 1 + (p.s1 - 1) * e;
          p.pivot.scale.set(s, s, s);
        }
      });
      const sc = SCRW / PW;
      stages.forEach((p) => {
        const gx = CX + p.grid[0];
        const gy = p.grid[1];
        const gz = -0.6;
        p.panel.position.set(SCREEN[0] + (gx - SCREEN[0]) * e, SCREEN[1] + (gy - SCREEN[1]) * e, SCREEN[2] + (gz - SCREEN[2]) * e);
        const s = sc + (1 - sc) * e;
        p.panel.scale.set(s, s, s);
        p.panel.visible = e > 0.02;
      });
      buildCable();
      scene.updateMatrixWorld(true);
      updateFlows();
      const op = Math.min(1, Math.max(0, (e - 0.6) / 0.3));
      flowMaterial.opacity = op * 0.9;
      flows.forEach((f) => {
        f.head.visible = op > 0;
        if (op <= 0) f.segs.forEach((m) => { m.visible = false; });
      });
      lastE = e;
    }

    if (anim) {
      clock += 1 / 60;
      if (frame % 2 === 0) {
        sim.step();
        stages.forEach((p) => {
          if (p.panel.visible || p.stage === screenStage) {
            drawStage(p.ctx, p.stage, sim);
            p.tex.needsUpdate = true;
          }
        });
      }
      if (cell) {
        cell.spin.rotation.x = clock * 0.45;
        cell.holder.rotation.y = Math.sin(clock * 0.35) * 0.55;
        if (cell.tailAttr) {
          // Gelombang menjalar di ekor, makin besar ke ujung (satuan model; bagian tengah berakhir di x = -2,7)
          const arr = cell.tailAttr.array;
          const orig = cell.tailOrig;
          for (let i = 0; i < arr.length; i += 3) {
            const d = Math.max(0, -2.7 - orig[i]);
            arr[i + 2] = orig[i + 2] + 1.1 * Math.min(1, d / 14) * Math.sin(0.55 * d - clock * 5);
          }
          cell.tailAttr.needsUpdate = true;
        }
      }
      led.material.emissiveIntensity = Math.floor(clock * 2) % 2 ? 0.15 : 1.2;
      heater.material.emissiveIntensity = 0.8 + Math.sin(clock * 2.2) * 0.35;
      lampGlass.material.emissiveIntensity = 0.55 + Math.sin(clock * 1.3) * 0.08;
    }

    if (lastScreen !== screenStage) {
      const screenStageData = stages[screenStage];
      lapScreen.material.map = screenStageData.tex;
      lapScreen.material.needsUpdate = true;
      lastScreen = screenStage;
    }

    placeCam(e);
    renderer.render(scene, cam);

    const w = viewer.clientWidth;
    const h = viewer.clientHeight;
    parts.forEach((p) => {
      if (!p.el) return;
      if (p.pending || (p.panel && (!p.panel.visible || e < 0.35))) {
        p.el.style.visibility = 'hidden';
        return;
      }
      p.anchor.getWorldPosition(v);
      v.project(cam);
      const x = (v.x * 0.5 + 0.5) * w;
      const y = (-v.y * 0.5 + 0.5) * h;
      if (v.z > 1) {
        p.el.style.visibility = 'hidden';
        return;
      }
      p.el.style.visibility = 'visible';
      p.el.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) translate(${p.side === 'left' ? 'calc(-100% + 10px)' : '-10px'},-50%)`;
    });
  }

  function select(id) {
    const p = byId[id];
    if (!p) return;
    selectedId = id;
    if (p.kind === 'stage') screenStage = p.stage;
    parts.forEach((q) => {
      const on = q.id === id;
      q.meshes.forEach((m) => {
        if (!m.material.emissive || !m.userData.e0) return;
        m.material.emissive.copy(m.userData.e0);
        if (on) m.material.emissive.lerp(q.col, 0.38);
      });
    });
  }

  function setActive(active) {
    if (disposed) return;
    if (active && !running) {
      running = true;
      rafId = requestAnimationFrame(loop);
    } else if (!active && running) {
      running = false;
      cancelAnimationFrame(rafId);
    }
  }

  function dispose() {
    disposed = true;
    running = false;
    cancelAnimationFrame(rafId);
    resizeObserver.disconnect();
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    scene.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      const materials = Array.isArray(obj.material) ? obj.material : obj.material ? [obj.material] : [];
      materials.forEach((m) => {
        if (m.map) m.map.dispose();
        m.dispose();
      });
    });
    renderer.dispose();
    renderer.forceContextLoss();
  }

  select('deteksi');
  return {
    select,
    setActive,
    setProgress: (value) => { eTarget = value; },
    setAnimation: (value) => { anim = value; },
    resetView: () => { theta = 0.3; phi = 1.15; },
    dispose,
  };
}
