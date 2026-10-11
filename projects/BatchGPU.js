// Behavior for the BatchGPU explainer. Loaded by script.js via import(); mount(root) wires up the
// figures inside root and returns unmount(), which script.js calls when the panel is replaced.
import { createRuntime } from './shared/explainer.js';

/* =====================================================================
   The C++ rules that two figures compute live (Catalog.hpp, and clear() for one item).
   Checked against the real code on every combination of masks and on 30,000 random one-item markets.
   ===================================================================== */
// <model>
const ACCELERATORS = [
  { name: 'A100-80GB', short: 'A100', vendor: 'NVIDIA', chain: 0 },
  { name: 'H100-80GB', short: 'H100', vendor: 'NVIDIA', chain: 1 },
  { name: 'H200-141GB', short: 'H200', vendor: 'NVIDIA', chain: 2 },
  { name: 'MI300X-192GB', short: 'MI300X', vendor: 'AMD', chain: 0 },
  { name: 'TPU-v5p', short: 'TPU-v5p', vendor: 'GOOGLE', chain: 0 },
];
const INTERCONNECTS = ['PCIe', 'NVLink'];
const REGIONS = ['US_WEST', 'US_EAST', 'EU_WEST'];

const skuIndex = s => (s.a * INTERCONNECTS.length + s.i) * REGIONS.length + s.r;
const allSkus = () => ACCELERATORS.flatMap((_, a) => INTERCONNECTS.flatMap((_, i) => REGIONS.map((_, r) => ({ a, i, r }))));

// Same region, an interconnect no lower, and a model no lower in the same vendor's chain.
const atLeastAsGood = (x, y) => x.r === y.r && x.i >= y.i &&
  ACCELERATORS[x.a].vendor === ACCELERATORS[y.a].vendor && ACCELERATORS[x.a].chain >= ACCELERATORS[y.a].chain;
const strictlyBetter = (x, y) => atLeastAsGood(x, y) && skuIndex(x) !== skuIndex(y);
const isLifted = (awarded, accepted) => accepted.some(s => strictlyBetter(awarded, s));

// An order accepts the product of its three masks.
const acceptedSkus = (accMask, icMask, regMask) =>
  allSkus().filter(s => (accMask >> s.a & 1) && (icMask >> s.i & 1) && (regMask >> s.r & 1));

// One item, unit by unit. Orders are listed in arrival order; a bid's steps fall in price and an ask's rise.
function clearOneItem(bids, asks) {
  const expand = (orders, byPrice) => orders
    .flatMap((o, rank) => o.steps.flatMap(s => Array.from({ length: s.q }, () => ({ p: s.p, rank }))))
    .sort((x, y) => byPrice(x.p, y.p) || x.rank - y.rank);
  const bu = expand(bids, (x, y) => y - x);
  const au = expand(asks, (x, y) => x - y);
  let n = 0;
  while (n < bu.length && n < au.length && bu[n].p >= au[n].p) n++;
  const countBy = (orders, units) => {
    const c = orders.map(() => 0);
    units.slice(0, n).forEach(u => c[u.rank]++);
    return c;
  };
  let welfare = 0, tieCost = 0;
  for (let k = 0; k < n; k++) { welfare += bu[k].p - au[k].p; tieCost += bu[k].rank + au[k].rank; }
  // The lowest price at which the last ask unit still sells and no unit that missed out wants more.
  const price = n ? Math.max(au[n - 1].p, n < bu.length ? bu[n].p : 0) : null;
  return { units: n, welfare, tieCost, price, bidUnits: countBy(bids, bu), askUnits: countBy(asks, au), bu, au };
}
// </model>

export function mount(root) {
const R = createRuntime(root);
const { $, el, Scene, sleep, travel, trace, node, label, frameBox, flash, xmark, REDUCED } = R;
const { GREEN, BLUE, YEL, GRAYC, REDC } = R.colors;
R.todoIndex();

const clockText = h => { const m = Math.round(h * 60); return Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); };
const mask = set => [...set].reduce((m, i) => m | 1 << i, 0);
const bin = (m, n) => '0b' + m.toString(2).padStart(n, '0');

/* =====================================================================
   FIG 1 — system topology
   ===================================================================== */
