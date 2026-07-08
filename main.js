import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

// ==================== SCENE, CAMERA & RENDERER ====================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.022);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.05, 1000);
camera.up.set(0, 0, 1);
camera.position.set(0.95, 4.97, 1.82);
camera.lookAt(0.92, 5.91, 1.82);
const renderer = new THREE.WebGLRenderer({
    antialias: true,
    stencil: true,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;
document.body.appendChild(renderer.domElement);

// ==================== CAMERA CONTROLS (Z-UP FLY) ====================
class ZUpFlyControls extends THREE.EventDispatcher {
    constructor(camera, domElement) {
        super();
        this.camera = camera;
        this.domElement = domElement;
        this.isLocked = false;
        this.pointerSpeed = 1.0;
        this.minPitch = -Math.PI / 2 + 0.001;
        this.maxPitch = Math.PI / 2 - 0.001;
        this._yaw = 0;
        this._pitch = 0;
        this._qBase = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            Math.PI / 2,
        );
        this._qYaw = new THREE.Quaternion();
        this._qPitch = new THREE.Quaternion();
        this._Z = new THREE.Vector3(0, 0, 1);
        this._X = new THREE.Vector3(1, 0, 0);
        this._vec = new THREE.Vector3();
        this._syncFromCamera();
        this._onMove = this._onMove.bind(this);
        this._onChange = this._onChange.bind(this);
        document.addEventListener('mousemove', this._onMove);
        document.addEventListener('pointerlockchange', this._onChange);
    }
    _syncFromCamera() {
        const d = new THREE.Vector3();
        this.camera.getWorldDirection(d);
        this._pitch = Math.asin(THREE.MathUtils.clamp(d.z, -1, 1));
        this._yaw = Math.atan2(-d.x, d.y);
        this._apply();
    }
    _apply() {
        this._pitch = THREE.MathUtils.clamp(this._pitch, this.minPitch, this.maxPitch);
        this._qYaw.setFromAxisAngle(this._Z, this._yaw);
        this._qPitch.setFromAxisAngle(this._X, this._pitch);
        this.camera.quaternion.copy(this._qYaw).multiply(this._qBase).multiply(this._qPitch);
    }
    _onMove(e) {
        if (!this.isLocked) return;
        this._yaw -= e.movementX * 0.002 * this.pointerSpeed;
        this._pitch -= e.movementY * 0.002 * this.pointerSpeed;
        this._apply();
    }
    _onChange() {
        const locked = document.pointerLockElement === this.domElement;
        if (locked === this.isLocked) return;
        this.isLocked = locked;
        this.dispatchEvent({
            type: locked ? 'lock' : 'unlock',
        });
    }
    lock() {
        this.domElement.requestPointerLock();
    }
    unlock() {
        document.exitPointerLock();
    }
    moveForward(distance) {
        this._vec.setFromMatrixColumn(this.camera.matrix, 0);
        this._vec.crossVectors(this.camera.up, this._vec);
        this.camera.position.addScaledVector(this._vec, distance);
    }
    moveRight(distance) {
        this._vec.setFromMatrixColumn(this.camera.matrix, 0);
        this.camera.position.addScaledVector(this._vec, distance);
    }
}

// ==================== POINTER-LOCK CONTROLS & START OVERLAY ====================
const controls = new ZUpFlyControls(camera, renderer.domElement);
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
            <div><kbd>Esc</kbd> release pointer</div>
        </div>
    </div>
`;
document.body.appendChild(overlay);
overlay.addEventListener('click', () => controls.lock());
controls.addEventListener('lock', () => overlay.classList.add('hidden'));
controls.addEventListener('unlock', () => overlay.classList.remove('hidden'));

// ==================== KEYBOARD INPUT & MOVEMENT ====================
const keys = Object.create(null);
addEventListener('keydown', (e) => {
    keys[e.code] = true;
});
addEventListener('keyup', (e) => {
    keys[e.code] = false;
});
addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
});
const BASE_SPEED = 2.5;
const BOOST_MULT = 4.0;
const SMOOTHING = 12.0;
const velocity = new THREE.Vector3();
const inputDir = new THREE.Vector3();
const targetVel = new THREE.Vector3();
addEventListener(
    'wheel',
    (e) => {
        if (!controls.isLocked) return;
        const factor = Math.exp(-e.deltaY * 0.001);
        speedScale = THREE.MathUtils.clamp(speedScale * factor, 0.2, 8.0);
    },
    {
        passive: true,
    },
);
let speedScale = 1.0;

// ==================== HUD (FPS / POSITION READOUT) ====================
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
`;
document.head.appendChild(hudStyle);
const hud = document.createElement('div');
hud.id = 'flight-hud';
document.body.appendChild(hud);

// ==================== UNDERWATER SCREEN OVERLAY ====================
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
function setUnderwaterFactor(t) {
    const blurPx = t * 6;
    underwaterOverlay.style.backdropFilter = `blur(${blurPx.toFixed(2)}px) saturate(${(1 - 0.3 * t).toFixed(2)})`;
    underwaterOverlay.style.webkitBackdropFilter = underwaterOverlay.style.backdropFilter;
    underwaterOverlay.style.backgroundColor = `rgba(15, 70, 90, ${(t * 0.38).toFixed(3)})`;
}
const _underwaterFogColor = new THREE.Color(0x1f6f7a);
const _fwd = new THREE.Vector3();
const fmt = (n) => (n >= 0 ? ' ' : '') + n.toFixed(2);
let _frames = 0;
let _fpsT = performance.now();
let _fps = 0;
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

// ==================== LIGHTS ====================
const ambientLight = new THREE.AmbientLight(0x3a4658, 0.16);
scene.add(ambientLight);
const hemiLight = new THREE.HemisphereLight(0x55677f, 0x2a2018, 0.22);
hemiLight.position.set(0, 0, 5);
scene.add(hemiLight);
const skyShaft = new THREE.DirectionalLight(0x9fb6cc, 0.16);
skyShaft.position.set(2.5, 4.0, 3.0);
skyShaft.target.position.set(-0.5, -4.0, -0.5);
scene.add(skyShaft, skyShaft.target);

// ==================== MOON & MOONLIGHT ====================
const MOON_RADIUS = 11;
const MOON_TARGET = new THREE.Vector3(0, -1.0, -0.5);
// Shared with the water shader (same Vector3 instance backs uMoonPos),
// so moving the moon in the GUI moves the reflection automatically.
const MOON_WORLD = new THREE.Vector3();
const moonParams = {
    azimuth: 0,
    elevation: 20,
    distance: 115,
    glow: 1.0,
    light: 0.55,
    halo: 0.7,
    reflection: 0.6,
};
const moonMat = new THREE.MeshStandardMaterial({
    color: 0xbfc6d2,
    emissive: 0xaebed6,
    emissiveIntensity: moonParams.glow,
    roughness: 1.0,
    metalness: 0.0,
    fog: false,
});
new THREE.TextureLoader().load(
    './models/moon.png',
    (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        moonMat.map = t;
        moonMat.emissiveMap = t;
        moonMat.color.set(0xffffff);
        moonMat.needsUpdate = true;
    },
    undefined,
    () => {
        moonMat.color.set(0xbfc6d2);
    },
);
const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(MOON_RADIUS, 64, 48), moonMat);
moonMesh.rotation.set(Math.PI / 2, 0, 0.35);
function makeMoonHalo() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(128, 128, 8, 128, 128, 128);
    grad.addColorStop(0.0, 'rgba(206, 218, 240, 0.85)');
    grad.addColorStop(0.25, 'rgba(160, 182, 216, 0.32)');
    grad.addColorStop(1.0, 'rgba(120, 142, 182, 0.0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 256, 256);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}
const moonHaloMat = new THREE.SpriteMaterial({
    map: makeMoonHalo(),
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    opacity: moonParams.halo,
});
const moonHalo = new THREE.Sprite(moonHaloMat);
moonHalo.scale.setScalar(MOON_RADIUS * 6);
const moonGroup = new THREE.Group();
moonGroup.add(moonHalo);
moonGroup.add(moonMesh);
moonGroup.renderOrder = -1;
scene.add(moonGroup);
const moonLight = new THREE.DirectionalLight(0x9fb4d6, moonParams.light);
moonLight.target.position.copy(MOON_TARGET);
scene.add(moonLight, moonLight.target);
function placeMoon() {
    const az = THREE.MathUtils.degToRad(moonParams.azimuth);
    const el = THREE.MathUtils.degToRad(moonParams.elevation);
    const d = moonParams.distance;
    const ce = Math.cos(el);
    const x = MOON_TARGET.x + d * ce * Math.sin(az);
    const y = MOON_TARGET.y + d * ce * Math.cos(az);
    const z = MOON_TARGET.z + d * Math.sin(el);
    MOON_WORLD.set(x, y, z);
    moonGroup.position.copy(MOON_WORLD);
    moonLight.position.copy(MOON_WORLD);
}
placeMoon();

// The moon's reflection is rendered inside the water shader itself (see
// "Moon glade" in waterFragment): a real specular glade that converges on
// the point beneath the moon and shatters into animated glints on the waves.

// ==================== RIVER & BOAT PATHS ====================
const riverPoints = [
    new THREE.Vector3(-1.2, 3.0, -1.0),
    new THREE.Vector3(-0.6, 0.0, -1.0),
    new THREE.Vector3(-1.9, -3.5, -1.0),
    new THREE.Vector3(-0.6, -7.0, -1.0),
    new THREE.Vector3(-0.9, -10.0, -1.0),
    new THREE.Vector3(-0.7, -11.0, -1.0),
    new THREE.Vector3(-0.5, -10.0, -1.0),
    new THREE.Vector3(-0.5, -3.5, -1.0),
    new THREE.Vector3(-0.5, 3.0, -1.0),
];
const riverCurve = new THREE.CatmullRomCurve3(riverPoints, false);
const boatPoints = [
    new THREE.Vector3(0.4, 20.0, -1.0),
    new THREE.Vector3(0.4, 7.5, -1.0),
    new THREE.Vector3(-0.1, 3.9, -1.0),
    ...riverPoints,
    new THREE.Vector3(0.1, 4.0, -1.0),
    new THREE.Vector3(0.5, 7.5, -1.0),
    new THREE.Vector3(0.5, 20.0, -1.0),
];
const boatCurve = new THREE.CatmullRomCurve3(boatPoints, false);
const BOAT_SPEED_SCALE = riverCurve.getLength() / boatCurve.getLength();

// ==================== WALL TORCHES ====================
function wallTorchPlacement(progress, side, wallDist, z) {
    const p = riverCurve.getPointAt(progress);
    const tangent = riverCurve.getTangentAt(progress).normalize();
    const perp = new THREE.Vector2(-tangent.y, tangent.x).normalize();
    const outward = perp.multiplyScalar(side);
    const pos = new THREE.Vector3(p.x + outward.x * wallDist, p.y + outward.y * wallDist, z);
    const facing = outward.clone().multiplyScalar(-1);
    return {
        pos,
        facing,
    };
}
function createTorch(position, { intensity = 12, color = 0xe6a874, castShadow = false } = {}) {
    const light = new THREE.PointLight(color, intensity, 25, 2);
    light.position.copy(position);
    light.castShadow = castShadow;
    light.userData.shadowEligible = castShadow;
    if (castShadow) {
        light.shadow.bias = -0.0015;
        light.shadow.normalBias = 0.03;
        light.shadow.radius = 3;
        light.shadow.mapSize.width = 512;
        light.shadow.mapSize.height = 512;
        light.shadow.camera.near = 0.5;
        light.shadow.camera.far = 25;
    }
    const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.04, 8, 8),
        new THREE.MeshBasicMaterial({
            color,
        }),
    );
    marker.castShadow = false;
    marker.receiveShadow = false;
    light.add(marker);
    light.userData.marker = marker;
    scene.add(light);
    return light;
}
const TORCH_LAYOUT = [
    {
        progress: 0.04,
        side: -1,
    },
    {
        progress: 0.13,
        side: 1,
    },
    {
        progress: 0.24,
        side: -1,
    },
];
const TORCH_WALL_DIST_DEFAULT = 2.2;
const TORCH_HEIGHT_DEFAULT = 1.1;
const torches = TORCH_LAYOUT.map(({ progress, side }) => {
    const { pos, facing } = wallTorchPlacement(
        progress,
        side,
        TORCH_WALL_DIST_DEFAULT,
        TORCH_HEIGHT_DEFAULT,
    );
    return createTorch(pos, {
        castShadow: false,
        facing,
    });
});
const MAX_ACTIVE_SHADOW_TORCHES = 2;
const shadowEligibleTorches = torches.filter((t) => t.userData.shadowEligible);
function updateActiveShadowTorches(camPos) {
    shadowEligibleTorches
        .map((t) => ({
            t,
            d: t.position.distanceToSquared(camPos),
        }))
        .sort((a, b) => a.d - b.d)
        .forEach(({ t }, i) => {
            t.castShadow = i < MAX_ACTIVE_SHADOW_TORCHES;
        });
}
const _torchRay = new THREE.Raycaster();
_torchRay.far = 20;
let caveRoot = null;
function mountTorchesOnWall() {
    if (!caveRoot) return;
    TORCH_LAYOUT.forEach(({ progress, side }, i) => {
        const torch = torches[i];
        const p = riverCurve.getPointAt(progress);
        const tangent = riverCurve.getTangentAt(progress).normalize();
        const outward = new THREE.Vector3(-tangent.y, tangent.x, 0)
            .multiplyScalar(side)
            .normalize();
        const origin = new THREE.Vector3(p.x, p.y, TORCH_HEIGHT_DEFAULT);
        _torchRay.set(origin, outward);
        const hits = _torchRay.intersectObject(caveRoot, true);
        if (!hits.length) {
            console.warn(`Torch ${i}: no wall hit — left at default spot`);
            return;
        }
        torch.position.copy(hits[0].point).addScaledVector(outward, -0.12);
        torch.rotation.set(0, 0, Math.atan2(-outward.x, outward.y));
    });
    updateFlameAnchors();
}
const torchMounts = [];
function updateTorchModelTransform() {
    for (const mount of torchMounts) {
        mount.rotation.x = THREE.MathUtils.degToRad(params.torchModelRotX);
        mount.rotation.z = THREE.MathUtils.degToRad(params.torchModelRotZ);
        mount.scale.setScalar(params.torchModelScale);
    }
    updateFlameAnchors();
}
const torchGltfLoader = new GLTFLoader();
torchGltfLoader.load(
    './models/torch/wall_torch.glb',
    (gltf) => {
        const source = gltf.scene;
        source.updateMatrixWorld(true);
        const flameWorldPos = new THREE.Vector3();
        source.traverse((child) => {
            if (child.name === 'Fire Wood') child.getWorldPosition(flameWorldPos);
        });
        source.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = false;
            child.receiveShadow = true;
        });
        for (const torch of torches) {
            const mount = new THREE.Group();
            const clone = source.clone(true);
            clone.position.copy(flameWorldPos).multiplyScalar(-1);
            mount.add(clone);
            torch.add(mount);
            torchMounts.push(mount);
            let anchorMesh = null;
            clone.traverse((c) => {
                if (c.name === 'Metal Cage') anchorMesh = c;
            });
            if (!anchorMesh)
                clone.traverse((c) => {
                    if (c.name === 'Fire Wood') anchorMesh = c;
                });
            torch.userData.woodMesh = anchorMesh;
            if (torch.userData.marker) torch.userData.marker.visible = false;
        }
        updateTorchModelTransform();
    },
    undefined,
    (err) => console.error('Error loading wall torch model:', err),
);

