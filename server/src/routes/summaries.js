import { Router } from 'express';
import { requireWrite } from '../middleware/auth.js';
import {
  buildWeeklySummaries,
  formatSummaryEmail,
  getTemplate,
  saveTemplate,
  getAutoSendConfig,
  saveAutoSendConfig,
} from '../lib/weeklySummary.js';
import {
  buildJobCrewSummaries,
  formatJobSummaryEmail,
  getJobTemplate,
  saveJobTemplate,
  getJobAutoSendConfig,
  saveJobAutoSendConfig,
} from '../lib/jobSummary.js';
import { sendMail, isMailConfigured } from '../lib/mailer.js';

const router = Router();

router.get('/', (req, res) => {
  const { start, end, includeWeekends } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });

  const summaries = buildWeeklySummaries(start, end, includeWeekends === 'true');
  res.json({
    mailConfigured: isMailConfigured(),
    employees: summaries.map(({ employee, items, leave, nonBillable, onLeaveFullPeriod }) => ({
      id: employee.id,
      name: employee.name,
      email: employee.email,
      items: items.map((i) => ({
        job_name: i.job_name,
        job_code: i.job_code,
        phase_name: i.phase_name,
        start_date: i.start_date,
        end_date: i.end_date,
        allocation_pct: i.allocation_pct,
      })),
      leave: leave.map((l) => ({ type: l.type, start_date: l.start_date, end_date: l.end_date })),
      nonBillable: nonBillable.map((n) => ({
        category: n.category,
        start_date: n.start_date,
        end_date: n.end_date,
        allocation_pct: n.allocation_pct,
      })),
      on_leave_full_period: onLeaveFullPeriod,
    })),
  });
});

router.get('/template', (req, res) => {
  res.json(getTemplate());
});

router.put('/template', requireWrite, (req, res) => {
  const { subject, body } = req.body;
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'subject is required' });
  if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });
  res.json(saveTemplate({ subject, body }));
});

router.get('/auto-send', (req, res) => {
  res.json(getAutoSendConfig());
});

router.put('/auto-send', requireWrite, (req, res) => {
  const { enabled, dayOfWeek, time, includeWeekends } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled is required' });
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return res.status(400).json({ error: 'dayOfWeek must be an integer 0–6' });
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return res.status(400).json({ error: 'time must be HH:MM' });
  res.json(saveAutoSendConfig({ enabled, dayOfWeek, time, includeWeekends: Boolean(includeWeekends) }));
});

router.get('/preview', (req, res) => {
  const { start, end, employeeId, includeWeekends } = req.query;
  if (!start || !end || !employeeId) return res.status(400).json({ error: 'start, end and employeeId are required' });

  const summary = buildWeeklySummaries(start, end, includeWeekends === 'true').find(
    (s) => s.employee.id === Number(employeeId)
  );
  if (!summary) return res.status(404).json({ error: 'employee not found' });

  res.json(
    formatSummaryEmail(
      summary.employee,
      summary.items,
      summary.leave,
      summary.nonBillable,
      start,
      end,
      undefined,
      includeWeekends === 'true'
    )
  );
});

router.post('/send', requireWrite, async (req, res) => {
  const { start, end, employeeIds, includeWeekends } = req.body;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });
  if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
    return res.status(400).json({ error: 'employeeIds is required' });
  }

  if (!isMailConfigured()) {
    return res.status(503).json({ error: 'Email is not configured on this server (see server/.env.example)' });
  }

  const template = getTemplate();
  const summaries = buildWeeklySummaries(start, end, Boolean(includeWeekends)).filter((s) =>
    employeeIds.includes(s.employee.id)
  );

  const results = [];
  for (const { employee, items, leave, nonBillable } of summaries) {
    if (!employee.email) {
      results.push({ employee_id: employee.id, name: employee.name, status: 'skipped', reason: 'no email on file' });
      continue;
    }
    try {
      const { subject, text, html } = formatSummaryEmail(
        employee,
        items,
        leave,
        nonBillable,
        start,
        end,
        template,
        Boolean(includeWeekends)
      );
      await sendMail({ to: employee.email, subject, text, html });
      results.push({ employee_id: employee.id, name: employee.name, status: 'sent' });
    } catch (e) {
      results.push({ employee_id: employee.id, name: employee.name, status: 'failed', reason: e.message });
    }
  }

  res.json({ results });
});

// --- Job supervisor crew summaries ---

router.get('/jobs', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });

  const summaries = buildJobCrewSummaries(start, end);
  res.json({
    mailConfigured: isMailConfigured(),
    jobs: summaries.map(({ job, items }) => ({
      id: job.id,
      name: job.name,
      code: job.code,
      supervisor_id: job.supervisor_id,
      supervisor_name: job.supervisor_name,
      supervisor_email: job.supervisor_email,
      items: items.map((i) => ({
        phase_name: i.phase_name,
        employee_name: i.employee_name,
        start_date: i.start_date,
        end_date: i.end_date,
        allocation_pct: i.allocation_pct,
      })),
    })),
  });
});

router.get('/jobs/template', (req, res) => {
  res.json(getJobTemplate());
});

router.put('/jobs/template', requireWrite, (req, res) => {
  const { subject, body } = req.body;
  if (!subject || !subject.trim()) return res.status(400).json({ error: 'subject is required' });
  if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });
  res.json(saveJobTemplate({ subject, body }));
});

router.get('/jobs/auto-send', (req, res) => {
  res.json(getJobAutoSendConfig());
});

router.put('/jobs/auto-send', requireWrite, (req, res) => {
  const { enabled, dayOfWeek, time, includeWeekends } = req.body;
  if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled is required' });
  if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
    return res.status(400).json({ error: 'dayOfWeek must be an integer 0–6' });
  }
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) return res.status(400).json({ error: 'time must be HH:MM' });
  res.json(saveJobAutoSendConfig({ enabled, dayOfWeek, time, includeWeekends: Boolean(includeWeekends) }));
});

router.get('/jobs/preview', (req, res) => {
  const { start, end, jobId, includeWeekends } = req.query;
  if (!start || !end || !jobId) return res.status(400).json({ error: 'start, end and jobId are required' });

  const summary = buildJobCrewSummaries(start, end).find((s) => s.job.id === Number(jobId));
  if (!summary) return res.status(404).json({ error: 'job not found' });

  res.json(formatJobSummaryEmail(summary.job, summary.items, start, end, undefined, includeWeekends === 'true'));
});

router.post('/jobs/send', requireWrite, async (req, res) => {
  const { start, end, jobIds, includeWeekends } = req.body;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });
  if (!Array.isArray(jobIds) || jobIds.length === 0) {
    return res.status(400).json({ error: 'jobIds is required' });
  }

  if (!isMailConfigured()) {
    return res.status(503).json({ error: 'Email is not configured on this server (see server/.env.example)' });
  }

  const template = getJobTemplate();
  const summaries = buildJobCrewSummaries(start, end).filter((s) => jobIds.includes(s.job.id));

  const results = [];
  for (const { job, items } of summaries) {
    if (!job.supervisor_email) {
      results.push({ job_id: job.id, name: job.name, status: 'skipped', reason: 'supervisor has no email on file' });
      continue;
    }
    try {
      const { subject, text, html } = formatJobSummaryEmail(job, items, start, end, template, Boolean(includeWeekends));
      await sendMail({ to: job.supervisor_email, subject, text, html });
      results.push({ job_id: job.id, name: job.name, status: 'sent' });
    } catch (e) {
      results.push({ job_id: job.id, name: job.name, status: 'failed', reason: e.message });
    }
  }

  res.json({ results });
});

export default router;
