// =====================================================================
// Entry point: prepare data, build the scene, wire up step navigation.
// =====================================================================
(function () {
  const loader = document.getElementById('loader');
  const loaderStatus = document.getElementById('loader-status');
  const setStatus = (t) => { loaderStatus.textContent = t; };

  function fail(msg) {
    loaderStatus.textContent = msg;
    loaderStatus.style.color = '#e05c5c';
  }

  if (typeof THREE === 'undefined') return fail('THREE.js failed to load — serve from the repo root so ../solar-visualiser resolves.');
  if (typeof window.SITE_DATA === 'undefined') return fail('site-data.js failed to load — serve from the repo root.');

  setStatus('Decoding DSM + preparing geometry');

  setTimeout(() => {
    const data = PE.prepareData();
    setStatus('Building 3D scene');

    const viz = PE.createScene(data, document.getElementById('canvas-wrap'));

    // ---- inset panel API ----
    const insetEl = document.getElementById('inset');
    const inset = {
      canvas: document.getElementById('inset-canvas'),
      hud: document.getElementById('inset-hud'),
      show(title) {
        document.getElementById('inset-title').textContent = title;
        this.hud.innerHTML = '';
        insetEl.hidden = false;
      },
      hide() {
        insetEl.hidden = true;
      },
    };

    const ctx = { data, viz, inset, currentStep: -1 };
    const steps = PE.buildSteps(ctx);

    // ---- sidebar nav ----
    const nav = document.getElementById('step-nav');
    const kicker = document.getElementById('step-kicker');
    const title = document.getElementById('step-title');
    const text = document.getElementById('step-text');
    const codeEl = document.getElementById('step-code');
    const btnPrev = document.getElementById('btn-prev');
    const btnNext = document.getElementById('btn-next');

    const chips = steps.map((s, i) => {
      const b = document.createElement('button');
      b.className = 'step-chip';
      b.textContent = s.chip;
      b.addEventListener('click', () => goTo(i));
      nav.appendChild(b);
      return b;
    });

    function goTo(i) {
      if (i < 0 || i >= steps.length || i === ctx.currentStep) return;
      ctx.currentStep = i;
      const s = steps[i];
      kicker.textContent = i === 0 ? 'THE PIPELINE' : `STEP ${i} OF ${steps.length - 1}`;
      title.textContent = s.title;
      text.innerHTML = s.text;
      codeEl.innerHTML = `<span class="lbl">IN THE CODE</span><code>${s.code.replace(/<br>/g, '</code><br><code>')}</code>`;
      chips.forEach((c, j) => {
        c.classList.toggle('active', j === i);
        c.classList.toggle('done', j < i);
      });
      btnPrev.disabled = i === 0;
      btnNext.textContent = i === steps.length - 1 ? 'Done ✓' : 'Next →';
      btnNext.disabled = false;
      document.querySelector('.step-body').scrollTop = 0;
      s.enter();
    }

    btnPrev.addEventListener('click', () => goTo(ctx.currentStep - 1));
    btnNext.addEventListener('click', () => {
      if (ctx.currentStep < steps.length - 1) goTo(ctx.currentStep + 1);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === ' ') goTo(ctx.currentStep + 1);
      if (e.key === 'ArrowLeft') goTo(ctx.currentStep - 1);
    });

    viz.renderLoop();
    goTo(0);
    loader.classList.add('hidden');

    // dev aid: lets tooling drive the explainer and inspect scene state
    window.PE_DEBUG = { ctx, goTo, viz, data };
  }, 30);
})();
