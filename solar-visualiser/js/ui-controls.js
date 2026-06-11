// =====================================================================
// Sidebar bindings: layer toggles + display sliders.
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.setupUIControls = function ({ terrainMesh, matTextured, matSolid, roofGroup, panelGroup, obstructionGroup, rejectedGroup, markerLine }) {
  const $ = id => document.getElementById(id);

  $('t-terrain').addEventListener('change', e => terrainMesh.visible = e.target.checked);
  $('t-image').addEventListener('change', e => {
    terrainMesh.material = e.target.checked ? matTextured : matSolid;
  });
  $('t-roofs').addEventListener('change', e => roofGroup.visible = e.target.checked);
  $('t-panels').addEventListener('change', e => panelGroup.visible = e.target.checked);
  $('t-obstructions').addEventListener('change', e => obstructionGroup.visible = e.target.checked);
  $('t-rejected').addEventListener('change', e => rejectedGroup.visible = e.target.checked);
  $('t-wireframe').addEventListener('change', e => {
    matSolid.wireframe = e.target.checked;
    if (e.target.checked) {
      matSolid.color.setHex(0x4dabf7);
      terrainMesh.material = matSolid;
    } else {
      matSolid.color.setHex(0x3a4048);
      if ($('t-image').checked) terrainMesh.material = matTextured;
    }
  });

  $('zexag').addEventListener('input', e => {
    const exag = parseFloat(e.target.value);
    $('v-zexag').textContent = exag.toFixed(1) + '×';
    terrainMesh.scale.y = exag;
    roofGroup.scale.y = exag;
    panelGroup.scale.y = exag;
    obstructionGroup.scale.y = exag;
    rejectedGroup.scale.y = exag;
    markerLine.scale.y = exag;
  });

  $('img-opacity').addEventListener('input', e => {
    const v = parseFloat(e.target.value) / 100;
    $('v-opacity').textContent = e.target.value + '%';
    matTextured.opacity = v;
    matTextured.transparent = v < 1;
  });

  $('roof-opacity').addEventListener('input', e => {
    const v = parseFloat(e.target.value) / 100;
    $('v-roofop').textContent = e.target.value + '%';
    roofGroup.children.forEach(c => {
      if (c.material && c.material.transparent && c.material.type === 'MeshStandardMaterial') {
        c.material.opacity = v;
      }
    });
  });

  $('panel-lift').addEventListener('input', e => {
    const cm = parseFloat(e.target.value);
    $('v-lift').textContent = cm.toFixed(0) + ' cm';
    window.SolarViz.updatePanelLift(panelGroup, cm / 100);
  });
};
