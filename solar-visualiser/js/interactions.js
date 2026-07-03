// =====================================================================
// Mouse hover tooltips for roof faces / panels, and the eased
// fly-to-array camera animation triggered from the sidebar list.
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.setupHoverTooltip = function ({ view, hoverables, tooltipEl }) {
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  function onMouseMove(e) {
    mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    raycaster.setFromCamera(mouse, view.camera);
    const candidates = hoverables.filter(m => {
      let p = m;
      while (p) { if (!p.visible) return false; p = p.parent; }
      return true;
    });
    const hits = raycaster.intersectObjects(candidates, false);
    if (hits.length > 0) {
      const d = hits[0].object.userData;
      let html = '';
      if (d.type === 'panel') {
        html = `
          <div class="tt-title">${d.manufacturer} ${d.model}</div>
          <div class="tt-row"><span>Rated power</span><span>${d.ratedPower} W</span></div>
          <div class="tt-row"><span>Annual output</span><span>${d.annualOutput} kWh</span></div>
          <div class="tt-row"><span>Shading factor</span><span>${(d.shadingFactor*100).toFixed(0)}%</span></div>
          <div class="tt-row"><span>Orientation</span><span>${d.orientation}</span></div>
          <div class="tt-row"><span>Scaffolding</span><span>${d.scaffold}</span></div>`;
      } else if (d.type === 'scaffold') {
        html = `
          <div class="tt-title">${d.name}</div>
          <div class="tt-row"><span>Length</span><span>${d.length} m</span></div>
          <div class="tt-row"><span>Height</span><span>${d.height}</span></div>
          <div class="tt-row"><span>Chargeable area</span><span>${d.area} m²</span></div>
          <div class="tt-row"><span>Cost</span><span>${d.cost}</span></div>`;
      } else if (d.type === 'roof') {
        html = `
          <div class="tt-title">${d.description}</div>
          <div class="tt-row"><span>Azimuth</span><span>${d.azimuth}°</span></div>
          <div class="tt-row"><span>Tilt</span><span>${d.tilt}°</span></div>
          <div class="tt-row"><span>Area</span><span>${d.area} m²</span></div>
          <div class="tt-row"><span>Panels</span><span>${d.panels}</span></div>
          <div class="tt-row"><span>Annual output</span><span>${d.annualOutput} kWh</span></div>
          <div class="tt-row"><span>Shading</span><span>${d.shading}%</span></div>`;
      }
      tooltipEl.innerHTML = html;
      tooltipEl.style.display = 'block';
      tooltipEl.style.left = (e.clientX + 14) + 'px';
      tooltipEl.style.top = (e.clientY + 14) + 'px';
    } else {
      tooltipEl.style.display = 'none';
    }
  }

  window.addEventListener('mousemove', onMouseMove);
};

// Returns { animateCamera, update } where animateCamera(targetPos, lookAt)
// kicks off an eased fly-to, and update(dt) advances it each frame.
window.SolarViz.createCameraAnimator = function (camera, controls) {
  let camAnim = null;

  function animateCamera(targetPos, lookAt) {
    camAnim = {
      startPos: camera.position.clone(),
      endPos: targetPos.clone(),
      startTarget: controls.target.clone(),
      endTarget: lookAt.clone(),
      t: 0, dur: 0.9,
    };
  }

  function update(dt) {
    if (!camAnim) return;
    camAnim.t += dt / camAnim.dur;
    const t = Math.min(camAnim.t, 1);
    const ease = t < 0.5 ? 2*t*t : 1 - Math.pow(-2*t+2, 2)/2;
    camera.position.lerpVectors(camAnim.startPos, camAnim.endPos, ease);
    controls.target.lerpVectors(camAnim.startTarget, camAnim.endTarget, ease);
    if (t >= 1) camAnim = null;
  }

  return { animateCamera, update };
};
