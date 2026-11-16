import * as THREE from 'three';

export class Effects {
  constructor(scene) {
    this.scene = scene; this.flash = 0; this.cursor = 0;
    this.overlay = document.getElementById('flash-overlay');
    this.lights = []; this.tracers = []; this.particles = []; this.decals = [];
    const sparkGeometry = new THREE.SphereGeometry(0.035, 4, 3);
    const decalGeometry = new THREE.SphereGeometry(0.055, 5, 3);
    for (let i = 0; i < 8; i++) {
      const light = new THREE.PointLight(0xffd9a1, 0, 5, 2); scene.add(light);
      this.lights.push({ object: light, life: 0 });
    }
    for (let i = 0; i < 64; i++) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      const object = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xffe2a8, transparent: true }));
      object.visible = false; object.frustumCulled = false; scene.add(object);
      this.tracers.push({ object, life: 0 });
    }
    for (let i = 0; i < 160; i++) {
      const object = new THREE.Mesh(sparkGeometry, new THREE.MeshBasicMaterial({ color: 0xffb75b, transparent: true }));
      object.visible = false; scene.add(object);
      this.particles.push({ object, life: 0, max: 1, velocity: new THREE.Vector3() });
    }
    for (let i = 0; i < 64; i++) {
      const object = new THREE.Mesh(decalGeometry, new THREE.MeshBasicMaterial({ color: 0x342f2a }));
      object.visible = false; scene.add(object); this.decals.push({ object, life: 0 });
    }
    this.tracerIndex = this.particleIndex = this.decalIndex = this.lightIndex = 0;
  }
  muzzle(position) {
    const p = this.lights[this.lightIndex++ % this.lights.length];
    p.object.position.copy(position); p.object.intensity = 7; p.life = 0.04;
  }
  tracer(from, to) {
    const p = this.tracers[this.tracerIndex++ % this.tracers.length], a = p.object.geometry.attributes.position;
    a.setXYZ(0, from.x, from.y, from.z); a.setXYZ(1, to.x, to.y, to.z); a.needsUpdate = true;
    p.object.visible = true; p.object.material.opacity = 1; p.life = 0.065;
  }
  burst(position, blood) {
    for (let i = 0; i < (blood ? 8 : 4); i++) {
      const p = this.particles[this.particleIndex++ % this.particles.length];
      p.life = p.max = blood ? 0.38 : 0.2;
      p.object.position.copy(position); p.object.visible = true; p.object.scale.setScalar(blood ? 1.8 : 1);
      p.object.material.color.setHex(blood ? 0x9b2020 : 0xffc46b); p.object.material.opacity = 1;
      p.velocity.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3);
    }
  }
  impact(position) {
    this.burst(position, false);
    const p = this.decals[this.decalIndex++ % this.decals.length];
    p.object.position.copy(position); p.object.visible = true; p.life = 16;
  }
  bloodPuff(position) { this.burst(position, true); }
  flashbang(seconds = 1) { this.flash = Math.max(this.flash, seconds); }
  update(dt) {
    for (const p of this.lights) if (p.life > 0) { p.life -= dt; if (p.life <= 0) p.object.intensity = 0; }
    for (const p of this.tracers) if (p.life > 0) { p.life -= dt; p.object.material.opacity = Math.max(0, p.life / 0.065); p.object.visible = p.life > 0; }
    for (const p of this.particles) if (p.life > 0) {
      p.life -= dt; p.velocity.y -= 5 * dt; p.object.position.addScaledVector(p.velocity, dt);
      p.object.material.opacity = Math.max(0, p.life / p.max); p.object.visible = p.life > 0;
    }
    for (const p of this.decals) if (p.life > 0) { p.life -= dt; p.object.visible = p.life > 0; }
    this.flash = Math.max(0, this.flash - dt);
    if (this.overlay) this.overlay.style.opacity = String(Math.min(1, this.flash));
  }
}