(function figTopo() {
  const svg = $('svgTopo');
  const scene = new Scene(svg, { paused: REDUCED });
  const traceLayer = el('g', {}, svg), nodeLayer = el('g', {}, svg), pktLayer = el('g', {}, svg);

  frameBox(traceLayer, 165, 36, 300, 360, 'NETWORKSERVICEAPP');

  const clients = node(nodeLayer, { x: 14, y: 70, w: 120, h: 64, title: 'CLIENTS', sub: ['buyers · sellers', 'TCP'] });
  const subs = node(nodeLayer, { x: 14, y: 330, w: 120, h: 64, title: 'SUBSCRIBERS', sub: ['public feed', 'UDP multicast'] });
  const ticker = node(nodeLayer, { x: 181, y: 58, w: 268, h: 50, cls: 'blue', title: 'BATCH TICKER', sub: 'BATCH_CLEAR at :30, as a client' });
  const handler = node(nodeLayer, { x: 181, y: 118, w: 268, h: 50, cls: 'blue', title: 'PROTOCOL HANDLER', sub: 'bytes → command · validates orders' });
  const seqr = node(nodeLayer, { x: 181, y: 180, w: 268, h: 64, title: 'SEQUENCER · LOG', sub: ['sequence number, then multicast', 'ring store · gap-fill'] });
  const arbiter = node(nodeLayer, { x: 181, y: 256, w: 268, h: 50, title: 'REPLICA ARBITER', sub: 'epoch · who may publish' });
  const egress = node(nodeLayer, { x: 181, y: 318, w: 268, h: 64, title: 'EGRESS GATEWAY', sub: ['drops stale epochs', 'encodes · ack + public feed'] });

  const rec1 = node(nodeLayer, { x: 525, y: 36, w: 200, h: 78, cls: 'blue', title: 'RECORDER 1', sub: ['same log, same engine', 'writes SQLite'] });
  const rec2 = node(nodeLayer, { x: 525, y: 126, w: 200, h: 78, cls: 'blue', title: 'RECORDER 2', sub: ['same log, same engine', 'writes SQLite'] });
  const rep2 = node(nodeLayer, { x: 525, y: 236, w: 200, h: 78, cls: 'blue', title: 'REPLICA 2 · STANDBY', sub: ['runs the clear too', 'does not publish'] });
  const rep1 = node(nodeLayer, { x: 525, y: 326, w: 200, h: 78, cls: 'blue leader', title: 'REPLICA 1 · LEADER', sub: ['solves the clear', 'publishes the events'] });
  const engines = [rec1, rec2, rep2, rep1];

  const db1 = node(nodeLayer, { x: 752, y: 47, w: 84, h: 56, cls: 'blue', title: 'SQLITE 1', sub: 'WAL' });
  const db2 = node(nodeLayer, { x: 752, y: 137, w: 84, h: 56, cls: 'blue', title: 'SQLITE 2', sub: 'WAL' });
  const api = node(nodeLayer, { x: 862, y: 110, w: 104, h: 70, cls: 'blue', title: 'RESULTS API', sub: ['read-only', 'GET → JSON'] });
  const users = node(nodeLayer, { x: 862, y: 226, w: 104, h: 50, title: 'USERS', sub: 'curl · clients' });
  const perf = node(nodeLayer, { x: 752, y: 350, w: 214, h: 64, title: 'PERFORMANCE SERVICE', sub: ['Core · prints percentiles', 'not run by this repo'] });

  const inY = [56, 146, 256, 346];
  const P = {
    order: trace(traceLayer, [[134, 102], [150, 102], [150, 143], [181, 143]]),
    tick: trace(traceLayer, [[315, 108], [315, 118]], '', { vias: false }),
    seq: trace(traceLayer, [[315, 168], [315, 180]], '', { vias: false }),
    arb: trace(traceLayer, [[315, 306], [315, 318]], 'dim', { vias: false }),
    trunk: trace(traceLayer, [[449, 212], [490, 212]], 'udp'),
    mc: inY.map(y => trace(traceLayer, [[490, 212], [490, y], [525, y]], 'udp', { vias: false })),
    egress: trace(traceLayer, [[525, 388], [505, 388], [505, 360], [449, 360]], 'udp'),
    standby: trace(traceLayer, [[525, 298], [505, 298]], 'udp dim', { vias: false }),
    ack: trace(traceLayer, [[181, 338], [158, 338], [158, 302], [74, 302], [74, 134]]),
    feed: trace(traceLayer, [[181, 362], [134, 362]], 'udp'),
    w1: trace(traceLayer, [[725, 75], [752, 75]], '', { vias: false }),
    w2: trace(traceLayer, [[725, 165], [752, 165]], '', { vias: false }),
    r1: trace(traceLayer, [[836, 75], [849, 75], [849, 138], [862, 138]], 'dim', { vias: false }),
    r2: trace(traceLayer, [[836, 165], [849, 165], [849, 152], [862, 152]], 'dim', { vias: false }),
    json: trace(traceLayer, [[914, 180], [914, 226]], 'hb', { vias: false }),
    tel1: trace(traceLayer, [[725, 365], [752, 365]], 'tel', { vias: false }),
    tel2: trace(traceLayer, [[725, 275], [738, 275], [738, 358], [752, 358]], 'tel', { vias: false }),
  };
  el('rect', { x: 509, y: 292, width: 8, height: 12, class: 'via' }, traceLayer);
  const gateX = el('g', {}, traceLayer);
  el('line', { x1: 505, y1: 289, x2: 521, y2: 307, class: 'xmark', opacity: .6 }, gateX);
  el('line', { x1: 505, y1: 307, x2: 521, y2: 289, class: 'xmark', opacity: .6 }, gateX);

  label(svg, 480, 150, 'REPLICATION MCAST', { cls: 'udp', anchor: 'middle', rot: -90 });
  label(svg, 515, 428, 'EGRESS MCAST · LEADER ONLY', { cls: 'udp', anchor: 'middle' });
  label(svg, 66, 218, 'PRIVATE ACK · TCP', { anchor: 'middle', rot: -90 });
  label(svg, 14, 412, 'PUBLIC FEED · UDP MCAST', { cls: 'udp', anchor: 'start' });
  label(svg, 525, 29, 'NO HEARTBEATS · NEVER LEAD', { anchor: 'start' });
  label(svg, 525, 230, 'HEARTBEATS · MAY LEAD', { cls: 'hb', anchor: 'start' });
  label(svg, 752, 344, 'TELEMETRY · UDP', { anchor: 'start' });
  label(svg, 862, 100, 'OPENS THE FILES', { anchor: 'start' });

  const status = el('text', { x: 14, y: 22, fill: GRAYC, 'font-size': 11 }, nodeLayer);

  const write = (lane, db) => travel(scene, lane, { layer: pktLayer, r: 3, speed: 150 }).then(() => flash(db, 450));
  async function intoTheLog(color) {
    flash(handler);
    await travel(scene, P.seq, { layer: pktLayer, r: 2, color, speed: 120 });
    flash(seqr);
    await travel(scene, P.trunk, { layer: pktLayer, r: 6, color: BLUE, speed: 300 });
    await Promise.all(P.mc.map(p => travel(scene, p, { layer: pktLayer, r: 6, color: BLUE, speed: 300 })));
  }
  async function apiRead() {
    await travel(scene, P.r1, { layer: pktLayer, r: 2, color: GRAYC, speed: 200 });
    flash(api, 350);
    await travel(scene, P.json, { layer: pktLayer, r: 3, color: YEL, speed: 160 });
    flash(users, 350);
  }

  async function orderCycle() {
    status.textContent = 'cycle: an order';
    await travel(scene, P.order, { layer: pktLayer, speed: 240 });
    await intoTheLog(GREEN);
    engines.forEach(n => flash(n, 600));
    await sleep(scene, 650);
    xmark(pktLayer, 515, 298, 6);
    await Promise.all([
      travel(scene, P.egress, { layer: pktLayer, r: 6, color: BLUE, speed: 300 }).then(() => flash(egress)),
      write(P.w1, db1), write(P.w2, db2),
    ]);
    await sleep(scene, 200);
    await Promise.all([
      travel(scene, P.ack, { layer: pktLayer, speed: 230 }),
      travel(scene, P.feed, { layer: pktLayer, r: 6, color: BLUE, speed: 260 }),
    ]);
    flash(clients); flash(subs);
  }

  async function clearCycle() {
    status.textContent = 'cycle: the ticker sends BATCH_CLEAR';
    flash(ticker, 500);
    await travel(scene, P.tick, { layer: pktLayer, r: 4, color: YEL, speed: 90 });
    await intoTheLog(YEL);
    status.textContent = 'cycle: every engine solves the same clear';
    engines.forEach(n => flash(n, 1700));
    await sleep(scene, 1750);
    status.textContent = 'cycle: the leader publishes a burst, and the end of it is lost';
    const burst = Array.from({ length: 7 }, (_, i) => (async () => {
      await sleep(scene, i * 100);
      const lost = i >= 3;
      const dot = await travel(scene, P.egress, { layer: pktLayer, r: 4, color: lost ? REDC : BLUE, speed: 320, stopAt: lost ? .72 : 1, keep: lost });
      if (lost) { xmark(pktLayer, +dot.getAttribute('cx'), +dot.getAttribute('cy'), 6); dot.remove(); } else flash(egress, 200);
    })());
    await Promise.all([...burst, write(P.w1, db1), write(P.w2, db2)]);
    status.textContent = 'cycle: the recorders hold every result; a client asks the API';
    await sleep(scene, 300);
    await apiRead();
  }

  async function telemetryLoop(path, delay) {
    await sleep(scene, delay);
    for (;;) {
      await travel(scene, path, { layer: pktLayer, r: 2, color: GRAYC, speed: 240 });
      flash(perf, 220);
      await sleep(scene, 2300);
    }
  }

  (async () => {
    telemetryLoop(P.tel1, 1400);
    telemetryLoop(P.tel2, 2600);
    for (;;) {
      await orderCycle(); await sleep(scene, 800);
      await orderCycle(); await sleep(scene, 800);
      await clearCycle(); await sleep(scene, 1400);
    }
  })();

  const btn = $('fig1Toggle');
  const sync = () => { btn.textContent = scene.userPaused ? '[ PLAY ]' : '[ PAUSE ]'; };
  btn.addEventListener('click', () => { scene.userPaused = !scene.userPaused; sync(); scene.poke(); });
  sync();
})();


/* =====================================================================
   FIG 2 — what a bid can accept, and what counts as lifted
   ===================================================================== */