// ==================== TORCH FLAMES (SHADER) ====================
const _flameGeo = new THREE.PlaneGeometry(1, 1.1, 1, 1);
_flameGeo.translate(0, 0.55, 0);
_flameGeo.rotateX(Math.PI / 2);
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
    uniform float uFlick;
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
    // 4 octaves x2 calls (domain warp) ~= the old 5-octave single call in
    // cost, but the warped turbulence reads as real licking tongues instead
    // of a scrolling texture.
    float fbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= 0.5; }
        return v;
    }
    void main(){
        float y = vUv.y;

        // the whole flame sways, more toward the free tip, none at the wood
        float sway = (noise(vec2(uSeed * 7.3, y * 1.4 - uTime * 1.6)) - 0.5)
                   * 0.38 * smoothstep(0.05, 0.9, y);
        float x = vUv.x - 0.5 - sway;

        // domain-warped upward-scrolling turbulence
        vec2  q = vec2(x * 3.2 + uSeed, y * 2.1 - uTime * 2.5);
        float w = fbm(q + vec2(0.0, -uTime * 0.7) + uSeed);
        float n = fbm(q + 1.7 * vec2(w, w * 0.6));

        // teardrop body: wide at the base, pinched hard at the tip so licks
        // detach into separate tongues instead of one blunt column
        float d = abs(x) * mix(2.4, 6.0, y * y);
        float flame = 1.0 - d - y * 0.55 + (n - 0.5) * 1.15;
        flame = clamp(flame, 0.0, 1.0);
        flame *= smoothstep(0.0, 0.10, y);    // soft foot at the wood
        flame *= smoothstep(1.05, 0.45, y);   // fade the tip out
        if (flame < 0.02) discard;

        // white-hot heart low in the flame, independent of the licky body,
        // so the base always reads hot even when a tongue breaks away above
        float core = clamp(1.0 - abs(x) * mix(5.0, 12.0, y) - y * 1.35 + (n - 0.5) * 0.35, 0.0, 1.0);

        vec3 col = mix(uEdge, uMid, smoothstep(0.04, 0.55, flame));
        col      = mix(col,  uCore, smoothstep(0.35, 0.85, core));
        col      = mix(col,  vec3(1.0, 0.98, 0.90), smoothstep(0.80, 1.0, core));

        // brightness breathes with the same flicker driving the point light
        gl_FragColor = vec4(col * flame * (0.72 + 0.28 * uFlick), 1.0);   // additive: brightness = shape
    }`;
const _flameWorld = new THREE.Vector3();
function attachFlame(torch) {
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: {
                value: 0,
            },
            uSeed: {
                value: Math.random() * 10.0,
            },
            uFlick: {
                value: 1.0,
            },
            uCore: {
                value: new THREE.Color(0xffe6a0),
            },
            uMid: {
                value: new THREE.Color(0xff8324),
            },
            uEdge: {
                value: new THREE.Color(0xcf300a),
            },
        },
        vertexShader: _flameVert,
        fragmentShader: _flameFrag,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(_flameGeo, mat);
    const group = new THREE.Group();
    group.add(mesh);
    torch.add(group);
    torch.userData.flame = {
        group,
        mat,
        anchor: new THREE.Vector3(),
        phase: Math.random() * Math.PI * 2,
        crackle: 0,
    };
}
for (const torch of torches) attachFlame(torch);
const _flameBox = new THREE.Box3();
function updateFlameAnchors() {
    scene.updateMatrixWorld(true);
    const w = new THREE.Vector3();
    for (const torch of torches) {
        const wm = torch.userData.woodMesh;
        const fl = torch.userData.flame;
        if (!wm || !fl) continue;
        _flameBox.setFromObject(wm);
        _flameBox.getCenter(w);
        torch.worldToLocal(w);
        fl.anchor.copy(w);
    }
}
function updateFlames(t) {
    for (const torch of torches) {
        const fl = torch.userData.flame;
        if (!fl) continue;
        fl.group.visible = params.flameEnabled;
        if (!params.flameEnabled) {
            torch.intensity = params.torchIntensity;
            continue;
        }
        fl.mat.uniforms.uTime.value = t;
        torch.getWorldPosition(_flameWorld);
        fl.group.rotation.set(
            0,
            0,
            Math.atan2(camera.position.x - _flameWorld.x, -(camera.position.y - _flameWorld.y)),
        );
        const ph = fl.phase;
        const wobble = 0.6 * Math.sin(t * 11.0 + ph) + 0.4 * Math.sin(t * 18.5 + ph * 1.7);
        fl.crackle += (Math.random() - 0.5 - fl.crackle) * 0.12;
        const flick = 1 + params.flameFlicker * (wobble * 0.5 + fl.crackle * 1.5);
        torch.intensity = params.torchIntensity * Math.max(0.25, flick);
        fl.mat.uniforms.uFlick.value = THREE.MathUtils.clamp(flick, 0.4, 1.6);
        fl.group.position.set(
            fl.anchor.x + params.flameOffX,
            fl.anchor.y + params.flameOffY,
            fl.anchor.z + params.flameOffZ,
        );
        const s = params.flameScale;
        fl.group.scale.set(s, s, s * (1.0 + 0.14 * (flick - 1)));
    }
}

// ==================== CAVE CLIPPING & STENCIL CAPS ====================
const ENTRANCE_CUT_Y_DEFAULT = 4.0;
const entranceCut = new THREE.Plane(new THREE.Vector3(0, -1, 0), ENTRANCE_CUT_Y_DEFAULT);
const roofCutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), -1.5);
function upgradeToStandard(oldMat) {
    const newMat = new THREE.MeshStandardMaterial({
        color: oldMat.color ? oldMat.color.clone() : new THREE.Color(0x888888),
        map: oldMat.map || null,
        normalMap: oldMat.normalMap || oldMat.bumpMap || null,
        roughnessMap: oldMat.roughnessMap || null,
        roughness: 0.9,
        metalness: 0.05,
    });
    if (newMat.map) newMat.map.colorSpace = THREE.SRGBColorSpace;
    if (newMat.normalMap) newMat.normalMap.colorSpace = THREE.NoColorSpace;
    if (newMat.roughnessMap) newMat.roughnessMap.colorSpace = THREE.NoColorSpace;
    newMat.side = THREE.DoubleSide;
    newMat.shadowSide = THREE.FrontSide;
    newMat.clippingPlanes = [entranceCut];
    newMat.clipShadows = true;
    return newMat;
}
const capGeometry = new THREE.PlaneGeometry(2000, 2000);
const capMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b5f52,
    roughness: 0.95,
    metalness: 0.0,
    stencilWrite: true,
    stencilRef: 0,
    stencilFunc: THREE.NotEqualStencilFunc,
    stencilFail: THREE.KeepStencilOp,
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
        side,
        colorWrite: false,
        depthWrite: false,
        depthTest: true,
        clippingPlanes: [roofCutPlane],
        clipShadows: true,
        stencilWrite: true,
        stencilRef: 1,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: THREE.KeepStencilOp,
        stencilZFail: THREE.KeepStencilOp,
        stencilZPass: depthPassOp,
    });
    const stencilMesh = new THREE.Mesh(sourceMesh.geometry, mat);
    stencilMesh.matrixAutoUpdate = false;
    stencilMesh.matrix.copy(sourceMesh.matrixWorld);
    stencilMesh.renderOrder = renderOrder;
    return stencilMesh;
}

// ==================== CAVE MODEL ====================
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
                    const backPass = makeStencilPass(
                        child,
                        THREE.BackSide,
                        THREE.IncrementWrapStencilOp,
                        0,
                    );
                    const frontPass = makeStencilPass(
                        child,
                        THREE.FrontSide,
                        THREE.DecrementWrapStencilOp,
                        1,
                    );
                    stencilPassGroup.add(backPass, frontPass);
                });
                scene.add(obj);
                scene.add(stencilPassGroup);
                caveRoot = obj;
                mountTorchesOnWall();
            },
            undefined,
            (error) => console.error('Error loading OBJ:', error),
        );
    },
    undefined,
    (error) => console.error('Error loading MTL:', error),
);

// ==================== WATER ====================
const WATER_SIZE = 40;
const WATER_SEGMENTS = 200;
const WAVES = [
    {
        amp: 0.06,
        dir: new THREE.Vector2(1.0, 0.6).normalize(),
        freq: 1.1,
        speed: 0.9,
    },
    {
        amp: 0.025,
        dir: new THREE.Vector2(-0.7, 1.0).normalize(),
        freq: 2.3,
        speed: 1.3,
    },
    {
        amp: 0.008,
        dir: new THREE.Vector2(0.5, -0.9).normalize(),
        freq: 5.1,
        speed: 1.7,
    },
];
function waveHeight(x, y, t, ampScale = 1.0) {
    let h = 0.0;
    for (const w of WAVES) {
        const phase = (w.dir.x * x + w.dir.y * y) * w.freq + t * w.speed * w.freq;
        h += w.amp * ampScale * Math.sin(phase);
    }
    return h;
}
const MAX_WATER_LIGHTS = 10;
const MAX_RIPPLES = 12;
const RIPPLE_LIFE = 2.6;
const RIPPLE_GAP = 0.18;
const DEPTH_TARGET_SCALE = 0.5;
const depthTarget = new THREE.WebGLRenderTarget(
    Math.max(1, Math.floor(window.innerWidth * DEPTH_TARGET_SCALE)),
    Math.max(1, Math.floor(window.innerHeight * DEPTH_TARGET_SCALE)),
);
depthTarget.depthTexture = new THREE.DepthTexture();
depthTarget.depthTexture.type = THREE.UnsignedShortType;
const waterUniforms = {
    tDepth: {
        value: depthTarget.depthTexture,
    },
    cameraNear: {
        value: camera.near,
    },
    cameraFar: {
        value: camera.far,
    },
    resolution: {
        value: new THREE.Vector2(window.innerWidth, window.innerHeight),
    },
    uTime: {
        value: 0,
    },
    uAmpScale: {
        value: 1.0,
    },
    uExposure: {
        value: 1.15,
    },
    uBaseColor: {
        value: new THREE.Color(0x1f6f7a),
    },
    uDeepColor: {
        value: new THREE.Color(0x041a1e),
    },
    uAmbient: {
        value: new THREE.Color(0x05080a),
    },
    uOpacity: {
        value: 0.62,
    },
    uAmp: {
        value: WAVES.map((w) => w.amp),
    },
    uDir: {
        value: WAVES.map((w) => w.dir.clone()),
    },
    uFreq: {
        value: WAVES.map((w) => w.freq),
    },
    uSpeed: {
        value: WAVES.map((w) => w.speed),
    },
    uLightCount: {
        value: 0,
    },
    uLightPos: {
        value: Array.from(
            {
                length: MAX_WATER_LIGHTS,
            },
            () => new THREE.Vector3(),
        ),
    },
    uLightColor: {
        value: Array.from(
            {
                length: MAX_WATER_LIGHTS,
            },
            () => new THREE.Color(),
        ),
    },
    uLightIntensity: {
        value: new Array(MAX_WATER_LIGHTS).fill(0),
    },
    uRippleCount: {
        value: 0,
    },
    uRippleOrigin: {
        value: Array.from(
            {
                length: MAX_RIPPLES,
            },
            () => new THREE.Vector2(),
        ),
    },
    uRippleStart: {
        value: new Array(MAX_RIPPLES).fill(-1000),
    },
    uReflectivity: {
        value: 0.9,
    },
    uSparkle: {
        value: 1.0,
    },
    uSpecStrength: {
        value: 1.0,
    },
    uDetailSpeed: {
        value: 0.35,
    },
    uSkyColor: {
        value: new THREE.Color(0x1a3a44),
    },
    uMoonPos: {
        value: MOON_WORLD, // same instance placeMoon() writes into
    },
    uMoonColor: {
        value: new THREE.Color(0xd8e6ff),
    },
    uMoonGlade: {
        value: moonParams.reflection,
    },
    uBoatPos: {
        value: new THREE.Vector2(),
    },
    uBoatDir: {
        value: new THREE.Vector2(0, 1),
    },
    uBoatSpeed: {
        value: 0.0,
    },
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
    uniform vec3  uMoonPos;
    uniform vec3  uMoonColor;
    uniform float uMoonGlade;

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

        // ---- Moon glade: true specular reflection of the moon ----
        // Because it uses the same wave + detail normals as everything else,
        // the glade stretches toward the viewer, wobbles with the swell and
        // shatters into twinkling glints instead of reading as a flat decal.
        float gladeAlpha = 0.0;
        // Keep it out of the cave interior (rock would occlude the sky).
        float moonMask = smoothstep(0.0, 3.0, vWorldPos.y);
        if (uMoonGlade > 0.001 && moonMask > 0.001) {
            vec3  Lm = normalize(uMoonPos - vWorldPos);
            float rl = max(dot(R, Lm), 0.0);

            float body    = pow(rl, 18.0);    // wide soft path of light
            float shimmer = pow(rl, 90.0);    // mid streaks riding the swell
            float sparkle = pow(rl, 750.0);   // pinpoint glitter

            // Cheap per-spot flicker so sparkles twinkle out of sync.
            float tw = 0.7 + 0.3 * sin(uTime * 4.0
                                       + vWorldPos.x * 37.0
                                       + vWorldPos.y * 23.0);

            // Water reflects more at grazing angles, so weight by fresnel.
            float mf = 0.2 + 0.8 * clamp(fres * 6.0, 0.0, 1.0);

            vec3 glade = uMoonColor
                       * (body * 0.25 + shimmer * 0.9 + sparkle * 5.0 * tw)
                       * mf * uMoonGlade * 2.0 * moonMask;
            color += glade;
            // Let the bright path read solid instead of see-through.
            gladeAlpha = clamp((body * 0.35 + shimmer * 0.5) * uMoonGlade * mf, 0.0, 0.4);
        }

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
        gl_FragColor = vec4(color, clamp(alpha + foam * 0.5 + gladeAlpha, 0.0, 1.0));
    }
`;
const waterGeometry = new THREE.PlaneGeometry(
    WATER_SIZE,
    WATER_SIZE,
    WATER_SEGMENTS,
    WATER_SEGMENTS,
);
const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    transparent: true,
    toneMapped: false,
    side: THREE.DoubleSide,
    clipping: false,
});
const water = new THREE.Mesh(waterGeometry, waterMaterial);
water.position.set(0, 0, -1.0);
scene.add(water);
const WATER_BASE_Z = water.position.z;
const ripples = [];
const _boatPrevPos = new THREE.Vector3();
let _boatPrevValid = false;
function spawnRipple(x, y, t) {
    ripples.push({
        x,
        y,
        start: t,
    });
    if (ripples.length > MAX_RIPPLES) ripples.shift();
}
function uploadRipples(t) {
    const origins = waterUniforms.uRippleOrigin.value;
    const starts = waterUniforms.uRippleStart.value;
    let n = 0;
    for (let i = 0; i < ripples.length && n < MAX_RIPPLES; i++) {
        const r = ripples[i];
        if (t - r.start > RIPPLE_LIFE) continue;
        origins[n].set(r.x, r.y);
        starts[n] = r.start;
        n++;
    }
    waterUniforms.uRippleCount.value = n;
    for (let i = ripples.length - 1; i >= 0; i--) {
        if (t - ripples[i].start > RIPPLE_LIFE) ripples.splice(i, 1);
    }
}

