import {
  buildWeeklySummaries,
  formatSummaryEmail,
  getTemplate,
  getAutoSendConfig,
  getAutoSendLastSentRange,
  setAutoSendLastSentRange,
  nextWeekRange,
} from './weeklySummary.js';
import {
  buildJobCrewSummaries,
  formatJobSummaryEmail,
  getJobTemplate,
  getJobAutoSendConfig,
  getJobAutoSendLastSentRange,
  setJobAutoSendLastSentRange,
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
  // leave or training still wants that email — unless the leave covers the
  // *entire* range, in which case there's truly nothing to report either
  // way (they're out the whole period) and the email is just noise.
  const summaries = buildWeeklySummaries(start, end, includeWeekends).filter(
    (s) =>
      (s.items.length > 0 || s.leave.length > 0 || s.nonBillable.length > 0) &&
      !s.onLeaveFullPeriod &&
      s.employee.email
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
// only once, since the caller marks the *target range* as sent (via
// setAutoSendLastSentRange) before the async send even starts, so an
// overlapping tick or a slow send can't trigger a second batch for the
// same range. Comparing the exact range rather than "which calendar week
// this is" also means an admin's manual "mark as sent" for that same
// upcoming range (see routes/summaries.js) suppresses this exactly the
// same way — one shared notion of "already sent" for both paths.
function shouldFireNow(config, lastSentRange, targetRange, now) {
  if (!config.enabled) return false;
  if (lastSentRange && lastSentRange.start === targetRange.start && lastSentRange.end === targetRange.end) {
    return false;
  }

  const [hour, minute] = config.time.split(':').map(Number);
  const scheduledMinutes = hour * 60 + minute;
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return now.getDay() === config.dayOfWeek && nowMinutes >= scheduledMinutes;
}

function tick() {
  if (!isMailConfigured()) return;
  const now = new Date();
  // Both auto-sends target the same upcoming week, so one shared range.
  const targetRange = nextWeekRange();

  const config = getAutoSendConfig();
  if (shouldFireNow(config, getAutoSendLastSentRange(), targetRange, now)) {
    setAutoSendLastSentRange(targetRange.start, targetRange.end);
    sendAutoSummaries(config.includeWeekends).catch((e) => console.error('[summary auto-send] run failed:', e));
  }

  const jobConfig = getJobAutoSendConfig();
  if (shouldFireNow(jobConfig, getJobAutoSendLastSentRange(), targetRange, now)) {
    setJobAutoSendLastSentRange(targetRange.start, targetRange.end);
    sendAutoJobSummaries(jobConfig.includeWeekends).catch((e) => console.error('[job summary auto-send] run failed:', e));
  }
}

export function startSummaryScheduler() {
  setInterval(tick, CHECK_INTERVAL_MS);
}
