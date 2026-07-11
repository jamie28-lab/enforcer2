// ENFORCER 2.0 — TODAY view: hero, wake card, rules, check-in, bonus habits, goals
'use strict';
import { S, save, todayKey, parseKey, addDays, hm, now, fmtDate, MILESTONES } from './state.js';
import {
  activeRules, wakeRule, isHoliday, day, ensureDay, ruleOutcome, dayClean, currentStreak,
  streakEndingAt, perRuleStreak, bestStreakEver, lifetimeClean, activeHabits, isPowerDay,
  lifetimePower, goalStatus, ruleName, pick, stageFor, settle, pending,
} from './engine.js';
import { $, esc, toast, ICONS, ruleIcon, bus, setNumber, showShame, showCelebration } from './ui-shared.js';
import { requestNotifPermission } from './reminders.js';

function renderNotifBanner() {
  const nb = $('#notif-banner');
  if (!('Notification' in window)) { nb.style.display = 'none'; return; }
  if (Notification.permission === 'granted') { nb.style.display = 'none'; return; }
  nb.style.display = '';
  if (Notification.permission === 'denied') {
    nb.innerHTML = `<h3>${ICONS.sun}Notifications blocked</h3><div class="hint">Enable in iPhone Settings → Notifications → Enforcer to get reminders.</div>`;
  } else {
    nb.innerHTML = `<h3>${ICONS.sun}Stay on track</h3><div class="hint" style="margin-bottom:10px">Enable notifications so reminders can reach you.</div><button class="btn ghost small" id="notif-banner-btn">Enable notifications</button>`;
    $('#notif-banner-btn').onclick = requestNotifPermission;
  }
}

