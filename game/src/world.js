import * as THREE from 'three';
import { CONFIG } from './config.js';

export function buildWorld(scene) {
  const colliders = [], solids = [];
  const p = CONFIG.palette;
  let serial = 0;
  const box = (name, x, y, z, w, h, d, color, solid = true) => {
    // Per-vertex variation keeps long concrete surfaces from reading as one flat sheet.
    const tint = new THREE.Color(color).offsetHSL(((serial % 5) - 2) * 0.003, 0, ((serial % 9) - 4) * 0.006);
    const geometry = new THREE.BoxGeometry(w, h, d), colors = [];
    for (let i = 0; i < geometry.attributes.position.count; i++) {
      const shade = 0.93 + ((i + serial * 3) % 7) * 0.012;
      colors.push(tint.r * shade, tint.g * shade, tint.b * shade);
    }
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ vertexColors: true }));
    mesh.name = `Crosstown/${name}-${serial++}`;
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    mesh.castShadow = solid;
    scene.add(mesh);
    if (solid) {
      solids.push(mesh);
      colliders.push({
        min: new THREE.Vector3(x - w / 2, y - h / 2, z - d / 2),
        max: new THREE.Vector3(x + w / 2, y + h / 2, z + d / 2),
      });
    }
    return mesh;
  };
  scene.background = new THREE.Color(p.sky);
  scene.fog = new THREE.Fog(p.fog, 40, 115);
  scene.add(new THREE.HemisphereLight(0xfff1d4, 0x70604f, 2.1));
  const sun = new THREE.DirectionalLight(0xffe0b0, 2.5);
  sun.position.set(-25, 45, 20);
  scene.add(sun);
  box('foundation', 0, -0.5, 0, 110, 1, 90, p.ground);
  box('west-boundary', -54.5, 4, 0, 1, 8, 90, p.concrete);
  box('east-boundary', 54.5, 4, 0, 1, 8, 90, p.concrete);
  box('north-boundary', 0, 4, -44.5, 108, 8, 1, p.plaster);
  box('south-boundary', 0, 4, 44.5, 108, 8, 1, p.plaster);
  // Three routes: a long mid street plus A and B side lanes. Repeated blocks leave connector crossings.
  for (const x of [-24, 24]) for (const z of [-33, -12, 12, 33]) {
    const depth = Math.abs(z) === 33 ? 11 : 12;
    box('street-block', x, 3.5, z, 17, 7, depth, p.concrete);
    box('parapet', x, 7.15, z, 17.5, 0.3, depth + 0.5, p.trim);
    box('terracotta-band', x, 2.65, z, 17.1, 0.35, depth + 0.12, p.brick);
    // Recessed facade accents; traversable doors and firing slits sit in connector screens below.
    box('window-slit', x - 4.8, 4.5, z - depth / 2 - .03, 2.2, .7, .12, p.darkCrate, false);
    box('window-slit', x + 4.8, 4.5, z + depth / 2 + .03, 2.2, .7, .12, p.darkCrate, false);
    box('doorway', x, 1.5, z - depth / 2 - .05, 2.8, 3, .16, p.trim, false);
  }
  // Freestanding screens have real openings: no invisible wall behind a door or slit.
  for (const x of [-38, 38]) {
    const z = x < 0 ? -23 : 23;
    box('door-left', x - 3, 2, z, 3, 4, .7, p.plaster);
    box('door-right', x + 3, 2, z, 3, 4, .7, p.plaster);
    box('door-lintel', x, 3.5, z, 3, 1, .7, p.brick);
    box('slit-sill', x + 8, .65, z, 5, 1.3, .7, p.concrete);
    box('slit-header', x + 8, 3, z, 5, 2, .7, p.concrete);
    box('wall-base', x - 3, .15, z - .38, 3, .3, .06, p.trim);
  }
  for (const [x, z, w, h, d] of [[-9, -7, 3, 2.4, 2], [10, 19, 3, 2, 3], [-48, 8, 3, 2.2, 4], [47, -9, 4, 1.3, 2]]) {
    box('asymmetric-crate', x, h / 2, z, w, h, d, p.crate);
    box('contact-shadow', x, .012, z, w + .6, .024, d + .6, 0x403b3e, false);
  }
  for (const z of [-22, 0, 22]) {
    box('mid-crossing', 0, .7, z, 8, 1.4, 2.2, p.sandstone);
    box('crossing-shadow', 0, .03, z, 10, .04, 3.4, p.trim, false);
  }
  for (const sign of [-1, 1]) {
    box('spawn-cover', sign * 7, 1, sign * 39, 3, 2, 2, p.sandstone);
    box('mid-barricade', sign * 3, 0.6, sign * 13, 3, 1.2, 1.4, p.concrete);
    for (const x of [-43, 43]) {
      box('lane-crate', x, 1.1, sign * 17, 3, 2.2, 3, p.crate);
      box('lane-low-wall', x - sign * 3, 0.55, sign * 5, 5, 1.1, 1, p.brick);
      box('site-cover', x + sign * 2, 1.2, sign * 31, 2.5, 2.4, 3, p.darkCrate);
      // Overlapping boxes form a climbable staircase to an elevated platform.
      for (let step = 0; step < 4; step++) {
        const height = (step + 1) * 0.32;
        box('stack-step', x - sign * 4, height / 2, sign * (25 + step * 0.7), 2, height, 0.8, p.sandstone);
      }
      box('stack-platform', x - sign * 4, 0.64, sign * 28.5, 3, 1.28, 2, p.crate);
      box('crate-shadow', x - sign * 4, .015, sign * 28.5, 3.5, .03, 2.5, 0x2d292a, false);
    }
  }
  const spawnA = new THREE.Vector3(0, 0, 39);
  const spawnB = new THREE.Vector3(0, 0, -39);
  const bombsiteA = new THREE.Vector3(-43, 0, 35);
  const bombsiteB = new THREE.Vector3(43, 0, 35);
  for (const [label, site, color] of [['A', bombsiteA, p.siteA], ['B', bombsiteB, p.siteB]]) {
    box(`site-${label}`, site.x, 0.012, site.z, 9, 0.024, 9, color, false);
    for (const offset of [-4.5, 4.5]) {
      box('site-marking', site.x + offset, 0.03, site.z, 0.12, 0.02, 9, p.plaster, false);
      box('site-marking', site.x, 0.03, site.z + offset, 9, 0.02, 0.12, p.plaster, false);
    }
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = '#fff3d8'; context.font = 'bold 104px sans-serif';
    context.textAlign = 'center'; context.textBaseline = 'middle'; context.fillText(label, 64, 68);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const marking = new THREE.Mesh(new THREE.PlaneGeometry(3.5, 3.5),
      new THREE.MeshLambertMaterial({ map: texture, transparent: true, depthWrite: false }));
    marking.name = `Crosstown/site-label-${label}`;
    marking.rotation.x = -Math.PI / 2; marking.position.set(site.x, .05, site.z);
    scene.add(marking);
  }
  return { colliders, spawnA, spawnB, bombsiteA, bombsiteB, solids };
}
