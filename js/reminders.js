// ENFORCER 2.0 — reminders: in-app tick, notify(), ntfy sync, Cloudflare push (v9 logic)
'use strict';
import { S, save, todayKey, addDays, parseKey, hm, now, CF_WORKER_URL, VAPID_PUBLIC_KEY } from './state.js';
import { toast, bus } from './ui-shared.js';

/* ---------- notifications ---------- */
export async function notify(body) {
  if ('serviceWorker' in navigator && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification('ENFORCER', { body, icon: './icon.png' });
      return;
    } catch { /* fall through */ }
  }
  if (!('serviceWorker' in navigator) && 'Notification' in window && Notification.permission === 'granted') {
    new Notification('ENFORCER', { body });
  }
}

export async function requestNotifPermission() {
  if (!('Notification' in window)) { toast('Notifications not supported here.'); return; }
  const p = await Notification.requestPermission();
  toast(p === 'granted' ? 'Notifications on.' : 'Permission not granted.');
  bus.refresh(false);
}

/* ---------- in-app reminder tick (30s interval, 5-min slot window) ---------- */
export function reminderTick() {
  const t = todayKey(), cur = hm(now());
  let removed = false;
  S.reminders = S.reminders.filter(r => {
    if (r.repeat === 'once') {
      if (r.date > t) return true;                          // future date, keep
      if (r.date < t || cur >= r.time) {                    // past date, or today with time reached/passed
        // catch-up: fire once even if the slot was missed while the app was closed
        const fk = r.date + '@' + r.id;
        if (S.lastReminderFired[fk] !== true) { if (!S.cfPushEnabled) notify(r.text); toast(r.text); S.lastReminderFired[fk] = true; }
        removed = true; return false;                       // fired: drop it
      }
      return true;                                          // today, time not reached yet
    }
    const fk = t + '@' + r.id;
    if (cur >= r.time && S.lastReminderFired[fk] !== true) {
      // only fire within 5 min of the slot to avoid stale bursts on open
      const [h, m] = r.time.split(':').map(Number);
      const slot = new Date(now()); slot.setHours(h, m, 0, 0);
      if (now() - slot < 5 * 60000) { if (!S.cfPushEnabled) notify(r.text); toast(r.text); }
      S.lastReminderFired[fk] = true;
    }
    return true;
  });
  save();
  if (removed) bus.renderSettings();
}

/* ---------- always-on push via ntfy.sh ---------- */
export function randTopic() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'enforcer-' + s;
}
function reminderOccurrences(r) {
  // returns array of Date objects for occurrences of r within the next 68h (future only)
  // 68h keeps a safety margin under ntfy.sh's 3-day X-Delay cap
  const out = [];
  const nowD = now();
  const [h, m] = r.time.split(':').map(Number);
  if (r.repeat === 'once') {
    const occ = parseKey(r.date); occ.setHours(h, m, 0, 0);
    if (occ > nowD && occ - nowD <= 68 * 3600000) out.push(occ);
    return out;
  }
  // daily: next 3 occurrences within 68h
  for (let i = 0; i < 4 && out.length < 3; i++) {
    const occ = parseKey(addDays(todayKey(), i)); occ.setHours(h, m, 0, 0);
    if (occ > nowD && occ - nowD <= 68 * 3600000) out.push(occ);
  }
  return out;
}
export async function syncNtfy() {
  if (!S.ntfyEnabled || !S.ntfyTopic) return;
  const nowMs = Date.now();
  // prune ledger entries whose occurrence is >3 days past
  for (const key of Object.keys(S.ntfyScheduled)) {
    const iso = key.split('|')[1];
    const occMs = new Date(iso).getTime();
    if (nowMs - occMs > 3 * 24 * 3600000) delete S.ntfyScheduled[key];
  }
  for (const r of S.reminders) {
    for (const occ of reminderOccurrences(r)) {
      const key = `${r.id}|${occ.toISOString()}`;
      if (S.ntfyScheduled[key]) continue;
      try {
        const resp = await fetch(`https://ntfy.sh/${S.ntfyTopic}`, {
          method: 'POST',
          body: r.text,
          headers: { 'X-Title': 'ENFORCER', 'X-Delay': String(Math.round(occ.getTime() / 1000)) },
        });
        if (resp.ok) S.ntfyScheduled[key] = true;
      } catch (e) { console.warn('ntfy sync failed', e); }
    }
  }
  save();
}

/* ---------- always-on push via Cloudflare Worker ---------- */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}
export async function syncCfPush() {
  if (!S.cfPushEnabled || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await fetch(`${CF_WORKER_URL}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), reminders: S.reminders }),
    });
  } catch (e) { console.warn('cf push sync failed', e); }
}
export async function enableCfPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) { toast('Push not supported here.'); return false; }
  if (Notification.permission !== 'granted') await requestNotifPermission();
  if (Notification.permission !== 'granted') return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });
    await fetch(`${CF_WORKER_URL}/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), reminders: S.reminders }),
    });
    return true;
  } catch (e) { console.warn('cf push subscribe failed', e); toast('Could not enable push.'); return false; }
}
export async function disableCfPush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) {
      const endpoint = sub.endpoint;
      await sub.unsubscribe();
      await fetch(`${CF_WORKER_URL}/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
    }
  } catch (e) { console.warn('cf push unsubscribe failed', e); }
}
