import { CONFIG } from './config.js';

export class Hud {
  constructor() {
    this.el = {};
    for (const id of ['score-ct', 'score-t', 'round-timer', 'round-number', 'kill-feed', 'crosshair', 'health', 'armor',
      'weapon-name', 'ammo', 'buy-menu', 'buy-items', 'buy-title', 'minimap', 'banner', 'objective', 'progress', 'scoreboard']) {
      this.el[id] = document.getElementById(id);
    }
    this.ctx = this.el.minimap.getContext('2d'); this.el.minimap.width = this.el.minimap.height = 168;
    this.map = document.createElement('canvas'); this.map.width = this.map.height = 168;
    this.mapContext = this.map.getContext('2d'); this.world = null; this.menu = true;
    this.mapScale = 148 / Math.max(CONFIG.bounds.maxX - CONFIG.bounds.minX, CONFIG.bounds.maxZ - CONFIG.bounds.minZ);
    this.buyItems = []; this.feed = []; this.feedIndex = 0;
    for (let i = 0; i < 5; i++) {
      const node = document.createElement('div'); node.hidden = true; this.el['kill-feed'].append(node);
      this.feed.push({ node, life: 0 });
    }
    this.rows = [];
    this.bannerLife = 0; this.bannerText = '';
  }
  update({ health, armor, ammo, reserve, weapon, roundTime, scores, roundNumber, money, phase }) {
    const e = this.el, sec = Math.max(0, Math.ceil(roundTime));
    e.health.textContent = Math.ceil(health); e.armor.textContent = `ARMOR ${Math.ceil(armor)}`;
    e.ammo.textContent = CONFIG.weapons[weapon]?.melee ? 'MELEE' : `${ammo} / ${reserve}`;
    e['weapon-name'].textContent = (CONFIG.weapons[weapon]?.name || weapon).toUpperCase();
    e['score-ct'].textContent = `VANGUARD ${scores.VANGUARD}`; e['score-t'].textContent = `SYNDICATE ${scores.SYNDICATE}`;
    e['round-timer'].textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
    e['round-number'].textContent = `CROSSTOWN · ROUND ${roundNumber} · ${phase.toUpperCase()}`;
    e.crosshair.style.display = health > 0 ? '' : 'none';
    e['buy-menu'].classList.toggle('open', phase === 'buy' && this.menu);
    e['buy-title'].textContent = `VANGUARD · $${money} · B: MENU`;
    for (const entry of this.buyItems) entry.button.disabled = phase !== 'buy' || health <= 0 || money < entry.item.price;
  }
  killFeed(text) {
    const p = this.feed[this.feedIndex++ % this.feed.length]; p.node.textContent = text; p.node.hidden = false;
    p.life = 6; this.el['kill-feed'].prepend(p.node);
  }
  showBanner(text, seconds = 3, detail = '') {
    this.bannerText = detail ? `${text}\n${detail}` : text; this.bannerLife = seconds;
  }
  updateFeed(dt) {
    for (const p of this.feed) if (p.life > 0) { p.life -= dt; p.node.hidden = p.life <= 0; }
    this.bannerLife = Math.max(0, this.bannerLife - dt);
  }
  renderBuy(config, buy) {
    this.el['buy-items'].replaceChildren(); this.buyItems.length = 0;
    const catalog = { ...config.weapons, ...config.grenades, ...config.equipment };
    for (const id in catalog) {
      const item = catalog[id], button = document.createElement('button'), index = this.buyItems.length;
      button.textContent = `${(index + 1) % 10}: ${item.name} · $${item.price}`;
      button.onclick = () => buy(id); this.el['buy-items'].append(button);
      this.buyItems.push({ button, id, item });
    }
  }
  buyKey(index, buy) { const entry = this.buyItems[index]; if (entry) buy(entry.id); }
  cacheMap(world) {
    this.world = world; const c = this.mapContext; if (!c) return;
    c.clearRect(0, 0, 168, 168); c.fillStyle = '#b69d80';
    const s = this.mapScale;
    for (const x of world.colliders) if (x.max.y > 0) c.fillRect(84 + x.min.x * s, 84 + x.min.z * s, (x.max.x - x.min.x) * s, (x.max.z - x.min.z) * s);
    for (const [site, color] of [[world.bombsiteA, '#c96343'], [world.bombsiteB, '#309e9a']]) {
      c.fillStyle = color; c.fillRect(84 + (site.x - 4.5) * s, 84 + (site.z - 4.5) * s, 9 * s, 9 * s);
    }
    c.fillStyle = '#fff3d8'; c.font = 'bold 12px monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('A', 84 + world.bombsiteA.x * s, 84 + world.bombsiteA.z * s);
    c.fillText('B', 84 + world.bombsiteB.x * s, 84 + world.bombsiteB.z * s);
  }
  dot(position, color, radius = 3) {
    const c = this.ctx; c.fillStyle = color; c.beginPath(); c.arc(84 + position.x * this.mapScale, 84 + position.z * this.mapScale, radius, 0, Math.PI * 2); c.fill();
  }
  minimap(world, player, bots, bomb) {
    if (!this.ctx) return;
    if (this.world !== world) this.cacheMap(world);
    this.ctx.clearRect(0, 0, 168, 168); this.ctx.drawImage(this.map, 0, 0);
    for (const b of bots) if (b.alive) this.dot(b.position, b.team === player.team ? '#73aaff' : '#ff806c');
    if (bomb.position) this.dot(bomb.position, '#fff08a', 2);
    if (player.alive) {
      this.dot(player.position, '#9fffe0', 4);
      const c = this.ctx, x = 84 + player.position.x * this.mapScale, z = 84 + player.position.z * this.mapScale;
      c.strokeStyle = '#9fffe0'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, z);
      c.lineTo(x - Math.sin(player.yaw) * 10, z - Math.cos(player.yaw) * 10); c.stroke();
    }
  }
  objective(rounds, player, tab) {
    const e = this.el, action = rounds.interaction;
    e.banner.textContent = this.bannerLife > 0 ? this.bannerText : rounds.phase === 'over' ? ''
      : rounds.phase === 'buy' ? 'FREEZE / BUY · B to shop · Click arena to play' : !player.alive ? 'ELIMINATED · Next round soon' : '';
    e.banner.style.opacity = this.bannerLife > 0 ? Math.min(1, this.bannerLife / .8) : 1;
    e.banner.classList.toggle('announcement', this.bannerLife > 0);
    const type = rounds.bomb.planted ? 'defuse' : 'plant';
    e.objective.textContent = action ? `${action.player.id} · ${action.type.toUpperCase()}`
      : rounds.canInteract(player, type) ? `Hold E to ${type}` : rounds.bomb.planted ? 'SPECTRE PLANTED · RETAKE' : '';
    e.progress.hidden = !action;
    if (action) e.progress.value = action.elapsed / (action.type === 'plant' ? CONFIG.bomb.plantTime : CONFIG.bomb.defuseTime);
    e.scoreboard.hidden = !tab;
    if (tab) for (let i = 0; i < rounds.players.length; i++) {
      const p = rounds.players[i]; this.rows[i].textContent = `${p.team} · ${p.id} · ${p.alive ? Math.ceil(p.health) + ' HP' : 'DEAD'} · $${rounds.money.get(p.id) || 0}`;
    }
  }
  roster(players) {
    for (const p of players) { const row = document.createElement('div'); row.textContent = p.id; this.el.scoreboard.append(row); this.rows.push(row); }
  }
}
