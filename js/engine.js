// ENFORCER 2.0 — pure logic: streaks, clean-day versioning, ratchet, holidays, goals, power days, milestones
'use strict';
import {
  S, save, todayKey, addDays, parseKey, dkey, dayDiff, hm, now, MILESTONES, STAGES, DEFAULT_PHRASES,
} from './state.js';

/* ---------- core queries ---------- */
export const activeRules = k => S.rules.filter(r => r.addedOn <= k && (!r.removedOn || r.removedOn > k));
export const wakeRule = () => S.rules.find(r => r.kind === 'wake');
export function holidayFor(k) {
  return S.holidays.find(h => {
    const end = h.endedOn ? h.endedOn : addDays(h.start, h.days - 1);
    return k >= h.start && k <= end && (!h.endedOn || k < h.endedOn);
  }) || null;
}
export const isHoliday = k => !!holidayFor(k);
export const day = k => S.days[k] || { wake: null, answers: {}, goalDone: {}, checkedIn: false, finalized: false, escalated: [] };
export const ensureDay = k => { if (!S.days[k]) S.days[k] = { wake: null, answers: {}, goalDone: {}, checkedIn: false, finalized: false, escalated: [] }; return S.days[k]; };

/* rule outcome for a (possibly past) day: true pass / false fail / null undecided */
export function ruleOutcome(rule, k, final) {
  const d = day(k);
  if (rule.kind === 'wake') {
    if (d.wake) return d.wake <= rule.wakeTime;
    if (k < todayKey() || final) return false;
    return hm(now()) > rule.wakeTime ? false : null;   // today, window still open
  }
  if (rule.id in d.answers) return d.answers[rule.id];
  return (k < todayKey() || final) ? false : null;
}
/* escalated goal outcome */
export function goalOutcomeOnDay(g, k, final) {
  const d = day(k);
  if (!(d.escalated || []).includes(g.id)) return true;   // wasn't escalated -> can't fail the day
  const done = (d.goalDone || {})[g.id] || 0;
  if (done > 0) return true;
  return (k < todayKey() || final) ? false : null;
}
export function dayClean(k, final = false) {
  if (isHoliday(k)) return 'holiday';
  const rules = activeRules(k);
  if (!rules.length) return 'holiday';
  let undecided = false;
  for (const r of rules) { const o = ruleOutcome(r, k, final); if (o === false) return 'fail'; if (o === null) undecided = true; }
  for (const g of S.goals) { const o = goalOutcomeOnDay(g, k, final); if (o === false) return 'fail'; if (o === null) undecided = true; }
  return undecided ? 'open' : 'pass';
}

