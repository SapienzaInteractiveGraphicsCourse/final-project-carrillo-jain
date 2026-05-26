import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';

// =============================================================================
// SCENE / CAMERA / RENDERER
// =============================================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);

const camera = new THREE.PerspectiveCamera(
    60,                                       // a bit wider FOV — nicer for flying
    window.innerWidth / window.innerHeight,
    0.05,
    1000
);
camera.position.set(1.64, -0.78, -0.32);
camera.lookAt(1.61, -2.56, -0.25);            // preserve original viewing direction

const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(1);                    // was clamped to 1.5 — 1.0 is ~2.25× cheaper on Retina
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.localClippingEnabled = true;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// =============================================================================
// FLIGHT CONTROLS  (replaces OrbitControls)
// =============================================================================
//
//   W A S D         strafe / forward / back
//   Space           ascend
//   Shift           descend
//   Ctrl            boost (hold)
//   Mouse           look
//   Click canvas    capture pointer
//   Esc             release pointer
//
// Velocity is exponentially smoothed toward a target velocity so the camera
// feels like it has a little inertia rather than snapping on/off.
// =============================================================================

const controls = new PointerLockControls(camera, renderer.domElement);

// ---- on-screen overlay -----------------------------------------------------
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

// ---- input + movement state -----------------------------------------------
const keys = Object.create(null);
addEventListener('keydown', (e) => { keys[e.code] = true; });
addEventListener('keyup',   (e) => { keys[e.code] = false; });
// Drop keys if window loses focus, so movement doesn't "stick".
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

// Press P to log a paste-ready createTorch(...) line for the current spot.
// Also copied to the clipboard if the browser allows it.
addEventListener('keydown', (e) => {
    if (e.code !== 'KeyP' || !controls.isLocked) return;
    const p = camera.position;
    const line = `createTorch(new THREE.Vector3(${p.x.toFixed(2)}, ${p.y.toFixed(2)}, ${p.z.toFixed(2)})),`;
    console.log(line);
    if (navigator.clipboard) navigator.clipboard.writeText(line).catch(() => {});
    flashHud();
});

const BASE_SPEED = 2.5;    // units / second at normal speed
const BOOST_MULT = 4.0;    // multiplier when Ctrl is held
const SMOOTHING  = 12.0;   // higher = snappier accel/decel

const velocity  = new THREE.Vector3();
const inputDir  = new THREE.Vector3();
const targetVel = new THREE.Vector3();

// Optional: scroll wheel adjusts cruise speed.
addEventListener('wheel', (e) => {
    if (!controls.isLocked) return;
    const factor = Math.exp(-e.deltaY * 0.001);
    speedScale = THREE.MathUtils.clamp(speedScale * factor, 0.2, 8.0);
}, { passive: true });
let speedScale = 1.0;

// ---- live coordinate HUD ---------------------------------------------------
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

// FPS smoothing (rolling, updated twice a second).
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

// HUD itself is a DOM write — don't do it every frame.
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

// Throttled console log so you also get a scrollable history, the way
// OrbitControls used to print on 'end'.
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


const ambientLight = new THREE.AmbientLight(0xffffff, 0.08);
scene.add(ambientLight);

function createTorch(position, { intensity = 10, color = 0xffaa44, castShadow = false } = {}) {
    const light = new THREE.PointLight(color, intensity, 25, 2);
    light.position.copy(position);
    light.castShadow = castShadow;
    if (castShadow) {
        light.shadow.bias           = -0.002;
        light.shadow.normalBias     =  0.02;
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
    './CaveOptimizedobj.mtl',
    (materials) => {
        materials.preload();
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials);
        objLoader.load(
            './CaveOptimizedobj.obj',
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
// ==========================================
// THE WATER PLANE
// ==========================================
const waterGeometry = new THREE.PlaneGeometry(40, 40); 
const waterMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x00aaaa,       
    transparent: true, 
    opacity: 0.6,          
    side: THREE.DoubleSide
});
const water = new THREE.Mesh(waterGeometry, waterMaterial);

// NO rotation needed! Because Z is your up/down axis, 
// the default plane is perfectly flat to your cave floor.

// Center it (X=0, Y=0) and set the height (Z) to -1.0
water.position.set(0, 0, -1.0); 

scene.add(water);
// ==========================================
// ==========================================
// ==========================================


// ==========================================
// PHASE 4: RIVER NAVIGATION SPLINE
// ==========================================
const riverPoints = [ 
    // --- THE CYAN S-CURVE (GOING IN) ---
    new THREE.Vector3( -1.2,   3.0, -1.0),  
    new THREE.Vector3( -0.6,   0.0, -1.0),  
    new THREE.Vector3( -1.9,  -3.5, -1.0),  
    new THREE.Vector3( -0.6,  -7.0, -1.0),  
    new THREE.Vector3( -0.9, -10.0, -1.0),  // <-- Pulled right to thin the top

    // --- THE TIGHTER TURNAROUND ---
    new THREE.Vector3( -0.7, -11.0, -1.0),  // <-- Narrower U-Turn

    // --- THE RED STRAIGHT LINE (COMING OUT) ---
    new THREE.Vector3( -0.5, -10.0, -1.0),  // <-- Pulled left to thin the top
    new THREE.Vector3( -0.5,  -3.5, -1.0),  
    new THREE.Vector3( -0.5,   3.0, -1.0)   
];

// Ensure it is false so the ends stay open!
const riverCurve = new THREE.CatmullRomCurve3(riverPoints, false);
// 3. Make the invisible math visible for debugging!
// (Draws a glowing cyan tube around the path)
const pathGeometry = new THREE.TubeGeometry(riverCurve, 64, 0.05, 8, false);
const pathMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: false });
const visiblePath = new THREE.Mesh(pathGeometry, pathMaterial);
scene.add(visiblePath);

// ========================================


window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
const _capTarget = new THREE.Vector3();

function animate() {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min(clock.getDelta(), 0.1);   // clamp huge frame gaps

    if (controls.isLocked) {
        // Build a camera-local input direction.
        // +x = right, +y = up, +z = forward (PointerLockControls.moveForward convention).
        inputDir.set(
            (keys['KeyD']   ? 1 : 0) - (keys['KeyA']   ? 1 : 0),
            (keys['Space']  ? 1 : 0) - (keys['ShiftLeft'] || keys['ShiftRight'] ? 1 : 0),
            (keys['KeyW']   ? 1 : 0) - (keys['KeyS']   ? 1 : 0),
        );
        if (inputDir.lengthSq() > 0) inputDir.normalize();

        const boost = (keys['ControlLeft'] || keys['ControlRight']) ? BOOST_MULT : 1;
        const speed = BASE_SPEED * boost * speedScale;
        targetVel.copy(inputDir).multiplyScalar(speed);

        // Frame-rate-independent exponential smoothing toward targetVel.
        const a = 1 - Math.exp(-SMOOTHING * dt);
        velocity.lerp(targetVel, a);

        controls.moveRight(velocity.x * dt);
        controls.moveForward(velocity.z * dt);
        camera.position.y += velocity.y * dt;
    } else {
        velocity.set(0, 0, 0);
    }

    // keep the stencil cap plane facing along the cut normal
    roofCutPlane.coplanarPoint(capMesh.position);
    _capTarget.copy(capMesh.position).sub(roofCutPlane.normal);
    capMesh.lookAt(_capTarget);

    updateHud(now);
    maybeLogPosition();

    renderer.render(scene, camera);
    tickFps(now);
}

animate();