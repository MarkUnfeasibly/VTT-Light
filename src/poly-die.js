// src/poly-die.js
// 3D polyhedral die web component — adapted from poly-die.html for the VTT app.
// Uses the npm 'three' package (no CDN importmap; that conflicts with Vite).
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const DIE_SIDES = [4, 6, 8, 10, 12, 20];
const DEFAULT_COLORS = { 4:'#b8322a', 6:'#2648a8', 8:'#1f8a4c', 10:'#d27a14', 12:'#6b35a8', 20:'#178a8a' };
const FONT_FRAC = { 4:0.30, 6:0.46, 8:0.36, 10:0.30, 12:0.40, 20:0.28 };

/* Unbiased random integer 1..sides (Web Crypto). */
function rollValue(sides) {
  const limit = Math.floor(0x100000000 / sides) * sides;
  const buf = new Uint32Array(1);
  do { crypto.getRandomValues(buf); } while (buf[0] >= limit);
  return (buf[0] % sides) + 1;
}

/* Pentagonal trapezohedron (d10) with planar kite faces. */
function d10Triangles() {
  const V = THREE.Vector3, h = 1.2, r = 1.05, c = Math.cos(Math.PI / 5);
  const e = h * (1 - c) / (1 + c);
  const top = new V(0, h, 0), bot = new V(0, -h, 0), ring = [];
  for (let k = 0; k < 10; k++) {
    const a = k * Math.PI / 5;
    ring.push(new V(r * Math.cos(a), k % 2 ? -e : e, r * Math.sin(a)));
  }
  const tris = [];
  for (let i = 0; i < 5; i++) {
    const a = ring[2*i], b = ring[2*i+1], d = ring[(2*i+2) % 10];
    tris.push([top, a, b], [top, b, d]);
    const a2 = ring[2*i+1], b2 = ring[(2*i+2) % 10], d2 = ring[(2*i+3) % 10];
    tris.push([bot, a2, b2], [bot, b2, d2]);
  }
  return tris;
}

function baseTriangles(sides) {
  let g;
  switch (sides) {
    case 4:  g = new THREE.TetrahedronGeometry(1.35); break;
    case 6:  g = new THREE.BoxGeometry(1.5, 1.5, 1.5); break;
    case 8:  g = new THREE.OctahedronGeometry(1.3); break;
    case 10: return d10Triangles();
    case 12: g = new THREE.DodecahedronGeometry(1.25); break;
    case 20: g = new THREE.IcosahedronGeometry(1.3); break;
    default: throw new Error(`Unsupported die: d${sides}`);
  }
  if (g.index) g = g.toNonIndexed();
  const p = g.attributes.position, tris = [];
  for (let i = 0; i < p.count; i += 3)
    tris.push([0, 1, 2].map(k => new THREE.Vector3().fromBufferAttribute(p, i + k)));
  g.dispose();
  return tris;
}

/* Group triangles into faces, give each face a value, a centre and an "up" direction for its number. */
function buildFaces(sides) {
  const V = THREE.Vector3, groups = new Map();
  for (const [a, b, c] of baseTriangles(sides)) {
    const n = new V().subVectors(b, a).cross(new V().subVectors(c, a)).normalize();
    const m = new V().add(a).add(b).add(c).divideScalar(3);
    let t = [a, b, c];
    if (n.dot(m) < 0) { n.negate(); t = [a, c, b]; }          // make every face point outward
    const key = [n.x, n.y, n.z].map(v => Math.round(v * 1000)).join(',');
    if (!groups.has(key)) groups.set(key, { normal: n.clone(), tris: [] });
    groups.get(key).tris.push(t);
  }
  const faces = [...groups.values()];
  if (faces.length !== sides) throw new Error(`d${sides}: built ${faces.length} faces`);

  for (const f of faces) {
    const pts = [];
    for (const t of f.tris) for (const p of t) if (!pts.some(q => q.distanceToSquared(p) < 1e-8)) pts.push(p);
    f.centroid = pts.reduce((s, p) => s.add(p), new V()).divideScalar(pts.length);
    let far = pts[0], R = 0;
    for (const p of pts) { const d = p.distanceTo(f.centroid); if (d > R + 1e-6) { R = d; far = p; } }
    f.radius = R;
    f.up = new V().subVectors(far, f.centroid).normalize();     // number points at a vertex (kite apex on d10)
    if (sides === 6) f.up.applyAxisAngle(f.normal, Math.PI / 4); // square faces: point at an edge instead
    f.right = new V().crossVectors(f.up, f.normal);
  }

  // Number the faces so opposite faces add up to sides + 1, like real dice.
  let next = 1;
  for (const f of faces) {
    if (f.value) continue;
    f.value = next;
    const opp = faces.find(g => !g.value && g.normal.dot(f.normal) < -0.999);
    if (opp) opp.value = sides + 1 - next;
    next++;
  }
  return faces;
}

