// =====================================================================
// Steps 7–9 mini-game: BE the MPPT — introduced one concept at a time.
//
//   stage 'spot'  (step 7): frozen moment, drag the voltage, find the
//                           sweet spot; then the sun moves and you find
//                           it again. No timer, no score, no jargon.
//   stage 'track' (step 8): the full day plays; keep your dot on the
//                           peak and get scored against a perfect
//                           tracker (that's all an MPPT is).
//   stage 'mixed' (step 9): N+S panels share one tracker — the curve
//                           grows a second hump; same game, harder, and
//                           the kWh cost makes the wiring rule obvious.
//
// Reuses PE.electricalSim's precomputed day (scenarios, curves, MPPs).
// =====================================================================
window.PE = window.PE || {};

window.PE.mpptGame = (function () {
  const TICK_MS = 100;
  const DAY_SECONDS = 75;
  const V_MAX_AXIS = 340;
  const SPOT_IDX = [16, 52];  // ~08:30 and ~17:30 for the find-it beats

  let dom = null;
  let env = null;
  let state = null;
  let timer = null;

  function playerStringIndex(scenKey) {
    const scen = env.sim.scenarios[scenKey];
    if (scenKey === 'mixed') return 0;
    // prefer the south-facing string (the natural teaching string),
    // else fall back to the biggest
    const south = scen.strings.findIndex((s) => / S-facing/.test(s.name));
    if (south >= 0) return south;
    let best = 0;
    scen.strings.forEach((s, i) => { if (s.panels.length > scen.strings[best].panels.length) best = i; });
    return best;
  }

  function bindDom() {
    if (dom) return;
    dom = {
      panel: document.getElementById('game'),
      curve: document.getElementById('game-curve'),
      title: document.getElementById('game-title'),
      instruction: document.getElementById('game-instruction'),
      timerow: document.getElementById('game-timerow'),
      statsrow: document.getElementById('game-statsrow'),
      modesrow: document.getElementById('game-modesrow'),
      btnSplit: document.getElementById('game-wiring-split'),
      btnMixed: document.getElementById('game-wiring-mixed'),
      btnPlay: document.getElementById('game-play'),
      slider: document.getElementById('game-time'),
      clock: document.getElementById('game-clock'),
      you: document.getElementById('game-you'),
      perfect: document.getElementById('game-perfect'),
      effBar: document.getElementById('game-eff-bar'),
      score: document.getElementById('game-score'),
      others: document.getElementById('game-others'),
      verdict: document.getElementById('game-verdict'),
    };
    dom.slider.max = String(PE.electricalSim.NSTEPS - 1);

    const setFromEvent = (e) => {
      const r = dom.curve.getBoundingClientRect();
      const frac = (e.clientX - r.left) / r.width;
      // invert the px() mapping: margins are 4.5% left, 1.5% right
      const v = ((frac - 0.045) / 0.94) * V_MAX_AXIS;
      state.vUser = Math.max(10, Math.min(V_MAX_AXIS - 5, v));
      state.touched = true;
      draw();
    };
    let dragging = false;
    dom.curve.addEventListener('pointerdown', (e) => {
      dragging = true;
      try { dom.curve.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointers */ }
      setFromEvent(e);
    });
    dom.curve.addEventListener('pointermove', (e) => { if (dragging) setFromEvent(e); });
    dom.curve.addEventListener('pointerup', () => { dragging = false; });

    dom.btnSplit.addEventListener('click', () => { if (state.stage === 'mixed') switchScen('split'); });
    dom.btnMixed.addEventListener('click', () => { if (state.stage === 'mixed') switchScen('mixed'); });
    dom.btnPlay.addEventListener('click', togglePlay);
    dom.slider.addEventListener('input', () => {
      state.playing = false;
      dom.btnPlay.textContent = '▶ play day';
      state.stepF = Number(dom.slider.value);
      draw();
    });
  }

  function switchScen(scenKey) {
    state.scenKey = scenKey;
    state.playerIdx = playerStringIndex(scenKey);
    state.whYou = 0; state.whPerfect = 0;
    state.stepF = 6; state.playing = false; state.done = false;
    dom.btnPlay.textContent = '▶ play day';
    dom.btnSplit.classList.toggle('active', scenKey === 'split');
    dom.btnMixed.classList.toggle('active', scenKey === 'mixed');
    dom.verdict.innerHTML = '';
    syncWiring3D();
    draw();
  }

  function togglePlay() {
    if (state.done) {
      state.whYou = 0; state.whPerfect = 0; state.stepF = 0; state.done = false;
      dom.verdict.innerHTML = '';
    }
    state.playing = !state.playing;
    dom.btnPlay.textContent = state.playing ? '❚❚ pause' : '▶ play day';
  }

  function syncWiring3D() {
    const w = env.world.elec;
    if (!w) return;
    w.mixed.group.visible = state.scenKey === 'mixed';
    w.split.group.visible = state.scenKey === 'split';
  }

  function powerAt(curve, V) {
    if (!curve.length) return 0;
    if (V <= curve[0].V || V >= curve[curve.length - 1].V) return 0;
    for (let i = 1; i < curve.length; i++) {
      if (curve[i].V >= V) {
        const a = curve[i - 1], b = curve[i];
        const t = (V - a.V) / (b.V - a.V || 1e-9);
        return a.P + t * (b.P - a.P);
      }
    }
    return 0;
  }

  const currentStep = () => Math.max(0, Math.min(PE.electricalSim.NSTEPS - 1, Math.round(state.stepF)));
  const fmtTime = (t) => `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`;

  // ---- drawing ------------------------------------------------------
  function draw() {
    const c = dom.curve;
    const dpr = 2;
    const wCss = c.clientWidth || 640;
    if (Math.abs(c.width - wCss * dpr) > 4) {
      c.width = wCss * dpr;
      c.height = Math.round(wCss * 0.44) * dpr;
      c.style.height = Math.round(wCss * 0.44) + 'px';
    }
    const g = c.getContext('2d');
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    g.font = `${10 * dpr}px "JetBrains Mono", monospace`;

    const sim = env.sim;
    const scen = sim.scenarios[state.scenKey];
    const idx = currentStep();
    const step = scen.steps[idx];
    const mine = step.perString[state.playerIdx];
    const colourHex = '#' + scen.strings[state.playerIdx].colour.toString(16).padStart(6, '0');

    const Pmax = Math.max(sim.scenarios.mixed.peakString, sim.scenarios.split.peakString) * 1.1;
    const M = { l: 0.045 * W, r: 0.015 * W, t: 0.07 * H, b: 0.14 * H };
    const px = (V) => M.l + (V / V_MAX_AXIS) * (W - M.l - M.r);
    const py = (P) => H - M.b - (P / Pmax) * (H - M.t - M.b);

    g.strokeStyle = 'rgba(255,255,255,0.10)';
    g.strokeRect(M.l, M.t, W - M.l - M.r, H - M.t - M.b);
    g.fillStyle = 'rgba(154,163,173,0.6)';
    for (const v of [100, 200, 300]) {
      g.strokeStyle = 'rgba(255,255,255,0.05)';
      g.beginPath(); g.moveTo(px(v), M.t); g.lineTo(px(v), H - M.b); g.stroke();
      g.fillText(`${v} V`, px(v) - 12 * dpr, H - M.b + 13 * dpr);
    }
    g.fillText('string voltage →', W * 0.34, H - M.b + 13 * dpr);
    g.save();
    g.translate(10 * dpr, H * 0.55); g.rotate(-Math.PI / 2);
    g.fillText('power →', 0, 0);
    g.restore();

    if (mine.curve.length > 1) {
      g.strokeStyle = colourHex;
      g.lineWidth = 2.4 * dpr;
      g.beginPath();
      mine.curve.forEach((pt, i) => (i ? g.lineTo(px(pt.V), py(pt.P)) : g.moveTo(px(pt.V), py(pt.P))));
      g.stroke();
    } else {
      g.fillStyle = 'rgba(154,163,173,0.7)';
      g.fillText('night — nothing to harvest', W * 0.42, H * 0.5);
    }

    // perfect-tracker ghost: hidden in the discovery stage until found
    const showGhost = state.stage !== 'spot' || state.finds > 0;
    if (showGhost && mine.P > 0) {
      g.fillStyle = 'rgba(230,232,235,0.5)';
      g.beginPath();
      g.arc(px(mine.V), py(mine.P), 4 * dpr, 0, Math.PI * 2);
      g.fill();
      g.fillText(state.stage === 'spot' ? 'the maximum power point' : 'perfect tracker', px(mine.V) + 7 * dpr, py(mine.P) - 6 * dpr);
    }

    const pYou = powerAt(mine.curve, state.vUser);
    g.strokeStyle = '#f5b942';
    g.lineWidth = 1.4 * dpr;
    g.setLineDash([4 * dpr, 3 * dpr]);
    g.beginPath(); g.moveTo(px(state.vUser), M.t); g.lineTo(px(state.vUser), H - M.b); g.stroke();
    g.setLineDash([]);
    g.fillStyle = '#f5b942';
    g.beginPath();
    g.arc(px(state.vUser), py(pYou), 6.5 * dpr, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#14161a';
    g.font = `bold ${8.5 * dpr}px "JetBrains Mono", monospace`;
    g.fillText('YOU', px(state.vUser) - 8.5 * dpr, py(pYou) + 3 * dpr);
    g.font = `${10 * dpr}px "JetBrains Mono", monospace`;
    // live wattage next to the handle
    g.fillStyle = '#f5b942';
    g.fillText(`${pYou.toFixed(0)} W`, px(state.vUser) + 9 * dpr, py(pYou) + 3 * dpr);

    // ---- side widgets ----
    dom.clock.textContent = fmtTime(sim.times[idx]);
    dom.slider.value = String(idx);
    dom.you.textContent = `${pYou.toFixed(0)} W`;
    dom.perfect.textContent = `${mine.P.toFixed(0)} W`;
    const others = step.perString.reduce((s, r, i) => (i === state.playerIdx ? s : s + r.P), 0);
    dom.others.textContent = state.stage === 'spot' ? '' : `other strings (auto-tracked): ${others.toFixed(0)} W`;
    const eff = state.whPerfect > 1 ? (state.whYou / state.whPerfect) * 100 : null;
    dom.effBar.style.width = eff === null ? '0%' : Math.min(100, eff).toFixed(1) + '%';
    dom.effBar.style.background = eff === null || eff > 92 ? 'var(--good)' : eff > 75 ? 'var(--accent)' : 'var(--bad)';
    dom.score.textContent = eff === null ? '—' : `${eff.toFixed(0)}% · you ${(state.whYou / 1000).toFixed(2)} kWh vs ${(state.whPerfect / 1000).toFixed(2)} kWh`;
  }

  // ---- the find-the-spot beats (stage 'spot') -----------------------
  function spotLogic() {
    if (state.spotPaused || state.finds >= 2) return;
    const idx = currentStep();
    const mine = env.sim.scenarios[state.scenKey].steps[idx].perString[state.playerIdx];
    if (mine.P <= 0 || !state.touched) return;
    const pYou = powerAt(mine.curve, state.vUser);
    if (pYou / mine.P > 0.985) {
      state.holdMs += TICK_MS;
      if (state.holdMs >= 1100) {
        state.holdMs = 0;
        state.finds++;
        if (state.finds === 1) {
          state.spotPaused = true;
          dom.verdict.innerHTML = `that's the <b>maximum power point</b> — the one voltage where this string gives everything it has.`;
          setTimeout(() => {
            if (env.ctx.currentStep !== state.stepIndex) return;
            state.stepF = SPOT_IDX[1];
            state.vUser = 55;      // the dial gets knocked — find it again
            state.spotPaused = false;
            dom.instruction.innerHTML = `⏰ hours pass — the sun has moved and the whole curve has changed shape. Your dial slipped to 55&thinsp;V. <b>Find the spot again.</b>`;
            dom.verdict.innerHTML = '';
            draw();
          }, 2800);
        } else if (state.finds === 2) {
          dom.instruction.innerHTML = `✓ found it again. It shifts all day — gently on a clean string like this, wildly with clouds or mismatch. Someone has to chase it <em>constantly</em>…`;
          dom.verdict.innerHTML = `hit <b>Next</b> to meet the machine that does.`;
        }
        draw();
      }
    } else {
      state.holdMs = 0;
    }
  }

  // ---- game loop ----------------------------------------------------
  function tick() {
    if (env.ctx.currentStep !== state.stepIndex) { cleanup(); return; }
    if (state.stage === 'spot') spotLogic();
    if (state.playing && !state.done) {
      state.stepF += (PE.electricalSim.NSTEPS / DAY_SECONDS) * (TICK_MS / 1000);
      const idx = currentStep();
      const mine = env.sim.scenarios[state.scenKey].steps[idx].perString[state.playerIdx];
      const hoursPerTick = (17 / DAY_SECONDS) * (TICK_MS / 1000);
      state.whYou += powerAt(mine.curve, state.vUser) * hoursPerTick;
      state.whPerfect += mine.P * hoursPerTick;
      if (state.stepF >= PE.electricalSim.NSTEPS - 1) {
        state.stepF = PE.electricalSim.NSTEPS - 1;
        state.playing = false;
        state.done = true;
        dom.btnPlay.textContent = '↻ replay day';
        const eff = state.whPerfect > 1 ? (state.whYou / state.whPerfect) * 100 : 100;
        if (state.stage === 'track') {
          dom.verdict.innerHTML = `day over — you kept <b>${eff.toFixed(0)}%</b> of the possible harvest. A real MPPT re-finds the peak <em>hundreds of times a second</em> and stays ≈99.9%. Hit <b>Next</b> to see what breaks it.`;
        } else {
          const kA = env.sim.scenarios.mixed.kwh.toFixed(1);
          const kB = env.sim.scenarios.split.kwh.toFixed(1);
          const gain = ((env.sim.scenarios.split.kwh / env.sim.scenarios.mixed.kwh - 1) * 100).toFixed(0);
          dom.verdict.innerHTML = `you kept <b>${eff.toFixed(0)}%</b> — and even a perfect tracker can only stand on <em>one</em> hump. ` +
            `Over the whole system this wiring costs real energy: <b>${kA} kWh</b> mixed vs <b>${kB} kWh</b> split (+${gain}%). ` +
            `That's the rule: <b>one orientation per tracker input</b>.`;
        }
      }
      draw();
    }
    // sun + tint steering follows the game clock
    const idx = currentStep();
    const w = env.world.elec;
    if (w) {
      const active = state.scenKey === 'mixed' ? w.mixed : w.split;
      active.setIrradiance(idx);
      const sp = PE.electricalSim.sunScenePos(env.data, env.viz, idx, state.centre);
      const main = w.sunHome[0];
      main.l.position.copy(sp.pos);
      main.l.intensity = sp.alt > 0 ? 0.6 + 1.1 * Math.sin((Math.max(0, sp.alt) * Math.PI) / 180) : 0.25;
      w.sunDisc.visible = sp.alt > 0;
      w.sunDisc.position.copy(sp.pos);
    }
  }

  function cleanup() {
    if (timer) { clearInterval(timer); timer = null; }
    if (dom) dom.panel.hidden = true;
    const w = env && env.world.elec;
    if (w && w.sunHome) {
      for (const s of w.sunHome) { s.l.position.copy(s.pos); s.l.intensity = s.intensity; }
      w.sunDisc.visible = false;
    }
  }

  // stage: 'spot' | 'track' | 'mixed'
  function show(context, stage, stepIndex) {
    env = { ...context, sim: PE.electricalSim.compute(context.data) };
    bindDom();
    const bc = PE.geom.centroid(env.data.buildingOutline);
    state = {
      stage, stepIndex,
      scenKey: stage === 'mixed' ? 'mixed' : 'split',
      playerIdx: 0,
      vUser: 150,
      stepF: stage === 'spot' ? SPOT_IDX[0] : 6,
      playing: false, done: false, touched: false,
      whYou: 0, whPerfect: 0,
      holdMs: 0, finds: 0,
      centre: env.viz.toScene(bc[0], bc[1], env.data.groundLevel + 4),
    };
    state.playerIdx = playerStringIndex(state.scenKey);

    // reveal controls one stage at a time
    dom.timerow.hidden = stage === 'spot';
    dom.statsrow.hidden = stage === 'spot';
    dom.modesrow.hidden = stage !== 'mixed';
    dom.btnSplit.classList.toggle('active', state.scenKey === 'split');
    dom.btnMixed.classList.toggle('active', state.scenKey === 'mixed');
    dom.verdict.innerHTML = '';
    dom.btnPlay.textContent = '▶ play day';

    const s = env.sim.scenarios[state.scenKey].strings[state.playerIdx];
    if (stage === 'spot') {
      dom.title.innerHTML = `${s.name} · ${s.panels.length} panels in series · frozen at 08:30`;
      dom.instruction.innerHTML = `<b>Drag on the chart</b> to choose the string's voltage. Somewhere on that curve is a sweet spot — find it and hold it.`;
    } else if (stage === 'track') {
      dom.title.innerHTML = `${s.name} · ${s.panels.length} panels in series`;
      dom.instruction.innerHTML = `Press <b>▶ play</b> and be the tracker: keep your dot on the peak as the whole day runs. The grey dot is a perfect MPPT — try to match its harvest.`;
    } else {
      dom.title.innerHTML = `${s.name} · ${s.panels.length} panels, two orientations, ONE tracker`;
      dom.instruction.innerHTML = `Same game — but the curve now has <b>two humps</b> (the bypass diodes at work). Play the day and mind which hump you're standing on.`;
    }

    dom.panel.hidden = false;
    syncWiring3D();
    if (timer) clearInterval(timer);
    timer = setInterval(tick, TICK_MS);
    draw();
  }

  return { show, cleanup };
})();
