import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.022); // Add atmospheric depth to the cave
const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.05,
    1000
);
// Start outside the cave, looking back at the entrance, so the whole
// mouth (and the boat rowing in/out of it) is in view from the start.
// This scene is Z-up (the water plane lies in world XY, so "up" is +Z).
// Set that BEFORE lookAt — otherwise lookAt uses the default +Y up and rolls
// the horizon on load (the tilt you saw). PointerLockControls re-levels it the
// moment you click, which is why only the load view looked tilted.
camera.up.set(0, 0, 1);
camera.position.set(2.2, 11.5, 2.2);
camera.lookAt(-0.2, 2.0, -0.6);

const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// The scene is rendered twice per frame (depth pre-pass + main pass for water
// refraction). Shadow maps only need to be computed once; without this, all
// 7 point-light shadow cubemaps re-render every shadow caster twice per frame.
renderer.shadowMap.autoUpdate = false;
document.body.appendChild(renderer.domElement);

const controls = new PointerLockControls(camera, renderer.domElement);

const style = document.createElement('style');
style.textContent = `
    #flight-overlay {
        position: fixed; inset: 0;
        display: flex; align-items: center; justify-content: center;
        background: rgba(5, 6, 10, 0.72);
        color: #e6e6e6;
        font-family: system-ui, -apple-system, sans-serif;
        cursor: pointer;
        z-index: 10;
        transition: opacity 0.18s ease-out;
    }
    #flight-overlay.hidden { opacity: 0; pointer-events: none; }
    #flight-overlay .panel { text-align: center; line-height: 1.7; }
    #flight-overlay h1 {
        margin: 0 0 0.8em; font-weight: 300; letter-spacing: 0.06em;
        font-size: 1.6rem;
    }
    #flight-overlay .keys { display: grid; gap: 0.25em; font-size: 0.95rem; opacity: 0.9; }
    #flight-overlay kbd {
        display: inline-block;
        padding: 1px 7px;
        border: 1px solid #555;
        border-bottom-width: 2px;
        border-radius: 4px;
        background: #1a1a1a;
        color: #ffaa44;
        font-family: ui-monospace, Menlo, monospace;
        font-size: 0.85em;
    }
`;
document.head.appendChild(style);

const overlay = document.createElement('div');
overlay.id = 'flight-overlay';
overlay.innerHTML = `
    <div class="panel">
        <h1>Click to fly</h1>
        <div class="keys">
            <div><kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd> &nbsp; move</div>
            <div><kbd>Space</kbd> up &nbsp;·&nbsp; <kbd>Shift</kbd> down</div>
            <div><kbd>Ctrl</kbd> boost &nbsp;·&nbsp; <kbd>Mouse</kbd> look</div>
            <div><kbd>P</kbd> log position as a torch line</div>
            <div><kbd>Esc</kbd> release pointer</div>
        </div>
    </div>
`;
document.body.appendChild(overlay);

overlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock',   () => overlay.classList.add('hidden'));
controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));

const keys = Object.create(null);
addEventListener('keydown', (e) => { keys[e.code] = true; });
addEventListener('keyup',   (e) => { keys[e.code] = false; });

addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

addEventListener('keydown', (e) => {
    if (e.code !== 'KeyP' || !controls.isLocked) return;
    const p = camera.position;
    const line = `createTorch(new THREE.Vector3(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})),`;
    console.log(line);
    if (navigator.clipboard) navigator.clipboard.writeText(line).catch(() => {});
    flashHud();
});

const BASE_SPEED = 2.5;
const BOOST_MULT = 4.0;
const SMOOTHING  = 12.0;

const velocity  = new THREE.Vector3();
const inputDir  = new THREE.Vector3();
const targetVel = new THREE.Vector3();

addEventListener('wheel', (e) => {
    if (!controls.isLocked) return;
    const factor = Math.exp(-e.deltaY * 0.001);
    speedScale = THREE.MathUtils.clamp(speedScale * factor, 0.2, 8.0);
}, { passive: true });
let speedScale = 1.0;

const hudStyle = document.createElement('style');
hudStyle.textContent = `
    #flight-hud {
        position: fixed; top: 12px; left: 12px;
        padding: 8px 12px;
        background: rgba(0, 0, 0, 0.55);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 4px;
        color: #ddd;
        font: 12px/1.55 ui-monospace, Menlo, Consolas, monospace;
        white-space: pre;
        pointer-events: none;
        z-index: 5;
        transition: background-color 0.15s ease-out;
    }
    #flight-hud .lbl  { color: #888; }
    #flight-hud .hint { color: #777; font-size: 11px; }
    #flight-hud.flash { background: rgba(255, 170, 68, 0.35); }
`;
document.head.appendChild(hudStyle);

const hud = document.createElement('div');
hud.id = 'flight-hud';
document.body.appendChild(hud);

// --- PASTE THIS RIGHT AFTER THE HUD IS APPENDED ---

// Underwater filter: a blurred blue-tinted glass pane over the canvas that fades
// in continuously with submersion depth.
const underwaterStyle = document.createElement('style');
underwaterStyle.textContent = `
    #underwater-overlay {
        position: fixed; inset: 0;
        pointer-events: none;
        z-index: 4;
        background: rgba(15, 70, 90, 0);
        backdrop-filter: blur(0px) saturate(0.9);
        -webkit-backdrop-filter: blur(0px) saturate(0.9);
        transition: background-color 0.25s ease-out, backdrop-filter 0.25s ease-out;
        mix-blend-mode: normal;
    }
`;
document.head.appendChild(underwaterStyle);

const underwaterOverlay = document.createElement('div');
underwaterOverlay.id = 'underwater-overlay';
document.body.appendChild(underwaterOverlay);

// 0 (dry) -> 1 (fully submerged); ramps the CSS blur/tint and the fog together.
function setUnderwaterFactor(t) {
    const blurPx = t * 6;
    underwaterOverlay.style.backdropFilter = `blur(${blurPx.toFixed(2)}px) saturate(${(1 - 0.3 * t).toFixed(2)})`;
    underwaterOverlay.style.webkitBackdropFilter = underwaterOverlay.style.backdropFilter;
    underwaterOverlay.style.backgroundColor = `rgba(15, 70, 90, ${(t * 0.38).toFixed(3)})`;
}

// Target color for the underwater fog
const _underwaterFogColor = new THREE.Color(0x1f6f7a);

const _fwd = new THREE.Vector3();
const fmt = (n) => (n >= 0 ? ' ' : '') + n.toFixed(2);

let _frames = 0;
let _fpsT   = performance.now();
let _fps    = 0;
function tickFps(now) {
    _frames++;
    if (now - _fpsT >= 500) {
        _fps = (_frames * 1000) / (now - _fpsT);
        _frames = 0;
        _fpsT = now;
    }
}

let _hudT = 0;
function updateHud(now) {
    if (now - _hudT < 100) return;
    _hudT = now;

    camera.getWorldDirection(_fwd);
    const p = camera.position;
    const r = renderer.info.render;
    hud.innerHTML =
        `<span class="lbl">pos  </span>${fmt(p.x)}  ${fmt(p.y)}  ${fmt(p.z)}\n` +
        `<span class="lbl">look </span>${fmt(_fwd.x)}  ${fmt(_fwd.y)}  ${fmt(_fwd.z)}\n` +
        `<span class="lbl">speed</span> ×${speedScale.toFixed(2)}\n` +
        `<span class="lbl">fps  </span>${_fps.toFixed(0).padStart(5)}   ` +
        `<span class="lbl">calls</span> ${String(r.calls).padStart(4)}   ` +
        `<span class="lbl">tris</span> ${(r.triangles / 1000).toFixed(0)}k\n` +
        `<span class="hint">P — log torch at this spot</span>`;
}

function flashHud() {
    hud.classList.add('flash');
    setTimeout(() => hud.classList.remove('flash'), 180);
}

let _lastLogT = 0;
const _lastLogPos = new THREE.Vector3(Infinity, Infinity, Infinity);
function maybeLogPosition() {
    if (!controls.isLocked) return;
    const now = performance.now();
    if (now - _lastLogT < 1000) return;
    if (camera.position.distanceTo(_lastLogPos) < 0.05) return;
    _lastLogT = now;
    _lastLogPos.copy(camera.position);
    const p = camera.position;
    console.log(`camera.position.set(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)});`);
}


// --- REPLACE YOUR EXISTING AMBIENT/HEMI/DIRECTIONAL LIGHTS WITH THIS ---
// These are non-positional fills -- they light the WHOLE cave evenly,
// including the unlit back where the bats roost. Kept low on purpose (and
// lower than before) so the brighter torches dominate near the entrance
// while the torch-less back stays genuinely dark instead of ambient-lit.
const ambientLight = new THREE.AmbientLight(0x3a4658, 0.16);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x55677f, 0x2a2018, 0.22);
hemiLight.position.set(0, 0, 5);
scene.add(hemiLight);

const skyShaft = new THREE.DirectionalLight(0x9fb6cc, 0.16);
skyShaft.position.set(2.5, 4.0, 3.0);
skyShaft.target.position.set(-0.5, -4.0, -0.5);
scene.add(skyShaft, skyShaft.target);

const riverPoints = [

    new THREE.Vector3( -1.2,   3.0, -1.0),
    new THREE.Vector3( -0.6,   0.0, -1.0),
    new THREE.Vector3( -1.9,  -3.5, -1.0),
    new THREE.Vector3( -0.6,  -7.0, -1.0),
    new THREE.Vector3( -0.9, -10.0, -1.0),

    new THREE.Vector3( -0.7, -11.0, -1.0),

    new THREE.Vector3( -0.5, -10.0, -1.0),
    new THREE.Vector3( -0.5,  -3.5, -1.0),
    new THREE.Vector3( -0.5,   3.0, -1.0)
];

const riverCurve = new THREE.CatmullRomCurve3(riverPoints, false);

// The boat follows an EXTENDED version of the river path that reaches out
// past the cave mouth (+Y) at both ends, so every loop it rows out of the
// cave and back in. riverCurve itself is left unchanged, so the wall torches
// placed along it stay exactly where they are.
// The open water gap at the entrance cut plane (y=4) spans roughly
// x -0.6..1.8 at boat height, so the transit through the mouth is routed
// near the middle of that gap instead of hugging the left rock wall.
const boatPoints = [
    new THREE.Vector3( 0.4, 14.0, -1.0),   // fully outside the scene — boat enters from here
    new THREE.Vector3( 0.4,  7.5, -1.0),   // straight run-up toward the opening
    new THREE.Vector3(-0.1,  3.9, -1.0),   // centered in the mouth as he crosses the entrance
    ...riverPoints,
    new THREE.Vector3( 0.1,  4.0, -1.0),   // back out through the middle of the opening
    new THREE.Vector3( 0.5,  7.5, -1.0),
    new THREE.Vector3( 0.5, 14.0, -1.0),   // fully outside the scene — boat exits to here
];
const boatCurve = new THREE.CatmullRomCurve3(boatPoints, false);

// The boat path is much longer than the river path (it reaches way outside
// the scene at both ends). Scale progress speed so his rowing pace in world
// units stays the same as before.
const BOAT_SPEED_SCALE = riverCurve.getLength() / boatCurve.getLength();

const pathGeometry = new THREE.TubeGeometry(riverCurve, 64, 0.05, 8, false);
const pathMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: false });
const visiblePath = new THREE.Mesh(pathGeometry, pathMaterial);
scene.add(visiblePath);

// Hide the cyan debug tube that marks the river path (set true to show it again).
visiblePath.visible = false;

function wallTorchPlacement(progress, side, wallDist, z) {
    const p = riverCurve.getPointAt(progress);
    const tangent = riverCurve.getTangentAt(progress).normalize();
    const perp = new THREE.Vector2(-tangent.y, tangent.x).normalize();
    const outward = perp.multiplyScalar(side);
    const pos = new THREE.Vector3(p.x + outward.x * wallDist, p.y + outward.y * wallDist, z);
    const facing = outward.clone().multiplyScalar(-1);
    return { pos, facing };
}

