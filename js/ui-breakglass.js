// ENFORCER 2.0 — P4: Break-Glass notes (write sheet, TODAY fire/invite cards, LOGS CRUD)
'use strict';
import { S, save, todayKey } from './state.js';
import { currentStreak, canPromptBreakGlass, breakGlassFireNow, mostRecentBreakGlassNote, addBreakGlassNote, pending } from './engine.js';
import { $, esc, toast, bus, peekShameJustClosed } from './ui-shared.js';

let editingId = null;
let logsBgOpen = false;
let powerDayInviteArmed = false;

/* ---------- TODAY: fire card (evening pending / weakness-armed day) ---------- */
export function renderBreakGlassFireCard() {
  const t = todayKey();
  const box = $('#breakglass-fire-card');
  // sacred rule: never render a note on, adjacent to, or immediately after the shame screen —
  // and never stacked with the Mirror's own note (mirror overlays TODAY anyway).
  const suppressed = peekShameJustClosed()
    || pending.shame != null                              // a shame screen opens right after this render pass
    || $('#shame-veil').classList.contains('open')
    || $('#mirror-veil').classList.contains('open');
  if (suppressed || !breakGlassFireNow(t)) { box.style.display = 'none'; return; }
  const note = mostRecentBreakGlassNote();
  if (!note) { box.style.display = 'none'; return; }
  box.style.display = '';
  $('#breakglass-fire-lbl').textContent = `From you, day ${note.streakAtWrite}:`;
  $('#breakglass-fire-text').textContent = note.text;
}

/* ---------- TODAY: write-invite card (Power Day evening) ---------- */
export function armPowerDayInvite() {
  const streak = currentStreak();
  if (canPromptBreakGlass(streak)) powerDayInviteArmed = true;
}
export function renderBreakGlassInviteCard() {
  const box = $('#breakglass-invite-card');
  box.style.display = powerDayInviteArmed ? '' : 'none';
}

/* ---------- write / edit sheet ---------- */
export function openBreakGlassWriteSheet(streak) {
  editingId = null;
  $('#bg-write-streak').textContent = streak;
  $('#bg-write-text').value = '';
  $('#bg-write-delete').style.display = 'none';
  // opened from a milestone celebration: sheet must layer above the fx-veil (z300)
  $('#breakglass-write-veil').classList.toggle('above-fx', $('#celebrate-veil').classList.contains('open'));
  $('#breakglass-write-veil').classList.add('open');
}
function openBreakGlassEditSheet(note) {
  editingId = note.id;
  $('#bg-write-streak').textContent = note.streakAtWrite;
  $('#bg-write-text').value = note.text;
  $('#bg-write-delete').style.display = '';
  $('#breakglass-write-veil').classList.remove('above-fx');
  $('#breakglass-write-veil').classList.add('open');
}
function saveBreakGlass() {
  const text = $('#bg-write-text').value.trim().slice(0, 240);
  if (!text) { toast('Write something first.'); return; }
  if (editingId) {
    const n = S.breakGlass.find(x => x.id === editingId);
    if (n) { n.text = text; save(); }
  } else {
    addBreakGlassNote(text, currentStreak());
    powerDayInviteArmed = false;
    $('#cel-bg-invite').style.display = 'none';   // celebration invite consumed
  }
  $('#breakglass-write-veil').classList.remove('open');
  toast('Saved.');
  bus.refresh(false);
}
function deleteBreakGlass() {
  if (!editingId) return;
  if (!confirm('Delete this note?')) return;
  S.breakGlass = S.breakGlass.filter(n => n.id !== editingId);
  save();
  $('#breakglass-write-veil').classList.remove('open');
  toast('Note deleted.');
  bus.refresh(false);
}

/* ---------- LOGS: collapsible list ---------- */
export function renderBreakGlassLogs() {
  const list = $('#breakglass-log-list');
  if (!S.breakGlass.length) { list.innerHTML = '<div class="empty-note">No notes yet. Written on strong days, read on weak ones.</div>'; return; }
  const sorted = [...S.breakGlass].sort((a, b) => b.writtenOn.localeCompare(a.writtenOn));
  list.innerHTML = sorted.map(n => `
    <div class="log-entry breakglass-log-entry" data-bgid="${n.id}">
      <div class="log-head"><span class="log-rule win">Day ${n.streakAtWrite}</span><span class="log-date">${esc(n.writtenOn)}</span></div>
      <div class="log-note-txt">${esc(n.text)}</div>
    </div>`).join('');
  list.querySelectorAll('[data-bgid]').forEach(row => row.onclick = () => {
    const note = S.breakGlass.find(n => n.id === row.dataset.bgid);
    if (note) openBreakGlassEditSheet(note);
  });
}

/* ---------- one-time wiring ---------- */
export function wireBreakGlass() {
  bus.openBreakGlassWrite = (streak) => openBreakGlassWriteSheet(streak);
  $('#bg-write-save').onclick = saveBreakGlass;
  $('#bg-write-delete').onclick = deleteBreakGlass;
  $('#bg-write-cancel').onclick = () => $('#breakglass-write-veil').classList.remove('open');
  $('#breakglass-invite-write-btn').onclick = () => openBreakGlassWriteSheet(currentStreak());
  $('#breakglass-invite-dismiss-btn').onclick = () => { powerDayInviteArmed = false; renderBreakGlassInviteCard(); };
  $('#logs-bg-toggle').onclick = () => {
    logsBgOpen = !logsBgOpen;
    $('#logs-bg-body').style.display = logsBgOpen ? '' : 'none';
    $('#logs-bg-toggle').classList.toggle('open', logsBgOpen);
  };
}
