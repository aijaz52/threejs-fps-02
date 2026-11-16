import * as THREE from 'three';
import { CONFIG } from './config.js';
import { CombatRay, Navigation, blocked } from './spatial.js';

export class Bots {
  constructor({ scene, world, config = CONFIG, rounds }) {
    Object.assign(this, { scene, world, config, rounds });
    this.bots = []; this.nav = new Navigation(world, config.bounds); this.ray = new CombatRay(world);
    this.origin = new THREE.Vector3(); this.direction = new THREE.Vector3(); this.goal = new THREE.Vector3();
    this.weapons = null;
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    for (let side = 0; side < 2; side++) for (let i = 0; i < (side ? 5 : 4); i++) {
      const team = side ? config.teams.b : config.teams.a;
      const material = new THREE.MeshLambertMaterial({ color: side ? 0xc45b38 : 0x3d82d8 });
      const body = new THREE.Group(), torso = new THREE.Mesh(geometry, material);
      torso.scale.set(.58, .8, .36); torso.position.y = 1.05; body.add(torso);
      const head = new THREE.Mesh(geometry, new THREE.MeshLambertMaterial({ color: 0xbfa07e }));
      head.scale.set(.34, .34, .34); head.position.y = 1.63; body.add(head);
      for (let j = 0; j < 2; j++) {
        const leg = new THREE.Mesh(geometry, material);
        leg.scale.set(.23, .65, .3); leg.position.set(j ? .16 : -.16, .325, 0); body.add(leg);
      }
      const b = { id: `${team}-${i + 1}`, team, index: i, body, position: new THREE.Vector3(), velocity: new THREE.Vector3(),
        yaw: side ? Math.PI : 0, health: 100, armor: 0, alive: true, frozen: true, grounded: true, crouching: false,
        height: config.playerHeight, eyeHeight: config.eyeHeight, weapon: 'raven', mag: 13, reserve: 52,
        grenades: { flashbang: 0 }, blinded: 0, route: [], waypoint: 0, planTime: 0, cooldown: 0,
         reload: 0, reaction: .3, target: null, heard: new THREE.Vector3(), hearing: 0, posture: 0,
         strafe: Math.random() < .5 ? -1 : 1, strafeTime: 0, retreat: 0, jumpTime: 1 + Math.random() * 3,
         jumpVelocity: 0, burst: 0, cover: new THREE.Vector3(), coverTime: 0 };
      const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 64;
      b.tagContext = canvas.getContext('2d'); b.tagHealth = -1;
      b.tagTexture = new THREE.CanvasTexture(canvas); b.tagTexture.colorSpace = THREE.SRGBColorSpace;
      b.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: b.tagTexture, depthWrite: false }));
      b.tag.name = `Crosstown/tag-${b.id}`; b.tag.scale.set(2.6, .65, 1); body.add(b.tag);
      b.reset = (spawn) => this.reset(b, spawn); scene.add(body); this.bots.push(b); rounds.players.push(b);
      rounds.money.set(b.id, config.rounds.startMoney); b.reset(side ? world.spawnB : world.spawnA);
    }
    rounds.bomb.carrierId = this.bots.find((b) => b.team === config.teams.b).id;
    this.buy();
  }
  reset(b, spawn) {
    if (!b.alive) { b.weapon = 'raven'; b.armor = 0; }
    b.position.copy(spawn); b.position.x += (b.index - 2) * 1.2;
    b.position.z += b.team === this.config.teams.a ? -1.5 : 1.5;
    b.velocity.set(0, 0, 0); b.alive = true; b.health = 100; b.blinded = 0;
    b.yaw = b.team === this.config.teams.a ? 0 : Math.PI;
    b.cooldown = b.reload = b.planTime = b.hearing = 0; b.target = null; b.route.length = 0;
    b.jumpVelocity = b.burst = b.coverTime = 0; b.grounded = true;
    b.crouching = false; b.height = this.config.playerHeight; b.eyeHeight = this.config.eyeHeight;
    b.retreat = 0; b.reaction = .3;
    b.body.visible = true; b.body.position.copy(b.position);
  }
  buy() {
    for (const b of this.bots) {
      const money = this.rounds.money.get(b.id) || 0;
      const id = money >= 2700 ? 'talon' : money >= 1050 ? 'hornet' : 'raven';
      if (this.config.weapons[id].price > this.config.weapons[b.weapon].price) this.rounds.buy(b, id);
      if (b.armor < 50) this.rounds.buy(b, 'armor');
    }
  }
  hear(position, shooter) {
    for (const b of this.bots) if (b.alive && b !== shooter && b.position.distanceToSquared(position) < 900) {
      b.heard.copy(position); b.hearing = 2.5;
      if (!b.target) b.yaw = Math.atan2(b.position.x - position.x, b.position.z - position.z);
    }
  }
  sees(b, enemy) {
    this.origin.copy(b.position); this.origin.y += b.eyeHeight;
    this.direction.copy(enemy.position); this.direction.y += enemy.eyeHeight;
    this.direction.sub(this.origin); const distance = this.direction.length();
    if (distance > 48 || distance < .01) return false;
    this.direction.multiplyScalar(1 / distance);
    if (-Math.sin(b.yaw) * this.direction.x - Math.cos(b.yaw) * this.direction.z < .32) return false;
    return !this.ray.cast(this.origin, this.direction, distance).blocked;
  }
  objective(b) {
    const bomb = this.rounds.bomb;
    if (b.coverTime > 0 && !bomb.planted) return this.goal.copy(b.cover);
    if (bomb.planted) return this.goal.copy(bomb.position);
    if (b.team === this.config.teams.b) {
      if (!bomb.carrierId && bomb.position) return this.goal.copy(bomb.position);
      let carrier = null;
      for (const p of this.rounds.players) if (p.id === bomb.carrierId) { carrier = p; break; }
      if (carrier && carrier !== b && b.position.distanceToSquared(carrier.position) > 64) return this.goal.copy(carrier.position);
      return this.goal.copy(this.rounds.round % 2 ? this.world.bombsiteA : this.world.bombsiteB);
    }
    this.goal.copy(b.index < 2 ? this.world.bombsiteA : this.world.bombsiteB);
    this.goal.z -= 7; this.goal.x += b.index % 2 ? 1 : -1;
    if (b.hearing > 0) this.goal.copy(b.heard);
    return this.goal;
  }
  move(b, dt) {
    const goal = this.objective(b);
    if (b.planTime <= 0 && (b.waypoint >= b.route.length || this.rounds.bomb.planted || b.hearing > 0)) {
      this.nav.route(b.position, goal, b.route); b.waypoint = 0; b.planTime = 1.4 + Math.random() * .5;
    }
    b.velocity.set(0, 0, 0);
    if (b.position.distanceToSquared(goal) < (this.rounds.bomb.planted ? 3 : 4)) return;
    if (b.waypoint >= b.route.length) return;
    const id = b.route[b.waypoint], x = this.nav.px(id), z = this.nav.pz(id);
    const dx = x - b.position.x, dz = z - b.position.z, distance = Math.hypot(dx, dz);
    if (distance < .06) { b.waypoint++; return; }
    const speed = b.crouching ? 1.8 : 3.4, step = Math.min(distance, speed * dt);
    const nx = b.position.x + dx / distance * step, nz = b.position.z + dz / distance * step;
    b.yaw = Math.atan2(-dx, -dz);
    if (!blocked(this.world, nx, nz)) { b.velocity.set(dx / distance * speed, 0, dz / distance * speed); b.position.x = nx; b.position.z = nz; }
    else b.planTime = 0;
  }
  shoot(b, enemy) {
    if (!this.weapons || b.cooldown > 0 || b.reload > 0 || b.reaction > 0) return;
    const w = this.config.weapons[b.weapon];
    if (!b.mag) { if (b.reserve) b.reload = w.reloadTime || 1.8; return; }
    b.mag--; b.cooldown = 60 / w.rpm;
    b.retreat = 0.45 + Math.random() * .55;
    if (++b.burst >= 4) {
      b.burst = 0; b.coverTime = 1.2; b.planTime = 0; b.route.length = 0;
      let best = Infinity;
      for (const c of this.world.colliders) {
        if (c.max.y < 1.8 || c.min.y > b.eyeHeight) continue;
        const x = (c.min.x + c.max.x) / 2, z = (c.min.z + c.max.z) / 2;
        const dx = x - enemy.position.x, dz = z - enemy.position.z, length = Math.max(.01, Math.hypot(dx, dz));
        const nx = x + dx / length * ((c.max.x - c.min.x) / 2 + 1);
        const nz = z + dz / length * ((c.max.z - c.min.z) / 2 + 1);
        const distance = Math.hypot(nx - b.position.x, nz - b.position.z);
        this.origin.set(nx, b.eyeHeight, nz); this.direction.subVectors(enemy.position, this.origin); this.direction.y += enemy.eyeHeight;
        const range = this.direction.length(); this.direction.normalize();
        if (distance < best && distance < 8 && !blocked(this.world, nx, nz) && this.ray.cast(this.origin, this.direction, range).blocked) {
          b.cover.set(nx, 0, nz); best = distance;
        }
      }
      if (!Number.isFinite(best)) b.coverTime = 0;
    }
    this.origin.copy(b.position); this.origin.y += b.eyeHeight;
    this.direction.copy(enemy.position); this.direction.y += enemy.eyeHeight + .02;
    this.direction.sub(this.origin).normalize();
    b.yaw = Math.atan2(-this.direction.x, -this.direction.z);
    this.weapons.shootActor(b, b.weapon, this.origin, this.direction, .02 + Math.min(.02, b.cooldown * .01));
  }
  update(dt, player) {
    for (const b of this.bots) {
      b.body.visible = b.alive;
      if (!b.alive) continue;
      b.blinded = Math.max(0, b.blinded - dt); b.hearing = Math.max(0, b.hearing - dt);
      b.coverTime = Math.max(0, b.coverTime - dt);
      if (!b.grounded) {
        b.jumpVelocity -= this.config.gravity * dt; b.position.y = Math.max(0, b.position.y + b.jumpVelocity * dt);
        if (b.position.y === 0) { b.grounded = true; b.jumpVelocity = 0; }
      }
      b.planTime -= dt; b.cooldown = Math.max(0, b.cooldown - dt); b.reaction -= dt;
      if (b.reload > 0 && (b.reload -= dt) <= 0) {
        const n = Math.min(this.config.weapons[b.weapon].mag, b.reserve); b.mag = n; b.reserve -= n;
      }
      if (!b.frozen && this.rounds.phase === 'live') {
        let enemy = null;
        if (b.blinded <= 0) for (const p of this.rounds.players) {
          if (p.alive && p.team !== b.team && this.sees(b, p)) { enemy = p; break; }
        }
        if (enemy !== b.target) { b.target = enemy; b.reaction = .22 + Math.random() * .2; }
        b.posture -= dt; b.strafeTime -= dt; b.retreat = Math.max(0, b.retreat - dt); b.jumpTime -= dt;
        if (b.strafeTime <= 0) { b.strafe *= -1; b.strafeTime = .35 + Math.random() * .65; }
        if (b.posture <= 0) { b.crouching = !!enemy && Math.random() < .35; b.posture = 1 + Math.random() * 2; }
        b.height = b.crouching ? this.config.crouchHeight : this.config.playerHeight;
        b.eyeHeight = b.crouching ? this.config.crouchEyeHeight : this.config.eyeHeight;
        if (b.coverTime > 0 && !this.rounds.bomb.planted) this.move(b, dt);
        else if (enemy) {
          const dx = enemy.position.x - b.position.x, dz = enemy.position.z - b.position.z;
          const distance = Math.max(.01, Math.hypot(dx, dz)), side = b.strafe;
          if (b.retreat > 0 && distance < 18) {
            const nx = b.position.x - dz / distance * side * 2.2 * dt;
            const nz = b.position.z + dx / distance * side * 2.2 * dt;
            if (!blocked(this.world, nx, nz)) { b.position.x = nx; b.position.z = nz; b.velocity.set(-dz / distance * side * 2.2, 0, dx / distance * side * 2.2); }
          } else b.velocity.set(0, 0, 0);
          if (b.jumpTime <= 0 && b.grounded && !b.crouching) { b.grounded = false; b.jumpVelocity = 4; b.jumpTime = 2.5 + Math.random() * 4; }
          this.shoot(b, enemy);
        }
        else if (b.blinded <= 0 && this.rounds.interaction?.player !== b) this.move(b, dt);
        if (this.rounds.phase !== 'live') continue;
        this.rounds.pickupBomb(b);
        const type = this.rounds.bomb.planted ? 'defuse' : 'plant';
        const interact = !enemy && b.blinded <= 0 && this.rounds.canInteract(b, type);
        if (interact) b.velocity.set(0, 0, 0);
        this.rounds.interact(b, interact);
      }
      b.body.position.copy(b.position); b.body.rotation.y = b.yaw;
      b.body.scale.y = b.crouching ? .7 : 1;
      b.tag.position.y = 2.25 / b.body.scale.y;
      b.tag.scale.y = .65 / b.body.scale.y;
      if (b.tagHealth !== b.health) {
        const c = b.tagContext; b.tagHealth = b.health;
        c.clearRect(0, 0, 256, 64); c.fillStyle = 'rgba(8,14,18,.8)'; c.fillRect(0, 0, 256, 64);
        c.fillStyle = b.team === player.team ? '#8dc6ff' : '#ffac86';
        c.font = 'bold 22px monospace'; c.textAlign = 'center'; c.fillText(b.id, 128, 28);
        c.fillStyle = '#403b3e'; c.fillRect(14, 42, 228, 10);
        c.fillStyle = b.team === player.team ? '#9fffe0' : '#ff806c';
        c.fillRect(14, 42, 228 * Math.max(0, Math.min(1, b.health / 100)), 10); b.tagTexture.needsUpdate = true;
      }
    }
  }
}