// ==================== OAR RIPPLES ====================
const _oarTipLocal = new WeakMap();
function oarTipLocal(oar) {
    let tip = _oarTipLocal.get(oar);
    if (tip) return tip;
    oar.updateWorldMatrix(true, true);
    const inv = new THREE.Matrix4().copy(oar.matrixWorld).invert();
    const v = new THREE.Vector3();
    let best = null;
    let bestD = -1;
    oar.traverse((c) => {
        if (!c.isMesh || !c.geometry || !c.geometry.attributes.position) return;
        const pos = c.geometry.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            v.fromBufferAttribute(pos, i).applyMatrix4(c.matrixWorld).applyMatrix4(inv);
            const d = v.lengthSq();
            if (d > bestD) {
                bestD = d;
                best = v.clone();
            }
        }
    });
    tip = best || new THREE.Vector3(1, 0, 0);
    _oarTipLocal.set(oar, tip);
    return tip;
}
const oarDip = {
    L: {
        down: false,
        last: -1e3,
    },
    R: {
        down: false,
        last: -1e3,
    },
};
const _bladeTip = new THREE.Vector3();
function processOarRipple(oar, state, t, ampScale) {
    if (!oar) return;
    const tip = oarTipLocal(oar);
    oar.updateWorldMatrix(true, false);
    _bladeTip.copy(tip).applyMatrix4(oar.matrixWorld);
    const surfaceZ = WATER_BASE_Z + waveHeight(_bladeTip.x, _bladeTip.y, t, ampScale);
    const submerged = _bladeTip.z < surfaceZ;
    if (submerged && !state.down && t - state.last > RIPPLE_GAP) {
        spawnRipple(_bladeTip.x, _bladeTip.y, t);
        state.last = t;
    }
    state.down = submerged;
}

