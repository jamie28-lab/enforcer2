// ENFORCER 2.0 — srs.js: FSRS v4.5 spaced-repetition scheduler (pure logic, no UI imports)
'use strict';
import { S, todayKey, addDays, dayDiff, fmtDate } from './state.js';

/* ---------- FSRS v4.5 default parameters ----------
   17 weights (w0..w16), published defaults from the open-spaced-repetition
   project (fsrs4anki v4.5 optimizer defaults / ts-fsrs DEFAULT_WEIGHTS).
   Deterministic: the optional fuzz factor is intentionally omitted so
   intervals are 100% reproducible given the same inputs. */
const W = [
  0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616,
  0.1544, 1.0824, 1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466,
];
export const REQUESTED_RETENTION = 0.9;
const MIN_D = 1, MAX_D = 10;

export const GRADES = { AGAIN: 1, HARD: 2, GOOD: 3, EASY: 4 };

const clampD = d => Math.min(MAX_D, Math.max(MIN_D, d));
const round4 = n => Math.round(n * 10000) / 10000;

/* ---------- FSRS core formulas ---------- */
function initStability(g) { return Math.max(0.1, W[g - 1]); }               // w0..w3 by grade
function initDifficulty(g) { return clampD(W[4] - (g - 3) * W[5]); }        // linear D0
function nextDifficulty(d, g) {
  const nd = d - W[6] * (g - 3);
  return clampD(W[7] * initDifficulty(3) + (1 - W[7]) * nd);   // mean-revert toward D0(3)=w4 per FSRS v4.5
}
export function retrievability(elapsedDays, stability) {
  if (stability <= 0) return 0;
  return Math.pow(1 + elapsedDays / (9 * stability), -1);
}
function nextStabilitySuccess(s, d, r, g) {
  const hardPenalty = g === GRADES.HARD ? W[15] : 1;
  const easyBonus = g === GRADES.EASY ? W[16] : 1;
  return s * (1 + Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) *
    (Math.exp((1 - r) * W[10]) - 1) * hardPenalty * easyBonus);
}
function nextStabilityFail(s, d, r) {
  return W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp((1 - r) * W[14]);
}
export function intervalFromStability(s) {
  // R(t,S) = (1 + t/(9S))^-1 = r  =>  t = 9S(1/r - 1); at r=0.9 this reduces to t = S.
  return Math.max(1, Math.round(9 * s * (1 / REQUESTED_RETENTION - 1)));
}

/* ---------- pure "what would happen" — used by rate() and by the study UI's button previews ---------- */
export function computeNext(card, grade, todayK) {
  const out = { state: card.state, due: card.due, stability: card.stability, difficulty: card.difficulty, lapses: card.lapses };
  if (card.state === 'new') {
    out.stability = initStability(grade);
    out.difficulty = initDifficulty(grade);
    if (grade === GRADES.AGAIN || grade === GRADES.HARD) { out.state = 'learning'; out.due = todayK; }
    else if (grade === GRADES.GOOD) { out.state = 'learning'; out.due = addDays(todayK, 1); }
    else { out.state = 'review'; out.due = addDays(todayK, 3); }
  } else if (card.state === 'learning') {
    if (grade === GRADES.AGAIN || grade === GRADES.HARD) {
      out.stability = initStability(grade);
      out.difficulty = initDifficulty(grade);
      out.state = 'learning'; out.due = todayK;
    } else {
      out.stability = initStability(grade);
      out.difficulty = initDifficulty(grade);
      out.state = 'review';
      out.due = addDays(todayK, intervalFromStability(out.stability));
    }
  } else {
    // 'review' — full FSRS
    const elapsed = Math.max(0, dayDiff(card.lastReview || card.due, todayK));
    const r = retrievability(elapsed, card.stability);
    if (grade === GRADES.AGAIN) {
      out.stability = Math.max(0.1, Math.min(nextStabilityFail(card.stability, card.difficulty, r), card.stability));   // lapse can never raise stability
      out.lapses = card.lapses + 1;
    } else {
      out.stability = Math.max(0.1, nextStabilitySuccess(card.stability, card.difficulty, r, grade));
    }
    out.difficulty = nextDifficulty(card.difficulty, grade);
    out.state = 'review';
    out.due = addDays(todayK, intervalFromStability(out.stability));
  }
  return out;
}

/* ---------- mutating rate() — applies computeNext(), logs the review, tracks new-card intro cap ---------- */
export function rate(card, grade, todayK) {
  const wasNew = card.state === 'new';
  const next = computeNext(card, grade, todayK);
  card.state = next.state; card.due = next.due;
  card.stability = round4(next.stability); card.difficulty = round4(next.difficulty);
  card.lapses = next.lapses;
  card.reps = (card.reps || 0) + 1;
  card.lastReview = todayK;
  S.srsLog.push({ date: todayK, cardId: card.id, grade });
  if (S.srsLog.length > 500) S.srsLog.splice(0, S.srsLog.length - 500);
  if (wasNew) { S.srsNewIntro[todayK] = (S.srsNewIntro[todayK] || 0) + 1; }
  return card.due;
}