/* ---------- streak math ---------- */
export function streakEndingAt(k) {   // consecutive pass days walking back from k (holidays skipped)
  let n = 0, cur = k;
  while (cur >= S.createdAt) {
    const st = dayClean(cur, cur < todayKey());
    if (st === 'holiday') { cur = addDays(cur, -1); continue; }
    if (st === 'pass') { n++; cur = addDays(cur, -1); continue; }
    break;
  }
  return n;
}
export function currentStreak() {
  const t = todayKey();
  const st = dayClean(t);
  if (st === 'pass') return streakEndingAt(t);
  if (st === 'fail') return 0;
  return streakEndingAt(addDays(t, -1));   // open or holiday -> count through yesterday
}
export function perRuleStreak(rule) {
  let n = 0, cur = todayKey();
  while (cur >= S.createdAt) {
    if (isHoliday(cur) || activeRules(cur).every(r => r.id !== rule.id)) { cur = addDays(cur, -1); continue; }
    const o = ruleOutcome(rule, cur, cur < todayKey());
    if (o === true) { n++; cur = addDays(cur, -1); continue; }
    if (o === null && cur === todayKey()) { cur = addDays(cur, -1); continue; }   // today undecided: don't break the chain
    break;
  }
  return n;
}
export function bestStreakEver() {
  let best = 0, run = 0, cur = S.createdAt;
  const t = todayKey();
  while (cur <= t) {
    const st = dayClean(cur, cur < t);
    if (st === 'pass') { run++; best = Math.max(best, run); }
    else if (st === 'fail') run = 0;
    cur = addDays(cur, 1);
  }
  return best;
}
export function lifetimeClean() {
  let n = 0, cur = S.createdAt; const t = todayKey();
  while (cur <= t) { if (dayClean(cur, cur < t) === 'pass') n++; cur = addDays(cur, 1); }
  return n;
}
export function crowns() {
  const weeks = [], months = {}; const t = todayKey();
  // weeks (Mon-Sun) fully clean
  let cur = S.createdAt;
  const monday = k => { const d = parseKey(k); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return dkey(d); };
  const seenW = new Set();
  while (cur <= t) {
    const w = monday(cur);
    if (!seenW.has(w)) {
      seenW.add(w);
      let ok = true, cnt = 0;
      for (let i = 0; i < 7; i++) {
        const k = addDays(w, i);
        if (k > t || k < S.createdAt) { ok = false; break; }
        const st = dayClean(k, k < t);
        if (st === 'fail' || st === 'open') { ok = false; break; }
        if (st === 'pass') cnt++;
      }
      if (ok && cnt >= 4) weeks.push(w);
    }
    cur = addDays(cur, 1);
  }
  // months fully clean
  cur = S.createdAt;
  while (cur <= t) {
    const mk = cur.slice(0, 7);
    if (!(mk in months)) {
      const d0 = parseKey(mk + '-01'); const dEnd = new Date(d0.getFullYear(), d0.getMonth() + 1, 0);
      let ok = true, cnt = 0;
      for (let dd = 1; dd <= dEnd.getDate(); dd++) {
        const k = `${mk}-${String(dd).padStart(2, '0')}`;
        if (k > t || k < S.createdAt) { ok = false; break; }
        const st = dayClean(k, k < t);
        if (st === 'fail' || st === 'open') { ok = false; break; }
        if (st === 'pass') cnt++;
      }
      months[mk] = ok && cnt >= 20;
    }
    cur = addDays(cur, 1);
  }
  return { weeks, months: Object.keys(months).filter(m => months[m]) };
}

/* ---------- bonus habits & power days ---------- */
export const activeHabits = k => S.habits.filter(h => h.addedOn <= k && (!h.removedOn || h.removedOn > k));
export function isPowerDay(k) {
  const hs = activeHabits(k);
  if (!hs.length) return false;
  if (dayClean(k, k < todayKey()) !== 'pass') return false;
  const done = day(k).habitsDone || {};
  return hs.every(h => done[h.id]);
}
export function lifetimePower() {
  let n = 0, cur = S.createdAt; const t = todayKey();
  while (cur <= t) { if (isPowerDay(cur)) n++; cur = addDays(cur, 1); }
  return n;
}

/* ---------- goals ---------- */
export const weekStart = k => { const d = parseKey(k); const off = (d.getDay() + 6) % 7; d.setDate(d.getDate() - off); return dkey(d); };
export function goalWeekProgress(g) {
  const t = todayKey(), ws = weekStart(t);
  let done = 0;
  for (let i = 0; i < 7; i++) {
    const k = addDays(ws, i); if (k > t) break;
    const v = (day(k).goalDone || {})[g.id] || 0;
    done += g.type === 'freq' ? (v > 0 ? 1 : 0) : v;
  }
  return done;
}
export function goalStatus(g) {
  const t = todayKey();
  if (g.type === 'mile') {
    const left = dayDiff(t, g.date);
    return { done: g.completed ? 1 : 0, target: 1, left, escalate: false,
      label: g.completed ? 'Done' : (left >= 0 ? `${left} d left` : 'Overdue') };
  }
  const done = goalWeekProgress(g);
  const remaining = Math.max(0, g.target - done);
  const daysLeft = 7 - ((parseKey(t).getDay() + 6) % 7);   // incl. today
  const escalate = g.enforce && remaining > 0 && (g.type === 'freq' ? remaining >= daysLeft : daysLeft === 1);
  return { done, target: g.target, remaining, daysLeft, escalate,
    label: g.type === 'freq' ? `${done}/${g.target} this week` : `${done}/${g.target} ${g.unit || ''} this week` };
}
export function applyEscalations() {
  const t = todayKey(); if (isHoliday(t)) return;
  const d = ensureDay(t); if (d.checkedIn) return;   // day already locked — escalation waits for tomorrow
  d.escalated = d.escalated || [];
  for (const g of S.goals) {
    const st = goalStatus(g);
    if (st.escalate && !d.escalated.includes(g.id)) d.escalated.push(g.id);
  }
}

