import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js'; 

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    45, 
    window.innerWidth / window.innerHeight, 
    0.1, 
    1000 
);

camera.position.set(0, 10, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.localClippingEnabled = true;
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 0.1; 

controls.target.set(0, -2.5, 0);
controls.update(); 

controls.addEventListener('end', () => {
    console.log(`Camera Position: camera.position.set(${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)});`);
    console.log(`Controls Target: controls.target.set(${controls.target.x.toFixed(2)}, ${controls.target.y.toFixed(2)}, ${controls.target.z.toFixed(2)});`);
    console.log('---');
});

//Basic Lighting (To see the model)
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);

const roofCutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), -1.5);

const mtlLoader = new MTLLoader();

// Load the materials first
mtlLoader.load(
    './model.mtl', 
    (materials) => {
        materials.preload(); 
        
        const objLoader = new OBJLoader();
        objLoader.setMaterials(materials); 

        objLoader.load(
            './model.obj',
            (obj) => {
                obj.traverse((child) => {
                    if (child.isMesh) {
    child.material.clippingPlanes = [roofCutPlane];
    child.material.clipShadows = true;
    child.material.side = THREE.DoubleSide; 
    child.material.wireframe = true; // Turns the cave into an x-ray hologram!
}
                });

                scene.add(obj);
                
                console.log("Cave .obj, .mtl, and textures loaded successfully.");
            },
            (xhr) => console.log((xhr.loaded / xhr.total * 100) + '% loaded OBJ'),
            (error) => console.error("Error loading OBJ:", error)
        );
    },
    (xhr) => console.log((xhr.loaded / xhr.total * 100) + '% loaded MTL'),
    (error) => console.error("Error loading MTL:", error)
);

// ==========================================
// PHASE 4: RIVER NAVIGATION SPLINE
// ==========================================

// 1. Define the "breadcrumbs" (control points)
const riverPoints = [
    new THREE.Vector3(2.0, 1, 2.5),  // Far left
    new THREE.Vector3(-2.0, 1, 2.5),  
    new THREE.Vector3( 0.0, 1, 2.5),  // Dead center of the red scribble
    new THREE.Vector3( 2.0, 1, 2.5),  
    new THREE.Vector3( 4.0, 1, 2.5)   // Far right
];

// 2. Create the smooth mathematical curve
const riverCurve = new THREE.CatmullRomCurve3(riverPoints);

// 3. Make the invisible math visible for debugging!
// (Draws a glowing cyan tube around the path)
const pathGeometry = new THREE.TubeGeometry(riverCurve, 64, 0.05, 8, false);
const pathMaterial = new THREE.MeshBasicMaterial({ color: 0x00ffff, wireframe: false });
const visiblePath = new THREE.Mesh(pathGeometry, pathMaterial);
scene.add(visiblePath);

// ==========================================





window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

//The Render Loop
function animate() {
    requestAnimationFrame(animate); 
    
    controls.update(); 
    
    renderer.render(scene, camera);
}

// Start the loop
animate();