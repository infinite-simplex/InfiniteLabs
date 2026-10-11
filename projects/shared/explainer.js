// Shared runtime for the retro explainer pages (EventContractLOB, ToyExchangeCore).
// createRuntime(root) returns the drawing/animation helpers scoped to one mounted project,
// plus unmount(), which stops every animation loop. Animation loops are async and never
// finish on their own, so unmount() flips `alive`, releases anything waiting, and each loop
// throws GONE at its next tick.
export function createRuntime(root) {
const $ = id => root.querySelector('#' + id);
const GONE = new Error('unmounted');
let alive = true;
const disposers = [];
const scenes = [];
const onRejection = ev => { if (ev.reason === GONE) ev.preventDefault(); };
window.addEventListener('unhandledrejection', onRejection);

const SVGNS = 'http://www.w3.org/2000/svg';
const REDUCED = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const GREEN = '#48d04b', BLUE = '#3d9bff', YEL = '#ffff00', GRAYC = '#bbbbbb', REDC = '#ff3333';

// Diagram text is sized in SVG user units, so it shrinks with the figure. Class-based sizes
// live in shared/explainer.css; this scales the ones set inline in the figure code, so one
// number keeps the two in step.
const TEXT_SCALE = 1.15;

function el(name, attrs, parent) {
  const e = document.createElementNS(SVGNS, name);
  for (const k in (attrs || {})) {
    e.setAttribute(k, k === 'font-size' && name === 'text' ? attrs[k] * TEXT_SCALE : attrs[k]);
  }
  if (parent) parent.appendChild(e);
  return e;
}
const frame = () => new Promise(r => requestAnimationFrame(r));

/* A Scene decides whether a figure's animation is running: it must be on screen,
   the tab must be visible, and the user must not have paused it. */
class Scene {
  constructor(target, { paused = false } = {}) {
    this.visible = false; this.userPaused = paused; this.waiters = []; this.firstVisible = [];
    const io = new IntersectionObserver(es => {
      this.visible = es[0].isIntersecting;
      if (this.visible) { this.firstVisible.splice(0).forEach(f => f()); }
      this.poke();
    }, { threshold: 0.15 });
    io.observe(target);
    const onVis = () => this.poke();
    document.addEventListener('visibilitychange', onVis);
    disposers.push(() => { io.disconnect(); document.removeEventListener('visibilitychange', onVis); });
    scenes.push(this);
  }
  running() { return alive && this.visible && !this.userPaused && !document.hidden; }
  wake() { return new Promise(r => this.waiters.push(r)); }
  poke(force = false) { if (force || this.running()) this.waiters.splice(0).forEach(f => f()); }
  onFirstVisible(f) { if (this.visible) f(); else this.firstVisible.push(f); }
}

async function sleep(scene, ms) {
  let e = 0, last = performance.now();
  while (e < ms) {
    await frame(); if (!alive) throw GONE;
    const now = performance.now();
    if (!scene.running()) { await scene.wake(); if (!alive) throw GONE; last = performance.now(); continue; }
    e += now - last; last = now;
  }
}

/* Move a dot along an SVG path element. */
async function travel(scene, pathEl, o = {}) {
  const { r = 3, color = GREEN, speed = 240, reverse = false, layer, stopAt = 1, keep = false } = o;
  const len = pathEl.getTotalLength(), target = len * stopAt;
  const dot = el('circle', { r, class: 'pkt', fill: color, style: 'color:' + color }, layer);
  const at = d => pathEl.getPointAtLength(reverse ? len - d : d);
  let p = at(0); dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
  let d = 0, last = performance.now();
  while (d < target) {
    await frame(); if (!alive) throw GONE;
    const now = performance.now();
    if (!scene.running()) { await scene.wake(); if (!alive) throw GONE; last = performance.now(); continue; }
    d = Math.min(target, d + (now - last) / 1000 * speed); last = now;
    p = at(d); dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y);
  }
  if (!keep) dot.remove();
  return dot;
}

