// ENFORCER 2.0 — shared UI: $ helpers, toast, icons, confetti, overlays, render bus
'use strict';
import { S, save } from './state.js';
import { pick, bestStreakEver, pending } from './engine.js';

/* Render bus — app.js wires the real functions in; avoids circular imports. */
export const bus = {
  refresh: () => {},
  renderSettings: () => {},
};

export const $ = s => document.querySelector(s);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg; el.classList.add('show');
  clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove('show'), 3200);
}

export const ICONS = {
  sun: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>',
  wine: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 22h8M12 15v7M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5Z"/><line x1="3" y1="3" x2="21" y2="21"/></svg>',
  burger: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16a1 1 0 0 0 .9-1.45C19.6 5.9 16.1 4 12 4S4.4 5.9 3.1 8.55A1 1 0 0 0 4 10Z"/><path d="M3 14h18"/><path d="M4 18h16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z"/><line x1="3" y1="3" x2="21" y2="21"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  flameSm: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  zap: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6m12 5h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22m7-7.34V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22M18 2H6v7a6 6 0 0 0 12 0V2Z"/></svg>',
  crown: '<svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',
};
export const ruleIcon = r => r.kind === 'wake' ? ICONS.sun : (r.id === 'alcohol' ? ICONS.wine : (r.id === 'junk' ? ICONS.burger : ICONS.shield));

/* ---------- number tick-up (respects prefers-reduced-motion) ---------- */
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export function setNumber(el, value) {
  const target = Number(value);
  const prev = Number(el.dataset.val ?? el.textContent) || 0;
  el.dataset.val = target;
  if (reducedMotion() || prev === target || !Number.isFinite(target)) { el.textContent = value; return; }
  const dur = 550, t0 = performance.now();
  cancelAnimationFrame(el._raf);
  (function step(ts) {
    const p = Math.min(1, (ts - t0) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(prev + (target - prev) * eased);
    if (p < 1) el._raf = requestAnimationFrame(step);
  })(t0);
}

/* ---------- overlays: celebration & shame ---------- */
export function showCelebration(c) {
  $('#cel-kicker').textContent = c.goal ? 'Goal complete' : 'Milestone unlocked';
  $('#cel-num').textContent = c.n;
  $('#cel-title').textContent = c.title;
  $('#cel-line').textContent = pick('milestone', { n: c.n, record: bestStreakEver() });
  $('#celebrate-veil').classList.add('open');
  confetti();
}
let shameCtx = null;
export function showShame(ctx) {
  shameCtx = ctx;
  $('#shame-num').textContent = ctx.lost;
  $('#shame-title').textContent = ctx.rule;
  $('#shame-line').innerHTML = pick('shame', { lost: ctx.lost, record: bestStreakEver() }) + `<br>Record to beat: <b>${bestStreakEver()}</b>.`;
  $('#shame-note').value = '';
  $('#shame-veil').classList.add('open');
}
export function confetti() {
  if (reducedMotion()) return;
  const cv = $('#confetti'); const ctx = cv.getContext('2d');
  cv.width = innerWidth; cv.height = innerHeight;
  const P = []; const colors = ['#a78bfa', '#8b5cf6', '#c4b5fd', '#fbbf24', '#f59e0b', '#ffffff'];
  for (let i = 0; i < 140; i++) P.push({ x: Math.random() * cv.width, y: -20 - Math.random() * cv.height * 0.5,
    vx: (Math.random() - 0.5) * 2.2, vy: 2 + Math.random() * 3.5, s: 4 + Math.random() * 6, r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.25, c: colors[i % colors.length] });
  let frames = 0;
  (function tick() {
    ctx.clearRect(0, 0, cv.width, cv.height);
    for (const p of P) {
      p.x += p.vx; p.y += p.vy; p.r += p.vr;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * 0.6); ctx.restore();
    }
    if (++frames < 240 && $('#celebrate-veil').classList.contains('open')) requestAnimationFrame(tick);
    else ctx.clearRect(0, 0, cv.width, cv.height);
  })();
}

/* overlay button wiring (called once from app.js) */
export function wireOverlays() {
  $('#cel-ok').onclick = () => {
    $('#celebrate-veil').classList.remove('open');
    if (pending.celebration) { showCelebration(pending.celebration); pending.celebration = null; }
  };
  $('#shame-ok').onclick = () => {
    const note = $('#shame-note').value.trim();
    if (note && shameCtx) { const m = S.mistakes.find(m => m.date === shameCtx.date && !m.note); if (m) m.note = note; save(); }
    $('#shame-veil').classList.remove('open');
    if (pending.shame) { showShame(pending.shame); pending.shame = null; }
    bus.refresh(false);
  };
  document.querySelectorAll('.sheet-veil').forEach(v => v.addEventListener('click', e => { if (e.target === v) v.classList.remove('open'); }));
}
