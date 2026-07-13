// ENFORCER 2.0 — STREAKS view: 30-day chart, day grid, per-rule streaks, badge wall, crowns
'use strict';
import { S, todayKey, addDays, parseKey, fmtDate, MILESTONES } from './state.js';
import { activeRules, dayClean, streakEndingAt, perRuleStreak, isPowerDay, crowns, ruleName, mirrorHerCount30, identityValid, voteTrajectory, lifetimeClean, recoveryScore, totalVolumeLifetime, topExercisesByRecentVolume, exercisePR, exerciseSparkline } from './engine.js';
import { $, esc, ICONS, ruleIcon } from './ui-shared.js';
import { retention30, forecast } from './srs.js';

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

  // mirror stat
  const ms = $('#mirror-stat');
  ms.innerHTML = identityValid() ? `${ICONS.mirror} Mirror — <b>${mirrorHerCount30()}/30</b> mornings chosen` : '';

  // P3: recovery stat — never-miss-twice
  const rs = $('#recovery-stat');
  const rec = recoveryScore();
  rs.innerHTML = rec === null ? '' : `${ICONS.check} Recovery — <b>${rec}%</b> never-miss-twice`;

  // 1.01^n compounding reframe
  const cs = $('#compound-stat');
  if (!identityValid()) cs.innerHTML = '';
  else {
    const lc = lifetimeClean();
    const factor = lc >= 365 ? '37.8+' : (1.01 ** lc).toFixed(1);
    cs.innerHTML = `1% better daily: ×${factor} vs standing still`;
  }

  // trajectory chart: cumulative HER votes, last 60 days, vs linear expectation
  const tj = $('#trajectory-card');
  if (!identityValid()) { tj.style.display = 'none'; }
  else {
    const traj = voteTrajectory(60);
    const total = traj[traj.length - 1];
    if (total < 5) { tj.style.display = 'none'; }
    else {
      tj.style.display = '';
      const TW = 308, TH = 120, tmax = Math.max(...traj, 1);
      const tx = i => 4 + i * (TW - 8) / (traj.length - 1), ty = v => TH - 12 - v * (TH - 30) / tmax;
      let tpath = '';
      traj.forEach((v, i) => { tpath += (i ? ' L ' : 'M ') + tx(i).toFixed(1) + ' ' + ty(v).toFixed(1); });
      $('#trajectory-chart').innerHTML = `
        <svg viewBox="0 0 ${TW} ${TH}" style="width:100%; height:auto; display:block" role="img" aria-label="Cumulative votes for ${esc(S.identity.her.name)} over the last 60 days, currently ${total}">
          <line x1="${tx(0)}" y1="${ty(0)}" x2="${tx(traj.length - 1)}" y2="${ty(total)}" stroke="rgba(255,255,255,0.25)" stroke-width="1.5" stroke-dasharray="4 4"/>
          <path d="${tpath}" fill="none" stroke="#a78bfa" stroke-width="2.2" stroke-linecap="round"/>
          <circle cx="${tx(traj.length - 1)}" cy="${ty(total)}" r="4" fill="#c4b5fd"/>
          <text x="${tx(traj.length - 1) - 6}" y="${ty(total) - 9}" fill="#c4b5fd" font-size="11" font-weight="700" text-anchor="end" font-family="Inter">${total}</text>
        </svg>`;
    }
  }

  // quiz stat (P7) — lifetime counts derived from S.quizLog
  const qs = $('#quiz-stat');
  if (!S.quizLog.length) qs.innerHTML = '';
  else {
    const right = S.quizLog.filter(l => l.right).length;
    const acc = Math.round(100 * right / S.quizLog.length);
    qs.innerHTML = `${ICONS.check} Quiz — <b>${S.quizLog.length}</b> answered · <b>${acc}%</b> right`;
  }

  // P5: Body — lifetime tonnage + top exercises with mini progression sparkline + PR chip
  const bsc = $('#body-streaks-card');
  if (!S.gym.length) { bsc.style.display = 'none'; }
  else {
    bsc.style.display = '';
    const tonnes = (totalVolumeLifetime() / 1000).toFixed(1);
    $('#body-tonnage-line').innerHTML = `<div class="tonnage-line"><b>${tonnes} t</b> moved — that's who moves it</div>`;
    const top = topExercisesByRecentVolume(3);
    $('#body-top-exercises').innerHTML = top.map(ex => {
      const pr = exercisePR(ex.name);
      const spark = exerciseSparkline(ex.name, 10);
      const SW = 100, SH = 28;
      const smax = Math.max(...spark, 1), smin = Math.min(...spark, 0);
      const range = Math.max(1, smax - smin);
      const sx = i => spark.length > 1 ? i * SW / (spark.length - 1) : SW / 2;
      const sy = v => SH - 3 - ((v - smin) / range) * (SH - 6);
      const points = spark.map((v, i) => `${sx(i).toFixed(1)},${sy(v).toFixed(1)}`).join(' ');
      return `
        <div class="exercise-row">
          <div class="exercise-name-line">
            <span class="exercise-name-lbl">${esc(ex.name)}</span>
            ${pr ? `<span class="pr-chip">PR ${pr.maxKg} kg</span>` : ''}
          </div>
          ${spark.length > 1 ? `<svg viewBox="0 0 ${SW} ${SH}" style="width:100%; height:${SH}px; display:block; margin-top:6px">
            <polyline points="${points}" fill="none" stroke="#a78bfa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>` : ''}
        </div>`;
    }).join('');
  }

  // recall stats (P6)
  const rsc = $('#recall-stats-card');
  const ret = retention30(t);
  const fc = forecast(7, t);
  if (ret === null && !fc.some(n => n > 0)) { rsc.style.display = 'none'; }
  else {
    rsc.style.display = '';
    $('#recall-retention-line').innerHTML = ret === null
      ? '<div class="empty-note">No reviews yet in the last 30 days.</div>'
      : `<div class="recall-summary-line">Recall — <b style="color:var(--violet-hi)">${ret}%</b> 30-day retention</div>`;
    const maxF = Math.max(...fc, 1);
    $('#recall-forecast').innerHTML = fc.map((n, i) => {
      const k = addDays(t, i);
      const lbl = i === 0 ? 'Today' : parseKey(k).toLocaleDateString('en-GB', { weekday: 'narrow' });
      const h = Math.max(2, Math.round(36 * n / maxF));
      return `<div class="forecast-col"><div class="forecast-fill" style="height:${h}px" title="${n} due ${k}"></div><div class="forecast-lbl">${lbl}</div></div>`;
    }).join('');
  }
}
