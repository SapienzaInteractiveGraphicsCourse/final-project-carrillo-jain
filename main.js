import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';


const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);

const camera = new THREE.PerspectiveCamera(
    60,
    window.innerWidth / window.innerHeight,
    0.05,
    1000
);
camera.position.set(1.64, -0.78, -0.32);
camera.lookAt(1.61, -2.56, -0.25);

const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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


const ambientLight = new THREE.AmbientLight(0x3a4658, 0.18);
scene.add(ambientLight);

const hemiLight = new THREE.HemisphereLight(0x4a5a72, 0x1a120c, 0.25);
hemiLight.position.set(0, 0, 5);   // +Z is up in this scene
scene.add(hemiLight);

function createTorch(position, { intensity = 10, color = 0xffaa44, castShadow = false } = {}) {
    const light = new THREE.PointLight(color, intensity, 25, 2);
    light.position.copy(position);
    light.castShadow = castShadow;
    if (castShadow) {
        light.shadow.bias           = -0.0015;
        light.shadow.normalBias     =  0.03;
        light.shadow.radius         =  3;       // soften the edge (PCFSoft)
        light.shadow.mapSize.width  =  1024;
        light.shadow.mapSize.height =  1024;
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
    scene.add(light);
    return light;
}

const torches = [
    createTorch(new THREE.Vector3(-4.15, -5.23, 0.09), { castShadow: true }),
    createTorch(new THREE.Vector3(1.22, -6.77, 1.06), { castShadow: true }),
    createTorch(new THREE.Vector3(2.3, -1.9, -0.6), { castShadow: true }),
];

const roofCutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), -1.5);

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
scene.add(capMesh);

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
    newMat.clippingPlanes = [roofCutPlane];
    newMat.clipShadows = true;
    newMat.side = THREE.DoubleSide;
    newMat.shadowSide = THREE.FrontSide;
    return newMat;
}

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

const MAX_WATER_LIGHTS = 8;

const waterUniforms = {
    uTime:           { value: 0 },
    uAmpScale:       { value: 1.0 },
    uExposure:       { value: 1.15 },   // keep in sync with renderer.toneMappingExposure
    uBaseColor:      { value: new THREE.Color(0x1f6f7a) },
    uAmbient:        { value: new THREE.Color(0x202830) },
    uOpacity:        { value: 0.72 },
    uAmp:            { value: WAVES.map(w => w.amp) },
    uDir:            { value: WAVES.map(w => w.dir.clone()) },
    uFreq:           { value: WAVES.map(w => w.freq) },
    uSpeed:          { value: WAVES.map(w => w.speed) },
    uLightCount:     { value: 0 },
    uLightPos:       { value: Array.from({ length: MAX_WATER_LIGHTS }, () => new THREE.Vector3()) },
    uLightColor:     { value: Array.from({ length: MAX_WATER_LIGHTS }, () => new THREE.Color()) },
    uLightIntensity: { value: new Array(MAX_WATER_LIGHTS).fill(0) },
};

const waterVertex = `
    #define NUM ${WAVES.length}

    uniform float uTime;
    uniform float uAmpScale;
    uniform float uAmp[NUM];
    uniform vec2  uDir[NUM];
    uniform float uFreq[NUM];
    uniform float uSpeed[NUM];

    varying vec3 vWorldPos;
    varying vec3 vNormal;

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

        pos.z += h;

        vec3 localNormal = normalize(vec3(-dHdx, -dHdy, 1.0));
        vNormal = normalize(mat3(modelMatrix) * localNormal);

        vec4 worldPos = modelMatrix * vec4(pos, 1.0);
        vWorldPos = worldPos.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPos;
    }
`;

