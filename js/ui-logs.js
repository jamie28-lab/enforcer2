// ENFORCER 2.0 — LOGS view: mistake log + playbook
'use strict';
import { S, save, todayKey, parseKey, fmtDate } from './state.js';
import { weaknesses, identityValid, shouldShowGoodhartAudit, markGoodhartDone, staleHabits } from './engine.js';
import { $, esc, toast, bus, ICONS } from './ui-shared.js';
import { findMistakeCard } from './srs.js';
import { syncNtfy, syncCfPush } from './reminders.js';
import { renderGymMealLogs } from './ui-body.js';
import { renderBreakGlassLogs } from './ui-breakglass.js';

const MOTIVES = [['stress', 'Stress'], ['boredom', 'Boredom'], ['social', 'Social'], ['tired', 'Tired'], ['craving', 'Craving'], ['other', 'Other']];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const NUM_WORDS = { 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five' };
function weaknessLabel(w) {
  if (w.kind === 'motive') return w.key.charAt(0).toUpperCase() + w.key.slice(1);
  if (w.kind === 'weekday') return WEEKDAY_NAMES[w.key];
  return w.evidence[0].ruleName;
}
function weaknessSentence(w) {
  const otherName = identityValid() ? S.identity.other.name : 'The pattern';
  const cw = NUM_WORDS[w.count] || String(w.count);
  if (w.kind === 'weekday') return `${cw} of your breaks happened on ${WEEKDAY_NAMES[w.key]}s. ${esc(otherName)} knows your calendar.`;
  if (w.kind === 'motive') return `${weaknessLabel(w)} has taken ${w.count} days from you.`;
  return `${esc(weaknessLabel(w))} is your weakest front — ${w.count} falls.`;
}
function weaknessRemId(w) {
  if (w.kind === 'weekday') return 'rem-wk-' + w.key;
  if (w.kind === 'motive') return 'rem-mot-' + w.key;
  return 'rem-rule-' + w.key;
}
function weaknessRemText(w) {
  if (w.kind === 'weekday') return `${WEEKDAY_NAMES[w.key]} night. ${(NUM_WORDS[w.count] || w.count)} breaks happened on nights like this. Not tonight.`;
  if (w.kind === 'motive') return `${weaknessLabel(w)} preceded ${w.count} of your breaks. Watch for it today.`;
  return `${w.evidence[0].ruleName} is your weakest front — ${w.count} falls already. Not today.`;
}

export function renderLogs() {
  renderGymMealLogs();
  renderBreakGlassLogs();
  const wc = $('#weakness-card'), wl = $('#weakness-list');
  const wks = weaknesses();
  if (!wks.length) { wc.style.display = 'none'; }
  else {
    wc.style.display = '';
    wl.innerHTML = wks.map(w => {
      const id = weaknessRemId(w);
      const armed = S.reminders.some(r => r.id === id);
      return `
      <div class="weakness-row">
        <div class="weakness-top"><span class="weakness-label">${esc(weaknessLabel(w))} — ${w.count} breaks</span></div>
        <div class="weakness-sentence">${weaknessSentence(w)}</div>
        <div class="weakness-arm-row">
          <span class="rule-name" style="font-size:13px">Arm reminder</span>
          <label class="row" style="justify-content:flex-start; gap:8px; cursor:pointer">
            <input type="checkbox" class="weakness-arm-toggle" data-kind="${w.kind}" data-key="${w.key}" ${armed ? 'checked' : ''}>
          </label>
        </div>
      </div>`;
    }).join('');
    wl.querySelectorAll('.weakness-arm-toggle').forEach(cb => cb.onchange = () => {
      const w = wks.find(x => x.kind === cb.dataset.kind && String(x.key) === cb.dataset.key);
      if (!w) return;
      const id = weaknessRemId(w);
      if (cb.checked) {
        if (!S.reminders.some(r => r.id === id)) {
          const rem = w.kind === 'weekday'
            ? { id, text: weaknessRemText(w), time: '18:00', repeat: 'weekly', day: w.key }
            : { id, text: weaknessRemText(w), time: '18:00', repeat: 'daily' };
          S.reminders.push(rem);
        }
      } else {
        S.reminders = S.reminders.filter(r => r.id !== id);
      }
      save(); syncNtfy(); syncCfPush(); bus.refresh(false);
      toast(cb.checked ? 'Reminder armed.' : 'Reminder disarmed.');
    });
  }

  const ml = $('#mistake-list'); ml.innerHTML = '';
  if (!S.mistakes.length) ml.innerHTML = '<div class="empty-note">No breaks yet. Keep it that way.</div>';
  S.mistakes.forEach((m, i) => {
    const card = findMistakeCard(m.date, m.ruleId);
    ml.insertAdjacentHTML('beforeend', `
      <div class="log-entry">
        <div class="log-head"><span class="log-rule">${esc(m.ruleName)}</span><span class="log-date">${fmtDate(m.date)}</span></div>
        <div class="log-lost">Cut a ${m.lost}-day streak</div>
        <div class="motive-row" data-mmi="${i}">${MOTIVES.map(([k, l]) => `<button type="button" class="motive-chip ${m.motive === k ? 'on' : ''}" data-m="${k}">${l}</button>`).join('')}</div>
        ${m.note ? `<div class="log-note-txt">${esc(m.note)}</div>` : `<input class="log-note-in" data-mi="${i}" placeholder="What happened? One honest line." maxlength="120">`}
        ${card ? `<button class="mistake-card-link" data-cardid="${card.id}">${card.suspended ? 'Card (suspended)' : 'Card'} ✎</button>` : ''}
      </div>`);
  });
  ml.querySelectorAll('[data-cardid]').forEach(b => b.onclick = () => openCardEdit(b.dataset.cardid));
  ml.querySelectorAll('.log-note-in').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && inp.value.trim()) { S.mistakes[+inp.dataset.mi].note = inp.value.trim(); save(); renderLogs(); } });
    inp.addEventListener('blur', () => { if (inp.value.trim()) { S.mistakes[+inp.dataset.mi].note = inp.value.trim(); save(); renderLogs(); } });
  });
  ml.querySelectorAll('.motive-row').forEach(row => {
    row.querySelectorAll('[data-m]').forEach(b => b.onclick = () => {
      const m = S.mistakes[+row.dataset.mmi];
      m.motive = m.motive === b.dataset.m ? null : b.dataset.m;
      save(); renderLogs();
    });
  });

  renderPlaybookPrompts();
  const pl = $('#playbook-list'); pl.innerHTML = '';
  const entries = S.playbook.filter(p => playbookFilter === 'all' || (p.kind || 'note') === playbookFilter);
  if (!entries.length) pl.innerHTML = playbookFilter === 'all'
    ? '<div class="empty-note">When something works, write it down. Future-you forgets.</div>'
    : '<div class="empty-note">Nothing filed under this yet.</div>';
  entries.forEach(p => {
    const meta = PB_KIND_META[p.kind || 'note'] || PB_KIND_META.note;
    pl.insertAdjacentHTML('beforeend', `
      <div class="log-entry">
        <div class="log-head"><span class="log-rule ${meta.cls}">${meta.ico}${meta.label}</span><span class="log-date">${fmtDate(p.date)}</span></div>
        <div class="log-note-txt">${esc(p.text)}</div>
      </div>`);
  });
}

