import type { Assignment, Employee, Job, JobWithPhases, Phase, TimelinePayload } from '../types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getTimeline: () => request<TimelinePayload>('/timeline'),

  getEmployees: () => request<Employee[]>('/employees'),
  createEmployee: (data: Partial<Employee>) =>
    request<Employee>('/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id: number, data: Partial<Employee>) =>
    request<Employee>(`/employees/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEmployee: (id: number) => request<void>(`/employees/${id}`, { method: 'DELETE' }),

  getJobs: () => request<Job[]>('/jobs'),
  getJob: (id: number) => request<JobWithPhases>(`/jobs/${id}`),
  createJob: (data: Partial<Job>) => request<Job>('/jobs', { method: 'POST', body: JSON.stringify(data) }),
  updateJob: (id: number, data: Partial<Job>) =>
    request<Job>(`/jobs/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteJob: (id: number) => request<void>(`/jobs/${id}`, { method: 'DELETE' }),

  createPhase: (jobId: number, data: Partial<Phase>) =>
    request<Phase>(`/jobs/${jobId}/phases`, { method: 'POST', body: JSON.stringify(data) }),
  updatePhase: (id: number, data: Partial<Phase>) =>
    request<Phase>(`/phases/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deletePhase: (id: number) => request<void>(`/phases/${id}`, { method: 'DELETE' }),

  createAssignment: (data: Partial<Assignment>) =>
    request<Assignment>('/assignments', { method: 'POST', body: JSON.stringify(data) }),
  updateAssignment: (id: number, data: Partial<Assignment>) =>
    request<Assignment>(`/assignments/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAssignment: (id: number) => request<void>(`/assignments/${id}`, { method: 'DELETE' }),
};
