'use strict';
/* ============================================================
   ONE-OFF BUILD SCRIPT — run manually with `node build/fetch-pokedata.js`.
   Fetches Gen 1-2 Pokémon (#1-251), all 18 types, and the moves they use
   from PokeAPI (https://pokeapi.co, free public REST API), then writes
   processed, minimized, static JSON assets into the project root:
     pokedex-data.json, moves-data.json, type-chart.json
   The live game never calls PokeAPI at runtime — this is a build-time
   tool only. No official sprites/artwork are fetched or used; only
   plain-text stats/types/move data.
   ============================================================ */

const fs = require('fs');
const path = require('path');

const OUT_DIR = path.join(__dirname, '..');
const API = 'https://pokeapi.co/api/v2';

function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

async function getJSON(url, tries = 4) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return await res.json();
    } catch (e) {
      if (i === tries - 1) throw e;
      await delay(400 * (i + 1));
    }
  }
}

const ALL_TYPES = [
  'normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost',
  'steel', 'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon',
  'dark', 'fairy',
];

// Special-case display name fixes for PokeAPI's kebab-case names.
const NAME_FIXES = {
  'nidoran-f': 'Nidoran(H)',
  'nidoran-m': 'Nidoran(M)',
  'mr-mime': 'Mr. Mime',
  'farfetchd': "Farfetch'd",
  'ho-oh': 'Ho-Oh',
  'mime-jr': 'Mime Jr.',
};

