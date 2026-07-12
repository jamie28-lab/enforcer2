// ENFORCER 2.0 — boot, nav wiring, intervals, service worker registration
'use strict';
import { load, setRefreshHook, installDebugHook } from './state.js';
import { applyEscalations, settle, pending } from './engine.js';
import { normalizeSrs } from './srs.js';
import { $, bus, toast, wireOverlays, showShame, showCelebration } from './ui-shared.js';
import { renderToday, wireToday } from './ui-today.js';
import { renderStreaks } from './ui-streaks.js';
import { renderLogs, wireLogs } from './ui-logs.js';
import { renderSettings, wireSettings } from './ui-settings.js';
import { reminderTick, syncNtfy, syncCfPush } from './reminders.js';
import { shouldShowMirror, openMirror, wireIdentitySetup } from './ui-mirror.js';

/* ---------- nav & refresh ---------- */
function show(view) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  $('#view-' + view).classList.add('active');
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.view === view));
  window.scrollTo({ top: 0 });
  refresh(false);
}
function refresh(reSettle = true) {
  if (reSettle) { applyEscalations(); settle(); }
  renderToday(); renderStreaks(); renderLogs(); renderSettings();
  if (pending.shame) { showShame(pending.shame); pending.shame = null; }
  else if (pending.celebration) { showCelebration(pending.celebration); pending.celebration = null; }
  checkMirror();
}
function checkMirror() {
  // defer while any overlay is up (check-in sheet, shame/celebration, setup) — re-runs on next refresh/tick
  if (document.querySelector('.mirror-veil.open, .sheet-veil.open, .fx-veil.open')) return;
  if (shouldShowMirror()) openMirror();
}
bus.refresh = refresh;
bus.renderSettings = renderSettings;
setRefreshHook(refresh);

/* ---------- boot ---------- */
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(e => console.warn('SW registration failed', e));
}
const imported = load();
normalizeSrs();
installDebugHook();
document.querySelectorAll('nav button').forEach(b => b.onclick = () => show(b.dataset.view));
wireToday();
wireLogs();
wireSettings();
wireOverlays();
wireIdentitySetup();
applyEscalations();
settle();
refresh(false);
if (imported) toast('Data imported from Enforcer 1.0 ✓');
syncNtfy();
syncCfPush();
setInterval(() => { reminderTick(); }, 30000);
setInterval(() => { refresh(); }, 5 * 60000);