/* ---------- P4: playbook kinds, filter chips, auto-prompt rows (Goodhart audit + staleness) ---------- */
const FRICTION_ICO = '<span class="pb-kind-ico"><svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3v18m0-18L4 6m3-3 3 3M17 21V3m0 18-3-3m3 3 3-3"/></svg></span>';
const PB_KIND_META = {
  note: { label: 'Works', cls: 'win', ico: '' },
  friction: { label: 'Friction lever', cls: 'friction', ico: FRICTION_ICO },
  decisive: { label: 'Decisive moment', cls: 'decisive', ico: `<span class="pb-kind-ico">${ICONS.fork}</span>` },
  audit: { label: 'Audit', cls: 'audit', ico: '' },
};
let playbookFilter = 'all';
let playbookDraftKind = 'note';
let pendingStaleNoteId = null;   // staleness prompt dismissed only when its note is actually saved
function setDraftKind(k) {
  playbookDraftKind = k;
  document.querySelectorAll('#playbook-kind-seg button').forEach(b => b.classList.toggle('on', b.dataset.k === k));
}
function renderPlaybookPrompts() {
  const box = $('#playbook-prompts');
  const mk = todayKey().slice(0, 7);
  let html = '';
  if (shouldShowGoodhartAudit()) {
    html += `
      <div class="audit-row">
        <div class="audit-line">Monthly audit: is the streak number still telling the truth, or are you protecting it?</div>
        <div class="row" style="justify-content:flex-start; gap:4px; margin-top:2px">
          <button type="button" class="mini-link" id="goodhart-write">Write reflection</button>
          <button type="button" class="mini-link danger" id="goodhart-skip">Skip</button>
        </div>
      </div>`;
  }
  for (const h of staleHabits()) {
    if (S.staleDismissed[h.id + mk]) continue;
    html += `
      <div class="audit-row">
        <div class="audit-line">Routine going stale? ${esc(h.label)} has been on autopilot for 3 weeks — vary it or archive it.</div>
        <div class="row" style="justify-content:flex-start; gap:4px; margin-top:2px">
          <button type="button" class="mini-link" data-stalenote="${h.id}">Note it</button>
          <button type="button" class="mini-link danger" data-staledismiss="${h.id}">Dismiss</button>
        </div>
      </div>`;
  }
  box.innerHTML = html;
  const gw = $('#goodhart-write');
  if (gw) gw.onclick = () => {
    const month = parseKey(todayKey()).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    $('#playbook-in').value = `Audit ${month}: `;
    setDraftKind('audit');
    $('#playbook-in').focus();
  };
  const gs = $('#goodhart-skip');
  if (gs) gs.onclick = () => { markGoodhartDone(); renderLogs(); toast('Audit skipped this month.'); };
  box.querySelectorAll('[data-stalenote]').forEach(b => b.onclick = () => {
    const h = S.habits.find(x => x.id === b.dataset.stalenote);
    pendingStaleNoteId = b.dataset.stalenote;   // dismissed only once the note is actually saved
    $('#playbook-in').value = `${h ? h.name : 'Habit'} is on autopilot — vary it: `;
    setDraftKind('note');
    $('#playbook-in').focus();
  });
  box.querySelectorAll('[data-staledismiss]').forEach(b => b.onclick = () => {
    S.staleDismissed[b.dataset.staledismiss + mk] = true;
    save(); renderLogs();
  });
}