function createTorch(position, { intensity = 12, color = 0xe6a874, castShadow = false } = {}) {
    const light = new THREE.PointLight(color, intensity, 25, 2);
    light.position.copy(position);
    light.castShadow = castShadow;
    // Remember which torches were authored as shadow casters. We only ever
    // let a handful of these be castShadow=true at once (see
    // updateActiveShadowTorches), toggled by distance to the camera, so mark
    // eligibility here separately from the live castShadow flag.
    light.userData.shadowEligible = castShadow;
    if (castShadow) {
        light.shadow.bias           = -0.0015;
        light.shadow.normalBias     =  0.03;
        light.shadow.radius         =  3;
        // Point-light shadows render 6 cube faces each; with several of
        // these active at once this resolution matters a lot more than a
        // single directional shadow map would. 512 is plenty for a torch.
        light.shadow.mapSize.width  =  512;
        light.shadow.mapSize.height =  512;
        light.shadow.camera.near    =  0.5;
        light.shadow.camera.far     =  25;
    }
    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshBasicMaterial({ color })
    );
    marker.castShadow = false;
    marker.receiveShadow = false;
    light.add(marker);
    light.userData.marker = marker;   // hidden once the real wall-torch model attaches
    scene.add(light);
    return light;
}

// NEW TORCH LAYOUT (Replace the deleted lines with these)
const TORCH_LAYOUT = [
    { progress: 0.04, side: -1 },
    { progress: 0.13, side:  1 },
    { progress: 0.24, side: -1 },
];
const TORCH_WALL_DIST_DEFAULT = 2.2;
const TORCH_HEIGHT_DEFAULT = 1.1;

const torches = TORCH_LAYOUT.map(({ progress, side }) => {
    const { pos, facing } = wallTorchPlacement(progress, side, TORCH_WALL_DIST_DEFAULT, TORCH_HEIGHT_DEFAULT);
    return createTorch(pos, { castShadow: false, facing });
});

// Every point-light shadow (cube map) costs 6 full scene renders, so this
// stays in place as a safety net even though neither remaining torch is a
// shadow caster right now -- if a shadow-casting torch is ever added back,
// only the ones nearest the camera will actually cast at once instead of
// paying for all of them every frame.
const MAX_ACTIVE_SHADOW_TORCHES = 2;
const shadowEligibleTorches = torches.filter(t => t.userData.shadowEligible);

function updateActiveShadowTorches(camPos) {
    shadowEligibleTorches
        .map(t => ({ t, d: t.position.distanceToSquared(camPos) }))
        .sort((a, b) => a.d - b.d)
        .forEach(({ t }, i) => { t.castShadow = i < MAX_ACTIVE_SHADOW_TORCHES; });
}

// ---- Mount the torches on the actual cave wall (via raycast) ----
const _torchRay = new THREE.Raycaster();
_torchRay.far = 20;
let caveRoot = null;   // set once the cave OBJ has loaded

function mountTorchesOnWall() {
    if (!caveRoot) return;

    TORCH_LAYOUT.forEach(({ progress, side }, i) => {
        const torch = torches[i];
        const p = riverCurve.getPointAt(progress);
        const tangent = riverCurve.getTangentAt(progress).normalize();

        // direction from the river path outward toward the wall (XY plane)
        const outward = new THREE.Vector3(-tangent.y, tangent.x, 0)
            .multiplyScalar(side).normalize();

        // shoot a ray from the path, at torch height, straight at the wall
        const origin = new THREE.Vector3(p.x, p.y, TORCH_HEIGHT_DEFAULT);
        _torchRay.set(origin, outward);

        const hits = _torchRay.intersectObject(caveRoot, true);
        if (!hits.length) {
            console.warn(`Torch ${i}: no wall hit — left at default spot`);
            return;
        }

        // pull the torch slightly off the rock so the model doesn't sink in
        torch.position.copy(hits[0].point).addScaledVector(outward, -0.12);

        // rotate it so the mounting plate lies flat against the wall
        torch.rotation.set(0, 0, Math.atan2(-outward.x, outward.y));
    });

    updateFlameAnchors();   // re-pin the flames to the moved torches
}

// ---------------- WALL TORCH MODEL ----------------
// Replaces the plain glow-sphere marker with an actual wall-mounted torch
// (firewood + metal cage + mounting plate), decimated/retextured down from
// the original 4K/70MB source asset (see models/torch/wall_torch.glb).
const torchMounts = [];   // one Group per torch, so we can live-tune orientation from the GUI

// Applies the live GUI-tunable orientation/scale to every mounted torch
// model. Called once after load and again from the GUI's onChange so the
// up-axis correction can be dialed in interactively instead of guessed
// blind -- I can't render WebGL myself to verify it looks right.
function updateTorchModelTransform() {
    for (const mount of torchMounts) {
        mount.rotation.x = THREE.MathUtils.degToRad(params.torchModelRotX);
        mount.rotation.z = THREE.MathUtils.degToRad(params.torchModelRotZ);
        mount.scale.setScalar(params.torchModelScale);
    }
    updateFlameAnchors();   // firewood moved -> re-pin the flame to it
}

const torchGltfLoader = new GLTFLoader();
torchGltfLoader.load(
    './models/torch/wall_torch.glb',
    (gltf) => {
        const source = gltf.scene;
        source.updateMatrixWorld(true);

        // Find the firewood mesh (in the model's own untouched space) so
        // each clone can be re-centered on the torch's actual light
        // position instead of its wall-mount pivot -- the light was
        // authored assuming it sits where the flame is.
        const flameWorldPos = new THREE.Vector3();
        source.traverse((child) => {
            if (child.name === 'Fire Wood') child.getWorldPosition(flameWorldPos);
        });

        source.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = false;     // small prop -- not worth another shadow caster
            child.receiveShadow = true;
        });

        for (const torch of torches) {
            const mount = new THREE.Group();   // pivot = the torch's light position

            const clone = source.clone(true);
            clone.position.copy(flameWorldPos).multiplyScalar(-1);
            mount.add(clone);

            torch.add(mount);
            torchMounts.push(mount);

            // Remember the mesh the flame should sit on, so it stays pinned
            // no matter how the model is tilted/scaled live. The fire belongs
            // in the Metal Cage basket at the free end of the torch -- NOT the
            // Fire Wood mesh, which on this model sits back near the wall
            // mount. Fall back to Fire Wood only if the cage isn't found.
            let anchorMesh = null;
            clone.traverse((c) => { if (c.name === 'Metal Cage') anchorMesh = c; });
            if (!anchorMesh) clone.traverse((c) => { if (c.name === 'Fire Wood') anchorMesh = c; });
            torch.userData.woodMesh = anchorMesh;

            if (torch.userData.marker) torch.userData.marker.visible = false;
        }
        updateTorchModelTransform();   // also runs updateFlameAnchors()
        console.log(`Wall torch model attached to ${torchMounts.length} torches.`);
    },
    undefined,
    (err) => console.error('Error loading wall torch model:', err)
);

// ---------------- TORCH FLAME + FLICKER ----------------
// wall_torch.glb is an unlit prop -- it ships with only Fire Wood / Metal
// Cage / Metal Plate / Torch meshes and NO flame and NO animation. Rather
// than source a separate flame model (a static mesh flame reads as dead),
// the flame is a single vertical quad driven by a noise-based fire shader.
// Two deliberate choices keep it looking real:
//   * it billboards around the world Z axis ONLY (this scene is Z-up: the
//     water plane lies in world XY), yawing to face the camera but never
//     rolling/pitching, so it always stands straight up instead of spinning
//     with the camera the way a full sprite billboard does;
//   * its pivot is at the BOTTOM of the quad, so it grows up out of the
//     firewood instead of floating centred in front of it.
// The flicker modulates the light's brightness + the flame's height only --
// never the torch's position, so the physical prop never wobbles.
const _flameGeo = new THREE.PlaneGeometry(1, 1.1, 1, 1);
_flameGeo.translate(0, 0.55, 0);   // move pivot to the base -> flame rises upward
_flameGeo.rotateX(Math.PI / 2);    // stand the quad up along +Z -- world up in this Z-up scene

