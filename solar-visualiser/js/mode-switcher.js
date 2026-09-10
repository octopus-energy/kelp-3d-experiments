// =====================================================================
// Top-level mode toggle: Solar (survey + panels + scaffolding), ASHP
// (building model: solid, floors, rooms, windows/radiators), EVC
// (placeholder). Swaps the sidebar panels and the 3D layers; the solar
// View Layers checkboxes are re-applied when returning to Solar mode.
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.setupModeSwitcher = function ({ groups, building, photoMatch, facade, planDraw, panels, legendEl }) {
  const $ = (id) => document.getElementById(id);
  const buttons = Array.from(document.querySelectorAll('#mode-toggle button'));
  const KEY = 'viz-mode';
  const solarGroups = [
    groups.roofGroup, groups.panelGroup, groups.obstructionGroup,
    groups.rejectedGroup, groups.scaffoldRoot,
  ];

  function applySolarLayerCheckboxes() {
    groups.roofGroup.visible = $('t-roofs').checked;
    groups.panelGroup.visible = $('t-panels').checked;
    groups.obstructionGroup.visible = $('t-obstructions').checked;
    groups.rejectedGroup.visible = $('t-rejected').checked;
    groups.scaffoldRoot.visible = $('t-scaffold').checked;
    groups.markerLine.visible = true;
  }

  function setMode(mode) {
    if (planDraw && planDraw.isActive()) planDraw.cancel();
    buttons.forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    Object.keys(panels).forEach((m) => {
      if (panels[m]) panels[m].style.display = m === mode ? '' : 'none';
    });
    if (legendEl) legendEl.style.display = mode === 'solar' ? '' : 'none';

    if (mode === 'solar') {
      applySolarLayerCheckboxes();
    } else {
      solarGroups.forEach((g) => { g.visible = false; });
      groups.markerLine.visible = false;
    }
    if (building) building.setActive(mode === 'ashp');
    if (photoMatch) photoMatch.setActive(mode === 'ashp');
    if (facade) facade.setActive(mode === 'ashp');
    try { localStorage.setItem(KEY, mode); } catch (e) { /* private mode */ }
  }

  buttons.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));

  let initial = 'solar';
  try { initial = localStorage.getItem(KEY) || 'solar'; } catch (e) { /* private mode */ }
  initial=new URLSearchParams(location.search).get('mode')||initial;
  if (!['solar', 'ashp', 'evc'].includes(initial)) initial = 'solar';
  setMode(initial);

  return { setMode };
};
