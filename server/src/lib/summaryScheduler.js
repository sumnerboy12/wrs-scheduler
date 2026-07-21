import {
  buildWeeklySummaries,
  formatSummaryEmail,
  getTemplate,
  getAutoSendConfig,
  getAutoSendLastRunWeek,
  setAutoSendLastRunWeek,
  nextWeekRange,
  currentWeekKey,
} from './weeklySummary.js';
import { sendMail, isMailConfigured } from './mailer.js';

const CHECK_INTERVAL_MS = 60_000;

async function sendAutoSummaries(includeWeekends) {
  const template = getTemplate();
  const { start, end } = nextWeekRange();
  // Only employees with something to say, same default as the manual
  // Summaries screen pre-checks — nobody wants a weekly "nothing scheduled"
  // email if that's genuinely all it would ever say.
  const summaries = buildWeeklySummaries(start, end).filter((s) => s.items.length > 0 && s.employee.email);

  for (const { employee, items } of summaries) {
    try {
      const { subject, text, html } = formatSummaryEmail(employee, items, start, end, template, includeWeekends);
      await sendMail({ to: employee.email, subject, text, html });
    } catch (e) {
      console.error(`[summary auto-send] failed to email ${employee.name}:`, e.message);
    }
  }
  console.log(`[summary auto-send] sent ${summaries.length} weekly summaries for ${start} – ${end}`);
}

function tick() {
  const config = getAutoSendConfig();
  if (!config.enabled || !isMailConfigured()) return;

  const now = new Date();
  const thisWeek = currentWeekKey(now);
  if (getAutoSendLastRunWeek() === thisWeek) return; // already sent this week's batch

  const [hour, minute] = config.time.split(':').map(Number);
  const scheduledMinutes = hour * 60 + minute;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  if (now.getDay() === config.dayOfWeek && nowMinutes >= scheduledMinutes) {
    // Mark the week as done before sending (not after) so an overlapping
    // tick — or a slow send — can't trigger a second batch for the same week.
    setAutoSendLastRunWeek(thisWeek);
    sendAutoSummaries(config.includeWeekends).catch((e) => console.error('[summary auto-send] run failed:', e));
  }
}

export function startSummaryScheduler() {
  setInterval(tick, CHECK_INTERVAL_MS);
}
