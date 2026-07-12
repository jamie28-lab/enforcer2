// ENFORCER 2.0 — pure logic: streaks, clean-day versioning, ratchet, holidays, goals, power days, milestones
'use strict';
import {
  S, save, todayKey, addDays, parseKey, dkey, dayDiff, hm, now, MILESTONES, STAGES, DEFAULT_PHRASES,
} from './state.js';
import { draftMistakeCard } from './srs.js';

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

/* ---------- P3: recovery & comeback ---------- */
/* % of fail days immediately followed by a clean day (holidays skipped when finding "next day").
   null if there are no breaks yet. Only counts breaks whose next-day outcome is already settled. */
export function recoveryScore() {
  const t = todayKey();
  let breaks = 0, recovered = 0, cur = S.createdAt;
  while (cur < t) {
    if (dayClean(cur, true) === 'fail') {
      let next = addDays(cur, 1);
      while (next < t && isHoliday(next)) next = addDays(next, 1);
      if (next < t) {
        breaks++;
        if (dayClean(next, true) === 'pass') recovered++;
      }
    }
    cur = addDays(cur, 1);
  }
  return breaks === 0 ? null : Math.round(100 * recovered / breaks);
}
/* the day after a fail day (skipping holidays) — never-miss-twice pressure day. Never true on a holiday itself. */
export function isComebackDay(k) {
  if (isHoliday(k)) return false;
  let prev = addDays(k, -1);
  while (prev >= S.createdAt && isHoliday(prev)) prev = addDays(prev, -1);
  if (prev < S.createdAt) return false;
  return dayClean(prev, true) === 'fail';
}

/* ---------- morning mirror ---------- */
/* Treat a hand-imported malformed identity as "not set up" everywhere. */
export function identityValid() {
  const id = S.identity;
  return !!(id && id.her && id.her.portrait && Array.isArray(id.her.traits) && id.other);
}
export function mirrorHerCount30() {
  const t = todayKey();
  let n = 0;
  for (let i = 0; i < 30; i++) {
    const m = S.mirror[addDays(t, -i)];
    if (m && (m.answer === 'her' || m.answer === 'her-after-confrontation')) n++;
  }
  return n;
}

/* ---------- vote economy (P2) — every vote is DERIVED from S.days/S.mirror/S.mistakes, never stored ---------- */
/* memoize mistakes-by-date across a render pass; rebuilt whenever the array length changes (mistakes only ever grow via unshift) */
let _mistakesIdx = { len: -1, map: null };
function mistakesCountByDate(k) {
  if (_mistakesIdx.len !== S.mistakes.length) {
    const map = new Map();
    for (const m of S.mistakes) map.set(m.date, (map.get(m.date) || 0) + 1);
    _mistakesIdx = { len: S.mistakes.length, map };
  }
  return _mistakesIdx.map.get(k) || 0;
}

export function votesOnDay(k) {
  if (!identityValid() || !S.identity.createdAt || k < S.identity.createdAt) return { her: 0, other: 0 };
  if (isHoliday(k)) return { her: 0, other: 0 };
  const t = todayKey();
  const d = day(k);
  const final = k < t;
  let her = 0, other = 0;

  // HER: +1 per bonus habit done that day
  for (const h of activeHabits(k)) if ((d.habitsDone || {})[h.id]) her++;
  // HER: +1 if the day is clean (same pass/fail/open semantics as everywhere else in engine.js);
  // DOUBLE (+2, P3) when k is a comeback day that ends clean — never-miss-twice pays double.
  if (dayClean(k, final) === 'pass') her += isComebackDay(k) ? 2 : 1;
  // HER: +1 if the morning mirror was answered for her
  const m = S.mirror[k];
  if (m && (m.answer === 'her' || m.answer === 'her-after-confrontation')) her++;
  // HER: +1 per enforced goal actually attested done that day (real d.goalDone record only)
  for (const g of S.goals) if (g.enforce && (d.goalDone || {})[g.id] > 0) her++;
  // HER: +1 if every due Recall card was studied that day — S.srsDone is canonical
  // data written by the study screen, same tier as S.days/S.mirror (not re-derived here).
  if (S.srsDone && S.srsDone[k]) her++;
  // HER: +1 if the day's STEM quiz (S.quizPerDay questions) was completed — S.quizDone is
  // canonical data written by the quiz overlay, same tier as S.srsDone above.
  if (S.quizDone && S.quizDone[k]) her++;

  // OTHER: +1 per rule (or escalated goal) broken that day — one S.mistakes entry each
  other += mistakesCountByDate(k);
  // OTHER: +1 if a finalized past day's mirror is absent or answered 'other' — never today
  if (d.finalized && final) {
    if (!m || m.answer === 'other') other++;
  }

  return { her, other };
}

export function voteBalance(nDays = 30) {
  const t = todayKey();
  let her = 0, other = 0;
  for (let i = 0; i < nDays; i++) {
    const v = votesOnDay(addDays(t, -i));
    her += v.her; other += v.other;
  }
  const total = her + other;
  const pct = total > 0 ? Math.round(100 * her / total) : 0;
  return { her, other, pct };
}