// ==================== BOAT & OARS ====================
const boatGroup = new THREE.Group();
scene.add(boatGroup);
const BOAT_LENGTH = 1.1;
const BOAT_HEADING = 0;
const BOAT_FLOAT = 0.12;
const BOAT_HIDE_Y = 15.5;
const WORLD_UP = new THREE.Vector3(0, 0, 1);
const OAR_L_SIGN = +1;
const OAR_R_SIGN = -1;
const _oarQ = new THREE.Quaternion();
const _oarLiftQ = new THREE.Quaternion();
const _oarAxis = new THREE.Vector3();
const _oarLiftAxis = new THREE.Vector3();
const _oarParentQ = new THREE.Quaternion();
const _oarParentInv = new THREE.Quaternion();
const _oarOutboard = new THREE.Vector3();
const oars = {
    L: null,
    R: null,
};
const oarRest = new WeakMap();
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
        boat.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
            child.frustumCulled = false;
            const src = Array.isArray(child.material) ? child.material[0] : child.material;
            const tex = src && src.map ? src.map : null;
            if (tex) tex.colorSpace = THREE.SRGBColorSpace;
            child.material = new THREE.MeshStandardMaterial({
                color: tex ? 0xffffff : 0x6b4a2f,
                map: tex,
                roughness: 0.85,
                metalness: 0.05,
            });
        });
        boatGroup.add(boat);
        oars.L = findBone(boat, 'Oar_L');
        oars.R = findBone(boat, 'Oar_R');
        for (const o of [oars.L, oars.R]) if (o) oarRest.set(o, o.quaternion.clone());
    },
    undefined,
    (err) => console.error('Error loading rowboat FBX:', err),
);

// ==================== CAPTAIN (RIGGED ROWER) ====================
const CAPT_HEIGHT = 0.62;
const CAPT_HEADING = Math.PI;
const CAPT_SEAT = new THREE.Vector3(0, 0.05, 0.04);
const CAPT_HAND_LIFT = 0.05;
const CAPT_ARM_AXIS = new THREE.Vector3(1, 0, 0);
const CAPT_THIGH_BEND = 1.45;
const CAPT_KNEE_BEND = -1.5;
const CAPT_LEG_SPREAD = 0.5;
const CAPT_SPREAD_AXIS = new THREE.Vector3(0, 0, 1);
const _captQ = new THREE.Quaternion();
const captGroup = new THREE.Group();
boatGroup.add(captGroup);
const captBones = {
    armL: null,
    foreL: null,
    handL: null,
    armR: null,
    foreR: null,
    handR: null,
};
const captRest = new WeakMap();
let captArmLen = 0,
    captForeLen = 0;
const _ikUp = new THREE.Vector3(0, 1, 0);
const _ikS = new THREE.Vector3(),
    _ikE = new THREE.Vector3(),
    _ikN = new THREE.Vector3();
const _ikPerp = new THREE.Vector3(),
    _ikDir = new THREE.Vector3(),
    _ikHandle = new THREE.Vector3();
const _ikLift = new THREE.Vector3(),
    _ikTgt = new THREE.Vector3(),
    _ikUpW = new THREE.Vector3();
const _ikW = new THREE.Quaternion(),
    _ikPW = new THREE.Quaternion();
