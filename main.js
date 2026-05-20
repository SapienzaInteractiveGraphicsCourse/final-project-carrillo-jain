import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { FlyControls } from 'three/addons/controls/FlyControls.js';

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.position.set(1.64, -0.78, -0.32);

const renderer = new THREE.WebGLRenderer({ antialias: true, stencil: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.localClippingEnabled = true;
document.body.appendChild(renderer.domElement);


const controls = new FlyControls(camera, renderer.domElement);

controls.movementSpeed = 5.0; 
controls.rollSpeed = Math.PI / 6; 
controls.autoForward = false;
controls.dragToLook = true;

const clock = new THREE.Clock();


controls.addEventListener('end', () => {
    console.log(`Camera Position: camera.position.set(${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)});`);
    console.log(`Controls Target: controls.target.set(${controls.target.x.toFixed(2)}, ${controls.target.y.toFixed(2)}, ${controls.target.z.toFixed(2)});`);
    console.log('---');
});


const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
directionalLight.position.set(5, 10, 5);
scene.add(directionalLight);


const roofCutPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), -1.5);

const capGeometry = new THREE.PlaneGeometry(2000, 2000);

const capMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b5f52,
    roughness: 0.9,
    metalness: 0.05,

    stencilWrite:    true,
    stencilRef:      0,
    stencilFunc:     THREE.NotEqualStencilFunc,  
    stencilFail:     THREE.KeepStencilOp,
    stencilZFail:    THREE.KeepStencilOp,
    stencilZPass:    THREE.ReplaceStencilOp,    

    clippingPlanes: [roofCutPlane],
    clipShadows:    true,

    side: THREE.DoubleSide,
});

const capMesh = new THREE.Mesh(capGeometry, capMaterial);
capMesh.renderOrder = 2;  
scene.add(capMesh);


/**
 * 
 *
 * @param {THREE.Mesh} sourceMesh       - The original cave mesh child.
 * @param {THREE.Side} side             - THREE.FrontSide or THREE.BackSide.
 * @param {THREE.StencilOp} depthPassOp - Stencil op applied on depth-test pass.
 * @param {number} renderOrder          - Draw order within the scene.
 * @returns {THREE.Mesh}
 */

function makeStencilPass(sourceMesh, side, depthPassOp, renderOrder) {
    const mat = new THREE.MeshBasicMaterial({
        side: side,

        colorWrite: false,
        depthWrite: false,

        depthTest: true,

        clippingPlanes: [roofCutPlane],
        clipShadows:    true,

        stencilWrite: true,
        stencilRef:   1,
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

const mtlLoader = new MTLLoader();

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
                    if (!child.isMesh) return;

                    child.material.clippingPlanes = [roofCutPlane];
                    child.material.clipShadows    = true;
                    child.material.side           = THREE.DoubleSide;

                });

                obj.updateMatrixWorld(true);

                const stencilPassGroup = new THREE.Group();

                obj.traverse((child) => {
                    if (!child.isMesh) return;

                    const backPass = makeStencilPass(
                        child,
                        THREE.BackSide,
                        THREE.IncrementWrapStencilOp,
                        0   
                    );

                    const frontPass = makeStencilPass(
                        child,
                        THREE.FrontSide,
                        THREE.DecrementWrapStencilOp,
                        1
                    );

                    stencilPassGroup.add(backPass, frontPass);
                });


                scene.add(obj);
                scene.add(stencilPassGroup);

                console.log('Cave model loaded. Stencil cap passes created:', stencilPassGroup.children.length);
            },
            (xhr) => console.log((xhr.loaded / xhr.total * 100).toFixed(1) + '% loaded OBJ'),
            (error) => console.error('Error loading OBJ:', error)
        );
    },
    (xhr) => console.log((xhr.loaded / xhr.total * 100).toFixed(1) + '% loaded MTL'),
    (error) => console.error('Error loading MTL:', error)
);


window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});


const _capTarget = new THREE.Vector3(); 


function animate() {
    requestAnimationFrame(animate);

    const delta = clock.getDelta();
    controls.update(delta);

    roofCutPlane.coplanarPoint(capMesh.position);
    _capTarget.copy(capMesh.position).sub(roofCutPlane.normal);
    capMesh.lookAt(_capTarget);

    renderer.render(scene, camera);
}

animate();