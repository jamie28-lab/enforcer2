// ENFORCER 2.0 — P5 Body Ledger: meal log + gym log, TODAY Body card, LOGS Gym/Meals sections
'use strict';
import { S, save, todayKey, addDays, fmtDate, hm, now } from './state.js';
import { checkNewPR, pending } from './engine.js';
import { $, esc, toast, ICONS, bus } from './ui-shared.js';

let editingMealId = null;
let mealDraftTag = 'clean';
let editingGymId = null;
let gymDraft = null;
let logsGymOpen = false;
let logsMealsOpen = false;
let expandedGymEntries = new Set();

/* ---------- TODAY: Body card ---------- */
export function renderBodyCard() {
  const t = todayKey();
  const meals = S.meals.filter(m => m.date === t);
  const box = $('#body-meal-dots');
  if (!meals.length) {
    box.innerHTML = '<span class="empty-note" style="padding:0">No meals logged yet today.</span>';
    return;
  }
  const counts = { clean: 0, borderline: 0, junk: 0 };
  for (const m of meals) counts[m.tag] = (counts[m.tag] || 0) + 1;
  box.innerHTML = ['clean', 'borderline', 'junk'].filter(tag => counts[tag])
    .map(tag => `<span><i class="body-dot ${tag}"></i>${counts[tag]}</span>`).join('');
}

/* ---------- meal sheet ---------- */
function paintMealTag(tag) {
  mealDraftTag = tag;
  document.querySelectorAll('#meal-tag-row .tag-btn').forEach(b => b.classList.toggle('on', b.dataset.tag === tag));
}
function openMealSheet(meal) {
  editingMealId = meal ? meal.id : null;
  $('#meal-sheet-title').textContent = meal ? 'Edit meal' : 'Log meal';
  $('#meal-time').value = meal ? meal.time : hm(now());
  $('#meal-text').value = meal ? meal.text : '';
  paintMealTag(meal ? meal.tag : 'clean');
  $('#meal-delete').style.display = meal ? '' : 'none';
  $('#meal-veil').classList.add('open');
}
function saveMeal() {
  const time = $('#meal-time').value || hm(now());
  const text = $('#meal-text').value.trim();
  if (!text) { toast('Say what you ate.'); return; }
  if (editingMealId) {
    const m = S.meals.find(x => x.id === editingMealId);
    if (m) { m.time = time; m.text = text; m.tag = mealDraftTag; }
  } else {
    S.meals.unshift({ id: 'meal' + Date.now(), date: todayKey(), time, text, tag: mealDraftTag });
  }
  save();
  $('#meal-veil').classList.remove('open');
  toast('Meal logged.');
  bus.refresh(false);
}
function deleteMeal() {
  if (!editingMealId) return;
  if (!confirm('Delete this meal entry?')) return;
  S.meals = S.meals.filter(m => m.id !== editingMealId);
  save();
  $('#meal-veil').classList.remove('open');
  toast('Meal deleted.');
  bus.refresh(false);
}

