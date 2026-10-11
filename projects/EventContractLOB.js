// Behavior for the EventContractLOB explainer. Loaded by script.js via import(); mount(root) wires up the
// figures inside root and returns unmount(), which script.js calls when the panel is replaced.
import { createRuntime } from './shared/explainer.js';

export function mount(root) {
const R = createRuntime(root);
const { $, el, Scene, sleep, travel, trace, node, label, frameBox, flash, xmark, REDUCED } = R;
const { GREEN, BLUE, YEL, GRAYC, REDC } = R.colors;
R.todoIndex();

/* =====================================================================
   FIG 1 — what the LOB plugs into Core
   ===================================================================== */
(function figPlug() {
  const svg = $('svgPlug');
  const scene = new Scene(svg, { paused: REDUCED });
  const traceLayer = el('g', {}, svg), nodeLayer = el('g', {}, svg), pktLayer = el('g', {}, svg);
  const X = [10, 256, 502, 748], W = 220;

  const cap = (x, y, s, fill) => {
    const t = el('text', { x, y, fill, 'font-family': 'VT323', 'font-size': 17 }, nodeLayer);
    t.textContent = s;
  };
  cap(10, 28, 'TOYEXCHANGE · CORE — generic templates', GREEN);
  cap(10, 226, 'EVENTCONTRACTLOB — what this repo supplies', BLUE);

  const core = [
    node(nodeLayer, { x: X[0], y: 40, w: W, h: 72, title: 'NetworkGateway', sub: ['<TProtocolHandler, TCommand>', 'sequences + replicates'] }),
    node(nodeLayer, { x: X[1], y: 40, w: W, h: 72, title: 'MatchingService', sub: ['<TCommand, TEngine>', 'pop → submit_order()'] }),
    node(nodeLayer, { x: X[2], y: 40, w: W, h: 72, title: 'EgressGateway', sub: ['<TGateway, TEvent, TEncoder>', 'fence · ack · broadcast'] }),
    node(nodeLayer, { x: X[3], y: 40, w: W, h: 72, title: 'OrderTrace', sub: ['ext_counters[4]', 'opaque int32 slots'] }),
  ];
  const lob = [
    node(nodeLayer, { x: X[0], y: 240, w: W, h: 72, cls: 'blue', title: 'OuchProtocolHandler', sub: ['+ OuchOrderCommand', 'OUCH 4.2 frames → commands'] }),
    node(nodeLayer, { x: X[1], y: 240, w: W, h: 72, cls: 'blue', title: 'OrderBook', sub: ['submit_order(cmd)', 'price-time matching'] }),
    node(nodeLayer, { x: X[2], y: 240, w: W, h: 72, cls: 'blue', title: 'OuchEventEncoder', sub: ['OrderEvent → wire frame', 'encode() / print()'] }),
    node(nodeLayer, { x: X[3], y: 240, w: W, h: 72, cls: 'blue', title: 'LobExtSlot', sub: ['PriceLevelsTouched = 0', 'RestingOrdersTouched = 1'] }),
  ];
  X.forEach(x => {
    const cx = x + W / 2;
    trace(traceLayer, [[cx, 112], [cx, 146], [cx + 24, 146], [cx + 24, 206], [cx, 206], [cx, 240]], 'udp', { r: 6 });
  });
  label(svg, X[0] + W / 2 + 34, 180, 'plugs in', { cls: 'udp' });

  const flows = [
    // the gap between columns is only 40 wide, so the jog is a small step in the middle
    trace(traceLayer, [[X[0] + W, 76], [X[0] + W + 10, 76], [X[0] + W + 10, 88], [X[1] - 10, 88], [X[1] - 10, 76], [X[1], 76]], '', { r: 4 }),
    trace(traceLayer, [[X[1] + W, 76], [X[1] + W + 10, 76], [X[1] + W + 10, 88], [X[2] - 10, 88], [X[2] - 10, 76], [X[2], 76]], '', { r: 4 }),
  ];

  const both = i => { flash(core[i], 700); flash(lob[i], 700); };
  (async () => {
    for (;;) {
      both(0); await sleep(scene, 700);
      await travel(scene, flows[0], { layer: pktLayer, r: 5, color: BLUE, speed: 170 });
      both(1); both(3); await sleep(scene, 900);
      await travel(scene, flows[1], { layer: pktLayer, r: 5, color: BLUE, speed: 170 });
      both(2); await sleep(scene, 2000);
    }
  })();
})();

/* =====================================================================
   FIG 2 — matching, traced from two product tests
   ===================================================================== */
(function figSweep() {
  const svg = $('svgSweep'), logEl = $('logSweep');
  const scene = new Scene(svg);
  const layer = el('g', {}, svg);
  const UNIT = 2.3, X0 = 110, ROWS = [52, 51, 50];
  const ROW_Y = { 52: 30, 51: 96, 50: 162 }, ROW_H = 54;
  const FIRM = { A: GREEN, B: BLUE };

  // Both scenarios are lifted from tests in ProductTesting.cpp:
  //   sweep — SweepAcrossThreeLevelsWithFinalPartialFillProducesThreeFillPairs
  //   stp   — EarlierFillsAgainstOtherFirmsStillFireBeforeHittingOwnOrder
  const SCENARIOS = {
    sweep: { desc: 'BID 250 @ 52', firm: 'B', qty: 250,
             book: { 50: [{ firm: 'A', qty: 100 }], 51: [{ firm: 'A', qty: 100 }], 52: [{ firm: 'A', qty: 100 }] } },
    stp:   { desc: 'BID 100 @ 50', firm: 'A', qty: 100,
             book: { 50: [{ firm: 'B', qty: 40 }, { firm: 'A', qty: 60 }] } },
  };

  let gen = 0;
  const lines = [];
  const log = (m, cls = '') => {
    lines.push(`<div class="${cls}">&gt; ${m}</div>`);
    while (lines.length > 7) lines.shift();
    logEl.innerHTML = lines.join('');
  };

  function build(scn) {
    gen++;
    layer.innerHTML = ''; lines.length = 0; logEl.innerHTML = '<div class="dim">&gt; press a play button</div>';
    const chips = [];
    ROWS.forEach(p => {
      el('rect', { class: 'cell', x: 64, y: ROW_Y[p], width: 620, height: ROW_H }, layer);
      el('text', { class: 'cell-t', x: 34, y: ROW_Y[p] + 33 }, layer).textContent = p;
      let x = X0;
      (scn.book[p] || []).forEach(o => {
        const w = o.qty * UNIT;
        const rect = el('rect', { x, y: ROW_Y[p] + 8, width: w, height: ROW_H - 16,
          fill: 'rgba(2,11,19,.9)', stroke: FIRM[o.firm], 'stroke-width': 2 }, layer);
        const text = el('text', { x: x + 8, y: ROW_Y[p] + 33, fill: FIRM[o.firm], 'font-family': 'VT323', 'font-size': 17 }, layer);
        text.textContent = `${o.firm} · ${o.qty}`;
        chips.push({ price: p, firm: o.firm, qty: o.qty, x, rect, text });
        x += w + 8;
      });
    });
    el('text', { x: 64, y: 228, fill: GRAYC, 'font-size': 11 }, layer)
      .textContent = 'ASK LADDER — lowest price is best; within a level the leftmost order is first in line (FIFO). Colour = firm.';
    const aggr = node(layer, { x: 730, y: 72, w: 220, h: 104, title: 'AGGRESSOR', sub: [scn.desc, 'firm ' + scn.firm, 'remaining ' + scn.qty] });
    return { chips, aggr };
  }

  const route = (chip, endX) => {
    const cy = ROW_Y[chip.price] + ROW_H / 2;
    return trace(layer, [[730, 124], [706, 124], [706, cy], [endX, cy]], 'udp', { vias: false, r: 8 });
  };

  async function run(name) {
    const scn = SCENARIOS[name];
    const { chips, aggr } = build(scn);
    const my = gen;
    let rem = scn.qty;
    log(`${scn.desc} arrives (firm ${scn.firm}). Trades print at the RESTING order's price.`, 'dim');
    await sleep(scene, 800);

    const queue = chips.slice().sort((a, b) => a.price - b.price);   // best price first; sort is stable, so FIFO holds within a level
    for (const chip of queue) {
      if (my !== gen) return;
      if (rem === 0) break;

      if (chip.firm === scn.firm) {
        // self-trade prevention: hard stop, the resting order is left alone
        const p = route(chip, chip.x - 4);
        const dot = await travel(scene, p, { layer, r: 5, color: REDC, speed: 380, keep: true });
        if (my !== gen) return;
        xmark(layer, +dot.getAttribute('cx') - 6, +dot.getAttribute('cy'), 8);
        dot.remove(); p.parentNode.remove();
        aggr.classList.add('dead'); aggr._t.textContent = 'AGGRESSOR · REJECTED';
        log(`next resting order is firm ${chip.firm} — the aggressor's own firm`, 'err');
        log(`REJECTED SELF_TRADING_PREVENTION: the remaining ${rem} is not traded`, 'err');
        log(`resting ${chip.firm} · ${chip.qty} @${chip.price} is untouched`, 'hi');
        return;
      }

      const take = Math.min(chip.qty, rem);
      const p = route(chip, chip.x + chip.qty * UNIT + 4);
      await travel(scene, p, { layer, r: 5, color: BLUE, speed: 380 });
      p.parentNode.remove();
      if (my !== gen) return;
      const from = chip.qty;
      for (let i = 1; i <= 10; i++) {
        chip.rect.setAttribute('width', Math.max((from - take * i / 10) * UNIT, 0));
        await sleep(scene, 26);
        if (my !== gen) return;
      }
      chip.qty = from - take; rem -= take;
      chip.text.textContent = chip.qty > 0 ? `${chip.firm} · ${chip.qty}` : '';
      if (chip.qty === 0) chip.rect.setAttribute('stroke-width', 0);
      aggr._s[2].textContent = 'remaining ' + rem;
      log(`fill ${take} @${chip.price} — resting order leaves ${chip.qty}, taker leaves ${rem}   (2 EXECUTED events, one match_id)`);
      await sleep(scene, 450);
    }
    if (my !== gen) return;
    const left = chips.filter(c => c.qty > 0).map(c => `${c.qty} @${c.price}`).join(', ') || 'none';
    log(rem === 0 ? 'taker fully filled — nothing rests' : `taker has ${rem} left`, 'hi');
    log(`asks left in the book: ${left}`, 'hi');
  }

  $('swPlay1').addEventListener('click', () => run('sweep'));
  $('swPlay2').addEventListener('click', () => run('stp'));
  build(SCENARIOS.sweep);
  scene.onFirstVisible(() => { if (!REDUCED) run('sweep'); });
})();


/* =====================================================================
   FIG 3 — occupancy bitmap (interactive)
   ===================================================================== */
(function fig6() {
  const LEVELS = 101;
  const state = { ask: new Set(), bid: new Set() };
  const defaults = () => { state.ask = new Set([44, 47, 60, 72]); state.bid = new Set([38, 40, 41]); };
  defaults();

  const ticks = $('bmTicks');
  for (let i = 0; i < LEVELS; i++) {
    const s = document.createElement('span');
    s.textContent = i % 10 === 0 ? i : '';
    ticks.appendChild(s);
  }
  const rows = {
    ask: { cells: $('bmAsk'), out: $('bmAskOut'), btns: [] },
    bid: { cells: $('bmBid'), out: $('bmBidOut'), btns: [] },
  };
  for (const side of ['ask', 'bid']) {
    for (let p = 0; p < LEVELS; p++) {
      const b = document.createElement('button');
      b.type = 'button'; b.title = 'price ' + p; b.setAttribute('aria-label', side + ' level ' + p);
      b.addEventListener('click', () => { const s = state[side]; s.has(p) ? s.delete(p) : s.add(p); render(); });
      rows[side].cells.appendChild(b); rows[side].btns.push(b);
    }
  }
  const words = set => {
    let w0 = 0n, w1 = 0n;
    set.forEach(p => { if (p < 64) w0 |= 1n << BigInt(p); else w1 |= 1n << BigInt(p - 64); });
    return [w0, w1];
  };
  const bitLen = x => x.toString(2).length;
  const ctz = x => bitLen(x & -x) - 1;
  const hex = x => '0x' + x.toString(16).padStart(16, '0');
  const findFirst = ([w0, w1]) => w0 ? ctz(w0) : (w1 ? 64 + ctz(w1) : null);
  const findLast = ([w0, w1]) => w1 ? 64 + bitLen(w1) - 1 : (w0 ? bitLen(w0) - 1 : null);

  function render() {
    const wa = words(state.ask), wb = words(state.bid);
    const ba = findFirst(wa), bb = findLast(wb);
    rows.ask.btns.forEach((b, p) => { b.classList.toggle('on', state.ask.has(p)); b.classList.toggle('best', p === ba); });
    rows.bid.btns.forEach((b, p) => { b.classList.toggle('on', state.bid.has(p)); b.classList.toggle('best', p === bb); });
    rows.ask.out.innerHTML = `chunk[0] = ${hex(wa[0])} &nbsp; chunk[1] = ${hex(wa[1])} &nbsp;→&nbsp; find_first_level() = <b>${ba === null ? 'INVALID_PRICE (255)' : ba}</b>`;
    rows.bid.out.innerHTML = `chunk[0] = ${hex(wb[0])} &nbsp; chunk[1] = ${hex(wb[1])} &nbsp;→&nbsp; find_last_level() = <b>${bb === null ? 'INVALID_PRICE (255)' : bb}</b>`;
    const sp = $('bmSpread');
    if (ba === null || bb === null) sp.innerHTML = 'spread = <b>INVALID_PRICE</b> (one side is empty)';
    else if (ba < bb) sp.innerHTML = `best ask ${ba} &lt; best bid ${bb}: these would cross and trade immediately — the spread reports <b>INVALID_PRICE</b> for a crossed book`;
    else sp.innerHTML = `spread = ${ba} − ${bb} = <b>${ba - bb}</b>`;
  }
  $('bmReset').addEventListener('click', () => { defaults(); render(); });
  render();
})();


/* =====================================================================
   FIG 4 — price level + pool (static)
   ===================================================================== */
(function fig7() {
  const svg = $('svg7');
  const traceLayer = el('g', {}, svg), nodeLayer = el('g', {}, svg);

  node(nodeLayer, { x: 20, y: 60, w: 190, h: 110, title: 'PRICE LEVEL · 47',
    sub: ['m_head → slot 3', 'm_tail → slot 8', 'm_resting_quantity = 130'] });
  const chain = [
    { slot: 3, id: '#1041', qty: 40, prev: '—', next: '17' },
    { slot: 17, id: '#1050', qty: 60, prev: '3', next: '8' },
    { slot: 8, id: '#1057', qty: 30, prev: '17', next: '—' },
  ];
  const BW = 150, GAP = 25, bx = i => 250 + i * (BW + GAP), by = 60, BH = 78;
  chain.forEach((o, i) => {
    node(nodeLayer, { x: bx(i), y: by, w: BW, h: BH, title: `SLOT ${o.slot}`,
      sub: [`${o.id} · qty ${o.qty}`, `prev ${o.prev} · next ${o.next}`], cls: i === 0 ? 'blue' : '' });
  });
  // head arrow (to the front of the queue), tail arrow (to the back)
  trace(traceLayer, [[210, 84], [230, 84], [230, 92], [bx(0), 92]], '', { r: 5 });
  trace(traceLayer, [[210, 150], [230, 150], [230, 206], [bx(2) + 50, 206], [bx(2) + 50, by + BH]], '', { r: 6 });
  // next links (forward) and prev links (back)
  for (let i = 0; i < 2; i++) {
    trace(traceLayer, [[bx(i) + BW, 84], [bx(i + 1), 84]], 'udp', { vias: false, r: 4 });
    trace(traceLayer, [[bx(i + 1), 118], [bx(i) + BW, 118]], 'hb', { vias: false, r: 4 });
  }
  const t = (x, y, s, a = 'middle') => { const e = el('text', { class: 'lane-label', x, y, 'text-anchor': a }, svg); e.textContent = s; return e; };
  t(bx(0) + BW + GAP / 2, 78, 'next'); t(bx(0) + BW + GAP / 2, 132, 'prev');
  t(bx(1) + BW + GAP / 2, 78, 'next'); t(bx(1) + BW + GAP / 2, 132, 'prev');
  t(bx(0), 50, 'head — first in line', 'start');
  t(240, 224, 'tail — O(1) append', 'start');

  // free pool (a stack: the top slot is handed out next)
  const px = 800, PW = 150;
  el('text', { x: px + PW / 2, y: 38, 'text-anchor': 'middle', fill: GREEN, 'font-family': 'VT323', 'font-size': 18 }, nodeLayer).textContent = 'FREE POOL · stack';
  ['slot 5', 'slot 12', 'slot 0', '…'].forEach((s, i) => {
    const y = 52 + i * 36;
    el('rect', { class: 'cell' + (i === 0 ? ' full' : ''), x: px, y, width: PW, height: 30 }, nodeLayer);
    el('text', { class: 'cell-t', x: px + PW / 2 + 8, y: y + 21 }, nodeLayer).textContent = s;
    if (i === 0) el('text', { x: px + 8, y: y + 19, fill: YEL, 'font-size': 11 }, nodeLayer).textContent = '▸ top';
  });
  // insert (pop) and release (push) routes
  trace(traceLayer, [[px, 67], [px - 24, 67], [px - 24, by + 39], [bx(2) + BW, by + 39]], 'udp', { r: 6 });
  trace(traceLayer, [[bx(2) + BW - 30, by + BH], [bx(2) + BW - 30, 250], [px + PW / 2, 250], [px + PW / 2, 52 + 3 * 36 + 30]], 'hb', { r: 6 });
  label(svg, 770, 48, 'insert: pop a slot, link at tail', { cls: 'udp', anchor: 'end' });
  label(svg, 600, 268, 'fill / cancel: unlink, push the slot back', { cls: 'hb', anchor: 'middle' });
})();


return R.unmount;
}
