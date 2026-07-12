// ENFORCER 2.0 — state: shape, defaults, save/load, migration, time helpers, debug hook
'use strict';

export const LS_KEY = 'enforcer2-v1';
export const V1_KEY = 'enforcer-v1';
export const CF_WORKER_URL = 'https://enforcer-push.enforcer-reetta.workers.dev';
export const VAPID_PUBLIC_KEY = 'BDThC71taSDXaWI33nF7L8hnlWDMryqRuhK-Qi4L-3dRZ8vcmFLfMeeCuC5HHMxo4O6erj97ERd0bZAIDp63u28';

export const GROUND_RULES = [
  { id: 'wake',    name: 'Wake up by {time}', kind: 'wake',    ground: true, wakeTime: '09:00' },
  { id: 'alcohol', name: 'Zero alcohol',      kind: 'abstain', ground: true },
  { id: 'junk',    name: 'Zero junk food',    kind: 'abstain', ground: true },
];
export const MILESTONES = [
  { n: 1,   title: 'First Spark' },      { n: 3,   title: 'Momentum' },
  { n: 7,   title: 'Week One Warrior' }, { n: 10,  title: 'Double Digits' },
  { n: 14,  title: 'Fortnight Fighter' },{ n: 21,  title: 'Habit Forged' },
  { n: 30,  title: 'Iron Month' },       { n: 50,  title: 'Half Hundred' },
  { n: 75,  title: 'Diamond Grind' },    { n: 100, title: 'Centurion' },
  { n: 150, title: 'Unbreakable' },      { n: 200, title: 'Double Centurion' },
  { n: 365, title: 'Year of Steel' },
];
export const STAGES = [
  { min: 0,   name: 'Unlit',   cls: 'unlit'  },
  { min: 1,   name: 'Ember',   cls: ''       },
  { min: 7,   name: 'Flame',   cls: ''       },
  { min: 21,  name: 'Blaze',   cls: ''       },
  { min: 50,  name: 'Inferno', cls: ''       },
  { min: 100, name: 'Aurora',  cls: 'aurora' },
];
export const DEFAULT_PHRASES = {
  morning: [
    'Day {n}. You know exactly what to do.',
    '{n} days didn\'t build themselves. Keep the chain.',
    'Nobody is coming to protect the streak. That\'s your job.',
    'Discipline is remembering what you want. {n} days say you want it.',
    'One boring, perfect day. That\'s all today asks.',
  ],
  milestone: [
    '{n} days. Genuinely earned — nobody gifted you this.',
    'This is what follow-through looks like. {n} days of it.',
    'Most people quit before this. You didn\'t.',
  ],
  shame: [
    '{lost} days. Gone in one moment. Was it worth it?',
    'You built {lost} days and traded them away tonight.',
    'The streak is dead. You killed it. Own that — then move.',
  ],
  comeback: [
    'Day {n}. The record ({record}) is watching you.',
    'Anyone can start. You\'re restarting — that takes more.',
    'The comeback only counts if today is clean.',
  ],
};
export const DEFAULT_REMINDERS = [
  { id: 'rem-wake',     time: '08:30', text: 'Wake-up not logged yet. Tap I\'M UP before 9:00.', repeat: 'daily' },
  { id: 'rem-checkin',  time: '21:30', text: 'Evening check-in. Protect the streak.', repeat: 'daily' },
  { id: 'rem-lastcall', time: '23:00', text: 'Last call — unanswered check-in fails at midnight.', repeat: 'daily' },
];

/* ---------- time (with debug override) ---------- */
let NOW_OVERRIDE = null;
export const now = () => NOW_OVERRIDE ? new Date(NOW_OVERRIDE.getTime()) : new Date();
export const dkey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayKey = () => dkey(now());
export const parseKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dkey(d); };
export const dayDiff = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
export const hm = d => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
export const fmtDate = k => parseKey(k).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/* ---------- state ---------- */
export let S = null;