/* ---------- gym sheet ---------- */
function mostRecentWorkout() {
  let best = null;
  for (const w of S.gym) if (!best || w.date >= best.date) best = w;
  return best;
}
function deepCloneExercises(exs) {
  return (exs || []).map(ex => ({ name: ex.name, sets: (ex.sets || []).map(s => ({ reps: s.reps, kg: s.kg })) }));
}
function populateExerciseDatalist() {
  const names = new Map();
  for (const w of S.gym) for (const ex of w.exercises) if (ex.name && ex.name.trim()) names.set(ex.name.trim().toLowerCase(), ex.name.trim());
  $('#exercise-names-list').innerHTML = [...names.values()].map(n => `<option value="${esc(n)}"></option>`).join('');
}
function openGymSheet(entry) {
  editingGymId = entry ? entry.id : null;
  $('#gym-sheet-title').textContent = entry ? 'Edit workout' : 'Log workout';
  $('#gym-date').value = entry ? entry.date : todayKey();
  $('#gym-note').value = entry ? (entry.note || '') : '';
  if (entry) {
    gymDraft = { exercises: deepCloneExercises(entry.exercises) };
  } else {
    const prev = mostRecentWorkout();
    gymDraft = { exercises: prev ? deepCloneExercises(prev.exercises) : [] };
  }
  if (!gymDraft.exercises.length) gymDraft.exercises = [{ name: '', sets: [{ reps: 5, kg: 0 }] }];
  $('#gym-delete').style.display = entry ? '' : 'none';
  populateExerciseDatalist();
  paintGymExercises();
  $('#gym-veil').classList.add('open');
}
function paintGymExercises() {
  const box = $('#gym-exercises');
  box.innerHTML = gymDraft.exercises.map((ex, exi) => `
    <div class="gym-ex-row" data-exi="${exi}">
      <div class="field" style="margin-bottom:10px">
        <input list="exercise-names-list" class="gym-ex-name" data-exi="${exi}" placeholder="Exercise name" maxlength="40" value="${esc(ex.name)}">
      </div>
      <div class="gym-sets" data-exi="${exi}">
        ${ex.sets.map((s, si) => `
          <div class="gym-set-row" data-exi="${exi}" data-si="${si}">
            <input type="number" class="gym-reps" data-exi="${exi}" data-si="${si}" min="1" max="99" value="${s.reps}" aria-label="Reps">
            <span>&times;</span>
            <input type="number" class="gym-kg" data-exi="${exi}" data-si="${si}" min="0" max="500" step="0.5" value="${s.kg}" aria-label="Kg">
            <button type="button" class="mini-link danger gym-del-set" data-exi="${exi}" data-si="${si}" aria-label="Remove set">${ICONS.x.replace('viewBox', 'width="12" height="12" viewBox')}</button>
          </div>`).join('')}
      </div>
      <div class="row" style="gap:14px; margin-top:4px; justify-content:flex-start">
        <button type="button" class="mini-link gym-add-set" data-exi="${exi}">+ Set</button>
        <button type="button" class="mini-link danger gym-del-ex" data-exi="${exi}">Remove exercise</button>
      </div>
    </div>`).join('');
  wireGymExerciseEvents();
}
function wireGymExerciseEvents() {
  const box = $('#gym-exercises');
  box.querySelectorAll('.gym-ex-name').forEach(inp => inp.onchange = () => { gymDraft.exercises[+inp.dataset.exi].name = inp.value; });
  box.querySelectorAll('.gym-reps').forEach(inp => inp.onchange = () => {
    let v = Math.round(parseFloat(inp.value)) || 1; v = Math.max(1, Math.min(99, v)); inp.value = v;
    gymDraft.exercises[+inp.dataset.exi].sets[+inp.dataset.si].reps = v;
  });
  box.querySelectorAll('.gym-kg').forEach(inp => inp.onchange = () => {
    let v = parseFloat(inp.value); if (!Number.isFinite(v)) v = 0;
    v = Math.round(v * 2) / 2;   // clamp to 0.5 steps
    v = Math.max(0, Math.min(500, v));
    inp.value = v;
    gymDraft.exercises[+inp.dataset.exi].sets[+inp.dataset.si].kg = v;
  });
  box.querySelectorAll('.gym-add-set').forEach(b => b.onclick = () => {
    const exi = +b.dataset.exi;
    const sets = gymDraft.exercises[exi].sets;
    const prev = sets[sets.length - 1] || { reps: 5, kg: 0 };
    sets.push({ reps: prev.reps, kg: prev.kg });
    paintGymExercises();
  });
  box.querySelectorAll('.gym-del-set').forEach(b => b.onclick = () => {
    const exi = +b.dataset.exi, si = +b.dataset.si;
    const sets = gymDraft.exercises[exi].sets;
    if (sets.length <= 1) { toast('Every exercise needs at least one set.'); return; }
    sets.splice(si, 1);
    paintGymExercises();
  });
  box.querySelectorAll('.gym-del-ex').forEach(b => b.onclick = () => {
    if (gymDraft.exercises.length <= 1) { toast('Every workout needs at least one exercise.'); return; }
    gymDraft.exercises.splice(+b.dataset.exi, 1);
    paintGymExercises();
  });
}
function addGymExercise() {
  gymDraft.exercises.push({ name: '', sets: [{ reps: 5, kg: 0 }] });
  paintGymExercises();
}
function saveGym() {
  const date = $('#gym-date').value || todayKey();
  const note = $('#gym-note').value.trim();
  const exercises = gymDraft.exercises
    .map(ex => ({ name: ex.name.trim(), sets: ex.sets.map(s => ({ reps: Math.max(1, Math.min(99, Math.round(s.reps) || 1)), kg: Math.max(0, Math.min(500, s.kg || 0)) })) }))
    .filter(ex => ex.name);
  if (!exercises.length) { toast('Name at least one exercise.'); return; }
  const id = editingGymId || ('gym' + Date.now());
  const entry = { id, date, exercises, note };

  // P5: PR check — each exercise's new top set vs all PRIOR sessions (excluding this entry when editing).
  // When editing, the entry's own pre-edit top also counts as prior: a no-op re-save of the
  // record-holding workout must not re-celebrate — only a genuinely heavier lift does.
  const preEdit = editingGymId ? S.gym.find(w => w.id === editingGymId) : null;
  let prCelebration = null;
  for (const ex of exercises) {
    const maxKg = Math.max(...ex.sets.map(s => s.kg));
    if (maxKg <= 0) continue;
    let ownPrior = 0;
    if (preEdit) {
      for (const pex of preEdit.exercises) {
        if (pex.name.trim().toLowerCase() === ex.name.trim().toLowerCase()) {
          ownPrior = Math.max(ownPrior, ...pex.sets.map(s => s.kg));
        }
      }
    }
    if (maxKg > ownPrior && checkNewPR(ex.name, maxKg, editingGymId) && !prCelebration) {
      prCelebration = { n: maxKg, title: `${ex.name} PR — ${maxKg} kg` };
    }
  }

  if (editingGymId) {
    const idx = S.gym.findIndex(w => w.id === editingGymId);
    if (idx >= 0) S.gym[idx] = entry; else S.gym.unshift(entry);
  } else {
    S.gym.unshift(entry);
  }
  save();
  $('#gym-veil').classList.remove('open');
  toast('Workout logged.');
  if (prCelebration) pending.celebration = prCelebration;
  bus.refresh();
}
function deleteGym() {
  if (!editingGymId) return;
  if (!confirm('Delete this workout entry?')) return;
  S.gym = S.gym.filter(w => w.id !== editingGymId);
  save();
  $('#gym-veil').classList.remove('open');
  toast('Workout deleted.');
  bus.refresh();
}

