// Behavior for the ToyExchange Core explainer. Loaded by script.js via import(); mount(root) wires up the
// figures inside root and returns unmount(), which script.js calls when the panel is replaced.
import { createRuntime } from './shared/explainer.js';

export function mount(root) {
const R = createRuntime(root);
const { $, el, Scene, sleep, travel, trace, node, label, frameBox, flash, xmark, REDUCED } = R;
const { GREEN, BLUE, YEL, GRAYC, REDC } = R.colors;
R.todoIndex();

/* =====================================================================
   FIG 1 — system topology
   ===================================================================== */
(function fig1() {
  const svg = $('svg1');
  const scene = new Scene(svg, { paused: REDUCED });
  const traceLayer = el('g', {}, svg);
  const nodeLayer = el('g', {}, svg);
  const pktLayer = el('g', {}, svg);

  frameBox(traceLayer, 250, 40, 250, 376, 'NETWORKSERVICEAPP');

  const client = node(nodeLayer, { x: 24, y: 70, w: 120, h: 56, title: 'CLIENT', sub: 'TCP · protocol' });
  const subs = node(nodeLayer, { x: 24, y: 330, w: 120, h: 56, title: 'SUBSCRIBERS', sub: 'public feed' });
  const ingress = node(nodeLayer, { x: 270, y: 72, w: 210, h: 52, title: 'INGRESS · SEQUENCER', sub: 'epoll · one thread · seq 0' });
  const store = node(nodeLayer, { x: 270, y: 140, w: 210, h: 52, title: 'SEQUENCE STORE', sub: 'mmap ring · 2^20 slots' });
  const retrans = node(nodeLayer, { x: 270, y: 208, w: 210, h: 52, title: 'RETRANSMIT SERVER', sub: 'gap-fill over UDP' });
  const arbiter = node(nodeLayer, { x: 270, y: 276, w: 210, h: 52, title: 'REPLICA ARBITER', sub: 'epoch · leader' });
  const egress = node(nodeLayer, { x: 270, y: 344, w: 210, h: 52, title: 'EGRESS GATEWAY', sub: 'drops stale epochs' });
  const r1 = node(nodeLayer, { x: 680, y: 72, w: 240, h: 96, title: 'REPLICA 1 · LEADER', cls: 'leader',
    sub: ['receiver → SPSC → matcher', '→ SPSC → publisher'] });
  const r2 = node(nodeLayer, { x: 680, y: 190, w: 240, h: 96, title: 'REPLICA 2 · STANDBY',
    sub: ['drains its queue,', 'does not transmit'] });
  const perf = node(nodeLayer, { x: 680, y: 400, w: 240, h: 56, title: 'PERFORMANCESERVICEAPP', sub: 'HdrHistogram percentiles' });
  const rn = el('text', { x: 800, y: 306, 'text-anchor': 'middle', fill: GRAYC, 'font-size': 12 }, nodeLayer);
  rn.textContent = '· · ·  replica N  · · ·';

  // routed lanes
  const P = {
    order: trace(traceLayer, [[144, 90], [190, 90], [190, 100], [270, 100]]),
    ack:   trace(traceLayer, [[270, 372], [214, 372], [214, 112], [144, 112]]),
    pub:   trace(traceLayer, [[270, 388], [180, 388], [180, 358], [144, 358]], 'udp'),
    append: trace(traceLayer, [[300, 124], [300, 140]], '', { vias: false }),
    trunk: trace(traceLayer, [[480, 100], [540, 100]], 'udp'),
    mc1:   trace(traceLayer, [[540, 100], [540, 90], [680, 90]], 'udp'),
    mc2:   trace(traceLayer, [[540, 100], [540, 208], [680, 208]], 'udp'),
    eg1:   trace(traceLayer, [[680, 150], [600, 150], [600, 366], [480, 366]], 'udp'),
    eg2:   trace(traceLayer, [[680, 268], [600, 268]], 'udp dim', { vias: false }),
    hb1:   trace(traceLayer, [[680, 110], [640, 110], [640, 296], [480, 296]], 'hb'),
    hb2:   trace(traceLayer, [[680, 228], [640, 228], [640, 296], [480, 296]], 'hb', { vias: false }),
    tel1:  trace(traceLayer, [[920, 120], [944, 120], [944, 428], [920, 428]], 'tel'),
    tel2:  trace(traceLayer, [[920, 238], [944, 238]], 'tel', { vias: false }),
    rt:    trace(traceLayer, [[300, 192], [300, 208]], '', { vias: false }),
  };
  // the gate closed on replica 2's egress lane
  el('rect', { x: 656, y: 262, width: 8, height: 12, class: 'via' }, traceLayer);
  const gateX = el('g', {}, traceLayer);
  el('line', { x1: 652, y1: 259, x2: 668, y2: 277, class: 'xmark', opacity: .6 }, gateX);
  el('line', { x1: 652, y1: 277, x2: 668, y2: 259, class: 'xmark', opacity: .6 }, gateX);
  label(svg, 660, 300, 'gate closed', { anchor: 'middle' });

  label(svg, 150, 82, 'CLIENT · TCP');
  label(svg, 548, 82, 'REPLICATION MCAST', { cls: 'udp' });
  label(svg, 490, 360, 'EGRESS MCAST', { cls: 'udp' });
  label(svg, 490, 290, 'HEARTBEAT · UDP', { cls: 'hb' });
  label(svg, 208, 250, 'PRIVATE ACK · TCP', { anchor: 'middle', rot: -90 });
  label(svg, 186, 404, 'PUBLIC FEED · UDP MCAST', { cls: 'udp' });
  label(svg, 956, 300, 'TELEMETRY · UDP', { anchor: 'middle', rot: -90 });

  let seq = 0;
  const setSeq = () => { ingress._s[0].textContent = 'epoll · one thread · seq ' + seq; };

  async function orderCycle() {
    await travel(scene, P.order, { layer: pktLayer, speed: 230 });
    flash(ingress); setSeq();
    await travel(scene, P.append, { layer: pktLayer, speed: 120, r: 2 });
    flash(store);
    await travel(scene, P.trunk, { layer: pktLayer, r: 6, color: BLUE, speed: 300 });
    seq++;
    await Promise.all([
      travel(scene, P.mc1, { layer: pktLayer, r: 6, color: BLUE, speed: 300 }),
      travel(scene, P.mc2, { layer: pktLayer, r: 6, color: BLUE, speed: 300 }),
    ]);
    flash(r1, 700); flash(r2, 700);
    await sleep(scene, 750);
    // the standby drained its queue but stays quiet; the leader publishes
    xmark(pktLayer, 660, 268, 6);
    await travel(scene, P.eg1, { layer: pktLayer, r: 6, color: BLUE, speed: 300 });
    flash(egress);
    await sleep(scene, 250);
    await Promise.all([
      travel(scene, P.ack, { layer: pktLayer, speed: 230 }),
      travel(scene, P.pub, { layer: pktLayer, r: 6, color: BLUE, speed: 260 }),
    ]);
    flash(client); flash(subs);
  }

  async function heartbeatLoop(path, node, delay) {
    await sleep(scene, delay);
    for (;;) {
      await travel(scene, path, { layer: pktLayer, r: 2, color: YEL, speed: 260 });
      flash(arbiter, 220);
      await sleep(scene, 1500);
    }
  }
  async function telemetryLoop(path, delay) {
    await sleep(scene, delay);
    for (;;) {
      await travel(scene, path, { layer: pktLayer, r: 2, color: GRAYC, speed: 240 });
      flash(perf, 220);
      await sleep(scene, 2200);
    }
  }

  (async () => {
    setSeq();
    heartbeatLoop(P.hb1, r1, 300);
    heartbeatLoop(P.hb2, r2, 1050);
    telemetryLoop(P.tel1, 900);
    telemetryLoop(P.tel2, 2000);
    for (;;) { await orderCycle(); await sleep(scene, 900); }
  })();

  const btn = $('fig1Toggle');
  const sync = () => { btn.textContent = scene.userPaused ? '[ PLAY ]' : '[ PAUSE ]'; };
  btn.addEventListener('click', () => { scene.userPaused = !scene.userPaused; sync(); scene.poke(); });
  sync();
})();


/* =====================================================================
   FIG 2 — gap-fill
   ===================================================================== */
(function figGap() {
  const svg = $('svg3');
  const logEl = $('log3');
  const scene = new Scene(svg);
  const traceLayer = el('g', {}, svg), nodeLayer = el('g', {}, svg), pktLayer = el('g', {}, svg);

  frameBox(traceLayer, 20, 20, 240, 168, 'NETWORKSERVICEAPP');
  frameBox(traceLayer, 620, 20, 340, 250, 'MATCHING REPLICA');

  const store = node(nodeLayer, { x: 40, y: 48, w: 200, h: 56, title: 'SEQUENCE STORE', sub: 'ring · holds seq 0 and 1' });
  const gw = node(nodeLayer, { x: 40, y: 118, w: 200, h: 56, title: 'SEQUENCER', sub: 'multicasts each once' });
  const rt = node(nodeLayer, { x: 40, y: 206, w: 200, h: 56, title: 'RETRANSMIT SERVER', sub: 'answers gap requests' });
  const rx = node(nodeLayer, { x: 640, y: 50, w: 150, h: 62, title: 'RECEIVER', sub: ['expects seq 0'] });
  const qLbl = el('text', { x: 875, y: 68, 'text-anchor': 'middle', fill: GREEN, 'font-family': 'VT323', 'font-size': 18 }, nodeLayer);
  qLbl.textContent = 'INBOUND SPSC';
  const cells = [];
  for (let i = 0; i < 6; i++) {
    const x = 800 + i * 26;
    const c = el('rect', { class: 'cell', x, y: 84, width: 24, height: 28 }, nodeLayer);
    const t = el('text', { class: 'cell-t', x: x + 12, y: 104 }, nodeLayer);
    cells.push({ c, t });
  }
  const status = el('text', { x: 790, y: 150, fill: GRAYC, 'font-size': 11 }, nodeLayer);
  const status2 = el('text', { x: 640, y: 274, fill: GRAYC, 'font-size': 11 }, nodeLayer);

  const P = {
    mc:   trace(traceLayer, [[240, 146], [420, 146], [420, 82], [640, 82]], 'udp'),
    req:  trace(traceLayer, [[660, 112], [660, 224], [240, 224]], 'hb'),
    resp: trace(traceLayer, [[240, 244], [690, 244], [690, 112]], 'udp'),
    rd:   trace(traceLayer, [[140, 206], [140, 174]], '', { vias: false }),
    rd2:  trace(traceLayer, [[140, 118], [140, 104]], '', { vias: false }),
  };
  label(svg, 330, 138, 'MULTICAST', { cls: 'udp' });
  label(svg, 654, 200, 'REQUEST', { cls: 'hb', anchor: 'middle', rot: -90 });
  label(svg, 704, 200, 'RESPONSE', { cls: 'udp', anchor: 'middle', rot: -90 });

  let gen = 0;
  const logLines = [];
  function log(msg, cls = '') {
    logLines.push(`<div class="${cls}">&gt; ${msg}</div>`);
    while (logLines.length > 7) logLines.shift();
    logEl.innerHTML = logLines.join('');
  }
  function resetView() {
    gen++;
    logLines.length = 0; logEl.innerHTML = '<div class="dim">&gt; press a play button</div>';
    rx.classList.remove('dead'); rx._t.textContent = 'RECEIVER'; rx._s[0].textContent = 'expects seq 0';
    cells.forEach(c => { c.c.classList.remove('full'); c.t.textContent = ''; });
    status.textContent = ''; status2.textContent = '';
    pktLayer.innerHTML = '';
  }

  async function run(recoverable) {
    resetView();
    const my = gen;
    const alive = () => my === gen;
    log('seq 0 multicast by the gateway…');
    const d0 = await travel(scene, P.mc, { layer: pktLayer, r: 6, color: BLUE, speed: 330, stopAt: 0.55, keep: true });
    if (!alive()) return;
    d0.setAttribute('fill', REDC); d0.style.color = REDC;
    xmark(pktLayer, +d0.getAttribute('cx'), +d0.getAttribute('cy'), 8);
    setTimeout(() => d0.remove(), 300);
    log('seq 0 LOST in the network', 'err');
    await sleep(scene, 500); if (!alive()) return;

    log('seq 1 multicast…');
    await travel(scene, P.mc, { layer: pktLayer, r: 6, color: BLUE, speed: 330 });
    if (!alive()) return;
    flash(rx, 500);
    rx._s[0].textContent = 'got 1, want 0';
    log('receiver: got 1, expected 0 → gap [0, 1)', 'hi');
    await sleep(scene, 500); if (!alive()) return;

    log('RetransmitRequest { start: 0, count: 1 }');
    await travel(scene, P.req, { layer: pktLayer, r: 3, color: YEL, speed: 320 });
    if (!alive()) return;
    flash(rt, 500);
    if (!recoverable) {
      // ring has wrapped: model it by clearing the store's label
      store._s[0].textContent = 'ring wrapped — seq 0 evicted';
      store.classList.add('warn');
    }
    await travel(scene, P.rd, { layer: pktLayer, r: 2, color: GRAYC, speed: 100 });
    if (!alive()) return;
    flash(store, 500);
    await sleep(scene, 300); if (!alive()) return;

    if (recoverable) {
      log('server: status OK, record seq 0');
      await travel(scene, P.resp, { layer: pktLayer, r: 6, color: BLUE, speed: 330 });
      if (!alive()) return;
      cells[0].c.classList.add('full'); cells[0].t.textContent = '0';
      log('pushed seq 0 into the queue', '');
      await sleep(scene, 400); if (!alive()) return;
      cells[1].c.classList.add('full'); cells[1].t.textContent = '1';
      rx._s[0].textContent = 'expects seq 2';
      status.textContent = 'order preserved: 0, then 1';
      log('then the live seq 1 — gap filled, order preserved', 'hi');
    } else {
      log('server: status TOO_OLD', 'err');
      await travel(scene, P.resp, { layer: pktLayer, r: 3, color: REDC, speed: 330 });
      if (!alive()) return;
      rx.classList.add('dead'); rx._t.textContent = 'RECEIVER · STOPPED';
      rx._s[0].textContent = 'unrecoverable gap';
      status2.textContent = 'exit code 2 · heartbeats stop · arbiter drops this replica like a crash';
      log('FATAL: unrecoverable gap — replica stops rather than run on a wrong book', 'err');
    }
    store._s[0].textContent = 'ring · holds seq 0 and 1'; store.classList.remove('warn');
  }

  $('f3ok').addEventListener('click', () => run(true));
  $('f3bad').addEventListener('click', () => run(false));
  resetView();
  scene.onFirstVisible(() => { if (!REDUCED) run(true); });
})();


/* =====================================================================
   FIG 3 — failover and fencing
   ===================================================================== */
(function figFailover() {
  const svg = $('svg2');
  const logEl = $('log2');
  const scene = new Scene(svg);
  const traceLayer = el('g', {}, svg), nodeLayer = el('g', {}, svg), pktLayer = el('g', {}, svg);

  frameBox(traceLayer, 370, 76, 590, 150, 'NETWORKSERVICEAPP');

  const r1 = node(nodeLayer, { x: 40, y: 56, w: 200, h: 84, title: 'REPLICA 1', sub: ['LEADER'] });
  const r2 = node(nodeLayer, { x: 40, y: 214, w: 200, h: 84, title: 'REPLICA 2', sub: ['STANDBY'] });
  const arb = node(nodeLayer, { x: 390, y: 106, w: 190, h: 90, title: 'REPLICA ARBITER', sub: ['epoch 1', 'leader R1'] });
  const gate = node(nodeLayer, { x: 700, y: 106, w: 240, h: 90, title: 'EGRESS GATEWAY', sub: ['reads the epoch in-process', 'drops epoch < current'] });

  const HB = {
    1: trace(traceLayer, [[240, 120], [330, 120], [330, 134], [390, 134]], 'hb'),
    2: trace(traceLayer, [[240, 228], [330, 228], [330, 170], [390, 170]], 'hb'),
  };
  const EG = {
    1: trace(traceLayer, [[240, 84], [262, 84], [262, 40], [640, 40], [640, 140], [700, 140]], 'udp'),
    2: trace(traceLayer, [[240, 264], [262, 264], [262, 316], [640, 316], [640, 170], [700, 170]], 'udp'),
  };
  trace(traceLayer, [[580, 156], [700, 156]], 'dim', { vias: false });
  label(svg, 372, 112, 'HEARTBEAT', { cls: 'hb', anchor: 'end' });
  label(svg, 450, 34, 'EGRESS MCAST', { cls: 'udp' });
  label(svg, 630, 154, 'epoch', { anchor: 'end' });

  const nodes = { 1: r1, 2: r2 };
  const S = { gen: 0, epoch: 1, leader: 1, alive: { 1: true, 2: true }, seen: { 1: 0, 2: 0 },
              belief: { 1: { leader: 1, epoch: 1 }, 2: { leader: 1, epoch: 1 } }, t0: 0 };
  const STALE_MS = 1700; // animation time only; the code default is 10 ms

  const logLines = [];
  const stamp = () => ((performance.now() - S.t0) / 1000).toFixed(1).padStart(4, ' ') + 's';
  function log(msg, cls = '') {
    logLines.push(`<div class="${cls}">${stamp()} &gt; ${msg}</div>`);
    while (logLines.length > 8) logLines.shift();
    logEl.innerHTML = logLines.join('');
  }
  function paint() {
    for (const id of [1, 2]) {
      const n = nodes[id];
      n.classList.toggle('dead', !S.alive[id]);
      n.classList.toggle('leader', S.alive[id] && S.leader === id);
      n._s[0].textContent = !S.alive[id] ? 'DOWN' : (S.leader === id ? 'LEADER' : 'STANDBY');
    }
    arb._s[0].textContent = 'epoch ' + S.epoch;
    arb._s[1].textContent = 'leader R' + S.leader;
    $('f2kill').disabled = !(S.alive[1] && S.alive[2]);
    $('f2zombie').disabled = !(S.epoch > 1);
  }

  const eligible = (id, now) => (now - S.seen[id]) <= STALE_MS;
  function recompute() {          // runs only when a heartbeat arrives, like the real arbiter
    const now = performance.now();
    if (eligible(S.leader, now)) return;
    const next = [1, 2].filter(id => eligible(id, now)).sort()[0] || S.leader;
    if (next !== S.leader) {
      S.epoch++; S.leader = next;
      log(`arbiter: leader R${next}, epoch → ${S.epoch}`, 'hi');
      paint();
    }
  }

  async function hbLoop(id, my) {
    await sleep(scene, id === 1 ? 200 : 750);
    while (my === S.gen) {
      if (!S.alive[id]) { await sleep(scene, 300); continue; }
      await travel(scene, HB[id], { layer: pktLayer, r: 2, color: YEL, speed: 240 });
      if (my !== S.gen || !S.alive[id]) continue;
      S.seen[id] = performance.now();
      flash(arb, 200);
      recompute();
      S.belief[id] = { leader: S.leader, epoch: S.epoch };   // the reply
      await sleep(scene, 1100);
    }
  }
  async function sendEvent(id, epoch, my, isLate) {
    const dot = await travel(scene, EG[id], { layer: pktLayer, r: 6, color: isLate ? REDC : BLUE, speed: 250, keep: true });
    if (my !== S.gen) { dot.remove(); return; }
    if (epoch < S.epoch) {
      xmark(pktLayer, +dot.getAttribute('cx') - 4, +dot.getAttribute('cy'), 8);
      dot.remove();
      flash(gate, 500);
      log(`egress gateway: DROPPED message from R${id} (epoch ${epoch} < current ${S.epoch})`, 'err');
    } else {
      dot.remove(); flash(gate, 350);
    }
  }
  async function egressLoop(id, my) {
    await sleep(scene, id === 1 ? 900 : 1300);
    while (my === S.gen) {
      const b = S.belief[id];
      if (S.alive[id] && b.leader === id) await sendEvent(id, b.epoch, my, false);
      await sleep(scene, 1600);
    }
  }

  function start() {
    S.gen++; const my = S.gen;
    Object.assign(S, { epoch: 1, leader: 1, alive: { 1: true, 2: true } });
    const now = performance.now();
    S.seen = { 1: now, 2: now }; S.belief = { 1: { leader: 1, epoch: 1 }, 2: { leader: 1, epoch: 1 } };
    S.t0 = now; logLines.length = 0; pktLayer.innerHTML = '';
    paint();
    log('R1 is leader (epoch 1); both replicas heartbeat, only R1 publishes', 'dim');
    hbLoop(1, my); hbLoop(2, my); egressLoop(1, my); egressLoop(2, my);
  }

  $('f2kill').addEventListener('click', () => {
    const id = S.leader; if (!S.alive[id]) return;
    S.alive[id] = false; paint();
    log(`R${id} killed — its heartbeats stop`, 'err');
    log('arbiter has no timer: it will notice on the survivor\'s next heartbeat', 'dim');
  });
  $('f2zombie').addEventListener('click', () => {
    const old = S.epoch - 1;
    log(`late packet from R1 (it last heard epoch ${old}) enters the network`, 'dim');
    sendEvent(1, old, S.gen, true);
  });
  $('f2reset').addEventListener('click', start);

  scene.onFirstVisible(start);
  start();
})();


/* =====================================================================
   FIG 4 — the four timestamps
   ===================================================================== */
(function fig4() {
  const svg = $('svg4');
  const scene = new Scene(svg, { paused: REDUCED });
  const traceLayer = el('g', {}, svg), markerLayer = el('g', {}, svg), pktLayer = el('g', {}, svg);
  const X = [70, 330, 590, 850], Y = 100;
  const segs = [
    [[X[0], Y], [X[0], 90], [X[1], 90], [X[1], Y]],
    [[X[1], Y], [X[1], 110], [X[2], 110], [X[2], Y]],
    [[X[2], Y], [X[2], 90], [X[3], 90], [X[3], Y]],
  ].map(p => trace(traceLayer, p, '', { vias: false, r: 6 }));
  const names = ['ingress_tai_ns', 'replica_ingress_tai_ns', 'engine_pop_tai_ns', 'match_done_tai_ns'];
  const descs = ['gateway socket read', 'replica receiver sees the packet', 'matching thread pops the command', 'submit_order() returns'];
  const markers = X.map((x, i) => {
    const m = el('rect', { x: x - 6, y: Y - 6, width: 12, height: 12, class: 'marker' }, markerLayer);
    el('text', { class: 'stamp-t', x, y: 158 }, markerLayer).textContent = names[i];
    el('text', { class: 'stamp-s', x, y: 173 }, markerLayer).textContent = descs[i];
    el('text', { class: 'stamp-s', x, y: 187, fill: GRAYC }, markerLayer).textContent = 'T' + i;
    return m;
  });
  const seg = (x, y, t, strong) => {
    const e = el('text', { class: 'seg-t', x, y }, svg); e.textContent = t;
    if (strong) e.style.fill = GREEN; return e;
  };
  seg((X[0] + X[1]) / 2, 70, 'NetworkDelayNs = T1 − T0');
  seg((X[1] + X[2]) / 2, 138, 'QueuingDelayNs = T2 − T1');
  seg((X[2] + X[3]) / 2, 70, 'EngineExecutionNs = T3 − T2  ← primary', true);

  (async () => {
    for (;;) {
      markers.forEach(m => m.classList.remove('lit'));
      markers[0].classList.add('lit');
      for (let i = 0; i < 3; i++) {
        await travel(scene, segs[i], { layer: pktLayer, r: 4, speed: 210 });
        markers[i + 1].classList.add('lit');
      }
      await sleep(scene, 1400);
    }
  })();
})();


/* =====================================================================
   FIG 5 — SPSC ring buffer
   ===================================================================== */
(function fig5() {
  const svg = $('svg5');
  const scene = new Scene(svg, { paused: REDUCED });
  const traceLayer = el('g', {}, svg), nodeLayer = el('g', {}, svg), pktLayer = el('g', {}, svg);
  const N = 8, X0 = 130, W = 90, Y0 = 70, H = 46;

  const prod = node(nodeLayer, { x: 6, y: 60, w: 118, h: 66, title: 'PRODUCER', sub: ['receiver'] });
  const cons = node(nodeLayer, { x: 858, y: 60, w: 116, h: 66, title: 'CONSUMER', sub: ['matcher'] });
  const cells = [];
  for (let i = 0; i < N; i++) {
    const c = el('rect', { class: 'cell', x: X0 + i * W, y: Y0, width: W - 4, height: H }, nodeLayer);
    el('text', { x: X0 + i * W + (W - 4) / 2, y: Y0 + H + 14, 'text-anchor': 'middle', fill: GRAYC, 'font-size': 10 }, nodeLayer).textContent = 'slot ' + i;
    const t = el('text', { class: 'cell-t', x: X0 + i * W + (W - 4) / 2, y: Y0 + 29 }, nodeLayer);
    cells.push({ c, t });
  }
  const cx = i => X0 + i * W + (W - 4) / 2;
  const inLane = i => trace(traceLayer, [[124, 84], [127, 84], [127, 40], [cx(i), 40], [cx(i), Y0]], '', { vias: false, r: 6 });
  const outLane = i => trace(traceLayer, [[cx(i), Y0 + H], [cx(i), Y0 + H + 34], [917, Y0 + H + 34], [917, 126]], '', { vias: false, r: 6 });
  // fixed lane drawings (dimmed) for reference
  trace(traceLayer, [[124, 84], [127, 84], [127, 40], [X0 + N * W - 14, 40]], 'dim', { vias: false, r: 6 });
  trace(traceLayer, [[X0 + 10, Y0 + H + 34], [917, Y0 + H + 34], [917, 126]], 'dim', { vias: false, r: 6 });
  label(svg, 300, 32, 'push: write slot, then publish tail (release)');
  label(svg, 470, Y0 + H + 62, 'pop: read slot, then publish head (release)');

  const tailBox = node(nodeLayer, { x: 150, y: 200, w: 230, h: 56, title: 'TAIL COUNTER', sub: ['alignas(64) · producer writes'] });
  const headBox = node(nodeLayer, { x: 600, y: 200, w: 230, h: 56, title: 'HEAD COUNTER', sub: ['alignas(64) · consumer writes'], cls: 'blue' });
  trace(traceLayer, [[380, 228], [600, 228]], 'dim', { vias: false });
  label(svg, 490, 220, 'different cache lines', { anchor: 'middle' });
  const stat = el('text', { x: 490, y: 284, 'text-anchor': 'middle', fill: GRAYC, 'font-size': 11 }, nodeLayer);
  const flag = el('text', { x: 490, y: 190, 'text-anchor': 'middle', 'font-family': 'VT323', 'font-size': 20 }, nodeLayer);

  let head = 0, tail = 0, fast = false, until = 0;
  const upd = () => {
    tailBox._s[0].textContent = `tail = ${tail}  →  slot ${tail & (N - 1)}`;
    headBox._s[0].textContent = `head = ${head}  →  slot ${head & (N - 1)}`;
    stat.textContent = `size = tail − head = ${tail - head} of ${N}   ·   index = counter & ${N - 1}`;
  };
  upd();
  const say = (t, c) => { flag.textContent = t; flag.setAttribute('fill', c); setTimeout(() => { if (flag.textContent === t) flag.textContent = ''; }, 900); };

  async function producer() {
    for (;;) {
      await sleep(scene, 480);
      if (tail - head === N) { flash(prod, 300); say('FULL — producer waits', REDC); continue; }
      const i = tail & (N - 1);
      await travel(scene, inLane(i), { layer: pktLayer, r: 4, speed: 280 });
      cells[i].c.classList.add('full'); cells[i].t.textContent = tail;
      tail++; upd(); flash(tailBox, 250);
    }
  }
  async function consumer() {
    for (;;) {
      const now = performance.now();
      if (now > until) { fast = !fast; until = now + 9000; }
      await sleep(scene, fast ? 260 : 1050);
      if (head === tail) { flash(cons, 300); say('EMPTY — consumer spins', GRAYC); continue; }
      const i = head & (N - 1);
      cells[i].c.classList.remove('full');
      const val = cells[i].t.textContent; cells[i].t.textContent = '';
      await travel(scene, outLane(i), { layer: pktLayer, r: 4, speed: 280, color: BLUE });
      head++; upd(); flash(headBox, 250);
    }
  }
  producer(); consumer();
})();



return R.unmount;
}