(function figLift() {
  const svg = $('svgLift');
  const layer = el('g', {}, svg);
  const state = { acc: new Set(), ic: new Set(), reg: new Set(), hours: 10, steps: 3 };
  const setTo = (set, items) => { set.clear(); items.forEach(i => set.add(i)); };
  const defaults = () => { setTo(state.acc, [0, 1]); setTo(state.ic, [1]); setTo(state.reg, [0]); state.hours = 10; state.steps = 3; };

  const chips = (host, names, set) => names.map((name, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'btn'; b.dataset.name = name;
    b.addEventListener('click', () => { if (set.has(i)) set.delete(i); else set.add(i); render(); });
    host.appendChild(b); host.appendChild(document.createTextNode(' '));
    return b;
  });
  const paintChips = (btns, set) => btns.forEach((b, i) => {
    b.classList.toggle('on', set.has(i));
    b.textContent = (set.has(i) ? '■ ' : '□ ') + b.dataset.name;
  });
  const accBtns = chips($('lfAcc'), ACCELERATORS.map(a => a.name), state.acc);
  const icBtns = chips($('lfIc'), INTERCONNECTS, state.ic);
  const regBtns = chips($('lfReg'), REGIONS, state.reg);

  const hours = $('lfHours'), steps = $('lfSteps');
  hours.addEventListener('input', () => { state.hours = +hours.value; render(); });
  steps.addEventListener('input', () => { state.steps = +steps.value; render(); });
  $('lfReset').addEventListener('click', () => { defaults(); render(); });

  const ROWS = [2, 1, 0, 3, 4];                // the best of a vendor's chain on top
  const BLOCK_X = r => 20 + r * 320, CELL_W = 88, ROW_Y = k => 62 + k * 46, CELL_H = 34;
  const colX = (r, i) => BLOCK_X(r) + 92 + i * 102;

  function render() {
    const accM = mask(state.acc), icM = mask(state.ic), regM = mask(state.reg);
    const accepted = acceptedSkus(accM, icM, regM);
    const taken = new Set(accepted.map(skuIndex));
    const lifted = new Set(accepted.filter(s => isLifted(s, accepted)).map(skuIndex));

    paintChips(accBtns, state.acc); paintChips(icBtns, state.ic); paintChips(regBtns, state.reg);
    hours.value = state.hours; steps.value = state.steps;
    $('lfHoursOut').textContent = state.hours; $('lfStepsOut').textContent = state.steps;

    layer.innerHTML = '';
    REGIONS.forEach((region, r) => {
      const bx = BLOCK_X(r);
      el('text', { x: bx, y: 24, fill: GREEN, 'font-family': 'VT323', 'font-size': 19 }, layer).textContent = region;
      INTERCONNECTS.forEach((ic, i) => {
        el('text', { x: colX(r, i) + CELL_W / 2, y: 46, 'text-anchor': 'middle', fill: GRAYC, 'font-size': 11 }, layer).textContent = ic;
      });
      ROWS.forEach((a, k) => {
        const y = ROW_Y(k);
        el('text', { x: bx + 4, y: y + CELL_H / 2 + 5, fill: GRAYC, 'font-size': 11 }, layer).textContent = ACCELERATORS[a].short;
        INTERCONNECTS.forEach((_, i) => {
          const sku = { a, i, r }, idx = skuIndex(sku);
          const on = taken.has(idx), up = lifted.has(idx);
          el('rect', {
            class: 'cell' + (on && !up ? ' full' : ''), x: colX(r, i), y, width: CELL_W, height: CELL_H,
            ...(up ? { fill: 'rgba(255,255,0,.18)', stroke: YEL } : {}), opacity: on ? 1 : .5,
          }, layer);
          if (on) {
            el('text', { x: colX(r, i) + CELL_W / 2, y: y + CELL_H / 2 + 5, 'text-anchor': 'middle', 'font-family': 'VT323', 'font-size': 16, fill: up ? YEL : GREEN }, layer)
              .textContent = up ? '▲ lifted' : 'accepted';
          }
        });
        // better points up the NVIDIA chain
        if (ACCELERATORS[a].vendor === 'NVIDIA' && k > 0) {
          INTERCONNECTS.forEach((_, i) => {
            el('text', { x: colX(r, i) + CELL_W / 2, y: y - 2, 'text-anchor': 'middle', fill: GRAYC, 'font-size': 8, opacity: .8 }, layer).textContent = '▲';
          });
        }
      });
      ROWS.forEach((a, k) => {
        el('text', { x: colX(r, 0) + CELL_W + 7, y: ROW_Y(k) + CELL_H / 2 + 3, 'text-anchor': 'middle', fill: GRAYC, 'font-size': 8, opacity: .8 }, layer).textContent = '▶';
      });
    });
    el('text', { x: 20, y: 292, fill: GRAYC, 'font-size': 10 }, layer)
      .textContent = '▲ better model (NVIDIA chain) · ▶ better interconnect · AMD and Google models stand alone · regions never compare';

    const empty = !state.acc.size || !state.ic.size || !state.reg.size;
    $('lfMasks').innerHTML = `model mask <b>${bin(accM, 5)}</b> · interconnect mask <b>${bin(icM, 2)}</b> · region mask <b>${bin(regM, 3)}</b> → <b>${accepted.length}</b> of 30 SKUs accepted`
      + (empty ? ' — <span class="bad">EMPTY_MASK: this order would be rejected</span>' : '');
    const items = accepted.length * state.hours, arcs = items + state.steps;
    $('lfArcs').innerHTML = `${accepted.length} SKUs × ${state.hours} hours = <b>${items}</b> items, plus ${state.steps} curve steps = <b>${arcs}</b> arcs — `
      + (arcs <= 980 ? 'within the 980 a buyer may hold' : '<span class="bad">over the 980 a buyer may hold: PARTICIPANT_QUOTA</span>');
    $('lfLift').innerHTML = accepted.length
      ? `<b>${lifted.size}</b> of the ${accepted.length} accepted SKUs would count as lifted if awarded, because an accepted SKU is strictly below them.`
      : 'nothing is accepted, so nothing can be lifted.';
  }
  defaults();
  render();
})();


/* =====================================================================
   FIG 3 — three clears
   ===================================================================== */