/* ---------- deck / card CRUD ---------- */
let cardSeq = 0;
function ensureDeck(key) { if (!S.decks[key]) S.decks[key] = { name: key, cards: [] }; return S.decks[key]; }

export function createCard(deckKey, front, back, sourceId, todayK) {
  ensureDeck(deckKey);
  const card = {
    id: 'card' + Date.now() + '-' + (cardSeq++),
    deck: deckKey, front, back, sourceId: sourceId || null,
    createdAt: todayK, state: 'new', due: todayK,
    stability: 0, difficulty: 0, reps: 0, lapses: 0, lastReview: null, suspended: false,
  };
  S.decks[deckKey].cards.push(card);
  return card;
}

/* Auto-draft a card in the Mistakes deck for a freshly-created mistake-log entry.
   sourceId = `${date}:${ruleId}` (mistakes have no id field; this composite is
   already used elsewhere in the codebase as the natural unique key). Idempotent —
   a card is never drafted twice for the same mistake. */
export function draftMistakeCard(mistake) {
  ensureDeck('mistakes');
  const sourceId = mistake.date + ':' + mistake.ruleId;
  if (S.decks.mistakes.cards.some(c => c.sourceId === sourceId)) return null;
  const front = `${fmtDate(mistake.date)}, ${mistake.ruleName} broke. What happened — and what does it cost?`;
  const note = mistake.note && mistake.note.trim() ? mistake.note.trim() : 'No note. That silence is an answer too.';
  const back = `${note}\nStreak lost: ${mistake.lost} day${mistake.lost === 1 ? '' : 's'}.`;
  return createCard('mistakes', front, back, sourceId, mistake.date);
}

export function findMistakeCard(date, ruleId) {
  const sourceId = date + ':' + ruleId;
  return (S.decks.mistakes ? S.decks.mistakes.cards : []).find(c => c.sourceId === sourceId) || null;
}

/* ---------- queries ---------- */
function pruneNewIntro(todayK) {
  for (const k of Object.keys(S.srsNewIntro)) if (k !== todayK) delete S.srsNewIntro[k];
}
export function allCards(deckKey) {
  if (deckKey) return (S.decks[deckKey] || { cards: [] }).cards;
  return Object.values(S.decks).flatMap(d => d.cards);
}
export function dueCards(deckKey, todayK) {
  todayK = todayK || todayKey();
  pruneNewIntro(todayK);
  const pool = allCards(deckKey).filter(c => !c.suspended && c.due <= todayK);
  const introducedToday = S.srsNewIntro[todayK] || 0;
  const capRemaining = Math.max(0, (S.srsSettings.newPerDay ?? 5) - introducedToday);
  const rest = pool.filter(c => c.state !== 'new');
  const newOnes = pool.filter(c => c.state === 'new').sort((a, b) => a.createdAt.localeCompare(b.createdAt)).slice(0, capRemaining);
  return [...rest, ...newOnes];
}
export function forecast(days, todayK) {
  todayK = todayK || todayKey();
  const cards = allCards().filter(c => !c.suspended);
  const out = [];
  for (let i = 0; i < days; i++) {
    const k = addDays(todayK, i);
    // today's bucket includes overdue so the bar agrees with dueCards()
    out.push(cards.filter(c => i === 0 ? c.due <= k : c.due === k).length);
  }
  return out;
}
export function retention30(todayK) {
  todayK = todayK || todayKey();
  const cutoff = addDays(todayK, -29);
  const recent = S.srsLog.filter(l => l.date >= cutoff && l.date <= todayK);
  if (!recent.length) return null;
  const good = recent.filter(l => l.grade >= GRADES.GOOD).length;
  return Math.round(100 * good / recent.length);
}
export function deckStats(deckKey) {
  const cards = allCards(deckKey);
  const stats = { new: 0, learning: 0, review: 0, suspended: 0 };
  for (const c of cards) {
    if (c.suspended) stats.suspended++;
    else if (c.state === 'new') stats.new++;
    else if (c.state === 'learning') stats.learning++;
    else stats.review++;
  }
  return stats;
}

/* ---------- state normalize / migration (called once from app.js after load()) ---------- */
export function normalizeSrs() {
  if (!S.decks || !S.decks.mistakes || !S.decks.stem) {
    const old = S.decks || {};
    S.decks = {
      mistakes: old.mistakes && old.mistakes.cards ? old.mistakes : { name: 'Mistakes', cards: [] },
      stem: old.stem && old.stem.cards ? old.stem : { name: 'STEM Gaps', cards: [] },
    };
  }
  S.srsNewIntro = S.srsNewIntro || {};
  S.srsDone = S.srsDone || {};
  S.srsLog = S.srsLog || [];
  S.srsSettings = S.srsSettings || { newPerDay: 5 };
  pruneNewIntro(todayKey());
}