const waterFragment = `
    #define MAXL ${MAX_WATER_LIGHTS}

    uniform vec3  uBaseColor;
    uniform vec3  uAmbient;
    uniform float uOpacity;
    uniform float uExposure;
    uniform int   uLightCount;
    uniform vec3  uLightPos[MAXL];
    uniform vec3  uLightColor[MAXL];
    uniform float uLightIntensity[MAXL];

    varying vec3 vWorldPos;
    varying vec3 vNormal;

    // Match the renderer's ACESFilmicToneMapping + sRGB output so the water
    // sits in the same tonal range as the tone-mapped cave around it.
    vec3 acesFilmic(vec3 x) {
        const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
        return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }
    vec3 linearToSRGB(vec3 c) {
        return mix(1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055,
                   c * 12.92, step(c, vec3(0.0031308)));
    }

    void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);

        vec3 color = uBaseColor * uAmbient;

        for (int i = 0; i < MAXL; i++) {
            if (i >= uLightCount) break;
            vec3  toL   = uLightPos[i] - vWorldPos;
            float dist  = length(toL);
            vec3  L     = toL / max(dist, 0.0001);
            float atten = uLightIntensity[i] / (1.0 + dist * dist);

            float diff = max(dot(N, L), 0.0);
            vec3  Hh   = normalize(L + V);
            float spec = pow(max(dot(N, Hh), 0.0), 80.0);

            color += uBaseColor * uLightColor[i] * diff * atten;
            color += uLightColor[i] * spec * atten * 0.6;
        }

        float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
        color += uBaseColor * fres * 0.25;

        color = acesFilmic(color * uExposure);
        color = linearToSRGB(color);
        gl_FragColor = vec4(color, uOpacity);
    }
`;

const waterGeometry = new THREE.PlaneGeometry(WATER_SIZE, WATER_SIZE, WATER_SEGMENTS, WATER_SEGMENTS);
const waterMaterial = new THREE.ShaderMaterial({
    uniforms: waterUniforms,
    vertexShader: waterVertex,
    fragmentShader: waterFragment,
    transparent: true,
    toneMapped: false,   // we tone-map + sRGB-encode inside the fragment shader
    side: THREE.DoubleSide,
});
const water = new THREE.Mesh(waterGeometry, waterMaterial);

water.position.set(0, 0, -1.0);
scene.add(water);

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

const pathGeometry = new THREE.TubeGeometry(riverCurve, 64, 0.05, 8, false);
const pathMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: false });
const visiblePath = new THREE.Mesh(pathGeometry, pathMaterial);
scene.add(visiblePath);

// Hide the cyan debug tube that marks the river path (set true to show it again).
visiblePath.visible = false;

const boatGroup = new THREE.Group();
scene.add(boatGroup);

// --- Real rowboat model (replaces the old box-and-cone placeholder) ---
// In boatGroup local space the boat travels along -Z (bow) with +Y up, matching
// the path-following + wave-bobbing code in animate().
const BOAT_LENGTH  = 1.1;            // target length in world units (FBX ships in cm)
const BOAT_HEADING = 0;              // yaw so the bow points along -Z travel (FBX bow is at -Z)
const BOAT_FLOAT   = 0.12;           // lift the hull so it rides ON the water, not half-submerged (tune)
// The oar geometry's long axis is the oar's local +X (the shaft), so the old
// approach of rotating about local X just twisted each oar around its own length
// (feathering) instead of sweeping it. Instead we sweep each oar about WORLD up
// through its own pivot, which the FBX places near the inboard/oarlock end. That
// reads as rowing regardless of the boat's heading or wave tilt.
const WORLD_UP   = new THREE.Vector3(0, 0, 1);  // +Z is up in this scene
const OAR_L_SIGN = +1;
const OAR_R_SIGN = -1;               // mirrored oar -> opposite sign = blades sweep together
const _oarQ      = new THREE.Quaternion();      // scratch, reused each frame
const _oarLiftQ  = new THREE.Quaternion();
const _oarAxis   = new THREE.Vector3();          // sweep axis in parent-local space
const _oarLiftAxis = new THREE.Vector3();        // lift axis in parent-local space
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

        // Auto-scale from the bounding box to the target length, then recenter.
        let box = new THREE.Box3().setFromObject(boat);
        const size = box.getSize(new THREE.Vector3());
        const longest = Math.max(size.x, size.z) || 1;
        boat.scale.multiplyScalar(BOAT_LENGTH / longest);
        boat.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(boat);
        boat.position.sub(box.getCenter(new THREE.Vector3()));

        // This FBX ships with its own baked-in PointLight ("Light") and a Camera.
        // The old mesh-only traverse left them in, so the point light got added to
        // the scene and rode along the river as a stray moving light. Remove any
        // lights/cameras the model carries.
        const junk = [];
        boat.traverse((child) => {
            if (child.isLight || child.isCamera) junk.push(child);
        });
        junk.forEach((n) => n.parent && n.parent.remove(n));
        if (junk.length) console.log('Rowboat: stripped baked',
            junk.map((n) => n.type).join(', '));

        // Rebuild materials as MeshStandard so the boat lights like the cave; keep
        // any baked color map, otherwise fall back to a wood tone.
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
                clippingPlanes: [roofCutPlane], clipShadows: true,
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


