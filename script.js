'use strict';
/* ============================================================
   Pokémon Roguelike (proyecto de fan no oficial)
   Vanilla JS game logic — no dependencies, no build step at runtime.
   Real Pokémon names/types/stats/moves sourced from PokeAPI and
   pre-processed into pokedex-data.json / moves-data.json / type-chart.json
   (see build/fetch-pokedata.js). No official sprites/artwork are used —
   all visuals are original CSS/SVG geometric shapes and color coding.
   Not affiliated with Nintendo, Game Freak or The Pokémon Company.
   ============================================================ */

/* ---------------------- DATA (loaded async) ------------------------ */
let TYPES = [];
let TYPE_NAMES_ES = {};
let TYPE_CHART = {};
let MOVES = {};
let POKEMON = [];
let POKEMON_BY_KEY = {};

function getEffectiveness(attackType, defendTypes) {
  const row = TYPE_CHART[attackType];
  if (!row) return 1;
  let mult = 1;
  (defendTypes || []).forEach(dt => {
    const m = row[dt];
    if (typeof m === 'number') mult *= m;
  });
  return mult;
}

function getSpecies(key) { return POKEMON_BY_KEY[key]; }

/* ---------------------- STARTER CONFIG ------------------------ */
// Curated subset of the full Pokédex usable as a run starter, with a
// permanent-unlock cost in Créditos (0 = free from the start). Costs are
// hand-tiered from each species' base stat total.
const STARTER_CONFIG = [
  { key: 'bulbasaur', cost: 0 },
  { key: 'charmander', cost: 0 },
  { key: 'squirtle', cost: 0 },
  { key: 'pikachu', cost: 0 },
  { key: 'geodude', cost: 25 },
  { key: 'ekans', cost: 25 },
  { key: 'sandshrew', cost: 25 },
  { key: 'vulpix', cost: 35 },
  { key: 'dratini', cost: 35 },
  { key: 'horsea', cost: 35 },
  { key: 'machop', cost: 35 },
  { key: 'mankey', cost: 50 },
  { key: 'gastly', cost: 50 },
  { key: 'meowth', cost: 50 },
  { key: 'abra', cost: 50 },
  { key: 'clefairy', cost: 50 },
  { key: 'eevee', cost: 70 },
  { key: 'tentacool', cost: 70 },
  { key: 'magnemite', cost: 70 },
  { key: 'growlithe', cost: 90 },
  { key: 'ponyta', cost: 120 },
  { key: 'chikorita', cost: 35 },
  { key: 'cyndaquil', cost: 35 },
  { key: 'totodile', cost: 35 },
  { key: 'mareep', cost: 50 },
  { key: 'phanpy', cost: 70 },
  { key: 'larvitar', cost: 90 },
];
let STARTER_POOL = [];
let DEFAULT_UNLOCKED = [];

/* ---------------------- DATA: ITEMS ------------------------- */
const ITEMS = {
  potion:         { id: 'potion', name: 'Poción', desc: 'Cura 20 PS del Pokémon activo.', price: 10, kind: 'heal', value: 20 },
  potionMax:      { id: 'potionMax', name: 'Poción Máxima', desc: 'Cura 50 PS del Pokémon activo.', price: 24, kind: 'heal', value: 50 },
  esferaBasica:   { id: 'esferaBasica', name: 'Esfera Básica', desc: '+15% de probabilidad al capturar.', price: 15, kind: 'catch', value: 0.15 },
  esferaSuperior: { id: 'esferaSuperior', name: 'Esfera Superior', desc: '+35% de probabilidad al capturar.', price: 32, kind: 'catch', value: 0.35 },
  elixirAtk:      { id: 'elixirAtk', name: 'Elixir de Ataque', desc: '+3 Ataque permanente (esta partida).', price: 25, kind: 'buff', stat: 'atk', value: 3 },
  elixirDef:      { id: 'elixirDef', name: 'Elixir de Defensa', desc: '+3 Defensa permanente (esta partida).', price: 25, kind: 'buff', stat: 'def', value: 3 },
  elixirVel:      { id: 'elixirVel', name: 'Elixir de Velocidad', desc: '+3 Velocidad permanente (esta partida).', price: 25, kind: 'buff', stat: 'spd', value: 3 },
};

const NAME_POOL = ['Kai', 'Luz', 'Iris', 'Teo', 'Nara', 'Bruno', 'Sol', 'Mika', 'Diego', 'Vale', 'Rex', 'Luna', 'Ona', 'Yago'];
const BOSS_TITLES = ['Líder de Gimnasio', 'Alto Mando', 'Campeón/a', 'Maestro/a Pokémon'];

/* ---------------------- STORAGE (meta) ----------------------- */
const STORAGE_KEY = 'pokemonRoguelikeMeta_v1';

function loadMeta() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return Object.assign({
        credits: 0,
        bestFloor: 0,
        unlockedStarters: DEFAULT_UNLOCKED.slice(),
        dex: {},
      }, parsed);
    }
  } catch (e) { /* ignore corrupt storage */ }
  return { credits: 0, bestFloor: 0, unlockedStarters: DEFAULT_UNLOCKED.slice(), dex: {} };
}

function saveMeta() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch (e) { /* storage unavailable */ }
}

let meta = null;

function markSeen(speciesKey) {
  if (!meta.dex[speciesKey]) meta.dex[speciesKey] = { seen: true, caught: false };
  else meta.dex[speciesKey].seen = true;
  saveMeta();
}
function markCaught(speciesKey) {
  if (!meta.dex[speciesKey]) meta.dex[speciesKey] = { seen: true, caught: true };
  else meta.dex[speciesKey].caught = true;
  saveMeta();
}

