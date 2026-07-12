// ENFORCER 2.0 — SETTINGS view: rules, habits, goals, holidays, reminders, push, phrases, export
'use strict';
import { S, save, todayKey, addDays, fmtDate, hm, now, DEFAULT_PHRASES } from './state.js';
import { wakeRule, goalStatus, ruleName, pending, identityValid, traitVotes30 } from './engine.js';
import { $, esc, toast, ICONS, ruleIcon, bus } from './ui-shared.js';
import { requestNotifPermission, randTopic, syncNtfy, syncCfPush, enableCfPush, disableCfPush } from './reminders.js';
import { openIdentitySetup } from './ui-mirror.js';
import { deckStats } from './srs.js';

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* optional trait tagging (P2) — dropdown markup shared by rule/habit/goal creation flows */
function traitOptionsHtml() {
  return `<option value="">None</option>` + S.identity.her.traits.map(tr => `<option value="${tr.id}">${esc(tr.label)}</option>`).join('');
}
function traitLabel(traitId) {
  if (!identityValid() || !traitId) return '';
  const tr = S.identity.her.traits.find(x => x.id === traitId);
  return tr ? tr.label : '';
}

export function renderSettings() {
  const si = $('#set-identity');
  if (!identityValid()) {
    si.innerHTML = `<div class="empty-note">Not set up yet. Two portraits: who you're becoming, who you refuse to be.</div><button class="btn ghost small" id="identity-edit-btn" style="margin-top:10px">Set up identity</button>`;
  } else {
    const idn = S.identity;
    const tv = traitVotes30();
    si.innerHTML = `
      <div class="identity-row"><div class="identity-lbl">${esc(idn.her.name)}</div><div class="identity-portrait">${esc(idn.her.portrait)}</div></div>
      <div class="identity-row"><div class="identity-lbl">${esc(idn.other.name)}</div><div class="identity-portrait">${esc(idn.other.portrait)}</div></div>
      <div class="identity-traits">${idn.her.traits.map(tr => `<span class="trait-tag">${esc(tr.label)} · <span class="trait-chip-count">${tv[tr.id] || 0}</span></span>`).join('')}</div>
      <button class="btn ghost small" id="identity-edit-btn" style="margin-top:10px">Edit identity</button>`;
  }
  $('#identity-edit-btn').onclick = () => openIdentitySetup();

  // P3: self-contract
  $('#contract-text').value = (S.contract && S.contract.text) ? S.contract.text : '';

  // trait selects for rule/habit creation — only when identity exists
  const nrtf = $('#new-rule-trait-f'), nhtf = $('#new-habit-trait-f');
  if (identityValid()) {
    nrtf.style.display = ''; $('#new-rule-trait').innerHTML = traitOptionsHtml();
    nhtf.style.display = ''; $('#new-habit-trait').innerHTML = traitOptionsHtml();
  } else {
    nrtf.style.display = 'none';
    nhtf.style.display = 'none';
  }

  const sr = $('#set-rules'); sr.innerHTML = '';
  for (const r of S.rules.filter(r => !r.removedOn)) {
    let right = '';
    if (r.ground && r.kind !== 'wake') right = `<span class="lock-tag">${ICONS.lock} Ground</span>`;
    if (r.kind === 'wake') right = `<input type="time" id="wake-time-in" class="inline-time" value="${r.wakeTime}" max="${r.wakeTime}"> <span class="lock-tag">${ICONS.lock} Earlier only</span>`;
    if (!r.ground) right = r.removalPendingUntil
      ? `<span class="lock-tag danger">Removing in ${Math.ceil((r.removalPendingUntil - Date.now()) / 3600000)} h</span>`
      : `<button class="mini-link danger" data-remove="${r.id}">Remove (24 h)</button>`;
    sr.insertAdjacentHTML('beforeend', `
      <div class="set-rule">
        <div class="rule-ico">${ruleIcon(r)}</div>
        <div style="flex:1"><div class="rule-name">${esc(ruleName(r))}</div><div class="rule-meta">${r.ground ? 'Immutable' : 'Added ' + fmtDate(r.addedOn)}</div></div>
        <div style="display:flex; align-items:center; gap:8px">${right}</div>
      </div>`);
  }
  const wt = $('#wake-time-in');
  if (wt) wt.addEventListener('change', () => {
    const wr = wakeRule();
    if (wt.value && wt.value < wr.wakeTime) { wr.wakeTime = wt.value; save(); toast('Wake-up moved earlier: ' + wt.value + '. There\'s no way back.'); bus.refresh(); }
    else { wt.value = wr.wakeTime; toast('Ratchet says no — wake-up can only move earlier.'); }
  });
  sr.querySelectorAll('[data-remove]').forEach(b => b.onclick = () => {
    const r = S.rules.find(x => x.id === b.dataset.remove);
    r.removalPendingUntil = Date.now() + 24 * 3600000; save(); toast('Removal starts in 24 h. Change your mind anytime before then.'); bus.refresh();
  });

  // bonus habits
  const sh = $('#set-habits'); sh.innerHTML = '';
  const liveHabits = S.habits.filter(h => !h.removedOn);
  if (!liveHabits.length) sh.innerHTML = '<div class="empty-note">No bonus habits yet. These are the extra-credit layer.</div>';
  for (const hb of liveHabits) {
    const traitMeta = hb.traitId && identityValid() ? ` · serves ${esc(traitLabel(hb.traitId))}` : '';
    sh.insertAdjacentHTML('beforeend', `
      <div class="set-rule">
        <div class="rule-ico">${ICONS.zap}</div>
        <div style="flex:1"><div class="rule-name">${esc(hb.name)}</div><div class="rule-meta">Added ${fmtDate(hb.addedOn)}${traitMeta}</div></div>
        <input type="number" class="minutes-in" min="1" max="120" value="${hb.minutes || 5}" data-hmin="${hb.id}" aria-label="Minutes for ${esc(hb.name)}">
        <button class="mini-link danger" data-hdel="${hb.id}">Remove</button>
      </div>`);
  }
  sh.querySelectorAll('[data-hdel]').forEach(b => b.onclick = () => {
    const hb = S.habits.find(x => x.id === b.dataset.hdel);
    hb.removedOn = todayKey(); save(); bus.refresh(); toast('Habit removed. Past Power Days stay earned.');
  });
  sh.querySelectorAll('[data-hmin]').forEach(inp => inp.onchange = () => {
    const hb = S.habits.find(x => x.id === inp.dataset.hmin);
    let v = Math.round(parseFloat(inp.value)) || 5;
    v = Math.max(1, Math.min(120, v));
    inp.value = v; hb.minutes = v; save(); bus.refresh();
  });

  // goals
  const sg = $('#set-goals'); sg.innerHTML = '';
  if (!S.goals.length) sg.innerHTML = '<div class="empty-note">No goals yet.</div>';
  for (const g of S.goals) {
    sg.insertAdjacentHTML('beforeend', `
      <div class="set-rule">
        <div style="flex:1"><div class="rule-name">${esc(g.name)}</div><div class="rule-meta">${g.type === 'freq' ? g.target + '× / week' : g.type === 'cume' ? g.target + ' ' + esc(g.unit || '') + ' / week' : 'by ' + fmtDate(g.date)} · ${g.enforce ? 'enforced' : 'informational'}</div></div>
        ${g.type === 'mile' && !g.completed ? `<button class="mini-link" data-gdone="${g.id}">Mark done</button>` : ''}
        <button class="mini-link danger" data-gdel="${g.id}">Delete</button>
      </div>`);
  }
  sg.querySelectorAll('[data-gdel]').forEach(b => b.onclick = () => { S.goals = S.goals.filter(g => g.id !== b.dataset.gdel); save(); bus.refresh(); toast('Goal removed.'); });
  sg.querySelectorAll('[data-gdone]').forEach(b => b.onclick = () => {
    const g = S.goals.find(x => x.id === b.dataset.gdone); g.completed = true; save();
    pending.celebration = { n: '✓', title: g.name + ' — done', goal: true }; bus.refresh();
  });

  // holiday
  const hs = $('#holiday-status'); hs.innerHTML = '';
  const t0 = todayKey();
  const active = S.holidays.find(h => { const end = h.endedOn ? addDays(h.endedOn, -1) : addDays(h.start, h.days - 1); return t0 >= h.start && t0 <= end; });
  const upcoming = S.holidays.filter(h => h.start > t0);
  if (active) hs.innerHTML = `<div class="rule-line"><div style="flex:1"><div class="rule-name">On holiday</div><div class="rule-meta">${fmtDate(active.start)} → ${fmtDate(addDays(active.start, active.days - 1))}</div></div><button class="mini-link" id="hol-end">End early</button></div>`;
  upcoming.forEach(h => hs.insertAdjacentHTML('beforeend', `<div class="rule-line"><div style="flex:1"><div class="rule-name">Scheduled: ${h.days} days</div><div class="rule-meta">${fmtDate(h.start)} → ${fmtDate(addDays(h.start, h.days - 1))}</div></div><button class="mini-link danger" data-hcancel="${h.start}">Cancel</button></div>`));
  const he = $('#hol-end'); if (he) he.onclick = () => { active.endedOn = todayKey(); save(); toast('Holiday ended. Rules live again tomorrow — today still counts as holiday.'); bus.refresh(); };
  hs.querySelectorAll('[data-hcancel]').forEach(b => b.onclick = () => { S.holidays = S.holidays.filter(h => h.start !== b.dataset.hcancel); save(); bus.refresh(); toast('Holiday cancelled.'); });

  // reminders
  const rl = $('#set-reminders'); rl.innerHTML = '';
  S.reminders.forEach(r => {
    rl.insertAdjacentHTML('beforeend', `
      <div class="row rem-row">
        <input type="time" value="${r.time}" data-rt="${r.id}" class="inline-time">
        <input value="${esc(r.text)}" data-rx="${r.id}" maxlength="80" class="rem-text-in">
        <button class="mini-link danger" data-rdel="${r.id}" aria-label="Delete reminder">${ICONS.x.replace('viewBox', 'width="14" height="14" viewBox')}</button>
        <div class="rule-meta" style="width:100%">${r.repeat === 'once' ? 'Once — ' + fmtDate(r.date) : r.repeat === 'weekly' ? 'Weekly — ' + WEEKDAY_NAMES[r.day] + 's' : 'Daily'}</div>
      </div>`);
  });
  rl.querySelectorAll('[data-rt]').forEach(inp => inp.onchange = () => { const r = S.reminders.find(x => x.id === inp.dataset.rt); if (r) { r.time = inp.value; save(); syncNtfy(); syncCfPush(); } });
  rl.querySelectorAll('[data-rx]').forEach(inp => inp.onchange = () => { const r = S.reminders.find(x => x.id === inp.dataset.rx); if (r) { r.text = inp.value; save(); } });
  rl.querySelectorAll('[data-rdel]').forEach(b => b.onclick = () => { S.reminders = S.reminders.filter(x => x.id !== b.dataset.rdel); save(); renderSettings(); syncNtfy(); syncCfPush(); });

  // ntfy always-on push
  $('#ntfy-toggle').checked = S.ntfyEnabled;
  const nd = $('#ntfy-details');
  if (!S.ntfyEnabled) {
    nd.innerHTML = '';
  } else {
    nd.innerHTML = `
      <div class="hint" style="margin-top:10px">Topic: <b class="hi-text">${esc(S.ntfyTopic)}</b></div>
      <div class="hint">1. Install the <b class="hi-text">ntfy</b> app from the App Store.<br>2. Add a subscription to the topic above.<br>3. Tap "Send test" below.</div>
      <div style="height:8px"></div>
      <button class="btn ghost small" id="ntfy-test-btn">Send test</button>
      <div class="hint warn" style="margin-top:10px">Pushes queued for the next ~3 days can't be recalled if a reminder is edited or deleted. Open the app daily to keep pushes flowing.</div>`;
    $('#ntfy-test-btn').onclick = async () => {
      try {
        const resp = await fetch(`https://ntfy.sh/${S.ntfyTopic}`, { method: 'POST', body: 'Test: Enforcer push works', headers: { 'X-Title': 'ENFORCER' } });
        toast(resp.ok ? 'Test push sent.' : 'Send failed — check connection.');
      } catch (e) { console.warn('ntfy test failed', e); toast('Send failed — check connection.'); }
    };
  }

  // Cloudflare always-on push
  $('#cf-push-toggle').checked = S.cfPushEnabled;
  const cfd = $('#cf-push-details');
  cfd.innerHTML = S.cfPushEnabled
    ? '<div class="hint" style="margin-top:10px">Enabled — this device receives push via the Enforcer Worker.</div>'
    : (S.cfPushNeedsReenable
      ? '<div class="hint" style="margin-top:10px;color:var(--ember)">Push was on in Enforcer 1.0 — this new app needs its own subscription. Toggle on to restore lock-screen reminders.</div>'
      : '');

  // recall (P6) settings
  $('#srs-new-per-day').value = S.srsSettings.newPerDay;
  $('#quiz-per-day').value = S.quizPerDay;
  const dsM = deckStats('mistakes'), dsS = deckStats('stem');
  $('#srs-deck-stats').innerHTML = `
    <div class="rule-meta">Mistakes — ${dsM.new} new · ${dsM.learning} learning · ${dsM.review} review · ${dsM.suspended} suspended</div>
    <div class="rule-meta">STEM Gaps — ${dsS.new} new · ${dsS.learning} learning · ${dsS.review} review · ${dsS.suspended} suspended</div>`;

  // phrase editors
  const pe = $('#phrase-editors'); pe.innerHTML = '';
  const POOL_LABELS = { morning: 'Morning motivation', milestone: 'Milestone celebration', shame: 'After a break (shame)', comeback: 'Comeback (day 1-3)' };
  for (const [pool, label] of Object.entries(POOL_LABELS)) {
    pe.insertAdjacentHTML('beforeend', `
      <div class="field"><label>${label}</label><textarea data-pool="${pool}">${esc((S.phrases[pool] || []).join('\n'))}</textarea></div>`);
  }
  pe.querySelectorAll('textarea').forEach(ta => ta.onchange = () => {
    const lines = ta.value.split('\n').map(s => s.trim()).filter(Boolean);
    S.phrases[ta.dataset.pool] = lines.length ? lines : JSON.parse(JSON.stringify(DEFAULT_PHRASES[ta.dataset.pool]));
    save(); toast('Your words, saved.');
  });
}