const _ikBoatQ = new THREE.Quaternion();
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
    _ikE.copy(_ikS)
        .addScaledVector(_ikN, Math.cos(a) * L1)
        .addScaledVector(_ikPerp, Math.sin(a) * L1);
    armBone.parent.getWorldQuaternion(_ikPW);
    aimBoneWorld(armBone, _ikDir.copy(_ikE).sub(_ikS).normalize(), _ikPW);
    armBone.updateWorldMatrix(false, false);
    armBone.getWorldQuaternion(_ikPW);
    aimBoneWorld(foreBone, _ikDir.copy(_ikTgt).sub(_ikE).normalize(), _ikPW);
}
function oarHandle(oarNode, handleSign, out) {
    out.set(handleSign * params.oarGrip, 0, 0);
    oarNode.updateWorldMatrix(true, false);
    return oarNode.localToWorld(out);
}
const _gripFwd = new THREE.Vector3();
const _gripWorld = new THREE.Quaternion();
const _gripRollQ = new THREE.Quaternion();
const _gripParent = new THREE.Quaternion();
function gripHand(handBone, foreBone, rollRad) {
    if (!handBone || !foreBone) return;
    foreBone.updateWorldMatrix(true, false);
    foreBone.getWorldQuaternion(_gripWorld);
    _gripFwd.set(0, 1, 0).applyQuaternion(_gripWorld).normalize();
    _gripWorld.setFromUnitVectors(_ikUp, _gripFwd);
    _gripRollQ.setFromAxisAngle(_ikUp, rollRad);
    _gripWorld.multiply(_gripRollQ);
    handBone.parent.getWorldQuaternion(_gripParent);
    handBone.quaternion.copy(_gripParent).invert().multiply(_gripWorld);
}
const captLoader = new GLTFLoader();
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
                .multiply(_captQ.setFromAxisAngle(CAPT_ARM_AXIS, CAPT_THIGH_BEND))
                .multiply(_captQ.setFromAxisAngle(CAPT_SPREAD_AXIS, CAPT_LEG_SPREAD * spreadSign));
        };
        const sitKnee = (boneName) => {
            const b = findBone(model, boneName);
            if (b) b.quaternion.multiply(_captQ.setFromAxisAngle(CAPT_ARM_AXIS, CAPT_KNEE_BEND));
        };
        sitThigh('mixamorig:LeftUpLeg', -1);
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
        });
        captGroup.rotation.y = CAPT_HEADING;
        captGroup.position.copy(CAPT_SEAT);
        captGroup.add(model);
        captBones.armL = findBone(model, 'mixamorig:LeftArm');
        captBones.foreL = findBone(model, 'mixamorig:LeftForeArm');
        captBones.handL = findBone(model, 'mixamorig:LeftHand');
        captBones.armR = findBone(model, 'mixamorig:RightArm');
        captBones.foreR = findBone(model, 'mixamorig:RightForeArm');
        captBones.handR = findBone(model, 'mixamorig:RightHand');
        for (const b of Object.values(captBones)) if (b) captRest.set(b, b.quaternion.clone());
        model.updateWorldMatrix(true, true);
        if (captBones.armL && captBones.foreL && captBones.handL) {
            const s = captBones.armL.getWorldPosition(new THREE.Vector3());
            const e = captBones.foreL.getWorldPosition(new THREE.Vector3());
            const w = captBones.handL.getWorldPosition(new THREE.Vector3());
            captArmLen = s.distanceTo(e);
            captForeLen = e.distanceTo(w);
        }
    },
    undefined,
    (err) => console.error('Error loading captain glTF:', err),
);
let boatProgress = 0;
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    depthTarget.setSize(
        Math.max(1, Math.floor(window.innerWidth * DEPTH_TARGET_SCALE)),
        Math.max(1, Math.floor(window.innerHeight * DEPTH_TARGET_SCALE)),
    );
});
const clock = new THREE.Clock();

// ==================== FIREFLIES ====================
const FIREFLY_COUNT = 45;
const fireflyPositions = new Float32Array(FIREFLY_COUNT * 3);
const fireflyPhase = new Float32Array(FIREFLY_COUNT);
const fireflySeed = new Float32Array(FIREFLY_COUNT * 3);
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
    uTime: {
        value: 0,
    },
    uColor: {
        value: new THREE.Color(0xb6ff6e),
    },
    uSize: {
        value: 60.0,
    },
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

// ==================== EDGE FOG ====================
const EDGE_FOG_COLOR = new THREE.Color(0x323c52);
const EDGE_FOG_LAYERS = [
    {
        y: 9.0,
        a: 0.3,
    },
    {
        y: 10.8,
        a: 0.45,
    },
    {
        y: 12.4,
        a: 0.6,
    },
    {
        y: 13.8,
        a: 0.7,
    },
    {
        y: 15.0,
        a: 0.85,
    },
    {
        y: 16.2,
        a: 0.95,
    },
];
const edgeFogVert = `
    varying vec3 vWorldPos;
    void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
    }`;
const edgeFogFrag = `
    uniform float uTime;
    uniform float uAlpha;
    uniform float uMul;
    uniform float uFacing; // view-angle cross-fade, set per frame in JS
        uniform float uMode;   // 0 = vertical wall sheet, 1 = horizontal ceiling (lid)
    uniform vec3  uColor;
    varying vec3  vWorldPos;

    float efHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    float efNoise(vec2 p){
        vec2 i = floor(p), f = fract(p);
        vec2 u = f * f * (3.0 - 2.0 * f);
        return mix(mix(efHash(i),                  efHash(i + vec2(1.0, 0.0)), u.x),
                   mix(efHash(i + vec2(0.0, 1.0)), efHash(i + vec2(1.0, 1.0)), u.x), u.y);
    }
    float efFbm(vec2 p){
        float v = 0.0, a = 0.5;
        for (int i = 0; i < 4; i++){ v += a * efNoise(p); p *= 2.13; a *= 0.5; }
        return v;
    }

    void main(){
        // World-space sample; the density field is anchored to the world, so
        // the sheets can swivel to face the camera without the pattern moving.
        // Second component is height, with a slow upward roll.
        // The y-term in BOTH components keeps the pattern 2D on every sheet
        // orientation (on horizontal sheets z is constant, so without it the
        // noise would collapse into 1D diagonal stripes).
        vec2 p = vec2(vWorldPos.x * 0.28 + vWorldPos.y * 1.7,
                      vWorldPos.z * 0.55 + vWorldPos.y * 0.31 - uTime * 0.018);
        vec2 d1 = vec2( uTime * 0.045, uTime * 0.012);
        vec2 d2 = vec2(-uTime * 0.030, uTime * 0.020);

        // Low-frequency warp field bends the fbm into curling, cauliflower
        // billows instead of flat streaks.
        float w  = efFbm(p * 1.35 + d1 * 2.0);
        vec2 wp2 = p + (w - 0.5) * 1.1;

        float n1 = efFbm(wp2 + d1);
        float n2 = efFbm(wp2 * 1.9 + d2 + 4.7);
        float billow  = n1 * 0.65 + n2 * 0.45;
        float density = smoothstep(0.20, 0.82, billow);
        density = mix(0.42, 1.0, density);   // it's a bank, not puffs -- never open a full hole

        // Cheap self-shading: sample the same field a little higher up
        // (reusing the warp). Denser-than-above reads as a moonlit billow
        // top, thinner as a shaded crevice -- gives the bank 3D relief.
        float nUp    = efFbm(wp2 + vec2(0.06, 0.44) + d1);
        float relief = clamp((n1 - nUp) * 2.8, -0.45, 0.9);

                // The bank now RINGS the whole diorama. Fade is driven by distance
        // from the scene centre (a radial "keep-out"): thin over the interior,
        // solid past the ring -- so whichever side a sheet is on, it stays
        // pinned to the edge of the world instead of creeping inward.
        const vec2  FOG_CENTER = vec2(0.0, -3.5);
        const float FOG_INNER  = 10.0;   // interior stays clear within this radius
        const float FOG_BAND   = 8.0;    // thickens to solid over this distance
        float radial = length(vWorldPos.xy - FOG_CENTER);
        float rpin   = smoothstep(FOG_INNER, FOG_INNER + FOG_BAND, radial);

        // Walls meet the water at the bottom and dissolve into carved cloud
        // tops; the lid (uMode = 1) is a horizontal ceiling high overhead.
                float top   = 6.5 + billow * 4.0;
        float vWall = smoothstep(-1.35, -0.45, vWorldPos.z)
                    * (1.0 - smoothstep(top - 2.2, top, vWorldPos.z));
        float vLid  = smoothstep(2.0, 4.5, vWorldPos.z);
        float vfade = mix(vWall, vLid, uMode);

        // Walls are pinned to the ring; the lid covers the whole footprint.
        float rfade = mix(rpin, 1.0, uMode);
        float fade  = vfade * rfade;

        float camFade = smoothstep(0.4, 2.6, distance(cameraPosition, vWorldPos));

        float alpha = uAlpha * uMul * uFacing * density * fade * camFade;
        if (alpha < 0.004) discard;
        // dense billows catch light on their tops, crevices fall into shadow
        gl_FragColor = vec4(uColor * (0.5 + density * 0.9 + relief * 0.85), alpha);
    }`;
<<<<<<< HEAD


