import { CONFIG } from './config.js';

export const MONEY_REWARD = Object.freeze({
  kill: 300, win: 3250, lossBase: 1400, lossPerStreak: 500, lossMax: 3400, plant: 300,
});

export class Rounds {
  // Players supply id, team, alive, position and optionally reset(spawn).
  constructor({ players = [], world, onEvent = () => {} } = {}) {
    this.players = players;
    this.world = world;
    this.onEvent = onEvent;
    this.scores = { VANGUARD: 0, SYNDICATE: 0 };
    this.lossStreak = { VANGUARD: 0, SYNDICATE: 0 };
    this.money = new Map();
    this.round = 0;
    this.phase = 'over';
    this.timer = 0;
    this.winner = null;
    this.reason = '';
    this.bomb = null;
    this.interaction = null;
    this.startRound();
  }

  award(player, amount) {
    const balance = this.money.get(player.id) ?? CONFIG.rounds.startMoney;
    this.money.set(player.id, Math.min(CONFIG.rounds.maxMoney, balance + amount));
  }

  startRound() {
    this.round++;
    this.phase = 'buy';
    this.timer = CONFIG.rounds.buyTime;
    this.winner = null;
    this.reason = '';
    this.interaction = null;
    for (const player of this.players) {
      if (!this.money.has(player.id)) this.money.set(player.id, CONFIG.rounds.startMoney);
      const spawn = player.team === CONFIG.teams.a ? this.world?.spawnA : this.world?.spawnB;
      if (spawn && player.reset) player.reset(spawn);
      player.weaponSystem?.reset();
      player.alive = true;
      player.health = 100;
      player.frozen = true;
      const weapon = CONFIG.weapons[player.weapon];
      if (weapon && !weapon.melee) { player.mag = weapon.mag; player.reserve = weapon.reserve; }
    }
    const carrier = this.players.find((p) => p.team === CONFIG.teams.b && p.alive);
    this.bomb = { name: CONFIG.bomb.name, planted: false, carrierId: carrier?.id ?? null,
      position: null, site: null, timer: CONFIG.bomb.fuse };
    this.onEvent({ type: 'round', round: this.round });
  }

  buy(player, id) {
    if (this.phase !== 'buy' || !player.alive || !this.players.includes(player)) return false;
    const item = CONFIG.weapons[id] ?? CONFIG.grenades[id] ?? CONFIG.equipment[id];
    if (!item || (this.money.get(player.id) ?? 0) < item.price) return false;
    if (item.armor) {
      if (player.armor >= item.armor) return false;
      player.armor = item.armor;
    } else if (CONFIG.grenades[id]) {
      player.grenades ??= {};
      if ((player.grenades[id] ?? 0) >= item.max) return false;
      player.grenades[id] = (player.grenades[id] ?? 0) + 1;
    } else {
      player.weapon = id;
      player.mag = item.mag ?? 0;
      player.reserve = item.reserve ?? 0;
    }
    player.weaponSystem?.purchase(id);
    this.award(player, -item.price);
    return true;
  }

  siteAt(position) {
    if (!this.world || !position) return null;
    for (let i = 0; i < 2; i++) {
      const name = i === 0 ? 'A' : 'B', site = i === 0 ? this.world.bombsiteA : this.world.bombsiteB;
      if (site && Math.hypot(position.x - site.x, position.z - site.z) <= CONFIG.bomb.siteRadius
        && Math.abs(position.y - site.y) < 2) return name;
    }
    return null;
  }

  canInteract(player, type) {
    if (this.phase !== 'live' || !player.alive || !player.position) return false;
    if (type === 'plant') return !this.bomb.planted && player.team === CONFIG.teams.b
      && this.bomb.carrierId === player.id && this.siteAt(player.position) !== null;
    if (type !== 'defuse' || !this.bomb.planted || player.team !== CONFIG.teams.a) return false;
    const b = this.bomb.position;
    return Math.hypot(player.position.x - b.x, player.position.y - b.y, player.position.z - b.z) <= 3;
  }

  interact(player, held) {
    if (!held) { if (this.interaction?.player === player) this.interaction = null; return; }
    const type = this.bomb.planted ? 'defuse' : 'plant';
    if (!this.canInteract(player, type)) {
      if (this.interaction?.player === player) this.interaction = null;
      return;
    }
    if (!this.interaction) this.interaction = { player, type, elapsed: 0, origin: { ...player.position } };
  }

  pickupBomb(player) {
    if (this.phase !== 'live' || this.bomb.planted || this.bomb.carrierId !== null
      || !player.alive || player.team !== CONFIG.teams.b || !this.bomb.position) return false;
    const b = this.bomb.position;
    if (Math.hypot(player.position.x - b.x, player.position.y - b.y, player.position.z - b.z) > 2) return false;
    this.bomb.carrierId = player.id;
    this.bomb.position = null;
    return true;
  }