const _flameVert = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`;
const _flameFrag = `
    precision highp float;
    uniform float uTime;
    uniform float uSeed;
    uniform vec3  uCore;
    uniform vec3  uMid;
    uniform vec3  uEdge;
    varying vec2  vUv;

    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float noise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i),            hash(i + vec2(1.0, 0.0)), u.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.0; a *= 0.5; }
        return v;
    }
    void main(){
        vec2 uv = vUv;
        float x = uv.x - 0.5;
        float y = uv.y;
        // upward-scrolling turbulence makes the flame lick and dance
        float n = fbm(vec2(uv.x * 3.0 + uSeed, uv.y * 2.6 - uTime * 2.3 + uSeed));
        // teardrop body: wide at the base, pinched to a point at the top
        float d = abs(x) * mix(3.0, 1.6, y);
        float flame = 1.0 - d - y * 0.5 + (n - 0.5) * 0.8;
        flame = clamp(flame, 0.0, 1.0);
        flame *= smoothstep(0.0, 0.12, y);   // soft foot at the wood
        flame *= smoothstep(1.0, 0.55, y);   // fade the tip out
        if (flame < 0.02) discard;
        // warm orange body with a small hot core -> avoids the pale column look
        vec3 col = mix(uEdge, uMid,  smoothstep(0.05, 0.45, flame));
        col      = mix(col,   uCore, smoothstep(0.70, 0.98, flame));
        gl_FragColor = vec4(col * flame * 0.9, 1.0);   // additive: brightness = shape
    }`;

const _flameWorld = new THREE.Vector3();   // scratch for the yaw billboard math

function attachFlame(torch) {
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uSeed: { value: Math.random() * 10.0 },
            uCore: { value: new THREE.Color(0xffe6a0) },
            uMid:  { value: new THREE.Color(0xff8324) },
            uEdge: { value: new THREE.Color(0xcf300a) },
        },
        vertexShader:   _flameVert,
        fragmentShader: _flameFrag,
        transparent: true,
        depthWrite:  false,
        blending:    THREE.AdditiveBlending,
        side:        THREE.DoubleSide,
    });
    const mesh  = new THREE.Mesh(_flameGeo, mat);
    const group = new THREE.Group();   // holds offset/scale/yaw; parented to the light
    group.add(mesh);
    torch.add(group);
    torch.userData.flame = {
        group, mat,
        anchor: new THREE.Vector3(),   // firewood position in the torch's local space
        phase:  Math.random() * Math.PI * 2,
    };
}
for (const torch of torches) attachFlame(torch);

// Pin each flame to its torch's firewood mesh. The light itself has no
// rotation, so worldToLocal keeps the flame world-axis-aligned (upright)
// while still landing exactly on the wood regardless of model tilt/scale.
// Safe to call before the model loads -- torches without a woodMesh keep a
// zero anchor and fall back to the origin + GUI offsets.
const _flameBox = new THREE.Box3();
function updateFlameAnchors() {
    scene.updateMatrixWorld(true);
    const w = new THREE.Vector3();
    for (const torch of torches) {
        const wm = torch.userData.woodMesh;
        const fl = torch.userData.flame;
        if (!wm || !fl) continue;
        // Use the GEOMETRY's world centre, not the node origin: on this model
        // the cage/firewood pivots sit back by the plate while the actual
        // basket geometry extends out to the free end, so the node origin
        // lands the flame over the mount instead of in the basket.
        _flameBox.setFromObject(wm);
        _flameBox.getCenter(w);
        torch.worldToLocal(w);
        fl.anchor.copy(w);
    }
}

// Per-frame update: advance the fire shader, yaw the quad to face the camera
// (upright), and flicker brightness + height. No position is ever touched.
function updateFlames(t) {
    for (const torch of torches) {
        const fl = torch.userData.flame;
        if (!fl) continue;
        fl.group.visible = params.flameEnabled;
        if (!params.flameEnabled) { torch.intensity = params.torchIntensity; continue; }

        fl.mat.uniforms.uTime.value = t;

        // Yaw-only billboard: turn to face the camera around the world Z
        // (vertical) axis, but never tilt -- this is what stops the flame
        // "rotating with the camera".
        torch.getWorldPosition(_flameWorld);
        fl.group.rotation.set(
            0,
            0,
            Math.atan2(camera.position.x - _flameWorld.x, -(camera.position.y - _flameWorld.y)),
        );

        const ph      = fl.phase;
        const wobble  = 0.6 * Math.sin(t * 11.0 + ph) + 0.4 * Math.sin(t * 18.5 + ph * 1.7);
        const crackle = (Math.random() - 0.5);
        const flick   = 1 + params.flameFlicker * (wobble * 0.5 + crackle * 0.5);

        torch.intensity = params.torchIntensity * Math.max(0.25, flick);   // brightness only

        fl.group.position.set(
            fl.anchor.x + params.flameOffX,
            fl.anchor.y + params.flameOffY,
            fl.anchor.z + params.flameOffZ,
        );
        const s = params.flameScale;
        fl.group.scale.set(s, s, s * (1.0 + 0.14 * (flick - 1)));   // height breathes
    }
}

// --- REPLACE YOUR EXISTING CLIPPING PLANE LOGIC ---
const ENTRANCE_CUT_Y_DEFAULT = 4.0;
const entranceCut = new THREE.Plane(new THREE.Vector3(0, -1, 0), ENTRANCE_CUT_Y_DEFAULT);
const roofCutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), -1.5);

function upgradeToStandard(oldMat) {
    const newMat = new THREE.MeshStandardMaterial({
        color: oldMat.color ? oldMat.color.clone() : new THREE.Color(0x888888),
        map:          oldMat.map        || null,
        normalMap:    oldMat.normalMap  || oldMat.bumpMap || null,
        roughnessMap: oldMat.roughnessMap || null,
        roughness: 0.9, metalness: 0.05,
    });
    
    if (newMat.map)          newMat.map.colorSpace          = THREE.SRGBColorSpace;
    if (newMat.normalMap)    newMat.normalMap.colorSpace    = THREE.NoColorSpace;
    if (newMat.roughnessMap) newMat.roughnessMap.colorSpace = THREE.NoColorSpace;
    
    newMat.side = THREE.DoubleSide;
    newMat.shadowSide = THREE.FrontSide;
    
    // This is the new logic that slices the cave entrance
    newMat.clippingPlanes = [entranceCut]; 
    newMat.clipShadows = true;
    
    return newMat;
}

const capGeometry = new THREE.PlaneGeometry(2000, 2000);
const capMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b5f52, roughness: 0.95, metalness: 0.0,
    stencilWrite: true,
    stencilRef:   0,
    stencilFunc:  THREE.NotEqualStencilFunc,
    stencilFail:  THREE.KeepStencilOp,
    stencilZFail: THREE.KeepStencilOp,
    stencilZPass: THREE.ReplaceStencilOp,
    clippingPlanes: [roofCutPlane],
    clipShadows: true,
    side: THREE.DoubleSide,
});
const capMesh = new THREE.Mesh(capGeometry, capMaterial);
capMesh.renderOrder = 2;
capMesh.castShadow = false;
capMesh.receiveShadow = true;


function makeStencilPass(sourceMesh, side, depthPassOp, renderOrder) {
    const mat = new THREE.MeshBasicMaterial({
        side, colorWrite: false, depthWrite: false, depthTest: true,
        clippingPlanes: [roofCutPlane], clipShadows: true,
        stencilWrite: true, stencilRef: 1,
        stencilFunc:  THREE.AlwaysStencilFunc,
        stencilFail:  THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: depthPassOp,
    });
    const stencilMesh = new THREE.Mesh(sourceMesh.geometry, mat);
    stencilMesh.matrixAutoUpdate = false;
    stencilMesh.matrix.copy(sourceMesh.matrixWorld);
    stencilMesh.renderOrder = renderOrder;
    return stencilMesh;
}


// Generated from model.jpg's own luminance (height-from-grayscale + Sobel
// gradients), so it lines up with the cave's existing UVs with no re-unwrap
// needed. Gives the rock actual per-pixel surface detail under the torch
// lights instead of flat-shaded diffuse-only geometry.
const caveNormalMap = new THREE.TextureLoader().load('./models/cave_normal.png');
caveNormalMap.colorSpace = THREE.NoColorSpace;

const mtlLoader = new MTLLoader();
mtlLoader.load(
    './models/CaveOptimizedobj.mtl',
    (materials) => {
        materials.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.load(
            './models/CaveOptimizedobj.obj',
            (obj) => {
                obj.traverse((child) => {
                    if (!child.isMesh) return;
                    child.material = upgradeToStandard(child.material);
                    child.material.normalMap = caveNormalMap;
                    child.material.normalScale.set(1, 1);
                    child.material.needsUpdate = true;
                    child.castShadow = true;
                    child.receiveShadow = true;
                });
                obj.updateMatrixWorld(true);

                const stencilPassGroup = new THREE.Group();
                obj.traverse((child) => {
                    if (!child.isMesh) return;
                    const backPass  = makeStencilPass(child, THREE.BackSide,  THREE.IncrementWrapStencilOp, 0);
                    const frontPass = makeStencilPass(child, THREE.FrontSide, THREE.DecrementWrapStencilOp, 1);
                    stencilPassGroup.add(backPass, frontPass);
                });
                                scene.add(obj);
                scene.add(stencilPassGroup);
                caveRoot = obj;             // remember the cave for raycasting
                mountTorchesOnWall();       // snap the torches onto the wall
                console.log('Cave loaded. Stencil cap passes:', stencilPassGroup.children.length);
            },
            (xhr)   => console.log((xhr.loaded / xhr.total * 100).toFixed(1) + '% loaded OBJ'),
            (error) => console.error('Error loading OBJ:', error)
        );
    },
    (xhr)   => console.log((xhr.loaded / xhr.total * 100).toFixed(1) + '% loaded MTL'),
    (error) => console.error('Error loading MTL:', error)
);

const WATER_SIZE = 40;
const WATER_SEGMENTS = 200;

const WAVES = [
    { amp: 0.060, dir: new THREE.Vector2( 1.0,  0.6).normalize(), freq: 1.1, speed: 0.9 },
    { amp: 0.025, dir: new THREE.Vector2(-0.7,  1.0).normalize(), freq: 2.3, speed: 1.3 },
    { amp: 0.008, dir: new THREE.Vector2( 0.5, -0.9).normalize(), freq: 5.1, speed: 1.7 },
];

function waveHeight(x, y, t, ampScale = 1.0) {
    let h = 0.0;
    for (const w of WAVES) {
        const phase = (w.dir.x * x + w.dir.y * y) * w.freq + t * w.speed * w.freq;
        h += w.amp * ampScale * Math.sin(phase);
    }
    return h;
}

// --- INTERSECTION FOAM RENDER TARGET ---

const MAX_WATER_LIGHTS = 10;

// --- OAR RIPPLES ---
// Expanding decaying rings injected into the water surface where an oar blade
// strikes the water. Kept in sync with the matching #defines in the shader.
const MAX_RIPPLES   = 12;
const RIPPLE_LIFE   = 2.6;   // seconds a ripple stays alive (== R_LIFE in shader)
const RIPPLE_GAP    = 0.18;  // min seconds between ripples from the same oar

// Half-resolution is plenty for the water-refraction depth sample (it's
// blurred by the wave shader anyway) and cuts the fill cost of this extra
// full-scene pass by 4x.
const DEPTH_TARGET_SCALE = 0.5;
const depthTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(window.innerWidth * DEPTH_TARGET_SCALE)),
    Math.max(1, Math.floor(window.innerHeight * DEPTH_TARGET_SCALE))
);
depthTarget.depthTexture = new THREE.DepthTexture();
depthTarget.depthTexture.type = THREE.UnsignedShortType;

const waterUniforms = {
    tDepth:          { value: depthTarget.depthTexture },
    cameraNear:      { value: camera.near },
    cameraFar:       { value: camera.far },
    resolution:      { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
    uTime:           { value: 0 },
    uAmpScale:       { value: 1.0 },
    uExposure:       { value: 1.15 },   // keep in sync with renderer.toneMappingExposure
    uBaseColor:      { value: new THREE.Color(0x1f6f7a) }, // Bright cyan (Claude's)
    uDeepColor:      { value: new THREE.Color(0x041a1e) }, // Dark teal (Yours)
    uAmbient:        { value: new THREE.Color(0x05080a) }, // Extremely dark ambient shadow
    uOpacity:        { value: 0.62 },
    uAmp:            { value: WAVES.map(w => w.amp) },
    uDir:            { value: WAVES.map(w => w.dir.clone()) },
    uFreq:           { value: WAVES.map(w => w.freq) },
    uSpeed:          { value: WAVES.map(w => w.speed) },
    uLightCount:     { value: 0 },
    uLightPos:       { value: Array.from({ length: MAX_WATER_LIGHTS }, () => new THREE.Vector3()) },
    uLightColor:     { value: Array.from({ length: MAX_WATER_LIGHTS }, () => new THREE.Color()) },
    uLightIntensity: { value: new Array(MAX_WATER_LIGHTS).fill(0) },

    // Oar-strike ripples
    uRippleCount:    { value: 0 },
    uRippleOrigin:   { value: Array.from({ length: MAX_RIPPLES }, () => new THREE.Vector2()) },
    uRippleStart:    { value: new Array(MAX_RIPPLES).fill(-1000) },

    // Surface look / reflectivity
    uReflectivity:   { value: 0.9 },                       // strength of the fresnel sheen
    uSparkle:        { value: 1.0 },                       // fine micro-ripple normal strength
    uSpecStrength:   { value: 1.0 },                       // overall glint brightness
    uDetailSpeed:    { value: 0.35 },                      // how fast the fine ripples drift
    uSkyColor:       { value: new THREE.Color(0x1a3a44) }, // cool tint reflected at grazing angles

    // Boat wake / displacement
    uBoatPos:        { value: new THREE.Vector2() },       // boat world XY
    uBoatDir:        { value: new THREE.Vector2(0, 1) },   // boat forward (world XY, normalized)
    uBoatSpeed:      { value: 0.0 },                       // 0 when stopped -> no wake
};

const waterVertex = `
    #include <clipping_planes_pars_vertex>

    #define NUM ${WAVES.length}

    // --- Oar ripple constants (keep RIPPLE_LIFE in JS == R_LIFE) ---
    #define MAXR    ${MAX_RIPPLES}
    #define R_AMP   0.055   // peak height of a fresh ripple
    #define R_FREQ  15.0    // wavelength of the ring oscillation
    #define R_SPEED 1.6     // how fast the ring expands (world units / sec)
    #define R_OMEGA (R_FREQ * R_SPEED)
    #define R_DECAY 1.7     // temporal fade rate
    #define R_WIDTH 2.5     // tightness of the gaussian ring (larger = thinner)
    #define R_LIFE  2.6     // seconds before a ripple is fully gone

    uniform float uTime;
    uniform float uAmpScale;
    uniform float uAmp[NUM];
    uniform vec2  uDir[NUM];
    uniform float uFreq[NUM];
    uniform float uSpeed[NUM];

    uniform int   uRippleCount;
    uniform vec2  uRippleOrigin[MAXR];
    uniform float uRippleStart[MAXR];

    uniform vec2  uBoatPos;
    uniform vec2  uBoatDir;
    uniform float uBoatSpeed;

    varying vec3 vWorldPos;
    varying vec3 vNormal;

    // Displacement carved by the moving boat: the hull pushes the surface down,
    // the bow shoulders up a bulge, and a Kelvin-style V wake trails behind.
    // Scaled by uBoatSpeed so a stationary boat leaves the water still.
    float boatWake(vec2 p) {
        vec2  rel    = p - uBoatPos;
        float along  = dot(rel, uBoatDir);              // + ahead of bow, - astern
        vec2  side   = vec2(-uBoatDir.y, uBoatDir.x);
        float across = dot(rel, side);
        float d      = length(rel);

        // Hull trough + bow bulge.
        float hull = -exp(-d * d * 1.2) * 0.05;
        float bow  =  exp(-((along - 0.5) * (along - 0.5) + across * across) * 1.5) * 0.05;
        float h    = hull + bow;

        // Trailing wake astern of the boat.
        if (along < 0.2) {
            float behind = max(-along, 0.0);

            // Two diverging arms (Kelvin V, ~20 deg half-angle).
            float arm    = abs(across) - behind * 0.36;
            float armEnv = exp(-6.0 * arm * arm) * exp(-0.25 * behind);
            float crest  = sin(behind * 5.0 + abs(across) * 3.0 - uTime * 3.0);
            h += armEnv * crest * 0.04;

            // Transverse stern waves filling the wedge.
            float transEnv = exp(-0.3 * behind) * exp(-across * across * 0.25);
            float trans    = sin(behind * 4.0 - uTime * 3.0);
            h += transEnv * trans * 0.025;
        }

        return h * uBoatSpeed;
    }

    // Single decaying, outward-expanding ring. Returns the height contribution
    // and writes its planar gradient (for correct normals/lighting).
    float rippleHeight(vec2 p, vec2 origin, float age, out float dHdx, out float dHdy) {
        dHdx = 0.0;
        dHdy = 0.0;
        if (age < 0.0 || age > R_LIFE) return 0.0;

        vec2  delta = p - origin;
        float d     = length(delta);
        if (d < 1e-4) return 0.0;

        float r    = R_SPEED * age;                       // expanding front radius
        float env  = exp(-R_DECAY * age);                 // overall fade
        float band = d - r;
        float ring = exp(-R_WIDTH * band * band);         // gaussian shell at the front
        float ph   = R_FREQ * d - R_OMEGA * age;          // travelling oscillation
        float s    = sin(ph);
        float c    = cos(ph);

        float h    = R_AMP * env * ring * s;
        // d/dd ( ring * s ) = ring*(-2*W*band)*s + ring*c*R_FREQ
        float dHdd = R_AMP * env * (ring * (-2.0 * R_WIDTH * band) * s + ring * c * R_FREQ);
        vec2  dir  = delta / d;
        dHdx = dHdd * dir.x;
        dHdy = dHdd * dir.y;
        return h;
    }

    void main() {
        vec3 pos = position;
        float h    = 0.0;
        float dHdx = 0.0;
        float dHdy = 0.0;

        for (int i = 0; i < NUM; i++) {
            float a     = uAmp[i] * uAmpScale;
            float phase = (uDir[i].x * pos.x + uDir[i].y * pos.y) * uFreq[i]
                          + uTime * uSpeed[i] * uFreq[i];
            h    += a * sin(phase);
            float c = a * cos(phase) * uFreq[i];
            dHdx += c * uDir[i].x;
            dHdy += c * uDir[i].y;
        }

        // Oar-strike ripples
        for (int i = 0; i < MAXR; i++) {
            if (i >= uRippleCount) break;
            float rdx, rdy;
            h    += rippleHeight(pos.xy, uRippleOrigin[i], uTime - uRippleStart[i], rdx, rdy);
            dHdx += rdx;
            dHdy += rdy;
        }

        // Boat wake / displacement (gradient by finite difference for lighting).
        if (uBoatSpeed > 0.0001) {
            float e  = 0.06;
            float bC = boatWake(pos.xy);
            float bX = boatWake(pos.xy + vec2(e, 0.0));
            float bY = boatWake(pos.xy + vec2(0.0, e));
            h    += bC;
            dHdx += (bX - bC) / e;
            dHdy += (bY - bC) / e;
        }

        pos.z += h;

        vec3 localNormal = normalize(vec3(-dHdx, -dHdy, 1.0));
        vNormal = normalize(mat3(modelMatrix) * localNormal);

        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;

        // Required for clipping planes to work in WebGL
        vec4 mvPosition = viewMatrix * worldPos;
        #include <clipping_planes_vertex>

        gl_Position = projectionMatrix * mvPosition;
    }