(function figCycle() {
  const svg = $('svgCycle'), logEl = $('logCycle');
  const scene = new Scene(svg, { paused: REDUCED });
  const bandLayer = el('g', {}, svg), laneLayer = el('g', {}, svg), saleLayer = el('g', {}, svg), dotLayer = el('g', {}, svg), headLayer = el('g', {}, svg);
  const T0 = 10.5, X0 = 60, PX = 215, AX = 200, LANE_Y = 282, LANE_H = 28;
  const tx = h => X0 + (h - T0) * PX;
  const IDS = [204, 205, 206, 207];
  // A clear sells from the first hour mark after it, as schedule::firstSlotHour does.
  const firstSold = c => Math.floor(c) + 1;

  const bands = IDS.map((id, b) => {
    const rect = el('rect', { x: tx(T0 + b) + 1, y: 78, width: PX - 2, height: AX - 78 - 8, 'stroke-dasharray': '4 3' }, bandLayer);
    const x = tx(T0 + b) + PX / 2;
    const title = el('text', { x, y: 54, 'text-anchor': 'middle', 'font-family': 'VT323', 'font-size': 17 }, bandLayer);
    title.textContent = 'BATCH ' + id;
    const span = el('text', { x, y: 69, 'text-anchor': 'middle', 'font-size': 10 }, bandLayer);
    span.textContent = `takes orders ${clockText(T0 + b)}–${clockText(T0 + b + 1)}`;
    return { rect, title, span };
  });
  const openBand = open => bands.forEach((band, k) => {
    const on = k === open;
    band.rect.setAttribute('fill', on ? 'rgba(61,155,255,.16)' : 'rgba(61,155,255,.04)');
    band.rect.setAttribute('stroke', on ? BLUE : 'rgba(61,155,255,.3)');
    band.title.setAttribute('fill', on ? '#8cc4ff' : 'rgba(61,155,255,.55)');
    band.span.setAttribute('fill', on ? GRAYC : 'rgba(187,187,187,.45)');
  });
  openBand(0);
  el('line', { x1: tx(T0), y1: AX, x2: tx(T0 + 4), y2: AX, stroke: GREEN, 'stroke-width': 2, opacity: .6 }, bandLayer);
  for (let h = 11; h <= 14; h++) {
    el('line', { x1: tx(h), y1: AX - 4, x2: tx(h), y2: AX + 5, stroke: GREEN, 'stroke-width': 2 }, bandLayer);
    el('text', { x: tx(h), y: AX + 22, 'text-anchor': 'middle', fill: GRAYC, 'font-size': 11 }, bandLayer).textContent = h + ':00';
  }
  for (let b = 0; b <= 4; b++) {
    const x = tx(T0 + b);
    el('rect', { x: x - 5, y: AX - 5, width: 10, height: 10, fill: '#020b13', stroke: BLUE, 'stroke-width': 2, transform: `rotate(45 ${x} ${AX})` }, bandLayer);
    el('text', { x, y: AX + 40, 'text-anchor': 'middle', fill: BLUE, 'font-family': 'VT323', 'font-size': 16 }, bandLayer).textContent = clockText(T0 + b);
  }
  const head = el('line', { x1: 0, y1: 44, x2: 0, y2: AX + 8, stroke: YEL, 'stroke-width': 2 }, headLayer);
  const headTxt = el('text', { x: 0, y: 38, 'text-anchor': 'middle', fill: YEL, 'font-family': 'VT323', 'font-size': 17 }, headLayer);

  el('text', { x: X0, y: LANE_Y - 7, fill: GREEN, 'font-family': 'VT323', 'font-size': 16 }, laneLayer).textContent = 'DELIVERY SLOTS';
  const slots = [10, 11, 12, 13, 14].map(h => {
    const x0 = Math.max(tx(h), tx(T0)), x1 = Math.min(tx(h + 1), tx(T0 + 4));
    const rect = el('rect', { x: x0 + 1, y: LANE_Y, width: x1 - x0 - 2, height: LANE_H, 'stroke-width': 1.5 }, laneLayer);
    const text = el('text', { x: (x0 + x1) / 2, y: LANE_Y + LANE_H / 2 + 4, 'text-anchor': 'middle', 'font-size': 10 }, laneLayer);
    text.textContent = `${h}:00–${h + 1}:00`;
    return { h, rect, text };
  });
  const sellsFrom = el('text', { x: 0, y: LANE_Y + LANE_H + 17, fill: GREEN, 'font-size': 11 }, laneLayer);

  // What the open batch can sell: green boxes are on sale to it, gray ones have started or were sold by an earlier batch.
  function showWindow(b) {
    const c = T0 + b + 1, first = firstSold(c);
    slots.forEach(s => {
      const on = s.h >= first;
      s.rect.setAttribute('fill', on ? 'rgba(72,208,75,.18)' : 'rgba(255,255,255,.03)');
      s.rect.setAttribute('stroke', on ? GREEN : '#4a5a55');
      s.text.setAttribute('fill', on ? GREEN : '#74847e');
    });
    saleLayer.innerHTML = '';
    const text = `batch ${IDS[b]} sells from ${clockText(first)}: 47 hourly slots →`;
    const flush = tx(first) + 4 + text.length * 6.8 > 970;
    sellsFrom.setAttribute('x', flush ? 970 : tx(first) + 4);
    sellsFrom.setAttribute('text-anchor', flush ? 'end' : 'start');
    sellsFrom.textContent = text;
    const y = LANE_Y - 16;
    el('line', { x1: tx(c), y1: AX + 48, x2: tx(c), y2: y, stroke: BLUE, 'stroke-dasharray': '2 3', opacity: .6 }, saleLayer);
    el('line', { x1: tx(c), y1: y, x2: tx(first), y2: y, stroke: YEL, 'stroke-width': 2 }, saleLayer);
    [tx(c), tx(first)].forEach(x => el('line', { x1: x, y1: y - 5, x2: x, y2: y + 5, stroke: YEL, 'stroke-width': 2 }, saleLayer));
    el('text', { x: (tx(c) + tx(first)) / 2, y: y - 8, 'text-anchor': 'middle', fill: YEL, 'font-size': 10 }, saleLayer).textContent = 'lead 30 min';
  }

  let gen = 0;
  const lines = [];
  const log = (m, cls = '') => {
    lines.push(`<div class="${cls}">&gt; ${m}</div>`);
    while (lines.length > 8) lines.shift();
    logEl.innerHTML = lines.join('');
  };
  const setHead = t => { const x = tx(t); head.setAttribute('x1', x); head.setAttribute('x2', x); headTxt.setAttribute('x', x); headTxt.textContent = clockText(t); };
  const opens = b => log(`${clockText(T0 + b)}  batch ${IDS[b]} opens: it takes orders until ${clockText(T0 + b + 1)} and sells slots from ${clockText(firstSold(T0 + b + 1))}`, 'dim');

  async function play() {
    for (;;) {
      gen++;
      const my = gen;
      dotLayer.innerHTML = ''; lines.length = 0; logEl.innerHTML = '';
      setHead(T0);
      for (let b = 0; b < 3; b++) {
        const t0 = T0 + b, id = IDS[b], first = firstSold(t0 + 1);
        openBand(b); showWindow(b); opens(b);
        const n = 7 + Math.floor(Math.random() * 4);
        const times = Array.from({ length: n }, () => t0 + 0.05 + Math.random() * 0.88).sort((x, y) => x - y);
        const dots = [];
        let t = t0, i = 0;
        while (t < t0 + 1) {
          await sleep(scene, 16);
          if (my !== gen) return;
          t += 0.0068;
          setHead(Math.min(t, t0 + 1));
          while (i < times.length && times[i] <= t) {
            const bid = Math.random() < 0.6;
            const c = el('circle', { cx: tx(times[i]), cy: 92 + Math.random() * 86, r: 5.5, fill: bid ? BLUE : GREEN, opacity: .9 }, dotLayer);
            dots.push({ c, bid });
            i++;
          }
        }
        // the clear
        const filled = Math.round(dots.length * (0.55 + Math.random() * 0.2));
        const order = dots.map((_, k) => k).sort(() => Math.random() - 0.5);
        const fills = new Set(order.slice(0, filled));
        log(`${clockText(t0 + 1)}  BATCH_CLEAR ${id}: ${dots.length} orders in the batch`, 'hi');
        slots.find(s => s.h === first)?.rect.setAttribute('stroke', YEL);
        dots.forEach((d, k) => {
          if (fills.has(k)) { d.c.setAttribute('stroke', YEL); d.c.setAttribute('stroke-width', 2.5); d.c.setAttribute('r', 7); }
          else { d.c.setAttribute('fill', '#555'); d.c.setAttribute('opacity', .6); }
        });
        await sleep(scene, 500);
        if (my !== gen) return;
        log(`${filled} filled, ${dots.length - filled} lapse. That was the last clear that could sell the ${clockText(first)} slot`);
        await sleep(scene, 1900);
        if (my !== gen) return;
        if (b < 2) dotLayer.innerHTML = '';
      }
      await sleep(scene, 2600);
      if (my !== gen) return;
    }
  }
  play();

  const btn = $('cyToggle');
  const sync = () => { btn.textContent = scene.userPaused ? '[ PLAY ]' : '[ PAUSE ]'; };
  btn.addEventListener('click', () => { scene.userPaused = !scene.userPaused; sync(); scene.poke(); });
  sync();
})();