export function freshState() {
  // installing after the wake deadline: wake rule starts tomorrow, no instant fail
  const wakeStart = hm(now()) > '09:00' ? addDays(todayKey(), 1) : todayKey();
  return {
    createdAt: todayKey(),
    rules: GROUND_RULES.map(r => ({ ...r, addedOn: r.kind === 'wake' ? wakeStart : todayKey(), removedOn: null, removalPendingUntil: null })),
    goals: [],
    habits: [],        // { id, name, addedOn, removedOn } — bonus extras, never punitive
    days: {},          // 'YYYY-MM-DD' -> { wake:'HH:MM'|null, answers:{ruleId:bool}, goalDone:{goalId:num}, habitsDone:{habitId:bool}, checkedIn:bool, finalized:bool, escalated:[goalId] }
    holidays: [],      // { start:'YYYY-MM-DD', days:n, endedOn:null }
    mistakes: [],      // { date, ruleId, ruleName, lost, note }
    playbook: [],      // { date, text }
    badges: [],        // { n, title, date }
    phrases: JSON.parse(JSON.stringify(DEFAULT_PHRASES)),
    reminders: JSON.parse(JSON.stringify(DEFAULT_REMINDERS)),
    lastReminderFired: {},
    ntfyEnabled: false,
    ntfyTopic: null,
    ntfyScheduled: {},   // `${reminderId}|${occurrenceISO}` -> true, once successfully pushed
    cfPushEnabled: false,
    migratedFromV1: false,
    // ---- extension seams (later phases; no logic in Phase 0) ----
    identity: null,
    votes: [],
    decks: {},
    gym: [],
    meals: [],
    mirror: {},
  };
}

/* Returns true when this boot imported data from Enforcer 1.0 (one-time toast). */
export function load() {
  let importedNow = false;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      S = JSON.parse(raw);
    } else {
      const v1raw = localStorage.getItem(V1_KEY);
      if (v1raw) { S = migrateFromV1(JSON.parse(v1raw)); importedNow = true; }
      else S = freshState();
    }
  } catch { S = freshState(); }
  normalize();
  save();
  return importedNow;
}

/* v1 -> 2.0: same field names; deep-copy everything, fill gaps with defaults, add seams. */
function migrateFromV1(v1) {
  const s = freshState();
  const copy = JSON.parse(JSON.stringify(v1));
  for (const k of Object.keys(copy)) s[k] = copy[k];
  s.migratedFromV1 = true;
  // Push subscriptions are per-SW-scope; v1's doesn't exist here. Force off so the
  // flag can't suppress in-app notify() with no worker push behind it — she re-enables in Settings.
  s.cfPushEnabled = false;
  s.cfPushNeedsReenable = true;
  return s;
}

function normalize() {
  S.habits = S.habits || [];
  // migrate reminders: old shape {time,text} -> {id,text,time,repeat:'daily'}
  S.reminders = (S.reminders || []).map((r, i) => r.id ? r : { id: 'rem-mig-' + Date.now() + '-' + i, text: r.text, time: r.time, repeat: 'daily' });
  S.lastReminderFired = S.lastReminderFired || {};
  S.ntfyEnabled = S.ntfyEnabled || false;
  S.ntfyTopic = S.ntfyTopic || null;
  S.ntfyScheduled = S.ntfyScheduled || {};
  S.cfPushEnabled = S.cfPushEnabled || false;
  S.cfPushNeedsReenable = S.cfPushNeedsReenable || false;
  S.migratedFromV1 = S.migratedFromV1 || false;
  if (!('identity' in S)) S.identity = null;
  S.votes = S.votes || [];
  S.decks = S.decks || {};
  S.gym = S.gym || [];
  S.meals = S.meals || [];
  S.mirror = S.mirror || {};
  S.p1Migrated = S.p1Migrated || false;
  if (!S.p1Migrated) {
    if (!S.reminders.some(r => r.id === 'rem-mirror')) {
      S.reminders.push({ id: 'rem-mirror', time: '08:35', text: 'Mirror. Who are you today?', repeat: 'daily' });
    }
    S.p1Migrated = true;
  }
  // prune stale lastReminderFired keys older than today
  const t0 = todayKey();
  for (const k of Object.keys(S.lastReminderFired)) { if (k.split('@')[0] < t0) delete S.lastReminderFired[k]; }
}

export function save() { localStorage.setItem(LS_KEY, JSON.stringify(S)); }

/* ---------- debug hook ---------- */
let refreshHook = () => {};
export function setRefreshHook(fn) { refreshHook = fn; }
export function installDebugHook() {
  window.ENF = {
    get state() { return S; },
    save,
    setNow(iso) { NOW_OVERRIDE = iso ? new Date(iso) : null; refreshHook(); },
    reset() { localStorage.removeItem(LS_KEY); location.reload(); },
    hardReset() { localStorage.removeItem(LS_KEY); localStorage.removeItem(V1_KEY); location.reload(); },
  };
}