export function renderToday() {
  const t = todayKey(), d = day(t), hol = isHoliday(t);
  renderNotifBanner();
  $('#today-date').textContent = parseKey(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  const h = now().getHours();
  $('#greet-hi').textContent = h < 12 ? 'Good morning, Reetta' : h < 18 ? 'Good afternoon, Reetta' : 'Good evening, Reetta';
  const streak = currentStreak();
  $('#greet-sub').textContent = hol ? 'Holiday — streaks are paused. Rest properly.' :
    (dayClean(t) === 'pass' ? 'Today is already clean. Well held.' : 'Rules are waiting. Keep the day clean.');

  setNumber($('#streak-big'), streak);
  const stage = stageFor(streak);
  $('#stage-chip').innerHTML = `${ICONS.flameSm} ${stage.name}${streak > 0 ? ' · day ' + streak : ''}`;
  const fl = $('#flame-svg'); fl.className.baseVal = ''; fl.classList.add('flame-svg'); if (stage.cls) fl.classList.add(stage.cls);
  $('#flame-ring').style.display = streak > 0 ? '' : 'none';
  const next = MILESTONES.find(m => m.n > streak);
  $('#stake-line').innerHTML = hol ? `Paused on <b>${streak}</b> — no growth, no cuts.` :
    streak > 0
      ? `<b>${streak} days</b> on the line tonight.${next ? ` ${next.n - streak} to <b>${next.title}</b>.` : ''}`
      : (next ? `Tonight earns day 1 — <b>${next.title}</b> is one clean day away.` : '');

  const record = bestStreakEver();
  const isComeback = streak <= 3 && S.mistakes.length > 0 && record > streak;
  $('#motto').textContent = pick(isComeback ? 'comeback' : 'morning', { n: Math.max(streak, 1), n1: streak + 1, record, lost: 0 });

  setNumber($('#tile-lifetime'), lifetimeClean());
  setNumber($('#tile-record'), record);
  setNumber($('#tile-badges'), S.badges.length);
  setNumber($('#tile-power'), lifetimePower());

  // wake card
  const wr = wakeRule(); const wc = $('#wake-card');
  if (hol) {
    wc.innerHTML = `<h3>${ICONS.sun}Wake-up</h3><div class="empty-note">On holiday — sleep in guilt-free.</div>`;
  } else if (!activeRules(t).some(r => r.kind === 'wake')) {
    wc.innerHTML = `<h3>${ICONS.sun}Wake-up</h3><div class="empty-note">Starts tomorrow morning — up by ${esc(wr.wakeTime)}.</div>`;
  } else if (d.wake) {
    wc.innerHTML = `<h3>${ICONS.sun}Wake-up</h3><div class="row"><div><div class="rule-name">Up at ${esc(d.wake)}</div><div class="rule-meta">Target ${esc(wr.wakeTime)} — ${d.wake <= wr.wakeTime ? 'made it' : 'too late'}</div></div><span class="status-pill ${d.wake <= wr.wakeTime ? 'done' : 'failed'}">${d.wake <= wr.wakeTime ? 'Passed' : 'Failed'}</span></div>`;
  } else if (hm(now()) <= wr.wakeTime) {
    wc.innerHTML = `<h3>${ICONS.sun}Wake-up — before ${esc(wr.wakeTime)}</h3><button class="btn wake-btn" id="wake-btn">${ICONS.sun} I'M UP</button><div class="wake-caption">Tap when you're actually vertical. Timestamped, no backsies.</div>`;
    $('#wake-btn').onclick = () => { ensureDay(t).wake = hm(now()); save(); toast('Wake-up logged: ' + hm(now())); bus.refresh(); };
  } else {
    wc.innerHTML = `<h3>${ICONS.sun}Wake-up</h3><div class="row"><div class="rule-name">Missed — window closed ${esc(wr.wakeTime)}</div><span class="status-pill failed">Failed</span></div>`;
  }

  // rules list
  const box = $('#rules-today'); box.innerHTML = '';
  for (const r of activeRules(t)) {
    const o = hol ? null : ruleOutcome(r, t, false);
    const stat = hol ? '<span class="status-pill pending">Paused</span>' :
      o === true ? '<span class="status-pill done">Clean</span>' :
      o === false ? '<span class="status-pill failed">Broken</span>' :
      '<span class="status-pill pending">Pending</span>';
    const ps = perRuleStreak(r);
    box.insertAdjacentHTML('beforeend', `
      <div class="rule-line">
        <div class="rule-ico ${o === true ? 'done' : o === false ? 'failed' : ''}">${o === true ? ICONS.check : o === false ? ICONS.x : ruleIcon(r)}</div>
        <div style="flex:1"><div class="rule-name">${esc(ruleName(r))}</div><div class="rule-meta">${r.ground ? 'Ground rule' : 'Added ' + fmtDate(r.addedOn)}</div></div>
        <div class="rule-streak">${ICONS.flameSm}${ps}</div>
        ${stat}
      </div>`);
  }
  // escalated goals shown as rules
  for (const gid of (d.escalated || [])) {
    const g = S.goals.find(x => x.id === gid); if (!g) continue;
    const done = (d.goalDone || {})[g.id] > 0;
    box.insertAdjacentHTML('beforeend', `
      <div class="rule-line">
        <div class="rule-ico ${done ? 'done' : ''}">${done ? ICONS.check : ICONS.zap}</div>
        <div style="flex:1"><div class="rule-name">${esc(g.name)} — today or it cuts</div><div class="rule-meta">Goal out of slack: escalated to hard rule</div></div>
        ${done ? '<span class="status-pill done">Clean</span>' : '<span class="status-pill pending">Pending</span>'}
      </div>`);
  }

  // bonus habits
  const hc = $('#habits-card'), hchips = $('#habit-chips');
  const habs = activeHabits(t);
  if (!habs.length) hc.style.display = 'none';
  else {
    hc.style.display = ''; hchips.innerHTML = '';
    const doneMap = d.habitsDone || {};
    for (const hb of habs) {
      hchips.insertAdjacentHTML('beforeend',
        `<button class="habit-chip ${doneMap[hb.id] ? 'done' : ''}" data-habit="${hb.id}">${doneMap[hb.id] ? ICONS.check : ICONS.zap}${esc(hb.name)}</button>`);
    }
    hchips.querySelectorAll('[data-habit]').forEach(b => b.onclick = () => {
      const dd = ensureDay(t); dd.habitsDone = dd.habitsDone || {};
      const id = b.dataset.habit;
      dd.habitsDone[id] = !dd.habitsDone[id];
      const wasPower = isPowerDay(t);
      save(); renderToday();
      if (wasPower && dd.habitsDone[id]) toast('⚡ Power Day secured. Extra credit, banked.');
    });
    const doneCount = habs.filter(h => doneMap[h.id]).length;
    const pl = $('#power-line');
    if (isPowerDay(t)) pl.innerHTML = `<div class="power-line">${ICONS.zap} Power Day — clean + all ${habs.length} extras. Gold in the books.</div>`;
    else if (doneCount === habs.length && habs.length) pl.innerHTML = `<div class="power-line dim">${ICONS.zap} All extras done — goes gold once the day is clean.</div>`;
    else pl.innerHTML = `<div class="power-line dim">${ICONS.zap} ${doneCount}/${habs.length} extras · all of them + a clean day = Power Day</div>`;
  }

  const cb = $('#checkin-btn');
  if (hol) { cb.textContent = 'On holiday — check-in optional'; cb.disabled = false; }
  else if (d.checkedIn) { cb.textContent = 'Checked in ✓ — locked for today'; cb.disabled = true; }
  else { cb.textContent = 'Evening check-in'; cb.disabled = false; }

  // goals card
  const gc = $('#goals-card'), gbox = $('#goals-today');
  if (!S.goals.length) gc.style.display = 'none';
  else {
    gc.style.display = ''; gbox.innerHTML = '';
    for (const g of S.goals) {
      const st = goalStatus(g);
      const pct = g.type === 'mile' ? (g.completed ? 100 : 0) : Math.min(100, Math.round(100 * st.done / (st.target || 1)));
      const liveEscalated = (d.escalated || []).includes(g.id);
      gbox.insertAdjacentHTML('beforeend', `
        <div class="goal-line">
          <div class="goal-top"><span class="goal-name">${esc(g.name)}</span><span class="goal-count">${esc(st.label)}</span></div>
          <div class="goal-bar"><div class="goal-fill" style="width:${pct}%"></div></div>
          ${liveEscalated ? `<div class="goal-escalated">${ICONS.zap} Out of slack — today it's a hard rule</div>`
            : st.escalate ? `<div class="goal-escalated">${ICONS.zap} Behind pace — becomes a hard rule tomorrow</div>` : ''}
        </div>`);
    }
  }
}

/* ---------- check-in sheet ---------- */
let checkinDraft = {};
export function openCheckin() {
  const t = todayKey(); const d = day(t);
  if (d.checkedIn) return;
  checkinDraft = { answers: {}, goals: {} };
  const box = $('#checkin-items'); box.innerHTML = '';
  for (const r of activeRules(t).filter(r => r.kind !== 'wake')) {
    box.insertAdjacentHTML('beforeend', `
      <div class="check-item"><span class="ci-name">${esc(ruleName(r))}?</span>
        <div class="yn" data-rule="${r.id}"><button class="yes">Held</button><button class="no">Broke</button></div>
      </div>`);
  }
  for (const g of S.goals.filter(g => g.type !== 'mile')) {
    if (g.type === 'freq') box.insertAdjacentHTML('beforeend', `
      <div class="check-item"><span class="ci-name">${esc(g.name)} today?</span>
        <div class="yn" data-goal="${g.id}"><button class="yes">Yes</button><button class="no">No</button></div>
      </div>`);
    else box.insertAdjacentHTML('beforeend', `
      <div class="check-item"><span class="ci-name">${esc(g.name)} today (${esc(g.unit || '')})</span>
        <input class="num-in" type="number" min="0" step="any" placeholder="0" data-gnum="${g.id}">
      </div>`);
  }
  box.querySelectorAll('.yn').forEach(yn => {
    yn.querySelectorAll('button').forEach(b => b.onclick = () => {
      yn.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      const val = b.classList.contains('yes');
      if (yn.dataset.rule) checkinDraft.answers[yn.dataset.rule] = val;
      else checkinDraft.goals[yn.dataset.goal] = val ? 1 : 0;
    });
  });
  $('#checkin-veil').classList.add('open');
}
export function submitCheckin() {
  const t = todayKey(); const d = ensureDay(t);
  const rules = activeRules(t).filter(r => r.kind !== 'wake');
  for (const r of rules) if (!(r.id in checkinDraft.answers)) { toast('Answer every rule. Yes or no — no blanks.'); return; }
  document.querySelectorAll('[data-gnum]').forEach(inp => { checkinDraft.goals[inp.dataset.gnum] = parseFloat(inp.value) || 0; });
  const prevStreak = streakEndingAt(addDays(t, -1));
  d.answers = { ...checkinDraft.answers };
  d.goalDone = { ...(d.goalDone || {}), ...checkinDraft.goals };
  d.checkedIn = true;
  // breaks?
  const broken = rules.filter(r => d.answers[r.id] === false);
  for (const r of broken) if (!S.mistakes.some(m => m.date === t && m.ruleId === r.id)) {
    S.mistakes.unshift({ date: t, ruleId: r.id, ruleName: ruleName(r), lost: prevStreak, note: '' });
  }
  // escalated goal answered 0 today -> no more input possible, treat as break now
  for (const gid of (d.escalated || [])) {
    const g = S.goals.find(x => x.id === gid);
    if (g && ((d.goalDone || {})[gid] || 0) <= 0 && !S.mistakes.some(m => m.date === t && m.ruleId === 'goal-' + gid)) {
      S.mistakes.unshift({ date: t, ruleId: 'goal-' + gid, ruleName: 'Goal: ' + g.name, lost: prevStreak, note: '' });
      broken.push({ id: 'goal-' + gid });
    }
  }
  save();
  $('#checkin-veil').classList.remove('open');
  if (broken.length) {
    showShame({ lost: prevStreak, rule: S.mistakes[0].ruleName, date: t });
  } else {
    settle();  // may trigger milestone
    if (pending.celebration) { showCelebration(pending.celebration); pending.celebration = null; }
    else toast('Clean. ' + (currentStreak()) + ' and counting.');
  }
  bus.refresh();
}

export function wireToday() {
  $('#checkin-btn').onclick = openCheckin;
  $('#checkin-submit').onclick = submitCheckin;
  $('#checkin-cancel').onclick = () => $('#checkin-veil').classList.remove('open');
}