/* Geometry with UVs mapping every face to its own cell in a texture atlas. */
function buildDieGeometry(faces, sides) {
  const cols = Math.ceil(Math.sqrt(sides)), rows = Math.ceil(sides / cols);
  const pos = [], uv = [], d = new THREE.Vector3();
  faces.forEach((f, i) => {
    f.cell = [i % cols, Math.floor(i / cols)];
    const uc = (f.cell[0] + 0.5) / cols, vc = 1 - (f.cell[1] + 0.5) / rows, s = 0.47 / f.radius;
    for (const t of f.tris) for (const p of t) {
      pos.push(p.x, p.y, p.z);
      d.subVectors(p, f.centroid);
      uv.push(uc + d.dot(f.right) * s / cols, vc + d.dot(f.up) * s / rows);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.computeVertexNormals();                               // flat facets (non-indexed)
  return { geometry, cols, rows };
}

/* Rotation that turns a face toward the camera with its number upright. */
function faceQuaternion(face, toCamera, worldUp) {
  const Zt = toCamera.clone().normalize();
  const Yt = worldUp.clone().addScaledVector(Zt, -worldUp.dot(Zt)).normalize();
  const Xt = new THREE.Vector3().crossVectors(Yt, Zt);
  const Ms = new THREE.Matrix4().makeBasis(face.right, face.up, face.normal);
  const Mt = new THREE.Matrix4().makeBasis(Xt, Yt, Zt);
  return new THREE.Quaternion().setFromRotationMatrix(Mt.multiply(Ms.transpose()));
}

function drawAtlas(faces, cols, rows, sides, color, ink) {
  const C = 256, W = cols * C, H = rows * C;
  const mk = () => Object.assign(document.createElement('canvas'), { width: W, height: H });
  const map = mk(), bump = mk(), m = map.getContext('2d'), b = bump.getContext('2d');
  const light = new THREE.Color(color).offsetHSL(0, 0.02, 0.07).getStyle();
  m.fillStyle = color; m.fillRect(0, 0, W, H);
  b.fillStyle = '#fff'; b.fillRect(0, 0, W, H);
  const fs = Math.round(C * FONT_FRAC[sides]);
  for (const f of faces) {
    const cx = f.cell[0] * C + C / 2, cy = f.cell[1] * C + C / 2;
    const g = m.createRadialGradient(cx, cy, 0, cx, cy, C * 0.5);   // gentle resin depth
    g.addColorStop(0, light); g.addColorStop(1, color);
    m.fillStyle = g; m.fillRect(cx - C / 2, cy - C / 2, C, C);
    for (const [ctx, fill] of [[m, ink], [b, '#000']]) {
      ctx.fillStyle = fill;
      ctx.font = `700 ${fs}px "Segoe UI", Arial, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(f.value), cx, cy + fs * 0.04);
      if (sides >= 8 && (f.value === 6 || f.value === 9))          // 6 / 9 marker
        ctx.fillRect(cx - fs * 0.25, cy + fs * 0.44, fs * 0.5, Math.max(3, fs * 0.07));
    }
  }
  return { map, bump };
}

const STYLE = `
  :host { display:inline-block; width:var(--die-size,160px); height:var(--die-size,160px);
          background:transparent; cursor:pointer; -webkit-tap-highlight-color:transparent; }
  :host(:focus-visible) { outline:3px solid #2648a8; outline-offset:2px; border-radius:50%; }
  :host([aria-busy="true"]) { cursor:progress; }
  canvas { display:block; width:100%; height:100%; background:transparent; }`;

class PolyDie extends HTMLElement {
  static get observedAttributes() { return ['sides', 'size', 'color', 'ink']; }

  constructor() {
    super();
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${STYLE}</style><canvas></canvas>`;
    this._canvas = root.querySelector('canvas');
    this._value = null;
    this._busy = false;
    this._onClick = () => this.roll();
    this._onKey = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.roll(); } };
  }

  /* ---- attributes / properties ---- */
  get sides() {
    const s = parseInt(this.getAttribute('sides') ?? '20', 10);
    if (DIE_SIDES.includes(s)) return s;
    console.warn(`<poly-die>: sides="${this.getAttribute('sides')}" is not one of ${DIE_SIDES.join(', ')}; using 20.`);
    return 20;
  }
  set sides(v) { this.setAttribute('sides', v); }
  get size() { return Math.min(600, Math.max(60, parseInt(this.getAttribute('size') ?? '160', 10) || 160)); }
  set size(v) { this.setAttribute('size', v); }
  get color() { return this.getAttribute('color') || DEFAULT_COLORS[this.sides]; }
  set color(v) { this.setAttribute('color', v); }
  get ink() { return this.getAttribute('ink') || '#ffffff'; }
  set ink(v) { this.setAttribute('ink', v); }
  get value() { return this._value; }
  get rolling() { return this._busy; }

  connectedCallback() {
    if (!this.hasAttribute('tabindex')) this.tabIndex = 0;
    this.setAttribute('role', 'button');
    this.addEventListener('click', this._onClick);
    this.addEventListener('keydown', this._onKey);
    if (!this._renderer) this._init();
  }

  disconnectedCallback() {
    this.removeEventListener('click', this._onClick);
    this.removeEventListener('keydown', this._onKey);
    cancelAnimationFrame(this._raf);
    this._disposeDie();
    this._envTex?.dispose();
    this._renderer?.dispose();
    this._renderer = null;
  }

  attributeChangedCallback(name, oldV, newV) {
    if (!this._renderer || oldV === newV) return;
    if (name === 'size') this._resize();
    else if (!this._busy) this._buildDie();
    else this._pendingRebuild = true;
  }

  /* ---- setup ---- */
  _init() {
    const r = this._renderer = new THREE.WebGLRenderer({ canvas: this._canvas, antialias: true, alpha: true, premultipliedAlpha: true });
    r.setClearColor(0x000000, 0);
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;

    this._scene = new THREE.Scene();
    this._camera = new THREE.PerspectiveCamera(28, 1, 0.1, 50);
    this._camera.position.set(0, 2.6, 7.8);
    this._camera.lookAt(0, 0, 0);
    this._toCamera = this._camera.position.clone().normalize();

    const pmrem = new THREE.PMREMGenerator(r);
    this._envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this._scene.environment = this._envTex;
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 6, 5);
    this._scene.add(key);
    this._scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    // Soft contact shadow so the floating die reads as 3D on any page.
    const sc = Object.assign(document.createElement('canvas'), { width: 128, height: 128 });
    const sg = sc.getContext('2d'), grad = sg.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(0,0,0,0.55)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
    sg.fillStyle = grad; sg.fillRect(0, 0, 128, 128);
    this._shadowTex = new THREE.CanvasTexture(sc);
    this._shadow = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 2.8),
      new THREE.MeshBasicMaterial({ map: this._shadowTex, transparent: true, depthWrite: false, opacity: 0.5 }));
    this._shadow.rotation.x = -Math.PI / 2;
    this._shadow.position.y = -1.45;
    this._scene.add(this._shadow);

    this._buildDie();
    this._resize();
  }

  _disposeDie() {
    if (!this._mesh) return;
    this._scene.remove(this._mesh);
    this._mesh.geometry.dispose();
    this._mesh.material.map?.dispose();
    this._mesh.material.bumpMap?.dispose();
    this._mesh.material.dispose();
    this._edges?.geometry.dispose();
    this._edges?.material.dispose();
    this._mesh = this._edges = null;
  }

  _buildDie() {
    this._pendingRebuild = false;
    this._disposeDie();
    const sides = this.sides, color = this.color;
    this._faces = buildFaces(sides);
    const { geometry, cols, rows } = buildDieGeometry(this._faces, sides);
    const { map, bump } = drawAtlas(this._faces, cols, rows, sides, color, this.ink);
    const aniso = this._renderer.capabilities.getMaxAnisotropy();
    const mapTex = new THREE.CanvasTexture(map);
    mapTex.colorSpace = THREE.SRGBColorSpace; mapTex.anisotropy = aniso;
    const bumpTex = new THREE.CanvasTexture(bump);
    bumpTex.anisotropy = aniso;

    const material = new THREE.MeshPhysicalMaterial({
      map: mapTex, bumpMap: bumpTex, bumpScale: 0.6,
      roughness: 0.28, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08,
      sheen: 0.2, envMapIntensity: 1.1
    });
    this._mesh = new THREE.Mesh(geometry, material);
    this._edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 1),
      new THREE.LineBasicMaterial({ color: new THREE.Color(color).offsetHSL(0, 0, 0.25), transparent: true, opacity: 0.35 }));
    this._mesh.add(this._edges);
    this._scene.add(this._mesh);

    // Rest showing the highest face until the first roll.
    this._value = null;
    const face = this._faces.find(f => f.value === sides);
    this._mesh.quaternion.copy(this._restQuat(face, 0));
    this.setAttribute('aria-label', `d${sides}. Press to roll.`);
    this._render();
  }

  _restQuat(face, twist = (Math.random() - 0.5) * 0.35) {
    const q = faceQuaternion(face, this._toCamera, new THREE.Vector3(0, 1, 0));
    const tw = new THREE.Quaternion().setFromAxisAngle(this._toCamera, twist);      // slight in-plane turn
    const t = this.sides === 4 ? [0.55, -0.6] : [0.22, -0.28];     // the d4 needs more tilt to look 3D
    const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(t[0], t[1], 0)); // show some depth
    return tilt.multiply(tw).multiply(q);
  }

  _resize() {
    const s = this.size;
    this.style.setProperty('--die-size', s + 'px');
    this._renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this._renderer.setSize(s, s, false);
    this._render();
  }

  _render() { this._renderer?.render(this._scene, this._camera); }

  /* ---- public API ---- */
  roll() {
    if (this._busy || !this._mesh) return Promise.resolve(null);
    const sides = this.sides, value = rollValue(sides);
    const target = this._restQuat(this._faces.find(f => f.value === value));
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const dur = reduce ? 300 : 1500;
    const rnd = () => new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize();
    const ax1 = rnd(), ax2 = rnd();
    const th1 = (3 + Math.random() * 2) * Math.PI * 2, th2 = (1 + Math.random()) * Math.PI * 2;
    const start = this._mesh.quaternion.clone(), qa = new THREE.Quaternion(), qb = new THREE.Quaternion();

    this._busy = true;
    this.setAttribute('aria-busy', 'true');
    this.dispatchEvent(new CustomEvent('rollstart', { bubbles: true, composed: true, detail: { sides } }));

    return new Promise(resolve => {
      const t0 = performance.now();
      const step = now => {
        const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 3);
        if (reduce) {
          this._mesh.quaternion.copy(start).slerp(target, e);
        } else {
          qa.setFromAxisAngle(ax1, th1 * (1 - e));
          qb.setFromAxisAngle(ax2, th2 * (1 - e));
          this._mesh.quaternion.copy(qa).multiply(qb).multiply(target);
          const h = Math.abs(Math.cos(t * Math.PI * 2.5)) * Math.pow(1 - t, 2) * 0.55;
          this._mesh.position.y = h;
          this._shadow.material.opacity = 0.5 * (1 - h / 0.9);
          this._shadow.scale.setScalar(1 + h * 0.4);
        }
        this._render();
        if (t < 1) { this._raf = requestAnimationFrame(step); return; }

        this._mesh.quaternion.copy(target);
        this._mesh.position.y = 0;
        this._shadow.material.opacity = 0.5;
        this._shadow.scale.setScalar(1);
        this._render();
        this._value = value;
        this._busy = false;
        this.removeAttribute('aria-busy');
        this.setAttribute('aria-label', `d${sides} showing ${value}. Press to roll again.`);
        const detail = { sides, value };
        this.dispatchEvent(new CustomEvent('roll', { bubbles: true, composed: true, detail }));
        if (this._pendingRebuild) this._buildDie();
        resolve(detail);
      };
      this._raf = requestAnimationFrame(step);
    });
  }
}
customElements.define('poly-die', PolyDie);