/* per-trait HER vote attribution over the trailing 30 days — a satellite lens, not a partition of voteBalance's total */
export function traitVotes30() {
  const counts = {};
  if (!identityValid()) return counts;
  const t = todayKey();
  for (let i = 0; i < 30; i++) {
    const k = addDays(t, -i);
    if (k < S.identity.createdAt || isHoliday(k)) continue;
    const d = day(k);
    const final = k < t;
    for (const h of activeHabits(k)) {
      if (h.traitId && (d.habitsDone || {})[h.id]) counts[h.traitId] = (counts[h.traitId] || 0) + 1;
    }
    for (const g of S.goals) {
      if (g.traitId && g.enforce && (d.goalDone || {})[g.id] > 0) counts[g.traitId] = (counts[g.traitId] || 0) + 1;
    }
    for (const r of activeRules(k)) {
      if (r.traitId && ruleOutcome(r, k, final) === true) counts[r.traitId] = (counts[r.traitId] || 0) + 1;
    }
  }
  return counts;
}

/* cumulative HER votes for each of the trailing nDays (oldest -> today) */
export function voteTrajectory(nDays = 60) {
  const t = todayKey();
  const out = [];
  let cum = 0;
  for (let i = nDays - 1; i >= 0; i--) {
    cum += votesOnDay(addDays(t, -i)).her;
    out.push(cum);
  }
  return out;
}

/* lifetime count of days a given bonus habit was marked done — the "votes" for its compounding card */
export function lifetimeHabitDone(h) {
  let n = 0, cur = h.addedOn; const t = todayKey();
  while (cur <= t) { if ((day(cur).habitsDone || {})[h.id]) n++; cur = addDays(cur, 1); }
  return n;
}

/* ---------- P7: STEM quiz ---------- */
/* consecutive days with quizDone, ending today or yesterday (today undecided doesn't break the chain) */
export function quizStreak() {
  const t = todayKey();
  const start = S.quizDone[t] ? t : (S.quizDone[addDays(t, -1)] ? addDays(t, -1) : null);
  if (!start) return 0;
  let n = 0, cur = start;
  while (S.quizDone[cur]) { n++; cur = addDays(cur, -1); }
  return n;
}

/* ---------- P3: known weaknesses (derived, like votes — computed, never stored) ---------- */
export function weaknesses() {
  const out = [];
  const byMotive = {}, byWeekday = {}, byRule = {};
  for (const m of S.mistakes) {
    if (m.motive) (byMotive[m.motive] = byMotive[m.motive] || []).push(m);
    const wd = parseKey(m.date).getDay();
    (byWeekday[wd] = byWeekday[wd] || []).push(m);
    (byRule[m.ruleId] = byRule[m.ruleId] || []).push(m);
  }
  for (const [key, list] of Object.entries(byMotive)) if (list.length >= 2) out.push({ kind: 'motive', key, count: list.length, evidence: list });
  for (const [key, list] of Object.entries(byWeekday)) if (list.length >= 2) out.push({ kind: 'weekday', key: Number(key), count: list.length, evidence: list });
  for (const [key, list] of Object.entries(byRule)) if (list.length >= 2) out.push({ kind: 'rule', key, count: list.length, evidence: list });
  out.sort((a, b) => b.count - a.count);
  return out;
}
/* most recent OTHER mistake (excluding the mistake at date+ruleId itself) sharing this rule OR this motive, with a non-empty note.
   S.mistakes is newest-first (unshift-only), so the first match walking forward is the most recent. */
export function priorMatchingNote(date, ruleId, motive) {
  for (const m of S.mistakes) {
    if (m.date === date && m.ruleId === ruleId) continue;
    if (!m.note || !m.note.trim()) continue;
    if (m.ruleId === ruleId || (motive && m.motive === motive)) return m;
  }
  return null;
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
            S.mistakes.unshift({ date: cur, ruleId: r.id, ruleName: ruleName(r), lost, note: '', motive: null });
            draftMistakeCard(S.mistakes[0]);
            pending.shame = pending.shame || { lost, rule: ruleName(r), date: cur, ruleId: r.id };
          }
        }
        for (const g of S.goals) {
          if (goalOutcomeOnDay(g, cur, true) === false && !S.mistakes.some(m => m.date === cur && m.ruleId === 'goal-' + g.id)) {
            const lost = streakEndingAt(addDays(cur, -1));
            S.mistakes.unshift({ date: cur, ruleId: 'goal-' + g.id, ruleName: `Goal: ${g.name}`, lost, note: '', motive: null });
            draftMistakeCard(S.mistakes[0]);
            pending.shame = pending.shame || { lost, rule: `Goal: ${g.name}`, date: cur, ruleId: 'goal-' + g.id };
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
    S.mistakes.unshift({ date: t, ruleId: wr.id, ruleName: ruleName(wr), lost, note: '', motive: null });
    draftMistakeCard(S.mistakes[0]);
    pending.shame = pending.shame || { lost, rule: ruleName(wr), date: t, ruleId: wr.id };
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
