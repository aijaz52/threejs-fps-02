import * as THREE from 'three';
import { CONFIG } from './config.js';
import { CombatRay } from './spatial.js';

export class WeaponSystem {
  constructor({ player, world, config = CONFIG, effects, rounds = null, audio = null, input = null }) {
    Object.assign(this, { player, world, config, effects, rounds, audio, input });
    this.loadout = { primary: null, secondary: 'raven', knife: 'knife', grenades: [], armor: player.armor };
    this.currentSlot = 'secondary'; this.ammo = {};
    for (const id in config.weapons) {
      const w = config.weapons[id]; this.ammo[id] = { mag: w.mag || 0, reserve: w.reserve || 0 };
    }
    this.cooldown = 0; this.reloadTime = 0; this.reloadWeapon = null; this.bloom = 0;
    this.kickPitch = 0; this.kickYaw = 0;
    this.axes = ['x', 'y', 'z'];
    this.ray = new CombatRay(world); this.origin = new THREE.Vector3(); this.direction = new THREE.Vector3();
    this.end = new THREE.Vector3(); this.forward = new THREE.Vector3(); this.delta = new THREE.Vector3();
    this.grenades = []; const geometry = new THREE.SphereGeometry(0.09, 6, 4);
    for (let i = 0; i < 12; i++) {
      const mesh = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0xb5b9a4 }));
      mesh.visible = false; effects.scene.add(mesh);
      this.grenades.push({ mesh, velocity: new THREE.Vector3(), life: 0 });
    }
    this.view = new THREE.Group(); this.view.name = 'Crosstown/viewmodel';
    this.viewKick = this.viewFlash = this.bobTime = 0;
    const box = new THREE.BoxGeometry(1, 1, 1), palette = config.palette;
    const part = (color, x, y, z, w, h, d) => {
      const mesh = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color, depthTest: false, depthWrite: false }));
      mesh.position.set(x, y, z); mesh.scale.set(w, h, d); mesh.renderOrder = 20;
      this.view.add(mesh); return mesh;
    };
    this.receiver = part(palette.darkCrate, 0, 0, 0, .14, .13, .34);
    this.barrel = part(palette.trim, 0, .025, -.25, .065, .065, .22);
    this.muzzle = part(palette.trim, 0, .025, -.37, .09, .085, .035);
    this.grip = part(palette.crate, 0, -.12, .08, .09, .21, .12);
    this.sight = part(palette.siteB, 0, .09, -.06, .035, .045, .06);
    this.blade = part(palette.plaster, 0, .015, -.22, .045, .09, .43);
    this.flare = part(0xffdf8a, 0, .025, -.41, .14, .14, .07);
    this.flare.visible = false; player.camera.add(this.view); effects.scene.add(player.camera);
    player.weaponSystem = this; this.sync();
  }
  get current() { return this.loadout[this.currentSlot]; }
  sync() {
    const state = this.ammo[this.current]; this.player.weapon = this.current;
    this.player.mag = state.mag; this.player.reserve = state.reserve; this.loadout.armor = this.player.armor;
    const knife = this.current === 'knife', rifle = this.currentSlot === 'primary';
    this.receiver.visible = this.barrel.visible = this.muzzle.visible = this.sight.visible = !knife;
    this.blade.visible = knife; this.receiver.scale.z = rifle ? .48 : .34;
    this.view.scale.setScalar(rifle ? 1.08 : 1);
  }
  reset() {
    if (!this.player.alive) { this.loadout.primary = null; this.loadout.grenades.length = 0; }
    for (const id in this.ammo) { const w = this.config.weapons[id]; this.ammo[id].mag = w.mag || 0; this.ammo[id].reserve = w.reserve || 0; }
    this.currentSlot = this.loadout.primary ? 'primary' : 'secondary';
    this.reloadWeapon = null;
    this.viewKick = this.viewFlash = this.bobTime = 0;
    this.reloadTime = this.cooldown = this.bloom = this.kickPitch = this.kickYaw = 0; this.sync();
    for (const g of this.grenades) { g.life = 0; g.mesh.visible = false; }
  }
  purchase(id) {
    if (this.config.grenades[id]) { this.loadout.grenades.push(id); return; }
    const w = this.config.weapons[id];
    if (!w) return;
    const slot = id === 'knife' ? 'knife' : id === 'raven' ? 'secondary' : 'primary';
    this.loadout[slot] = id; this.ammo[id].mag = w.mag || 0; this.ammo[id].reserve = w.reserve || 0;
    this.select(slot);
  }
  select(slot) {
    if (!this.loadout[slot] || slot === 'grenades' || slot === 'armor') return;
    this.currentSlot = slot; this.reloadTime = 0; this.reloadWeapon = null; this.sync();
  }
  reload() {
    const w = this.config.weapons[this.current], a = this.ammo[this.current];
    if (this.reloadTime || w.melee || a.mag >= w.mag || !a.reserve || this.rounds?.phase !== 'live') return;
    this.reloadTime = w.reloadTime || 1.8; this.reloadWeapon = this.current; this.audio?.reload();
  }
  damage(target, amount, head, shooter = this.player) {
    if (target.team === shooter.team) return;
    this.rounds?.damage(target, amount * (head ? this.config.headshotMultiplier : 1), shooter, shooter.weapon, head);
  }
  shootActor(actor, id, origin, direction, extraSpread = 0) {
    const w = this.config.weapons[id], speed = Math.hypot(actor.velocity.x, actor.velocity.z);
    const spread = w.spread * (actor.grounded === false ? 5 : speed > 0.5 ? 2.8 : actor.crouching ? 0.45 : 0.7) + extraSpread;
    for (let i = 0; i < (w.pellets || 1); i++) {
      this.direction.copy(direction); this.direction.x += (Math.random() - 0.5) * spread;
      this.direction.y += (Math.random() - 0.5) * spread; this.direction.z += (Math.random() - 0.5) * spread;
      this.direction.normalize();
      const hit = this.ray.cast(origin, this.direction, 115, this.rounds.players, actor);
      this.effects.tracer(origin, hit.point);
      if (hit.target) {
        const head = hit.point.y > hit.target.position.y + hit.target.eyeHeight;
        this.damage(hit.target, w.dmg, head, actor); this.effects.bloodPuff(hit.point);
      } else if (hit.blocked) this.effects.impact(hit.point);
    }
    this.effects.muzzle(origin);
    this.audio?.gunshot(id, actor.position.distanceTo(this.player.position));
    this.bots?.hear(origin, actor);
  }
  fire() {
    if (this.rounds?.phase !== 'live' || !this.player.alive || this.rounds.interaction?.player === this.player
      || this.reloadTime > 0 || this.cooldown > 0) return false;
    const w = this.config.weapons[this.current], a = this.ammo[this.current];
    if (w.melee) return this.knife();
    if (!a.mag) { this.reload(); return false; }
    this.cooldown = 60 / w.rpm; a.mag--;
    this.viewKick = 1; this.viewFlash = .045;
    this.origin.copy(this.player.camera.position); this.forward.set(0, 0, -1).applyEuler(this.player.camera.rotation);
    this.shootActor(this.player, this.current, this.origin, this.forward, this.bloom);
    this.bloom = Math.min(0.045, this.bloom + w.spread * 0.45);
    const pitch = Math.min(w.recoil, 1.54 - this.player.pitch), yaw = (Math.random() - 0.5) * w.recoil;
    this.player.pitch += pitch; this.player.yaw += yaw; this.kickPitch += pitch; this.kickYaw += yaw;
    this.sync(); return true;
  }
  knife() {
    this.cooldown = 0.6;
    this.viewKick = 1;
    this.origin.copy(this.player.camera.position); this.forward.set(0, 0, -1).applyEuler(this.player.camera.rotation);
    const hit = this.ray.cast(this.origin, this.forward, 2.2, this.rounds.players, this.player);
    if (hit.target) { this.damage(hit.target, this.config.weapons.knife.dmg, false); this.effects.bloodPuff(hit.point); }
    else if (hit.blocked) this.effects.impact(hit.point);
    return true;
  }
  throwGrenade() {
    if (this.rounds?.phase !== 'live' || !this.player.alive || this.rounds.interaction?.player === this.player
      || !this.loadout.grenades.length) return;
    let g = null; for (const item of this.grenades) if (item.life <= 0) { g = item; break; }
    if (!g) return;
    this.loadout.grenades.pop(); this.player.grenades.flashbang = this.loadout.grenades.length;
    g.life = 1.8; g.mesh.visible = true; g.mesh.position.copy(this.player.camera.position);
    g.velocity.set(0, 0, -1).applyEuler(this.player.camera.rotation).multiplyScalar(14); g.velocity.y += 4;
  }
  detonate(position) {
    for (const p of this.rounds.players) {
      if (!p.alive) continue;
      this.origin.copy(p.position); this.origin.y += p.eyeHeight;
      this.delta.subVectors(position, this.origin); const distance = this.delta.length();
      if (distance > 24) continue;
      this.delta.normalize();
      const hit = this.ray.cast(this.origin, this.delta, distance);
      if (hit.blocked) continue;
      this.forward.set(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
      if (this.forward.dot(this.delta) < 0.25) continue;
      const duration = 3.5 * (1 - distance / 24);
      p.blinded = Math.max(p.blinded || 0, duration);
      if (p === this.player) { this.effects.flashbang(duration); this.audio?.flashbang(); }
    }
  }
  update(dt) {
    this.cooldown = Math.max(0, this.cooldown - dt); this.bloom = Math.max(0, this.bloom - dt * 0.055);
    const recovery = 1 - Math.exp(-9 * dt), pitch = this.kickPitch * recovery, yaw = this.kickYaw * recovery;
    this.player.pitch = THREE.MathUtils.clamp(this.player.pitch - pitch, -1.54, 1.54); this.player.yaw -= yaw;
    this.kickPitch -= pitch; this.kickYaw -= yaw;
    if (this.reloadTime > 0 && (this.reloadTime -= dt) <= 0) {
      const a = this.ammo[this.reloadWeapon], w = this.config.weapons[this.reloadWeapon];
      const n = Math.min(w.mag - a.mag, a.reserve); a.mag += n; a.reserve -= n; this.sync();
    }
    const reloadPressed = this.input?.consumePress('KeyR'), grenadePressed = this.input?.consumePress('KeyG');
    if (this.input?.locked && this.rounds?.phase === 'live' && this.player.alive) {
      if (this.input.isMouseDown(0)) this.fire();
      if (reloadPressed) this.reload();
      if (grenadePressed) this.throwGrenade();
    }
    for (const g of this.grenades) if (g.life > 0) {
      g.life -= dt; g.velocity.y -= this.config.gravity * dt;
      const distance = g.velocity.length() * dt;
      this.direction.copy(g.velocity).normalize();
      const hit = this.ray.cast(g.mesh.position, this.direction, distance + 0.09);
      if (hit.blocked) {
        this.end.copy(hit.point).addScaledVector(this.direction, -0.1);
        this.delta.copy(this.end).addScaledVector(this.direction, 0.15);
        // Find the closest collider face to reflect the incoming velocity.
        let axis = 'y', gap = Infinity;
        for (const c of this.world.colliders) {
          if (this.delta.x < c.min.x - .2 || this.delta.x > c.max.x + .2 || this.delta.y < c.min.y - .2 || this.delta.y > c.max.y + .2 || this.delta.z < c.min.z - .2 || this.delta.z > c.max.z + .2) continue;
          for (const a of this.axes) {
            const d = Math.min(Math.abs(hit.point[a] - c.min[a]), Math.abs(hit.point[a] - c.max[a]));
            if (d < gap) { gap = d; axis = a; }
          }
        }
        g.mesh.position.copy(this.end); g.velocity[axis] *= -0.5; g.velocity.multiplyScalar(0.75);
      } else g.mesh.position.addScaledVector(g.velocity, dt);
      if (g.life <= 0) { g.mesh.visible = false; this.detonate(g.mesh.position); }
    }
    this.viewKick = Math.max(0, this.viewKick - dt * 8); this.viewFlash = Math.max(0, this.viewFlash - dt);
    const speed = this.player.grounded ? Math.min(1, Math.hypot(this.player.velocity.x, this.player.velocity.z) / 6) : 0;
    this.bobTime += dt * (4 + speed * 7);
    const dip = this.reloadTime > 0 ? Math.sin(Math.PI * Math.min(1, this.reloadTime / (this.config.weapons[this.current].reloadTime || 1.8))) : 0;
    this.view.position.set(.26 + Math.sin(this.bobTime) * .012 * speed, -.22 + Math.cos(this.bobTime * 2) * .009 * speed - dip * .22, -.52 + this.viewKick * .065);
    this.view.rotation.set(this.viewKick * .13 - dip * .6, 0, -.06 + dip * .3);
    this.view.visible = this.player.alive; this.flare.visible = this.viewFlash > 0 && this.current !== 'knife';
    this.loadout.armor = this.player.armor; this.player.updateCamera();
  }
}
