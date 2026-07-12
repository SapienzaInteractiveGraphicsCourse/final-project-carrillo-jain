# 🌙 Moonlit Cave Diorama 🦇

![Boat drifting toward the moonlit cave opening](report_media/Opening_boat_moon+.gif)

An interactive real-time WebGL scene built with **[Three.js](https://threejs.org/)** for the
Interactive Graphics course. A small rowboat, rowed by a captain, drifts across open moonlit water and into a cave.
Torches flicker on the walls, a colony of bats scatters when the boat draws
near, fireflies wander through the dark, and the water reflects the moon in a shimmering glade. You
explore the whole scene with a free-flying first-person camera.

## 🔗 Live links (GitHub Pages)

- **🌙 Interactive scene:** <https://sapienzainteractivegraphicscourse.github.io/final-project-carrillo-jain/>
- **📖 Project report:** <https://sapienzainteractivegraphicscourse.github.io/final-project-carrillo-jain/report.html>

*Note: the 3D models take a few moments to load in after the page opens.*

## 📖 Project report

**[Open the interactive report → `report.html`](report.html)** — the full illustrated write-up of
every system (water shader, stencil diorama cut, IK captain, bat colony, …) with animated GIF
figures and diagrams. It doubles as the presentation: press **P** inside it for slide mode.
Open it while the local server is running (e.g. <http://localhost:8000/report.html>), or just
double-click the file — it also works from disk.
All animated figures live in [`report_media/`](report_media/).

---

## ✨ Features

- **Custom water shader** — summed sine waves displacing the surface, a deep-to-shallow colour
  gradient, Fresnel reflection, torch-light speculars, a specular **moon reflection glade**, 
  a depth-buffer effect that increases the water's opacity where it meets the rocks, and an underwater screen effect when the camera dips below the surface.
- **Boat wake & oar ripples** — the moving hull carves a Kelvin-style V wake into the water, and
  each oar stroke that dips below the surface spawns an expanding ring ripple.
- **Rigged rowing captain** — a skeletal character whose arms follow the oars using **two-bone
  inverse kinematics (IK)**, with a hand-posed seated position. The rowing motion is driven
  entirely in code.
- **Animated bat colony** — 350 boid-style bats that roost, then flee up out of the cave mouth when
  the boat approaches and later return. Uses level-of-detail (LOD) update-skipping for performance.
- **Boat encounter state machine** — the boat cruises, freezes when it disturbs the bats, panics and
  reverses, waits for the bats and captain to settle, then resumes cruising.
- **Wall torches with shader flames** — animated GLSL flame quads driving flickering point lights,
  auto-mounted onto the cave walls by raycasting.
- **Fireflies** — GPU point-sprite particles that wander and pulse.
- **Volumetric edge fog** — layered noise-based fog "banks" at the cave mouth that turn to face the
  camera.
- **Moon & moonlight** — a textured moon with a glowing halo and a directional moonlight, all
  adjustable live.
- **Stencil-buffer diorama cut** — the cave roof is clipped so you see a clean cross-section from
  outside, capped with the stencil buffer.
- **Live tuning GUI** — a `lil-gui` panel (press **H**) to tweak water, flames, boat, bats, moon and
  more in real time.

---

## 🎮 Controls

| Key / Input      | Action                         |
| ---------------- | ------------------------------ |
| **Click**        | Start / lock the mouse         |
| **W A S D**      | Move                           |
| **Space**        | Move up                        |
| **Shift**        | Move down                      |
| **Ctrl**         | Speed boost                    |
| **Mouse**        | Look around                    |
| **Mouse wheel**  | Fine-tune fly speed            |
| **H**            | Toggle the stats HUD + tuning GUI |
| **Esc**          | Release the mouse              |

---

## 🛠️ Graphics techniques used

The graphics techniques applied in this project:

- Custom **GLSL vertex + fragment shaders** for water, torch flames, fireflies and edge fog.
- **Wave displacement** on the water with analytically derived normals for correct lighting.
- **Depth-texture opacity boost**: the scene depth is rendered to a render target, then compared against the water depth to increase opacity where the water meets solid geometry.
- **Fresnel** reflectance and a specular **moon-glade** reflection built from the same wave normals.
- **Skeletal animation** and **two-bone inverse kinematics** for the captain's arms on the oars.
- **Boid-style flocking** with steering behaviours plus **LOD** frame-skipping for the bat colony.
- **Stencil-buffer capping** to cleanly close the clipped cave cross-section (diorama effect).
- **Clipping planes** to cut the cave roof and entrance.
- **Shadow mapping** with a limited number of active shadow-casting torches for performance.
- **Custom Z-up fly camera** with pointer-lock mouse look.

---

## 📁 Project structure

```
Interactive_Graphics_Project/
├── index.html      # Entry point + Three.js CDN import map
├── main.js         # All scene setup, shaders, animation & logic
├── models/         # 3D assets (cave, boat, captain, bats, torch, textures)
├── report.html     # Interactive project report + presentation (press P)
└── report_media/   # GIFs & stills captured from the live scene
```

---

## 📦 Credits & attribution

- **[Three.js](https://threejs.org/)** r0.160 — 3D engine and loaders (loaded from the unpkg CDN).
- **3D models** (geometry & textures) are downloaded assets:
  - **[Captain](https://sketchfab.com/3d-models/captain-clark-rigged-fixed-dfe9529c43d8479ea1c0b5adac7d3348)**
  - **[Torch](https://sketchfab.com/3d-models/old-torch-with-wall-mounting-8ce10da00f3f49bf98a01664bc21da1c)**
  - **[Boat](https://sketchfab.com/3d-models/old-rowboat-9922d5678af84adeb1c9b479856446ca)**
  - **[Cave](https://www.fab.com/listings/a8683901-ef0b-4bd0-bd51-3e44647212e2)**
  - **[Bat](https://sketchfab.com/3d-models/vampire-bat-806dcba0959944f880272512b841a019)**
- **All animation, interactivity and shaders are our own code** — none of it was imported with the
  models. This includes the coded rowing motion and inverse-kinematics arms, the bat flocking and
  flee/return behaviour, the water simulation (waves, wake, oar ripples, shoreline opacity blending, moon reflection), the
  torch flames, fireflies and edge fog. AI coding assistance was used while writing this code.

---

## 👥 Authors

Christian Carrillo - 2017626, Akshata Jain - 2263069