/* =====================================================================
   FIG 4 — the design's example as a flow
   ===================================================================== */
(function figFlow() {
  const svg = $('svgFlow'), logEl = $('logFlow');
  const scene = new Scene(svg);
  const traceLayer = el('g', {}, svg), nodeLayer = el('g', {}, svg), txtLayer = el('g', {}, svg), pktLayer = el('g', {}, svg);
  const CY = 170, IY = [80, 140, 200, 260];

  node(nodeLayer, { x: 10, y: CY - 35, w: 60, h: 70, title: 'SOURCE' });
  node(nodeLayer, { x: 150, y: CY - 55, w: 132, h: 110, cls: 'blue', title: 'ASK', sub: ['H100 NVLink', 'US_WEST · 4 h', 'cap 4 an hour'] });
  node(nodeLayer, { x: 632, y: CY - 55, w: 132, h: 110, cls: 'blue', title: 'BID', sub: ['A100 or H100', 'NVLink · US_WEST', '10 hours · cap 1'] });
  node(nodeLayer, { x: 900, y: CY - 35, w: 66, h: 70, title: 'SINK' });
  const items = IY.map((y, h) => node(nodeLayer, { x: 352, y: y - 24, w: 210, h: 48, title: 'H100 · HOUR ' + h, sub: 'NVLink · US_WEST' }));
  node(nodeLayer, { x: 352, y: 308, w: 210, h: 68, cls: 'warn', title: '16 MORE ITEMS', sub: ['A100 × 10 h · H100 × 6 h', 'accepted, but nobody offers'] });

  const T = (x, y, s, anchor = 'middle', fill = GRAYC) => {
    const t = el('text', { x, y, 'text-anchor': anchor, fill, 'font-size': 11 }, txtLayer);
    t.textContent = s; return t;
  };
  const lane = (pts, cls = '') => trace(traceLayer, pts, 'dim ' + cls, { vias: false, r: 6 });

  const askLane = [156, 186].map(y => lane([[70, y], [150, y]]));
  const askLbl = [T(110, 150, '8 @ 1800'), T(110, 200, '8 @ 2000')];
  const toItem = IY.map(y => lane([[282, CY], [317, CY], [317, y], [352, y]]));
  const toItemLbl = IY.map(y => T(335, y - 6, 'cap 4'));
  const toBid = IY.map(y => lane([[562, y], [598, y], [598, CY], [632, CY]]));
  const toBidLbl = IY.map(y => T(580, y - 6, 'cap 1'));
  const bidLane = [144, 170, 196].map(y => lane([[764, y], [900, y]]));
  const bidLbl = [T(832, 138, '2 @ 2400'), T(832, 164, '3 @ 2200'), T(832, 190, '5 @ 2000')];
  lane([[562, 342], [698, 342], [698, CY + 55]], 'udp');
  T(14, 336, 'each order is first in line on its own side,', 'start');
  T(14, 352, 'so both have arrival rank 0', 'start');

  let gen = 0;
  const lines = [];
  const log = (m, cls = '') => {
    lines.push(`<div class="${cls}">&gt; ${m}</div>`);
    while (lines.length > 9) lines.shift();
    logEl.innerHTML = lines.join('');
  };
  const lit = p => { p.classList.remove('dim'); p.style.stroke = GREEN; p.style.strokeWidth = 3; };

  function reset() {
    gen++;
    pktLayer.innerHTML = ''; lines.length = 0; logEl.innerHTML = '<div class="dim">&gt; press play</div>';
    [...askLane, ...toItem, ...toBid, ...bidLane].forEach(p => { p.classList.add('dim'); p.style.stroke = ''; p.style.strokeWidth = ''; });
    askLbl[0].textContent = '8 @ 1800'; askLbl[1].textContent = '8 @ 2000';
    toItemLbl.forEach(t => { t.textContent = 'cap 4'; t.setAttribute('fill', GRAYC); });
    toBidLbl.forEach(t => { t.textContent = 'cap 1'; t.setAttribute('fill', GRAYC); });
    ['2 @ 2400', '3 @ 2200', '5 @ 2000'].forEach((s, i) => { bidLbl[i].textContent = s; });
    items.forEach(n => { n._s[0].textContent = 'NVLink · US_WEST'; n._s[0].setAttribute('fill', ''); n.classList.remove('lit'); });
  }

  async function play() {
    reset();
    const my = gen;
    const alive = () => my === gen;
    log('ask: H100 · NVLink · US_WEST, 4 hours, up to 4 nodes at once; 8 @ 1800, then 8 @ 2000', 'dim');
    log('bid: A100 or H100, same, 10 hours, 1 node at a time; 2 @ 2400, 3 @ 2200, 5 @ 2000', 'dim');
    log('graph: 24 nodes and 29 arcs — the bid\'s 20 items and 3 steps, the ask\'s 4 items and 2 steps', 'dim');
    await sleep(scene, 1400); if (!alive()) return;

    let welfare = 0;
    const askUsed = [0, 0], bidUsed = [0, 0, 0];
    for (let u = 0; u < 4; u++) {
      const step = u < 2 ? 0 : 1;
      const bidValue = [2400, 2200][step];
      await travel(scene, askLane[0], { layer: pktLayer, r: 4, speed: 260 }); if (!alive()) return;
      lit(askLane[0]); askUsed[0]++; askLbl[0].textContent = `${askUsed[0]}/8 @ 1800`;
      await travel(scene, toItem[u], { layer: pktLayer, r: 4, speed: 260 }); if (!alive()) return;
      lit(toItem[u]); toItemLbl[u].textContent = '1/4'; toItemLbl[u].setAttribute('fill', GREEN);
      flash(items[u], 500);
      await travel(scene, toBid[u], { layer: pktLayer, r: 4, speed: 260 }); if (!alive()) return;
      lit(toBid[u]); toBidLbl[u].textContent = '1/1'; toBidLbl[u].setAttribute('fill', GREEN);
      await travel(scene, bidLane[step], { layer: pktLayer, r: 4, speed: 300 }); if (!alive()) return;
      lit(bidLane[step]); bidUsed[step]++;
      bidLbl[step].textContent = `${bidUsed[step]}/${[2, 3][step]} @ ${bidValue}`;
      welfare += bidValue - 1800;
      log(`hour ${u}: one unit through the ${bidValue} step and the ask's 1800 → +${bidValue - 1800} (welfare ${welfare})`);
      await sleep(scene, 250); if (!alive()) return;
    }
    await sleep(scene, 500); if (!alive()) return;
    log('optimal: 4 units. A fifth would need an item with supply, and only these four have any', 'hi');
    log('welfare = 2400 + 2400 + 2200 + 2200 − 4 × 1800 = 2000', 'hi');
    await sleep(scene, 1000); if (!alive()) return;

    items.forEach(n => { n._s[0].textContent = 'price 1800'; n._s[0].setAttribute('fill', YEL); flash(n, 600); });
    log('prices: 1800 on each of the four items: the ask\'s own cost, which is the lowest price at which it still sells', 'hi');
    log('the 16 other items did not trade, so they have no price', 'dim');
    await sleep(scene, 1400); if (!alive()) return;
    log('events: 4 FILL then ORDER_DONE for the bid — 4 units, all 4 lifted from A100 to H100, paid 4 × 1800 = 7200');
    log('        the same for the ask: 4 units, received 7200. Then BATCH_DONE: welfare 2000, 8 fills', '');
  }

  $('flPlay').addEventListener('click', play);
  $('flReset').addEventListener('click', reset);
  reset();
  scene.onFirstVisible(() => { if (!REDUCED) play(); });
})();


