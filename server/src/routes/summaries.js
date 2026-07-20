import { Router } from 'express';
import { requireWrite } from '../middleware/auth.js';
import { buildWeeklySummaries, formatSummaryEmail, getTemplate, saveTemplate } from '../lib/weeklySummary.js';
import { sendMail, isMailConfigured } from '../lib/mailer.js';

const router = Router();

router.get('/', (req, res) => {
  const { start, end } = req.query;
  if (!start || !end) return res.status(400).json({ error: 'start and end are required' });

  const summaries = buildWeeklySummaries(start, end);
  res.json({
    mailConfigured: isMailConfigured(),
    employees: summaries.map(({ employee, items }) => ({
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

router.get('/preview', (req, res) => {
  const { start, end, employeeId, includeWeekends } = req.query;
  if (!start || !end || !employeeId) return res.status(400).json({ error: 'start, end and employeeId are required' });

  const summary = buildWeeklySummaries(start, end).find((s) => s.employee.id === Number(employeeId));
  if (!summary) return res.status(404).json({ error: 'employee not found' });

  res.json(formatSummaryEmail(summary.employee, summary.items, start, end, undefined, includeWeekends === 'true'));
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
  const summaries = buildWeeklySummaries(start, end).filter((s) => employeeIds.includes(s.employee.id));

  const results = [];
  for (const { employee, items } of summaries) {
    if (!employee.email) {
      results.push({ employee_id: employee.id, name: employee.name, status: 'skipped', reason: 'no email on file' });
      continue;
    }
    try {
      const { subject, text } = formatSummaryEmail(employee, items, start, end, template, Boolean(includeWeekends));
      await sendMail({ to: employee.email, subject, text });
      results.push({ employee_id: employee.id, name: employee.name, status: 'sent' });
    } catch (e) {
      results.push({ employee_id: employee.id, name: employee.name, status: 'failed', reason: e.message });
    }
  }

  res.json({ results });
});

export default router;
