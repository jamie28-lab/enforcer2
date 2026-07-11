// ENFORCER 2.0 — STREAKS view: 30-day chart, day grid, per-rule streaks, badge wall, crowns
'use strict';
import { S, todayKey, addDays, parseKey, fmtDate, MILESTONES } from './state.js';
import { activeRules, dayClean, streakEndingAt, perRuleStreak, isPowerDay, crowns, ruleName } from './engine.js';
import { $, esc, ICONS, ruleIcon } from './ui-shared.js';

export function renderStreaks() {
  // chart: streak value over last 30 days
  const t = todayKey(); const pts = [];
  for (let i = 29; i >= 0; i--) {
    const k = addDays(t, -i);
    if (k < S.createdAt) { pts.push(0); continue; }
    const st = dayClean(k, k < t);
    pts.push(st === 'pass' ? streakEndingAt(k) : (st === 'holiday' || st === 'open') ? (pts.length ? pts[pts.length - 1] : 0) : 0);
  }
  const W = 308, H = 120, max = Math.max(...pts, 5);
  const x = i => 4 + i * (W - 8) / 29, y = v => H - 12 - v * (H - 30) / max;
  let path = '', area = `M ${x(0)} ${H - 12}`;
  pts.forEach((v, i) => { path += (i ? ' L ' : 'M ') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); area += ` L ${x(i).toFixed(1)} ${y(v).toFixed(1)}`; });
  area += ` L ${x(29)} ${H - 12} Z`;
  $('#chart-box').innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" style="width:100%; height:auto; display:block" role="img" aria-label="Streak over the last 30 days, currently ${pts[29]}">
      <defs>
        <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(139,92,246,0.45)"/><stop offset="100%" stop-color="rgba(139,92,246,0)"/>
        </linearGradient>
        <filter id="lineGlow"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
      </defs>
      ${[0.25, 0.5, 0.75].map(f => `<line x1="4" x2="${W - 4}" y1="${(H - 12) - f * (H - 30)}" y2="${(H - 12) - f * (H - 30)}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>`).join('')}
      <path d="${area}" fill="url(#areaGrad)"/>
      <path d="${path}" fill="none" stroke="#a78bfa" stroke-width="2.2" stroke-linecap="round" filter="url(#lineGlow)"/>
      <circle cx="${x(29)}" cy="${y(pts[29])}" r="4" fill="#c4b5fd" filter="url(#lineGlow)"/>
      <text x="${x(29) - 6}" y="${y(pts[29]) - 9}" fill="#c4b5fd" font-size="11" font-weight="700" text-anchor="end" font-family="Inter">${pts[29]}</text>
    </svg>`;

  // day grid
  const dg = $('#daygrid'); dg.innerHTML = '';
  for (let i = 29; i >= 0; i--) {
    const k = addDays(t, -i);
    let cls = '';
    if (k >= S.createdAt) {
      const st = dayClean(k, k < t);
      cls = st === 'pass' ? (isPowerDay(k) ? 'power' : 'pass') : st === 'fail' ? 'fail' : st === 'holiday' ? 'holiday' : '';
    }
    dg.insertAdjacentHTML('beforeend', `<div class="daycell ${cls} ${k === t ? 'today' : ''}" title="${k}"></div>`);
  }

  // per rule
  const pr = $('#per-rule'); pr.innerHTML = '';
  for (const r of activeRules(t)) {
    pr.insertAdjacentHTML('beforeend', `
      <div class="rule-line">
        <div class="rule-ico">${ruleIcon(r)}</div>
        <div style="flex:1"><div class="rule-name">${esc(ruleName(r))}</div></div>
        <div class="rule-streak" style="font-size:16px">${ICONS.flameSm}${perRuleStreak(r)}</div>
      </div>`);
  }

  // badges
  const bw = $('#badge-wall'); bw.innerHTML = '';
  for (const m of MILESTONES) {
    const earned = S.badges.find(b => b.n === m.n);
    bw.insertAdjacentHTML('beforeend', `
      <div class="badge ${earned ? 'earned' : ''}">${ICONS.trophy}<div class="b-num">${m.n}</div><div class="b-name">${esc(m.title)}</div></div>`);
  }

  // crowns
  const c = crowns(); const cr = $('#crown-row'); cr.innerHTML = '';
  if (!c.weeks.length && !c.months.length) cr.innerHTML = '<div class="empty-note" style="width:100%">Perfect calendar weeks and months land here. First crown: one clean Monday-to-Sunday.</div>';
  c.months.forEach(m => cr.insertAdjacentHTML('beforeend', `<span class="crown-chip">${ICONS.crown}${parseKey(m + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span>`));
  c.weeks.slice(-8).forEach(w => cr.insertAdjacentHTML('beforeend', `<span class="crown-chip">${ICONS.crown}wk ${fmtDate(w)}</span>`));
}