/* =====================================================================
   FIG 5 — one item: prices and ties
   ===================================================================== */
(function figOne() {
  const svg = $('svgOne');
  const layer = el('g', {}, svg);
  const X0 = 70, W = 860, Y0 = 34, H = 230;

  const SCEN = {
    s1: () => ({ yMax: 24, step: 5,
      intro: 'One buyer wants 2 node-hours at 20, and the seller offers 5 at its cost.',
      bids: [{ n: 'A', steps: [{ q: 2, p: 20 }] }], asks: [{ n: 'X', steps: [{ q: 5, p: 10 }] }],
      knob: { label: 'the ask\'s cost', get: s => s.asks[0].steps[0].p, set: (s, v) => { s.asks[0].steps[0].p = v; }, min: 1, max: 24 } }),
    s2: () => ({ yMax: 35, step: 5,
      intro: 'One unit is on offer at 10. Two buyers want it, at 30 and at 20.',
      bids: [{ n: 'A', steps: [{ q: 1, p: 30 }] }, { n: 'B', steps: [{ q: 1, p: 20 }] }], asks: [{ n: 'X', steps: [{ q: 1, p: 10 }] }],
      knob: { label: 'the losing bid B', get: s => s.bids[1].steps[0].p, set: (s, v) => { s.bids[1].steps[0].p = v; }, min: 1, max: 30 } }),
    s3: () => ({ yMax: 45, step: 10,
      intro: 'A buyer\'s curve falls: 2 node-hours at 40, 3 at 30, 5 at 20. The seller offers 4 at one price.',
      bids: [{ n: 'A', steps: [{ q: 2, p: 40 }, { q: 3, p: 30 }, { q: 5, p: 20 }] }], asks: [{ n: 'X', steps: [{ q: 4, p: 25 }] }],
      knob: { label: 'the ask\'s price', get: s => s.asks[0].steps[0].p, set: (s, v) => { s.asks[0].steps[0].p = v; }, min: 1, max: 45 } }),
    s4: () => ({ yMax: 24, step: 5,
      intro: 'Two identical bids, 20 each, want the one unit on offer at 10.',
      bids: [{ n: 'A', steps: [{ q: 1, p: 20 }] }, { n: 'B', steps: [{ q: 1, p: 20 }] }], asks: [{ n: 'X', steps: [{ q: 1, p: 10 }] }], knob: null }),
  };
  let key = 's1', s = SCEN.s1(), swapped = false;

  const pick = k => {
    key = k; s = SCEN[k](); swapped = false;
    ['s1', 's2', 's3', 's4'].forEach((id, i) => $('onS' + (i + 1)).classList.toggle('on', id === k));
    draw();
  };
  const bidsInOrder = () => swapped ? [s.bids[1], s.bids[0]] : s.bids;

  function draw() {
    layer.innerHTML = '';
    const bids = bidsInOrder();
    const r = clearOneItem(bids, s.asks);
    const U = Math.max(r.bu.length, r.au.length, 3);
    const sx = k => X0 + k * W / U, sy = p => Y0 + H - p * H / s.yMax;

    for (let p = 0; p <= s.yMax; p += s.step) {
      el('line', { x1: X0, y1: sy(p), x2: X0 + W, y2: sy(p), stroke: GREEN, opacity: .12 }, layer);
      el('text', { x: X0 - 8, y: sy(p) + 4, 'text-anchor': 'end', fill: GRAYC, 'font-size': 10 }, layer).textContent = p;
    }
    el('text', { x: X0 - 8, y: 16, 'text-anchor': 'end', fill: GRAYC, 'font-size': 10 }, layer).textContent = 'price';
    el('text', { x: X0 + W, y: Y0 + H + 34, 'text-anchor': 'end', fill: GRAYC, 'font-size': 10 }, layer).textContent = 'node-hours, in order of price (bids from the highest, asks from the lowest)';
    for (let k = 0; k < U; k++) {
      el('text', { x: sx(k + .5), y: Y0 + H + 16, 'text-anchor': 'middle', fill: GRAYC, 'font-size': 10 }, layer).textContent = k + 1;
    }

    // welfare, and the band of supporting prices
    for (let k = 0; k < r.units; k++) {
      el('rect', { x: sx(k), y: sy(r.bu[k].p), width: W / U, height: Math.max(sy(r.au[k].p) - sy(r.bu[k].p), 0), fill: 'rgba(72,208,75,.2)' }, layer);
    }
    if (r.units) {
      const hi = Math.min(r.bu[r.units - 1].p, r.units < r.au.length ? r.au[r.units].p : s.yMax);
      if (hi > r.price) el('rect', { x: X0, y: sy(hi), width: W, height: sy(r.price) - sy(hi), fill: 'rgba(255,255,0,.10)' }, layer);
      el('line', { x1: X0, y1: sy(r.price), x2: X0 + W, y2: sy(r.price), stroke: YEL, 'stroke-width': 2 }, layer);
      el('text', { x: X0 + W - 6, y: sy(r.price) - 6, 'text-anchor': 'end', fill: YEL, 'font-family': 'VT323', 'font-size': 18 }, layer).textContent = 'price ' + r.price;
      if (hi > r.price) {
        el('text', { x: X0 + W - 6, y: sy(hi) + 13, 'text-anchor': 'end', fill: YEL, 'font-size': 10, opacity: .85 }, layer)
          .textContent = `every price up to ${hi} supports this trade; the clear reports the lowest`;
      }
    }

    // the two staircases
    const stair = (units, color, above) => {
      units.forEach((u, k) => {
        const traded = k < r.units, y = sy(u.p);
        el('line', { x1: sx(k) + 3, y1: y, x2: sx(k + 1) - 3, y2: y, stroke: color, 'stroke-width': traded ? 4 : 2.5, 'stroke-dasharray': traded ? '0' : '5 4', opacity: traded ? 1 : .75 }, layer);
        if (k + 1 < units.length) el('line', { x1: sx(k + 1), y1: y, x2: sx(k + 1), y2: sy(units[k + 1].p), stroke: color, opacity: .35 }, layer);
        if (k === 0 || units[k - 1].rank !== u.rank) {
          el('text', { x: sx(k + .5), y: y + (above ? -8 : 17), 'text-anchor': 'middle', fill: color, 'font-size': 10 }, layer)
            .textContent = u.tag;
        }
      });
    };
    r.bu.forEach(u => { u.tag = bids[u.rank].n + ' · rank ' + u.rank; });
    r.au.forEach(u => { u.tag = s.asks[u.rank].n + ' · rank ' + u.rank; });
    stair(r.bu, BLUE, true);
    stair(r.au, GREEN, false);
    el('text', { x: X0 + W - 6, y: Y0 + H - 26, 'text-anchor': 'end', fill: BLUE, 'font-size': 10 }, layer).textContent = '━ bids (dashed: does not trade)';
    el('text', { x: X0 + W - 6, y: Y0 + H - 11, 'text-anchor': 'end', fill: GREEN, 'font-size': 10 }, layer).textContent = '━ asks';

    // readouts
    const knob = s.knob;
    $('onKnobLbl').textContent = knob ? `${knob.label}: ${knob.get(s)}` : 'arrival order: ' + bids.map(b => b.n).join(' then ');
    $('onMinus').style.display = $('onPlus').style.display = knob ? '' : 'none';
    $('onSwap').style.display = knob ? 'none' : '';
    $('onOut').innerHTML = `units traded <b>${r.units}</b> · welfare <b>${r.welfare}</b> · price <b>${r.price === null ? 'none' : r.price}</b> · rank sum <b>${r.tieCost}</b>`
      + (r.units ? ' — ' + bids.map((b, k) => r.bidUnits[k] ? `${b.n} gets ${r.bidUnits[k]}` : `${b.n} gets nothing`).join(', ') : '');
    let why;
    if (!r.units) why = 'The best bid is below the lowest ask, so nothing trades and there is no price.';
    else {
      const loser = r.units < r.bu.length ? r.bu[r.units].p : 0;
      const ask = r.au[r.units - 1].p;
      why = loser > ask ? `The price is ${loser}, the highest bid that missed out: any lower and that buyer would want the unit too.`
        : loser === ask ? `The price is ${ask}: the ask's cost, and also the highest bid that missed out.`
        : `The price is ${ask}, the ask's own cost: the lowest price at which the last unit still sells, and no bid that missed out would pay more.`;
      if (key === 's4') why += ` ${bids[0].n} arrived first (rank 0), so ${bids[0].n} gets the unit; swap the arrival order and ${bids[1].n} does. Welfare, price and units do not change.`;
    }
    $('onWhy').textContent = s.intro + ' ' + why;
  }

  ['s1', 's2', 's3', 's4'].forEach((id, i) => $('onS' + (i + 1)).addEventListener('click', () => pick(id)));
  const nudge = d => { const k = s.knob; if (!k) return; k.set(s, Math.min(k.max, Math.max(k.min, k.get(s) + d))); draw(); };
  $('onMinus').addEventListener('click', () => nudge(-1));
  $('onPlus').addEventListener('click', () => nudge(1));
  $('onSwap').addEventListener('click', () => { swapped = !swapped; draw(); });
  pick('s1');
})();


