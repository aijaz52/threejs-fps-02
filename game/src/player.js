import * as THREE from 'three';
import { CONFIG } from './config.js';

export class Player {
  constructor({ camera, world, input }) {
    this.camera = camera;
    this.world = world;
    this.input = input;
    this.id = 'local';
    this.team = CONFIG.teams.a;
    this.position = world.spawnA.clone(); // Feet position, including when crouched.
    this.velocity = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eyeHeight = CONFIG.eyeHeight;
    this.height = CONFIG.playerHeight;
    this.grounded = false;
    this.crouching = false;
    this.frozen = true;
    this.alive = true;
    this.health = 100;
    this.armor = 0;
    this.weapon = 'raven';
    this.mag = CONFIG.weapons.raven.mag;
    this.reserve = CONFIG.weapons.raven.reserve;
    this.grenades = { flashbang: 0 };
    this.wish = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.beforeStep = new THREE.Vector3();
    this.updateCamera();
  }

  reset(spawn) {
    if (!this.alive) { this.armor = 0; this.grenades.flashbang = 0; }
    this.position.copy(spawn);
    this.velocity.set(0, 0, 0);
    this.blinded = 0;
    this.crouching = false; this.height = CONFIG.playerHeight; this.eyeHeight = CONFIG.eyeHeight;
    this.health = 100;
    this.grounded = false;
    this.pitch = 0;
    this.yaw = this.team === CONFIG.teams.a ? 0 : Math.PI;
    this.updateCamera();
  }

  overlaps(position, collider, height = this.height) {
    const half = CONFIG.playerWidth / 2;
    const e = 0.00001;
    return position.x + half > collider.min.x + e && position.x - half < collider.max.x - e
      && position.z + half > collider.min.z + e && position.z - half < collider.max.z - e
      && position.y + height > collider.min.y + e && position.y < collider.max.y - e;
  }

  moveAxis(axis, amount) {
    if (!amount) return;
    const previous = this.position[axis];
    const oldY = this.position.y;
    this.position[axis] += amount;
    let top = -Infinity;
    for (const c of this.world.colliders) if (this.overlaps(this.position, c)) top = Math.max(top, c.max.y);
    if (axis !== 'y' && top > -Infinity && this.grounded) {
      if (top - oldY <= CONFIG.stepHeight + 0.0001 && top >= oldY) {
        this.position.y = top;
        // Require room for the whole body both before and after stepping.
        const beforeStep = this.beforeStep.copy(this.position);
        beforeStep[axis] = previous;
        let blocked = false;
        for (const c of this.world.colliders) if (this.overlaps(this.position, c) || this.overlaps(beforeStep, c)) { blocked = true; break; }
        if (!blocked) return;
        this.position.y = oldY;
      }
    }
    for (const c of this.world.colliders) {
      if (!this.overlaps(this.position, c)) continue;
      const size = axis === 'y' ? this.height : CONFIG.playerWidth / 2;
      this.position[axis] = amount > 0 ? c.min[axis] - size : c.max[axis] + (axis === 'y' ? 0 : size);
      this.velocity[axis] = 0;
      if (axis === 'y' && amount < 0) this.grounded = true;
    }
  }

  simulate(dt) {
    const mouse = this.input.consumeMouseDelta();
    this.yaw -= mouse.dx * CONFIG.mouseSensitivity;
    this.pitch = THREE.MathUtils.clamp(this.pitch - mouse.dy * CONFIG.mouseSensitivity, -1.54, 1.54);
    const active = this.alive && !this.frozen && this.input.locked;
    if (!this.alive || this.frozen) this.velocity.set(0, 0, 0);
    const wantsCrouch = active && (this.input.isDown('ControlLeft') || this.input.isDown('ControlRight'));
    let obstructed = false;
    for (const c of this.world.colliders) if (this.overlaps(this.position, c, CONFIG.playerHeight)) { obstructed = true; break; }
    this.crouching = wantsCrouch || obstructed;
    this.height = this.crouching ? CONFIG.crouchHeight : CONFIG.playerHeight;
    const eye = this.crouching ? CONFIG.crouchEyeHeight : CONFIG.eyeHeight;
    this.eyeHeight = THREE.MathUtils.lerp(this.eyeHeight, eye, 1 - Math.exp(-14 * dt));
    const x = active ? Number(this.input.isDown('KeyD')) - Number(this.input.isDown('KeyA')) : 0;
    const z = active ? Number(this.input.isDown('KeyS')) - Number(this.input.isDown('KeyW')) : 0;
    const wish = this.wish.set(x, 0, z).normalize().applyAxisAngle(this.up, this.yaw);
    const walking = this.input.isDown('ShiftLeft') || this.input.isDown('ShiftRight');
    const speed = (walking ? CONFIG.walkSpeed : CONFIG.moveSpeed) * (this.crouching ? CONFIG.crouchFactor : 1);
    if (this.grounded) {
      const friction = Math.max(0, 1 - CONFIG.friction * dt);
      this.velocity.x *= friction;
      this.velocity.z *= friction;
    }
    const gain = Math.min(speed, CONFIG.accel * dt * (this.grounded ? 1 : 0.2));
    const along = this.velocity.dot(wish);
    if (along < speed) this.velocity.addScaledVector(wish, Math.min(gain, speed - along));
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontalSpeed > speed) {
      this.velocity.x *= speed / horizontalSpeed;
      this.velocity.z *= speed / horizontalSpeed;
    }
    const jump = this.input.consumePress('Space');
    if (active && jump && this.grounded && !this.crouching) this.velocity.y = CONFIG.jumpVelocity;
    this.velocity.y -= CONFIG.gravity * dt;
    this.moveAxis('x', this.velocity.x * dt);
    this.moveAxis('z', this.velocity.z * dt);
    this.grounded = false;
    this.moveAxis('y', this.velocity.y * dt);
    const b = CONFIG.bounds, half = CONFIG.playerWidth / 2;
    this.position.x = THREE.MathUtils.clamp(this.position.x, b.minX + half, b.maxX - half);
    this.position.z = THREE.MathUtils.clamp(this.position.z, b.minZ + half, b.maxZ - half);
    this.updateCamera();
  }

  updateCamera() {
    this.camera.position.copy(this.position);
    this.camera.position.y += this.eyeHeight;
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}
