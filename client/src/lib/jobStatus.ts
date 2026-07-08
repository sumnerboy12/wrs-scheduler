import type { JobStatus } from '../types';

const STATUS_ALIASES: Record<JobStatus, string[]> = {
  pipeline: ['pipeline', 'lead', 'prospect', 'quoting', 'new'],
  quoted: ['quoted', 'quote', 'proposal', 'proposed'],
  confirmed: ['confirmed', 'won', 'accepted', 'approved', 'booked'],
  in_progress: ['inprogress', 'active', 'ongoing', 'started', 'underway'],
  on_hold: ['onhold', 'hold', 'paused', 'delayed'],
  complete: ['complete', 'completed', 'done', 'finished'],
  lost: ['lost', 'declined', 'cancelled', 'canceled', 'dead'],
};

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Best-effort match of a free-text status value (however the spreadsheet
// happened to spell it) to one of our fixed statuses. Falls back to
// 'pipeline' with matched=false so the caller can flag it for review.
export function matchJobStatus(raw: string): { status: JobStatus; matched: boolean } {
  const norm = normalize(raw);
  if (!norm) return { status: 'pipeline', matched: false };
  for (const [status, aliases] of Object.entries(STATUS_ALIASES) as [JobStatus, string[]][]) {
    if (aliases.some((a) => normalize(a) === norm)) return { status, matched: true };
  }
  return { status: 'pipeline', matched: false };
}
