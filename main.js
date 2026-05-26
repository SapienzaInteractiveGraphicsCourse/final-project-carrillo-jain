import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import * as TWEEN from 'three/addons/libs/tween.module.js';
import { GUI } from 'three/addons/libs/lil-gui.module.min.js';

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

// 4. Create the Boat (A simple box with a pointed front)
const boatGroup = new THREE.Group();

// The Hull (Box)
const hullMat = new THREE.MeshStandardMaterial({ color: 0x8b4513, roughness: 0.8 });
const hull = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.8), hullMat);
hull.position.y = 0.1; // Lift slightly above water
boatGroup.add(hull);

// The Bow (Pointy front so we know it's facing the right way)
const bow = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.4, 4), hullMat);
bow.rotation.x = -Math.PI / 2; // Point it forward
bow.position.set(0, 0.1, -0.6); // Attach to the front of the hull
boatGroup.add(bow);

scene.add(boatGroup);

// 5. A variable to track how far along the river the boat is (from 0.0 to 1.0)
let boatProgress = 0;

// ========================================


window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

const clock = new THREE.Clock();
const _capTarget = new THREE.Vector3();

// ==========================================
// PHASE 5: PROCEDURAL HIERARCHICAL BAT
// ==========================================

// 1. Materials for the bat
const bodyMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });
const wingMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9, side: THREE.DoubleSide });

// 2. The Root Node (Moves the entire bat through the cave)
const batRoot = new THREE.Group();
batRoot.position.set(0, 0, 3); // Back up to the ceiling!
scene.add(batRoot);

// 3. The Torso
const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.6, 4, 8), bodyMat);
// Lay it flat for flying
torso.rotation.x = Math.PI / 2; 
batRoot.add(torso);

// --- LEFT WING HIERARCHY ---
// 4a. Left Shoulder Pivot
const leftShoulder = new THREE.Group();
leftShoulder.position.set(0.2, 0, 0); // Attach to right side of torso
batRoot.add(leftShoulder);

// 4b. Left Inner Wing
const leftInnerWing = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), wingMat);
leftInnerWing.position.set(0.5, 0, 0); // Shift so the edge is on the pivot
leftShoulder.add(leftInnerWing);

// 4c. Left Elbow Pivot
const leftElbow = new THREE.Group();
leftElbow.position.set(0.5, 0, 0); // Attach to the end of the inner wing
leftInnerWing.add(leftElbow);

// 4d. Left Outer Wing
const leftOuterWing = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), wingMat);
leftOuterWing.position.set(0.6, 0, 0); // Shift from the elbow
leftElbow.add(leftOuterWing);


// --- RIGHT WING HIERARCHY ---
// 5a. Right Shoulder Pivot
const rightShoulder = new THREE.Group();
rightShoulder.position.set(-0.2, 0, 0); 
batRoot.add(rightShoulder);

// 5b. Right Inner Wing
const rightInnerWing = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6), wingMat);
rightInnerWing.position.set(-0.5, 0, 0); 
rightShoulder.add(rightInnerWing);

// 5c. Right Elbow Pivot
const rightElbow = new THREE.Group();
rightElbow.position.set(-0.5, 0, 0); 
rightInnerWing.add(rightElbow);

// 5d. Right Outer Wing
const rightOuterWing = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.4), wingMat);
rightOuterWing.position.set(-0.6, 0, 0); 
rightElbow.add(rightOuterWing);

// --- PHASE 5: TWEEN.JS MACROSCOPIC FLIGHT PATH ---
// Create three waypoints near the ceiling for the bat to fly between
const point1 = { x: 4, y: 5, z: 3.5 };
const point2 = { x: -4, y: 8, z: 4.0 };
const point3 = { x: 0, y: 0, z: 3.0 };

// Create the animations (4000ms = 4 seconds per leg of the trip)
const tween1 = new TWEEN.Tween(batRoot.position).to(point1, 4000).easing(TWEEN.Easing.Quadratic.InOut);
const tween2 = new TWEEN.Tween(batRoot.position).to(point2, 4000).easing(TWEEN.Easing.Quadratic.InOut);
const tween3 = new TWEEN.Tween(batRoot.position).to(point3, 4000).easing(TWEEN.Easing.Quadratic.InOut);

// To avoid Gimbal Lock (as requested in your project plan), we tell the bat 
// to look at its next destination right as it starts flying there!
tween1.onStart(() => batRoot.lookAt(point1.x, point1.y, point1.z));
tween2.onStart(() => batRoot.lookAt(point2.x, point2.y, point2.z));
tween3.onStart(() => batRoot.lookAt(point3.x, point3.y, point3.z));

// Chain them together so it loops forever
tween1.chain(tween2);
tween2.chain(tween3);
tween3.chain(tween1);

// Start the flight!
tween1.start();

// --- PHASE 7: USER INTERFACE ---
const params = {
    boatSpeed: 0.05,
    flapSpeed: 15.0,
    torchIntensity: 10.0
};