/* ---------- goal sheet ---------- */
let goalType = 'freq';
function openGoalSheet() {
  if (S.goals.length >= 3) { toast('Three goals max. Finish one first — focus beats breadth.'); return; }
  goalType = 'freq';
  $('#goal-name').value = ''; $('#goal-target').value = ''; $('#goal-unit').value = ''; $('#goal-date').value = '';
  $('#goal-enforce').checked = true;
  const gtf = $('#goal-trait-f');
  if (identityValid()) { gtf.style.display = ''; $('#goal-trait').innerHTML = traitOptionsHtml(); $('#goal-trait').value = ''; }
  else gtf.style.display = 'none';
  updateGoalTypeUI();
  $('#goal-veil').classList.add('open');
}
function updateGoalTypeUI() {
  document.querySelectorAll('#goal-type-seg button').forEach(b => b.classList.toggle('on', b.dataset.t === goalType));
  $('#goal-target-f').style.display = goalType === 'mile' ? 'none' : '';
  $('#goal-target-lbl').textContent = goalType === 'freq' ? 'Times per week' : 'Amount per week';
  $('#goal-unit-f').style.display = goalType === 'cume' ? '' : 'none';
  $('#goal-date-f').style.display = goalType === 'mile' ? '' : 'none';
}
function saveGoal() {
  const name = $('#goal-name').value.trim();
  if (!name) { toast('Name the goal.'); return; }
  const traitId = identityValid() ? ($('#goal-trait').value || null) : null;
  const g = { id: 'g' + Date.now(), name, type: goalType, enforce: $('#goal-enforce').checked, completed: false, traitId };
  if (goalType === 'mile') { const dt = $('#goal-date').value; if (!dt || dt <= todayKey()) { toast('Pick a future deadline.'); return; } g.date = dt; }
  else { const tg = parseFloat($('#goal-target').value); if (!tg || tg <= 0) { toast('Set a target.'); return; } g.target = tg; if (goalType === 'cume') g.unit = $('#goal-unit').value.trim() || 'units'; }
  S.goals.push(g); save();
  $('#goal-veil').classList.remove('open');
  toast('Goal set. Stay ahead of the pace and you\'ll never hear about it.');
  bus.refresh();
}