  eliminate(victim, killer = null, weapon = killer?.weapon, headshot = false) {
    if (this.phase !== 'live' || !victim.alive || !this.players.includes(victim)) return false;
    victim.alive = false;
    victim.health = 0;
    if (victim.id === this.bomb.carrierId) {
      this.bomb.carrierId = null;
      this.bomb.position = { ...victim.position };
    }
    if (this.interaction?.player === victim) this.interaction = null;
    if (killer && killer !== victim && killer.team !== victim.team) this.award(killer, MONEY_REWARD.kill);
    this.onEvent({ type: 'kill', victim, killer, weapon, headshot });
    this.checkElimination();
    return true;
  }

  damage(victim, amount, attacker = null, weapon = attacker?.weapon, headshot = false) {
    if (this.phase !== 'live' || !victim.alive || !this.players.includes(victim)
      || (attacker && attacker.team === victim.team)) return false;
    const absorbed = Math.min(victim.armor || 0, amount * CONFIG.armorDamageFactor);
    victim.armor = Math.max(0, (victim.armor || 0) - absorbed);
    victim.health = Math.max(0, victim.health - (amount - absorbed));
    if (victim.health === 0) this.eliminate(victim, attacker, weapon, headshot);
    return true;
  }

  checkElimination() {
    // Teams absent from a sandbox roster do not cause an automatic victory.
    if (this.phase !== 'live') return;
    for (let i = 0; i < 2; i++) {
      const team = i === 0 ? CONFIG.teams.a : CONFIG.teams.b;
      let count = 0, alive = false;
      for (const p of this.players) if (p.team === team) { count++; if (p.alive) alive = true; }
      if (!count || alive) continue;
      if (team === CONFIG.teams.b && this.bomb.planted) continue;
      this.finish(team === CONFIG.teams.a ? CONFIG.teams.b : CONFIG.teams.a, 'elimination');
      return;
    }
  }

  finish(team, reason) {
    if (this.phase !== 'live') return;
    this.phase = 'over';
    this.timer = CONFIG.rounds.overTime;
    this.winner = team;
    this.reason = reason;
    this.scores[team]++;
    this.interaction = null;
    for (const name of Object.keys(this.lossStreak)) {
      this.lossStreak[name] = name === team ? 0 : this.lossStreak[name] + 1;
    }
    for (const player of this.players) {
      const reward = player.team === team ? MONEY_REWARD.win
        : Math.min(MONEY_REWARD.lossMax,
          MONEY_REWARD.lossBase + MONEY_REWARD.lossPerStreak * (this.lossStreak[player.team] - 1));
      this.award(player, reward);
      player.frozen = true;
    }
    this.onEvent({ type: 'win', team, reason });
  }

  simulate(dt) {
    if (this.phase === 'buy' || this.phase === 'over') {
      this.timer = Math.max(0, this.timer - dt);
      if (this.timer > 0) return;
      if (this.phase === 'over') { this.startRound(); return; }
      this.phase = 'live';
      this.timer = CONFIG.rounds.liveTime;
      this.players.forEach((player) => { player.frozen = false; });
      this.onEvent({ type: 'live' });
      return;
    }
    this.timer = Math.max(0, this.timer - dt);
    if (!this.bomb.planted && this.timer === 0) { this.finish(CONFIG.teams.a, 'time'); return; }
    // Resolve an already-running fuse before this tick's objective action.
    if (this.bomb.planted) {
      this.bomb.timer = Math.max(0, this.bomb.timer - dt);
      if (this.bomb.timer === 0) { this.finish(CONFIG.teams.b, 'detonation'); return; }
    }
    const action = this.interaction;
    if (action) {
      const p = action.player.position, o = action.origin;
      if (!this.canInteract(action.player, action.type) || Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z) > 0.2) {
        this.interaction = null;
      } else {
        action.elapsed += dt;
        const duration = action.type === 'plant' ? CONFIG.bomb.plantTime : CONFIG.bomb.defuseTime;
        if (action.elapsed >= duration) {
          this.interaction = null;
          if (action.type === 'defuse') { this.finish(CONFIG.teams.a, 'defuse'); return; }
          Object.assign(this.bomb, { planted: true, carrierId: null, position: { ...p }, site: this.siteAt(p) });
          this.award(action.player, MONEY_REWARD.plant);
          this.onEvent({ type: 'plant', player: action.player, site: this.bomb.site });
        }
      }
    }
    this.checkElimination();
  }

  fastForward() {
    if (this.phase === 'buy') {
      this.timer = 0;
      this.simulate(0);
    } else if (this.phase === 'over') {
      this.timer = 0;
      this.simulate(0);
      this.timer = 0;
      this.simulate(0);
    }
  }
}
