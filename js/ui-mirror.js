// ENFORCER 2.0 — Morning Mirror overlay + Identity setup sheet
'use strict';
import { S, save, todayKey, hm, now } from './state.js';
import { activeRules, wakeRule, isHoliday, day, ruleName, activeHabits, goalStatus, identityValid, votesOnDay, isComebackDay } from './engine.js';
import { $, esc, bus, ICONS, toast } from './ui-shared.js';
import { logWakeUp, openStudy } from './ui-today.js';
import { dueCards } from './srs.js';

/* ---------- Morning Mirror ---------- */
export function shouldShowMirror() {
  if (!identityValid()) return false;
  if (S.identity.createdAt === todayKey()) return false;   // setup day: first mirror is tomorrow morning
  return !S.mirror[todayKey()];
}

let mirrorStage = 'question';   // 'question' | 'confrontation' | 'affirmation'

export function openMirror() {
  mirrorStage = 'question';
  paintMirror();
  $('#mirror-veil').classList.add('open');
}
function closeMirror() {
  $('#mirror-veil').classList.remove('open');
  $('#mirror-inner').onclick = null;
}
function logMirrorAnswer(answer) {
  S.mirror[todayKey()] = { answer, answeredAt: now().toISOString() };
  save();
}
function wakeStripHtml(t) {
  const wr = wakeRule(); const d = day(t);
  const wakePending = !isHoliday(t) && activeRules(t).some(r => r.kind === 'wake') && !d.wake && hm(now()) <= wr.wakeTime;
  return wakePending ? `<button class="btn mirror-wake-btn" id="mirror-wake-btn">${ICONS.sun} I'M UP</button>` : '';
}

