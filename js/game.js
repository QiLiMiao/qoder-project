/* ============ 最后一片大陆 · 核心玩法 ============ */
(function () {
  'use strict';

  /* ---------- 配置 ---------- */
  const N = 8, TICK = 1.6;
  const ECO_TH = [0, 10, 22, 38, 60];
  const START_RES = { wood: 24, stone: 16, energy: 20 };
  const COSTS = {
    explore: { energy: 5 },
    tree: { wood: 4 },
    spring: { stone: 8 },
    house: { wood: 10, stone: 6 },
    windmill: { wood: 8, stone: 8 },
    lifetree: { wood: 24, stone: 16, energy: 12 },
    excavate: { energy: 5 }
  };
  const BUILDING_SET = new Set(['house', 'windmill', 'spring', 'lifetree']);
  const RULES = {
    verdant:   { name: '蔓延之绿', icon: 'i-leaf',   color: '#46b96a', cost: { energy: 8, stone: 6 },   desc: '森林与树木向空地蔓延的速度 ×3，生长更快。' },
    farwaters: { name: '远泽之泉', icon: 'i-water',  color: '#3d9be9', cost: { energy: 10, stone: 8 },  desc: '水源滋养范围扩大到 2 格，润泽更多土地。' },
    resonance: { name: '共鸣构筑', icon: 'i-link',   color: '#f0a32e', cost: { energy: 12, stone: 10 }, desc: '建筑与相邻树木彼此共鸣，产出额外 +1。' },
    terra:     { name: '大地拓展', icon: 'i-expand', color: '#c65fd1', cost: { energy: 14, stone: 12 }, desc: '房屋与风车有几率在岛缘生成全新地块。' },
    transmute: { name: '丰饶转化', icon: 'i-swap',   color: '#ef6a5a', cost: { energy: 10, stone: 8 },  desc: '风车额外产出木材，房屋额外产出石料。' }
  };
  const BUILDINGS = {
    tree:     { name: '树木',     icon: 'i-tree',     desc: '成熟后每轮 +1 木材，会向空地蔓延。' },
    spring:   { name: '泉眼',     icon: 'i-spring',   desc: '滋养周围土地，使其润泽，提升生态。' },
    house:    { name: '房屋',     icon: 'i-house',    desc: '每轮 +1 能量，相邻地块产出 +1。' },
    windmill: { name: '风车',     icon: 'i-windmill', desc: '每轮 +2 能量，驱动探索与规则。' },
    lifetree: { name: '生命之树', icon: 'i-lifetree', desc: '大陆奇迹，生态 +12，每轮 +1 木 +1 能。' }
  };
  const RES_META = { wood: { icon: 'i-wood', cls: 'c-wood', name: '木' }, stone: { icon: 'i-stone', cls: 'c-stone', name: '石' }, energy: { icon: 'i-energy', cls: 'c-energy', name: '能' } };
  const TERRAIN_NAME = { empty: '空地', forest: '森林', water: '水源', ore: '矿脉', ruins: '古代遗迹', crystal: '源晶簇' };
  const TERRAIN_COLOR = { empty: '#3aa76d', forest: '#2f9e57', water: '#2b7fc4', ore: '#5f6b78', ruins: '#c9870a', crystal: '#9b45a6' };

  /* ---------- 工具 ---------- */
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function fmtTime(s) { s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function shuffle(arr, rng) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1));[a[i], a[j]] = [a[j], a[i]]; } return a; }
  function ico(id, cls) { return `<svg class="${cls || ''}"><use href="#${id}"/></svg>`; }

  /* ---------- 状态 ---------- */
  const S = {
    phase: 'intro', paused: false, speed: 1, muted: false,
    tiles: [], byKey: new Map(), rng: Math.random, seed: 1,
    res: { ...START_RES }, eco: 0, ecoLv: 1,
    tasks: [], rulesOffered: [], rulesActive: new Set(), ruleDiscount: 1,
    stats: null, discoveries: [], time: 0, selected: null, hover: null,
    hintStage: 0, won: false, runs: 0,
    guide: { active: false, step: 0, base: null }
  };
  function freshStats() { return { explored: 0, built: 0, trees: 0, springs: 0, chops: 0, mines: 0, rules: 0, created: 0, ruins: 0, crystals: 0 }; }

  const renderer = new window.Renderer($('world'));
  const audio = window.AudioEngine;

  /* ---------- DOM ---------- */
  const el = {
    res: { wood: $('res-wood'), stone: $('res-stone'), energy: $('res-energy') },
    timer: $('timer').querySelector('span'),
    taskList: $('task-list'), taskCount: $('task-count'),
    ecoLv: $('eco-lv'), ecoFill: $('eco-fill'), ecoScore: $('eco-score'),
    ruleList: $('rule-list'), ruleCount: $('rule-count'),
    chipTasks: $('chip-tasks'), chipRules: $('chip-rules'),
    inspector: $('inspector'), inspIcon: $('insp-icon'), inspName: $('insp-name'), inspDesc: $('insp-desc'), inspActions: $('insp-actions'),
    toasts: $('toasts'), intro: $('intro'), introGoal: $('intro-goal-txt'),
    help: $('help'), settle: $('settle'), settleStats: $('settle-stats'), settleDisc: $('settle-disc'),
    settleEco: $('settle-eco-txt'), settleBest: $('settle-best'),
    restartPop: $('restart-pop'), btnSound: $('btn-sound'), btnSpeed: $('btn-speed'),
    guide: $('guide'), gTop: $('g-top'), gBottom: $('g-bottom'), gLeft: $('g-left'), gRight: $('g-right'),
    gRing: $('g-ring'), gCard: $('g-card'), gStep: $('g-step'), gTitle: $('g-title'), gText: $('g-text'),
    gNext: $('guide-next'), gSkip: $('guide-skip')
  };

  /* ---------- 世界生成 ---------- */
  function cellRand(c, r) {
    let h = S.seed ^ Math.imul(c + 1, 374761393) ^ Math.imul(r + 1, 668265263);
    h = Math.imul(h ^ h >>> 13, 1274126177);
    return ((h ^ h >>> 16) >>> 0) / 4294967296;
  }
  function neighbors(t) {
    const out = [];
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = S.byKey.get((t.c + dc) + ',' + (t.r + dr));
      if (n) out.push(n);
    }
    return out;
  }
  function weightedTerrain(rng) {
    const table = [['empty', 30], ['forest', 22], ['water', 12], ['ore', 14], ['ruins', 6], ['crystal', 3], ['turbulence', 13]];
    let total = 0; for (const [, w] of table) total += w;
    let x = rng() * total;
    for (const [k, w] of table) { x -= w; if (x <= 0) return k; }
    return 'empty';
  }

  function genWorld() {
    S.seed = (Math.random() * 1e9) | 0;
    S.rng = mulberry32(S.seed);
    const rng = S.rng;
    S.tiles = []; S.byKey.clear();
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const dx = c - (N - 1) / 2, dy = r - (N - 1) / 2;
      const d = Math.hypot(dx, dy);
      const noise = (cellRand(c, r) - 0.5) * 1.05;
      let land = d + noise * 0.6 <= 3.62;
      if ((c === 3 || c === 4) && (r === 3 || r === 4)) land = true;
      const t = {
        c, r, land, type: land ? 'mist' : 'void', hidden: null, building: null,
        growth: 0, mature: false, fertile: false, lush: 0, nourished: false,
        oreCharges: 3, mineCd: 0, excavated: false, attuned: false,
        reveal: 1, rise: 1, phase: rng() * 6.28, variant: rng() < 0.5,
        spinAng: rng() * 6.28, spinSpeed: 1.2, created: false
      };
      S.tiles.push(t); S.byKey.set(c + ',' + r, t);
    }
    // 起始揭示：中心空地 + 两片森林 + 水源 + 空地，开局即有生机与建造空间
    const center = S.byKey.get('3,3');
    center.type = 'empty';
    const cn = neighbors(center).filter(n => n.land);
    const picks = shuffle(cn, rng);
    const startTypes = ['forest', 'water', 'empty', 'forest'];
    picks.forEach((t, i) => { if (startTypes[i]) t.type = startTypes[i]; });
    // 迷雾隐藏地形：保底 + 加权随机
    const mists = shuffle(S.tiles.filter(t => t.land && t.type === 'mist'), rng);
    const guaranteed = ['ore', 'ore', 'water', 'ruins', 'ruins', 'crystal', 'turbulence', 'turbulence', 'turbulence'];
    mists.forEach((t, i) => { t.hidden = i < guaranteed.length ? guaranteed[i] : weightedTerrain(rng); });
  }

  function genTasks() {
    const rng = S.rng;
    const ex = rng() < 0.4 ? 4 : 3;
    const tr = rng() < 0.4 ? 3 : 2;
    S.tasks = [
      { id: 'explore', icon: 'i-compass', label: '驱散迷雾', desc: `探索 ${ex} 块未知地块`, target: ex, get: () => S.stats.explored, done: false },
      { id: 'spring', icon: 'i-spring', label: '唤醒水源', desc: '建造 1 座泉眼', target: 1, get: () => S.stats.springs, done: false },
      { id: 'trees', icon: 'i-tree', label: '播撒绿意', desc: `种植 ${tr} 棵树`, target: tr, get: () => S.stats.trees, done: false },
      { id: 'rule', icon: 'i-rule', label: '改写法则', desc: '激活 1 条世界规则', target: 1, get: () => S.rulesActive.size, done: false },
      { id: 'eco', icon: 'i-leaf', label: '生态复苏', desc: '生态等级达到 Lv.3', target: 3, get: () => S.ecoLv, done: false }
    ];
  }

  function genRules() {
    S.rulesOffered = shuffle(Object.keys(RULES), S.rng).slice(0, 3);
    S.rulesActive = new Set(); S.ruleDiscount = 1;
  }

  /* ---------- 资源 ---------- */
  function canAfford(cost) { for (const k in cost) if (S.res[k] < cost[k]) return false; return true; }
  function effCost(cost, disc) { const o = {}; for (const k in cost) o[k] = Math.ceil(cost[k] * (disc || 1)); return o; }
  function applyRes(delta) {
    for (const k in delta) S.res[k] = Math.max(0, S.res[k] + delta[k]);
    updateResUI(delta);
  }
  function pay(cost) { const d = {}; for (const k in cost) d[k] = -cost[k]; applyRes(d); }
  function gain(obj) { applyRes(obj); }

  function updateResUI(delta) {
    for (const k of ['wood', 'stone', 'energy']) {
      const chip = el.res[k];
      chip.querySelector('.val').textContent = S.res[k];
      if (delta && delta[k]) {
        const d = chip.querySelector('.delta');
        const v = delta[k];
        d.textContent = (v > 0 ? '+' : '') + v;
        d.className = 'delta ' + (v > 0 ? 'gain' : 'loss');
        void d.offsetWidth; d.classList.add('show');
        chip.classList.remove('pulse'); void chip.offsetWidth; chip.classList.add('pulse');
      }
    }
  }

  /* ---------- 生态 ---------- */
  function recomputeEco() {
    let score = 0;
    for (const t of S.tiles) {
      if (!t.land || t.type === 'mist') continue;
      if (t.type === 'forest') score += 2;
      else if (t.type === 'water') score += 3;
      else if (t.type === 'empty' && t.fertile && !t.building) score += 1;
      if (t.created) score += 1;
      if (t.building === 'tree') score += t.mature ? 2 : 1;
      else if (t.building === 'spring') score += 3;
      else if (t.building === 'house') score += 2;
      else if (t.building === 'windmill') score += 2;
      else if (t.building === 'lifetree') score += 12;
    }
    score += S.stats.ruins * 2 + S.stats.crystals * 2 + S.rulesActive.size * 6;
    S.eco = score;
    let lv = 1; for (let i = 1; i < ECO_TH.length; i++) if (score >= ECO_TH[i]) lv = i + 1;
    S.ecoLv = lv;
  }

  /* ---------- 世界成长 tick ---------- */
  function bonus(t) {
    let b = 0;
    for (const n of neighbors(t)) {
      if (!n.land) continue;
      if (n.building === 'house') b += 1;
      if (S.rulesActive.has('resonance') && n.building && BUILDING_SET.has(n.building)) b += 1;
    }
    return b;
  }

  function spread(t, chance) {
    if (S.rng() >= chance) return;
    const cands = neighbors(t).filter(n => n.land && n.type === 'empty' && !n.building);
    if (!cands.length) return;
    const n = cands[Math.floor(S.rng() * cands.length)];
    n.building = 'tree'; n.growth = 0; n.mature = false; n.reveal = 0.55;
    const p = renderer.tileScreen(n); renderer.leaves(p.x, p.y - 6, 5);
  }

  function tryTerra(t) {
    if (S.rng() >= 0.05) return;
    const voids = neighbors(t).filter(n => !n.land);
    if (!voids.length) return;
    const n = voids[Math.floor(S.rng() * voids.length)];
    n.land = true; n.type = 'empty'; n.rise = 0; n.created = true; n.reveal = 1;
    S.stats.created++;
    const p = renderer.tileScreen(n);
    renderer.dust(p.x, p.y + 10, 14); renderer.ring(p.x, p.y, '#c65fd1');
    audio.play('terra');
    if (S.stats.created === 1) { addDisc('i-expand', '大地拓展：新地块', 'd-rule'); toast('大地在岛缘生长出新的地块！', 'rule', 'i-expand'); }
  }

  function tick() {
    const R = S.rulesActive;
    const inc = { wood: 0, stone: 0, energy: 0 };
    // 滋养
    for (const t of S.tiles) t.nourished = false;
    const radius = R.has('farwaters') ? 2 : 1;
    for (const t of S.tiles) {
      if (!t.land || (t.type !== 'water' && t.building !== 'spring')) continue;
      for (const o of S.tiles) {
        if (!o.land || o === t) continue;
        if (Math.abs(o.c - t.c) + Math.abs(o.r - t.r) <= radius) {
          o.nourished = true;
          if (o.type === 'empty' && !o.building) o.fertile = true;
        }
      }
    }
    // 生产与生长
    for (const t of S.tiles) {
      if (!t.land || t.type === 'mist') continue;
      if (t.mineCd > 0) t.mineCd--;
      const b = bonus(t);
      if (t.type === 'forest') { inc.wood += 1 + b; spread(t, R.has('verdant') ? 0.18 : 0.06); }
      else if (t.type === 'ore') { inc.stone += 1 + b; }
      if (t.building === 'tree') {
        if (!t.mature) {
          t.growth += 0.34 * (t.nourished ? 1.5 : 1) * (R.has('verdant') ? 1.6 : 1);
          if (t.growth >= 1) { t.growth = 1; t.mature = true; const p = renderer.tileScreen(t); renderer.sparkles(p.x, p.y - 18 * renderer.view.s, '#bfe8a0', 6); }
        } else { inc.wood += 1 + b; spread(t, R.has('verdant') ? 0.18 : 0.06); }
      } else if (t.building === 'windmill') {
        inc.energy += 2 + b; if (R.has('transmute')) inc.wood += 1;
      } else if (t.building === 'house') {
        inc.energy += 1 + b; if (R.has('transmute')) inc.stone += 1;
        if (R.has('terra')) tryTerra(t);
      } else if (t.building === 'lifetree') {
        inc.wood += 1; inc.energy += 1;
      }
      if (t.building === 'windmill' && R.has('terra')) tryTerra(t);
    }
    if (inc.wood || inc.stone || inc.energy) gain(inc);
    refresh();
  }

  /* ---------- 揭示地块 ---------- */
  function revealTile(t, free) {
    const hidden = t.hidden || 'empty';
    t.hidden = null;
    t.type = hidden === 'turbulence' ? 'empty' : hidden;
    t.reveal = 0;
    S.stats.explored++;
    const p = renderer.tileScreen(t);
    if (hidden === 'turbulence') {
      renderer.burst(p.x, p.y, '#b8c4cc', 12, { g: 40, up: 20 });
      renderer.floatText(p.x, p.y - 14, '乱流消散', '#8aa2ae');
      if (!free) toast('乱流消散，只余一片空地', 'warn', 'i-mist');
    } else {
      renderer.mistDissolve(p.x, p.y);
      renderer.sparkles(p.x, p.y - 8, TERRAIN_COLOR[t.type] || '#fff', 8);
      renderer.floatText(p.x, p.y - 16, TERRAIN_NAME[t.type] || '空地', TERRAIN_COLOR[t.type] || '#3aa76d');
      if (t.type === 'ruins') { toast('发现了古代遗迹！', 'good', 'i-ruins'); audio.play('discover'); }
      else if (t.type === 'crystal') { toast('发现了源晶簇！', 'rule', 'i-crystal'); audio.play('discover'); }
    }
    if (!free) audio.play('explore');
  }

  /* ---------- 玩家操作 ---------- */
  function doExplore(t) {
    if (!renderer.explorable(S, t)) { select(t); toast('需先探索相邻的地块', 'warn', 'i-mist'); audio.play('error'); return; }
    if (!canAfford(COSTS.explore)) { select(t); toast('能量不足，建造风车获取能量', 'warn', 'i-energy'); audio.play('error'); return; }
    pay(COSTS.explore);
    revealTile(t, false);
    select(t);
    if (S.stats.explored === 1 && S.hintStage < 1 && !S.guide.active) { S.hintStage = 1; toast('点击空地，种植与建造', 'good', 'i-build'); }
    refresh();
  }

  function doBuild(t, kind) {
    if (t.type !== 'empty' || t.building) return;
    if (kind === 'lifetree' && S.rulesActive.size < 1) { toast('需先激活一条世界规则', 'warn', 'i-rule'); audio.play('error'); return; }
    const cost = COSTS[kind];
    if (!canAfford(cost)) { toast('资源不足', 'warn', RES_META[Object.keys(cost)[0]].icon); audio.play('error'); return; }
    pay(cost);
    t.building = kind; t.reveal = 0.6;
    if (kind === 'tree') { t.growth = 0; t.mature = false; S.stats.trees++; }
    if (kind === 'spring') S.stats.springs++;
    S.stats.built++;
    const p = renderer.tileScreen(t);
    renderer.burst(p.x, p.y - 6, kind === 'spring' ? '#7fccf0' : '#c98a4b', 12, { g: 180, up: 50 });
    renderer.ring(p.x, p.y, kind === 'lifetree' ? '#f0a32e' : '#46b96a');
    audio.play(kind === 'tree' ? 'plant' : 'build');
    if (kind === 'lifetree') { addDisc('i-lifetree', '生命之树', 'd-rule'); toast('生命之树扎根大陆！', 'rule', 'i-lifetree'); renderer.sparkles(p.x, p.y - 20, '#ffd76a', 16); }
    if (S.stats.built === 1 && S.hintStage < 2 && !S.guide.active) { S.hintStage = 2; toast('激活规则，改写世界的运转', 'rule', 'i-rule'); }
    refresh();
  }

  function doChop(t) {
    if (t.type !== 'forest') return;
    t.type = 'empty'; t.reveal = 0.7; S.stats.chops++;
    gain({ wood: 12 });
    const p = renderer.tileScreen(t);
    renderer.burst(p.x, p.y - 8, '#c98a4b', 14, { type: 'shard', g: 220, up: 60 });
    renderer.leaves(p.x, p.y - 10, 8); renderer.floatText(p.x, p.y - 18, '+12 木', '#a56a32');
    audio.play('chop'); refresh();
  }

  function doMine(t) {
    if (t.type !== 'ore' || t.oreCharges <= 0 || t.mineCd > 0) return;
    t.oreCharges--; t.mineCd = 4; S.stats.mines++;
    gain({ stone: 6 });
    const p = renderer.tileScreen(t);
    renderer.burst(p.x, p.y - 6, '#9aa5b1', 12, { type: 'shard', g: 240, up: 55 });
    renderer.floatText(p.x, p.y - 18, '+6 石', '#5f6b78');
    audio.play('mine');
    if (t.oreCharges <= 0) { t.type = 'empty'; t.reveal = 0.7; renderer.dust(p.x, p.y, 10); toast('矿脉开采殆尽', 'info', 'i-ore'); }
    refresh();
  }

  function doExcavate(t) {
    if (t.type !== 'ruins' || t.excavated) return;
    if (!canAfford(COSTS.excavate)) { toast('能量不足', 'warn', 'i-energy'); audio.play('error'); return; }
    pay(COSTS.excavate);
    t.excavated = true; t.type = 'empty'; t.reveal = 0.7; S.stats.ruins++;
    const p = renderer.tileScreen(t);
    renderer.sparkles(p.x, p.y - 10, '#ffd76a', 14); renderer.ring(p.x, p.y, '#f0a32e');
    const pool = [
      { res: { wood: 18 }, label: '古老木料', icon: 'i-wood' },
      { res: { stone: 18 }, label: '封存石料', icon: 'i-stone' },
      { res: { energy: 18 }, label: '残余能量', icon: 'i-energy' },
      { reveal: 2, label: '遗迹地图', icon: 'i-compass' },
      { discount: 0.5, label: '法则碎片', icon: 'i-rule' }
    ];
    const rw = pool[Math.floor(S.rng() * pool.length)];
    if (rw.res) { gain(rw.res); const k = Object.keys(rw.res)[0]; renderer.floatText(p.x, p.y - 20, '+' + rw.res[k] + ' ' + RES_META[k].name, TERRAIN_COLOR.ruins); }
    if (rw.reveal) {
      const mists = shuffle(S.tiles.filter(x => x.land && x.type === 'mist'), S.rng);
      const pref = mists.filter(x => renderer.explorable(S, x));
      const targets = (pref.length ? pref : mists).slice(0, rw.reveal);
      targets.forEach(x => revealTile(x, true));
    }
    if (rw.discount) { S.ruleDiscount = 0.5; toast('下一条规则激活费用减半！', 'rule', 'i-rule'); }
    addDisc(rw.icon, '遗迹：' + rw.label);
    toast('发掘获得：' + rw.label, 'good', rw.icon);
    audio.play('discover'); refresh();
  }

  function doAttune(t) {
    if (t.type !== 'crystal' || t.attuned) return;
    t.attuned = true; t.type = 'empty'; t.fertile = true; t.reveal = 0.7; S.stats.crystals++;
    gain({ wood: 8, stone: 8, energy: 8 });
    const p = renderer.tileScreen(t);
    renderer.sparkles(p.x, p.y - 12, '#e9a8f5', 22); renderer.ring(p.x, p.y, '#c65fd1');
    renderer.floatText(p.x, p.y - 22, '+8 全资源', '#9b45a6');
    addDisc('i-crystal', '源晶共鸣');
    toast('源晶共鸣，纯净资源涌入！', 'rule', 'i-crystal');
    audio.play('crystal'); refresh();
  }

  function doDemolish(t) {
    if (!t.building) return;
    const kind = t.building, cost = COSTS[kind], refund = {};
    for (const k in cost) refund[k] = Math.floor(cost[k] * 0.5);
    t.building = null; t.mature = false; t.growth = 0;
    gain(refund);
    const p = renderer.tileScreen(t); renderer.dust(p.x, p.y, 10);
    audio.play('demolish'); refresh();
  }

  function activateRule(id) {
    if (S.rulesActive.has(id)) return;
    const rule = RULES[id];
    const cost = effCost(rule.cost, S.ruleDiscount);
    if (!canAfford(cost)) { toast('资源不足，无法激活规则', 'warn', 'i-energy'); audio.play('error'); return; }
    pay(cost);
    S.ruleDiscount = 1;
    S.rulesActive.add(id); S.stats.rules++;
    renderer.ruleFlash(rule.color);
    const cx = renderer.view.ox, cy = renderer.view.oy;
    renderer.sparkles(cx, cy, rule.color, 24);
    addDisc(rule.icon, '规则：' + rule.name, 'd-rule');
    toast('规则已激活：' + rule.name, 'rule', rule.icon);
    audio.play('rule');
    if (S.hintStage < 3) { S.hintStage = 3; toast('完成全部目标，复苏大陆', 'good', 'i-flag'); }
    const card = el.ruleList.querySelector(`[data-rule="${id}"]`);
    if (card) { card.classList.add('flash'); setTimeout(() => card.classList.remove('flash'), 800); }
    refresh();
  }

  /* ---------- 任务 / 胜利 ---------- */
  function checkTasks() {
    let all = true;
    for (const task of S.tasks) {
      if (!task.done && task.get() >= task.target) {
        task.done = true;
        audio.play('task');
        toast('任务完成：' + task.label, 'good', 'i-check');
        if (task.el) { task.el.classList.add('flash'); setTimeout(() => task.el && task.el.classList.remove('flash'), 700); }
      }
      if (!task.done) all = false;
    }
    if (all && !S.won) win();
  }

  function win() {
    S.won = true; S.phase = 'won';
    if (S.guide.active) guideFinish(false);
    audio.play('win');
    const cx = renderer.view.ox + (renderer.bounds.minX + renderer.bounds.maxX) / 2 * renderer.view.s;
    const cy = renderer.view.oy + (renderer.bounds.minY + renderer.bounds.maxY) / 2 * renderer.view.s;
    renderer.confetti(cx, cy - 40, 150);
    renderer.ruleFlash('#46b96a');
    let best = parseFloat(localStorage.getItem('tlc_best') || '0');
    const isRecord = !best || S.time < best;
    if (isRecord) { best = S.time; localStorage.setItem('tlc_best', String(best)); }
    S.lastRecord = isRecord; S.bestTime = best;
    setTimeout(showSettle, 1200);
  }

  function showSettle() {
    el.settleEco.textContent = `生态等级 Lv.${S.ecoLv} · ${S.eco} 点`;
    const stats = [
      ['i-clock', fmtTime(S.time), '本局用时'],
      ['i-compass', S.stats.explored, '探索地块'],
      ['i-build', S.stats.built, '建造数量'],
      ['i-rule', S.rulesActive.size, '激活规则'],
      ['i-leaf', 'Lv.' + S.ecoLv, '生态等级'],
      ['i-star', S.discoveries.length, '本局发现']
    ];
    el.settleStats.innerHTML = stats.map(([i, v, k]) => `<div class="stat">${ico(i)}<span class="s-val">${v}</span><span class="s-key">${k}</span></div>`).join('');
    el.settleDisc.innerHTML = S.discoveries.length
      ? S.discoveries.map(d => `<span class="disc-chip ${d.cls || ''}">${ico(d.icon)}${d.label}</span>`).join('')
      : '<span class="disc-chip d-none">本局暂无特殊发现</span>';
    el.settleBest.innerHTML = S.bestTime ? `历史最佳用时 <b>${fmtTime(S.bestTime)}</b>${S.lastRecord ? ' · 本局新纪录！' : ''}` : '';
    el.settle.classList.remove('hidden');
  }

  function addDisc(icon, label, cls) {
    if (S.discoveries.some(d => d.label === label)) return;
    S.discoveries.push({ icon, label, cls });
  }

  /* ---------- 提示气泡 ---------- */
  function toast(msg, type, icon) {
    const t = document.createElement('div');
    t.className = 'toast t-' + (type || 'info');
    t.innerHTML = (icon ? ico(icon) : '') + `<span>${msg}</span>`;
    el.toasts.appendChild(t);
    while (el.toasts.children.length > 4) el.toasts.removeChild(el.toasts.firstChild);
    setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 320); }, 2600);
  }

  /* ---------- UI 渲染 ---------- */
  function costHTML(cost, disc) {
    const c = effCost(cost, disc);
    return '<span class="cost">' + Object.keys(c).map(k => {
      const short = S.res[k] < c[k];
      return `<em class="${short ? 'short' : ''} ${RES_META[k].cls}">${ico(RES_META[k].icon)}${c[k]}</em>`;
    }).join('') + '</span>';
  }

  function renderTasks() {
    el.taskList.innerHTML = '';
    for (const task of S.tasks) {
      const li = document.createElement('li');
      li.className = 'task';
      li.innerHTML = `<div class="t-top">${ico(task.icon, 't-ico')}<span class="t-label">${task.label}</span><span class="t-prog"></span></div>
        <div class="t-desc">${task.desc}</div><div class="t-bar"><i></i></div>${ico('i-check', 't-check')}`;
      el.taskList.appendChild(li);
      task.el = li; task.progEl = li.querySelector('.t-prog'); task.barEl = li.querySelector('.t-bar i');
    }
  }

  function updateTasks() {
    let done = 0;
    for (const task of S.tasks) {
      const cur = Math.min(task.get(), task.target);
      task.progEl.textContent = `${cur}/${task.target}`;
      task.barEl.style.width = (cur / task.target * 100) + '%';
      task.el.classList.toggle('done', task.done);
      if (task.done) done++;
    }
    el.taskCount.textContent = `${done}/${S.tasks.length}`;
    el.chipTasks.querySelector('b').textContent = `${done}/${S.tasks.length}`;
  }

  function updateEco() {
    el.ecoLv.textContent = 'Lv.' + S.ecoLv;
    const lower = ECO_TH[S.ecoLv - 1];
    const upper = S.ecoLv >= 5 ? ECO_TH[4] : ECO_TH[S.ecoLv];
    const pct = S.ecoLv >= 5 ? 100 : clamp((S.eco - lower) / (upper - lower) * 100, 0, 100);
    el.ecoFill.style.width = pct + '%';
    el.ecoScore.textContent = S.ecoLv >= 5 ? `${S.eco} · MAX` : `${S.eco} / ${upper}`;
  }

  function renderRules() {
    el.ruleList.innerHTML = '';
    for (const id of S.rulesOffered) {
      const r = RULES[id];
      const card = document.createElement('div');
      card.className = 'rule-card'; card.dataset.rule = id; card.style.setProperty('--rc', r.color);
      card.innerHTML = `<div class="rule-top"><div class="rule-ico">${ico(r.icon)}</div><div class="rule-name">${r.name}</div></div>
        <div class="rule-desc">${r.desc}</div>
        <button class="rule-btn"><span class="rb-txt">激活</span>${costHTML(r.cost, S.ruleDiscount)}</button>`;
      card.querySelector('.rule-btn').addEventListener('click', () => activateRule(id));
      el.ruleList.appendChild(card);
      r._card = card; r._btn = card.querySelector('.rule-btn');
    }
  }

  function updateRules() {
    for (const id of S.rulesOffered) {
      const r = RULES[id], active = S.rulesActive.has(id);
      r._card.classList.toggle('active', active);
      const cost = effCost(r.cost, S.ruleDiscount);
      r._btn.disabled = active || !canAfford(cost);
      r._btn.querySelector('.rb-txt').textContent = active ? '已激活 ✓' : '激活';
      const costEl = r._btn.querySelector('.cost');
      if (active) costEl.style.display = 'none';
      else { costEl.style.display = ''; costEl.outerHTML = costHTML(r.cost, S.ruleDiscount); }
    }
    el.ruleCount.textContent = `${S.rulesActive.size}/${S.rulesOffered.length}`;
    el.chipRules.querySelector('b').textContent = `${S.rulesActive.size}/${S.rulesOffered.length}`;
  }

  function tileMeta(t) {
    if (t.building) {
      const b = BUILDINGS[t.building];
      let desc = b.desc;
      if (t.building === 'tree') desc = t.mature ? '已成熟 · 每轮 +1 木材' : `生长中 ${Math.round(t.growth * 100)}%`;
      return { icon: b.icon, name: b.name, desc, color: '#2f9e57' };
    }
    switch (t.type) {
      case 'mist': return { icon: 'i-mist', name: '未知迷雾', desc: renderer.explorable(S, t) ? '点击探索，消耗 5 能量' : '需先探索相邻地块', color: '#8aa2ae' };
      case 'forest': return { icon: 'i-tree', name: '森林', desc: '每轮 +1 木材 · 可砍伐', color: '#2f9e57' };
      case 'water': return { icon: 'i-water', name: '水源', desc: '滋养周围土地，提升生态', color: '#2b7fc4' };
      case 'ore': return { icon: 'i-ore', name: '矿脉', desc: `每轮 +1 石料 · 剩 ${t.oreCharges} 次开采`, color: '#5f6b78' };
      case 'ruins': return { icon: 'i-ruins', name: '古代遗迹', desc: '发掘可能获得意外之喜', color: '#c9870a' };
      case 'crystal': return { icon: 'i-crystal', name: '源晶簇', desc: '与之共鸣，获取纯净资源', color: '#9b45a6' };
      default: return { icon: 'i-sprout', name: t.fertile ? '润泽空地' : '空地', desc: '选择下方按钮建造', color: '#3aa76d' };
    }
  }

  function actBtn(act, icon, name, cost, disabled, cls, disc) {
    const costStr = cost ? costHTML(cost, disc) : '';
    return `<button class="act ${cls || ''}" data-act="${act}" ${disabled ? 'disabled' : ''}>${ico(icon)}<span class="a-name">${name}</span>${costStr}</button>`;
  }

  function renderInspector() {
    const t = S.selected;
    if (!t) { el.inspector.classList.add('hidden'); return; }
    el.inspector.classList.remove('hidden');
    const m = tileMeta(t);
    el.inspIcon.innerHTML = ico(m.icon); el.inspIcon.style.color = m.color;
    el.inspName.textContent = m.name; el.inspDesc.textContent = m.desc;
    let html = '';
    if (t.building) {
      const refund = {}; for (const k in COSTS[t.building]) refund[k] = Math.floor(COSTS[t.building][k] * 0.5);
      html = actBtn('demolish', 'i-trash', '移除', null, false, 'act-danger');
      html += `<span class="a-cost" style="align-self:center;font-size:10px;color:var(--ink-faint)">返还 ${Object.keys(refund).map(k => refund[k] + RES_META[k].name).join(' ')}</span>`;
    } else if (t.type === 'mist') {
      if (renderer.explorable(S, t)) html = actBtn('explore', 'i-compass', '探索', COSTS.explore, !canAfford(COSTS.explore), 'act-primary');
    } else if (t.type === 'empty') {
      html += actBtn('build-tree', 'i-tree', '种树', COSTS.tree, !canAfford(COSTS.tree));
      html += actBtn('build-spring', 'i-spring', '泉眼', COSTS.spring, !canAfford(COSTS.spring));
      html += actBtn('build-house', 'i-house', '房屋', COSTS.house, !canAfford(COSTS.house));
      html += actBtn('build-windmill', 'i-windmill', '风车', COSTS.windmill, !canAfford(COSTS.windmill));
      const ltOk = canAfford(COSTS.lifetree) && S.rulesActive.size >= 1;
      html += actBtn('build-lifetree', 'i-lifetree', '生命树', COSTS.lifetree, !ltOk, 'act-primary');
    } else if (t.type === 'forest') {
      html = actBtn('chop', 'i-axe', '砍伐 +12木', null, false);
    } else if (t.type === 'ore') {
      const dis = t.oreCharges <= 0 || t.mineCd > 0;
      html = actBtn('mine', 'i-pick', t.mineCd > 0 ? `冷却 ${t.mineCd}` : '开采 +6石', null, dis);
    } else if (t.type === 'ruins') {
      html = actBtn('excavate', 'i-compass', '发掘', COSTS.excavate, !canAfford(COSTS.excavate), 'act-primary');
    } else if (t.type === 'crystal') {
      html = actBtn('attune', 'i-crystal', '共鸣', null, false, 'act-primary');
    }
    el.inspActions.innerHTML = html;
  }

  function select(t) { S.selected = t; renderInspector(); guideSync(); }
  function deselect() { S.selected = null; el.inspector.classList.add('hidden'); guideSync(); }

  function refresh() {
    recomputeEco(); checkTasks();
    updateResUI(null); updateEco(); updateTasks(); updateRules(); renderInspector();
    guideSync();
  }

  function updateTimer() { el.timer.textContent = fmtTime(S.time); }

  /* ---------- 输入 ---------- */
  const cv = $('world');
  cv.addEventListener('pointermove', e => {
    renderer.tpx = (e.clientX / window.innerWidth - 0.5) * 2;
    renderer.tpy = (e.clientY / window.innerHeight - 0.5) * 2;
    if (S.phase === 'intro') return;
    const t = renderer.pick(S, e.clientX, e.clientY);
    if (t !== S.hover) { S.hover = t; cv.style.cursor = t ? 'pointer' : 'default'; }
  });
  cv.addEventListener('pointerleave', () => { S.hover = null; renderer.tpx = 0; renderer.tpy = 0; });
  cv.addEventListener('pointerdown', e => {
    if (S.phase === 'intro' || S.phase === 'won') return;
    audio.resume();
    const t = renderer.pick(S, e.clientX, e.clientY);
    if (!t) { deselect(); return; }
    if (t.type === 'mist') { audio.play('click'); doExplore(t); }
    else { audio.play('click'); select(t); }
  });

  el.inspActions.addEventListener('click', e => {
    const btn = e.target.closest('.act'); if (!btn || btn.disabled) return;
    const t = S.selected; if (!t) return;
    const act = btn.dataset.act;
    if (act === 'explore') doExplore(t);
    else if (act.startsWith('build-')) doBuild(t, act.slice(6));
    else if (act === 'chop') doChop(t);
    else if (act === 'mine') doMine(t);
    else if (act === 'excavate') doExcavate(t);
    else if (act === 'attune') doAttune(t);
    else if (act === 'demolish') doDemolish(t);
  });
  $('insp-close').addEventListener('click', deselect);

  // 顶栏
  el.btnSpeed.addEventListener('click', () => {
    S.speed = S.speed === 1 ? 2 : 1;
    el.btnSpeed.querySelector('.spd').textContent = S.speed + '×';
    audio.play('click');
  });
  function updateSoundBtn() {
    el.btnSound.innerHTML = ico(S.muted ? 'i-sound-off' : 'i-sound-on');
    el.btnSound.classList.toggle('off', S.muted);
    el.btnSound.classList.toggle('on', !S.muted);
  }
  el.btnSound.addEventListener('click', () => {
    S.muted = !S.muted; audio.setMuted(S.muted); updateSoundBtn();
    localStorage.setItem('tlc_muted', S.muted ? '1' : '0');
    if (!S.muted) { audio.ensure(); audio.resume(); audio.play('click'); }
  });
  $('btn-help').addEventListener('click', () => { el.help.classList.remove('hidden'); S.paused = true; audio.play('click'); });
  $('btn-help-close').addEventListener('click', () => { el.help.classList.add('hidden'); S.paused = false; audio.play('click'); });
  $('btn-restart').addEventListener('click', () => { el.restartPop.classList.toggle('hidden'); audio.play('click'); });
  $('restart-yes').addEventListener('click', () => { el.restartPop.classList.add('hidden'); newRun(); });
  $('restart-no').addEventListener('click', () => el.restartPop.classList.add('hidden'));
  document.addEventListener('pointerdown', e => {
    if (!el.restartPop.classList.contains('hidden') && !e.target.closest('#restart-pop') && !e.target.closest('#btn-restart'))
      el.restartPop.classList.add('hidden');
  });

  // 移动端面板
  el.chipTasks.addEventListener('click', () => { $('tasks-panel').classList.toggle('open'); $('rules-panel').classList.remove('open'); audio.play('click'); guideSync(); });
  el.chipRules.addEventListener('click', () => { $('rules-panel').classList.toggle('open'); $('tasks-panel').classList.remove('open'); audio.play('click'); guideSync(); });
  document.querySelectorAll('.panel-close').forEach(b => b.addEventListener('click', () => $(b.dataset.close).classList.remove('open')));

  // 覆盖层按钮
  $('btn-start').addEventListener('click', startGame);
  $('btn-again').addEventListener('click', () => { el.settle.classList.add('hidden'); newRun(); });
  $('btn-continue').addEventListener('click', () => {
    el.settle.classList.add('hidden'); S.phase = 'free';
    toast('自由建设：让大陆继续生长', 'good', 'i-sprout'); audio.play('click');
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      if (!el.help.classList.contains('hidden')) { el.help.classList.add('hidden'); S.paused = false; }
      else if (!el.restartPop.classList.contains('hidden')) el.restartPop.classList.add('hidden');
      else deselect();
    }
  });

  /* ---------- 新手高亮引导 ---------- */
  function tileRect(t) {
    const v = renderer.view, p = renderer.tileScreen(t);
    const hw = 34 * v.s, hh = 17 * v.s;
    return { x: p.x - hw * 1.1, y: p.y - hh * 1.1 - 26 * v.s, w: hw * 2.2, h: hh * 2.2 + 26 * v.s };
  }
  function domRect(elm) { const r = elm.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }
  const GUIDE_STEPS = [
    { title: '探索迷雾', icon: 'i-compass', text: '点击金色虚线高亮的迷雾，消耗 5 能量解锁新地块。',
      target: () => { const t = S.tiles.find(t => t.land && t.type === 'mist' && renderer.explorable(S, t)); return t ? tileRect(t) : null; },
      done: () => S.stats.explored > S.guide.base.explored },
    { title: '选择空地', icon: 'i-build', text: '点击一块绿色空地，打开下方的建造菜单。',
      target: () => { const t = S.tiles.find(t => t.land && t.type === 'empty' && !t.building); return t ? tileRect(t) : null; },
      done: () => !!(S.selected && S.selected.type === 'empty' && !S.selected.building) },
    { title: '种植建造', icon: 'i-sprout', text: '在下方菜单点击「种树」或「泉眼」，让大陆焕发生机。',
      target: () => { const b = el.inspActions.querySelector('[data-act="build-tree"]:not([disabled])') || el.inspActions.querySelector('[data-act="build-spring"]:not([disabled])'); return b ? domRect(b) : null; },
      done: () => S.stats.built > S.guide.base.built },
    { title: '改写规则', icon: 'i-rule', text: '激活一条世界规则，亲眼看到世界按新法则运转。',
      target: () => {
        const mobile = window.innerWidth <= 860, open = $('rules-panel').classList.contains('open');
        if (mobile && !open) return domRect(el.chipRules);
        const id = S.rulesOffered.find(id => { const r = RULES[id]; return !S.rulesActive.has(id) && r._btn && !r._btn.disabled; });
        const r = id && RULES[id];
        return r ? domRect(r._btn) : null;
      },
      done: () => S.rulesActive.size > S.guide.base.rules },
    { title: '完成目标', icon: 'i-flag', text: '达成全部复苏任务、提升生态等级，让大陆重新呼吸！',
      target: () => (window.innerWidth <= 860 ? domRect(el.chipTasks) : domRect($('tasks-panel'))),
      done: () => false, final: true }
  ];
  function guideStart(force) {
    if (!force && localStorage.getItem('tlc_guided')) return;
    S.guide.active = true; S.guide.step = 0;
    S.guide.base = { explored: S.stats.explored, built: S.stats.built, rules: S.rulesActive.size };
    el.guide.classList.remove('hidden');
    guideSync();
  }
  function guideFinish(skipped) {
    S.guide.active = false; el.guide.classList.add('hidden');
    localStorage.setItem('tlc_guided', '1');
    toast(skipped ? '已跳过引导 · 可在玩法说明中重玩' : '引导完成 · 自由探索吧', 'good', 'i-sprout');
  }
  function guideSync() {
    if (!S.guide.active) return;
    let guard = 0;
    while (S.guide.step < GUIDE_STEPS.length && guard++ < 8) {
      const st = GUIDE_STEPS[S.guide.step];
      if (st.done() || !st.target()) S.guide.step++;
      else break;
    }
    if (S.guide.step >= GUIDE_STEPS.length) { guideFinish(false); return; }
    const st = GUIDE_STEPS[S.guide.step];
    el.gStep.textContent = (S.guide.step + 1) + '/' + GUIDE_STEPS.length;
    el.gTitle.textContent = st.title;
    el.gText.textContent = st.text;
    el.gNext.classList.toggle('hidden', !st.final);
    guideLayout();
  }
  function guideLayout() {
    if (!S.guide.active) return;
    const st = GUIDE_STEPS[S.guide.step]; if (!st) return;
    const r = st.target(); if (!r) { guideSync(); return; }
    const vw = window.innerWidth, vh = window.innerHeight, pad = 8;
    const hx = Math.max(0, r.x - pad), hy = Math.max(0, r.y - pad);
    const hr = Math.min(vw, r.x + r.w + pad), hb = Math.min(vh, r.y + r.h + pad);
    el.gTop.style.cssText = `left:0;top:0;width:${vw}px;height:${hy}px`;
    el.gBottom.style.cssText = `left:0;top:${hb}px;width:${vw}px;height:${Math.max(0, vh - hb)}px`;
    el.gLeft.style.cssText = `left:0;top:${hy}px;width:${hx}px;height:${Math.max(0, hb - hy)}px`;
    el.gRight.style.cssText = `left:${hr}px;top:${hy}px;width:${Math.max(0, vw - hr)}px;height:${Math.max(0, hb - hy)}px`;
    el.gRing.style.cssText = `left:${hx}px;top:${hy}px;width:${Math.max(0, hr - hx)}px;height:${Math.max(0, hb - hy)}px`;
    const cw = Math.min(360, vw - 24);
    el.gCard.style.width = cw + 'px';
    const ch = el.gCard.offsetHeight || 120;
    let cy = hb + 14; if (cy + ch > vh - 8) cy = hy - ch - 14; if (cy < 8) cy = 8;
    let cx = (hx + hr) / 2 - cw / 2; cx = Math.max(12, Math.min(vw - cw - 12, cx));
    el.gCard.style.left = cx + 'px'; el.gCard.style.top = cy + 'px';
  }
  el.gSkip.addEventListener('click', () => guideFinish(true));
  el.gNext.addEventListener('click', () => guideFinish(false));
  $('btn-reguide').addEventListener('click', () => {
    el.help.classList.add('hidden'); S.paused = false; guideStart(true); audio.play('click');
  });

  /* ---------- 流程 ---------- */
  function startGame() {
    el.intro.classList.add('hidden');
    S.phase = 'playing';
    audio.ensure(); audio.startAmbient(); audio.play('start');
    guideStart();
    if (!S.guide.active) toast('点击金色迷雾，探索大陆', 'info', 'i-compass');
  }

  function newRun() {
    S.runs++;
    localStorage.setItem('tlc_runs', String(S.runs));
    genWorld(); genTasks(); genRules();
    S.res = { ...START_RES }; S.stats = freshStats(); S.discoveries = [];
    S.time = 0; S.won = false; S.selected = null; S.hover = null; S.hintStage = 0;
    S.phase = 'playing'; S.paused = false; S.lastRecord = false;
    renderer.parts.length = 0; renderer.flash = null;
    el.settle.classList.add('hidden'); el.help.classList.add('hidden'); el.intro.classList.add('hidden');
    el.restartPop.classList.add('hidden');
    $('tasks-panel').classList.remove('open'); $('rules-panel').classList.remove('open');
    S.guide.active = false; el.guide.classList.add('hidden');
    deselect();
    renderTasks(); renderRules(); refresh(); updateTimer();
    el.introGoal.textContent = `完成 ${S.tasks.length} 项复苏任务，让生态达到 Lv.3`;
    audio.play('start');
    guideStart();
    if (!S.guide.active) toast('新的孤岛已浮现 · 点击迷雾开始探索', 'info', 'i-compass');
  }

  /* ---------- 主循环 ---------- */
  let last = performance.now(), acc = 0, uiAcc = 0;
  function frame(now) {
    const dt = Math.min((now - last) / 1000, 0.1); last = now;
    const time = now / 1000;
    for (const t of S.tiles) {
      if (t.reveal < 1) t.reveal = Math.min(1, t.reveal + dt * 2.4);
      if (t.rise < 1) t.rise = Math.min(1, t.rise + dt * 1.5);
      const lt = t.fertile ? 1 : 0;
      t.lush += (lt - t.lush) * Math.min(1, dt * 2);
      if (t.building === 'windmill') {
        const target = 1.6 + bonus(t) * 0.5;
        t.spinSpeed += (target - t.spinSpeed) * Math.min(1, dt * 2);
        t.spinAng += t.spinSpeed * dt * (S.phase === 'playing' || S.phase === 'free' ? S.speed : 0.4);
      }
    }
    const canTick = (S.phase === 'playing' || S.phase === 'free') && !S.paused;
    if (canTick) {
      acc += dt * S.speed; let guard = 0;
      while (acc >= TICK && guard < 4) { acc -= TICK; tick(); guard++; }
      S.time += dt;
    }
    renderer.draw(S, dt, time);
    guideLayout();
    uiAcc += dt; if (uiAcc > 0.25) { uiAcc = 0; updateTimer(); }
    requestAnimationFrame(frame);
  }

  /* ---------- 初始化 ---------- */
  function init() {
    S.muted = localStorage.getItem('tlc_muted') === '1';
    audio.setMuted(S.muted); updateSoundBtn();
    S.runs = parseInt(localStorage.getItem('tlc_runs') || '0', 10);
    genWorld(); genTasks(); genRules();
    S.stats = freshStats();
    renderTasks(); renderRules(); recomputeEco(); updateResUI(null); updateEco(); updateTasks(); updateRules(); updateTimer();
    el.introGoal.textContent = `完成 ${S.tasks.length} 项复苏任务，让生态达到 Lv.3`;
    requestAnimationFrame(frame);
  }
  window.__TLC = { renderer, S, frame, guideSync, guideLayout, guideStart, newRun, startGame, tick, el, RULES };
  init();
})();