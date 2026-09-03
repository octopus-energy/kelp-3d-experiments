// =====================================================================
// The seven steps of the explainer: narrative text plus enter() hooks
// that drive the 3D scene, labels and the 2D inset. Every enter() sets
// the FULL desired scene state so steps can be visited in any order.
// =====================================================================
window.PE = window.PE || {};

window.PE.buildSteps = function (ctx) {
  const { data, viz, inset } = ctx;
  const W = data.coords.WIDTH, H = data.coords.HEIGHT;
  const ground = data.groundLevel;
  const rad = (d) => (d * Math.PI) / 180;

  // ---------------------------------------------------------------
  // Build the persistent scene content once.
  // ---------------------------------------------------------------
  const world = {};
  (function buildWorld() {
    const g = viz.groups;

    // -- flat CV detections (real inference output, whole tile) --
    // Split into inside/outside the site boundary so step 2 can fade
    // the discarded ones.
    world.detInside = new THREE.Group();
    world.detOutside = new THREE.Group();
    world.detRaw = new THREE.Group(); // pixel-staircase originals, step 1 only
    const CLS_COLOURS = { 'roof face': 0x4dd2ff, conservatory: 0x5ec8ca, obstruction: 0xe57a52 };
    for (const d of data.cvDetections) {
      const colour = CLS_COLOURS[d.cls] || 0x4dd2ff;
      const isObs = d.cls !== 'roof face';
      const opts = {
        fillOpacity: isObs ? 0.3 : 0.16,
        lineOpacity: 0.9,
        lift: isObs ? 0.16 : 0.14,
      };
      (d.insideSite ? world.detInside : world.detOutside).add(viz.flatPoly(d.footprint, colour, opts));
      world.detRaw.add(viz.flatPoly(d.footprintRaw, colour, { ...opts, lift: opts.lift + 0.02 }));
    }
    g.detections.add(world.detInside, world.detOutside, world.detRaw);

    // -- OS outlines: bold ribbons + a soft site fill, so the MasterMap
    // geometry can't be missed against the aerial photo --
    const siteFillVecs = data.siteOutline.map(([x, y]) => viz.toScene(x, y, ground + 0.1));
    const siteFill = new THREE.Mesh(
      viz.polyGeometry(siteFillVecs, data.siteOutline),
      new THREE.MeshBasicMaterial({ color: 0xff4dc4, transparent: true, opacity: 0.1, side: THREE.DoubleSide, depthWrite: false })
    );
    g.os.add(siteFill);
    g.os.add(viz.outlineRibbon(data.siteOutline, 0xff4dc4, { width: 0.3, dash: 1.8, gap: 1.0, opacity: 0.95, lift: 0.2 }));
    g.os.add(viz.outlineRibbon(data.buildingOutline, 0xff4dc4, { width: 0.3, opacity: 1, lift: 0.24 }));

    // -- CV inference crop (50 x 50 m around the geocoded point) --
    world.cvRegion = new THREE.Group();
    world.cvRegion.add(viz.outlineRibbon(data.cvRegionLocal, 0xf5b942, { width: 0.5, dash: 2.4, gap: 1.3, opacity: 0.95, lift: 0.16 }));
    world.cvRegion.visible = false;
    viz.scene.add(world.cvRegion);
    viz.catalogueOpacity(world.cvRegion);

    // -- geocoded address point: a reticle at the dead centre of the
    // tile (the tile and the CV crop are both fetched around it) --
    world.geoPoint = new THREE.Group();
    {
      const gx = data.coords.PROP_LOCAL_X, gy = data.coords.PROP_LOCAL_Y;
      const centre = viz.toScene(gx, gy, ground + 0.22);
      const dot = new THREE.Mesh(
        new THREE.CircleGeometry(0.4, 24),
        new THREE.MeshBasicMaterial({ color: 0xff4dc4, transparent: true, opacity: 1, side: THREE.DoubleSide, depthWrite: false })
      );
      dot.rotation.x = -Math.PI / 2;
      dot.position.copy(centre);
      world.geoPoint.add(dot);
      const ring = [];
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        ring.push([gx + Math.cos(a) * 2.2, gy + Math.sin(a) * 2.2]);
      }
      world.geoPoint.add(viz.outlineRibbon(ring, 0xff4dc4, { width: 0.22, opacity: 0.95, lift: 0.22 }));
      // four compass ticks just outside the ring
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        world.geoPoint.add(viz.outlineRibbon(
          [[gx + dx * 2.7, gy + dy * 2.7], [gx + dx * 4.0, gy + dy * 4.0]],
          0xff4dc4, { width: 0.22, opacity: 0.95, lift: 0.22 }
        ));
      }
      world.geoPoint.visible = false;
      viz.scene.add(world.geoPoint);
      viz.catalogueOpacity(world.geoPoint);
    }

    // -- 3D roof faces --
    for (const f of data.faces) {
      g.roofs3D.add(viz.poly3D(f.points, viz.faceColour(f.azimuth), { fillOpacity: 0.35, lineOpacity: 0.95 }));
    }

    // -- 3D obstructions (sit at DSM height, i.e. on the chimneys) --
    for (const ob of data.obstructions) {
      const pts = ob.footprint.map(([x, y]) => ({ x, y, z: ob.topZ }));
      g.obstructions3D.add(viz.poly3D(pts, 0xe57a52, { fillOpacity: 0.4, lineOpacity: 1, lift: 0.12 }));
    }

    // -- 3D production panels (the real design output for all faces) --
    for (const f of data.faces) {
      for (const arr of f.arrays) {
        for (const p of arr.panels) {
          const mesh = viz.poly3D(p.corners, 0x14181d, { fillOpacity: 0.92, lineOpacity: 1, lift: 0.18 });
          mesh.children[1].material.color.set(0x5ec8ca);
          g.panels3D.add(mesh);
        }
      }
    }

    for (const name of ['detections', 'os', 'roofs3D', 'panels3D', 'obstructions3D']) {
      viz.catalogueOpacity(g[name]);
    }

    // hero face camera anchors
    const hf = data.heroFace;
    const [cx, cy] = PE.geom.centroid(hf.footprint);
    const cz = hf.plane.a + hf.plane.b * cx + hf.plane.c * cy;
    world.heroCentre = viz.toScene(cx, cy, cz);
    const a = rad(hf.azimuth);
    world.heroOut = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)); // horizontal, away from the face
    world.heroSide = new THREE.Vector3(-world.heroOut.z, 0, world.heroOut.x); // along the eave

    // highest point of the building, for the ridge label
    world.ridgeTop = null;
    for (const f of data.faces) {
      for (const p of f.points) {
        if (p.z !== null && (!world.ridgeTop || p.z > world.ridgeTop.z)) world.ridgeTop = p;
      }
    }
  })();

  // ---------------------------------------------------------------
  // Declarative scene state
  // ---------------------------------------------------------------
  const GROUPS = ['os', 'roofs3D', 'panels3D', 'obstructions3D', 'planeFit', 'layout3D', 'shading', 'electrical'];
  // Lazily-built DSM point cloud for step 3 (one dot per 50 cm sample).
  function ensureDsmCloud() {
    if (world.dsmCloud) return world.dsmCloud;
    const { dsm } = data;
    const step = 2;
    const pts = [], cols = [];
    const c1 = new THREE.Color(0x2f6f7d), c2 = new THREE.Color(0xf5b942);
    const zMin = ground - 1, zMax = ground + 15;
    const tmp = new THREE.Color();
    for (let r = 0; r < dsm.nrows; r += step) {
      for (let c = 0; c < dsm.ncols; c += step) {
        const z = dsm.grid[r * dsm.ncols + c];
        if (!isFinite(z) || z === dsm.nodata) continue;
        const x = (c + 0.5) * dsm.cellsize;
        const y = (dsm.nrows - r - 0.5) * dsm.cellsize;
        pts.push(x, z, H - y);
        const t = Math.max(0, Math.min(1, (z - zMin) / (zMax - zMin)));
        tmp.copy(c1).lerp(c2, t);
        cols.push(tmp.r, tmp.g, tmp.b);
      }
    }
    const gm = new THREE.BufferGeometry();
    gm.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    gm.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    const cloud = new THREE.Points(gm, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, opacity: 0.85, depthWrite: false }));
    world.dsmCloud = new THREE.Group();
    world.dsmCloud.add(cloud);
    world.dsmCloud.visible = false;
    viz.scene.add(world.dsmCloud);
    viz.catalogueOpacity(world.dsmCloud);
    return world.dsmCloud;
  }

  function applyState(state) {
    // sub-groups of detections fade independently
    const pairs = [
      [world.detInside, 'detInside'],
      [world.detOutside, 'detOutside'],
      [world.detRaw, 'detRaw'],
      [world.cvRegion, 'cvRegion'],
      [world.geoPoint, 'geoPoint'],
    ];
    if (state.dsmCloud !== undefined || world.dsmCloud) pairs.push([ensureDsmCloud(), 'dsmCloud']);
    for (const [grp, key] of pairs) {
      const t = state[key] || 0;
      viz.groups.detections.visible = true;
      viz.fadeGroup(grp, t, 600, { hideAfter: true });
    }
    for (const name of GROUPS) {
      const t = state[name] || 0;
      if (t > 0 || viz.groups[name].visible) {
        viz.fadeGroup(viz.groups[name], t, 600, { hideAfter: true });
      }
    }
    if (state.morph !== undefined && Math.abs(state.morph - viz.morphT) > 0.01) {
      viz.animateMorph(state.morph, state.morphDuration || 2000);
    }
    // steps that don't ask for a special FOV come back to the default
    tweenFov(state.fov || 50, 800);
    if (state.camera) {
      viz.flyTo(state.camera.pos, state.camera.tgt, state.camera.duration || 1500);
    }
    viz.clearLabels();
    inset.hide();
    if (playback.stop) playback.stop();
  }

  const CAM = {
    top: { pos: new THREE.Vector3(W / 2, ground + 98, H / 2 + 0.01), tgt: new THREE.Vector3(W / 2, ground, H / 2) },
    topClose: { pos: new THREE.Vector3(W / 2, ground + 52, H / 2 + 0.01), tgt: new THREE.Vector3(W / 2, ground, H / 2) },
    region: (() => {
      const [rx, ry] = PE.geom.centroid(data.cvRegionLocal);
      const c = viz.toScene(rx, ry, ground);
      return { pos: new THREE.Vector3(c.x, ground + 66, c.z + 0.01), tgt: c };
    })(),
    oblique: { pos: new THREE.Vector3(W / 2 + 10, ground + 54, H / 2 + 38), tgt: new THREE.Vector3(W / 2, ground + 4, H / 2) },
  };
  CAM.hero = {
    pos: world.heroCentre.clone().addScaledVector(world.heroOut, 12).addScaledVector(world.heroSide, 7).add(new THREE.Vector3(0, 9, 0)),
    tgt: world.heroCentre.clone(),
  };
  CAM.heroWide = {
    pos: world.heroCentre.clone().addScaledVector(world.heroOut, 17).addScaledVector(world.heroSide, 9).add(new THREE.Vector3(0, 13, 0)),
    tgt: world.heroCentre.clone(),
  };
  CAM.context = {
    pos: world.heroCentre.clone().addScaledVector(world.heroOut, 42).addScaledVector(world.heroSide, 12).add(new THREE.Vector3(0, 27, 0)),
    tgt: world.heroCentre.clone(),
  };
  // steep, high pull-back for the shading verdict — looks down over the
  // horizon fan's rim instead of through its translucent wall
  CAM.verdict = {
    pos: world.heroCentre.clone().addScaledVector(world.heroOut, 26).addScaledVector(world.heroSide, 10).add(new THREE.Vector3(0, 46, 0)),
    tgt: world.heroCentre.clone(),
  };

  // ---------------------------------------------------------------
  // Playback machinery for the layout-search animation
  // ---------------------------------------------------------------
  const playback = { stop: null };

  function tweenFov(target, duration = 1000) {
    const from = viz.camera.fov;
    if (Math.abs(from - target) < 0.5) return;
    viz.tween({
      duration,
      onUpdate: (k) => {
        viz.camera.fov = from + (target - from) * k;
        viz.camera.updateProjectionMatrix();
      },
    });
  }

  // ---------------------------------------------------------------
  // Steps
  // ---------------------------------------------------------------
  const fmt = (x, dp = 1) => Number(x).toFixed(dp);
  const heroName = () => {
    const az = data.heroFace.azimuth;
    const dirs = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'];
    const a = ((az % 360) + 360) % 360;
    return dirs[Math.round(a / 45) % 8];
  };

  const steps = [

    // ---------------- STEP 0 ----------------
    {
      title: 'It starts with a flat 2D image',
      text: `
<p><code>solar_potential_from_address()</code> takes an address and returns a full solar design. First the address is geocoded through <strong>OS Places</strong> (UPRN &rarr; easting/northing), then four data sources are fetched in parallel:</p>
<ul>
<li>an <strong>aerial photo</strong> tile — 100&thinsp;m &times; 100&thinsp;m at 25&thinsp;cm/pixel, centred on the property</li>
<li><strong>OS MasterMap</strong> site + building outlines</li>
<li>the <strong>Bluesky DSM</strong> — a surface height map of the same tile</li>
<li>GIS context (wind zone, distance to coast)</li>
</ul>
<p>The pink reticle is the <strong>geocoded point</strong> — and it sits dead centre, because every dataset here (the photo, the DSM, the CV crop) is fetched <em>around</em> it.</p>
<p>At this point the pipeline knows nothing about the roof. Everything you're looking at is just pixels.</p>`,
      code: `solar_calculations.solar_potential_from_address<br>analysis.solar_analysis_from_address<br>services.aerial_images.get_raw_aerial_image`,
      enter() {
        applyState({ morph: 0, geoPoint: 1, camera: { ...CAM.top, duration: 1600 } });
        const gx = data.coords.PROP_LOCAL_X, gy = data.coords.PROP_LOCAL_Y;
        viz.addLabel(
          `geocoded address · OS Places<br><span style="color:var(--text-dim)">easting ${data.siteData.property_details.geocoded_address.easting} · northing ${data.siteData.property_details.geocoded_address.northing}</span>`,
          viz.toScene(gx + 13, gy - 2.5, ground + 0.2)
        );
      },
    },

    // ---------------- STEP 1 ----------------
    {
      title: '1 · Computer vision finds every roof in the frame',
      get text() {
        const roofs = data.cvDetections.filter((d) => d.cls === 'roof face').length;
        const cons = data.cvDetections.filter((d) => d.cls === 'conservatory').length;
        const obs = data.cvDetections.filter((d) => d.cls === 'obstruction').length;
        return `
<p>First the pipeline crops a <strong>50&thinsp;m &times; 50&thinsp;m window</strong> around the geocoded point <em>(amber)</em> — the house is guaranteed to be inside it, and there's no point scanning the whole tile.</p>
<p>That crop goes through a <strong>Roboflow CV workflow</strong> (<code>get_detections_from_raw_image</code>). Every polygon you see is real inference output: <strong>${roofs} roof faces</strong> <em>(blue)</em>, <strong>${cons} conservatories</strong> <em>(teal)</em> and <strong>${obs} obstructions</strong> <em>(orange — chimneys, dormers, vents)</em>, each with a confidence score. Watch the outlines land as raw <strong>pixel staircases</strong>, then relax as they're <strong>regularised</strong> (2-pixel tolerance, exactly as the pipeline does); <code>classify_predictions</code> sorts them into roof faces vs obstructions.</p>
<p>Crucially the model still has no idea which building we care about — it detects everything in the window, neighbours included. That's the next step's problem.</p>`;
      },
      code: `computer_vision.inference.get_detections_from_raw_image<br>computer_vision.output.classify_predictions`,
      enter() {
        // 1) the crop window appears … 2) raw pixel-staircase detections
        // pour in … 3) they relax into the regularised outlines
        applyState({ cvRegion: 1, morph: 0, camera: { ...CAM.region, duration: 1400 } });
        const [r0x, r0y] = data.cvRegionLocal[3];
        viz.addLabel('CV crop · 50 × 50 m', viz.toScene(r0x + 7, r0y - 1.2, ground + 0.2));
        setTimeout(() => {
          if (ctx.currentStep !== 1) return;
          viz.fadeGroup(world.detRaw, 1, 700);
        }, 1500);
        setTimeout(() => {
          if (ctx.currentStep !== 1) return;
          viz.fadeGroup(world.detRaw, 0, 900, { hideAfter: true });
          viz.fadeGroup(world.detInside, 1, 900);
          viz.fadeGroup(world.detOutside, 1, 900);
          const [hx, hy] = PE.geom.centroid(data.heroFace.footprint);
          viz.addLabel('regularised · 2 px tolerance', viz.toScene(hx - 9, hy - 7, ground + 0.2), { cls: 'dim' });
          // label a handful of the biggest detections with their confidence
          const byArea = data.cvDetections.slice().sort((a, b) =>
            Math.abs(PE.geom.area(b.footprint)) - Math.abs(PE.geom.area(a.footprint)));
          for (const d of byArea.filter((x) => x.cls === 'roof face').slice(0, 6)) {
            const [cx, cy] = PE.geom.centroid(d.footprint);
            viz.addLabel(`roof face · ${(d.confidence * 100).toFixed(0)}%`, viz.toScene(cx, cy, ground + 0.2), { cls: d.insideSite ? '' : 'dim' });
          }
          const consD = byArea.find((x) => x.cls === 'conservatory');
          if (consD) {
            const [cx, cy] = PE.geom.centroid(consD.footprint);
            viz.addLabel(`conservatory · ${(consD.confidence * 100).toFixed(0)}%`, viz.toScene(cx, cy, ground + 0.2), { cls: 'dim' });
          }
          const obsD = byArea.find((x) => x.cls === 'obstruction' && x.insideSite);
          if (obsD) {
            const [cx, cy] = PE.geom.centroid(obsD.footprint);
            viz.addLabel('obstruction', viz.toScene(cx, cy, ground + 0.2));
          }
        }, 3400);
      },
    },

    // ---------------- STEP 2 ----------------
    {
      title: '2 · OS data decides which detections matter',
      text: `
<p>Ordnance Survey gives us the legal <strong>site boundary</strong> <em>(dashed pink)</em> and the <strong>building footprint</strong> <em>(solid pink)</em> — real MasterMap geometry for this property — plus metadata like the number of storeys (2 here, straight from the building record).</p>
<p>The filter is unforgiving:</p>
<ul>
<li>detections outside the site boundary are <strong>discarded</strong></li>
<li>a roof face must overlap the building footprint (&ge;10%) — this keeps a detached garage from becoming the "roof"</li>
<li>faces under <strong>4&thinsp;m&sup2;</strong> projected are dropped; faces too small to ever hold 2 panels are reclassified as obstructions</li>
<li>obstructions are kept only inside the site, and their footprints are cut out of the roof faces they touch</li>
</ul>
`,
      code: `services.ordnance_survey.os_data.site_and_building_from_geocoded_address<br>analysis.refine_obstructions_using_site_geometry<br>roof.processing.clean_roof_faces_from_inference_results`,
      enter() {
        applyState({ detInside: 1, detOutside: 0.12, os: 1, morph: 0, camera: { ...CAM.topClose, duration: 1200 } });
        // site + building labels
        const s0 = data.siteOutline[3];
        viz.addLabel('site outline', viz.toScene(s0[0], s0[1], ground + 0.2));
        const b0 = data.buildingOutline[0];
        viz.addLabel('building outline', viz.toScene(b0[0], b0[1], ground + 0.2));
        // flag a few of the larger discarded detections
        const dropped = data.cvDetections
          .filter((d) => !d.insideSite && d.cls === 'roof face')
          .sort((a, b) => Math.abs(PE.geom.area(b.footprint)) - Math.abs(PE.geom.area(a.footprint)))
          .slice(0, 4);
        for (const d of dropped) {
          const [cx, cy] = PE.geom.centroid(d.footprint);
          viz.addLabel('✗ outside site', viz.toScene(cx, cy, ground + 0.2), { cls: 'dim' });
        }
      },
    },

    // ---------------- STEP 3 ----------------
    {
      title: '3 · The DSM turns the picture into a surface',
      text: `
<p>The <strong>Bluesky DSM</strong> arrives as a separate dataset: a 400 &times; 400 grid of surface elevations — one height every 25&thinsp;cm, trees, chimneys and all. Each dot floating above the photo is one of those samples, coloured by height.</p>
<p>The two datasets describe the same place, so the photo can be <strong>lifted to meet the heights</strong> — and the flat tile becomes terrain. <code>analyse_dsm_levels</code> then reads two reference levels off it: <strong>ground level</strong> (${fmt(ground, 0)}&thinsp;m&thinsp;ODN) and the <strong>ridge</strong> (${fmt(data.ridgeElev, 1)}&thinsp;m — a ${fmt(data.siteData.property_details.ridge_height, 1)}&thinsp;m tall roof).</p>
<p>From here on every 2D detection polygon can be given real heights — which is exactly what the next step exploits.</p>`,
      code: `services.bluesky.get_dsm_data.get_bluesky_dsm_data<br>property.dsm_analysis.analyse_dsm_levels`,
      enter() {
        ensureDsmCloud();
        applyState({ morph: 0, dsmCloud: 1, camera: { ...CAM.oblique, duration: 1800 } });
        // 1) point cloud floats above the flat photo … 2) the photo
        // rises to meet it … 3) the dots dissolve into the surface
        setTimeout(() => {
          if (ctx.currentStep !== 3) return;
          viz.animateMorph(1, 2600);
        }, 2100);
        setTimeout(() => {
          if (ctx.currentStep !== 3) return;
          viz.fadeGroup(world.dsmCloud, 0, 1000, { hideAfter: true });
          const rt = world.ridgeTop;
          if (rt) viz.addLabel(`ridge ${fmt(data.ridgeElev, 1)} m`, viz.toScene(rt.x, rt.y, rt.z + 0.6));
          viz.addLabel(`ground ${fmt(ground, 0)} m`, viz.toScene(30, 33, ground + 0.5));
        }, 4900);
      },
    },

    // ---------------- STEP 4 ----------------
    {
      title: '4 · Fit a plane to find slope and orientation',
      text: `
<p>For each roof face, the DSM pixels inside its polygon become a <strong>point cloud</strong> — and a plane <code>z = a + b·x + c·y</code> is regressed through it (<code>find_best_fit_statsmodels</code>). Watch it settle: the plane starts flat at the mean height and tilts until the squared error is minimised — the <strong>RMSE counter</strong> drops as it locks on. The tilt gives the <strong>slope</strong>; the downhill direction gives the <strong>azimuth</strong>. Points are coloured by residual — green hugs the plane, the red blobs are chimneys and noise the fit shrugs off.</p>
<p>But a regression through noisy data can twist. So two more azimuth candidates are derived — from the <strong>detection's own eave edge</strong> and from the nearest <strong>OS building-outline edge</strong> — and each gets its own constrained re-fit plus a RANSAC pass. <code>arbitrage_orientations_from_dsm_and_shape</code> then picks a winner: if candidates agree within <strong>3&deg;</strong>, use the geometric one with high confidence; if they disagree, fall back by fit quality. Flat roofs (&lt;10&deg;) skip the argument entirely.</p>
<p>Confidence comes from calibrated curves on the fit errors, and the face keeps the <em>minimum</em> of its detection, slope and orientation confidences.</p>`,
      code: `roof.processing.roof_confidence_and_attributes<br>roof.regression.find_best_fit_statsmodels<br>roof.processing.arbitrage_orientations_from_dsm_and_shape`,
      enter() {
        applyState({ roofs3D: 0.12, obstructions3D: 0.6, morph: 1, planeFit: 1, camera: { ...CAM.hero, duration: 1800 } });
        const handles = PE.planeFit.build(data, viz);
        viz.fadeGroup(viz.groups.planeFit, 1, 700);
        const { fit } = PE.planeFit.compute(data);
        const statusEl = viz.addLabel('sampling DSM points…', world.heroCentre.clone().add(new THREE.Vector3(0, 4.6, 0)));

        // animate the regression: the plane starts flat at the mean
        // height and converges on the least-squares fit
        const t0 = performance.now() + 1400;
        const DUR = 2600;
        const p0 = handles.startParams, p1 = handles.finalParams;
        const animateFit = (now) => {
          if (ctx.currentStep !== 4) return;
          const k = Math.min(1, Math.max(0, (now - t0) / DUR));
          const e = k * k * (3 - 2 * k);
          const p = { a: p0.a + (p1.a - p0.a) * e, b: p0.b + (p1.b - p0.b) * e, c: p0.c + (p1.c - p0.c) * e };
          const live = handles.setParams(p);
          if (k < 1) {
            statusEl.innerHTML = `fitting plane · slope ${fmt(live.slope)}° · <span style="color:var(--warn)">RMSE ${fmt(live.rmse, 2)} m</span>`;
            requestAnimationFrame(animateFit);
          } else {
            statusEl.innerHTML =
              `${heroName()}-facing · slope ${fmt(fit.slope)}° · az ${fmt(fit.azimuth)}°<br>` +
              `<span style="color:var(--text-dim)">${fit.n.toLocaleString()} DSM pts · RMSE ${fmt(fit.rmse, 2)} m · ${(fit.pctGood * 100).toFixed(0)}% within 1 m</span>`;
            handles.addFitArrows();
            const arrows = PE.planeFit.addCandidateArrows(data, viz);
            viz.fadeGroup(viz.groups.planeFit, 1, 400);
            for (const a of arrows) {
              viz.addLabel(`${a.name} ${fmt(a.az)}°`, a.tip, { cls: a.name === 'plane fit' ? '' : 'dim' });
            }
          }
        };
        requestAnimationFrame(animateFit);
      },
    },

    // ---------------- STEP 5 ----------------
    {
      title: '5 · Brute-force the panel layout',
      text: `
<p><code>find_optimal_solar_panel_layout</code> first <strong>flattens</strong> the face: rotate it so the eave is horizontal and un-tilt it by the slope, so the search works in true metres on the roof plane <em>(the 2D panel below)</em>. The roof edge is inset by the <strong>MCS safety margin</strong> <em>(amber)</em> and obstructions get an installation buffer <em>(orange)</em>.</p>
<p>Then it simply tries <em>everything</em>: row splits top-down and bottom-up, portrait / landscape / mixed rows, <strong>8 vertical offsets</strong> &times; <strong>3 row alignments</strong> — validating every panel against the inset roof and the obstructions. Watch the counter: the winner is the layout with the <strong>most panels</strong> (production tie-breaks on mounting-material cost, part count, then column alignment).</p>
<p>The bottom-centre of the winning array becomes the <strong>MCS point</strong> <em>(pink)</em> — the reference for the shading assessment in the final step.</p>
<div class="note">Panel size and margins here are illustrative defaults, so the count can differ slightly from the production run for this face.</div>`,
      code: `solar.layout.find_optimal_solar_panel_layout<br>solar.layout.split_roof_area · find_largest_inscribed_rectangle_in_strip<br>solar.layout.validate_panels · remove_lone_panels`,
      enter() {
        applyState({ roofs3D: 0.14, obstructions3D: 0.7, morph: 1, camera: { ...CAM.heroWide, duration: 1600 } });

        const sim = PE.layoutSim.compute(data);
        inset.show('layout search · flattened roof plane · true metres');
        const r = PE.layoutSim.makeRenderer(inset.canvas, sim.fl);

        // build (or reuse) the 3D best-layout group, hidden until the search lands
        if (!viz.groups.layout3D.children.length) {
          viz.groups.layout3D.add(PE.layoutSim.bestPanels3D(data, viz));
          viz.catalogueOpacity(viz.groups.layout3D);
        }

        // playback: sweep the candidates (time-indexed so it finishes in
        // ~6s even if the browser throttles animation frames), then land
        // on the best layout
        const order = sim.candidates;
        const MS_PER_CANDIDATE = 42;
        const t0 = performance.now();
        let finished = false, stopped = false, bestSoFar = 0, lastDrawn = -1;
        playback.stop = () => { stopped = true; playback.stop = null; };
        const tick = () => {
          if (stopped) return;
          const i = Math.min(order.length, Math.floor((performance.now() - t0) / MS_PER_CANDIDATE));
          if (i < order.length) {
            if (i !== lastDrawn) {
              // catch up bestSoFar over any skipped candidates
              for (let j = lastDrawn + 1; j <= i; j++) bestSoFar = Math.max(bestSoFar, order[j].count);
              lastDrawn = i;
              const c = order[i];
              r.draw(c);
              inset.hud.innerHTML =
                `<span class="dim">${String(i + 1).padStart(3, ' ')}/${order.length}</span>  ${c.method} · offset ${c.offset.toFixed(2)} m · ${c.align}` +
                `\n<span class="${c.count === bestSoFar && c.count > 0 ? 'ok' : ''}">${c.count} panels fit</span><span class="dim"> · best so far ${bestSoFar}</span>`;
            }
          } else if (!finished) {
            finished = true;
            r.draw(sim.best, { final: true });
            inset.hud.innerHTML =
              `<span class="ok">WINNER</span>  ${sim.best.method} · offset ${sim.best.offset.toFixed(2)} m · ${sim.best.align} · <span class="ok">${sim.best.count} panels</span>` +
              `\n<span class="dim">production design kept ${data.heroFace.arrays.reduce((s, a) => s + a.number_of_panels, 0)} panels here (real panel specs + margins differ)</span>`;
            viz.fadeGroup(viz.groups.layout3D, 1, 900);
            playback.stop = null;
            stopped = true;
          }
          if (!stopped) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
    },

    // ---------------- STEP 6 ----------------
    {
      title: '6 · Score the sky — shading and generation',
      text: `
<p>You are now standing <strong>on the roof, at the MCS point</strong>. From here <code>calculate_shading</code> looks at <strong>every DSM pixel</strong> and asks: how high above the horizon is it, and in which direction? Watch the scan sweep <strong>east to west</strong>: the tallest angle in each 5&deg; bin builds a <strong>horizon profile</strong> rising around you, filling the chart in step. Anything more than 90&deg; behind the roof's own azimuth — the ridge, the other side of the roof — is discounted <em>(grey)</em>. Then the camera pulls back for the verdict.</p>
<p>That horizon is laid over the <strong>MCS sky segments</strong>. A segment more than 10% swallowed by the horizon counts as obstructed, and the <strong>shading factor</strong> is 1&thinsp;&minus;&thinsp;<em>blocked</em>/100.</p>
<p>Generation is then the MCS formula: <code>kWp &times; kWh/kWp &times; SF</code>, where kWh/kWp comes from the regional irradiance table for the face's azimuth and pitch, with monthly shape from the SAP tables. Summing every accepted array gives the property total: <strong>${data.siteData.total_annual_generation_kwh.toLocaleString()} kWh/year</strong> from ${data.siteData.total_number_of_panels} panels.</p>`,
      code: `shading.shading_calculations.calculate_shading<br>standards.mcs_formulas.calculate_solar_generation<br>solar.radiation.solar_radiation_calc`,
      enter() {
        if (!world.horizonFan) {
          world.horizonFan = PE.shadingSim.buildHorizonFan(data, viz);
          viz.groups.shading.add(world.horizonFan.group);
          viz.catalogueOpacity(viz.groups.shading);
        }

        // fly INTO the MCS point — the scan is shown from the array's
        // own point of view, then the camera pulls back for the verdict
        const eye = world.horizonFan.eyePos;
        const firstTarget = world.horizonFan.setSweep(0).aim;
        // fisheye FOV while standing on the roof — take in as much of the
        // horizon as the projection will bear
        applyState({ roofs3D: 0.12, panels3D: 1, obstructions3D: 0.3, morph: 1, shading: 1, fov: 95, camera: { pos: eye, tgt: firstTarget, duration: 1800 } });
        viz.fadeGroup(viz.groups.shading, 1, 700);

        const S = PE.shadingSim.compute(data);
        inset.show('horizon profile vs MCS sky segments · seen from the MCS point');
        const chart = PE.shadingSim.makeChartRenderer(inset.canvas, data);
        chart.draw(0);

        // sweep east → west: the fan rises around the camera while the
        // chart fills in sync, the scan ray tracing the horizon
        const t0 = performance.now() + 2100;
        const DUR = 5200;
        const sweep = (now) => {
          if (ctx.currentStep !== 6) return;
          const k = Math.min(1, Math.max(0, (now - t0) / DUR));
          const scanEnd = world.horizonFan.setSweep(k);
          chart.draw(k);
          if (k > 0 && k < 1) {
            // pan the camera with the scan — level aim, no pitching
            viz.camera.position.copy(eye);
            viz.controls.target.lerp(scanEnd.aim, 0.18);
            const az = -135 + k * 270;
            inset.hud.innerHTML = `<span class="dim">scanning azimuth</span> ${az.toFixed(0)}°  <span class="dim">${az < -45 ? '(east)' : az > 45 ? '(west)' : '(south)'}</span>`;
          }
          if (k < 1) requestAnimationFrame(sweep);
          else {
            viz.flyTo(CAM.verdict.pos, CAM.verdict.tgt, 2200);
            tweenFov(50, 2200);
            // quieten the fan so it doesn't wall off the pulled-back view
            viz.fadeGroup(viz.groups.shading, 0.35, 1600);
            chart.draw(1);
            const kwp = (data.siteData.total_number_of_panels * 0.45).toFixed(2);
            inset.hud.innerHTML =
              `<span class="bad">${S.blockedCount}</span> of ${S.segments.length} segments blocked → shading factor <span class="ok">${S.shadingFactor.toFixed(2)}</span>` +
              `\n<span class="dim">hero array: ${(PE.layoutSim.compute(data).best.count * 0.45).toFixed(2)} kWp × kWh/kWp × SF · property total ${data.siteData.total_annual_generation_kwh.toLocaleString()} kWh/yr (${kwp} kWp)</span>`;
            // per-array output labels once the scan lands
            for (const f of data.faces) {
              for (const arr of f.arrays) {
                if (!arr.panels.length || !arr.annual_output) continue;
                const mid = arr.panels[Math.floor(arr.panels.length / 2)];
                const c = mid.corners[0];
                viz.addLabel(
                  `${arr.number_of_panels} panels · ${arr.annual_output.toLocaleString()} kWh/yr · SF ${arr.shading_factor}`,
                  viz.toScene(c.x, c.y, c.z + 1.2),
                  { cls: 'dim' }
                );
              }
            }
          }
        };
        requestAnimationFrame(sweep);
      },
    },

    // ---------------- STEP 7 ----------------
    {
      title: '7 · Strings, MPPT and the inverter',
      get text() {
        const sim = PE.electricalSim.compute(data);
        const letters = sim.groups.map((g) => `${g.letter} (${g.panels.length})`).join(', ');
        const mixName = sim.scenarios.mixed.strings[0].name.replace('S1 · ', '');
        const gain = ((sim.scenarios.split.kwh / sim.scenarios.mixed.kwh - 1) * 100).toFixed(0);
        return `
<p>The pipeline stops at kWh per array — harvesting them is the inverter's job. Panels are wired in <strong>series strings</strong> (follow the coloured wires): their voltages add up, but the whole string carries <strong>one shared current</strong>.</p>
<p>Here's the subtle part: a string has no fixed output. The inverter chooses what <strong>voltage</strong> to hold it at, and the power depends on that choice — that's the curve on the left <em>(every possible voltage, and the power you'd get)</em>. Hold it too low and you waste voltage; push too high and the current collapses. The sweet spot in between is the <strong>Maximum Power Point</strong> — and it drifts all day as light changes. An <strong>MPPT</strong> (Maximum Power Point <em>Tracker</em>) is a small controller that constantly nudges the voltage and re-measures, hunting for the peak — the dot riding each curve. This inverter has <strong>3 independent trackers</strong>, each free to hold a different voltage.</p>
<p>But panels sharing one tracker must live at <strong>one voltage, one current</strong> — a poorly-lit panel can't pass the others' current, its bypass diode cuts it out, and the curve splits into <strong>humps</strong>; the tracker can only stand on one of them. Arrays here: <strong>${letters}</strong>.</p>
<p>So watch the same June day twice. First with <strong>${mixName}</strong> forced onto one tracker — whichever side the sun favours, the other drags it down. Then re-wired, <strong>one orientation per tracker</strong>: <strong>+${gain}% energy from the same panels</strong>. That's why orientations get their own strings.</p>
<div class="note">Illustrative electrical model (450 W panels, simplified single-diode + bypass, clear June day, no temperature effects) — this layer isn't in the pipeline yet.</div>`;
      },
      code: `not in solar_potential_from_address yet — the pipeline<br>hands the design over at array level (kWh, layout, materials)`,
      enter() {
        const sim = PE.electricalSim.compute(data);
        // build both wiring worlds once
        if (!world.elec) {
          world.elec = {
            mixed: PE.electricalSim.buildWiring(data, viz, 'mixed'),
            split: PE.electricalSim.buildWiring(data, viz, 'split'),
          };
          viz.groups.electrical.add(world.elec.mixed.group, world.elec.split.group);
          world.elec.sunDisc = new THREE.Mesh(
            new THREE.SphereGeometry(2.4, 16, 16),
            new THREE.MeshBasicMaterial({ color: 0xffd989 })
          );
          viz.groups.electrical.add(world.elec.sunDisc);
          world.elec.sunHome = viz.scene.children
            .filter((c) => c.isDirectionalLight)
            .map((l) => ({ l, pos: l.position.clone(), intensity: l.intensity }));
          viz.catalogueOpacity(viz.groups.electrical);
        }
        const bc = PE.geom.centroid(data.buildingOutline);
        const centre = viz.toScene(bc[0], bc[1], data.groundLevel + 4);
        applyState({
          panels3D: 1, morph: 1, electrical: 1,
          camera: { pos: new THREE.Vector3(centre.x + 7, data.groundLevel + 21, centre.z + 28), tgt: centre, duration: 1800 },
        });
        viz.addLabel(`inverter · 3.68 kW · ${PE.electricalSim.INVERTER.mppts} MPPT`, world.elec.mixed.invPos.clone().add(new THREE.Vector3(0, 1.3, 0)));

        inset.show('the same June day, twice — mixed wiring vs one orientation per MPPT');
        const dash = PE.electricalSim.makeDashboard(inset.canvas, data);
        const sun = (l) => world.elec.sunHome.find((s) => s.l === l);

        // playback: mixed day → re-wire → split day → verdict, looping
        const NS = PE.electricalSim.NSTEPS;
        const STEP_MS = 135;
        let phase = 0; // 0 = mixed, 1 = split
        let idx = 0;
        let holdUntil = 0;
        world.elec.mixed.group.visible = true;
        world.elec.split.group.visible = false;

        const restoreSun = () => {
          for (const s of world.elec.sunHome) { s.l.position.copy(s.pos); s.l.intensity = s.intensity; }
          world.elec.sunDisc.visible = false;
        };

        // interval, not rAF: keeps the day advancing even if the tab is
        // briefly backgrounded mid-playback
        const timer = setInterval(() => {
          if (ctx.currentStep !== 7) { restoreSun(); clearInterval(timer); return; }
          const now = performance.now();
          if (now >= holdUntil) {
            const scenKey = phase === 0 ? 'mixed' : 'split';
            const active = world.elec[scenKey];
            active.setIrradiance(idx);
            dash.draw(scenKey, idx, phase === 1 ? 'mixed' : null);
            // steer the sun light + disc
            const sp = PE.electricalSim.sunScenePos(data, viz, idx, centre);
            const main = world.elec.sunHome[0];
            main.l.position.copy(sp.pos);
            main.l.intensity = sp.alt > 0 ? 0.6 + 1.1 * Math.sin((Math.max(0, sp.alt) * Math.PI) / 180) : 0.25;
            world.elec.sunDisc.visible = sp.alt > 0;
            world.elec.sunDisc.position.copy(sp.pos);
            // HUD
            const st = sim.scenarios[scenKey].steps[idx];
            const parts = st.perString.map((r, si) => `${sim.scenarios[scenKey].strings[si].name.slice(0, 2)} ${r.P.toFixed(0)}W`);
            inset.hud.innerHTML = `<span class="dim">${dash.fmtTime(sim.times[idx])} · ${sim.scenarios[scenKey].label}</span>  ${parts.join(' · ')} → <span class="${st.ac >= 3680 ? 'bad' : 'ok'}">AC ${st.ac.toFixed(0)}W${st.ac >= 3680 ? ' (clipping)' : ''}</span>`;

            idx++;
            if (idx >= NS) {
              idx = 0;
              if (phase === 0) {
                phase = 1;
                world.elec.mixed.group.visible = false;
                world.elec.split.group.visible = true;
                inset.hud.innerHTML = `<span class="dim">re-wiring…</span> mixed day: <span class="bad">${sim.scenarios.mixed.kwh.toFixed(1)} kWh</span> — now one orientation per MPPT`;
                holdUntil = now + 2200; // hold on the re-wire beat
              } else {
                phase = 0;
                const gain = ((sim.scenarios.split.kwh / sim.scenarios.mixed.kwh - 1) * 100).toFixed(0);
                inset.hud.innerHTML =
                  `mixed <span class="bad">${sim.scenarios.mixed.kwh.toFixed(1)} kWh</span> → split <span class="ok">${sim.scenarios.split.kwh.toFixed(1)} kWh</span> (+${gain}%) · same panels, same day` +
                  `\n<span class="dim">replaying…</span>`;
                world.elec.split.group.visible = false;
                world.elec.mixed.group.visible = true;
                holdUntil = now + 4200; // hold on the verdict
              }
            }
          }
        }, STEP_MS);
      },
    },
  ];

  // step 0 has no number prefix in the chip row
  steps.forEach((s, i) => { s.chip = i === 0 ? 'start' : String(i); });
  return steps;
};