function displayName(pokeApiName) {
  if (NAME_FIXES[pokeApiName]) return NAME_FIXES[pokeApiName];
  return pokeApiName
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function esName(namesArr) {
  const hit = namesArr.find(n => n.language && n.language.name === 'es');
  return hit ? hit.name : null;
}

async function fetchTypeChart() {
  console.log('Fetching type chart (18 types)...');
  const types = {};
  for (const t of ALL_TYPES) {
    const data = await getJSON(`${API}/type/${t}`);
    const row = {};
    (data.damage_relations.double_damage_to || []).forEach(x => { row[x.name] = 2; });
    (data.damage_relations.half_damage_to || []).forEach(x => { row[x.name] = 0.5; });
    (data.damage_relations.no_damage_to || []).forEach(x => { row[x.name] = 0; });
    types[t] = { nameEs: esName(data.names) || t, row };
    console.log(`  ${t} done`);
    await delay(120);
  }
  return types;
}

async function fetchMoveDetail(moveName, cache) {
  if (cache.has(moveName)) return cache.get(moveName);
  const data = await getJSON(`${API}/move/${moveName}`);
  const info = {
    name: esName(data.names) || displayName(data.name),
    type: data.type.name,
    power: data.power || 0,
    accuracy: data.accuracy == null ? 100 : data.accuracy,
    damageClass: data.damage_class ? data.damage_class.name : 'physical',
  };
  cache.set(moveName, info);
  return info;
}

// Pick 6 real damaging moves a Pokémon can actually learn: prefer STAB
// (same type as the Pokémon), plus at least one coverage move of a
// different type when the learnset allows it.
async function pickMoves(pokeData, moveCache) {
  const types = pokeData.types.map(t => t.type.name);
  // Gather level-up moves across all version groups (red-blue first,
  // falling back to any group) so small learnsets still yield 4 options.
  const levelUpNames = [];
  const seen = new Set();
  const groupsPriority = ['red-blue', 'yellow', 'firered-leafgreen', 'ultra-sun-ultra-moon', 'sword-shield'];
  for (const group of groupsPriority) {
    pokeData.moves.forEach(m => {
      const vgd = m.version_group_details.find(
        d => d.version_group.name === group && d.move_learn_method.name === 'level-up'
      );
      if (vgd && !seen.has(m.move.name)) {
        seen.add(m.move.name);
        levelUpNames.push({ name: m.move.name, level: vgd.level_learned_at });
      }
    });
  }
  // Fallback: any level-up method at all, in case a Pokémon has none of the above groups.
  if (levelUpNames.length < 6) {
    pokeData.moves.forEach(m => {
      const vgd = m.version_group_details.find(d => d.move_learn_method.name === 'level-up');
      if (vgd && !seen.has(m.move.name)) {
        seen.add(m.move.name);
        levelUpNames.push({ name: m.move.name, level: vgd.level_learned_at });
      }
    });
  }
  levelUpNames.sort((a, b) => a.level - b.level);

  // Fetch details only for a bounded candidate slice to keep request count sane.
  const candidateNames = levelUpNames.slice(0, 30).map(m => m.name);
  const details = [];
  for (const name of candidateNames) {
    try {
      const info = await fetchMoveDetail(name, moveCache);
      if (info.power > 0) details.push({ key: name, ...info });
      await delay(90);
    } catch (e) {
      console.warn(`    move fetch failed for ${name}: ${e.message}`);
    }
  }

  if (details.length === 0) {
    // Ultimate fallback: give it Tackle (normal-type, universal).
    const tackle = await fetchMoveDetail('tackle', moveCache);
    return ['tackle'];
  }

  const stab = details.filter(d => types.includes(d.type));
  const coverage = details.filter(d => !types.includes(d.type));
  stab.sort((a, b) => b.power - a.power);
  coverage.sort((a, b) => b.power - a.power);

  const chosen = [];
  const chosenKeys = new Set();
  function add(d) { if (d && !chosenKeys.has(d.key)) { chosen.push(d.key); chosenKeys.add(d.key); } }

  // Up to 3 strong STAB moves.
  stab.slice(0, 3).forEach(add);
  // At least 1 coverage move of a different type, if available.
  if (coverage.length) add(coverage[0]);
  // Fill remaining slots with the next best options (STAB first, then coverage, then anything).
  const rest = [...stab.slice(3), ...coverage.slice(1), ...details].sort((a, b) => b.power - a.power);
  for (const d of rest) {
    if (chosen.length >= 6) break;
    add(d);
  }
  return chosen.slice(0, 6);
}

async function main() {
  const typeChart = await fetchTypeChart();

  console.log('Fetching Pokémon #1-251 (Gen I-II)...');
  const moveCache = new Map();
  const pokedex = [];

  for (let id = 1; id <= 251; id++) {
    const data = await getJSON(`${API}/pokemon/${id}`);
    const stats = {};
    data.stats.forEach(s => { stats[s.stat.name] = s.base_stat; });
    const moves = await pickMoves(data, moveCache);
    const entry = {
      id: data.id,
      key: data.name,
      name: displayName(data.name),
      types: data.types.sort((a, b) => a.slot - b.slot).map(t => t.type.name),
      baseHP: stats.hp,
      baseAtk: Math.round((stats.attack + stats['special-attack']) / 2),
      baseDef: Math.round((stats.defense + stats['special-defense']) / 2),
      baseSpd: stats.speed,
      moves,
    };
    pokedex.push(entry);
    console.log(`  #${id} ${entry.name} (${entry.types.join('/')}) moves: ${moves.join(', ')}`);
    await delay(150);
  }

  // Assemble moves-data.json from the cache (only moves actually used survive).
  const usedMoveKeys = new Set();
  pokedex.forEach(p => p.moves.forEach(m => usedMoveKeys.add(m)));
  const movesData = {};
  usedMoveKeys.forEach(k => { if (moveCache.has(k)) movesData[k] = moveCache.get(k); });

  // Assemble type-chart.json.
  const typeChartOut = { types: ALL_TYPES, namesEs: {}, chart: {} };
  ALL_TYPES.forEach(t => {
    typeChartOut.namesEs[t] = typeChart[t].nameEs;
    typeChartOut.chart[t] = typeChart[t].row;
  });

  fs.writeFileSync(path.join(OUT_DIR, 'pokedex-data.json'), JSON.stringify(pokedex));
  fs.writeFileSync(path.join(OUT_DIR, 'moves-data.json'), JSON.stringify(movesData));
  fs.writeFileSync(path.join(OUT_DIR, 'type-chart.json'), JSON.stringify(typeChartOut));

  console.log(`\nDone. ${pokedex.length} Pokémon, ${Object.keys(movesData).length} distinct moves, ${ALL_TYPES.length} types.`);
}

main().catch(e => { console.error(e); process.exit(1); });
