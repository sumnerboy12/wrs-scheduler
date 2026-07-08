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

export interface Job {
  id: number;
  code: string | null;
  name: string;
  client_name: string | null;
  address: string | null;
  status: JobStatus;
  probability: number | null;
  color: string;
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
}

export interface AuthUser {
  id: number;
  username: string;
  is_admin: boolean;
  must_change_password: boolean;
}

export interface ManagedUser {
  id: number;
  username: string;
  is_admin: boolean;
  active: boolean;
  must_change_password: boolean;
  created_at: string;
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