/* =====================================================================
   FIG 6 — clear time against batch size
   ===================================================================== */
(function figSolver() {
  const svg = $('svgSolver');
  const SIZES = [100, 500, 1000, 2000, 5000, 10000];
  // milliseconds; null is a run killed at 30 s. Network simplex and the reference: Bench/run_sweep.sh, 2026-10-10.
  // Primal-dual is from its original sweep (2026-10-06), because its code has been deleted.
  const FAMILIES = [
    { ns: [0.67, 3.52, 8.29, 22.09, 80.55, 240.61], ssp: [2.38, 84.30, 381.74, 1564.01, 11577.78, null], pd: [2.5, 97, 425, 1740, 14300, null],
      note: 'uniform batches: random prices from 1 to 2,000 ticks, an ask for every five bids, 5 items offered per ask and 20 accepted per bid' },
    { ns: [0.11, 0.49, 1.23, 2.76, 8.35, 19.79], ssp: [0.75, 20.67, 92.25, 407.29, 2766.90, 11567.42], pd: [1.2, 34, 161, 765, 5320, 22000],
      note: 'ERCOT-shaped batches, each order naming one item' },
    { ns: [0.26, 2.24, 7.26, 23.18, 96.97, 414.98], ssp: [4.04, 159.18, 876.04, 4118.22, null, null], pd: [5.2, 211, 844, 4400, null, null],
      note: 'ERCOT-shaped batches, 5 items offered and 5 accepted' },
    { ns: [0.53, 4.86, 11.87, 47.84, 173.14, 1026.08], ssp: [6.84, 305.98, 1675.80, 7684.59, null, null], pd: [7.0, 307, 1140, 5120, null, null],
      note: 'ERCOT-shaped batches, 5 items offered and 20 accepted' },
  ];
  const SERIES = [
    { id: 'ns', name: 'network simplex (production)', color: GREEN, width: 3.5, dash: '0', r: 4.5 },
    { id: 'ssp', name: 'successive shortest paths (the reference)', color: GRAYC, width: 2, dash: '0', r: 3.5 },
    { id: 'pd', name: 'primal-dual, exact variant (earlier run)', color: YEL, width: 2, dash: '6 4', r: 3.5 },
  ];
  const fmt = ms => ms === null ? '> 30 s'
    : ms < 1 ? ms.toFixed(2) + ' ms'
    : ms < 100 ? ms.toFixed(1) + ' ms'
    : ms < 1000 ? Math.round(ms) + ' ms'
    : ms < 10000 ? (ms / 1000).toFixed(2) + ' s'
    : (ms / 1000).toFixed(1) + ' s';

  const X0 = 90, W = 840, Y0 = 20, H = 290, LO = -1, HI = 4.7;
  const sx = b => X0 + (Math.log10(b) - 2) / 2 * W;
  const sy = ms => Y0 + H - (Math.log10(ms) - LO) / (HI - LO) * H;
  const KILL = 30000;

  function draw(f) {
    svg.innerHTML = '';
    const layer = el('g', {}, svg);
    [0.1, 1, 10, 100, 1000, 10000].forEach(ms => {
      el('line', { x1: X0, y1: sy(ms), x2: X0 + W, y2: sy(ms), stroke: GREEN, opacity: .13 }, layer);
      el('text', { x: X0 - 8, y: sy(ms) + 4, 'text-anchor': 'end', fill: GRAYC, 'font-size': 10 }, layer).textContent = ms < 1 ? ms + ' ms' : ms < 1000 ? ms + ' ms' : ms / 1000 + ' s';
    });
    SIZES.forEach(b => {
      el('line', { x1: sx(b), y1: Y0, x2: sx(b), y2: Y0 + H, stroke: GREEN, opacity: .09 }, layer);
      el('text', { x: sx(b), y: Y0 + H + 18, 'text-anchor': 'middle', fill: GRAYC, 'font-size': 10 }, layer).textContent = b.toLocaleString('en-US');
    });
    el('text', { x: X0 + W / 2, y: Y0 + H + 40, 'text-anchor': 'middle', fill: GRAYC, 'font-size': 10 }, layer).textContent = 'bids in the batch';
    el('text', { x: 14, y: Y0 + 4, fill: GRAYC, 'font-size': 10 }, layer).textContent = 'clear time';
    el('line', { x1: X0, y1: sy(KILL), x2: X0 + W, y2: sy(KILL), stroke: REDC, 'stroke-dasharray': '6 4', opacity: .6 }, layer);
    el('text', { x: X0 + W - 4, y: sy(KILL) - 5, 'text-anchor': 'end', fill: REDC, 'font-size': 10 }, layer).textContent = 'killed at 30 s';

    SERIES.slice().reverse().forEach(sr => {
      const ys = f[sr.id];
      let prev = null;
      ys.forEach((ms, i) => {
        const x = sx(SIZES[i]), y = ms === null ? sy(KILL) : sy(ms);
        if (prev) el('line', { x1: prev.x, y1: prev.y, x2: x, y2: y, stroke: sr.color, 'stroke-width': sr.width, 'stroke-dasharray': ms === null ? '2 5' : sr.dash }, layer);
        if (ms === null) {
          const t = el('path', { d: `M${x} ${y - 7} L${x + 7} ${y + 5} L${x - 7} ${y + 5} Z`, fill: sr.color }, layer);
          el('title', {}, t).textContent = `${sr.name}: killed at 30 s with ${SIZES[i].toLocaleString('en-US')} bids`;
        } else {
          const c = el('circle', { cx: x, cy: y, r: sr.r, fill: '#020b13', stroke: sr.color, 'stroke-width': 2 }, layer);
          el('title', {}, c).textContent = `${sr.name}: ${fmt(ms)} with ${SIZES[i].toLocaleString('en-US')} bids`;
        }
        prev = { x, y };
      });
    });
    SERIES.forEach((sr, i) => {
      const y = Y0 + 14 + i * 17;
      el('line', { x1: X0 + 14, y1: y - 4, x2: X0 + 40, y2: y - 4, stroke: sr.color, 'stroke-width': sr.width, 'stroke-dasharray': sr.dash }, layer);
      el('text', { x: X0 + 48, y, fill: sr.color, 'font-size': 11 }, layer).textContent = sr.name;
    });

    $('slNote').textContent = f.note;
  }

  ['slF1', 'slF2', 'slF3', 'slF4'].forEach((id, i) => $(id).addEventListener('click', () => {
    ['slF1', 'slF2', 'slF3', 'slF4'].forEach((o, j) => $(o).classList.toggle('on', j === i));
    draw(FAMILIES[i]);
  }));
  draw(FAMILIES[0]);
})();


