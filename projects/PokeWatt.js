// Behavior for the PokeWatt page. Loaded by script.js via import(); mount(root) wires up the figures
// inside root and returns unmount(), which script.js calls when the panel is replaced.
import { createRuntime } from './shared/explainer.js';

export function mount(root) {
const R = createRuntime(root);
const { $, el, Scene, sleep, travel, trace, node, label, frameBox, REDUCED } = R;
const { GREEN, BLUE, YEL, GRAYC, REDC } = R.colors;
const timers = [];
const cleanups = [];

/* =====================================================================
   Shared: the power zones (the real odds from get_rarity_probabilities)
   ===================================================================== */
const FTP_BOSS = 1.5; // the boss only takes damage at or above 150% of FTP
const ZONES = [
  // [upper bound as a fraction of FTP, name, [common, uncommon, rare] %, one-liner]
  [0.55, 'Recovery', [95, 5, 0],
    'Coasting for coffee. Nearly everything that turns up is common: the pigeons of the Pokémon world.'],
  [0.75, 'Endurance', [75, 22, 3],
    'A steady, sensible pace. Uncommon things start dropping by, and every so often a legend peeks in.'],
  [0.90, 'Tempo', [40, 40, 20],
    'Getting warm. One Pokémon in five is now a rare one, and the pigeons are starting to feel left out.'],
  [1.06, 'Threshold', [30, 30, 40],
    'Lungs on. Four in ten are rare. This is about the hardest you can ride and still hold a conversation. Barely.'],
  [1.50, 'VO2 / anaerobic', [10, 40, 50],
    'Half of everything you meet is rare. You are not breathing, you are hosting.'],
  [Infinity, 'Neuromuscular', [0, 10, 90],
    'Nine in ten are rare. Also, somewhere, a boss has noticed.'],
];
const zoneFor = (watts, ftp) => ZONES.find(z => watts / ftp < z[0]);
const zoneIndex = (watts, ftp) => ZONES.indexOf(zoneFor(watts, ftp));

/* =====================================================================
   FIG 1 — from quads to screen
   ===================================================================== */
(function figFlow() {
  const svg = $('svgFlow');
  const scene = new Scene(svg, { paused: REDUCED });
  const traceLayer = el('g', {}, svg), nodeLayer = el('g', {}, svg), pktLayer = el('g', {}, svg);
  const W = 150, Y = 40, H = 72, X = [15, 215, 415, 615, 815];

  const n = [
    node(nodeLayer, { x: X[0], y: Y, w: W, h: H, title: 'YOUR LEGS', sub: ['watts · cadence', '(the controller)'] }),
    node(nodeLayer, { x: X[1], y: Y, w: W, h: H, title: 'PEDALS', sub: ['Bluetooth LE', 'power meter'] }),
    node(nodeLayer, { x: X[2], y: Y, w: W, h: H, title: 'READER', sub: ['its own thread', 'smooths the wobble'] }),
    node(nodeLayer, { x: X[3], y: Y, w: W, h: H, title: 'GAME', sub: ['spawns · bosses', '48 frames a second'] }),
    node(nodeLayer, { x: X[4], y: Y, w: W, h: H, title: 'SCREEN', sub: ['800×480', 'Pokémon appear'] }),
  ];
  const replay = node(nodeLayer, { x: X[2], y: 190, w: W, h: H, cls: 'blue', title: 'ride.csv', sub: ['a recorded ride', 'replaces pedals'] });

  const links = [0, 1, 2, 3].map(i => trace(traceLayer, [[X[i] + W, Y + H / 2], [X[i + 1], Y + H / 2]], '', { r: 4 }));
  trace(traceLayer, [[X[2] + W, 226], [X[3] + W / 2, 226], [X[3] + W / 2, Y + H]], 'udp', { r: 8 });
  label(svg, X[2] + W + 14, 218, 'or a replay', { cls: 'udp' });

  const logEl = $('logFlow');
  const lines = [];
  const say = (msg, cls = '') => {
    lines.push(`<div class="${cls}">${msg}</div>`);
    if (lines.length > 6) lines.shift();
    logEl.innerHTML = lines.join('');
  };
  const quips = [
    'a wild Pokémon appeared. It looks unbothered.',
    'a wild Pokémon appeared. It was expecting you to be faster.',
    'a wild Pokémon appeared, and it seems to know about your FTP.',
    'a wild Pokémon appeared. It is judging your cadence.',
  ];

  (async () => {
    const ftp = 175;
    const samples = [70, 118, 150, 175, 205, 240, 290];
    let i = 0;
    for (;;) {
      const w = samples[i++ % samples.length], rpm = 55 + Math.round(w / 4) + Math.floor(Math.random() * 6);
      const z = zoneFor(w, ftp);
      R.flash(n[0], 500); say(`> pedals report ${w} W at ${rpm} rpm`, 'dim');
      for (let k = 0; k < links.length; k++) {
        await travel(scene, links[k], { layer: pktLayer, r: 5, color: k === 2 ? YEL : GREEN, speed: 260 });
        R.flash(n[k + 1], 600);
        if (k === 3) say(`> zone: ${z[1]} · ${quips[Math.floor(Math.random() * quips.length)]}`, 'hi');
      }
      await sleep(scene, 1600);
    }
  })();
})();

/* =====================================================================
   FIG 2 — how hard are you pedaling? (no animation, just a slider)
   ===================================================================== */
(function figEffort() {
  const range = $('wattsRange'), ftpInput = $('ftpInput');
  const strip = $('zoneStrip'), pointer = $('zonePointer').firstElementChild;
  const MAX = +range.max;

  function buildStrip(ftp) {
    strip.innerHTML = '';
    let prev = 0;
    ZONES.forEach((z, i) => {
      const hi = Math.min(MAX, Number.isFinite(z[0]) ? z[0] * ftp : MAX);
      if (hi <= prev) return;
      const s = document.createElement('span');
      s.className = 'z' + (i + 1);
      s.style.width = ((hi - prev) / MAX * 100) + '%';
      s.textContent = (hi - prev) / MAX > 0.11 ? z[1] : '';
      s.title = z[1];
      strip.appendChild(s);
      prev = hi;
    });
  }

  function update() {
    const ftp = Math.max(60, Math.min(500, +ftpInput.value || 175));
    const watts = +range.value;
    buildStrip(ftp);
    const z = zoneFor(watts, ftp);
    pointer.style.left = (watts / MAX * 100) + '%';
    $('effortReadout').innerHTML =
      `<b>${watts} W</b> · ${Math.round(watts / ftp * 100)}% of FTP · zone: <b>${z[1]}</b>`;
    $('effortQuip').textContent = z[3];
    z[2].forEach((p, i) => { $('odds' + (i + 1)).style.width = p + '%'; $('pct' + (i + 1)).textContent = p + '%'; });
    const bossW = Math.floor(ftp * FTP_BOSS);
    $('bossFlag').innerHTML = watts >= bossW
      ? `<b>BOSS HURTS</b> · ${watts} W is over the ${bossW} W line. Keep it up for ten seconds.`
      : `boss damage starts at ${bossW} W (150% of FTP). ${bossW - watts} W to go.`;
  }
  range.addEventListener('input', update);
  ftpInput.addEventListener('input', update);
  update();
})();

/* =====================================================================
   TARGET — a spinning ASCII Mewtwo (frames are pre-rendered from a 3D model)
   ===================================================================== */
(function figMewtwo() {
  const box = $('mewtwoBox'), pre = $('mewtwoArt');
  if (!box || !pre) return;
  const COLS = 66, STEP_MS = 100;
  let frames = null, pos = 0, onScreen = true, drag = null;

  const show = () => { if (frames) pre.textContent = frames[((Math.round(pos) % frames.length) + frames.length) % frames.length]; };
  // Courier is 0.6em wide, so size the type to make the 66 columns fill the box.
  const fit = () => { pre.style.fontSize = Math.max(5, Math.min(14, (box.clientWidth - 28) / (COLS * 0.6))) + 'px'; };
  fit();
  const ro = new ResizeObserver(fit); ro.observe(box); cleanups.push(() => ro.disconnect());
  const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; }); io.observe(box); cleanups.push(() => io.disconnect());

  fetch(new URL('./PokeWatt-mewtwo.json', import.meta.url)).then(r => r.json()).then(f => {
    frames = f; show();
    if (!REDUCED) timers.push(setInterval(() => { if (onScreen && !drag && !document.hidden) { pos += 1; show(); } }, STEP_MS));
  }).catch(() => { pre.textContent = '[ Mewtwo declined to be rendered ]'; });

  // drag to turn it by hand
  box.addEventListener('pointerdown', e => { drag = { x: e.clientX, pos }; box.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove', e => { if (drag) { pos = drag.pos - (e.clientX - drag.x) / 8; show(); } });
  const release = () => { drag = null; };
  box.addEventListener('pointerup', release); box.addEventListener('pointercancel', release);
})();

return () => { timers.forEach(clearInterval); cleanups.forEach(fn => fn()); R.unmount(); };
}