const CAPT_HEIGHT  = 0.62;        // target standing height in world units
const CAPT_HEADING = Math.PI;     // yaw; faces the stern (back to bow) like a real rower
const CAPT_SEAT    = new THREE.Vector3(0, 0.05, 0.04);    // pelvis position in boat-local space (tune Y for seat height)
const CAPT_HAND_LIFT = 0.05;      // raise the hand IK target (boat-local up) so hands sit at chest height

const CAPT_ARM_AXIS    = new THREE.Vector3(1, 0, 0);     // upper-arm + elbow swing axis (bone-local)
const CAPT_ARM_LOWER   = 0.85;   // base: drop the upper arms down out of the T-pose (rad)
const CAPT_ELBOW_BEND  = 1.15;   // base: bend the elbows so the forearms come forward (rad)
const CAPT_THIGH_BEND  = 1.45;   // swing thighs forward (rad)
const CAPT_KNEE_BEND   = -1.5;   // bend knees down (rad)
const CAPT_LEG_SPREAD  = 0.5;    // open the knees outward so hands reach the oars (rad)
const CAPT_SPREAD_AXIS = new THREE.Vector3(0, 0, 1);   // bone-local Z: thigh abduction
const _captQ = new THREE.Quaternion();                    // scratch, reused each frame

const captGroup = new THREE.Group();
boatGroup.add(captGroup);

const captBones = { armL: null, foreL: null, handL: null, armR: null, foreR: null, handR: null };
const captRest  = new WeakMap();  // bone -> rest quaternion
let captArmLen = 0, captForeLen = 0;   // world-space upper-arm and forearm lengths (set on load)

// --- 2-bone IK: drive the captain's hands onto the moving oar handles. Because the
//     oars already row in a circle, his arms inherit that motion in sync. ---
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
            const apply = (mat) => {
                if (!mat) return;
                mat.clippingPlanes = [roofCutPlane];
                mat.clipShadows = true;
            };
            Array.isArray(child.material) ? child.material.forEach(apply) : apply(child.material);
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
});

const clock = new THREE.Clock();
const _capTarget = new THREE.Vector3();

const batRoot = new THREE.Group();
batRoot.position.set(0, -3, 0);
scene.add(batRoot);


const BAT_WINGSPAN = 2.5;                        // target wingspan in world units
const FLAP_AXIS = new THREE.Vector3(1, 0, 0);    // bone-local flap axis (head-tail axis)
const _flapQ = new THREE.Quaternion();           // scratch, reused each frame

// bones we drive ourselves once the model has loaded
const batBones = { armL: null, armR: null, wingL: null, wingR: null };
const batRest  = new WeakMap();                  // bone -> rest quaternion

// match bone by name regardless of '.'/'_' sanitization differences
function findBone(root, targetName) {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const t = norm(targetName);
    let found = null;
    root.traverse((o) => { if (!found && norm(o.name) === t) found = o; });
    return found;
}

const gltfLoader = new GLTFLoader();
gltfLoader.load(
    './models/bat.glb',
    (gltf) => {
        const model = gltf.scene;

        model.rotation.y = -Math.PI / 2;

        model.updateMatrixWorld(true);
        let box = new THREE.Box3().setFromObject(model);
        const span = box.getSize(new THREE.Vector3()).x || 1;   // wingspan after yaw
        model.scale.setScalar(BAT_WINGSPAN / span);
        model.updateMatrixWorld(true);
        box = new THREE.Box3().setFromObject(model);
        model.position.sub(box.getCenter(new THREE.Vector3()));

        model.traverse((child) => {
            if (!child.isMesh) return;
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
                child.material.side = THREE.DoubleSide;   // thin wing membranes
                child.material.shadowSide = THREE.FrontSide;
            }
        });

        batRoot.add(model);

        // Grab the bones we animate and remember their rest orientation
        batBones.armL  = findBone(model, 'arm1.L_Armature');
        batBones.armR  = findBone(model, 'arm1.R_Armature');
        batBones.wingL = findBone(model, 'wing1.L_Armature');
        batBones.wingR = findBone(model, 'wing1.R_Armature');
        for (const b of Object.values(batBones)) {
            if (b) batRest.set(b, b.quaternion.clone());
        }
        console.log('Bat loaded. Driven bones:',
            Object.entries(batBones).filter(([, b]) => b).map(([k]) => k).join(', ') || 'NONE');
    },
    undefined,
    (err) => console.error('Error loading bat.glb:', err)
);