const edgeFogGeo = new THREE.PlaneGeometry(44, 10);
edgeFogGeo.rotateX(Math.PI / 2);
const edgeFogCrossGeo = new THREE.PlaneGeometry(12, 10);
edgeFogCrossGeo.rotateX(Math.PI / 2);
edgeFogCrossGeo.rotateZ(Math.PI / 2);
const edgeFogFlatGeo = new THREE.PlaneGeometry(44, 12);
=======
// The fog now RINGS the whole diorama: four vertical walls (front / back /
// left / right) plus a horizontal ceiling. Every sheet is STATIC -- a
// per-sheet uFacing uniform cross-fades a sheet out as it turns edge-on, and
// the perpendicular walls of the box cover for it, so the bank keeps volume
// from every direction without any sheet ever rotating.
const FOG_MODE_WALL = 0;
const FOG_MODE_LID = 1;
// Wall spanning X (normal +Y) for the front/back walls...
const fogWallXGeo = new THREE.PlaneGeometry(52, 18);
fogWallXGeo.rotateX(Math.PI / 2);
// ...wall spanning Y (normal +X) for the left/right walls...
const fogWallYGeo = new THREE.PlaneGeometry(50, 18);
fogWallYGeo.rotateX(Math.PI / 2);
fogWallYGeo.rotateZ(Math.PI / 2);
// ...and a flat lid (normal +Z) for the ceiling.
const fogLidGeo = new THREE.PlaneGeometry(52, 50);
>>>>>>> abd981df12b264fe48079f61297f96ed68f060d8
const edgeFogGroup = new THREE.Group();
const edgeFogMats = [];
const _fogCamDir = new THREE.Vector3();
function addFogSheet(geo, x, y, z, a, nx, ny, nz, mode) {
    const mat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uAlpha: { value: a },
            uMul: { value: 1 },
            uFacing: { value: 1 },
            uMode: { value: mode },
            uColor: { value: EDGE_FOG_COLOR },
        },
        vertexShader: edgeFogVert,
        fragmentShader: edgeFogFrag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
    });
    const sheet = new THREE.Mesh(geo, mat);
    sheet.position.set(x, y, z);
    sheet.userData.nx = nx;
    sheet.userData.ny = ny;
    sheet.userData.nz = nz;
    edgeFogGroup.add(sheet);
    edgeFogMats.push(mat);
}
<<<<<<< HEAD
for (const { y, a } of EDGE_FOG_LAYERS) addFogSheet(edgeFogGeo, 0, y, 2.0, a, 0, 1, 0, 0);
for (const x of [-16, -8, 0, 8, 16]) addFogSheet(edgeFogCrossGeo, x, 13.0, 2.0, 0.6, 1, 0, 0, 1);
for (const z of [-0.4, 1.2, 2.8, 4.4]) addFogSheet(edgeFogFlatGeo, 0, 13.0, z, 0.55, 0, 0, 1, 1);
=======
// The diorama sits roughly within x=[-9,9], y=[-11,4]; the ring is centred at
// (0, -3.5) to match FOG_CENTER in the shader. Each wall is a few layered
// sheets stepping outward with rising alpha, so it reads as a deep bank
// receding into the dark rather than a flat decal.
const FOG_MID_Y = -3.5;
const FOG_LAYERS = [
    { d: 0.0, a: 0.35 },
    { d: 2.4, a: 0.6 },
    { d: 4.8, a: 0.85 },
];
for (const { d, a } of FOG_LAYERS) {
    // Front wall (+Y, into the cave mouth) and back wall (-Y).
    addFogSheet(fogWallXGeo, 0, 12.5 + d, 2.0, a, 0, 1, 0, FOG_MODE_WALL);
    addFogSheet(fogWallXGeo, 0, -19.5 - d, 2.0, a, 0, 1, 0, FOG_MODE_WALL);
    // Left wall (-X) and right wall (+X), spanning the box depth in Y.
    addFogSheet(fogWallYGeo, -16.5 - d, FOG_MID_Y, 2.0, a, 1, 0, 0, FOG_MODE_WALL);
    addFogSheet(fogWallYGeo, 16.5 + d, FOG_MID_Y, 2.0, a, 1, 0, 0, FOG_MODE_WALL);
}
// Ceiling: a stack of horizontal sheets high overhead so steep top-down views
// see a misty lid instead of straight through to the void.
for (const { z, a } of [{ z: 6.5, a: 0.4 }, { z: 8.0, a: 0.55 }, { z: 9.5, a: 0.6 }]) {
    addFogSheet(fogLidGeo, 0, FOG_MID_Y, z, a, 0, 0, 1, FOG_MODE_LID);
}
>>>>>>> abd981df12b264fe48079f61297f96ed68f060d8
scene.add(edgeFogGroup);

