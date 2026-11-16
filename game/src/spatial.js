import * as THREE from 'three';

// Analytic collider/actor rays avoid allocating Three.js intersection arrays.
export class CombatRay {
  constructor(world) {
    this.world = world;
    this.ray = new THREE.Ray(); this.box = new THREE.Box3(); this.point = new THREE.Vector3();
    this.hit = { distance: 0, target: null, point: new THREE.Vector3(), blocked: false };
  }
  cast(origin, direction, range, actors = null, shooter = null) {
    this.ray.set(origin, direction);
    const hit = this.hit;
    hit.distance = range; hit.target = null; hit.blocked = false;
    hit.point.copy(origin).addScaledVector(direction, range);
    for (const c of this.world.colliders) {
      this.box.min.copy(c.min); this.box.max.copy(c.max);
      this.test(origin, null);
    }
    if (actors) for (const p of actors) {
      if (p === shooter || !p.alive) continue;
      const h = p.height ?? (p.crouching ? 1.25 : 1.8), r = 0.3;
      this.box.min.set(p.position.x - r, p.position.y, p.position.z - r);
      this.box.max.set(p.position.x + r, p.position.y + h, p.position.z + r);
      this.test(origin, p);
    }
    return hit;
  }
  test(origin, target) {
    if (!this.ray.intersectBox(this.box, this.point)) return;
    const distance = this.point.distanceTo(origin);
    if (distance < this.hit.distance) {
      this.hit.distance = distance; this.hit.point.copy(this.point);
      this.hit.target = target; this.hit.blocked = true;
    }
  }
}

export function blocked(world, x, z, radius = 0.36) {
  for (const c of world.colliders) {
    if (c.max.y <= 0.4 || c.min.y >= 1.8) continue;
    if (x + radius > c.min.x && x - radius < c.max.x && z + radius > c.min.z && z - radius < c.max.z) return true;
  }
  return false;
}

export class Navigation {
  constructor(world, bounds) {
    this.world = world; this.step = 2; this.x = bounds.minX + 1; this.z = bounds.minZ + 1;
    this.width = Math.floor((bounds.maxX - bounds.minX) / this.step);
    this.depth = Math.floor((bounds.maxZ - bounds.minZ) / this.step);
    const n = this.width * this.depth;
    this.walk = new Uint8Array(n); this.closed = new Uint8Array(n); this.cost = new Float32Array(n);
    this.parent = new Int32Array(n); this.open = new Int32Array(n); this.reverse = new Int32Array(n);
    for (let i = 0; i < n; i++) this.walk[i] = !blocked(world, this.px(i), this.pz(i), 0.55);
  }
  px(i) { return this.x + (i % this.width) * this.step; }
  pz(i) { return this.z + Math.floor(i / this.width) * this.step; }
  nearest(p) {
    let best = -1, d = Infinity;
    for (let i = 0; i < this.walk.length; i++) if (this.walk[i]) {
      const distance = (this.px(i) - p.x) ** 2 + (this.pz(i) - p.z) ** 2;
      if (distance < d && this.clear(p.x, p.z, this.px(i), this.pz(i))) { best = i; d = distance; }
    }
    return best;
  }
  clear(ax, az, bx, bz) {
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.4);
    for (let i = 0; i <= n; i++) {
      const t = n ? i / n : 0;
      if (blocked(this.world, ax + (bx - ax) * t, az + (bz - az) * t, 0.5)) return false;
    }
    return true;
  }
  route(from, goal, out) {
    out.length = 0;
    const start = this.nearest(from), end = this.nearest(goal);
    if (start < 0 || end < 0) return;
    this.cost.fill(Infinity); this.closed.fill(0); this.parent.fill(-1);
    let count = 1; this.open[0] = start; this.cost[start] = 0;
    while (count) {
      let pick = 0, best = Infinity;
      for (let j = 0; j < count; j++) {
        const id = this.open[j], f = this.cost[id] + Math.abs(this.px(id) - this.px(end)) + Math.abs(this.pz(id) - this.pz(end));
        if (f < best) { best = f; pick = j; }
      }
      const id = this.open[pick]; this.open[pick] = this.open[--count];
      if (id === end) break;
      this.closed[id] = 1;
      for (let k = 0; k < 4; k++) {
        const next = id + (k === 0 ? 1 : k === 1 ? -1 : k === 2 ? this.width : -this.width);
        if (next < 0 || next >= this.walk.length || !this.walk[next] || this.closed[next]) continue;
        if (k < 2 && Math.floor(next / this.width) !== Math.floor(id / this.width)) continue;
        if (!this.clear(this.px(id), this.pz(id), this.px(next), this.pz(next))) continue;
        const cost = this.cost[id] + this.step;
        if (cost >= this.cost[next]) continue;
        if (!Number.isFinite(this.cost[next])) this.open[count++] = next;
        this.cost[next] = cost; this.parent[next] = id;
      }
    }
    if (end !== start && this.parent[end] < 0) return;
    let length = 0, node = end;
    while (node >= 0) { this.reverse[length++] = node; node = this.parent[node]; }
    let ax = from.x, az = from.z;
    for (let i = length - 1; i >= 0;) {
      let j = 0;
      while (j < i && !this.clear(ax, az, this.px(this.reverse[j]), this.pz(this.reverse[j]))) j++;
      const id = this.reverse[j]; out.push(id); ax = this.px(id); az = this.pz(id); i = j - 1;
    }
  }
}