/* ---------- one-time wiring ---------- */
export function wireSettings() {
  $('#contract-save').onclick = () => {
    const v = $('#contract-text').value.trim();
    S.contract = v ? { text: v, updatedAt: todayKey() } : null;
    save(); toast(v ? 'Contract saved.' : 'Contract cleared.');
  };
  $('#add-rule-btn').onclick = () => {
    const name = $('#new-rule-name').value.trim();
    if (!name) { toast('Name the rule first.'); return; }
    if (S.rules.filter(r => !r.removedOn).length >= 5) { toast('Five rules max. Master these before adding more.'); return; }
    const traitId = identityValid() ? ($('#new-rule-trait').value || null) : null;
    S.rules.push({ id: 'r' + Date.now(), name, kind: 'abstain', ground: false, addedOn: addDays(todayKey(), 1), removedOn: null, removalPendingUntil: null, traitId });
    $('#new-rule-name').value = ''; save(); bus.refresh();
    toast('Rule added — counts from tomorrow. Every streak you\'ve built stays intact.');
  };
  $('#add-habit-btn').onclick = () => {
    const name = $('#new-habit-name').value.trim();
    if (!name) { toast('Name the habit first.'); return; }
    if (S.habits.filter(h => !h.removedOn).length >= 7) { toast('Seven extras max — a Power Day should be hard, not a chore list.'); return; }
    const traitId = identityValid() ? ($('#new-habit-trait').value || null) : null;
    S.habits.push({ id: 'h' + Date.now(), name, addedOn: todayKey(), removedOn: null, minutes: 5, traitId });
    $('#new-habit-name').value = ''; save(); bus.refresh();
    toast('Bonus habit added — counts from today. Zero risk, pure upside.');
  };
  $('#add-goal-btn').onclick = openGoalSheet;
  document.querySelectorAll('#goal-type-seg button').forEach(b => b.onclick = () => { goalType = b.dataset.t; updateGoalTypeUI(); });
  $('#goal-save').onclick = saveGoal;
  $('#goal-cancel').onclick = () => $('#goal-veil').classList.remove('open');

  $('#hol-btn').onclick = () => {
    const start = $('#hol-start').value, days = parseInt($('#hol-days').value);
    if (!start || !days || days < 1) { toast('Pick a start date and length.'); return; }
    if (start <= todayKey()) { toast('Holidays are declared in advance — earliest start is tomorrow.'); return; }
    if (S.holidays.some(h => !h.endedOn && addDays(h.start, h.days - 1) >= start && h.start <= addDays(start, days - 1))) { toast('Overlaps an existing holiday.'); return; }
    S.holidays.push({ start, days, endedOn: null }); save(); bus.refresh();
    toast(`Holiday locked: ${days} days from ${fmtDate(start)}. Fixed length — no extending.`);
  };

  $('#notif-perm-btn').onclick = requestNotifPermission;
  $('#ntfy-toggle').onchange = e => {
    S.ntfyEnabled = e.target.checked;
    if (S.ntfyEnabled && !S.ntfyTopic) S.ntfyTopic = randTopic();
    save(); renderSettings();
    if (S.ntfyEnabled) syncNtfy();
  };
  $('#cf-push-toggle').onchange = async e => {
    const turningOn = e.target.checked;
    if (turningOn) {
      const ok = await enableCfPush();
      S.cfPushEnabled = ok;
      if (ok) { S.cfPushNeedsReenable = false; toast('Always-on push enabled.'); }
    } else {
      await disableCfPush();
      S.cfPushEnabled = false;
    }
    save(); renderSettings();
  };

  let newRemRepeat = 'daily';
  document.querySelectorAll('#new-rem-repeat-seg button').forEach(b => b.onclick = () => {
    newRemRepeat = b.dataset.r;
    document.querySelectorAll('#new-rem-repeat-seg button').forEach(x => x.classList.toggle('on', x === b));
    $('#new-rem-date-f').style.display = newRemRepeat === 'once' ? '' : 'none';
    if (newRemRepeat === 'once' && !$('#new-rem-date').value) $('#new-rem-date').value = todayKey();
  });
  $('#add-rem-btn').onclick = () => {
    const text = $('#new-rem-text').value.trim();
    const time = $('#new-rem-time').value;
    if (!text) { toast('Write the reminder text.'); return; }
    if (!time) { toast('Pick a time.'); return; }
    const rem = { id: 'rem' + Date.now(), text, time, repeat: newRemRepeat };
    if (newRemRepeat === 'once') {
      const dt = $('#new-rem-date').value || todayKey();
      if (dt < todayKey() || (dt === todayKey() && time <= hm(now()))) { toast('That moment already passed — pick a future date and time.'); return; }
      rem.date = dt;
    }
    S.reminders.push(rem);
    $('#new-rem-text').value = '';
    save(); renderSettings(); syncNtfy(); syncCfPush();
    toast('Reminder added.');
  };
  $('#export-btn').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
    a.download = 'enforcer-export-' + todayKey() + '.json'; a.click();
  };
  $('#srs-new-per-day').onchange = e => {
    let v = Math.round(parseFloat(e.target.value)) || 5;
    v = Math.max(1, Math.min(20, v));
    e.target.value = v; S.srsSettings.newPerDay = v; save(); bus.refresh();
  };
  $('#quiz-per-day').onchange = e => {
    let v = Math.round(parseFloat(e.target.value)) || 5;
    v = Math.max(1, Math.min(20, v));
    e.target.value = v; S.quizPerDay = v; save(); bus.refresh();
  };
  $('#quiz-reset-btn').onclick = () => {
    if (!confirm('Reset quiz history? This clears served-question tracking and today\'s in-progress quiz. Cards already drafted from wrong answers are kept.')) return;
    S.quizServed = {}; S.quizToday = null; save(); bus.refresh();
    toast('Quiz history reset.');
  };
  $('#srs-export-btn').onclick = async () => {
    const cards = [...S.decks.mistakes.cards, ...S.decks.stem.cards];
    const text = cards.map(c => `Q: ${c.front}\nA: ${c.back}`).join('\n\n');
    if (!text) { toast('No cards to export yet.'); return; }
    try {
      await navigator.clipboard.writeText(text);
      toast('Cards copied to clipboard.');
    } catch {
      $('#export-cards-text').value = text;
      $('#export-cards-veil').classList.add('open');
      $('#export-cards-text').select();
    }
  };
  $('#export-cards-close').onclick = () => $('#export-cards-veil').classList.remove('open');
}
