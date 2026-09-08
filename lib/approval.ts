/**
 * Director approval, modeled on top of the append-only progress history.
 *
 * The API has no approval field, so the Project Director's decisions are
 * recorded as ordinary progress updates whose `remarks` start with a marker
 * tag. The task's review state is then *derived* from the newest entry:
 *
 *  - newest entry is an APPROVE action   → approved
 *  - newest entry is a RETURN action     → returned (needs rework)
 *  - newest entry is a plain report      → pending (awaiting the director)
 *  - no entries                          → none
 *
 * A new contractor report (plain entry) always supersedes an older approval,
 * which naturally moves the task back to "pending".
 */
import type { ProgressUpdate } from '@/lib/api';

export const APPROVE_TAG = '[БАТЛАВ]';
export const RETURN_TAG = '[БУЦААВ]';

export type ReviewState = 'none' | 'pending' | 'approved' | 'returned';

export function approvalActionOf(remarks?: string | null): 'approved' | 'returned' | null {
  if (!remarks) return null;
  if (remarks.startsWith(APPROVE_TAG)) return 'approved';
  if (remarks.startsWith(RETURN_TAG)) return 'returned';
  return null;
}

/** Whether a progress entry is a director action rather than a contractor report. */
export function isDirectorAction(entry: ProgressUpdate): boolean {
  return approvalActionOf(entry.remarks) !== null;
}

/** Remove the marker tag, returning just the human note. */
export function stripTag(remarks?: string | null): string {
  if (!remarks) return '';
  return remarks.replace(APPROVE_TAG, '').replace(RETURN_TAG, '').trim();
}

export interface Review {
  state: ReviewState;
  /** Latest reported percentage (newest entry, report or approval mirror). */
  percentage: number | null;
  lastAt?: string;
  lastNote?: string;
  /** Number of plain contractor reports (excludes director actions). */
  reportCount: number;
}

/** Derive a task's review state from its progress history (newest-first). */
export function deriveReview(progress: ProgressUpdate[]): Review {
  if (!progress.length) {
    return { state: 'none', percentage: null, reportCount: 0 };
  }
  const newest = progress[0];
  const action = approvalActionOf(newest.remarks);
  const state: ReviewState = action ?? 'pending';
  const reportCount = progress.filter((p) => !isDirectorAction(p)).length;
  return {
    state,
    percentage: newest.progressPercentage,
    lastAt: newest.recordedAt ?? newest.createdAt,
    lastNote: stripTag(newest.remarks),
    reportCount,
  };
}

/** Build the tagged remarks string a director submits when acting on a task. */
export function buildActionRemarks(action: 'approved' | 'returned', note?: string): string {
  const tag = action === 'approved' ? APPROVE_TAG : RETURN_TAG;
  return note?.trim() ? `${tag} ${note.trim()}` : tag;
}