`;

const waterFragment = `
    #include <clipping_planes_pars_fragment>
    #include <packing>

    #define MAXL ${MAX_WATER_LIGHTS}

    uniform vec3  uBaseColor;
    uniform vec3  uDeepColor; // <-- ADD THIS LINE
    uniform vec3  uAmbient;
    uniform float uOpacity;
    uniform float uExposure;
    uniform int   uLightCount;
    uniform vec3  uLightPos[MAXL];
    uniform vec3  uLightColor[MAXL];
    uniform float uLightIntensity[MAXL];

    uniform float uTime;
    uniform float uReflectivity;
    uniform float uSparkle;
    uniform float uSpecStrength;
    uniform float uDetailSpeed;
    uniform vec3  uSkyColor;

    // Foam uniforms
    uniform sampler2D tDepth;
    uniform float cameraNear;
    uniform float cameraFar;
    uniform vec2 resolution;

    varying vec3 vWorldPos;
    varying vec3 vNormal;

    vec3 acesFilmic(vec3 x) {
        const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 linearToSRGB(vec3 c) {
        return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
                   c * 12.92, step(c, vec3(0.0031308)));
    }

    // Planar gradient of one tiny travelling ripple (for per-pixel detail normals).
    vec2 rippleGrad(vec2 p, vec2 dir, float frq, float spd, float amp, float t) {
        float ph = dot(dir, p) * frq + t * spd * frq;
        return amp * cos(ph) * frq * dir;
    }

    // High-frequency surface detail in z-up tangent space. These never displace
    // geometry; they only tilt the normal so the surface shatters light into glints.
    vec3 detailNormal(vec2 p, float t) {
        vec2 g = vec2(0.0);
        g += rippleGrad(p, normalize(vec2( 0.80,  0.60)),  3.6, 1.0, 0.016, t);
        g += rippleGrad(p, normalize(vec2(-0.62,  0.78)),  5.8, 1.3, 0.011, t);
        g += rippleGrad(p, normalize(vec2( 0.20, -0.98)),  9.0, 1.6, 0.007, t);
        g += rippleGrad(p, normalize(vec2(-0.95, -0.30)), 13.0, 2.0, 0.004, t);
        return normalize(vec3(-g.x, -g.y, 1.0));
    }

    void main() {
        // 1. Apply the Diorama Cut
        #include <clipping_planes_fragment>

        vec3 N = normalize(vNormal);
        if (!gl_FrontFacing) N = -N; // Fixes lighting if you fly under the water!

        // Break up the smooth wave normal with fine moving ripples for sparkle.
        vec3 dN = detailNormal(vWorldPos.xy, uTime * uDetailSpeed);
        N = normalize(N + vec3(dN.x, dN.y, 0.0) * uSparkle);

        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 R = reflect(-V, N);                 // mirror direction for glints

        // --- NEW OMBRE MATH ---
        // Mix from Deep Teal to Bright Cyan based on the Y-coordinate.
        // -8.0 is deep inside the cave, 2.0 is near the entrance.
        vec3 ombreColor = mix(uDeepColor, uBaseColor, smoothstep(-8.0, 2.0, vWorldPos.y));
        
        vec3 color = ombreColor * uAmbient;

        // All the torch lights live INSIDE the cave, but this loop has no
        // occlusion -- without a mask it lights water OUTSIDE the mouth
        // straight through the rock walls. Fade their contribution to zero
        // across the entrance cut (y ~4) so no light bleeds past the cave.
        float caveMask = 1.0 - smoothstep(3.0, 4.2, vWorldPos.y);

        for (int i = 0; i < MAXL; i++) {
            if (i >= uLightCount) break;
            vec3  toL   = uLightPos[i] - vWorldPos;
            float dist  = length(toL);
            vec3  L     = toL / max(dist, 0.0001);
            float atten = uLightIntensity[i] / (1.0 + dist * dist) * caveMask;

            float diff = max(dot(N, L), 0.0);
            vec3  Hh   = normalize(L + V);
            float nh   = max(dot(N, Hh), 0.0);

            float specBroad = pow(nh, 48.0);                       // soft sheen
            float specTight = pow(nh, 220.0);                      // crisp highlight
            float glint     = pow(max(dot(R, L), 0.0), 600.0);     // mirror-sharp sun-glitter

            color += ombreColor * uLightColor[i] * diff * atten; // <-- Uses ombre here too
            color += uLightColor[i] * atten * (specBroad * 0.5 + specTight * 1.4) * uSpecStrength;
            color += uLightColor[i] * atten * glint * 3.0 * uSpecStrength;
        }

        // Schlick fresnel for water (F0 ~ 0.02): grazing angles turn mirror-like.
        float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        color += uSkyColor * fres * uReflectivity;               // reflective sheen

        // 2. Calculate the Intersection Foam
        vec2 screenPos = gl_FragCoord.xy / resolution;
        float sceneDepthRaw = texture2D(tDepth, screenPos).x;
        float sceneViewZ = perspectiveDepthToViewZ(sceneDepthRaw, cameraNear, cameraFar);
        float waterViewZ = perspectiveDepthToViewZ(gl_FragCoord.z, cameraNear, cameraFar);

        // How close is the water to the rocks?
        float depthDiff = abs(sceneViewZ - waterViewZ);

        // If it's within 0.3 units of the rock, paint it white!
        float foam = 1.0 - smoothstep(0.0, 0.3, depthDiff);


        color = acesFilmic(color * uExposure);
        color = linearToSRGB(color);

        // Grazing angles read a touch more solid/reflective, but never fully opaque
        // so the water keeps some translucency and feels fluid rather than dense.
        float alpha = mix(uOpacity, min(uOpacity + 0.22, 0.92), fres);
        gl_FragColor = vec4(color, clamp(alpha + foam * 0.5, 0.0, 1.0));
    }
