// ENFORCER 2.0 — LOGS view: mistake log + playbook
'use strict';
import { S, save, todayKey, fmtDate } from './state.js';
import { $, esc, toast, bus } from './ui-shared.js';
import { findMistakeCard } from './srs.js';

export function renderLogs() {
  const ml = $('#mistake-list'); ml.innerHTML = '';
  if (!S.mistakes.length) ml.innerHTML = '<div class="empty-note">No breaks yet. Keep it that way.</div>';
  S.mistakes.forEach((m, i) => {
    const card = findMistakeCard(m.date, m.ruleId);
    ml.insertAdjacentHTML('beforeend', `
      <div class="log-entry">
        <div class="log-head"><span class="log-rule">${esc(m.ruleName)}</span><span class="log-date">${fmtDate(m.date)}</span></div>
        <div class="log-lost">Cut a ${m.lost}-day streak</div>
        ${m.note ? `<div class="log-note-txt">${esc(m.note)}</div>` : `<input class="log-note-in" data-mi="${i}" placeholder="What happened? One honest line." maxlength="120">`}
        ${card ? `<button class="mistake-card-link" data-cardid="${card.id}">${card.suspended ? 'Card (suspended)' : 'Card'} ✎</button>` : ''}
      </div>`);
  });
  ml.querySelectorAll('[data-cardid]').forEach(b => b.onclick = () => openCardEdit(b.dataset.cardid));
  ml.querySelectorAll('.log-note-in').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter' && inp.value.trim()) { S.mistakes[+inp.dataset.mi].note = inp.value.trim(); save(); renderLogs(); } });
    inp.addEventListener('blur', () => { if (inp.value.trim()) { S.mistakes[+inp.dataset.mi].note = inp.value.trim(); save(); renderLogs(); } });
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
