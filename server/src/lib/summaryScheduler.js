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
import {
  buildJobCrewSummaries,
  formatJobSummaryEmail,
  getJobTemplate,
  getJobAutoSendConfig,
  getJobAutoSendLastRunWeek,
  setJobAutoSendLastRunWeek,
} from './jobSummary.js';
import { sendMail, isMailConfigured } from './mailer.js';

const CHECK_INTERVAL_MS = 60_000;

async function sendAutoSummaries(includeWeekends) {
  const template = getTemplate();
  const { start, end } = nextWeekRange();
  // Only employees with something to say, same default as the manual
  // Summaries screen pre-checks — nobody wants a weekly "nothing scheduled"
  // email if that's genuinely all it would ever say. Leave or non-billable
  // time alone still counts — someone with no job bookings but a week of
  // leave or training still wants that email.
  const summaries = buildWeeklySummaries(start, end).filter(
    (s) => (s.items.length > 0 || s.leave.length > 0 || s.nonBillable.length > 0) && s.employee.email
  );

  for (const { employee, items, leave, nonBillable } of summaries) {
    try {
      const { subject, text, html } = formatSummaryEmail(
        employee,
        items,
        leave,
        nonBillable,
        start,
        end,
        template,
        includeWeekends
      );
      await sendMail({ to: employee.email, subject, text, html });
    } catch (e) {
      console.error(`[summary auto-send] failed to email ${employee.name}:`, e.message);
    }
  }
  console.log(`[summary auto-send] sent ${summaries.length} weekly summaries for ${start} – ${end}`);
}

async function sendAutoJobSummaries(includeWeekends) {
  const template = getJobTemplate();
  const { start, end } = nextWeekRange();
  // Only jobs with an actual crew booked and a reachable supervisor — same
  // "nothing to say" skip as the employee auto-send above.
  const summaries = buildJobCrewSummaries(start, end).filter((s) => s.items.length > 0 && s.job.supervisor_email);

  for (const { job, items } of summaries) {
    try {
      const { subject, text, html } = formatJobSummaryEmail(job, items, start, end, template, includeWeekends);
      await sendMail({ to: job.supervisor_email, subject, text, html });
    } catch (e) {
      console.error(`[job summary auto-send] failed to email ${job.supervisor_name} for ${job.name}:`, e.message);
    }
  }
  console.log(`[job summary auto-send] sent ${summaries.length} crew summaries for ${start} – ${end}`);
}

// True once a week, the first tick at/after the configured day+time — and
// only once, since the caller marks the week as done (via setLastRunWeek)
// before the async send even starts, so an overlapping tick or a slow send
// can't trigger a second batch for the same week.
function shouldFireNow(config, lastRunWeek, now) {
  if (!config.enabled) return false;
  if (lastRunWeek === currentWeekKey(now)) return false;

  const [hour, minute] = config.time.split(':').map(Number);
  const scheduledMinutes = hour * 60 + minute;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return now.getDay() === config.dayOfWeek && nowMinutes >= scheduledMinutes;
}

function tick() {
  if (!isMailConfigured()) return;
  const now = new Date();

  const config = getAutoSendConfig();
  if (shouldFireNow(config, getAutoSendLastRunWeek(), now)) {
    setAutoSendLastRunWeek(currentWeekKey(now));
    sendAutoSummaries(config.includeWeekends).catch((e) => console.error('[summary auto-send] run failed:', e));
  }

  const jobConfig = getJobAutoSendConfig();
  if (shouldFireNow(jobConfig, getJobAutoSendLastRunWeek(), now)) {
    setJobAutoSendLastRunWeek(currentWeekKey(now));
    sendAutoJobSummaries(jobConfig.includeWeekends).catch((e) => console.error('[job summary auto-send] run failed:', e));
  }
}

export function startSummaryScheduler() {
  setInterval(tick, CHECK_INTERVAL_MS);
}