/* ---------------------- UTILITIES ----------------------------- */
function rand(n) { return Math.floor(Math.random() * n); }
function pick(arr) { return arr[rand(arr.length)]; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function delay(ms) { return new Promise(res => setTimeout(res, ms)); }
function esc(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function typeBadge(type) {
  return `<span class="type-badge type-${type}">${esc(TYPE_NAMES_ES[type] || type)}</span>`;
}
function typeBadges(types) { return (types || []).map(typeBadge).join(''); }
function hpBarClass(pct) {
  if (pct <= 25) return 'low';
  if (pct <= 55) return 'mid';
  return '';
}
function monAvatarHTML(species, size) {
  const cls = 'mon-avatar' + (size === 'sm' ? ' sm' : '');
  const letters = esc(species.name.replace(/[^A-Za-zÀ-ÿ]/g, '').slice(0, 2).toUpperCase());
  if (species.types.length === 1) {
    return `<div class="${cls} type-fill-${species.types[0]}"><span class="mono">${letters}</span></div>`;
  }
  return `<div class="${cls}"><span class="half left type-fill-${species.types[0]}"></span><span class="half right type-fill-${species.types[1]}"></span><span class="mono">${letters}</span></div>`;
}

const NODE_ICON_PATHS = {
  wild: '<path d="M12 3 L21 12 L12 21 L3 12 Z"/>',
  trainer: '<path d="M5 5 L19 19 M19 5 L5 19"/>',
  heal: '<path d="M12 4 V20 M4 12 H20"/>',
  shop: '<path d="M4 9 H20 L18 20 H6 Z"/><path d="M8 9 C8 5 16 5 16 9"/>',
  boss: '<path d="M12 2 L14.6 9 L22 9.5 L16.3 14.3 L18 21.5 L12 17.5 L6 21.5 L7.7 14.3 L2 9.5 L9.4 9 Z"/>',
};
function nodeIconSVG(type, mini) {
  const p = NODE_ICON_PATHS[type] || NODE_ICON_PATHS.wild;
  const cls = mini ? 'node-icon-mini' : '';
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}
function nodeIconWrap(type) {
  return `<span class="node-icon n-${type}">${nodeIconSVG(type)}</span>`;
}

function weightedSampleDistinct(weightMap, k) {
  const pool = Object.keys(weightMap).slice();
  const result = [];
  for (let i = 0; i < k && pool.length; i++) {
    const total = pool.reduce((s, key) => s + weightMap[key], 0);
    let r = Math.random() * total;
    let chosenIdx = 0;
    for (let j = 0; j < pool.length; j++) {
      r -= weightMap[pool[j]];
      if (r <= 0) { chosenIdx = j; break; }
    }
    result.push(pool[chosenIdx]);
    pool.splice(chosenIdx, 1);
  }
  return result;
}

function randomDistinctSpecies(n, excludeKeys) {
  excludeKeys = excludeKeys || [];
  const pool = POKEMON.filter(c => !excludeKeys.includes(c.key));
  const chosen = [];
  const copy = pool.slice();
  for (let i = 0; i < n && copy.length; i++) {
    const idx = rand(copy.length);
    chosen.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return chosen;
}
function randomDistinctSpeciesFrom(list, n) {
  const copy = list.slice();
  const out = [];
  for (let i = 0; i < n && copy.length; i++) {
    const idx = rand(copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

/* ---------------------- STAT / INSTANCE MODEL ------------------ */
// Simplified real-formula stat curve (no IVs/EVs): approximates the
// official games' HP/stat growth so higher base stats and higher levels
// both matter, while staying easy to reason about for balance tuning.
function statsForLevel(species, level) {
  return {
    maxHP: Math.floor((2 * species.baseHP * level) / 100) + level + 10,
    atk: Math.floor((2 * species.baseAtk * level) / 100) + 5,
    def: Math.floor((2 * species.baseDef * level) / 100) + 5,
    spd: Math.floor((2 * species.baseSpd * level) / 100) + 5,
  };
}

function createInstance(species, level) {
  const s = statsForLevel(species, level);
  return {
    speciesKey: species.key,
    level,
    maxHP: s.maxHP,
    currentHP: s.maxHP,
    atk: s.atk,
    def: s.def,
    spd: s.spd,
    moves: species.moves.slice(0, 3),
  };
}

/* ---------------------- ENEMY SCALING ------------------------ */
// Enemy level is tied to the player's ACTUAL current average party level
// (not raw node index), so healing/shopping sensibly never lets enemies
// silently pull ahead. Team size (not stacked level bonuses) is what
// makes trainers and bosses meaningfully harder.
const MAX_LEVEL = 60;

function avgPartyLevel() {
  if (!runState || !runState.party.length) return 1;
  return runState.party.reduce((s, p) => s + p.level, 0) / runState.party.length;
}

// Constants below were tuned with build/simulate-balance.js (800-run batches):
// this exact shape gives ~11% victory rate, ~14/20 average floor reached, and
// a healthy spread across the floor-reached distribution (not everyone
// breezing to the end, not everyone dying on floor 1).
function enemyLevelFor(kind) {
  const avg = avgPartyLevel();
  let offset;
  if (kind === 'wild') offset = -1 + rand(2); // roughly on par, sometimes a bit weaker
  else if (kind === 'trainer') offset = 1; // a modest single edge...
  else offset = 3; // ...a little more for bosses — but never stacked on top of anything else
  // Boss offset nudged +2 -> +3 for a small, targeted difficulty increase
  // (content-expansion pass, not a rebalance) — see README "Simulación de
  // balance" for the original 800-run tuning this builds on.
  return clamp(Math.round(avg + offset), 2, MAX_LEVEL);
}

function teamSizeFor(kind, nodeIndex) {
  if (kind === 'wild') return 1;
  if (kind === 'trainer') return nodeIndex < 8 ? 1 : 2;
  // boss
  if (nodeIndex < 8) return 1;
  if (nodeIndex < 18) return 2;
  return 3;
}

/* ---------------------- RUN STATE ------------------------------ */
const FINAL_DEPTH = 20;
let runState = null;
let battle = null;
const STARTER_LEVEL = 5;

function newRun(starterKey) {
  const species = getSpecies(starterKey);
  markSeen(species.key);
  markCaught(species.key);
  runState = {
    depth: 0,
    credits: 20,
    party: [createInstance(species, STARTER_LEVEL)],
    inventory: { potion: 2, potionMax: 0, esferaBasica: 2, esferaSuperior: 0 },
    caughtThisRun: [species.key],
    history: [],
    pendingNodeOptions: [],
  };
  runState.pendingNodeOptions = generateNodeOptions(1);
}

function generateNodeOptions(nodeIndex) {
  if (nodeIndex % 5 === 0) return ['boss'];
  if (nodeIndex === 1) return ['wild', 'shop'];
  const weights = { wild: 4, trainer: 3, shop: 2, heal: 3 };
  const k = nodeIndex <= 2 ? 2 : 3;
  const opts = weightedSampleDistinct(weights, k);
  if (nodeIndex % 5 === 4 && !opts.includes('heal')) opts[opts.length - 1] = 'heal';
  if (nodeIndex % 5 === 1 && nodeIndex > 1 && !opts.includes('heal')) opts[opts.length - 1] = 'heal';
  return opts;
}

function nodeMeta(type) {
  switch (type) {
    case 'wild': return { label: 'Encuentro Salvaje', desc: 'Lucha o captura un Pokémon salvaje.' };
    case 'trainer': return { label: 'Combate de Entrenador', desc: 'Un entrenador te reta. Sin captura.' };
    case 'heal': return { label: 'Centro de Curación', desc: 'Cura por completo a tu equipo.' };
    case 'shop': return { label: 'Tienda', desc: 'Compra objetos con tus Créditos.' };
    case 'boss': return { label: 'Jefe', desc: '¡Combate de jefe! Prepárate bien.' };
    default: return { label: type, desc: '' };
  }
}

/* ================== SCREEN RENDERING (root swap) ================ */
const root = () => document.getElementById('game-root');
function showHTML(html) { root().innerHTML = html; window.scrollTo({ top: document.getElementById('game-app').offsetTop - 8, behavior: 'smooth' }); }

/* ---------- MENU ---------- */
function renderMenu() {
  const unlockedCount = meta.unlockedStarters.length;
  showHTML(`
    <p class="screen-title">Menú principal</p>
    <div class="meta-stats">
      <span class="pill">Créditos: ${meta.credits}</span>
      <span class="pill">Mejor piso: ${meta.bestFloor}/${FINAL_DEPTH}</span>
      <span class="pill">Iniciales: ${unlockedCount}/${STARTER_POOL.length}</span>
    </div>
    <div class="stack">
      <button class="btn" onclick="goStarterSelect()">Nueva Partida</button>
      <button class="btn btn-secondary" onclick="renderUpgrades()">Mejoras (gastar Créditos)</button>
      <button class="btn btn-outline" onclick="renderDex()">Registro Pokémon</button>
    </div>
    <p class="muted mt center">Consulta "Cómo jugar" más abajo para ver la tabla de tipos real.</p>
  `);
}

function goStarterSelect() { renderStarterSelect(); }

/* ---------- STARTER SELECT ---------- */
function renderStarterSelect() {
  const unlocked = STARTER_POOL.filter(c => meta.unlockedStarters.includes(c.key));
  const offered = unlocked.length <= 3 ? unlocked.slice() : randomDistinctSpeciesFrom(unlocked, 3);
  const cards = offered.map(c => {
    const s = statsForLevel(c, STARTER_LEVEL);
    return `
    <button class="node-card" onclick="pickStarter('${c.key}')">
      ${monAvatarHTML(c)}
      <span>
        <span class="node-label">${esc(c.name)}</span> ${typeBadges(c.types)}
        <div class="node-desc">PS ${s.maxHP} · Atq ${s.atk} · Def ${s.def} · Vel ${s.spd}</div>
        <div class="node-desc">Movimiento inicial: ${esc(MOVES[c.moves[0]].name)}</div>
      </span>
    </button>`;
  }).join('');
  showHTML(`
    <p class="screen-title">Elige tu Pokémon inicial</p>
    <div class="node-options">${cards}</div>
    <button class="btn btn-outline mt" onclick="renderMenu()">Volver</button>
  `);
}

function pickStarter(key) {
  newRun(key);
  renderMap();
}

/* ---------- UPGRADES (meta shop) ---------- */
function renderUpgrades() {
  const rows = STARTER_POOL.map(c => {
    const unlocked = meta.unlockedStarters.includes(c.key);
    return `
      <div class="item-card">
        <div class="row" style="align-items:center; gap:10px;">
          ${monAvatarHTML(c, 'sm')}
          <div>
            <div class="item-name">${esc(c.name)} ${typeBadges(c.types)}</div>
            <div class="item-desc">${unlocked ? 'Desbloqueado' : 'Coste: ' + c.cost + ' Créditos'}</div>
          </div>
        </div>
        ${unlocked
          ? `<span class="pill">Listo</span>`
          : `<button class="btn btn-small" ${meta.credits < c.cost ? 'disabled' : ''} onclick="unlockStarter('${c.key}')">Desbloquear</button>`}
      </div>`;
  }).join('');
  showHTML(`
    <p class="screen-title">Mejoras permanentes</p>
    <p class="muted mb">Créditos disponibles: <strong>${meta.credits}</strong></p>
    <div class="stack">${rows}</div>
    <button class="btn btn-outline mt" onclick="renderMenu()">Volver</button>
  `);
}

function unlockStarter(key) {
  const c = STARTER_POOL.find(s => s.key === key);
  if (!c || meta.unlockedStarters.includes(key)) return;
  if (meta.credits < c.cost) return;
  meta.credits -= c.cost;
  meta.unlockedStarters.push(key);
  saveMeta();
  renderUpgrades();
}

/* ---------- REGISTRO (Pokédex-style log) ---------- */
function renderDex() {
  const items = POKEMON.map(c => {
    const entry = meta.dex[c.key];
    if (!entry || !entry.seen) {
      return `<div class="dex-item unseen"><div class="mon-avatar sm" style="background:#ddd; margin:0 auto;"><span class="mono">?</span></div><div class="dex-name">???</div></div>`;
    }
    const status = entry.caught ? 'Capturado' : 'Visto';
    return `
      <div class="dex-item">
        <div style="display:flex; justify-content:center;">${monAvatarHTML(c, 'sm')}</div>
        <div class="dex-name">${esc(c.name)}</div>
        <div class="muted" style="font-size:0.64rem">${status}</div>
      </div>`;
  }).join('');
  const seenCount = Object.values(meta.dex).filter(d => d.seen).length;
  showHTML(`
    <p class="screen-title">Registro Pokémon (${seenCount}/${POKEMON.length})</p>
    <div class="dex-grid">${items}</div>
    <button class="btn btn-outline mt" onclick="renderMenu()">Volver</button>
  `);
}

/* ---------- MAP ---------- */
function partyStripHTML() {
  return `<div class="party-strip">${runState.party.map(p => {
    const sp = getSpecies(p.speciesKey);
    const pct = Math.round((p.currentHP / p.maxHP) * 100);
    return `
      <div class="party-chip ${p.currentHP <= 0 ? 'fainted' : ''}">
        <div class="chip-name">${esc(sp.name)} Nv.${p.level}</div>
        <div class="hp-bar-outer"><div class="hp-bar-inner ${hpBarClass(pct)}" style="width:${pct}%"></div></div>
        <div class="hp-text">${p.currentHP}/${p.maxHP} PS</div>
      </div>`;
  }).join('')}</div>`;
}

function renderMap() {
  const nextIndex = runState.depth + 1;
  const trail = runState.history.map(t => {
    return `<div class="node-dot ${t === 'boss' ? 'boss' : ''}" title="${esc(nodeMeta(t).label)}">${nodeIconSVG(t, true)}</div>`;
  }).join('');
  const options = runState.pendingNodeOptions.map(type => {
    const nm = nodeMeta(type);
    return `
      <button class="node-card" onclick="enterNode('${type}')">
        ${nodeIconWrap(type)}
        <span>
          <span class="node-label">${esc(nm.label)}</span>
          <div class="node-desc">${esc(nm.desc)}</div>
        </span>
      </button>`;
  }).join('');
  showHTML(`
    <p class="screen-title">Mazmorra — Nodo ${nextIndex}/${FINAL_DEPTH}</p>
    <div class="meta-stats"><span class="pill">Créditos: ${runState.credits}</span></div>
    <div class="node-trail">${trail || '<span class="muted">Tu camino empieza aquí…</span>'}</div>
    ${partyStripHTML()}
    <div class="node-options">${options}</div>
    <button class="btn btn-outline mt" onclick="abandonRun()">Abandonar partida</button>
  `);
}

function abandonRun() {
  if (!confirm('¿Seguro que quieres abandonar la partida? Se perderá el progreso de este intento (conservas tus Créditos acumulados).')) return;
  finishRun('abandoned');
}

function enterNode(type) {
  if (type === 'heal') { resolveHeal(); return; }
  if (type === 'shop') { renderShop(); return; }
  if (type === 'wild') { startBattle('wild'); return; }
  if (type === 'trainer') { startBattle('trainer'); return; }
  if (type === 'boss') { startBattle('boss'); return; }
}

function advanceAfterNode(type) {
  runState.history.push(type);
  runState.depth += 1;
  if (runState.depth >= FINAL_DEPTH) { finishRun('victory'); return; }
  runState.pendingNodeOptions = generateNodeOptions(runState.depth + 1);
  renderMap();
}

/* ---------- HEAL NODE ---------- */
function resolveHeal() {
  runState.party.forEach(p => { p.currentHP = p.maxHP; });
  showHTML(`
    <p class="screen-title">Centro de Curación</p>
    <p class="center">Tu equipo ha recuperado todos sus puntos de salud.</p>
    ${partyStripHTML()}
    <button class="btn mt" onclick="advanceAfterNode('heal')">Continuar</button>
  `);
}

/* ---------- SHOP ---------- */
let shopOffer = [];
function renderShop() {
  shopOffer = weightedSampleDistinct({ potion: 3, potionMax: 2, esferaBasica: 3, esferaSuperior: 2, elixirAtk: 2, elixirDef: 2, elixirVel: 2 }, 5);
  renderShopInner();
}
function renderShopInner() {
  const rows = shopOffer.map(id => {
    const it = ITEMS[id];
    const owned = it.kind !== 'buff' ? ` (tienes ${runState.inventory[id] || 0})` : '';
    return `
      <div class="item-card">
        <div>
          <div class="item-name">${esc(it.name)}</div>
          <div class="item-desc">${esc(it.desc)}${owned}</div>
        </div>
        <button class="btn btn-small" ${runState.credits < it.price ? 'disabled' : ''} onclick="buyItem('${id}')">${it.price} Cr.</button>
      </div>`;
  }).join('');
  showHTML(`
    <p class="screen-title">Tienda</p>
    <p class="muted mb">Créditos disponibles: <strong>${runState.credits}</strong></p>
    <div class="stack">${rows}</div>
    ${partyStripHTML()}
    <button class="btn mt" onclick="advanceAfterNode('shop')">Salir de la tienda</button>
  `);
}

function buyItem(id) {
  const it = ITEMS[id];
  if (runState.credits < it.price) return;
  if (it.kind === 'buff') {
    pendingBuff = it;
    renderBuffTargetPicker();
    return;
  }
  runState.credits -= it.price;
  runState.inventory[id] = (runState.inventory[id] || 0) + 1;
  renderShopInner();
}

let pendingBuff = null;
function renderBuffTargetPicker() {
  const options = runState.party.map((p, idx) => {
    const sp = getSpecies(p.speciesKey);
    return `<button class="node-card" onclick="applyBuff(${idx})">${monAvatarHTML(sp, 'sm')}<span><span class="node-label">${esc(sp.name)} Nv.${p.level}</span><div class="node-desc">${esc(pendingBuff.desc)}</div></span></button>`;
  }).join('');
  showHTML(`
    <p class="screen-title">¿A quién aplicar ${esc(pendingBuff.name)}?</p>
    <div class="node-options">${options}</div>
    <button class="btn btn-outline mt" onclick="renderShopInner()">Cancelar</button>
  `);
}
function applyBuff(idx) {
  const p = runState.party[idx];
  p[pendingBuff.stat] += pendingBuff.value;
  runState.credits -= pendingBuff.price;
  pendingBuff = null;
  renderShopInner();
}

/* ================== BATTLE SYSTEM ================== */
// Soft cap on any single hit (fraction of the defender's max HP) so a
// high-power real move (e.g. Explosion/Focus Punch, power 150-250) can't
// alone swing a fight in one blow — those moves' real drawbacks
// (self-KO, recharge, etc.) aren't modeled, so this keeps them strong
// without being an instant-kill button. Tuned via simulation.
const MAX_HIT_FRACTION = 0.85; // subido desde 0.45: con ventaja elemental (x2), ese tope se
// alcanzaba con casi cualquier movimiento de potencia media, así que todos los golpes
// "grandes" acababan dando el mismo daño sin importar la potencia real del movimiento.
// 0.85 sigue evitando el KO de un solo golpe con las combinaciones más extremas
// (potencia 150-250 + ventaja de tipo) sin aplanar la potencia en el resto de casos.
const DMG_SCALE = 0.16;

function activePlayerInst() { return runState.party[battle.playerActive]; }
function activeEnemyInst() { return battle.enemyTeam[battle.enemyActive]; }

function firstAliveIndex(list) {
  for (let i = 0; i < list.length; i++) if (list[i].currentHP > 0) return i;
  return -1;
}

function startBattle(kind) {
  const nodeIndex = runState.depth + 1;
  let enemyTeam, trainerName = null;

  if (kind === 'wild') {
    const species = pick(POKEMON);
    const level = enemyLevelFor('wild');
    enemyTeam = [createInstance(species, level)];
    markSeen(species.key);
  } else if (kind === 'trainer') {
    const teamSize = teamSizeFor('trainer', nodeIndex);
    const speciesList = randomDistinctSpecies(teamSize);
    const level = enemyLevelFor('trainer');
    enemyTeam = speciesList.map(s => createInstance(s, level));
    speciesList.forEach(s => markSeen(s.key));
    trainerName = `Entrenador/a ${pick(NAME_POOL)}`;
  } else { // boss
    const bossTeamSize = teamSizeFor('boss', nodeIndex);
    const speciesList = randomDistinctSpecies(bossTeamSize);
    const level = enemyLevelFor('boss');
    enemyTeam = speciesList.map(s => createInstance(s, level));
    speciesList.forEach(s => markSeen(s.key));
    trainerName = `${pick(BOSS_TITLES)} ${pick(NAME_POOL)}`;
  }

  battle = {
    kind, trainerName, enemyTeam, enemyActive: 0,
    playerActive: firstAliveIndex(runState.party),
    log: ['¡Comienza el combate!'],
    turnBusy: false, ended: false, awaitingForcedSwitch: false, capturing: false,
  };
  renderBattle();
}

function logMsg(msg) {
  battle.log.push(msg);
  if (battle.log.length > 40) battle.log.shift();
}

function pickEnemyMove() {
  const atkInst = activeEnemyInst();
  const defInst = activePlayerInst();
  const defSpecies = getSpecies(defInst.speciesKey);
  const moves = atkInst.moves;
  if (Math.random() < 0.7) {
    let best = moves[0], bestScore = -1;
    moves.forEach(mKey => {
      const m = MOVES[mKey];
      const score = m.power * (m.accuracy / 100) * getEffectiveness(m.type, defSpecies.types);
      if (score > bestScore) { bestScore = score; best = mKey; }
    });
    return best;
  }
  return pick(moves);
}

function renderBattleCard(inst, isPlayer) {
  const sp = getSpecies(inst.speciesKey);
  const pct = Math.max(0, Math.round((inst.currentHP / inst.maxHP) * 100));
  return `
    <div class="mon-card ${inst.currentHP <= 0 ? 'fainted' : ''} ${(!isPlayer && battle.capturing) ? 'capturing' : ''}" id="${isPlayer ? 'player-card' : 'enemy-card'}">
      <div class="mon-top">
        ${monAvatarHTML(sp)}
        <div class="mon-info">
          <div class="mon-name">${esc(sp.name)} <span class="muted">Nv.${inst.level}</span></div>
          <div class="mon-sub">${typeBadges(sp.types)}</div>
        </div>
      </div>
      <div class="hp-bar-outer"><div class="hp-bar-inner ${hpBarClass(pct)}" style="width:${pct}%"></div></div>
      <div class="hp-text">${Math.max(0, inst.currentHP)}/${inst.maxHP} PS</div>
    </div>`;
}

function renderBattle() {
  const p = activePlayerInst();
  const e = activeEnemyInst();
  const title = battle.kind === 'wild' ? 'Encuentro Salvaje'
    : battle.kind === 'boss' ? `Jefe: ${esc(battle.trainerName)}`
    : `${esc(battle.trainerName)}`;

  const canAct = !battle.turnBusy && !battle.ended;
  const forcedSwitch = battle.awaitingForcedSwitch;

  let actionPanel;
  if (forcedSwitch) {
    actionPanel = renderSwitchPanel(true);
  } else if (battle.subPanel === 'switch') {
    actionPanel = renderSwitchPanel(false);
  } else if (battle.subPanel === 'items') {
    actionPanel = renderItemPanel();
  } else if (battle.subPanel === 'capture') {
    actionPanel = renderCapturePanel();
  } else {
    const moveButtons = p.moves.map((mKey) => {
      const m = MOVES[mKey];
      return `<button class="move-btn" ${canAct ? '' : 'disabled'} onclick="onPlayerAction({type:'move', moveKey:'${mKey}'})">
        <span class="move-name">${esc(m.name)}</span>
        <span class="move-meta">${typeBadge(m.type)} · Pot ${m.power} · Prec ${m.accuracy}%</span>
      </button>`;
    }).join('');
    const canCapture = battle.kind === 'wild' && runState.party.length < 3 && e.currentHP > 0;
    actionPanel = `
      <div class="move-grid">${moveButtons}</div>
      <div class="action-row ${battle.kind === 'wild' ? 'three' : ''}">
        <button class="btn btn-outline btn-small" ${canAct ? '' : 'disabled'} onclick="battle.subPanel='switch'; renderBattle();">Cambiar</button>
        <button class="btn btn-outline btn-small" ${canAct ? '' : 'disabled'} onclick="battle.subPanel='items'; renderBattle();">Objetos</button>
        ${battle.kind === 'wild' ? `<button class="btn btn-outline btn-small" ${canAct && canCapture ? '' : 'disabled'} onclick="battle.subPanel='capture'; renderBattle();">Capturar</button>` : ''}
      </div>
      ${battle.kind === 'wild' ? `<button class="btn btn-warn btn-small mt" ${canAct ? '' : 'disabled'} onclick="onPlayerAction({type:'flee'})">Huir</button>` : ''}
    `;
  }

  showHTML(`
    <p class="screen-title">${title}</p>
    <div class="battle-arena">
      ${renderBattleCard(e, false)}
      <div class="vs-label">VS</div>
      ${renderBattleCard(p, true)}
    </div>
    <div class="battle-log">${battle.log.slice(-6).map(m => `<p>${esc(m)}</p>`).join('')}</div>
    ${actionPanel}
  `);
}

function renderSwitchPanel(forced) {
  const options = runState.party.map((inst, idx) => {
    const sp = getSpecies(inst.speciesKey);
    const disabled = inst.currentHP <= 0 || idx === battle.playerActive;
    return `<button class="node-card" ${disabled ? 'disabled' : ''} style="${disabled ? 'opacity:.45;' : ''}" onclick="onPlayerAction({type:'switch', targetIndex:${idx}})">
      ${monAvatarHTML(sp, 'sm')}
      <span><span class="node-label">${esc(sp.name)} Nv.${inst.level}</span><div class="node-desc">${inst.currentHP}/${inst.maxHP} PS</div></span>
    </button>`;
  }).join('');
  return `
    <p class="muted">${forced ? '¡Tu Pokémon se ha debilitado! Elige el siguiente:' : 'Elige a quién enviar:'}</p>
    <div class="node-options">${options}</div>
    ${forced ? '' : `<button class="btn btn-outline btn-small mt" onclick="battle.subPanel=null; renderBattle();">Cancelar</button>`}
  `;
}

function renderItemPanel() {
  const potions = ['potion', 'potionMax'].filter(id => (runState.inventory[id] || 0) > 0);
  const rows = potions.length ? potions.map(id => {
    const it = ITEMS[id];
    return `<div class="item-card"><div><div class="item-name">${esc(it.name)} (${runState.inventory[id]})</div><div class="item-desc">${esc(it.desc)}</div></div>
      <button class="btn btn-small" onclick="onPlayerAction({type:'item', itemId:'${id}'})">Usar</button></div>`;
  }).join('') : '<p class="muted">No tienes objetos curativos.</p>';
  return `
    <div class="stack">${rows}</div>
    <button class="btn btn-outline btn-small mt" onclick="battle.subPanel=null; renderBattle();">Cancelar</button>
  `;
}

function renderCapturePanel() {
  const spheres = ['esferaSuperior', 'esferaBasica'].filter(id => (runState.inventory[id] || 0) > 0);
  const e = activeEnemyInst();
  const hpPct = Math.round((e.currentHP / e.maxHP) * 100);
  let rows = `<div class="item-card"><div><div class="item-name">Captura a mano</div><div class="item-desc">Sin objeto de captura. HP rival: ${hpPct}%</div></div>
    <button class="btn btn-small" onclick="onPlayerAction({type:'capture', itemId:null})">Intentar</button></div>`;
  rows += spheres.map(id => {
    const it = ITEMS[id];
    return `<div class="item-card"><div><div class="item-name">${esc(it.name)} (${runState.inventory[id]})</div><div class="item-desc">${esc(it.desc)}</div></div>
      <button class="btn btn-small" onclick="onPlayerAction({type:'capture', itemId:'${id}'})">Intentar</button></div>`;
  }).join('');
  return `
    <div class="stack">${rows}</div>
    <button class="btn btn-outline btn-small mt" onclick="battle.subPanel=null; renderBattle();">Cancelar</button>
  `;
}

/* ---------- battle action dispatch ---------- */
async function onPlayerAction(action) {
  if (!battle || battle.turnBusy || battle.ended) return;
  battle.subPanel = null;
  battle.turnBusy = true;
  renderBattle();

  if (action.type === 'move') await turnMove(action.moveKey);
  else if (action.type === 'switch') await turnSwitch(action.targetIndex);
  else if (action.type === 'item') await turnItem(action.itemId);
  else if (action.type === 'capture') await turnCapture(action.itemId);
  else if (action.type === 'flee') await turnFlee();

  if (battle && !battle.ended) {
    battle.turnBusy = false;
    renderBattle();
  }
}

async function executeMove(side, moveKey) {
  const attacker = side === 'player' ? activePlayerInst() : activeEnemyInst();
  const defender = side === 'player' ? activeEnemyInst() : activePlayerInst();
  if (attacker.currentHP <= 0 || defender.currentHP <= 0) return;
  const attackerSp = getSpecies(attacker.speciesKey);
  const defenderSp = getSpecies(defender.speciesKey);
  const move = MOVES[moveKey];

  logMsg(`${attackerSp.name} usa ${move.name}.`);
  renderBattle();
  await delay(450);

  if (Math.random() * 100 > move.accuracy) {
    logMsg(`¡${attackerSp.name} falló el ataque!`);
    renderBattle();
    await delay(500);
    return;
  }

  const mult = getEffectiveness(move.type, defenderSp.types);
  if (mult === 0) {
    logMsg(`No afecta a ${defenderSp.name}...`);
    renderBattle();
    await delay(500);
    return;
  }
  const raw = move.power * (attacker.atk / Math.max(1, defender.def)) * DMG_SCALE;
  const variance = 0.85 + Math.random() * 0.15;
  let dmg = Math.max(1, Math.round(raw * mult * variance));
  dmg = Math.min(dmg, Math.max(1, Math.round(defender.maxHP * MAX_HIT_FRACTION)));
  defender.currentHP = Math.max(0, defender.currentHP - dmg);

  let effText = '';
  if (mult >= 2) effText = ' ¡Es muy efectivo!';
  else if (mult <= 0.5) effText = ' No es muy efectivo…';
  logMsg(`${defenderSp.name} recibe ${dmg} de daño.${effText}`);
  renderBattle();
  await delay(500);
}

async function turnMove(moveKey) {
  const initialEnemyInst = activeEnemyInst();
  const enemyMove = pickEnemyMove();
  // Speed determines turn order, but with a ±10% random jitter so a small
  // speed edge doesn't guarantee first move every time (big gaps still win out).
  const entries = [
    { side: 'player', move: moveKey, spd: activePlayerInst().spd * (0.9 + Math.random() * 0.2) },
    { side: 'enemy', move: enemyMove, spd: activeEnemyInst().spd * (0.9 + Math.random() * 0.2) },
  ].sort((a, b) => b.spd - a.spd);

  for (const entry of entries) {
    if (!battle || battle.ended) return;
    if (entry.side === 'enemy' && activeEnemyInst() !== initialEnemyInst) continue;
    const attackerInst = entry.side === 'player' ? activePlayerInst() : activeEnemyInst();
    const defenderInst = entry.side === 'player' ? activeEnemyInst() : activePlayerInst();
    if (attackerInst.currentHP <= 0 || defenderInst.currentHP <= 0) continue;
    await executeMove(entry.side, entry.move);
    if (activeEnemyInst().currentHP <= 0) { await handleEnemyFaint(); if (!battle || battle.ended) return; }
    if (activePlayerInst().currentHP <= 0) { await handlePlayerFaint(); if (battle.ended || battle.awaitingForcedSwitch) return; }
  }
}

async function turnSwitch(targetIndex) {
  const wasForced = battle.awaitingForcedSwitch;
  battle.playerActive = targetIndex;
  const sp = getSpecies(activePlayerInst().speciesKey);
  logMsg(`¡Adelante, ${sp.name}!`);
  battle.awaitingForcedSwitch = false;
  renderBattle();
  await delay(400);
  if (wasForced) return;
  if (activeEnemyInst().currentHP > 0) {
    await executeMove('enemy', pickEnemyMove());
    if (activeEnemyInst().currentHP <= 0) { await handleEnemyFaint(); return; }
    if (activePlayerInst().currentHP <= 0) { await handlePlayerFaint(); }
  }
}

async function turnItem(itemId) {
  const it = ITEMS[itemId];
  const p = activePlayerInst();
  runState.inventory[itemId] = Math.max(0, (runState.inventory[itemId] || 0) - 1);
  p.currentHP = Math.min(p.maxHP, p.currentHP + it.value);
  logMsg(`Usas ${it.name}. ${getSpecies(p.speciesKey).name} recupera vida.`);
  renderBattle();
  await delay(500);
  if (activeEnemyInst().currentHP > 0) {
    await executeMove('enemy', pickEnemyMove());
    if (activeEnemyInst().currentHP <= 0) { await handleEnemyFaint(); return; }
    if (activePlayerInst().currentHP <= 0) { await handlePlayerFaint(); }
  }
}

async function turnCapture(itemId) {
  const e = activeEnemyInst();
  const sp = getSpecies(e.speciesKey);
  const bonus = itemId ? ITEMS[itemId].value : 0;
  if (itemId) runState.inventory[itemId] = Math.max(0, (runState.inventory[itemId] || 0) - 1);

  logMsg(`¡Intentas capturar a ${sp.name}!`);
  battle.capturing = true;
  renderBattle();
  await delay(1150);
  battle.capturing = false;

  const hpPct = e.currentHP / e.maxHP;
  const bst = sp.baseHP + sp.baseAtk + sp.baseDef + sp.baseSpd;
  const statPenalty = clamp((bst - 300) / 1200, 0, 0.18);
  const chance = clamp(0.32 - statPenalty + (1 - hpPct) * 0.5 + bonus, 0.05, 0.95);
  const success = Math.random() < chance;

  if (success) {
    const caught = createInstance(sp, e.level);
    runState.party.push(caught);
    markCaught(sp.key);
    if (!runState.caughtThisRun.includes(sp.key)) runState.caughtThisRun.push(sp.key);
    logMsg(`¡Capturaste a ${sp.name}!`);
    battle.ended = true;
    renderBattle();
    await delay(600);
    await onBattleWin({ captured: true });
    return;
  }

  logMsg(`${sp.name} se ha liberado. ¡Sigue luchando!`);
  renderBattle();
  await delay(500);
  await executeMove('enemy', pickEnemyMove());
  if (activePlayerInst().currentHP <= 0) { await handlePlayerFaint(); }
}

async function turnFlee() {
  const success = Math.random() < 0.9;
  if (success) {
    logMsg('¡Consigues escapar!');
    battle.ended = true;
    renderBattle();
    await delay(500);
    await onBattleWin({ fled: true });
    return;
  }
  logMsg('¡No has podido escapar!');
  renderBattle();
  await delay(400);
  await executeMove('enemy', pickEnemyMove());
  if (activePlayerInst().currentHP <= 0) { await handlePlayerFaint(); }
}

async function handleEnemyFaint() {
  const sp = getSpecies(activeEnemyInst().speciesKey);
  logMsg(`¡${sp.name} rival se ha debilitado!`);
  renderBattle();
  await delay(500);
  const hasNext = battle.enemyTeam.slice(battle.enemyActive + 1).some(c => c.currentHP > 0);
  if (!hasNext) {
    battle.ended = true;
    renderBattle();
    await delay(300);
    await onBattleWin({});
    return;
  }
  for (let i = battle.enemyActive + 1; i < battle.enemyTeam.length; i++) {
    if (battle.enemyTeam[i].currentHP > 0) { battle.enemyActive = i; break; }
  }
  const nextSp = getSpecies(activeEnemyInst().speciesKey);
  logMsg(`${esc(battle.trainerName || 'El rival')} envía a ${nextSp.name}.`);
  renderBattle();
  await delay(500);
}

async function handlePlayerFaint() {
  const sp = getSpecies(activePlayerInst().speciesKey);
  logMsg(`¡${sp.name} se ha debilitado!`);
  const anyAlive = runState.party.some(p => p.currentHP > 0);
  if (!anyAlive) {
    battle.ended = true;
    renderBattle();
    await delay(600);
    finishRun('defeat');
    return;
  }
  battle.awaitingForcedSwitch = true;
  renderBattle();
}

async function onBattleWin(opts) {
  opts = opts || {};
  if (!opts.fled) {
    const reward = battle.kind === 'wild' ? 8 + rand(8)
      : battle.kind === 'trainer' ? 15 + rand(11)
      : 40 + rand(21);
    runState.credits += reward;
    runState.party.forEach(p => { if (p.currentHP > 0) p.level = Math.min(MAX_LEVEL, p.level + 1); });
    logMsg(`Ganas ${reward} Créditos.`);
  }
  renderBattle();
  await delay(900);
  const kind = battle.kind;
  battle = null;
  advanceAfterNode(kind);
}

/* ---------- RUN END / SUMMARY ---------- */
function finishRun(result) {
  const floorReached = runState.depth;
  const caughtCount = runState.caughtThisRun.length;
  if (floorReached > meta.bestFloor) meta.bestFloor = floorReached;
  const bonus = floorReached * 3 + caughtCount * 5;
  meta.credits += runState.credits + (result === 'victory' ? 50 : 0) + bonus;
  saveMeta();

  const titleMap = {
    victory: '¡Has conquistado la mazmorra!',
    defeat: 'Tu equipo se ha debilitado por completo',
    abandoned: 'Partida abandonada',
  };
  const critterRows = runState.caughtThisRun.map(key => {
    const sp = getSpecies(key);
    return `<span class="pill">${esc(sp.name)}</span>`;
  }).join(' ');

  showHTML(`
    <p class="screen-title">${titleMap[result] || 'Fin de la partida'}</p>
    <div class="stack center">
      <p>Piso alcanzado: <strong>${floorReached}/${FINAL_DEPTH}</strong></p>
      <p>Pokémon capturados en esta partida: <strong>${caughtCount}</strong></p>
      <div class="row" style="justify-content:center">${critterRows || '<span class="muted">Ninguno</span>'}</div>
      <p class="muted">Créditos totales ganados esta partida: ${runState.credits + (result === 'victory' ? 50 : 0) + bonus}</p>
    </div>
    <button class="btn mt" onclick="runState=null; renderMenu();">Volver al menú</button>
  `);
}

/* ---------------------- TYPE CHART TABLE (how-to-play) --------------- */
function renderTypeChartTable() {
  const wrap = document.getElementById('type-chart-wrap');
  if (!wrap) return;
  const head = `<tr><th scope="col">Ataca ↓ / Defiende →</th>${TYPES.map(t => `<th scope="col">${esc(TYPE_NAMES_ES[t])}</th>`).join('')}</tr>`;
  const rows = TYPES.map(atk => {
    const cells = TYPES.map(def => {
      const m = getEffectiveness(atk, [def]);
      return `<td>${m === 1 ? 'x1' : 'x' + m}</td>`;
    }).join('');
    return `<tr><th scope="row">${esc(TYPE_NAMES_ES[atk])}</th>${cells}</tr>`;
  }).join('');
  wrap.innerHTML = `
    <table class="type-chart-table">
      <caption>Ataque (fila) contra Defensor (columna) — multiplicador de daño</caption>
      <thead>${head}</thead>
      <tbody>${rows}</tbody>
    </table>`;
}

/* ---------------------- INIT ---------------------------------- */
async function loadData() {
  const [typeChartRaw, movesRaw, pokedexRaw] = await Promise.all([
    fetch('type-chart.json').then(r => r.json()),
    fetch('moves-data.json').then(r => r.json()),
    fetch('pokedex-data.json').then(r => r.json()),
  ]);
  TYPES = typeChartRaw.types;
  TYPE_NAMES_ES = typeChartRaw.namesEs;
  TYPE_CHART = typeChartRaw.chart;
  MOVES = movesRaw;
  POKEMON = pokedexRaw;
  POKEMON_BY_KEY = {};
  POKEMON.forEach(p => { POKEMON_BY_KEY[p.key] = p; });
  STARTER_POOL = STARTER_CONFIG
    .map(cfg => {
      const sp = POKEMON_BY_KEY[cfg.key];
      if (!sp) return null;
      return Object.assign({}, sp, { cost: cfg.cost });
    })
    .filter(Boolean);
  DEFAULT_UNLOCKED = STARTER_POOL.filter(c => c.cost === 0).map(c => c.key);
}

async function init() {
  try {
    await loadData();
  } catch (e) {
    root().innerHTML = '<p class="loading-msg">No se pudieron cargar los datos del juego. Recarga la página.</p>';
    console.error(e);
    return;
  }
  meta = loadMeta();
  renderMenu();
  renderTypeChartTable();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
