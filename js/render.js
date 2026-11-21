/* ============ 最后一片大陆 · Canvas 等距渲染引擎 ============ */
window.Renderer = (function () {
  'use strict';
  const TW = 68, TH = 34, SIDE = 17;
  const HW = TW / 2, HH = TH / 2;

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

  function hexToRgb(h) {
    const n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function mix(c1, c2, t) {
    const a = hexToRgb(c1), b = hexToRgb(c2);
    return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
  }
  function rgba(h, a) { const c = hexToRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; }

  class Renderer {
    constructor(canvas) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = 1; this.w = 0; this.h = 0;
      this.base = { s: 1, ox: 0, oy: 0 };
      this.view = { s: 1, ox: 0, oy: 0 };
      this.parts = [];
      this.clouds = []; this.birds = []; this.rocks = [];
      this.flash = null;
      this.px = 0; this.py = 0; this.tpx = 0; this.tpy = 0;
      this.birdTimer = rnd(4, 9);
      this.coneJit = Array.from({ length: 12 }, () => Math.random() * 2 - 1);
      this.amb = { verdant: 0, water: 0, transmute: 0, terra: 0, fall: 0, sparkle: 0 };
      this.skyGrad = null;
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }

    resize() {
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = window.innerWidth; this.h = window.innerHeight;
      this.cv.width = Math.round(this.w * this.dpr);
      this.cv.height = Math.round(this.h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const g = this.ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, '#9fd4ef'); g.addColorStop(0.5, '#c8e6f7'); g.addColorStop(1, '#eaf6fd');
      this.skyGrad = g;
      this.initClouds();
      this.rocks = [];
      for (let i = 0; i < 5; i++) {
        this.rocks.push({ ang: rnd(0, Math.PI * 2), dist: rnd(0.3, 0.62), y: rnd(0.25, 0.8), sc: rnd(0.5, 1.1), sp: rnd(0.04, 0.12) * (Math.random() < 0.5 ? 1 : -1), ph: rnd(0, 6) });
      }
    }

    initClouds() {
      this.clouds = [];
      const n = this.w < 700 ? 9 : 14;
      for (let i = 0; i < n; i++) {
        const layer = i < n * 0.5 ? 0 : 1;
        const puffs = [];
        const np = 3 + Math.floor(Math.random() * 3);
        for (let j = 0; j < np; j++) puffs.push({ dx: (j - np / 2) * rnd(16, 26), dy: rnd(-6, 6), r: rnd(16, 30) });
        this.clouds.push({
          x: rnd(-150, this.w + 150),
          y: layer === 0 ? rnd(this.h * 0.1, this.h * 0.52) : rnd(this.h * 0.64, this.h * 0.98),
          sc: layer === 0 ? rnd(0.55, 1.0) : rnd(0.9, 1.6),
          sp: layer === 0 ? rnd(4, 11) : rnd(12, 26),
          alpha: layer === 0 ? rnd(0.3, 0.5) : rnd(0.55, 0.85),
          layer, puffs
        });
      }
    }

    layout(state) {
      const W = this.w, H = this.h;
      const desktop = W > 860;
      const left = desktop ? 276 : 8;
      const right = desktop ? 298 : 8;
      const top = desktop ? 92 : 112;
      const bottom = desktop ? 128 : 146;
      const availW = Math.max(160, W - left - right);
      const availH = Math.max(160, H - top - bottom);
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, found = false;
      for (const t of state.tiles) {
        if (!t.land) continue;
        found = true;
        const x = (t.c - t.r) * HW, y = (t.c + t.r) * HH;
        minX = Math.min(minX, x - HW); maxX = Math.max(maxX, x + HW);
        minY = Math.min(minY, y - HH); maxY = Math.max(maxY, y + HH);
      }
      if (!found) { minX = -HW; maxX = HW; minY = -HH; maxY = HH; }
      const cw = maxX - minX, ch = maxY - minY;
      // 内容实际范围：上方建筑/树冠约 34，下方岛锥与浮石约 162
      const cTop = minY - 34, cBot = maxY + 162, cH = cBot - cTop;
      const s = clamp(Math.min(availW / (cw + 30), availH / cH), 0.4, 1.5);
      const cx = left + availW / 2;
      this.base.s = s;
      this.base.ox = cx - (minX + maxX) / 2 * s;
      this.base.oy = top + (availH - cH * s) / 2 - cTop * s;
      this.bounds = { minX, maxX, minY, maxY };
    }

    tileScreen(t) {
      const v = this.view;
      return { x: v.ox + (t.c - t.r) * HW * v.s, y: v.oy + (t.c + t.r) * HH * v.s };
    }

    pick(state, mx, my) {
      const v = this.view, hw = HW * v.s, hh = HH * v.s;
      const sorted = state.tiles.filter(t => t.land).sort((a, b) => (b.c + b.r) - (a.c + a.r) || b.r - a.r);
      for (const t of sorted) {
        const p = this.tileScreen(t);
        const dx = mx - p.x, dy = my - p.y;
        if (Math.abs(dx) / hw + Math.abs(dy) / hh <= 1) return t;
        if (t.type !== 'mist' && t.type !== 'empty' || t.building) {
          const dy2 = my - (p.y - 15 * v.s);
          if (Math.abs(dx) / hw + Math.abs(dy2) / hh <= 1) return t;
        }
      }
      return null;
    }

    /* ---------- 粒子 ---------- */
    add(p) { if (this.parts.length < 560) this.parts.push(p); }
    burst(x, y, color, n, opt = {}) {
      for (let i = 0; i < n; i++) {
        const a = rnd(0, Math.PI * 2), sp = rnd(opt.sp0 || 30, opt.sp1 || 110);
        this.add({ type: opt.type || 'dot', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (opt.up || 30), g: opt.g == null ? 160 : opt.g, life: rnd(0.5, 0.95), max: 1, size: rnd(2, 4.5) * (opt.sc || 1), color, rot: rnd(0, 6), vr: rnd(-6, 6) });
      }
    }
    leaves(x, y, n) {
      for (let i = 0; i < n; i++) this.add({ type: 'leaf', x: x + rnd(-8, 8), y: y + rnd(-6, 4), vx: rnd(-30, 30), vy: rnd(-70, -25), g: 50, life: rnd(0.8, 1.4), max: 1.4, size: rnd(3, 5), color: pick(['#4fae68', '#6cc47f', '#3e8e5a', '#8ed081']), rot: rnd(0, 6), vr: rnd(-4, 4) });
    }
    sparkles(x, y, color, n) {
      for (let i = 0; i < n; i++) { const a = rnd(0, 6.28), sp = rnd(15, 70); this.add({ type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 25, g: 20, life: rnd(0.5, 1.0), max: 1, size: rnd(3, 6), color, rot: 0, vr: 0 }); }
    }
    ring(x, y, color) { this.add({ type: 'ring', x, y, vx: 0, vy: 0, g: 0, life: 0.7, max: 0.7, size: 6, color, rot: 0, vr: 0 }); }
    floatText(x, y, text, color) { this.add({ type: 'text', x, y, vx: 0, vy: -34, g: 0, life: 1.25, max: 1.25, size: 14, color, text, rot: 0, vr: 0 }); }
    mistDissolve(x, y) {
      for (let i = 0; i < 12; i++) { const a = rnd(0, 6.28), sp = rnd(25, 85); this.add({ type: 'puff', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, g: -8, life: rnd(0.5, 0.9), max: 0.9, size: rnd(6, 13), color: '#ffffff', rot: 0, vr: 0 }); }
    }
    dust(x, y, n) { this.burst(x, y, '#a9744f', n || 10, { g: 200, sp1: 90, up: 40 }); }
    confetti(x, y, n) {
      const cols = ['#46b96a', '#3d9be9', '#f0a32e', '#c65fd1', '#ef6a5a', '#ffffff'];
      for (let i = 0; i < n; i++) { const a = rnd(-Math.PI, 0), sp = rnd(120, 380); this.add({ type: 'conf', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 340, life: rnd(1.6, 2.8), max: 2.8, size: rnd(4, 8), color: pick(cols), rot: rnd(0, 6), vr: rnd(-9, 9) }); }
    }
    ruleFlash(color) { this.flash = { color, t: 0 }; }

    /* ---------- 主绘制 ---------- */
    draw(state, dt, time) {
      const ctx = this.ctx, W = this.w, H = this.h;
      this.layout(state);
      this.px = lerp(this.px, this.tpx, 0.05); this.py = lerp(this.py, this.tpy, 0.05);
      const bob = Math.sin(time * 0.6) * 4;
      this.view.s = this.base.s;
      this.view.ox = this.base.ox + this.px * 8;
      this.view.oy = this.base.oy + this.py * 5 + bob;
      const v = this.view, s = v.s;

      ctx.clearRect(0, 0, W, H);
      ctx.fillStyle = this.skyGrad; ctx.fillRect(0, 0, W, H);
      this.drawSun(ctx, W, H, time);
      this.drawIslets(ctx, W, H, time);
      for (const c of this.clouds) if (c.layer === 0) this.drawCloud(ctx, c, dt);
      this.drawBirds(ctx, dt, time, W, H);

      const bcx = v.ox + (this.bounds.minX + this.bounds.maxX) / 2 * s;
      const bby = v.oy + this.bounds.maxY * s;
      this.drawCone(ctx, bcx, bby, s, time);
      this.drawRocks(ctx, bcx, bby, s, time);

      const sorted = state.tiles.filter(t => t.land).sort((a, b) => (a.c + a.r) - (b.c + b.r) || a.r - b.r);
      for (const t of sorted) this.drawTile(ctx, state, t, s, time);

      if (state.rulesActive.has('resonance')) this.drawLinks(ctx, state, s, time);
      this.ambient(state, dt, time, s);
      this.updateParts(ctx, dt);
      for (const c of this.clouds) if (c.layer === 1) this.drawCloud(ctx, c, dt);

      if (this.flash) {
        this.flash.t += dt / 1.1;
        const f = this.flash, a = Math.max(0, 1 - f.t);
        const g = ctx.createRadialGradient(bcx, bby - 60 * s, 10, bcx, bby - 60 * s, Math.max(W, H) * 0.7);
        g.addColorStop(0, rgba(f.color, 0.22 * a)); g.addColorStop(1, rgba(f.color, 0));
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = rgba(f.color, 0.5 * a); ctx.lineWidth = 3 * a + 1;
        ctx.beginPath(); ctx.arc(bcx, bby - 60 * s, f.t * Math.max(W, H) * 0.55, 0, 6.29); ctx.stroke();
        if (f.t >= 1) this.flash = null;
      }
    }

    drawSun(ctx, W, H, time) {
      const sx = W * 0.84, sy = H * 0.11;
      const g = ctx.createRadialGradient(sx, sy, 8, sx, sy, 210);
      g.addColorStop(0, 'rgba(255,248,225,.75)'); g.addColorStop(0.4, 'rgba(255,240,205,.28)'); g.addColorStop(1, 'rgba(255,240,205,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sx, sy, 210, 0, 6.29); ctx.fill();
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(time * 0.02);
      ctx.fillStyle = 'rgba(255,250,232,.05)';
      for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI * 2 / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(560, -70); ctx.lineTo(560, 70); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = 'rgba(255,252,240,.92)'; ctx.beginPath(); ctx.arc(sx, sy, 30, 0, 6.29); ctx.fill();
    }

    drawIslets(ctx, W, H, time) {
      const spots = [[0.1, 0.26, 0.7], [0.9, 0.34, 0.5], [0.2, 0.74, 0.42]];
      for (const [fx, fy, sc] of spots) {
        const x = W * fx + this.px * 14 * sc, y = H * fy + Math.sin(time * 0.4 + fx * 9) * 5 + this.py * 8 * sc;
        const w = 60 * sc, h = 30 * sc;
        ctx.save(); ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#9dc4dd';
        ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x, y + h); ctx.lineTo(x + w, y); ctx.lineTo(x, y - h); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#8bb0c9';
        ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h + 26 * sc); ctx.lineTo(x - w * 0.4, y + 8 * sc); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + w, y); ctx.lineTo(x, y + h); ctx.lineTo(x, y + h + 26 * sc); ctx.lineTo(x + w * 0.4, y + 8 * sc); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#7fae9a';
        ctx.beginPath(); ctx.moveTo(x, y - h - 16 * sc); ctx.lineTo(x + 8 * sc, y - h + 2 * sc); ctx.lineTo(x - 8 * sc, y - h + 2 * sc); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }

    drawCloud(ctx, c, dt) {
      c.x += c.sp * dt;
      if (c.x - 120 * c.sc > this.w) c.x = -140 * c.sc;
      ctx.save(); ctx.globalAlpha = c.alpha; ctx.fillStyle = '#ffffff';
      ctx.translate(c.x, c.y); ctx.scale(c.sc, c.sc * 0.72);
      ctx.beginPath();
      for (const p of c.puffs) { ctx.moveTo(p.dx + p.r, p.dy); ctx.arc(p.dx, p.dy, p.r, 0, 6.29); }
      ctx.fill(); ctx.restore();
    }

    drawBirds(ctx, dt, time, W, H) {
      this.birdTimer -= dt;
      if (this.birdTimer <= 0) {
        this.birdTimer = rnd(11, 20);
        const y = rnd(H * 0.12, H * 0.4), dir = Math.random() < 0.5 ? 1 : -1;
        const x0 = dir > 0 ? -40 : W + 40;
        for (let i = 0; i < 3; i++) this.birds.push({ x: x0 - dir * i * 22, y: y + i * 12, vx: dir * rnd(34, 46), ph: rnd(0, 6), sc: rnd(0.7, 1.1) });
      }
      ctx.strokeStyle = 'rgba(39,65,79,.42)'; ctx.lineWidth = 1.6;
      for (let i = this.birds.length - 1; i >= 0; i--) {
        const b = this.birds[i]; b.x += b.vx * dt;
        if (b.x < -60 || b.x > W + 60) { this.birds.splice(i, 1); continue; }
        const f = Math.sin(time * 9 + b.ph) * 3.4 * b.sc;
        ctx.beginPath();
        ctx.moveTo(b.x - 7 * b.sc, b.y - f); ctx.quadraticCurveTo(b.x, b.y + 2 * b.sc, b.x + 7 * b.sc, b.y - f);
        ctx.stroke();
      }
    }

    drawCone(ctx, cx, by, s, time) {
      const span = (this.bounds.maxX - this.bounds.minX) * s;
      const w = span * 0.36, vh = w * 0.62, d = 118 * s;
      const topY = by + 6 * s;
      const j = this.coneJit;
      const left = [[-0.82, 0.20], [-0.60, 0.38], [-0.46, 0.55], [-0.28, 0.74], [-0.14, 0.90]];
      const right = [[0.16, 0.90], [0.30, 0.74], [0.46, 0.56], [0.62, 0.38], [0.84, 0.20]];
      const tipX = cx + j[0] * w * 0.10, tipY = topY + d;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(cx - w, topY - vh);
      left.forEach(([fx, fy], i) => ctx.lineTo(cx + fx * w + j[i + 1] * w * 0.05, topY + fy * d));
      ctx.lineTo(tipX, tipY);
      for (let i = 0; i < right.length; i++) { const [fx, fy] = right[i]; ctx.lineTo(cx + fx * w + j[i + 6] * w * 0.05, topY + fy * d); }
      ctx.lineTo(cx + w, topY - vh);
      ctx.lineTo(cx, topY);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, topY - vh, 0, tipY);
      g.addColorStop(0, '#9c6b45'); g.addColorStop(0.35, '#8a5a3b'); g.addColorStop(0.7, '#6d4a33'); g.addColorStop(1, '#54402e');
      ctx.fillStyle = g; ctx.fill();
      ctx.clip();
      // 左侧背光阴影（太阳在右上）
      ctx.fillStyle = 'rgba(60,40,26,.26)';
      ctx.beginPath(); ctx.moveTo(cx - w, topY - vh); ctx.lineTo(cx + w * 0.1, topY - vh); ctx.lineTo(cx - w * 0.12, tipY); ctx.lineTo(cx - w, tipY); ctx.closePath(); ctx.fill();
      // 地层纹理
      ctx.strokeStyle = 'rgba(201,138,75,.28)'; ctx.lineWidth = 1.4 * s;
      for (let i = 1; i <= 3; i++) {
        const yy = topY - vh * 0.2 + i * d * 0.24;
        ctx.beginPath(); ctx.moveTo(cx - w, yy); ctx.quadraticCurveTo(cx, yy + (i % 2 ? 8 : 4) * s, cx + w, yy); ctx.stroke();
      }
      // 嵌入岩块
      const rocks = [[-0.34, 0.34, 7, '#7f8c9b'], [0.26, 0.52, 6, '#8d99ae'], [-0.10, 0.72, 5, '#9aa5b1']];
      for (const [fx, fy, r, c] of rocks) {
        const x = cx + fx * w, y = topY + fy * d, rr = r * s;
        ctx.fillStyle = c;
        ctx.beginPath(); ctx.moveTo(x, y - rr); ctx.lineTo(x + rr, y); ctx.lineTo(x, y + rr * 1.2); ctx.lineTo(x - rr, y); ctx.closePath(); ctx.fill();
      }
      // 源晶微光
      const gems = [[-0.2, 0.45, '#f0a32e'], [0.18, 0.66, '#3d9be9'], [0.0, 0.86, '#c65fd1']];
      for (const [fx, fy, col] of gems) {
        const x = cx + fx * w, y = topY + fy * d, r = 3.6 * s;
        const pulse = 0.6 + Math.sin(time * 2 + fx * 8) * 0.3;
        ctx.fillStyle = rgba(col, 0.85 * pulse);
        ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.7, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.7, y); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
      // 垂根
      ctx.fillStyle = 'rgba(90,62,40,.6)';
      for (let i = 0; i < 3; i++) {
        const rx = tipX + (i - 1) * 6 * s;
        const len = (13 + i * 4) * s, sway = (i - 1) * 5 * s, w0 = 2.2 * s;
        ctx.beginPath();
        ctx.moveTo(rx - w0, tipY - 4 * s);
        ctx.quadraticCurveTo(rx + sway * 0.4 - w0 * 0.4, tipY + len * 0.5, rx + sway, tipY + len);
        ctx.quadraticCurveTo(rx + sway * 0.4 + w0 * 0.4, tipY + len * 0.5, rx + w0, tipY - 4 * s);
        ctx.closePath(); ctx.fill();
      }
      // 岛底接合处土缘
      ctx.strokeStyle = 'rgba(120,84,56,.9)'; ctx.lineWidth = 3 * s;
      ctx.beginPath(); ctx.moveTo(cx - w, topY - vh); ctx.lineTo(cx, topY); ctx.lineTo(cx + w, topY - vh); ctx.stroke();
    }

    drawRocks(ctx, cx, by, s, time) {
      const span = (this.bounds.maxX - this.bounds.minX) * s * 0.5;
      for (const r of this.rocks) {
        r.ang += r.sp * 0.016;
        const x = cx + Math.cos(r.ang) * span * r.dist;
        const y = by + 40 * s + r.y * 110 * s + Math.sin(time * 0.8 + r.ph) * 6;
        const sz = 9 * s * r.sc;
        ctx.fillStyle = '#8a5a3b';
        ctx.beginPath(); ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y); ctx.lineTo(x, y + sz * 1.3); ctx.lineTo(x - sz, y); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#a9744f';
        ctx.beginPath(); ctx.moveTo(x, y - sz); ctx.lineTo(x + sz, y); ctx.lineTo(x, y + sz * 0.3); ctx.lineTo(x - sz, y); ctx.closePath(); ctx.fill();
      }
    }

    diamond(ctx, hw, hh) {
      ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(hw, 0); ctx.lineTo(0, hh); ctx.lineTo(-hw, 0); ctx.closePath();
    }

    drawTile(ctx, state, t, s, time) {
      const p = this.tileScreen(t);
      let x = p.x, y = p.y, alpha = 1, sc = 1;
      if (t.rise < 1) { y += (1 - t.rise) * 48 * s; alpha = t.rise; }
      if (t.reveal < 1) { sc = 0.72 + 0.28 * t.reveal; alpha *= t.reveal; }
      const hw = HW * s, hh = HH * s;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(x, y); ctx.scale(sc, sc);

      // 侧面（岛体厚度）
      const nR = state.byKey.get((t.c + 1) + ',' + t.r);
      const nD = state.byKey.get(t.c + ',' + (t.r + 1));
      const sd = SIDE * s;
      if (!nR || !nR.land) {
        ctx.fillStyle = t.type === 'mist' ? 'rgba(138,90,59,.5)' : '#8a5a3b';
        ctx.beginPath(); ctx.moveTo(hw, 0); ctx.lineTo(0, hh); ctx.lineTo(0, hh + sd); ctx.lineTo(hw, sd); ctx.closePath(); ctx.fill();
      }
      if (!nD || !nD.land) {
        ctx.fillStyle = t.type === 'mist' ? 'rgba(169,116,79,.5)' : '#a9744f';
        ctx.beginPath(); ctx.moveTo(-hw, 0); ctx.lineTo(0, hh); ctx.lineTo(0, hh + sd); ctx.lineTo(-hw, sd); ctx.closePath(); ctx.fill();
      }

      this.drawTop(ctx, state, t, s, hw, hh, time);
      this.drawContent(ctx, state, t, s, time);
      ctx.restore();

      // 选中 / 悬停 / 可探索 高亮
      const sel = state.selected === t, hov = state.hover === t;
      if (t.type === 'mist' && this.explorable(state, t)) {
        const pulse = 0.5 + Math.sin(time * 2.6 + t.phase) * 0.3;
        ctx.save(); ctx.translate(x, y);
        ctx.strokeStyle = rgba('#f0a32e', 0.55 + pulse * 0.4); ctx.lineWidth = 2 * s;
        ctx.setLineDash([6 * s, 5 * s]); ctx.lineDashOffset = -time * 14;
        this.diamond(ctx, hw * 0.92, hh * 0.92); ctx.stroke();
        ctx.setLineDash([]);
        const sr = (3.4 + pulse * 1.6) * s;
        ctx.fillStyle = rgba('#ffd76a', 0.85);
        ctx.beginPath(); ctx.moveTo(0, -sr * 2); ctx.lineTo(sr * 0.5, -sr * 0.5); ctx.lineTo(sr * 2, 0); ctx.lineTo(sr * 0.5, sr * 0.5); ctx.lineTo(0, sr * 2); ctx.lineTo(-sr * 0.5, sr * 0.5); ctx.lineTo(-sr * 2, 0); ctx.lineTo(-sr * 0.5, -sr * 0.5); ctx.closePath(); ctx.fill();
        ctx.restore();
      }
      if (hov && !sel) {
        ctx.save(); ctx.translate(x, y); ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 1.6 * s;
        this.diamond(ctx, hw * 0.96, hh * 0.96); ctx.stroke(); ctx.restore();
      }
      if (sel) {
        ctx.save(); ctx.translate(x, y);
        ctx.shadowColor = 'rgba(240,163,46,.8)'; ctx.shadowBlur = 12 * s;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.4 * s;
        this.diamond(ctx, hw * 0.98, hh * 0.98); ctx.stroke();
        ctx.shadowBlur = 0; ctx.strokeStyle = rgba('#f0a32e', 0.9); ctx.lineWidth = 1.2 * s;
        this.diamond(ctx, hw * 1.06, hh * 1.06); ctx.stroke();
        ctx.restore();
      }
    }

    explorable(state, t) {
      if (t.type !== 'mist') return false;
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dc, dr] of dirs) {
        const n = state.byKey.get((t.c + dc) + ',' + (t.r + dr));
        if (n && n.land && n.type !== 'mist') return true;
      }
      return false;
    }

    drawTop(ctx, state, t, s, hw, hh, time) {
      let fill;
      switch (t.type) {
        case 'water': fill = '#3f9fd4'; break;
        case 'forest': fill = '#74b264'; break;
        case 'ore': fill = '#a2acb7'; break;
        case 'ruins': fill = '#b7bec7'; break;
        case 'crystal': fill = '#c3a6dd'; break;
        case 'mist': fill = '#a9c69b'; break;
        default: fill = mix('#8bc06e', '#54b25a', t.lush);
      }
      this.diamond(ctx, hw, hh); ctx.fillStyle = fill; ctx.fill();
      // 顶部高光
      ctx.save(); this.diamond(ctx, hw, hh); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(hw, 0); ctx.lineTo(0, -hh * 0.2); ctx.lineTo(-hw, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
      ctx.strokeStyle = 'rgba(39,65,79,.12)'; ctx.lineWidth = 1;
      this.diamond(ctx, hw, hh); ctx.stroke();

      if (t.type === 'water') this.drawWater(ctx, s, hw, hh, time, t);
      if (t.type === 'mist') this.drawMist(ctx, s, hw, hh, time, t);
      if (t.type === 'empty' && !t.building && t.lush > 0.4) {
        ctx.globalAlpha *= t.lush;
        const fl = [[-10, 2, '#f7a8c4'], [8, -3, '#f7d774'], [2, 6, '#ffffff'], [-4, -5, '#f7a8c4']];
        for (const [fx, fy, c] of fl) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(fx * s, fy * s, 1.7 * s, 0, 6.29); ctx.fill(); }
      }
    }

    drawWater(ctx, s, hw, hh, time, t) {
      ctx.save(); this.diamond(ctx, hw, hh); ctx.clip();
      const g = ctx.createLinearGradient(0, -hh, 0, hh);
      g.addColorStop(0, '#63bce6'); g.addColorStop(1, '#2f86bd');
      ctx.fillStyle = g; ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
      ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = 1.3 * s;
      for (let i = 0; i < 2; i++) {
        ctx.beginPath();
        for (let x = -hw; x <= hw; x += 4 * s) {
          const y = (i * 8 - 4) * s + Math.sin(x * 0.16 / s + time * 2 + i * 2 + t.phase) * 2.4 * s;
          x === -hw ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      const sx = Math.sin(time * 1.3 + t.phase) * hw * 0.4;
      ctx.fillStyle = 'rgba(255,255,255,.3)';
      ctx.beginPath(); ctx.ellipse(sx, -2 * s, 5 * s, 2 * s, 0, 0, 6.29); ctx.fill();
      ctx.restore();
    }

    drawMist(ctx, s, hw, hh, time, t) {
      ctx.save(); this.diamond(ctx, hw, hh); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
      ctx.restore();
      const puffs = [[-12, 0, 11], [10, -2, 13], [0, 5, 12], [-2, -6, 10]];
      for (let i = 0; i < puffs.length; i++) {
        const [fx, fy, r] = puffs[i];
        const by = Math.sin(time * 1.1 + t.phase + i) * 2.2 * s;
        ctx.fillStyle = `rgba(255,255,255,${0.72 + Math.sin(time * 1.4 + i + t.phase) * 0.12})`;
        ctx.beginPath(); ctx.ellipse(fx * s, fy * s + by, r * s, r * s * 0.72, 0, 0, 6.29); ctx.fill();
      }
    }

    drawContent(ctx, state, t, s, time) {
      if (t.type === 'mist' || t.type === 'water') return;
      if (t.building) { this.drawBuilding(ctx, state, t, s, time); return; }
      switch (t.type) {
        case 'forest': this.drawForest(ctx, s, time, t); break;
        case 'ore': this.drawOre(ctx, s, time, t); break;
        case 'ruins': this.drawRuins(ctx, s, time, t); break;
        case 'crystal': this.drawCrystal(ctx, s, time, t); break;
      }
    }

    drawTree(ctx, s, x, y, sc, variant, time, ph, golden) {
      ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
      const sway = Math.sin(time * 1.3 + ph) * 1.6 * s;
      ctx.fillStyle = '#8a5a3b'; ctx.fillRect(-1.6 * s, -4 * s, 3.2 * s, 8 * s);
      const c1 = golden ? '#a8d84a' : (variant ? '#4fae68' : '#3e8e5a');
      const c2 = golden ? '#c4e86a' : (variant ? '#6cc47f' : '#57a86e');
      const c3 = golden ? '#8ec83e' : (variant ? '#3e8e5a' : '#2f7d4f');
      if (variant) {
        ctx.fillStyle = c3; ctx.beginPath(); ctx.arc(sway * 0.5, -10 * s, 8 * s, 0, 6.29); ctx.fill();
        ctx.fillStyle = c1; ctx.beginPath(); ctx.arc(-4 * s + sway, -13 * s, 6.5 * s, 0, 6.29); ctx.fill();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(4 * s + sway, -14 * s, 6 * s, 0, 6.29); ctx.fill();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.arc(sway, -18 * s, 5.5 * s, 0, 6.29); ctx.fill();
      } else {
        ctx.fillStyle = c3; ctx.beginPath(); ctx.moveTo(sway, -26 * s); ctx.lineTo(9 * s + sway * 0.4, -8 * s); ctx.lineTo(-9 * s + sway * 0.4, -8 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(sway, -22 * s); ctx.lineTo(7.5 * s + sway * 0.6, -8 * s); ctx.lineTo(-7.5 * s + sway * 0.6, -8 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = c2; ctx.beginPath(); ctx.moveTo(sway, -30 * s); ctx.lineTo(6 * s + sway, -16 * s); ctx.lineTo(-6 * s + sway, -16 * s); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }

    drawForest(ctx, s, time, t) {
      this.drawTree(ctx, s, -11 * s, 3 * s, 0.82, t.variant, time, t.phase, false);
      this.drawTree(ctx, s, 9 * s, -2 * s, 1.0, !t.variant, time, t.phase + 2, false);
      ctx.fillStyle = '#3e8e5a'; ctx.beginPath(); ctx.arc(1 * s, 8 * s, 4.5 * s, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#57a86e'; ctx.beginPath(); ctx.arc(-3 * s, 7 * s, 3 * s, 0, 6.29); ctx.fill();
    }

    drawBuilding(ctx, state, t, s, time) {
      const b = t.building;
      if (b === 'tree') {
        const sc = t.mature ? 1 : 0.4 + 0.6 * t.growth;
        this.drawTree(ctx, s, 0, 3 * s, sc, t.variant, time, t.phase, false);
        if (!t.mature) {
          ctx.fillStyle = 'rgba(255,255,255,.5)';
          ctx.fillRect(-8 * s, 9 * s, 16 * s * t.growth, 2 * s);
          ctx.strokeStyle = 'rgba(39,65,79,.2)'; ctx.lineWidth = 1; ctx.strokeRect(-8 * s, 9 * s, 16 * s, 2 * s);
        }
        return;
      }
      if (b === 'lifetree') {
        const g = ctx.createRadialGradient(0, -14 * s, 2, 0, -14 * s, 34 * s);
        g.addColorStop(0, 'rgba(255,230,140,.5)'); g.addColorStop(1, 'rgba(255,230,140,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -14 * s, 34 * s, 0, 6.29); ctx.fill();
        this.drawTree(ctx, s, 0, 4 * s, 1.5, t.variant, time, t.phase, true);
        for (let i = 0; i < 3; i++) {
          const a = time * 1.2 + i * 2.09;
          ctx.fillStyle = 'rgba(255,225,130,.85)';
          ctx.beginPath(); ctx.arc(Math.cos(a) * 18 * s, -16 * s + Math.sin(a) * 9 * s, 2 * s, 0, 6.29); ctx.fill();
        }
        return;
      }
      if (b === 'spring') { this.drawSpring(ctx, s, time, t); return; }
      if (b === 'house') { this.drawHouse(ctx, s, time, t); return; }
      if (b === 'windmill') { this.drawWindmill(ctx, s, time, t); return; }
    }

    drawSpring(ctx, s, time, t) {
      ctx.fillStyle = '#9aa5b1';
      for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; ctx.beginPath(); ctx.arc(Math.cos(a) * 12 * s, 2 * s + Math.sin(a) * 6 * s, 2.6 * s, 0, 6.29); ctx.fill(); }
      const g = ctx.createRadialGradient(0, 2 * s, 1, 0, 2 * s, 10 * s);
      g.addColorStop(0, '#7fccf0'); g.addColorStop(1, '#2f86bd');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 2 * s, 9.5 * s, 4.8 * s, 0, 0, 6.29); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.ellipse(0, 2 * s, 6 * s + Math.sin(time * 2 + t.phase) * 1.5 * s, 3 * s, 0, 0, 6.29); ctx.stroke();
      for (let i = 0; i < 3; i++) {
        const ph = (time * 1.4 + i / 3 + t.phase) % 1;
        const dy = -Math.sin(ph * Math.PI) * 13 * s;
        ctx.fillStyle = `rgba(150,215,245,${0.9 - ph * 0.6})`;
        ctx.beginPath(); ctx.arc((i - 1) * 3 * s, 2 * s + dy, 1.9 * s, 0, 6.29); ctx.fill();
      }
    }

    drawHouse(ctx, s, time, t) {
      const wh = 15 * s;
      ctx.fillStyle = '#d9c4a3';
      ctx.beginPath(); ctx.moveTo(-12 * s, -wh); ctx.lineTo(0, -wh + 6 * s); ctx.lineTo(0, 6 * s); ctx.lineTo(-12 * s, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f2e3c9';
      ctx.beginPath(); ctx.moveTo(12 * s, -wh); ctx.lineTo(0, -wh + 6 * s); ctx.lineTo(0, 6 * s); ctx.lineTo(12 * s, 0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#c96449';
      ctx.beginPath(); ctx.moveTo(-13 * s, -wh); ctx.lineTo(0, -wh + 6.5 * s); ctx.lineTo(0, -wh - 13 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e07a5f';
      ctx.beginPath(); ctx.moveTo(13 * s, -wh); ctx.lineTo(0, -wh + 6.5 * s); ctx.lineTo(0, -wh - 13 * s); ctx.closePath(); ctx.fill();
      const glow = 0.7 + Math.sin(time * 1.5 + t.phase) * 0.15;
      ctx.fillStyle = `rgba(255,205,110,${glow})`;
      ctx.fillRect(4 * s, -wh + 5 * s, 4.5 * s, 4.5 * s);
      ctx.fillStyle = '#8a5a3b'; ctx.fillRect(-8 * s, -3 * s, 4 * s, 7 * s);
    }

    drawWindmill(ctx, s, time, t) {
      ctx.fillStyle = '#e6d8bf';
      ctx.beginPath(); ctx.moveTo(-6 * s, 6 * s); ctx.lineTo(6 * s, 6 * s); ctx.lineTo(4 * s, -20 * s); ctx.lineTo(-4 * s, -20 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#cdbb9c';
      ctx.beginPath(); ctx.moveTo(0, 6 * s); ctx.lineTo(6 * s, 6 * s); ctx.lineTo(4 * s, -20 * s); ctx.lineTo(0, -20 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e07a5f';
      ctx.beginPath(); ctx.moveTo(-5 * s, -20 * s); ctx.lineTo(5 * s, -20 * s); ctx.lineTo(0, -26 * s); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8a5a3b'; ctx.fillRect(-2 * s, -2 * s, 4 * s, 8 * s);
      const hubX = 0, hubY = -22 * s;
      const ang = (t.spinAng || 0);
      ctx.save(); ctx.translate(hubX, hubY); ctx.rotate(ang);
      for (let i = 0; i < 4; i++) {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = '#fbf6ec';
        ctx.beginPath(); ctx.moveTo(-2 * s, 0); ctx.lineTo(2 * s, 0); ctx.lineTo(1.4 * s, -16 * s); ctx.lineTo(-1.4 * s, -16 * s); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#f0a32e'; ctx.fillRect(-1.4 * s, -16 * s, 2.8 * s, 3.4 * s);
      }
      ctx.restore();
      ctx.fillStyle = '#8a5a3b'; ctx.beginPath(); ctx.arc(hubX, hubY, 2.2 * s, 0, 6.29); ctx.fill();
    }

    drawOre(ctx, s, time, t) {
      const rocks = [[-9, 3, 8, '#8d99ae'], [7, 4, 7, '#7f8c9b'], [0, -3, 9, '#9aa5b1']];
      for (const [fx, fy, r, c] of rocks) {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(fx * s, (fy - r) * s); ctx.lineTo((fx + r) * s, fy * s); ctx.lineTo((fx + r * 0.5) * s, (fy + r * 0.7) * s); ctx.lineTo((fx - r * 0.6) * s, (fy + r * 0.7) * s); ctx.lineTo((fx - r) * s, fy * s); ctx.closePath(); ctx.fill();
      }
      const pulse = 0.7 + Math.sin(time * 2.4 + t.phase) * 0.3;
      for (const [fx, fy] of [[-2, -4], [5, 0]]) {
        ctx.fillStyle = `rgba(240,163,46,${pulse})`;
        ctx.beginPath(); ctx.moveTo(fx * s, (fy - 5) * s); ctx.lineTo((fx + 3) * s, fy * s); ctx.lineTo(fx * s, (fy + 4) * s); ctx.lineTo((fx - 3) * s, fy * s); ctx.closePath(); ctx.fill();
      }
      for (let i = 0; i < 3; i++) {
        ctx.fillStyle = i < t.oreCharges ? 'rgba(240,163,46,.9)' : 'rgba(39,65,79,.18)';
        ctx.beginPath(); ctx.arc((i - 1) * 5 * s, 11 * s, 1.7 * s, 0, 6.29); ctx.fill();
      }
    }

    drawRuins(ctx, s, time, t) {
      ctx.fillStyle = '#9aa5b1'; ctx.beginPath(); ctx.ellipse(0, 7 * s, 15 * s, 6 * s, 0, 0, 6.29); ctx.fill();
      ctx.fillStyle = '#d4dae1'; ctx.fillRect(-10 * s, -14 * s, 5 * s, 20 * s);
      ctx.fillStyle = '#bfc7d0'; ctx.fillRect(-11 * s, -16 * s, 7 * s, 3 * s);
      ctx.save(); ctx.translate(6 * s, 2 * s); ctx.rotate(0.12);
      ctx.fillStyle = '#c8cfd8'; ctx.fillRect(-2.5 * s, -10 * s, 5 * s, 14 * s);
      ctx.fillStyle = '#b0b8c2'; ctx.fillRect(-3.5 * s, -12 * s, 7 * s, 2.6 * s);
      ctx.restore();
      ctx.fillStyle = '#6cc47f';
      ctx.beginPath(); ctx.arc(-8 * s, 4 * s, 2 * s, 0, 6.29); ctx.fill();
      ctx.beginPath(); ctx.arc(9 * s, 5 * s, 1.6 * s, 0, 6.29); ctx.fill();
      if (!t.excavated) {
        const p = 0.5 + Math.sin(time * 2 + t.phase) * 0.4;
        ctx.fillStyle = `rgba(255,225,140,${p})`;
        ctx.beginPath(); ctx.arc(0, -18 * s, 2.2 * s, 0, 6.29); ctx.fill();
      }
    }

    drawCrystal(ctx, s, time, t) {
      const pulse = 0.6 + Math.sin(time * 2.2 + t.phase) * 0.35;
      const g = ctx.createRadialGradient(0, -6 * s, 2, 0, -6 * s, 26 * s);
      g.addColorStop(0, `rgba(220,140,240,${0.4 * pulse})`); g.addColorStop(1, 'rgba(220,140,240,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -6 * s, 26 * s, 0, 6.29); ctx.fill();
      const gg = ctx.createLinearGradient(0, -22 * s, 0, 8 * s);
      gg.addColorStop(0, '#e9a8f5'); gg.addColorStop(0.5, '#c65fd1'); gg.addColorStop(1, '#7b4fd1');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.moveTo(0, -22 * s); ctx.lineTo(8 * s, -8 * s); ctx.lineTo(5 * s, 8 * s); ctx.lineTo(-5 * s, 8 * s); ctx.lineTo(-8 * s, -8 * s); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, -22 * s); ctx.lineTo(0, 8 * s); ctx.moveTo(-8 * s, -8 * s); ctx.lineTo(8 * s, -8 * s); ctx.stroke();
      for (let i = 0; i < 2; i++) {
        const a = time * 1.6 + i * 3.14;
        ctx.fillStyle = 'rgba(255,255,255,.85)';
        ctx.beginPath(); ctx.arc(Math.cos(a) * 14 * s, -6 * s + Math.sin(a) * 8 * s, 1.8 * s, 0, 6.29); ctx.fill();
      }
    }

    drawLinks(ctx, state, s, time) {
      const bs = state.tiles.filter(t => t.land && t.building && ['house', 'windmill', 'spring', 'lifetree'].includes(t.building));
      ctx.lineWidth = 2 * s;
      for (const t of bs) {
        for (const [dc, dr] of [[1, 0], [0, 1]]) {
          const n = state.byKey.get((t.c + dc) + ',' + (t.r + dr));
          if (n && n.land && n.building && ['house', 'windmill', 'spring', 'lifetree'].includes(n.building)) {
            const a = this.tileScreen(t), b = this.tileScreen(n);
            const al = 0.28 + Math.sin(time * 2.4 + t.phase) * 0.14;
            ctx.strokeStyle = rgba('#f0a32e', al);
            ctx.beginPath(); ctx.moveTo(a.x, a.y - 8 * s); ctx.lineTo(b.x, b.y - 8 * s); ctx.stroke();
            const mt = (time * 0.5 + t.phase) % 1;
            ctx.fillStyle = rgba('#ffd76a', 0.8);
            ctx.beginPath(); ctx.arc(lerp(a.x, b.x, mt), lerp(a.y - 8 * s, b.y - 8 * s, mt), 2.4 * s, 0, 6.29); ctx.fill();
          }
        }
      }
    }

    ambient(state, dt, time, s) {
      const R = state.rulesActive;
      const land = state.tiles.filter(t => t.land && t.type !== 'mist');
      if (!land.length) return;
      const at = (key, interval, fn) => { this.amb[key] -= dt; if (this.amb[key] <= 0) { this.amb[key] = interval; fn(); } };
      if (R.has('verdant')) at('verdant', 0.5, () => {
        const trees = land.filter(t => t.building === 'tree' || t.type === 'forest');
        if (trees.length) { const t = pick(trees), p = this.tileScreen(t); this.add({ type: 'mote', x: p.x + rnd(-10, 10), y: p.y, vx: rnd(-8, 8), vy: rnd(-26, -14), g: 0, life: rnd(1.2, 2), max: 2, size: rnd(2, 3.5), color: '#6cc47f', rot: 0, vr: 0 }); }
      });
      if (R.has('farwaters')) at('water', 0.4, () => {
        const ws = land.filter(t => t.type === 'water' || t.building === 'spring');
        if (ws.length) { const t = pick(ws), p = this.tileScreen(t); this.sparkles(p.x + rnd(-14, 14), p.y + rnd(-8, 8), '#7fccf0', 1); }
      });
      if (R.has('transmute')) at('transmute', 0.6, () => {
        const bs = land.filter(t => t.building === 'house' || t.building === 'windmill');
        if (bs.length) { const t = pick(bs), p = this.tileScreen(t); this.add({ type: 'mote', x: p.x, y: p.y - 14 * s, vx: rnd(-10, 10), vy: rnd(-24, -12), g: 0, life: 1.6, max: 1.6, size: rnd(2, 3.4), color: '#ef8a7a', rot: 0, vr: 0 }); }
      });
      if (R.has('terra')) at('terra', 0.8, () => {
        const t = pick(land), p = this.tileScreen(t);
        this.add({ type: 'mote', x: p.x + rnd(-16, 16), y: p.y + rnd(0, 10), vx: rnd(-6, 6), vy: rnd(-18, -8), g: 0, life: 1.4, max: 1.4, size: rnd(1.6, 3), color: '#d98fe0', rot: 0, vr: 0 });
      });
      at('sparkle', 1.3, () => {
        const ms = land.filter(t => t.building === 'tree' && t.mature);
        if (ms.length) { const t = pick(ms), p = this.tileScreen(t); this.sparkles(p.x, p.y - 20 * s, '#bfe8a0', 1); }
      });
      at('fall', 0.13, () => {
        const ws = land.filter(t => t.type === 'water');
        for (const t of ws) {
          const nR = state.byKey.get((t.c + 1) + ',' + t.r), nD = state.byKey.get(t.c + ',' + (t.r + 1));
          const p = this.tileScreen(t);
          if (!nR || !nR.land) this.add({ type: 'drop', x: p.x + HW * s * 0.5, y: p.y + HH * s * 0.5, vx: rnd(4, 14), vy: rnd(10, 30), g: 260, life: rnd(0.7, 1.1), max: 1.1, size: rnd(1.6, 2.8), color: '#7fccf0', rot: 0, vr: 0 });
          if (!nD || !nD.land) this.add({ type: 'drop', x: p.x - HW * s * 0.5, y: p.y + HH * s * 0.5, vx: rnd(-14, -4), vy: rnd(10, 30), g: 260, life: rnd(0.7, 1.1), max: 1.1, size: rnd(1.6, 2.8), color: '#7fccf0', rot: 0, vr: 0 });
        }
      });
    }

    updateParts(ctx, dt) {
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const p = this.parts[i];
        p.life -= dt;
        if (p.life <= 0) { this.parts.splice(i, 1); continue; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
        const a = clamp(p.life / p.max, 0, 1);
        ctx.save(); ctx.globalAlpha = a;
        if (p.type === 'text') {
          ctx.font = `800 ${p.size}px ${'"PingFang SC","Microsoft YaHei",sans-serif'}`;
          ctx.textAlign = 'center'; ctx.fillStyle = p.color;
          ctx.shadowColor = 'rgba(255,255,255,.9)'; ctx.shadowBlur = 4;
          ctx.fillText(p.text, p.x, p.y);
        } else if (p.type === 'ring') {
          const r = p.size + (1 - a) * 46;
          ctx.strokeStyle = p.color; ctx.lineWidth = 2.5 * a + 0.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.29); ctx.stroke();
        } else if (p.type === 'spark') {
          ctx.translate(p.x, p.y); const r = p.size * (0.5 + a * 0.5);
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.moveTo(0, -r * 1.6); ctx.lineTo(r * 0.4, -r * 0.4); ctx.lineTo(r * 1.6, 0); ctx.lineTo(r * 0.4, r * 0.4); ctx.lineTo(0, r * 1.6); ctx.lineTo(-r * 0.4, r * 0.4); ctx.lineTo(-r * 1.6, 0); ctx.lineTo(-r * 0.4, -r * 0.4); ctx.closePath(); ctx.fill();
        } else if (p.type === 'leaf' || p.type === 'conf') {
          ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.color;
          if (p.type === 'leaf') { ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.5, 0, 0, 6.29); ctx.fill(); }
          else ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
        } else if (p.type === 'puff') {
          ctx.fillStyle = p.color; ctx.globalAlpha = a * 0.8;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.3 - a * 0.3), 0, 6.29); ctx.fill();
        } else if (p.type === 'mote') {
          ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 6;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * a, 0, 6.29); ctx.fill();
        } else {
          ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (p.type === 'drop' ? 1 : a), 0, 6.29); ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  return Renderer;
})();