const gui = new GUI();
gui.add(params, 'boatSpeed', 0, 0.2).name('Boat Speed');
gui.add(params, 'flapSpeed', 0, 30).name('Bat Flap Speed');
gui.add(params, 'torchIntensity', 0, 20).name('Torch Brightness');

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

    // --- PHASE 4: BOAT NAVIGATION MATH ---
    // 1. Move the progress forward slightly based on time
    // --- PHASE 4: BOAT NAVIGATION MATH ---
    // 1. Move progress forward slightly based on time

    boatProgress += dt * params.boatSpeed;
    if (boatProgress >= 1.0) boatProgress = 0.0;

    // 2. Get exact position and tangent from the cyan curve
    const currentPos = riverCurve.getPointAt(boatProgress);
    const currentTangent = riverCurve.getTangentAt(boatProgress).normalize();

    // 3. Set the boat's position to the curve
    boatGroup.position.copy(currentPos);

    // 4. FIX THE FLIPPING: Tell the boat that Z is the sky!
    boatGroup.up.set(0, 0, 1); 

    // 5. Look slightly ahead
    const lookTarget = currentPos.clone().add(currentTangent);
    boatGroup.lookAt(lookTarget);

    // 6. BUOYANCY: Shared Mathematical Syncing
    const timeSec = now * 0.001; 
    // Calculate wave height (Using X and Y because the river is flat on the XY plane)
    const waveHeave = 
        Math.sin(currentPos.x * 2.0 + timeSec * 1.5) * 0.05 + 
        Math.sin(currentPos.y * 1.5 + timeSec * 2.0) * 0.05;
    
    // OVERRIDE the Z position (height) to bob up and down
    boatGroup.position.z = currentPos.z + waveHeave;

    // Apply local pitch and roll so it doesn't fight the steering
    boatGroup.rotateX(Math.cos(timeSec * 2.0) * 0.05); // Pitch (front-to-back)
    boatGroup.rotateZ(Math.sin(timeSec * 1.5) * 0.05); // Roll (side-to-side)
    // -------------------------------------

    // --- PHASE 5: BAT WING KINEMATICS ---
    // The variables from your mathematical formulas
   
    const flapAmp = 0.6;        // How high the shoulders lift (A_flap)
    const phaseOffset = 1.2;    // The delay for the elbow whip (φ_offset)
    
    // We use the same time variable from your boat waves!
    
    // 1. Inner Wings (Shoulders)
    const innerAngle = Math.sin(timeSec * params.flapSpeed) * flapAmp;
    leftShoulder.rotation.y = innerAngle;
    rightShoulder.rotation.y = -innerAngle; // Negative so it mirrors the left side

    // 2. Outer Wings (Elbows) - Notice the "- phaseOffset" delaying the sine wave!
   const outerAngle = Math.sin(timeSec * params.flapSpeed - phaseOffset) * (flapAmp * 1.5);
   leftElbow.rotation.y = outerAngle; 
   rightElbow.rotation.y = -outerAngle;
    // ------------------------------------
 // --- PHASE 6: STOCHASTIC THERMODYNAMICS (TORCH FLICKER) ---
    // The base intensity and maximum allowed variance from your documentation
    
    const intensityVariance = 4.0;
    
    // We need a simple, fast noise generator since we can't use complex Perlin here.
    // A high-frequency sine wave multiplied by a chaotic prime number works great.
    const pseudoNoise = Math.sin(timeSec * 43.19) * Math.cos(timeSec * 37.81);

    // Loop through every torch in the cave
    torches.forEach((torch, index) => {
        // Give each torch a slightly different time offset so they don't blink in unison
        const localTime = timeSec + (index * 1.5);
        
        // 1. Calculate Intensity using the specific superposition formula:
        // I(t) = I_base + I_variance * ( a*sin(w1*t) + b*sin(w2*t) + c*Noise(t) )
        const flutter = 
            (0.4 * Math.sin(localTime * 2.1)) +   // Slow breath
            (0.3 * Math.sin(localTime * 3.7)) +  // Mid breath
            (0.3 * pseudoNoise);                 // Sharp stutter
            
        torch.intensity = params.torchIntensity + (intensityVariance * flutter);
        
        // 2. Spatial Jitter (Makes the cast shadows dance on the walls)
        // We only jitter X and Z slightly, as the flame stays mostly anchored
        const startX = torch.userData.startX || torch.position.x;
        const startZ = torch.userData.startZ || torch.position.z;
        
        // Save the starting positions the first time this runs
        if (!torch.userData.startX) {
            torch.userData.startX = startX;
            torch.userData.startZ = startZ;
        }

        torch.position.x = startX + (Math.sin(localTime * 15.0) * 0.02);
        torch.position.z = startZ + (Math.cos(localTime * 17.0) * 0.02);
    });
    // --------------------------------------------------------

    renderer.render(scene, camera);
    TWEEN.update();
    tickFps(now);
    
}

animate();