/* Polyline with every corner cut at 45 degrees — reads like chip routing. */
function chamfer(pts, r = 8) {
  // drop repeated points: a zero-length segment would divide by zero below
  pts = pts.filter((p, i) => i === 0 || p[0] !== pts[i - 1][0] || p[1] !== pts[i - 1][1]);
  if (pts.length < 3) return 'M' + pts.map(p => p.join(' ')).join(' L');
  let d = `M${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], [x2, y2] = pts[i + 1];
    const l1 = Math.hypot(x1 - x0, y1 - y0), l2 = Math.hypot(x2 - x1, y2 - y1);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    d += ` L${x1 - (x1 - x0) / l1 * rr} ${y1 - (y1 - y0) / l1 * rr}`;
    d += ` L${x1 + (x2 - x1) / l2 * rr} ${y1 + (y2 - y1) / l2 * rr}`;
  }
  const last = pts[pts.length - 1];
  return d + ` L${last[0]} ${last[1]}`;
}

/* Draw a routed trace (with small via pads at both ends) and return its <path>. */
function trace(svg, pts, cls = '', { vias = true, r = 8 } = {}) {
  const g = el('g', {}, svg);
  const p = el('path', { d: chamfer(pts, r), class: 'trace ' + cls }, g);
  if (vias) {
    const a = pts[0], b = pts[pts.length - 1];
    const vc = cls.includes('udp') ? 'via udp' : 'via';
    [a, b].forEach(q => el('rect', { x: q[0] - 3, y: q[1] - 3, width: 6, height: 6, class: vc }, g));
  }
  return p;
}

function node(svg, { x, y, w, h, title, sub = [], cls = '', id }) {
  const g = el('g', { class: 'node ' + cls }, svg);
  if (id) g.id = id;
  el('rect', { class: 'outer', x, y, width: w, height: h }, g);
  el('rect', { class: 'inner', x: x + 3, y: y + 3, width: w - 6, height: h - 6 }, g);
  const subs = Array.isArray(sub) ? sub : [sub];
  const t = el('text', { class: 't', x: x + w / 2, y: subs.length ? y + 23 : y + h / 2 + 7, 'text-anchor': 'middle' }, g);
  t.textContent = title;
  g._t = t; g._s = subs.map((s, i) => {
    const e = el('text', { class: 's', x: x + w / 2, y: y + 41 + i * 15, 'text-anchor': 'middle' }, g);
    e.textContent = s; return e;
  });
  return g;
}
function label(svg, x, y, txt, { cls = '', anchor = 'start', rot = 0 } = {}) {
  const t = el('text', { class: 'lane-label ' + cls, x: 0, y: 0, 'text-anchor': anchor,
    transform: `translate(${x},${y})` + (rot ? ` rotate(${rot})` : '') }, svg);
  t.textContent = txt; return t;
}
function frameBox(svg, x, y, w, h, title) {
  el('rect', { class: 'frame', x, y, width: w, height: h }, svg);
  const t = el('text', { class: 'frame-label', x: x + 10, y: y + 17 }, svg);
  t.textContent = title;
}
function flash(g, ms = 380) { g.classList.add('lit'); setTimeout(() => g.classList.remove('lit'), ms); }
function xmark(layer, cx, cy, s = 6) {
  const g = el('g', {}, layer);
  el('line', { x1: cx - s, y1: cy - s, x2: cx + s, y2: cy + s, class: 'xmark' }, g);
  el('line', { x1: cx - s, y1: cy + s, x2: cx + s, y2: cy - s, class: 'xmark' }, g);
  setTimeout(() => g.remove(), 1400);
}

function todoIndex() {
  const items = [...root.querySelectorAll('.todo')];
  $('todoCount').textContent = items.length;
  const ol = $('todoList');
  items.forEach((t, i) => {
    t.id = 'todo-' + (i + 1);
    const li = document.createElement('li');
    const a = document.createElement('a');
    a.href = '#todo-' + (i + 1);
    a.textContent = t.textContent.slice(0, 110);
    li.appendChild(a); ol.appendChild(li);
  });
}

function unmount() {
  alive = false;
  disposers.forEach(f => f());
  scenes.forEach(s => s.poke(true));
  // loops reject a tick later; keep the filter installed until they have
  setTimeout(() => window.removeEventListener('unhandledrejection', onRejection), 1000);
}

return {
  $, root, el, frame, Scene, sleep, travel, chamfer, trace, node, label, frameBox, flash, xmark,
  todoIndex, unmount, REDUCED,
  colors: { GREEN, BLUE, YEL, GRAYC, REDC },
};
}