function openCardEdit(cardId) {
  const card = S.decks.mistakes.cards.find(c => c.id === cardId);
  if (!card) return;
  $('#card-edit-front').value = card.front;
  $('#card-edit-back').value = card.back;
  $('#card-edit-suspend').checked = card.suspended;
  $('#card-edit-save').dataset.cardid = cardId;
  $('#card-edit-delete').dataset.cardid = cardId;
  $('#card-edit-veil').classList.add('open');
}

export function wireLogs() {
  $('#playbook-add').onclick = () => {
    const v = $('#playbook-in').value.trim(); if (!v) return;
    S.playbook.unshift({ date: todayKey(), text: v, kind: playbookDraftKind });
    if (playbookDraftKind === 'audit') markGoodhartDone();   // reflection written -> audit month done
    if (pendingStaleNoteId) { S.staleDismissed[pendingStaleNoteId + todayKey().slice(0, 7)] = true; pendingStaleNoteId = null; }
    $('#playbook-in').value = '';
    setDraftKind('note');
    save(); renderLogs();
    toast('Into the playbook.');
  };
  document.querySelectorAll('#playbook-kind-seg button').forEach(b => b.onclick = () => setDraftKind(b.dataset.k));
  document.querySelectorAll('#playbook-filter-row .filter-chip').forEach(b => b.onclick = () => {
    playbookFilter = b.dataset.pf;
    document.querySelectorAll('#playbook-filter-row .filter-chip').forEach(x => x.classList.toggle('on', x === b));
    renderLogs();
  });
  $('#card-edit-save').onclick = () => {
    const card = S.decks.mistakes.cards.find(c => c.id === $('#card-edit-save').dataset.cardid);
    if (!card) return;
    card.front = $('#card-edit-front').value.trim() || card.front;
    card.back = $('#card-edit-back').value.trim() || card.back;
    card.suspended = $('#card-edit-suspend').checked;
    save(); $('#card-edit-veil').classList.remove('open'); renderLogs();
    toast('Card saved.');
  };
  $('#card-edit-delete').onclick = () => {
    const id = $('#card-edit-delete').dataset.cardid;
    S.decks.mistakes.cards = S.decks.mistakes.cards.filter(c => c.id !== id);
    save(); $('#card-edit-veil').classList.remove('open'); renderLogs(); bus.refresh(false);
    toast('Card deleted. The mistake log entry stays.');
  };
  $('#card-edit-cancel').onclick = () => $('#card-edit-veil').classList.remove('open');
}