`;

const waterGeometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGMENTS, WATER_SEGMENTS);
const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    transparent: true,
    toneMapped: false,   
    side: THREE.DoubleSide,
    clipping: false,                // Change this to false
    // Remove the clippingPlanes property entirely
});

const water = new THREE.Mesh(waterGeometry, waterMaterial);

water.position.set(0, 0, -1.0);
scene.add(water);

// --- OAR RIPPLE SYSTEM ---
// The water plane sits in world XY (only offset on Z), so a blade's world XY
// maps straight onto the shader's local plane coordinates.
const WATER_BASE_Z = water.position.z;        // -1.0
const ripples = [];                            // { x, y, start }

// Boat-speed tracking for the wake displacement.
const _boatPrevPos = new THREE.Vector3();
let   _boatPrevValid = false;

function spawnRipple(x, y, t) {
    ripples.push({ x, y, start: t });
    if (ripples.length > MAX_RIPPLES) ripples.shift();
}

// Push the live ripple list into the shader uniforms.
function uploadRipples(t) {
    const origins = waterUniforms.uRippleOrigin.value;
    const starts  = waterUniforms.uRippleStart.value;
    let n = 0;
    for (let i = 0; i < ripples.length && n < MAX_RIPPLES; i++) {
        const r = ripples[i];
        if (t - r.start > RIPPLE_LIFE) continue;   // expired
        origins[n].set(r.x, r.y);
        starts[n] = r.start;
        n++;
    }
    waterUniforms.uRippleCount.value = n;
    // Drop expired ripples so the array doesn't grow unbounded.
    for (let i = ripples.length - 1; i >= 0; i--) {
        if (t - ripples[i].start > RIPPLE_LIFE) ripples.splice(i, 1);
    }
}

// Blade-tip offset in each oar's local space, measured once from the mesh.
// The oar pivots near the rowlock and its handle end is short, so the geometry
// vertex farthest from the local origin is always the blade tip -- this works
// regardless of how each oar node's local frame is mirrored or rotated.
const _oarTipLocal = new WeakMap();
function oarTipLocal(oar) {
    let tip = _oarTipLocal.get(oar);
    if (tip) return tip;
    oar.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(oar.matrixWorld).invert();
    const v   = new THREE.Vector3();
    let best  = null;
    let bestD = -1;
    oar.traverse((c) => {
        if (!c.isMesh || !c.geometry || !c.geometry.attributes.position) return;
        const pos = c.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(c.matrixWorld).applyMatrix4(inv);
            const d = v.lengthSq();
            if (d > bestD) { bestD = d; best = v.clone(); }
        }
    });
    tip = best || new THREE.Vector3(1, 0, 0);
    _oarTipLocal.set(oar, tip);
    return tip;
}

// Per-oar submersion state, so we emit one ripple per entry into the water.
const oarDip = { L: { down: false, last: -1e3 }, R: { down: false, last: -1e3 } };
const _bladeTip = new THREE.Vector3();

function processOarRipple(oar, state, t, ampScale) {
    if (!oar) return;
    const tip = oarTipLocal(oar);
    oar.updateWorldMatrix(true, false);
    _bladeTip.copy(tip).applyMatrix4(oar.matrixWorld);

    const surfaceZ  = WATER_BASE_Z + waveHeight(_bladeTip.x, _bladeTip.y, t, ampScale);
    const submerged = _bladeTip.z < surfaceZ;

    if (submerged && !state.down && (t - state.last) > RIPPLE_GAP) {
        spawnRipple(_bladeTip.x, _bladeTip.y, t);
        state.last = t;
    }
    state.down = submerged;
}



const boatGroup = new THREE.Group();
scene.add(boatGroup);


const BOAT_LENGTH  = 1.1;           
const BOAT_HEADING = 0;              
const BOAT_FLOAT   = 0.12;          
const BOAT_HIDE_Y  = 9.5;   // rowed out past the mouth into the dark -> hide him until he returns
const WORLD_UP   = new THREE.Vector3(0, 0, 1);  
const OAR_L_SIGN = +1;
const OAR_R_SIGN = -1;              
const _oarQ      = new THREE.Quaternion();     
const _oarLiftQ  = new THREE.Quaternion();
const _oarAxis   = new THREE.Vector3();          
const _oarLiftAxis = new THREE.Vector3();        
const _oarParentQ  = new THREE.Quaternion();
const _oarParentInv = new THREE.Quaternion();
const _oarOutboard  = new THREE.Vector3();

const oars    = { L: null, R: null };
const oarRest = new WeakMap();       // oar node -> rest quaternion

const fbxLoader = new FBXLoader();
fbxLoader.load(
    './models/Old_Rowboat_low.fbx',
    (boat) => {
        boat.rotation.y = BOAT_HEADING;
        boat.updateMatrixWorld(true);

        let box = new THREE.Box3().setFromObject(boat);
        const size = box.getSize(new THREE.Vector3());
        const longest = Math.max(size.x, size.z) || 1;
        boat.scale.multiplyScalar(BOAT_LENGTH / longest);
        boat.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(boat);
        boat.position.sub(box.getCenter(new THREE.Vector3()));

        const junk = [];
        boat.traverse((child) => {
            if (child.isLight || child.isCamera) junk.push(child);
        });
        junk.forEach((n) => n.parent && n.parent.remove(n));
        if (junk.length) console.log('Rowboat: stripped baked',
            junk.map((n) => n.type).join(', '));

        boat.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
            const src = Array.isArray(child.material) ? child.material[0] : child.material;
            const tex = src && src.map ? src.map : null;
            if (tex) tex.colorSpace = THREE.SRGBColorSpace;
            child.material = new THREE.MeshStandardMaterial({
                color: tex ? 0xffffff : 0x6b4a2f,
                map: tex,
                roughness: 0.85, metalness: 0.05,
                // Same bug as the captain: roofCutPlane belongs to the cave
                // roof/floor cutaway (capMesh), not to objects that move
                // around in world Y -- it was clipping the boat/oars out of
                // existence past that fixed Y line.
            });
        });

        boatGroup.add(boat);

        // Grab the oar nodes (named Oar_L / Oar_R in the FBX) and store their rest pose.
        oars.L = findBone(boat, 'Oar_L');
        oars.R = findBone(boat, 'Oar_R');
        for (const o of [oars.L, oars.R]) if (o) oarRest.set(o, o.quaternion.clone());
        console.log('Rowboat loaded. Oars found:',
            [oars.L && 'L', oars.R && 'R'].filter(Boolean).join(', ') || 'none');
    },
    undefined,
    (err) => console.error('Error loading rowboat FBX:', err)
);


const CAPT_HEIGHT  = 0.62;        
const CAPT_HEADING = Math.PI;     
const CAPT_SEAT    = new THREE.Vector3(0, 0.05, 0.04);   
const CAPT_HAND_LIFT = 0.05;      

const CAPT_ARM_AXIS    = new THREE.Vector3(1, 0, 0);     
const CAPT_ARM_LOWER   = 0.85;  
const CAPT_ELBOW_BEND  = 1.15;   
const CAPT_THIGH_BEND  = 1.45;   
const CAPT_KNEE_BEND   = -1.5;   
const CAPT_LEG_SPREAD  = 0.5;    
const CAPT_SPREAD_AXIS = new THREE.Vector3(0, 0, 1);  
const _captQ = new THREE.Quaternion();                    

const captGroup = new THREE.Group();
boatGroup.add(captGroup);

const captBones = { armL: null, foreL: null, handL: null, armR: null, foreR: null, handR: null };
const captRest  = new WeakMap();  // bone -> rest quaternion
let captArmLen = 0, captForeLen = 0;   // world-space upper-arm and forearm lengths (set on load)


const _ikUp = new THREE.Vector3(0, 1, 0);
const _ikS = new THREE.Vector3(), _ikE = new THREE.Vector3(), _ikN = new THREE.Vector3();
const _ikPerp = new THREE.Vector3(), _ikDir = new THREE.Vector3(), _ikHandle = new THREE.Vector3();
const _ikLift = new THREE.Vector3(), _ikTgt = new THREE.Vector3(), _ikUpW = new THREE.Vector3();
const _ikW = new THREE.Quaternion(), _ikPW = new THREE.Quaternion();
const _ikBoatQ = new THREE.Quaternion();

// orient `bone` so its local +Y points along worldDir (roll uncontrolled)
function aimBoneWorld(bone, worldDir, parentWorldQuat) {
    _ikW.setFromUnitVectors(_ikUp, worldDir);
    bone.quaternion.copy(parentWorldQuat).invert().multiply(_ikW);
}

function solveArmIK(armBone, foreBone, target, L1, L2, refUp, elbowAngle) {
    armBone.updateWorldMatrix(true, false);
    armBone.getWorldPosition(_ikS);
    _ikDir.copy(target).sub(_ikS);
    let d = _ikDir.length();
    const maxReach = (L1 + L2) * params.armReach;
    d = THREE.MathUtils.clamp(d, Math.abs(L1 - L2) + 1e-3, maxReach);
    _ikN.copy(_ikDir).normalize();
    _ikTgt.copy(_ikS).addScaledVector(_ikN, d);   
    const cosA = THREE.MathUtils.clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const a = Math.acos(cosA);
    _ikPerp.copy(refUp).addScaledVector(_ikN, -refUp.dot(_ikN));
    if (_ikPerp.lengthSq() < 1e-6) _ikPerp.set(0, 0, 1).addScaledVector(_ikN, -_ikN.z);
    _ikPerp.normalize().applyAxisAngle(_ikN, elbowAngle);
    _ikE.copy(_ikS).addScaledVector(_ikN, Math.cos(a) * L1).addScaledVector(_ikPerp, Math.sin(a) * L1);
    armBone.parent.getWorldQuaternion(_ikPW);
    aimBoneWorld(armBone, _ikDir.copy(_ikE).sub(_ikS).normalize(), _ikPW);
    armBone.updateWorldMatrix(false, false);
    armBone.getWorldQuaternion(_ikPW);
    aimBoneWorld(foreBone, _ikDir.copy(_ikTgt).sub(_ikE).normalize(), _ikPW);
}

// world position of an oar's handle (inboard end), where the hand grips
function oarHandle(oarNode, handleSign, out) {
    out.set(handleSign * params.oarGrip, 0, 0);
    oarNode.updateWorldMatrix(true, false);
    return oarNode.localToWorld(out);
}

const _gripFwd    = new THREE.Vector3();
const _gripWorld  = new THREE.Quaternion();
const _gripRollQ  = new THREE.Quaternion();
const _gripParent = new THREE.Quaternion();
function gripHand(handBone, foreBone, rollRad) {
    if (!handBone || !foreBone) return;
    foreBone.updateWorldMatrix(true, false);
    foreBone.getWorldQuaternion(_gripWorld);
    _gripFwd.set(0, 1, 0).applyQuaternion(_gripWorld).normalize();   // forearm aim, world
    _gripWorld.setFromUnitVectors(_ikUp, _gripFwd);                  // hand +Y -> forearm dir
    _gripRollQ.setFromAxisAngle(_ikUp, rollRad);                     // roll about hand length
    _gripWorld.multiply(_gripRollQ);
    handBone.parent.getWorldQuaternion(_gripParent);
    handBone.quaternion.copy(_gripParent).invert().multiply(_gripWorld);
}

const captLoader = new GLTFLoader();   // own instance; the bat's gltfLoader is declared later
captLoader.load(
    './models/captain/captain-clark.gltf',
    (gltf) => {
        const model = gltf.scene;

        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        const h = box.getSize(new THREE.Vector3()).y || 1;
        model.scale.multiplyScalar(CAPT_HEIGHT / h);
        model.updateMatrixWorld(true);

        const sitThigh = (boneName, spreadSign) => {
            const b = findBone(model, boneName);
            if (!b) return;
            b.quaternion
                .multiply(_captQ.setFromAxisAngle(CAPT_ARM_AXIS,    CAPT_THIGH_BEND))
                .multiply(_captQ.setFromAxisAngle(CAPT_SPREAD_AXIS, CAPT_LEG_SPREAD * spreadSign));
        };
        const sitKnee = (boneName) => {
            const b = findBone(model, boneName);
            if (b) b.quaternion.multiply(_captQ.setFromAxisAngle(CAPT_ARM_AXIS, CAPT_KNEE_BEND));
        };
        sitThigh('mixamorig:LeftUpLeg',  -1);
        sitThigh('mixamorig:RightUpLeg', +1);
        sitKnee('mixamorig:LeftLeg');
        sitKnee('mixamorig:RightLeg');
        model.updateMatrixWorld(true);

        const hips = findBone(model, 'mixamorig:Hips');
        if (hips) model.position.sub(hips.getWorldPosition(new THREE.Vector3()));

        model.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            // NOTE: intentionally NOT applying roofCutPlane here. That plane
            // belongs to the cave roof/floor stencil cutaway (capMesh) --
            // it clips anything past a fixed world Y, which is fine for a
            // static cutaway plane but was also clipping the captain
            // himself out of existence once the boat crossed that Y line
            // (e.g. mid panic-retreat), making him vanish for part of the
            // ride.
        });

        captGroup.rotation.y = CAPT_HEADING;
        captGroup.position.copy(CAPT_SEAT);
        captGroup.add(model);

        captBones.armL  = findBone(model, 'mixamorig:LeftArm');
        captBones.foreL = findBone(model, 'mixamorig:LeftForeArm');
        captBones.handL = findBone(model, 'mixamorig:LeftHand');
        captBones.armR  = findBone(model, 'mixamorig:RightArm');
        captBones.foreR = findBone(model, 'mixamorig:RightForeArm');
        captBones.handR = findBone(model, 'mixamorig:RightHand');
        for (const b of Object.values(captBones)) if (b) captRest.set(b, b.quaternion.clone());

        // Measure world-space arm segment lengths (T-pose) for the IK solver.
        model.updateWorldMatrix(true, true);
        if (captBones.armL && captBones.foreL && captBones.handL) {
            const s = captBones.armL.getWorldPosition(new THREE.Vector3());
            const e = captBones.foreL.getWorldPosition(new THREE.Vector3());
            const w = captBones.handL.getWorldPosition(new THREE.Vector3());
            captArmLen  = s.distanceTo(e);
            captForeLen = e.distanceTo(w);
        }
        console.log('Captain loaded. armLen', captArmLen.toFixed(3), 'foreLen', captForeLen.toFixed(3));
    },
    undefined,
    (err) => console.error('Error loading captain glTF:', err)
);

let boatProgress = 0;

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    depthTarget.setSize(
        Math.max(1, Math.floor(window.innerWidth * DEPTH_TARGET_SCALE)),
        Math.max(1, Math.floor(window.innerHeight * DEPTH_TARGET_SCALE))
    );
});

const clock = new THREE.Clock();
const _capTarget = new THREE.Vector3();

// ---------------- FIREFLIES ----------------
// ---------------- FIREFLIES ----------------
const FIREFLY_COUNT = 45;
const fireflyPositions = new Float32Array(FIREFLY_COUNT * 3);
const fireflyPhase     = new Float32Array(FIREFLY_COUNT);
const fireflySeed      = new Float32Array(FIREFLY_COUNT * 3);

for (let i = 0; i < FIREFLY_COUNT; i++) {
    fireflyPositions[i * 3 + 0] = (Math.random() - 0.5) * 8;
    fireflyPositions[i * 3 + 1] = (Math.random() - 0.5) * 15;
    fireflyPositions[i * 3 + 2] = Math.random() * 2;
    fireflyPhase[i] = Math.random() * Math.PI * 2;
    fireflySeed[i * 3 + 0] = Math.random() * 100;
    fireflySeed[i * 3 + 1] = Math.random() * 100;
    fireflySeed[i * 3 + 2] = Math.random() * 100;
}

const fireflyGeometry = new THREE.BufferGeometry();
fireflyGeometry.setAttribute('position', new THREE.BufferAttribute(fireflyPositions, 3));
fireflyGeometry.setAttribute('aPhase', new THREE.BufferAttribute(fireflyPhase, 1));
fireflyGeometry.setAttribute('aSeed', new THREE.BufferAttribute(fireflySeed, 3));

const fireflyUniforms = {
    uTime:  { value: 0 },
    uColor: { value: new THREE.Color(0xb6ff6e) },
    uSize:  { value: 60.0 },
};

const fireflyVertex = `
    uniform float uTime;
    uniform float uSize;
    attribute float aPhase;
    attribute vec3  aSeed;
    varying float vGlow;
    float wander(float t, float seed) {
        return sin(t * 0.6 + seed) * 0.5 + sin(t * 1.3 + seed * 2.1) * 0.3;
    }
    void main() {
        vec3 p = position;
        p.x += wander(uTime, aSeed.x) * 0.6;
        p.y += wander(uTime, aSeed.y) * 0.6;
        p.z += wander(uTime * 0.8, aSeed.z) * 0.35;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        vGlow = 0.5 + 0.5 * sin(uTime * 2.2 + aPhase);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (1.0 / -mv.z) * (0.6 + 0.4 * vGlow);
    }`;

const fireflyFragment = `
    uniform vec3 uColor;
    varying float vGlow;
    void main() {
        vec2 uv = gl_PointCoord - 0.5;
        float d = length(uv);
        float core = smoothstep(0.5, 0.0, d);
        if (core < 0.02) discard;
        gl_FragColor = vec4(uColor * (0.6 + vGlow), core * core);
    }`;

const fireflyMaterial = new THREE.ShaderMaterial({
    uniforms: fireflyUniforms,
    vertexShader: fireflyVertex,
    fragmentShader: fireflyFragment,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
});

const fireflies = new THREE.Points(fireflyGeometry, fireflyMaterial);
fireflies.frustumCulled = false; 
scene.add(fireflies);

// ---------------- BAT SWARM ----------------
// Every bat is its own skinned-mesh clone (one draw call + one skeleton
// update each, per render pass), so the count is the single biggest perf
// lever. Fewer-but-bigger bats read as the same swarm for a fraction of
// the cost.
const BAT_COUNT    = 350;
const BAT_WINGSPAN = 0.32;
const FLAP_AXIS = new THREE.Vector3(1, 0, 0);     
const _flapQ = new THREE.Quaternion();           


// Z kept close to the water surface (WATER_BASE_Z ~= -1.0) rather than up
// near the cave ceiling -- much easier to actually see them, especially
// once they take flight.
const ROOST_MIN = new THREE.Vector3(-2.5, -11.0, -0.85);
const ROOST_MAX = new THREE.Vector3( 2.5,  -8.0,  0.35);
const ROOST_CENTER = new THREE.Vector3().addVectors(ROOST_MIN, ROOST_MAX).multiplyScalar(0.5);
const EXIT_Y       = 4.0;    // the entrance cut plane -- "past the mouth" threshold
const BAT_GONE_Y   = 16.0;   // fully outside the scene -- despawn fleeing bats here,
                             // NOT at the cut plane, so they visibly fly off instead
                             // of popping out of existence right at the opening
const FLEE_RADIUS  = 4.0;
const FLEE_SPEED   = 7.0;
const STEER_FORCE  = 3.0;
const RETURN_FORCE = 0.7;
const WANDER_FORCE = 0.7;
const MAX_SPEED    = 9.0;

// Colony "flying back in" after the scare: bats reappear out past the cave
// mouth and fly in to their (new) roost spot, instead of just popping back
// into place.
const RETURN_SPEED       = 6.0;    // cruise speed while flying back to the roost
const RETURN_ARRIVE_DIST = 0.4;    // close enough to home to call it "landed"

// ---------------- CAPTAIN "BAT SCARE" ENCOUNTER ----------------
// When the boat gets close enough to the roost, the whole colony erupts at
// once (instead of the organic per-bat FLEE_RADIUS trickle) and streams
// past the boat/captain. The captain freezes -- boat stops, oars stop --
// until every bat has cleared the scene, then rows hard forward along the
// same path he'd normally take out (the river loop already turns back
// toward the entrance on its own -- we just speed through it). Once he's
// out, the colony resettles after a delay, and he rows back in after a
// second delay.
const ENCOUNTER_TRIGGER_DIST = 2.6;   // distance to roost center that triggers the scare -- kept
                                       // tight so it only fires once the boat is nearly at the
                                       // apex of the path, right by the roost, not partway there
const ENCOUNTER_REARM_DIST   = 8.0;   // must retreat this far before it can trigger again
const FREEZE_TIMEOUT         = 8.0;   // safety valve so a stuck bat can't soft-lock the boat
const RETURN_TIMEOUT         = 10.0;  // safety valve so a stuck bat can't stall the return flight

// 'cruising'        -- normal loop, rowing at normal speed
// 'frozen'          -- boat + oars stopped, colony erupting
// 'panicking'       -- rowing hard along the path until back at the entrance
// 'batsAwayWait'    -- waiting outside; colony is about to fly back in
// 'batsReturning'   -- colony is flying in from outside the cave to the roost
// 'captainAwayWait' -- colony has landed; waiting before rowing back in
let boatEncounterState = 'cruising';
let encounterArmed     = true;
let frozenElapsed      = 0;
let waitElapsed        = 0;           // used by both *AwayWait states
let rowTimeSec         = 0;           // drives oar/arm animation only; paused while frozen/waiting


const _batAcc  = new THREE.Vector3();
const _batTmp  = new THREE.Vector3();
const _batTmp2 = new THREE.Vector3();

// LOD for the roost: a roosting (not fleeing) bat far from the camera is
// nearly invisible, so its flocking forces / integration / bone flap only
// need to run occasionally rather than every frame. Fleeing bats (which
// fly toward the observer) always run at full rate.
const LOD_DIST      = 12;
const LOD_DIST_SQ   = LOD_DIST * LOD_DIST;
const LOD_SKIP_FRAMES = 4;
let _batFrameCounter = 0;


function respawnRoost(bat) {
    bat.home.set(
        THREE.MathUtils.lerp(ROOST_MIN.x, ROOST_MAX.x, Math.random()),
        THREE.MathUtils.lerp(ROOST_MIN.y, ROOST_MAX.y, Math.random()),
        THREE.MathUtils.lerp(ROOST_MIN.z, ROOST_MAX.z, Math.random())
    );
    bat.root.position.copy(bat.home);
    bat.root.visible = true;   // a bat that had fled and gone invisible needs to reappear
    bat.vel.set((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.5);
    bat.spread = (Math.random() - 0.5) * 1.3;
    bat.state = 'roost';
    bat.fleeing = 0;
}


// Sends a resettled bat flying back in from just outside the cave mouth to
// a freshly-picked spot in the roost, instead of teleporting it there.
function startBatReturn(bat) {
    bat.home.set(
        THREE.MathUtils.lerp(ROOST_MIN.x, ROOST_MAX.x, Math.random()),
        THREE.MathUtils.lerp(ROOST_MIN.y, ROOST_MAX.y, Math.random()),
        THREE.MathUtils.lerp(ROOST_MIN.z, ROOST_MAX.z, Math.random())
    );
    bat.root.position.set(
        // spawn band aligned with the cave opening (x ~ -0.6..1.8) so they
        // fly IN through the mouth instead of clipping the walls beside it,
        // and fully outside the scene so they don't pop into view midair
        0.3 + (Math.random() - 0.5) * 1.6,
        BAT_GONE_Y - 2.0 + Math.random() * 3.0,
        THREE.MathUtils.lerp(0.2, 1.3, Math.random())
    );
    bat.root.visible = true;
    // Give it an initial shove back into the cave (-Y) so it doesn't start
    // the flight from a dead stop.
    bat.vel.set((Math.random() - 0.5) * 0.6, -RETURN_SPEED * 0.5, (Math.random() - 0.5) * 0.3);
    bat.spread = (Math.random() - 0.5) * 1.3;
    bat.state = 'return';
    bat.fleeing = 1;   // reuse the flee wingbeat (full flap) while actively flying in
}


function findBone(root, targetName) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const t = norm(targetName);
    let found = null;
    root.traverse((o) => { if (!found && norm(o.name) === t) found = o; });
    return found;
}

const bats = [];   // populated once the model loads

// All bat roots live under one group so the whole swarm can be hidden in a
// single toggle during the water-refraction depth pre-pass (bats are tiny
// and airborne -- they contribute nothing visible to the water's depth
// buffer, but skinning them twice per frame was half their render cost).
const batsGroup = new THREE.Group();
scene.add(batsGroup);

const gltfLoader = new GLTFLoader();
gltfLoader.load(
    './models/bat_lowpoly.glb',
    (gltf) => {
        const source = gltf.scene;

        source.rotation.y = -Math.PI / 2;

        source.updateMatrixWorld(true);
        let box = new THREE.Box3().setFromObject(source);
        const span = box.getSize(new THREE.Vector3()).x || 1;   // wingspan after yaw
        source.scale.setScalar(BAT_WINGSPAN / span);
        source.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(source);
        source.position.sub(box.getCenter(new THREE.Vector3()));

        source.traverse((child) => {
            if (!child.isMesh) return;
            // Bats are tiny and there are hundreds of them; letting each one
            // cast shadows into 7 point-light cubemaps was the single
            // biggest cost of the swarm. They still receive light/shadow
            // from the cave so they don't look flat.
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
                child.material.side = THREE.DoubleSide;   // thin wing membranes
                child.material.shadowSide = THREE.FrontSide;
            }
        });

        for (let i = 0; i < BAT_COUNT; i++) {
            const root  = new THREE.Group();
            const model = cloneSkeleton(source);    // deep clone incl. skeleton
            root.add(model);

            batsGroup.add(root);

            const bones = {
                armL:  findBone(model, 'arm1.L_Armature'),
                armR:  findBone(model, 'arm1.R_Armature'),
                wingL: findBone(model, 'wing1.L_Armature'),
                wingR: findBone(model, 'wing1.R_Armature'),
            };
            const rest = new Map();
            for (const b of Object.values(bones)) if (b) rest.set(b, b.quaternion.clone());

            const bat = {
                root, bones, rest,
                home:    new THREE.Vector3(),
                vel:     new THREE.Vector3(),
                phase:   Math.random() * Math.PI * 2,   // desync the flapping
                flapMul: 0.8 + Math.random() * 0.8,     // vary flap speed per bat
                spread:  0,
                state:   'roost',
                fleeing: 0,                             // 0..1, decays each frame
            };
            respawnRoost(bat);
            bats.push(bat);
        }
        console.log(`Bat colony loaded: ${bats.length} bats.`);
    },
    undefined,
    (err) => console.error('Error loading bat.glb:', err)
);

// drive one bat's wing bones from inner/outer flap angles
function flapBat(bat, innerAngle, outerAngle) {
    if (!bat.bones.armL) return;
    const apply = (bone, angle) => {
        const rest = bat.rest.get(bone);
        if (!rest) return;
        _flapQ.setFromAxisAngle(FLAP_AXIS, angle);
        bone.quaternion.copy(rest).multiply(_flapQ);
    };
    apply(bat.bones.armL,  innerAngle);
    apply(bat.bones.armR,  innerAngle);
    apply(bat.bones.wingL, outerAngle);
    apply(bat.bones.wingR, outerAngle);
}


function updateBats(timeSec, dt, boatPos) {
    _batFrameCounter++;
    for (let i = 0; i < bats.length; i++) {
        const bat = bats[i];
        if (bat.state === 'gone') continue;   // already left the scene, never returns

        const p = bat.root.position;

        // how close is the boat to this bat? Check this up front (cheap)
        // so a bat can still be startled into flight promptly even while
        // it's running on the reduced LOD update rate below.
        _batTmp.copy(p).sub(boatPos);
        const dBoat = _batTmp.length();
        if (bat.state === 'roost' && dBoat < FLEE_RADIUS) bat.state = 'flee';

        // LOD: a roosting bat far from the camera is barely visible, so
        // skip its forces/integration/bone-flap update most frames. The
        // per-bat index staggers which frame each one updates on, so the
        // cost is spread out instead of every bat updating on the same tick.
        if (bat.state === 'roost') {
            const dCamSq = p.distanceToSquared(camera.position);
            if (dCamSq > LOD_DIST_SQ && (_batFrameCounter + i) % LOD_SKIP_FRAMES !== 0) {
                continue;
            }
        }

        _batAcc.set(0, 0, 0);

        if (bat.state === 'roost') {
            // mill around the roost anchor
            _batTmp2.copy(bat.home).sub(p).multiplyScalar(RETURN_FORCE);
            _batAcc.add(_batTmp2);
            _batAcc.x += (Math.random() - 0.5) * WANDER_FORCE;
            _batAcc.y += (Math.random() - 0.5) * WANDER_FORCE;
            _batAcc.z += (Math.random() - 0.5) * WANDER_FORCE;

            // coherent gentle hover bob so an idle bat still breathes
            _batAcc.z += Math.sin(timeSec * 1.5 + bat.phase) * 0.6;
        }

        if (bat.state === 'flee') {
            bat.fleeing = 1;

            if (p.y < 3.5) {
                // Inside the cave: steer toward a per-bat slot in the CAVE
                // OPENING rather than a fixed +Y fan -- the old fan sent the
                // outer bats straight into the rock walls near the mouth.
                // The opening at bat height is roughly x -0.6..1.8, so slots
                // at 0.3 +/- spread*0.9 keep the whole stream inside it.
                // z 0.5 keeps them ABOVE the wave crests (water base -1 with
                // amplitude 1.0 -> crests reach z ~0) but under the arch.
                _batTmp2.set(0.3 + bat.spread * 0.9, EXIT_Y + 0.5, 0.5).sub(p);
                _batTmp2.normalize().multiplyScalar(FLEE_SPEED);
            } else {
                // Clear of the mouth: no more walls, fan outward and keep
                // flying away until fully outside the scene.
                _batTmp2.set(bat.spread, 1.0, 0.1).normalize().multiplyScalar(FLEE_SPEED);
            }
            _batTmp2.sub(bat.vel).multiplyScalar(STEER_FORCE);
            _batAcc.add(_batTmp2);

            // initial shove directly away from the boat for a snappier scatter
            if (dBoat < FLEE_RADIUS && dBoat > 1e-4) {
                _batTmp.multiplyScalar((FLEE_RADIUS - dBoat) / dBoat * 6.0);
                _batAcc.add(_batTmp);
            }

            // fully outside the scene -> gone for good, hide and stop
            if (p.y > BAT_GONE_Y) { bat.state = 'gone'; bat.root.visible = false; continue; }
        } else if (bat.state === 'return') {
            bat.fleeing = 1;

            // steer straight toward the freshly-picked roost spot
            _batTmp2.copy(bat.home).sub(p);
            const distHome = _batTmp2.length();
            if (distHome < RETURN_ARRIVE_DIST) {
                // arrived -- settle into a normal roosting bat
                bat.state = 'roost';
                bat.fleeing = 0;
                bat.vel.multiplyScalar(0.3);
            } else {
                _batTmp2.normalize().multiplyScalar(RETURN_SPEED);
                _batTmp2.sub(bat.vel).multiplyScalar(STEER_FORCE);
                _batAcc.add(_batTmp2);
            }
        } else {
            bat.fleeing *= 0.94;
        }

        // integrate velocity with damping + speed cap
        bat.vel.addScaledVector(_batAcc, dt);
        bat.vel.multiplyScalar(0.97);
        const sp = bat.vel.length();
        if (sp > MAX_SPEED) bat.vel.multiplyScalar(MAX_SPEED / sp);
        p.addScaledVector(bat.vel, dt);

        // confine roosting bats to the cave-end box; fleeing bats only stay above water
        if (bat.state === 'roost') {
            p.x = THREE.MathUtils.clamp(p.x, ROOST_MIN.x, ROOST_MAX.x);
            p.y = THREE.MathUtils.clamp(p.y, ROOST_MIN.y, ROOST_MAX.y);
            p.z = THREE.MathUtils.clamp(p.z, ROOST_MIN.z, ROOST_MAX.z);
        } else {
            // Flying bats stay low over the water rather than climbing
            // toward the ceiling. Fleeing bats never dip below the wave
            // crests (z ~0 with amplitude 1.0); returning bats may descend
            // further so they can land on the lower roost spots.
            p.z = THREE.MathUtils.clamp(p.z, bat.state === 'flee' ? 0.05 : -0.85, 1.3);
        }

        // face direction of travel
        if (bat.vel.lengthSq() > 1e-4) {
            _batTmp.copy(p).add(bat.vel);
            bat.root.lookAt(_batTmp);
        }

        // wing motion: full flap while actively flying (fleeing or
        // returning), slow shallow idle while roosting
        let inner, outer;
        if (bat.state === 'flee' || bat.state === 'return') {
            const fs = params.flapSpeed * bat.flapMul * (1 + bat.fleeing * 1.6);
            inner = Math.sin(timeSec * fs + bat.phase)       * 0.5;
            outer = Math.sin(timeSec * fs + bat.phase - 1.2) * 0.7;
        } else {
            // idle: slow, small wing settle (slight fold) so a perched bat reads as alive
            const idle = timeSec * 1.8 * bat.flapMul + bat.phase;
            inner = 0.10 + Math.sin(idle)        * 0.06;
            outer = 0.16 + Math.sin(idle - 0.5)  * 0.10;
        }
        flapBat(bat, inner, outer);
    }
}

const params = {
    boatSpeed: 0.05,
    oarSpeed: 2.5,
    oarAmplitude: 0.4,
    oarLift: 0.36,          // comparable to the sweep -> the stroke traces a circle, not a flat line
    oarGrip: 0.5,           // how far along the oar handle the captain's hands grip (IK target)
    armReach: 1,            // fraction of full arm length he reaches -> <1 keeps elbows bent
    elbowAngle: -138.6,     // degrees: rolls the elbows around the arm (front <-> down <-> back)
    gripRoll: 144.72,       // degrees: rolls both palms toward the oar handle (tune for the grip)
    seatHeight: 0.12,       // captain hip height in boat-local +Y (raise so he sits on, not through, the hull)
    flapSpeed: 15.0,
    torchIntensity: 20.0,
    panicBoatMult: 3.0,       // how much faster than boatSpeed the captain rows while fleeing
    panicOarMult: 2.0,        // how much faster the oars/arms animate while fleeing
    batsReturnDelay: 2.0,     // seconds after the captain exits before the colony reappears
    captainReturnDelay: 1.5,  // seconds after the colony reappears before the captain rows back in
    // Wall torch model orientation -- VERIFIED by headless render: the GLB
    // is authored Y-up (handle down -Y, fire cage up +Y, wall plate facing
    // +Z), so RotX 90 stands it upright in this Z-up scene: cage on top,
    // handle hanging down. Sliders remain for per-taste tweaks only.
    torchModelRotX: 90,
    torchModelRotZ: 0,
    torchModelScale: 1.0,
    // Procedural flame -- offsets place the fire on the firewood, scale sizes
    // it, flicker sets how hard the brightness/size dance (0 = steady glow).
    flameEnabled: true,
    flameScale: 0.4,
    flameOffX: -0.008,
    flameOffY: -0.106,
    flameOffZ: 0.14,
    flameFlicker: 0.4,
    waveAmplitude: 1.0,
    waterReflectivity: 0.9,   // fresnel sheen strength
    waterOpacity: 0.62,       // lower = clearer / more fluid, higher = denser
    waterSparkle: 0.8,        // fine ripple normal strength (glitter)
    waterGlint: 1.0,          // specular highlight brightness
    waterFlowSpeed: 0.35,     // how fast the fine surface shimmer drifts
    waterWakeStrength: 1.0    // size of the boat's wake / displacement
};

const gui = new GUI();
gui.add(params, 'boatSpeed', 0, 0.2).name('Boat Speed');
gui.add(params, 'oarSpeed', 0, 8).name('Oar Speed');
gui.add(params, 'oarAmplitude', 0, 1.2).name('Oar Swing');
gui.add(params, 'oarLift', 0, 0.6).name('Oar Lift');
gui.add(params, 'oarGrip', -0.2, 0.5).name('Hand Grip');
gui.add(params, 'armReach', 0.5, 1).name('Arm Reach');
gui.add(params, 'elbowAngle', -180, 180).name('Elbow Angle');
gui.add(params, 'gripRoll', -180, 180).name('Hand Roll');
gui.add(params, 'seatHeight', -0.1, 0.4).name('Seat Height');
gui.add(params, 'flapSpeed', 0, 30).name('Bat Flap Speed');
gui.add(params, 'torchIntensity', 0, 30).name('Torch Brightness');
gui.add(params, 'panicBoatMult', 1, 8).name('Panic Row Speed');
gui.add(params, 'panicOarMult', 1, 6).name('Panic Oar Speed');
gui.add(params, 'batsReturnDelay', 0, 15).name('Bats Return Delay (s)');
gui.add(params, 'captainReturnDelay', 0, 15).name('Captain Return Delay (s)');
gui.add(params, 'torchModelRotX', 0, 360).name('Torch Model Tilt').onChange(updateTorchModelTransform);
gui.add(params, 'torchModelRotZ', 0, 360).name('Torch Model Yaw').onChange(updateTorchModelTransform);
gui.add(params, 'torchModelScale', 0.2, 3).name('Torch Model Scale').onChange(updateTorchModelTransform);
gui.add(params, 'flameEnabled').name('Flame On');
gui.add(params, 'flameScale', 0.1, 2).name('Flame Size');
gui.add(params, 'flameOffX', -1, 1).name('Flame Offset X');
gui.add(params, 'flameOffY', -1, 1).name('Flame Offset Y');
gui.add(params, 'flameOffZ', -1, 1).name('Flame Offset Z');
gui.add(params, 'flameFlicker', 0, 1).name('Flame Flicker');
gui.add(params, 'waveAmplitude', 0, 3).name('Wave Amplitude');
gui.add(params, 'waterReflectivity', 0, 2).name('Water Reflectivity');
gui.add(params, 'waterOpacity', 0.2, 1).name('Water Density');
gui.add(params, 'waterSparkle', 0, 3).name('Water Sparkle');
gui.add(params, 'waterGlint', 0, 3).name('Water Glint');
gui.add(params, 'waterFlowSpeed', 0, 1.5).name('Water Flow Speed');
gui.add(params, 'waterWakeStrength', 0, 3).name('Boat Wake');

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(clock.getDelta(), 0.1);

    if (controls.isLocked) {

        inputDir.set(
            (keys['KeyD']   ? 1 : 0) - (keys['KeyA']   ? 1 : 0),
            (keys['Space']  ? 1 : 0) - (keys['ShiftLeft'] || keys['ShiftRight'] ? 1 : 0),
            (keys['KeyW']   ? 1 : 0) - (keys['KeyS']   ? 1 : 0),
        );
        if (inputDir.lengthSq() > 0) inputDir.normalize();

        const boost = (keys['ControlLeft'] || keys['ControlRight']) ? BOOST_MULT : 1;
        const speed = BASE_SPEED * boost * speedScale;
        targetVel.copy(inputDir).multiplyScalar(speed);

        const a = 1 - Math.exp(-SMOOTHING * dt);
        velocity.lerp(targetVel, a);

                controls.moveRight(velocity.x * dt);
        controls.moveForward(velocity.z * dt);
        camera.position.z += velocity.y * dt;   // Space/Shift = vertical, now that up is +Z
    } else {
        velocity.set(0, 0, 0);
    }


    updateHud(now);
    maybeLogPosition();

    // --- Cave bat scare state machine ---
    // 1. Trigger: boat wanders within range of the roost -> whole colony flees at once.
    if (boatEncounterState === 'cruising' && encounterArmed && bats.length > 0 &&
        boatGroup.position.distanceTo(ROOST_CENTER) < ENCOUNTER_TRIGGER_DIST) {
        boatEncounterState = 'frozen';
        encounterArmed = false;
        frozenElapsed = 0;
        for (const bat of bats) {
            if (bat.state === 'roost') { bat.state = 'flee'; bat.fleeing = 1; }
        }
    }

    // 2. While frozen: wait for every bat to clear the scene (or time out).
    if (boatEncounterState === 'frozen') {
        frozenElapsed += dt;
        const allClear = bats.length === 0 || bats.every(b => b.state === 'gone');
        if (allClear || frozenElapsed > FREEZE_TIMEOUT) {
            boatEncounterState = 'panicking';
        }
    }

    // 3. Re-arm once the boat is safely away from the roost again.
    if (!encounterArmed && boatGroup.position.distanceTo(ROOST_CENTER) > ENCOUNTER_REARM_DIST) {
        encounterArmed = true;
    }

    // 4. Once outside: wait, then the colony flies back in from outside the
    // cave, then (once landed) the captain rows back in after a second wait.
    if (boatEncounterState === 'batsAwayWait') {
        waitElapsed += dt;
        if (waitElapsed >= params.batsReturnDelay) {
            for (const bat of bats) startBatReturn(bat);
            boatEncounterState = 'batsReturning';
            waitElapsed = 0;
        }
    } else if (boatEncounterState === 'batsReturning') {
        waitElapsed += dt;
        const allHome = bats.every(b => b.state === 'roost');
        if (allHome || waitElapsed > RETURN_TIMEOUT) {
            // safety valve: snap any straggler bats straight home
            if (!allHome) {
                for (const bat of bats) if (bat.state !== 'roost') respawnRoost(bat);
            }
            boatEncounterState = 'captainAwayWait';
            waitElapsed = 0;
        }
    } else if (boatEncounterState === 'captainAwayWait') {
        waitElapsed += dt;
        if (waitElapsed >= params.captainReturnDelay) {
            boatEncounterState = 'cruising';
        }
    }

    // 5. Drive the boat position and the oar/arm animation clock from the current phase.
    // Back to the original single riverCurve for the whole journey -- the
    // panic retreat just keeps rowing FORWARD along it (same direction as
    // normal cruising, so the orientation/tangent stays correct) at a
    // faster rate, following the same "to the back, then out" loop the
    // path already traces, rather than a separate shortcut curve.
    let boatDir = 1;
    let oarRateMult = 1;
    if (boatEncounterState === 'frozen' ||
        boatEncounterState === 'batsAwayWait' ||
        boatEncounterState === 'batsReturning' ||
        boatEncounterState === 'captainAwayWait') {
        boatDir = 0;
        oarRateMult = 0;
        } else if (boatEncounterState === 'panicking') {
        boatDir = -params.panicBoatMult;   // negative = row straight BACK OUT the way he came in
        oarRateMult = params.panicOarMult;
    }
    rowTimeSec += dt * oarRateMult;

    if (boatDir !== 0) {
        boatProgress += dt * params.boatSpeed * BOAT_SPEED_SCALE * boatDir;
    }
    // Panic rows BACKWARD, so progress falls. Reaching 0 means he's fled all
    // the way back out the entrance, the way he came in.
    if (boatProgress <= 0.0) {
        boatProgress = 0.0;
        if (boatEncounterState === 'panicking') {
            boatEncounterState = 'batsAwayWait';
            waitElapsed = 0;
        }
    }
    // Normal end-of-loop wrap while cruising forward.
    if (boatProgress >= 1.0) {
        boatProgress = 0.0;
    }

        const currentPos = boatCurve.getPointAt(boatProgress);
    const currentTangent = boatCurve.getTangentAt(boatProgress).normalize();

    boatGroup.position.copy(currentPos);

    // Vanish once he's rowed out past the mouth into the dark; reappears
    // when he rows back in (and stays hidden through the bat-scare wait,
    // since he's parked out there at the far end of the path).
    boatGroup.visible = currentPos.y < BOAT_HIDE_Y;
    boatGroup.up.set(0, 0, 1);

        // Face the way he's actually travelling: forward while cruising, but
    // flip to face OUTWARD while panic-rowing back out of the cave.
    const faceSign = boatDir < 0 ? -1 : 1;
    const lookTarget = currentPos.clone().addScaledVector(currentTangent, faceSign);
    boatGroup.lookAt(lookTarget);
    const timeSec = now * 0.001;

    updateFlames(timeSec);   // torch fire flicker (brightness + flame size only)
    fireflyUniforms.uTime.value = timeSec;

   // --- REPLACE WITH THIS ---
    // --- UNDERWATER CAMERA SENSOR ---
    // Calculate the exact wave height at the camera's location
    const camWaveHeight = waveHeight(camera.position.x, camera.position.y, timeSec, params.waveAmplitude);
    const waterSurfaceZ = -1.0 + camWaveHeight; // -1.0 is the base height of your water

    // Ramp continuously over the first 0.5 units of submersion instead of a hard
    // cut, so the blur/tint and fog ease in together as the camera crosses the
    // surface rather than popping the instant z dips below waterSurfaceZ.
    const submersion = THREE.MathUtils.clamp((waterSurfaceZ - camera.position.z) / 0.05, 0, 1);
    setUnderwaterFactor(submersion);
    scene.fog.color.setHex(0x05060a).lerp(_underwaterFogColor, submersion);
    scene.fog.density = THREE.MathUtils.lerp(0.022, 0.3, submersion);
    // --------------------------------

    waterMaterial.uniforms.uTime.value         = timeSec;
    waterMaterial.uniforms.uAmpScale.value     = params.waveAmplitude;
    waterMaterial.uniforms.uReflectivity.value = params.waterReflectivity;
    waterMaterial.uniforms.uOpacity.value      = params.waterOpacity;
    waterMaterial.uniforms.uSparkle.value      = params.waterSparkle;
    waterMaterial.uniforms.uSpecStrength.value = params.waterGlint;
    waterMaterial.uniforms.uDetailSpeed.value  = params.waterFlowSpeed;

    // Boat wake: drive from the hull's actual world speed and heading.
    let boatWorldSpeed = 0;
    if (_boatPrevValid) boatWorldSpeed = currentPos.distanceTo(_boatPrevPos) / Math.max(dt, 1e-3);
    _boatPrevPos.copy(currentPos);
    _boatPrevValid = true;

    const wakeAmt = THREE.MathUtils.clamp(boatWorldSpeed * 0.8, 0, 1.5) * params.waterWakeStrength;
    waterMaterial.uniforms.uBoatPos.value.set(currentPos.x, currentPos.y);
    const _tl = Math.hypot(currentTangent.x, currentTangent.y) || 1;
       waterMaterial.uniforms.uBoatDir.value.set(
        (currentTangent.x / _tl) * faceSign,
        (currentTangent.y / _tl) * faceSign
    );
    waterMaterial.uniforms.uBoatSpeed.value = wakeAmt;

    const _lp = waterMaterial.uniforms.uLightPos.value;
    const _lc = waterMaterial.uniforms.uLightColor.value;
    const _li = waterMaterial.uniforms.uLightIntensity.value;
    const _ln = Math.min(torches.length, _lp.length);
    for (let i = 0; i < _ln; i++) {
        _lp[i].copy(torches[i].position);
        _lc[i].copy(torches[i].color);
        _li[i] = torches[i].intensity;
    }
    waterMaterial.uniforms.uLightCount.value = _ln;

    const amp = params.waveAmplitude;
    const sp  = 0.25;
    const hC     = waveHeight(currentPos.x,      currentPos.y,      timeSec, amp);
    const hBow   = waveHeight(currentPos.x,      currentPos.y - sp, timeSec, amp);
    const hStern = waveHeight(currentPos.x,      currentPos.y + sp, timeSec, amp);
    const hPort  = waveHeight(currentPos.x - sp, currentPos.y,      timeSec, amp);
    const hStar  = waveHeight(currentPos.x + sp, currentPos.y,      timeSec, amp);

    boatGroup.position.z = currentPos.z + hC + BOAT_FLOAT;

    const pitch = Math.atan2(hBow - hStern, 2.0 * sp);
    const roll  = Math.atan2(hPort - hStar, 2.0 * sp);
    boatGroup.rotateX(pitch);
    boatGroup.rotateZ(roll);

    // Uses rowTimeSec (not timeSec) so the rowing motion actually freezes
    // while the captain is spooked, and speeds up while he's panic-rowing.
    const oarPhase = rowTimeSec * params.oarSpeed;
    const sweep = Math.sin(oarPhase) * params.oarAmplitude;
    const lift  = Math.cos(oarPhase) * params.oarLift;

    const rowOar = (oar, sweepSign, bladeSignX) => {
        const rest = oarRest.get(oar);
        if (!rest) return;

        oar.parent.getWorldQuaternion(_oarParentQ);
        _oarParentInv.copy(_oarParentQ).invert();


        _oarAxis.copy(WORLD_UP).applyQuaternion(_oarParentInv).normalize();
        _oarQ.setFromAxisAngle(_oarAxis, sweep * sweepSign);

      
        _oarOutboard.set(bladeSignX, 0, 0)  
            .applyQuaternion(rest)           
            .applyQuaternion(_oarParentQ);   
        _oarOutboard.z = 0;
        if (_oarOutboard.lengthSq() > 1e-6) {
            _oarOutboard.normalize();
            _oarLiftAxis.set(_oarOutboard.y, -_oarOutboard.x, 0)
                .applyQuaternion(_oarParentInv).normalize();
            _oarLiftQ.setFromAxisAngle(_oarLiftAxis, lift);
        } else {
            _oarLiftQ.identity();
        }

        // world orientation = parent * (lift * sweep * rest)
        oar.quaternion.copy(rest).premultiply(_oarQ).premultiply(_oarLiftQ);
    };
    if (oars.L) rowOar(oars.L, OAR_L_SIGN, -1);   // left blade at local -X
    if (oars.R) rowOar(oars.R, OAR_R_SIGN, +1);   // right blade at local +X

    // Spawn a ripple whenever a blade tip dips below the water surface.
    processOarRipple(oars.L, oarDip.L, timeSec, params.waveAmplitude);
    processOarRipple(oars.R, oarDip.R, timeSec, params.waveAmplitude);
    uploadRipples(timeSec);

    captGroup.position.y = params.seatHeight;


    if (captArmLen > 0 && (oars.L || oars.R)) {
        boatGroup.getWorldQuaternion(_ikBoatQ);
        _ikUpW.set(0, 1, 0).applyQuaternion(_ikBoatQ);                 // boat-up: elbow reference + hand lift
        _ikLift.copy(_ikUpW).multiplyScalar(CAPT_HAND_LIFT);
        const ea = THREE.MathUtils.degToRad(params.elbowAngle);
        if (captBones.armL && captBones.foreL && oars.L) {
            solveArmIK(captBones.armL, captBones.foreL,
                oarHandle(oars.L, +1, _ikHandle).add(_ikLift), captArmLen, captForeLen, _ikUpW, ea);
            gripHand(captBones.handL, captBones.foreL, THREE.MathUtils.degToRad(params.gripRoll));
        }
        if (captBones.armR && captBones.foreR && oars.R) {
            solveArmIK(captBones.armR, captBones.foreR,
                oarHandle(oars.R, -1, _ikHandle).add(_ikLift), captArmLen, captForeLen, _ikUpW, -ea);
            gripHand(captBones.handR, captBones.foreR, THREE.MathUtils.degToRad(-params.gripRoll));
        }
    }

    // --- Bat swarm: wander, flee the boat, and flap ---
    if (bats.length) updateBats(timeSec, dt, boatGroup.position);

    // NOTE: the old per-frame torch position jitter + intensity flutter that
    // used to live here (a leftover from when torches were just floating
    // flame markers) is gone: the lights now carry the physical wall-torch
    // model as a child, so moving the light shook the whole prop. Brightness
    // flicker is handled by updateFlames(); positions never move.

    // Only the torches nearest the camera actually cast shadows this frame
    // (see updateActiveShadowTorches) -- keeps the point-light cubemap
    // shadow cost bounded no matter how many shadow-eligible torches exist.
    updateActiveShadowTorches(camera.position);

   // --- 1. HIDE WATER & CAP, RENDER DEPTH ---
    // Recompute shadow maps once for this frame (autoUpdate is off above);
    // the second render() below reuses them instead of redoing all 7
    // point-light cubemap passes a second time.
    renderer.shadowMap.needsUpdate = true;
    water.visible = false;
    batsGroup.visible = false;   // swarm skipped in the depth pre-pass (see batsGroup)
    renderer.setRenderTarget(depthTarget);
    renderer.render(scene, camera);

    // --- 2. SHOW WATER & CAP, RENDER TO SCREEN ---
    water.visible = true;
    batsGroup.visible = true;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    TWEEN.update();
    tickFps(now);

}

animate();