/* ---------- LOGS: Gym + Meals sections ---------- */
function fmtSetsLine(ex) {
  return `${esc(ex.name)} ${ex.sets.map(s => `${s.reps}x${s.kg}`).join(', ')}`;
}
export function renderGymMealLogs() {
  // ---- Gym ----
  const gymList = $('#gym-log-list');
  const sortedGym = [...S.gym].sort((a, b) => a.date === b.date ? 0 : (a.date < b.date ? 1 : -1));
  if (!sortedGym.length) gymList.innerHTML = '<div class="empty-note">No workouts logged yet.</div>';
  else {
    gymList.innerHTML = sortedGym.map(w => {
      const nSets = w.exercises.reduce((n, ex) => n + ex.sets.length, 0);
      const vol = w.exercises.reduce((v, ex) => v + ex.sets.reduce((sv, s) => sv + s.reps * s.kg, 0), 0);
      const open = expandedGymEntries.has(w.id);
      return `
        <div class="log-entry gym-entry">
          <div class="gym-entry-head" data-gtoggle="${w.id}">
            <div><div class="log-date">${fmtDate(w.date)}</div><div class="gym-summary">${w.exercises.length} exercise${w.exercises.length === 1 ? '' : 's'} · ${nSets} set${nSets === 1 ? '' : 's'} · ${vol} kg total volume</div></div>
            <svg class="chev ${open ? 'open' : ''}" viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div class="gym-entry-detail" style="display:${open ? '' : 'none'}">
            ${w.exercises.map(ex => `<div class="gym-detail-line">${fmtSetsLine(ex)}</div>`).join('')}
            ${w.note ? `<div class="log-note-txt">${esc(w.note)}</div>` : ''}
            <div class="row" style="gap:16px; margin-top:8px; justify-content:flex-start">
              <button type="button" class="mini-link" data-gedit="${w.id}">Edit</button>
              <button type="button" class="mini-link danger" data-gdel="${w.id}">Delete</button>
            </div>
          </div>
        </div>`;
    }).join('');
    gymList.querySelectorAll('[data-gtoggle]').forEach(h => h.onclick = () => {
      const id = h.dataset.gtoggle;
      if (expandedGymEntries.has(id)) expandedGymEntries.delete(id); else expandedGymEntries.add(id);
      renderGymMealLogs();
    });
    gymList.querySelectorAll('[data-gedit]').forEach(b => b.onclick = e => { e.stopPropagation(); openGymSheet(S.gym.find(w => w.id === b.dataset.gedit)); });
    gymList.querySelectorAll('[data-gdel]').forEach(b => b.onclick = e => {
      e.stopPropagation();
      if (!confirm('Delete this workout entry?')) return;
      S.gym = S.gym.filter(w => w.id !== b.dataset.gdel);
      save(); bus.refresh();
    });
  }

  // ---- Meals ----
  const mealList = $('#meal-log-list');
  const t = todayKey();
  const cutoff = addDays(t, -7);
  const sortedMeals = [...S.meals].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return a.time < b.time ? 1 : -1;
  });
  const recent = sortedMeals.filter(m => m.date >= cutoff);
  const older = sortedMeals.length - recent.length;
  if (!sortedMeals.length) mealList.innerHTML = '<div class="empty-note">No meals logged yet.</div>';
  else {
    let html = '';
    let lastDate = null;
    for (const m of recent) {
      if (m.date !== lastDate) {
        lastDate = m.date;
        html += `<div class="meal-day-lbl">${m.date === t ? 'Today' : fmtDate(m.date)}</div>`;
      }
      html += `
        <div class="meal-row" data-meid="${m.id}">
          <i class="body-dot ${m.tag}"></i>
          <span class="meal-time">${esc(m.time)}</span>
          <span class="meal-text">${esc(m.text)}</span>
        </div>`;
    }
    if (older > 0) html += `<div class="empty-note">${older} older entr${older === 1 ? 'y' : 'ies'}</div>`;
    mealList.innerHTML = html;
    mealList.querySelectorAll('[data-meid]').forEach(row => row.onclick = () => openMealSheet(S.meals.find(m => m.id === row.dataset.meid)));
  }
}

