// ENFORCER 2.0 — LOGS view: mistake log + playbook
'use strict';
import { S, save, todayKey, fmtDate } from './state.js';
import { $, esc, toast } from './ui-shared.js';

export function renderLogs() {
  const ml = $('#mistake-list'); ml.innerHTML = '';
  if (!S.mistakes.length) ml.innerHTML = '<div class="empty-note">No breaks yet. Keep it that way.</div>';
  S.mistakes.forEach((m, i) => {
    ml.insertAdjacentHTML('beforeend', `
      <div class="log-entry">
        <div class="log-head"><span class="log-rule">${esc(m.ruleName)}</span><span class="log-date">${fmtDate(m.date)}</span></div>
        <div class="log-lost">Cut a ${m.lost}-day streak</div>
        ${m.note ? `<div class="log-note-txt">${esc(m.note)}</div>` : `<input class="log-note-in" data-mi="${i}" placeholder="What happened? One honest line." maxlength="120">`}
      </div>`);
  });
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

export function wireLogs() {
  $('#playbook-add').onclick = () => {
    const v = $('#playbook-in').value.trim(); if (!v) return;
    S.playbook.unshift({ date: todayKey(), text: v }); $('#playbook-in').value = ''; save(); renderLogs();
    toast('Into the playbook.');
  };
}