// ==================== BATS (COLONY) ====================
const BAT_COUNT = 350;
const BAT_WINGSPAN = 0.32;
const FLAP_AXIS = new THREE.Vector3(1, 0, 0);
const _flapQ = new THREE.Quaternion();
const ROOST_MIN = new THREE.Vector3(-2.5, -11.0, -0.85);
const ROOST_MAX = new THREE.Vector3(2.5, -8.0, 0.35);
const ROOST_CENTER = new THREE.Vector3().addVectors(ROOST_MIN, ROOST_MAX).multiplyScalar(0.5);
const EXIT_Y = 4.0;
const BAT_GONE_Y = 17.0;
const FLEE_RADIUS = 4.0;
const FLEE_SPEED = 7.0;
const STEER_FORCE = 3.0;
const RETURN_FORCE = 0.7;
const WANDER_FORCE = 0.7;
const MAX_SPEED = 9.0;
const RETURN_SPEED = 6.0;
const RETURN_ARRIVE_DIST = 0.4;
const ENCOUNTER_TRIGGER_DIST = 2.6;
const ENCOUNTER_REARM_DIST = 8.0;
const FREEZE_TIMEOUT = 4.0;
const RETURN_TIMEOUT = 10.0;
let boatEncounterState = 'cruising';
let encounterArmed = true;
let frozenElapsed = 0;
let waitElapsed = 0;
let rowTimeSec = 0;
const _batAcc = new THREE.Vector3();
const _batTmp = new THREE.Vector3();
const _batTmp2 = new THREE.Vector3();
const LOD_DIST = 12;
const LOD_DIST_SQ = LOD_DIST * LOD_DIST;
const LOD_SKIP_FRAMES = 4;
let _batFrameCounter = 0;
function respawnRoost(bat) {
    bat.home.set(
        THREE.MathUtils.lerp(ROOST_MIN.x, ROOST_MAX.x, Math.random()),
        THREE.MathUtils.lerp(ROOST_MIN.y, ROOST_MAX.y, Math.random()),
        THREE.MathUtils.lerp(ROOST_MIN.z, ROOST_MAX.z, Math.random()),
    );
    bat.root.position.copy(bat.home);
    bat.root.visible = true;
    bat.vel.set(
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.5,
    );
    bat.spread = (Math.random() - 0.5) * 1.3;
    bat.state = 'roost';
    bat.fleeing = 0;
}
function startBatReturn(bat) {
    bat.home.set(
        THREE.MathUtils.lerp(ROOST_MIN.x, ROOST_MAX.x, Math.random()),
        THREE.MathUtils.lerp(ROOST_MIN.y, ROOST_MAX.y, Math.random()),
        THREE.MathUtils.lerp(ROOST_MIN.z, ROOST_MAX.z, Math.random()),
    );
    bat.root.position.set(
        0.3 + (Math.random() - 0.5) * 1.6,
        BAT_GONE_Y + 0.5 + Math.random() * 2.0,
        THREE.MathUtils.lerp(0.2, 1.3, Math.random()),
    );
    bat.root.visible = true;
    bat.vel.set((Math.random() - 0.5) * 0.6, -RETURN_SPEED * 0.5, (Math.random() - 0.5) * 0.3);
    bat.spread = (Math.random() - 0.5) * 1.3;
    bat.state = 'return';
    bat.fleeing = 1;
}
function findBone(root, targetName) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const t = norm(targetName);
    let found = null;
    root.traverse((o) => {
        if (!found && norm(o.name) === t) found = o;
    });
    return found;
}
const bats = [];
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
        const span = box.getSize(new THREE.Vector3()).x || 1;
        source.scale.setScalar(BAT_WINGSPAN / span);
        source.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(source);
        source.position.sub(box.getCenter(new THREE.Vector3()));
        source.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = false;
            child.receiveShadow = true;
            if (child.material) {
                child.material.side = THREE.DoubleSide;
                child.material.shadowSide = THREE.FrontSide;
            }
        });
        for (let i = 0; i < BAT_COUNT; i++) {
            const root = new THREE.Group();
            const model = cloneSkeleton(source);
            root.add(model);
            batsGroup.add(root);
            const bones = {
                armL: findBone(model, 'arm1.L_Armature'),
                armR: findBone(model, 'arm1.R_Armature'),
                wingL: findBone(model, 'wing1.L_Armature'),
                wingR: findBone(model, 'wing1.R_Armature'),
            };
            const rest = new Map();
            for (const b of Object.values(bones)) if (b) rest.set(b, b.quaternion.clone());
            const bat = {
                root,
                bones,
                rest,
                home: new THREE.Vector3(),
                vel: new THREE.Vector3(),
                phase: Math.random() * Math.PI * 2,
                flapMul: 0.8 + Math.random() * 0.8,
                spread: 0,
                state: 'roost',
                fleeing: 0,
            };
            respawnRoost(bat);
            bats.push(bat);
        }
    },
    undefined,
    (err) => console.error('Error loading bat.glb:', err),
);
function flapBat(bat, innerAngle, outerAngle) {
    if (!bat.bones.armL) return;
    const apply = (bone, angle) => {
        const rest = bat.rest.get(bone);
        if (!rest) return;
        _flapQ.setFromAxisAngle(FLAP_AXIS, angle);
        bone.quaternion.copy(rest).multiply(_flapQ);
    };
    apply(bat.bones.armL, innerAngle);
    apply(bat.bones.armR, innerAngle);
    apply(bat.bones.wingL, outerAngle);
    apply(bat.bones.wingR, outerAngle);
}
function updateBats(timeSec, dt, boatPos) {
    _batFrameCounter++;
    for (let i = 0; i < bats.length; i++) {
        const bat = bats[i];
        if (bat.state === 'gone') continue;
        const p = bat.root.position;
        _batTmp.copy(p).sub(boatPos);
        const dBoat = _batTmp.length();
        if (bat.state === 'roost' && dBoat < FLEE_RADIUS) bat.state = 'flee';
        if (bat.state === 'roost') {
            const dCamSq = p.distanceToSquared(camera.position);
            if (dCamSq > LOD_DIST_SQ && (_batFrameCounter + i) % LOD_SKIP_FRAMES !== 0) {
                continue;
            }
        }
        _batAcc.set(0, 0, 0);
        if (bat.state === 'roost') {
            _batTmp2.copy(bat.home).sub(p).multiplyScalar(RETURN_FORCE);
            _batAcc.add(_batTmp2);
            _batAcc.x += (Math.random() - 0.5) * WANDER_FORCE;
            _batAcc.y += (Math.random() - 0.5) * WANDER_FORCE;
            _batAcc.z += (Math.random() - 0.5) * WANDER_FORCE;
            _batAcc.z += Math.sin(timeSec * 1.5 + bat.phase) * 0.6;
        }
        if (bat.state === 'flee') {
            bat.fleeing = 1;
            if (p.y < 3.5) {
                _batTmp2.set(0.3 + bat.spread * 0.9, EXIT_Y + 0.5, 0.5).sub(p);
                _batTmp2.normalize().multiplyScalar(FLEE_SPEED);
            } else {
                _batTmp2.set(bat.spread, 1.0, 0.1).normalize().multiplyScalar(FLEE_SPEED);
            }
            _batTmp2.sub(bat.vel).multiplyScalar(STEER_FORCE);
            _batAcc.add(_batTmp2);
            if (dBoat < FLEE_RADIUS && dBoat > 1e-4) {
                _batTmp.multiplyScalar(((FLEE_RADIUS - dBoat) / dBoat) * 6.0);
                _batAcc.add(_batTmp);
            }
            if (p.y > BAT_GONE_Y) {
                bat.state = 'gone';
                bat.root.visible = false;
                continue;
            }
        } else if (bat.state === 'return') {
            bat.fleeing = 1;
            _batTmp2.copy(bat.home).sub(p);
            const distHome = _batTmp2.length();
            if (distHome < RETURN_ARRIVE_DIST) {
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
        bat.vel.addScaledVector(_batAcc, dt);
        bat.vel.multiplyScalar(0.97);
        const sp = bat.vel.length();
        if (sp > MAX_SPEED) bat.vel.multiplyScalar(MAX_SPEED / sp);
        p.addScaledVector(bat.vel, dt);
        if (bat.state === 'roost') {
            p.x = THREE.MathUtils.clamp(p.x, ROOST_MIN.x, ROOST_MAX.x);
            p.y = THREE.MathUtils.clamp(p.y, ROOST_MIN.y, ROOST_MAX.y);
            p.z = THREE.MathUtils.clamp(p.z, ROOST_MIN.z, ROOST_MAX.z);
        } else {
            p.z = THREE.MathUtils.clamp(p.z, bat.state === 'flee' ? 0.05 : -0.85, 1.3);
        }
        if (bat.vel.lengthSq() > 1e-4) {
            _batTmp.copy(p).add(bat.vel);
            bat.root.lookAt(_batTmp);
        }
        let inner, outer;
        if (bat.state === 'flee' || bat.state === 'return') {
            const fs = params.flapSpeed * bat.flapMul * (1 + bat.fleeing * 1.6);
            inner = Math.sin(timeSec * fs + bat.phase) * 0.5;
            outer = Math.sin(timeSec * fs + bat.phase - 1.2) * 0.7;
        } else {
            const idle = timeSec * 1.8 * bat.flapMul + bat.phase;
            inner = 0.1 + Math.sin(idle) * 0.06;
            outer = 0.16 + Math.sin(idle - 0.5) * 0.1;
        }
        flapBat(bat, inner, outer);
    }
}

// ==================== GUI CONTROLS ====================
const params = {
    boatSpeed: 0.035,
    oarSpeed: 2.5,
    oarAmplitude: 0.4,
    oarLift: 0.36,
    oarGrip: 0.5,
    armReach: 1,
    elbowAngle: -138.6,
    gripRoll: 144.72,
    seatHeight: 0.12,
    flapSpeed: 15.0,
    torchIntensity: 20.0,
    panicBoatMult: 4.3,
    panicOarMult: 2.0,
    batsReturnDelay: 2.0,
    captainReturnDelay: 1.5,
    torchModelRotX: 90,
    torchModelRotZ: 0,
    torchModelScale: 1.0,
    flameEnabled: true,
    flameScale: 0.4,
    flameOffX: -0.008,
    flameOffY: -0.106,
    flameOffZ: 0.14,
    flameFlicker: 0.4,
    waveAmplitude: 1.0,
    waterReflectivity: 0.9,
    waterOpacity: 0.62,
    waterSparkle: 0.8,
    waterGlint: 1.0,
    waterFlowSpeed: 0.35,
    waterWakeStrength: 1.0,
    edgeFogDensity: 1.0,
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
gui.add(params, 'torchModelRotX', 0, 360)
    .name('Torch Model Tilt')
    .onChange(updateTorchModelTransform);
gui.add(params, 'torchModelRotZ', 0, 360)
    .name('Torch Model Yaw')
    .onChange(updateTorchModelTransform);
gui.add(params, 'torchModelScale', 0.2, 3)
    .name('Torch Model Scale')
    .onChange(updateTorchModelTransform);
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
gui.add(params, 'edgeFogDensity', 0, 2).name('Edge Fog');

const moonFolder = gui.addFolder('Moon');
moonFolder.add(moonParams, 'azimuth', -60, 60).name('Azimuth').onChange(placeMoon);
moonFolder.add(moonParams, 'elevation', 5, 80).name('Elevation').onChange(placeMoon);
moonFolder.add(moonParams, 'distance', 40, 160).name('Distance').onChange(placeMoon);
moonFolder
    .add(moonParams, 'glow', 0, 2)
    .name('Glow')
    .onChange((v) => (moonMat.emissiveIntensity = v));
moonFolder
    .add(moonParams, 'light', 0, 1.5)
    .name('Moonlight')
    .onChange((v) => (moonLight.intensity = v));
moonFolder
    .add(moonParams, 'halo', 0, 1.5)
    .name('Halo')
    .onChange((v) => (moonHaloMat.opacity = v));
moonFolder
    .add(moonParams, 'reflection', 0, 1)
    .name('Reflection')
    .onChange((v) => (waterUniforms.uMoonGlade.value = v));

// ==================== ANIMATION LOOP ====================
function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(clock.getDelta(), 0.1);
    if (controls.isLocked) {
        inputDir.set(
            (keys['KeyD'] ? 1 : 0) - (keys['KeyA'] ? 1 : 0),
            (keys['Space'] ? 1 : 0) - (keys['ShiftLeft'] || keys['ShiftRight'] ? 1 : 0),
            (keys['KeyW'] ? 1 : 0) - (keys['KeyS'] ? 1 : 0),
        );
        if (inputDir.lengthSq() > 0) inputDir.normalize();
        const boost = keys['ControlLeft'] || keys['ControlRight'] ? BOOST_MULT : 1;
        const speed = BASE_SPEED * boost * speedScale;
        targetVel.copy(inputDir).multiplyScalar(speed);
        const a = 1 - Math.exp(-SMOOTHING * dt);
        velocity.lerp(targetVel, a);
        controls.moveRight(velocity.x * dt);
        controls.moveForward(velocity.z * dt);
        camera.position.z += velocity.y * dt;
    } else {
        velocity.set(0, 0, 0);
    }
    updateHud(now);
    if (
        boatEncounterState === 'cruising' &&
        encounterArmed &&
        bats.length > 0 &&
        boatGroup.position.distanceTo(ROOST_CENTER) < ENCOUNTER_TRIGGER_DIST
    ) {
        boatEncounterState = 'frozen';
        encounterArmed = false;
        frozenElapsed = 0;
        for (const bat of bats) {
            if (bat.state === 'roost') {
                bat.state = 'flee';
                bat.fleeing = 1;
            }
        }
    }
    if (boatEncounterState === 'frozen') {
        frozenElapsed += dt;
        const allClear = bats.length === 0 || bats.every((b) => b.state === 'gone');
        if (allClear || frozenElapsed > FREEZE_TIMEOUT) {
            boatEncounterState = 'panicking';
        }
    }
    if (!encounterArmed && boatGroup.position.distanceTo(ROOST_CENTER) > ENCOUNTER_REARM_DIST) {
        encounterArmed = true;
    }
    if (boatEncounterState === 'batsAwayWait') {
        waitElapsed += dt;
        if (waitElapsed >= params.batsReturnDelay) {
            for (const bat of bats) startBatReturn(bat);
            boatEncounterState = 'batsReturning';
            waitElapsed = 0;
        }
    } else if (boatEncounterState === 'batsReturning') {
        waitElapsed += dt;
        const allHome = bats.every((b) => b.state === 'roost');
        if (allHome || waitElapsed > RETURN_TIMEOUT) {
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
    let boatDir = 1;
    let oarRateMult = 1;
    if (
        boatEncounterState === 'frozen' ||
        boatEncounterState === 'batsAwayWait' ||
        boatEncounterState === 'batsReturning' ||
        boatEncounterState === 'captainAwayWait'
    ) {
        boatDir = 0;
        oarRateMult = 0;
    } else if (boatEncounterState === 'panicking') {
        boatDir = -params.panicBoatMult;
        oarRateMult = params.panicOarMult;
    }
    rowTimeSec += dt * oarRateMult;
    if (boatDir !== 0) {
        boatProgress += dt * params.boatSpeed * BOAT_SPEED_SCALE * boatDir;
    }
    if (boatProgress <= 0.0) {
        boatProgress = 0.0;
        if (boatEncounterState === 'panicking') {
            boatEncounterState = 'batsAwayWait';
            waitElapsed = 0;
        }
    }
    if (boatProgress >= 1.0) {
        boatProgress = 0.0;
    }
    const currentPos = boatCurve.getPointAt(boatProgress);
    const currentTangent = boatCurve.getTangentAt(boatProgress).normalize();
    boatGroup.position.copy(currentPos);
    boatGroup.visible = currentPos.y < BOAT_HIDE_Y;
    boatGroup.up.set(0, 0, 1);
    const faceSign = boatDir < 0 ? -1 : 1;
    const lookTarget = currentPos.clone().addScaledVector(currentTangent, faceSign);
    boatGroup.lookAt(lookTarget);
    const timeSec = now * 0.001;
    updateFlames(timeSec);
    fireflyUniforms.uTime.value = timeSec;
    for (const m of edgeFogMats) {
        m.uniforms.uTime.value = timeSec;
        m.uniforms.uMul.value = params.edgeFogDensity;
    }
    
    for (const sheet of edgeFogGroup.children) {
        _fogCamDir
            .set(
                camera.position.x - sheet.position.x,
                camera.position.y - sheet.position.y,
                camera.position.z - sheet.position.z,
            )
            .normalize();
                const f = Math.abs(
            _fogCamDir.x * sheet.userData.nx +
                _fogCamDir.y * sheet.userData.ny +
                _fogCamDir.z * sheet.userData.nz,
        );
        // Keep a floor so perpendicular walls and the lid never fully vanish
        // when seen edge-on. Without it, from a distance only the single wall
        // facing the camera survives and the box looks open on the sides/top.
        const facing = THREE.MathUtils.smoothstep(f, 0.05, 0.5);
        sheet.material.uniforms.uFacing.value = 0.45 + 0.55 * facing;
    }
    const camWaveHeight = waveHeight(
        camera.position.x,
        camera.position.y,
        timeSec,
        params.waveAmplitude,
    );
    const waterSurfaceZ = -1.0 + camWaveHeight;
    const submersion = THREE.MathUtils.clamp((waterSurfaceZ - camera.position.z) / 0.05, 0, 1);
    setUnderwaterFactor(submersion);
    const edgeAmt =
        THREE.MathUtils.smoothstep(camera.position.y, 10.0, 16.0) *
        (1 - submersion) *
        Math.min(params.edgeFogDensity, 1);
    scene.fog.color
        .setHex(0x05060a)
        .lerp(_underwaterFogColor, submersion)
        .lerp(EDGE_FOG_COLOR, edgeAmt);
    scene.fog.density = Math.max(
        THREE.MathUtils.lerp(0.022, 0.3, submersion),
        THREE.MathUtils.lerp(0.022, 0.16, edgeAmt),
    );
    waterMaterial.uniforms.uTime.value = timeSec;
    waterMaterial.uniforms.uAmpScale.value = params.waveAmplitude;
    waterMaterial.uniforms.uReflectivity.value = params.waterReflectivity;
    waterMaterial.uniforms.uOpacity.value = params.waterOpacity;
    waterMaterial.uniforms.uSparkle.value = params.waterSparkle;
    waterMaterial.uniforms.uSpecStrength.value = params.waterGlint;
    waterMaterial.uniforms.uDetailSpeed.value = params.waterFlowSpeed;
    let boatWorldSpeed = 0;
    if (_boatPrevValid) boatWorldSpeed = currentPos.distanceTo(_boatPrevPos) / Math.max(dt, 1e-3);
    _boatPrevPos.copy(currentPos);
    _boatPrevValid = true;
    const wakeAmt = THREE.MathUtils.clamp(boatWorldSpeed * 0.8, 0, 1.5) * params.waterWakeStrength;
    waterMaterial.uniforms.uBoatPos.value.set(currentPos.x, currentPos.y);
    const _tl = Math.hypot(currentTangent.x, currentTangent.y) || 1;
    waterMaterial.uniforms.uBoatDir.value.set(
        (currentTangent.x / _tl) * faceSign,
        (currentTangent.y / _tl) * faceSign,
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
    const sp = 0.25;
    const hC = waveHeight(currentPos.x, currentPos.y, timeSec, amp);
    const hBow = waveHeight(currentPos.x, currentPos.y - sp, timeSec, amp);
    const hStern = waveHeight(currentPos.x, currentPos.y + sp, timeSec, amp);
    const hPort = waveHeight(currentPos.x - sp, currentPos.y, timeSec, amp);
    const hStar = waveHeight(currentPos.x + sp, currentPos.y, timeSec, amp);
    boatGroup.position.z = currentPos.z + hC + BOAT_FLOAT;
    const pitch = Math.atan2(hBow - hStern, 2.0 * sp);
    const roll = Math.atan2(hPort - hStar, 2.0 * sp);
    boatGroup.rotateX(pitch);
    boatGroup.rotateZ(roll);
    const oarPhase = rowTimeSec * params.oarSpeed;
    const sweep = Math.sin(oarPhase) * params.oarAmplitude;
    const lift = Math.cos(oarPhase) * params.oarLift;
    const rowOar = (oar, sweepSign, bladeSignX) => {
        const rest = oarRest.get(oar);
        if (!rest) return;
        oar.parent.getWorldQuaternion(_oarParentQ);
        _oarParentInv.copy(_oarParentQ).invert();
        _oarAxis.copy(WORLD_UP).applyQuaternion(_oarParentInv).normalize();
        _oarQ.setFromAxisAngle(_oarAxis, sweep * sweepSign);
        _oarOutboard.set(bladeSignX, 0, 0).applyQuaternion(rest).applyQuaternion(_oarParentQ);
        _oarOutboard.z = 0;
        if (_oarOutboard.lengthSq() > 1e-6) {
            _oarOutboard.normalize();
            _oarLiftAxis
                .set(_oarOutboard.y, -_oarOutboard.x, 0)
                .applyQuaternion(_oarParentInv)
                .normalize();
            _oarLiftQ.setFromAxisAngle(_oarLiftAxis, lift);
        } else {
            _oarLiftQ.identity();
        }
        oar.quaternion.copy(rest).premultiply(_oarQ).premultiply(_oarLiftQ);
    };
    if (oars.L) rowOar(oars.L, OAR_L_SIGN, -1);
    if (oars.R) rowOar(oars.R, OAR_R_SIGN, +1);
    processOarRipple(oars.L, oarDip.L, timeSec, params.waveAmplitude);
    processOarRipple(oars.R, oarDip.R, timeSec, params.waveAmplitude);
    uploadRipples(timeSec);
    captGroup.position.y = params.seatHeight;
    if (captArmLen > 0 && (oars.L || oars.R)) {
        boatGroup.getWorldQuaternion(_ikBoatQ);
        _ikUpW.set(0, 1, 0).applyQuaternion(_ikBoatQ);
        _ikLift.copy(_ikUpW).multiplyScalar(CAPT_HAND_LIFT);
        const ea = THREE.MathUtils.degToRad(params.elbowAngle);
        if (captBones.armL && captBones.foreL && oars.L) {
            solveArmIK(
                captBones.armL,
                captBones.foreL,
                oarHandle(oars.L, +1, _ikHandle).add(_ikLift),
                captArmLen,
                captForeLen,
                _ikUpW,
                ea,
            );
            gripHand(captBones.handL, captBones.foreL, THREE.MathUtils.degToRad(params.gripRoll));
        }
        if (captBones.armR && captBones.foreR && oars.R) {
            solveArmIK(
                captBones.armR,
                captBones.foreR,
                oarHandle(oars.R, -1, _ikHandle).add(_ikLift),
                captArmLen,
                captForeLen,
                _ikUpW,
                -ea,
            );
            gripHand(captBones.handR, captBones.foreR, THREE.MathUtils.degToRad(-params.gripRoll));
        }
    }
    if (bats.length) updateBats(timeSec, dt, boatGroup.position);
    updateActiveShadowTorches(camera.position);
    renderer.shadowMap.needsUpdate = true;
    water.visible = false;
    batsGroup.visible = false;
    edgeFogGroup.visible = false;
    renderer.setRenderTarget(depthTarget);
    renderer.render(scene, camera);
    water.visible = true;
    batsGroup.visible = true;
    edgeFogGroup.visible = true;
    renderer.setRenderTarget(null);
    renderer.render(scene, camera);
    TWEEN.update();
    tickFps(now);
}
animate();