const point1 = { x: -2.0, y: -3.8, z:  0.6 };
const point2 = { x:  1.8, y: -2.4, z: -0.2 };
const point3 = { x:  0.0, y: -3.0, z:  0.0 };

const tween1 = new TWEEN.Tween(batRoot.position).to(point1, 4000).easing(TWEEN.Easing.Quadratic.InOut);
const tween2 = new TWEEN.Tween(batRoot.position).to(point2, 4000).easing(TWEEN.Easing.Quadratic.InOut);
const tween3 = new TWEEN.Tween(batRoot.position).to(point3, 4000).easing(TWEEN.Easing.Quadratic.InOut);

tween1.onStart(() => batRoot.lookAt(point1.x, point1.y, point1.z));
tween2.onStart(() => batRoot.lookAt(point2.x, point2.y, point2.z));
tween3.onStart(() => batRoot.lookAt(point3.x, point3.y, point3.z));

tween1.chain(tween2);
tween2.chain(tween3);
tween3.chain(tween1);

tween1.start();

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
    torchIntensity: 14.0,
    waveAmplitude: 1.0
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
gui.add(params, 'waveAmplitude', 0, 3).name('Wave Amplitude');

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
        camera.position.y += velocity.y * dt;
    } else {
        velocity.set(0, 0, 0);
    }

    roofCutPlane.coplanarPoint(capMesh.position);
    _capTarget.copy(capMesh.position).sub(roofCutPlane.normal);
    capMesh.lookAt(_capTarget);

    updateHud(now);
    maybeLogPosition();

    boatProgress += dt * params.boatSpeed;
    if (boatProgress >= 1.0) boatProgress = 0.0;

    const currentPos = riverCurve.getPointAt(boatProgress);
    const currentTangent = riverCurve.getTangentAt(boatProgress).normalize();

    boatGroup.position.copy(currentPos);

    boatGroup.up.set(0, 0, 1);

    const lookTarget = currentPos.clone().add(currentTangent);
    boatGroup.lookAt(lookTarget);

    const timeSec = now * 0.001;

    waterMaterial.uniforms.uTime.value     = timeSec;
    waterMaterial.uniforms.uAmpScale.value = params.waveAmplitude;

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

    const oarPhase = timeSec * params.oarSpeed;
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

    // --- Our own flapping animation, driving the imported skeleton's bones ---
    const flapAmp = 0.5;
    const phaseOffset = 1.2;

    const innerAngle = Math.sin(timeSec * params.flapSpeed) * flapAmp;
    const outerAngle = Math.sin(timeSec * params.flapSpeed - phaseOffset) * (flapAmp * 1.4);

    const flapBone = (bone, angle, sign) => {
        const rest = batRest.get(bone);
        if (!rest) return;
        _flapQ.setFromAxisAngle(FLAP_AXIS, angle * sign);
        bone.quaternion.copy(rest).multiply(_flapQ);
    };
    if (batBones.armL) {
        flapBone(batBones.armL,  innerAngle, +1);   // upper arm = primary flap
        flapBone(batBones.armR,  innerAngle, +1);   // mirrored bone -> same sign = beats together
        flapBone(batBones.wingL, outerAngle, +1);   // outer wing = phase-lagged tip
        flapBone(batBones.wingR, outerAngle, +1);
    }

    const intensityVariance = 4.0;

    const pseudoNoise = Math.sin(timeSec * 43.19) * Math.cos(timeSec * 37.81);

    torches.forEach((torch, index) => {

        const localTime = timeSec + (index * 1.5);

        const flutter =
            (0.4 * Math.sin(localTime * 2.1)) +
            (0.3 * Math.sin(localTime * 3.7)) +
            (0.3 * pseudoNoise);

        torch.intensity = params.torchIntensity + (intensityVariance * flutter);

        const startX = torch.userData.startX || torch.position.x;
        const startZ = torch.userData.startZ || torch.position.z;

        if (!torch.userData.startX) {
            torch.userData.startX = startX;
            torch.userData.startZ = startZ;
        }

        torch.position.x = startX + (Math.sin(localTime * 15.0) * 0.02);
        torch.position.z = startZ + (Math.cos(localTime * 17.0) * 0.02);
    });

    renderer.render(scene, camera);
    TWEEN.update();
    tickFps(now);

}

animate();