function paintMirror() {
  const t = todayKey();
  const id = S.identity;
  const box = $('#mirror-inner');
  box.onclick = null;

  if (mirrorStage === 'question') {
    const rulesHtml = activeRules(t).map(r => `<div class="mirror-rule">${esc(ruleName(r))}</div>`).join('');
    const goalsHtml = S.goals.map(g => {
      const st = goalStatus(g);
      return `<div class="mirror-goal ${st.escalate ? 'behind' : ''}">${esc(g.name)} — ${esc(st.label)}${st.escalate ? ' · behind pace' : ''}</div>`;
    }).join('');
    const habitsHtml = activeHabits(t).map(h => `<div class="mirror-habit">${esc(h.name)}</div>`).join('');
    const dueN = dueCards(null, t).length;
    const comeback = isComebackDay(t);
    const mistakesDue = dueCards('mistakes', t).length;
    const forceStudy = comeback && mistakesDue > 0 && !S.mirrorStudyDone[t];

    box.innerHTML = `
      ${wakeStripHtml(t)}
      <div class="mirror-date">${parseMirrorDate(t)}</div>
      <div class="mirror-kicker">MORNING MIRROR</div>
      ${comeback ? `<div class="mirror-comeback-line">Yesterday broke. Today decides if it becomes a pattern.</div>` : ''}
      ${rulesHtml ? `<div class="mirror-section"><div class="mirror-section-lbl">Today's rules</div>${rulesHtml}</div>` : ''}
      ${goalsHtml ? `<div class="mirror-section"><div class="mirror-section-lbl">Goals</div>${goalsHtml}</div>` : ''}
      ${habitsHtml ? `<div class="mirror-section"><div class="mirror-section-lbl">Today's small votes</div>${habitsHtml}</div>` : ''}
      ${dueN > 0 ? `<div class="mirror-recall-line">${dueN} card${dueN === 1 ? '' : 's'} waiting. Study is a vote.</div>` : ''}
      <div class="mirror-portrait">${esc(id.her.portrait)}</div>
      <div class="mirror-bottom">
        <div class="mirror-question">Who are you today?</div>
        ${forceStudy ? `<div class="mirror-force-study"><button class="btn" id="mirror-study-btn">Study ${mistakesDue} mistake card${mistakesDue === 1 ? '' : 's'} first</button></div>` : ''}
        <div class="mirror-choices">
          <button class="btn" id="mirror-her-btn" ${forceStudy ? 'disabled' : ''}>${esc(id.her.name)}</button>
          <button class="btn ghost" id="mirror-other-btn" ${forceStudy ? 'disabled' : ''}>${esc(id.other.name)}</button>
        </div>
      </div>`;
    wireMirrorWake();
    if (forceStudy) $('#mirror-study-btn').onclick = e => { e.stopPropagation(); openStudy('mistakes', true); };
    $('#mirror-her-btn').onclick = e => { e.stopPropagation(); logMirrorAnswer('her'); mirrorStage = 'affirmation'; paintMirror(); bus.refresh(false); };
    $('#mirror-other-btn').onclick = () => { mirrorStage = 'confrontation'; paintMirror(); };
  } else if (mirrorStage === 'confrontation') {
    box.innerHTML = `
      ${wakeStripHtml(t)}
      <div class="mirror-kicker">MORNING MIRROR</div>
      <div class="mirror-portrait confront">${esc(id.other.portrait)}</div>
      <div class="mirror-bottom">
        <div class="mirror-confront-line">Do you really want to be the type of person who doesn't do this and who doesn't stay consistent?</div>
        <div class="mirror-choices confront">
          <button class="btn" id="mirror-confront-no">No — I'll do it</button>
          <button class="btn ghost small mirror-flat-btn" id="mirror-confront-yes">Yes, that's me</button>
        </div>
      </div>`;
    wireMirrorWake();
    $('#mirror-confront-no').onclick = e => { e.stopPropagation(); logMirrorAnswer('her-after-confrontation'); mirrorStage = 'affirmation'; paintMirror(); bus.refresh(false); };
    $('#mirror-confront-yes').onclick = () => { logMirrorAnswer('other'); closeMirror(); bus.refresh(false); };
  } else {
    const n = votesOnDay(t).her;
    box.innerHTML = `
      <div class="mirror-affirm-wrap">
        <div class="mirror-portrait">${esc(id.her.portrait)}</div>
        <div class="mirror-affirm-line">Then act like it. See you tonight.</div>
        ${n > 0 ? `<div class="mirror-votes-line">+${n} votes available today</div>` : ''}
      </div>`;
    box.onclick = closeMirror;
    setTimeout(() => { if (mirrorStage === 'affirmation') closeMirror(); }, 2000);
  }
}
function parseMirrorDate(t) {
  const d = now();
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
function wireMirrorWake() {
  const wb = $('#mirror-wake-btn');
  if (wb) wb.onclick = () => { wb.remove(); logWakeUp(); };
}

/* ---------- identity setup sheet ---------- */
let draftTraits = [];
let traitSeq = 0;
export function openIdentitySetup() {
  const id = S.identity;
  $('#identity-sheet-title').textContent = id ? 'Edit your identity' : 'Define who you\'re becoming';
  $('#id-her-name').value = id ? id.her.name : 'HER';
  $('#id-her-portrait').value = id ? id.her.portrait : '';
  $('#id-other-name').value = id ? id.other.name : 'THE OTHER ONE';
  $('#id-other-portrait').value = id ? id.other.portrait : '';
  draftTraits = id ? id.her.traits.map(tr => ({ ...tr })) : [];
  paintTraits();
  $('#identity-veil').classList.add('open');
}
function paintTraits() {
  const box = $('#id-traits-list');
  box.innerHTML = draftTraits.map((tr, i) => `
    <span class="trait-chip">${esc(tr.label)}<button type="button" class="trait-del" data-i="${i}" aria-label="Remove trait">${ICONS.x.replace('viewBox', 'width="11" height="11" viewBox')}</button></span>`).join('');
  box.querySelectorAll('.trait-del').forEach(b => b.onclick = () => { draftTraits.splice(+b.dataset.i, 1); paintTraits(); });
}
function addTrait() {
  const inp = $('#id-trait-input');
  const label = inp.value.trim();
  if (!label) return;
  if (draftTraits.length >= 5) { toast('Five traits max.'); return; }
  draftTraits.push({ id: 't' + Date.now() + '-' + (traitSeq++), label });
  inp.value = '';
  paintTraits();
}
function saveIdentity() {
  const herName = $('#id-her-name').value.trim() || 'HER';
  const herPortrait = $('#id-her-portrait').value.trim();
  const otherName = $('#id-other-name').value.trim() || 'THE OTHER ONE';
  const otherPortrait = $('#id-other-portrait').value.trim();
  if (!herPortrait || !otherPortrait) { toast('Write both portraits.'); return; }
  if (!draftTraits.length) { toast('Add at least one trait.'); return; }
  // trait deletion: clear any rule/goal/habit refs to traits removed from the roster (no orphans)
  const oldIds = S.identity ? S.identity.her.traits.map(tr => tr.id) : [];
  const newIds = new Set(draftTraits.map(tr => tr.id));
  const removedIds = oldIds.filter(id => !newIds.has(id));
  if (removedIds.length) {
    for (const r of S.rules) if (removedIds.includes(r.traitId)) r.traitId = null;
    for (const g of S.goals) if (removedIds.includes(g.traitId)) g.traitId = null;
    for (const h of S.habits) if (removedIds.includes(h.traitId)) h.traitId = null;
  }
  S.identity = {
    her: { name: herName, portrait: herPortrait, traits: draftTraits.map(tr => ({ ...tr })) },
    other: { name: otherName, portrait: otherPortrait },
    createdAt: S.identity ? S.identity.createdAt : todayKey(),
  };
  save();
  $('#identity-veil').classList.remove('open');
  toast('Identity set.');
  bus.refresh();
}
export function wireIdentitySetup() {
  bus.repaintMirror = () => { if ($('#mirror-veil').classList.contains('open')) paintMirror(); };
  $('#identity-invite-btn').onclick = () => openIdentitySetup();
  $('#id-trait-add').onclick = addTrait;
  $('#id-trait-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTrait(); } });
  $('#identity-save').onclick = saveIdentity;
  $('#identity-cancel').onclick = () => $('#identity-veil').classList.remove('open');
}
