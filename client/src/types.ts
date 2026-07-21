export type JobStatus =
  | 'pipeline'
  | 'quoted'
  | 'confirmed'
  | 'in_progress'
  | 'on_hold'
  | 'complete'
  | 'lost';

export interface Employee {
  id: number;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  color: string;
  active: 0 | 1;
  notes: string | null;
}

export interface Client {
  id: number;
  name: string;
  color: string;
  notes: string | null;
}

export interface Job {
  id: number;
  code: string | null;
  name: string;
  client_id: number | null;
  address: string | null;
  status: JobStatus;
  probability: number | null;
  supervisor_id: number | null;
  notes: string | null;
}

export interface JobWithPhases extends Job {
  phases: Phase[];
}

export interface Phase {
  id: number;
  job_id: number;
  name: string;
  sequence: number;
  start_date: string;
  end_date: string;
  estimated_staff: number | null;
  notes: string | null;
}

export interface Assignment {
  id: number;
  phase_id: number;
  employee_id: number;
  start_date: string;
  end_date: string;
  allocation_pct: number;
  notes: string | null;
  conflict?: boolean;
  // present on the /api/timeline combined payload
  job_id?: number;
  phase_name?: string;
  phase_start?: string;
  phase_end?: string;
}

export interface TimelinePayload {
  employees: Employee[];
  jobs: Job[];
  phases: Phase[];
  assignments: Assignment[];
  clients: Client[];
}

export type UserRole = 'admin' | 'editor' | 'readonly';

export interface AuthUser {
  id: number;
  username: string;
  role: UserRole;
  must_change_password: boolean;
}

export interface ManagedUser {
  id: number;
  username: string;
  role: UserRole;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
}

export interface SummaryItem {
  job_name: string;
  job_code: string | null;
  phase_name: string;
  start_date: string;
  end_date: string;
  allocation_pct: number;
}

export interface EmployeeSummary {
  id: number;
  name: string;
  email: string | null;
  items: SummaryItem[];
}

export interface SummariesPayload {
  mailConfigured: boolean;
  employees: EmployeeSummary[];
}

export interface SendSummariesResult {
  employee_id: number;
  name: string;
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
}

export interface SummaryTemplate {
  subject: string;
  body: string;
}

export interface SummaryPreview {
  subject: string;
  text: string;
  html: string;
}

export interface AutoSendConfig {
  enabled: boolean;
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday, matches Date#getDay()
  time: string; // 24-hour "HH:MM"
  includeWeekends: boolean;
}

export interface JobCrewItem {
  phase_name: string;
  employee_name: string;
  start_date: string;
  end_date: string;
  allocation_pct: number;
}

export interface JobSummary {
  id: number;
  name: string;
  code: string | null;
  supervisor_id: number | null;
  supervisor_name: string | null;
  supervisor_email: string | null;
  items: JobCrewItem[];
}

export interface JobSummariesPayload {
  mailConfigured: boolean;
  jobs: JobSummary[];
}

export interface SendJobSummariesResult {
  job_id: number;
  name: string;
  status: 'sent' | 'skipped' | 'failed';
  reason?: string;
}

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  pipeline: 'Pipeline',
  quoted: 'Quoted',
  confirmed: 'Confirmed',
  in_progress: 'In Progress',
  on_hold: 'On Hold',
  complete: 'Complete',
  lost: 'Lost',
};