/* =====================================================================
   FIG 7 — the trace of the clear
   ===================================================================== */
(function figTrace() {
  const svg = $('svgTrace');
  const scene = new Scene(svg, { paused: REDUCED });
  const traceLayer = el('g', {}, svg), markerLayer = el('g', {}, svg), nodeLayer = el('g', {}, svg), pktLayer = el('g', {}, svg);
  const X = [70, 330, 590, 850], Y = 74;
  const segs = [
    [[X[0], Y], [X[0], 62], [X[1], 62], [X[1], Y]],
    [[X[1], Y], [X[1], 86], [X[2], 86], [X[2], Y]],
    [[X[2], Y], [X[2], 62], [X[3], 62], [X[3], Y]],
  ].map(p => trace(traceLayer, p, '', { vias: false, r: 6 }));
  const names = ['ingress_tai_ns', 'replica_ingress_tai_ns', 'engine_pop_tai_ns', 'match_done_tai_ns'];
  const descs = ['gateway socket read', 'replica receiver sees the packet', 'matching thread pops the command', 'the engine stamps it itself'];
  const markers = X.map((x, i) => {
    const m = el('rect', { x: x - 6, y: Y - 6, width: 12, height: 12, class: 'marker' }, markerLayer);
    el('text', { class: 'stamp-t', x, y: 112 }, markerLayer).textContent = names[i];
    el('text', { class: 'stamp-s', x, y: 127 }, markerLayer).textContent = descs[i];
    el('text', { class: 'stamp-s', x, y: 141, fill: GRAYC }, markerLayer).textContent = 'T' + i;
    return m;
  });
  const seg = (x, y, t, strong) => {
    const e = el('text', { class: 'seg-t', x, y }, svg); e.textContent = t;
    if (strong) e.style.fill = GREEN; return e;
  };
  seg((X[0] + X[1]) / 2, 54, 'NetworkDelayNs = T1 − T0');
  seg((X[1] + X[2]) / 2, 106 - 12, 'QueuingDelayNs = T2 − T1');
  seg((X[2] + X[3]) / 2, 54, 'EngineExecutionNs = T3 − T2  ← the whole clear', true);

  frameBox(traceLayer, 300, 160, 630, 92, 'EXT_COUNTERS — the clear\'s statistics, written just before the end stamp');
  ['LiftedUnits', 'BidsFilled', 'BidsUnfilled', 'SolverPivots'].forEach((name, i) => {
    node(nodeLayer, { x: 316 + i * 152, y: 192, w: 140, h: 48, title: name, sub: `ext_counters[${i}]`, cls: 'blue' });
  });
  el('text', { x: 300, y: 272, fill: GRAYC, 'font-size': 10 }, nodeLayer).textContent = 'every other command\'s trace has all four at zero, so a reused slot never shows an old clear';

  // a measured clear, to scale: 10,000 bids, 7,500 asks, 262,895 arcs (build 26.4 ms, solve 992.4 ms, prices 4.6 ms)
  const total = 1026.08, BX = 70, BW = 840, BY = 302;
  const ms = [26.36, 992.35, 4.56];
  const w = ms.map(m => m / total * BW);
  let at = BX;
  [GRAYC, GREEN, YEL].forEach((c, i) => {
    el('rect', { x: at, y: BY, width: Math.max(w[i], 2), height: 22, fill: c, opacity: .75 }, nodeLayer);
    at += w[i];
  });
  el('text', { x: BX, y: BY - 12, fill: GRAYC, 'font-size': 11 }, nodeLayer).textContent = 'one measured clear, to scale: 10,000 bids, 7,500 asks, 262,895 arcs — clear() took 1,026 ms';
  el('text', { x: BX, y: BY + 42, fill: GRAYC, 'font-size': 11 }, nodeLayer).textContent = 'build the graph 26 ms';
  el('text', { x: BX + BW / 2, y: BY + 42, 'text-anchor': 'middle', fill: GREEN, 'font-size': 11 }, nodeLayer).textContent = 'network simplex and the certificate 992 ms';
  el('text', { x: BX + BW, y: BY + 42, 'text-anchor': 'end', fill: YEL, 'font-size': 11 }, nodeLayer).textContent = 'price search 4.6 ms';
  el('text', { x: BX, y: BY + 60, fill: GRAYC, 'font-size': 10, opacity: .8 }, nodeLayer).textContent = 'not in the bar: emitting the events, and any wait for the event queue — also inside T3 − T2';

  (async () => {
    for (;;) {
      markers.forEach(m => m.classList.remove('lit'));
      markers[0].classList.add('lit');
      for (let i = 0; i < 3; i++) {
        await travel(scene, segs[i], { layer: pktLayer, r: 4, speed: 210 });
        markers[i + 1].classList.add('lit');
      }
      await sleep(scene, 1600);
    }
  })();

  const btn = $('trToggle');
  const sync = () => { btn.textContent = scene.userPaused ? '[ PLAY ]' : '[ PAUSE ]'; };
  btn.addEventListener('click', () => { scene.userPaused = !scene.userPaused; sync(); scene.poke(); });
  sync();
})();


return R.unmount;
}
