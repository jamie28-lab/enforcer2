// ENFORCER 2.0 — LOGS view: mistake log + playbook
'use strict';
import { S, save, todayKey, fmtDate } from './state.js';
import { weaknesses, identityValid } from './engine.js';
import { $, esc, toast, bus } from './ui-shared.js';
import { findMistakeCard } from './srs.js';
import { syncNtfy, syncCfPush } from './reminders.js';

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

  const pl = $('#playbook-list'); pl.innerHTML = '';
  if (!S.playbook.length) pl.innerHTML = '<div class="empty-note">When something works, write it down. Future-you forgets.</div>';
  S.playbook.forEach(p => {
    pl.insertAdjacentHTML('beforeend', `
      <div class="log-entry">
        <div class="log-head"><span class="log-rule win">Works</span><span class="log-date">${fmtDate(p.date)}</span></div>
        <div class="log-note-txt">${esc(p.text)}</div>
      </div>`);
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
    S.playbook.unshift({ date: todayKey(), text: v }); $('#playbook-in').value = ''; save(); renderLogs();
    toast('Into the playbook.');
  };
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
