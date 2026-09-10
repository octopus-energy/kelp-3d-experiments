// =====================================================================
// Core THREE.js scene: renderer, camera, controls and lighting.
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.createSceneSetup = function (canvasWrapEl, coords) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d10);
  scene.fog = new THREE.Fog(0x0b0d10, 80, 180);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.5, 500);
  const target = new THREE.Vector3(coords.PROP_LOCAL_X, coords.groundY + 3, coords.HEIGHT - coords.PROP_LOCAL_Y);
  camera.position.copy(target).add(new THREE.Vector3(-5, 38, 30));

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvasWrapEl.appendChild(renderer.domElement);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.copy(target);
  controls.maxDistance = 200;
  controls.minDistance = 10;
  controls.maxPolarAngle = Math.PI / 2.1;

  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sun = new THREE.DirectionalLight(0xfff4d6, 1.1);
  sun.position.copy(target).add(new THREE.Vector3(-10, 48, -20));
  sun.target.position.copy(target);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.width = 2048;
  sun.shadow.mapSize.height = 2048;
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 200;
  sun.shadow.bias = -0.0005;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x88aaff, 0x335544, 0.3));

  return { scene, camera, renderer, controls, sun };
};
