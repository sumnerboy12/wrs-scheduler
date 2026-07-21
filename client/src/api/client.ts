import type {
  Assignment,
  AuthUser,
  AutoSendConfig,
  Client,
  Employee,
  Job,
  JobWithPhases,
  ManagedUser,
  Phase,
  SendSummariesResult,
  SummariesPayload,
  SummaryPreview,
  SummaryTemplate,
  TimelinePayload,
  UserRole,
} from '../types';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const err = new Error(body.error || `Request failed: ${res.status}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  getTimeline: () => request<TimelinePayload>('/timeline'),

  login: (username: string, password: string) =>
    request<AuthUser>('/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<void>('/auth/logout', { method: 'POST' }),
  getMe: () => request<AuthUser>('/auth/me'),
  changePassword: (current_password: string, new_password: string) =>
    request<void>('/auth/change-password', { method: 'POST', body: JSON.stringify({ current_password, new_password }) }),

  getUsers: () => request<ManagedUser[]>('/users'),
  createUser: (data: { username: string; password: string; role: UserRole }) =>
    request<ManagedUser>('/users', { method: 'POST', body: JSON.stringify(data) }),
  updateUser: (id: number, data: Partial<{ role: UserRole; active: boolean }>) =>
    request<ManagedUser>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  resetUserPassword: (id: number, password: string) =>
    request<void>(`/users/${id}/reset-password`, { method: 'POST', body: JSON.stringify({ password }) }),
  deleteUser: (id: number) => request<void>(`/users/${id}`, { method: 'DELETE' }),

  getClients: () => request<Client[]>('/clients'),
  createClient: (data: Partial<Client>) => request<Client>('/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id: number, data: Partial<Client>) =>
    request<Client>(`/clients/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteClient: (id: number) => request<void>(`/clients/${id}`, { method: 'DELETE' }),

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

  getSummaries: (start: string, end: string) =>
    request<SummariesPayload>(`/summaries?start=${start}&end=${end}`),
  sendSummaries: (start: string, end: string, employeeIds: number[], includeWeekends: boolean) =>
    request<{ results: SendSummariesResult[] }>('/summaries/send', {
      method: 'POST',
      body: JSON.stringify({ start, end, employeeIds, includeWeekends }),
    }),
  getSummaryTemplate: () => request<SummaryTemplate>('/summaries/template'),
  updateSummaryTemplate: (data: SummaryTemplate) =>
    request<SummaryTemplate>('/summaries/template', { method: 'PUT', body: JSON.stringify(data) }),
  previewSummary: (employeeId: number, start: string, end: string, includeWeekends: boolean) =>
    request<SummaryPreview>(
      `/summaries/preview?employeeId=${employeeId}&start=${start}&end=${end}&includeWeekends=${includeWeekends}`
    ),
  getAutoSendConfig: () => request<AutoSendConfig>('/summaries/auto-send'),
  updateAutoSendConfig: (data: AutoSendConfig) =>
    request<AutoSendConfig>('/summaries/auto-send', { method: 'PUT', body: JSON.stringify(data) }),
};
