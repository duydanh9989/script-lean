import { scriptMatchesUrl } from './matcher.js';
import { getScript, getScripts, SCHEDULE_RUN_ATS } from './script-store.js';
import { executeImmediately } from './registry.js';

export const ALARM_PREFIX = 'injectjs-schedule:';

function alarmName(scriptId) {
  return `${ALARM_PREFIX}${scriptId}`;
}

export function nextDailyTimestamp(scheduleTime, now = Date.now()) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(scheduleTime || ''));
  if (!match) return null;
  const next = new Date(now);
  next.setHours(Number(match[1]), Number(match[2]), 0, 0);
  if (next.getTime() <= now) next.setDate(next.getDate() + 1);
  return next.getTime();
}

export function alarmSpecForScript(script, now = Date.now()) {
  if (script.runAt === 'scheduled') {
    const when = nextDailyTimestamp(script.scheduleTime, now);
    return when ? { when } : null;
  }
  if (script.runAt === 'interval') {
    const intervalSeconds = Math.max(30, Math.round(Number(script.intervalSeconds) || 30));
    const periodInMinutes = intervalSeconds / 60;
    return { delayInMinutes: periodInMinutes, periodInMinutes };
  }
  return null;
}

async function createScriptAlarm(script) {
  const spec = alarmSpecForScript(script);
  if (spec) await chrome.alarms.create(alarmName(script.id), spec);
}

export async function syncScheduledScripts() {
  const alarms = await chrome.alarms.getAll();
  await Promise.all(alarms.filter(alarm => alarm.name.startsWith(ALARM_PREFIX)).map(alarm => chrome.alarms.clear(alarm.name)));

  const scripts = await getScripts();
  const scheduled = Object.values(scripts).filter(script => script.enabled && SCHEDULE_RUN_ATS.includes(script.runAt));
  await Promise.all(scheduled.map(createScriptAlarm));
  return { scheduledCount: scheduled.length };
}

export async function runScheduledScript(scriptId) {
  const script = await getScript(scriptId);
  if (!script?.enabled || !SCHEDULE_RUN_ATS.includes(script.runAt)) return { executedTabs: 0 };
  // Daily alarms are one-shot. Schedule tomorrow before injection so a tab
  // failure cannot silently stop future runs.
  if (script.runAt === 'scheduled') await createScriptAlarm(script);

  const tabs = await chrome.tabs.query({});
  const matchingTabs = tabs.filter(tab => Number.isInteger(tab.id) && /^https?:/.test(tab.url || '') && scriptMatchesUrl(script, tab.url));
  const results = await Promise.allSettled(matchingTabs.map(tab => executeImmediately({
    tabId: tab.id,
    code: script.code,
    name: script.name,
    allFrames: script.allFrames,
    world: script.world
  })));

  const executedTabIds = results.flatMap((result, index) => result.status === 'fulfilled' ? [matchingTabs[index].id] : []);
  return {
    executedTabs: executedTabIds.length,
    failedTabs: results.filter(result => result.status === 'rejected').length,
    executedTabIds
  };
}

export async function handleScheduledAlarm(alarm) {
  if (!alarm?.name?.startsWith(ALARM_PREFIX)) return null;
  return runScheduledScript(alarm.name.slice(ALARM_PREFIX.length));
}