/* ---------- phrases ---------- */
export function pick(pool, vars) {
  const arr = (S.phrases[pool] && S.phrases[pool].length ? S.phrases[pool] : DEFAULT_PHRASES[pool]);
  let s = arr[Math.floor(Math.random() * arr.length)];
  for (const [k, v] of Object.entries(vars || {})) s = s.replaceAll(`{${k}}`, v);
  return s;
}
export function ruleName(r) { return r.kind === 'wake' ? r.name.replace('{time}', r.wakeTime) : r.name; }
export function stageFor(n) { let s = STAGES[0]; for (const st of STAGES) if (n >= st.min) s = st; return s; }

/* ---------- finalization: settle past days, detect breaks ---------- */
export const pending = { shame: null, celebration: null };

export function settle() {
  const t = todayKey();
  // finalize all past days
  let cur = S.createdAt;
  while (cur < t) {
    const d = ensureDay(cur);
    if (!d.finalized) {
      if (!isHoliday(cur)) {
        for (const r of activeRules(cur)) {
          if (ruleOutcome(r, cur, true) === false && !S.mistakes.some(m => m.date === cur && m.ruleId === r.id)) {
            const lost = streakEndingAt(addDays(cur, -1));
            S.mistakes.unshift({ date: cur, ruleId: r.id, ruleName: ruleName(r), lost, note: '' });
            pending.shame = pending.shame || { lost, rule: ruleName(r), date: cur };
          }
        }
        for (const g of S.goals) {
          if (goalOutcomeOnDay(g, cur, true) === false && !S.mistakes.some(m => m.date === cur && m.ruleId === 'goal-' + g.id)) {
            const lost = streakEndingAt(addDays(cur, -1));
            S.mistakes.unshift({ date: cur, ruleId: 'goal-' + g.id, ruleName: `Goal: ${g.name}`, lost, note: '' });
            pending.shame = pending.shame || { lost, rule: `Goal: ${g.name}`, date: cur };
          }
        }
      }
      d.finalized = true;
    }
    cur = addDays(cur, 1);
  }
  // today: wake window closed?
  const wr = wakeRule();
  const td = ensureDay(t);
  if (!isHoliday(t) && activeRules(t).some(r => r.kind === 'wake') && !td.wake && hm(now()) > wr.wakeTime && !S.mistakes.some(m => m.date === t && m.ruleId === wr.id)) {
    const lost = streakEndingAt(addDays(t, -1));
    S.mistakes.unshift({ date: t, ruleId: wr.id, ruleName: ruleName(wr), lost, note: '' });
    pending.shame = pending.shame || { lost, rule: ruleName(wr), date: t };
  }
  // execute pending rule removals past their cooldown
  for (const r of S.rules) {
    if (r.removalPendingUntil && Date.now() >= r.removalPendingUntil) { r.removedOn = todayKey(); r.removalPendingUntil = null; }
  }
  // milestone check
  const streak = currentStreak();
  for (const m of MILESTONES) {
    if (streak >= m.n && !S.badges.some(b => b.n === m.n)) {
      S.badges.push({ n: m.n, title: m.title, date: t });
      pending.celebration = { n: m.n, title: m.title };
    }
  }
  save();
}
