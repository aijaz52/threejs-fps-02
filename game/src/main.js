import * as THREE from 'three';
import { CONFIG } from './config.js';
import { buildWorld } from './world.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Rounds } from './rounds.js';
import { Effects } from './effects.js';
import { WeaponSystem } from './weapon.js';
import { Bots } from './bots.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(75, 1, .05, 160);
const world = buildWorld(scene), input = new Input(canvas), player = new Player({ camera, world, input });
const effects = new Effects(scene), audio = new Audio(), hud = new Hud();
let bots = null;
let tauntTime = 0;
const taunts = ['Mid belongs to us.', 'Watch the next corner.', 'Your footsteps gave you away.'];
const rounds = new Rounds({ players: [player], world, onEvent: (event) => {
  if (event.type === 'kill') {
    hud.killFeed(`${event.killer?.id ?? 'World'} → ${event.victim.id} · ${CONFIG.weapons[event.weapon]?.name || 'World'}${event.headshot ? ' · ⊕ HEADSHOT' : ''}`);
    if (event.killer && event.killer.team !== player.team && tauntTime <= 0 && Math.random() < .3) {
      hud.killFeed(`${event.killer.id}: ${taunts[Math.floor(Math.random() * taunts.length)]}`); tauntTime = 18;
    }
  }
  if (event.type === 'win') {
    hud.killFeed(`${event.team} wins · ${event.reason}`); audio.stinger(event.team === player.team);
    hud.showBanner(event.team === player.team ? 'ROUND WIN' : 'ROUND LOSS', 5, `${event.team} · ${event.reason.toUpperCase()}`);
  }
  if (event.type === 'plant') { hud.killFeed(`SPECTRE planted at ${event.site}`); hud.showBanner('BOMB PLANTED', 3, `SPECTRE · SITE ${event.site}`); }
  if (event.type === 'match') hud.showBanner('MATCH OVER', 6, `${event.team} WINS`);
  if (event.type === 'round') { bots?.buy(); hud.bannerLife = 0; }
  if (event.type === 'live') { hud.menu = false; audio.stinger(true); }
} });
bots = new Bots({ scene, world, config: CONFIG, rounds });
const weaponSystem = new WeaponSystem({ player, world, config: CONFIG, effects, rounds, audio, input });
weaponSystem.bots = bots; bots.weapons = weaponSystem;
const buy = (id) => {
  if (rounds.buy(player, id)) hud.killFeed(`Purchased ${CONFIG.weapons[id]?.name || CONFIG.grenades[id]?.name || CONFIG.equipment[id]?.name}`);
};
hud.renderBuy(CONFIG, buy); hud.roster(rounds.players);
const hudState = { health: 100, armor: 0, ammo: 13, reserve: 52, weapon: 'raven', roundTime: 15,
  scores: rounds.scores, roundNumber: 1, money: 800, phase: 'buy' };
const numberKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0'];
const slots = ['primary', 'secondary', 'knife'];
let beepTimer = 0, stepTimer = 0, previousPhase = rounds.phase;

window.addEventListener('keydown', () => audio.start());
canvas.addEventListener('click', () => {
  audio.start(); canvas.focus();
  canvas.requestPointerLock()?.catch?.(() => hud.killFeed('Click the arena to capture the mouse.'));
});
function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize); resize();
function controls() {
  if (input.consumePress('KeyB')) {
    hud.menu = !hud.menu;
    if (hud.menu && rounds.phase === 'buy' && input.locked) document.exitPointerLock();
  }
  for (let i = 0; i < numberKeys.length; i++) if (input.consumePress(numberKeys[i])) {
    if (rounds.phase === 'buy' && hud.menu) hud.buyKey(i, buy);
    else if (i < 3) weaponSystem.select(slots[i]);
  }
  const wheel = input.consumeWheel();
  if (wheel) {
    let index = slots.indexOf(weaponSystem.currentSlot);
    for (let i = 0; i < 3; i++) {
      index = (index + (wheel > 0 ? 1 : 2)) % 3;
      if (weaponSystem.loadout[slots[index]]) { weaponSystem.select(slots[index]); break; }
    }
  }
}
function tick(dt) {
  tauntTime = Math.max(0, tauntTime - dt);
  controls(); player.simulate(dt);
  const blinded = player.blinded;
  player.blinded = Math.max(0, (player.blinded || 0) - dt);
  rounds.pickupBomb(player);
  rounds.interact(player, input.locked && input.isDown('KeyE'));
  weaponSystem.update(dt);
  if (player.blinded > blinded) hud.showBanner('FLASHBANG', player.blinded + 1);
  bots.update(dt, player); rounds.simulate(dt); effects.update(dt); hud.updateFeed(dt);
  if (previousPhase !== rounds.phase) {
    if (rounds.phase === 'buy') {
      hud.menu = true; effects.flash = 0;
      if (input.locked) document.exitPointerLock();
    }
    previousPhase = rounds.phase; beepTimer = 0;
  }
  if (rounds.phase === 'live' && rounds.bomb.planted) {
    beepTimer -= dt;
    if (beepTimer <= 0) {
      audio.beep(rounds.bomb.timer, player.position.distanceTo(rounds.bomb.position));
      beepTimer = .12 + .9 * rounds.bomb.timer / CONFIG.bomb.fuse;
    }
  }
  stepTimer -= dt;
  if (stepTimer <= 0 && rounds.phase === 'live') {
    if (player.grounded && Math.hypot(player.velocity.x, player.velocity.z) > 2) audio.footstep();
    for (const b of bots.bots) if (b.alive && b.velocity.lengthSq() > 4) audio.footstep(b.position.distanceTo(player.position));
    stepTimer = .42;
  }
}
function updateHud() {
  hudState.health = player.health; hudState.armor = player.armor; hudState.ammo = player.mag;
  hudState.reserve = player.reserve; hudState.weapon = player.weapon;
  hudState.roundTime = rounds.bomb.planted && rounds.phase === 'live' ? rounds.bomb.timer : rounds.timer;
  hudState.roundNumber = rounds.round; hudState.money = rounds.money.get(player.id) || 0; hudState.phase = rounds.phase;
  hud.update(hudState); hud.minimap(world, player, bots.bots, rounds.bomb);
  hud.objective(rounds, player, input.isDown('Tab'));
}
let accumulator = 0, previous = performance.now();
function frame(now) {
  accumulator += Math.min(.25, (now - previous) / 1000); previous = now;
  while (accumulator >= CONFIG.fixedDt) { tick(CONFIG.fixedDt); accumulator -= CONFIG.fixedDt; }
  updateHud(); renderer.render(scene, camera); requestAnimationFrame(frame);
}
window.__GAME = {
  CONFIG, renderer, scene, camera, world, input, player, rounds, bots, weaponSystem, weapon: weaponSystem, effects, audio, hud,
  fastForward: () => rounds.fastForward(),
  state: () => ({
    phase: rounds.phase, round: rounds.round, scores: { ...rounds.scores },
    alive: Object.fromEntries(Object.values(CONFIG.teams).map((team) => [team, rounds.players.filter((p) => p.team === team && p.alive).length])),
    player: { hp: player.health },
  }),
};
hud.killFeed('Crosstown · WASD · Shift walk · Ctrl crouch · Space jump · R reload · G flash · E objective');
requestAnimationFrame(frame);
