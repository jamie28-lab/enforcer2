// ENFORCER 2.0 — P7: STEM quiz bank loading + deterministic daily selection
'use strict';
import { S, save, todayKey } from './state.js';
import { createCard } from './srs.js';

const BANK_URL = './data/stem-bank.json';
let bankCache = null;    // lazy-loaded once per session, cached in this module var
let loadPromise = null;  // in-flight guard: rapid double-open must not double-fetch or double-init

/* Loads the question bank on first use only (lazy). Returns the array, or null if the
   fetch failed and nothing is cached — each explicit open retries (a transient offline
   blip must not require a full app reload; renders that merely peek stay cheap via bankCache). */
export function loadBank() {
  if (bankCache) return Promise.resolve(bankCache);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    try {
      const resp = await fetch(BANK_URL);
      if (!resp.ok) throw new Error('bad status ' + resp.status);
      const data = await resp.json();
      if (!Array.isArray(data) || !data.length) throw new Error('bad shape');
      bankCache = data;
      return bankCache;
    } catch (e) {
      console.warn('STEM bank load failed', e);
      return null;
    } finally {
      loadPromise = null;
    }
  })();
  return loadPromise;
}

/* ---------- deterministic shuffle ----------
   fnv1a-style hash of `seed:id` used as a sort key. Same seed -> same order, always —
   this is what makes daily selection reproducible across reloads without storing
   the whole shuffled order (only the seed + the served-set are persisted). */
function fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function shuffledIds(bank, seed) {
  return bank.map(q => q.id)
    .map(id => ({ id, k: fnv1a(seed + ':' + id) }))
    .sort((a, b) => a.k - b.k || a.id.localeCompare(b.id))
    .map(x => x.id);
}
/* quizSeed is rolled once via crypto.getRandomValues at first-ever quiz use, then stored —
   everything downstream of that single random draw is deterministic. */
function ensureSeed() {
  if (S.quizSeed == null) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    S.quizSeed = arr[0];
    save();
  }
  return S.quizSeed;
}

/* First N ids (in seeded-shuffle order) not yet in S.quizServed. When fewer than N
   remain unserved, the bank is "exhausted": reset S.quizServed and reshuffle with
   quizSeed+1 (stored back) so the next cycle's order differs from the last. Selected
   ids are NOT marked served here — call markServed for each once the day's quiz is
   actually committed to S.quizToday (keeps this function a pure query). */
export function selectDailyQuestions(bank, n) {
  const seed = ensureSeed();
  let order = shuffledIds(bank, String(seed));
  let unserved = order.filter(id => !S.quizServed[id]);
  if (unserved.length < n) {
    S.quizServed = {};
    S.quizSeed = seed + 1;
    save();
    order = shuffledIds(bank, String(S.quizSeed));
    unserved = order;
  }
  return unserved.slice(0, n);
}

export function markServed(qid) { S.quizServed[qid] = true; }

/* Wrong answer -> FSRS card in the 'stem' deck. Idempotent per sourceId (the qid) so a
   re-miss of a re-served question (after a bank-exhaustion reset) never double-creates. */
export function draftQuizCard(q) {
  if (S.decks.stem && S.decks.stem.cards.some(c => c.sourceId === q.id)) return null;
  return createCard('stem', q.q, q.a + '\n\n' + q.why, q.id, todayKey());
}

export function logQuizAnswer(qid, right) {
  S.quizLog.push({ date: todayKey(), qid, right });
  if (S.quizLog.length > 1000) S.quizLog.splice(0, S.quizLog.length - 1000);
}