/* ---------- one-time wiring ---------- */
export function wireBody() {
  $('#logs-gym-toggle').onclick = () => {
    logsGymOpen = !logsGymOpen;
    $('#logs-gym-body').style.display = logsGymOpen ? '' : 'none';
    $('#logs-gym-toggle').classList.toggle('open', logsGymOpen);
  };
  $('#logs-meals-toggle').onclick = () => {
    logsMealsOpen = !logsMealsOpen;
    $('#logs-meals-body').style.display = logsMealsOpen ? '' : 'none';
    $('#logs-meals-toggle').classList.toggle('open', logsMealsOpen);
  };
  $('#body-log-meal-btn').onclick = () => openMealSheet(null);
  $('#body-log-workout-btn').onclick = () => openGymSheet(null);
  $('#logs-add-meal-btn').onclick = () => openMealSheet(null);
  $('#logs-add-workout-btn').onclick = () => openGymSheet(null);

  document.querySelectorAll('#meal-tag-row .tag-btn').forEach(b => b.onclick = () => paintMealTag(b.dataset.tag));
  $('#meal-save').onclick = saveMeal;
  $('#meal-delete').onclick = deleteMeal;
  $('#meal-cancel').onclick = () => $('#meal-veil').classList.remove('open');

  $('#gym-add-exercise').onclick = addGymExercise;
  $('#gym-save').onclick = saveGym;
  $('#gym-delete').onclick = deleteGym;
  $('#gym-cancel').onclick = () => $('#gym-veil').classList.remove('open');
}
