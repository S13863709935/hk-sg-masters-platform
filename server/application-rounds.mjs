// Round data is optional. Never parse prose notes into inferred dates or midnight cutoffs.
export const roundLabels = {
  cutoff_ahead: 'Recorded cutoff ahead · verify availability',
  cutoff_reached: 'Recorded cutoff reached · check for updates'
};
const fields = new Set(['id', 'label', 'applicationOpen', 'deadline', 'deadlineAt']);
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function validApplicationRounds(rounds, offering) {
  if (rounds === undefined) return true;
  if (!Array.isArray(rounds) || !rounds.length || rounds.length > 20) return false;
  const ids = new Set();
  for (const r of rounds) {
    if (!r || typeof r !== 'object' || Object.keys(r).some(k => !fields.has(k)) || typeof r.id !== 'string' || !/^[A-Z][A-Z0-9-]{0,49}$/.test(r.id) || ids.has(r.id) || typeof r.label !== 'string' || !r.label.trim() || r.label.length > 100 || !date(r.deadline) || (r.applicationOpen !== null && (!date(r.applicationOpen) || r.applicationOpen > r.deadline))) return false;
    ids.add(r.id);
    if (r.deadlineAt !== null && (typeof r.deadlineAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:00\+08:00$/.test(r.deadlineAt) || r.deadlineAt.slice(0, 10) !== r.deadline || !Number.isFinite(Date.parse(r.deadlineAt)))) return false;
  }
  // Preserve the meaning of the existing final-deadline field and all old consumers.
  return offering.deadline === rounds.map(r => r.deadline).sort().at(-1);
}

export function compareRound(r, asOfDate, asOfInstant) {
  if (r.deadlineAt && asOfInstant && Date.parse(asOfInstant) >= Date.parse(r.deadlineAt)) return { state: 'cutoff_reached', reason: 'The recorded UTC+08 cutoff has been reached. Extensions, capacity and the live portal have not been checked.' };
  if (r.deadline < asOfDate) return { state: 'deadline_passed', reason: 'The recorded round deadline date is in the past; no extension or next round is inferred.' };
  if (r.applicationOpen && r.applicationOpen > asOfDate) return { state: 'not_yet_open', reason: 'Before this round’s recorded opening date. This does not verify future portal availability.' };
  if (r.deadline === asOfDate && (!r.deadlineAt || !asOfInstant)) return { state: 'deadline_today', reason: 'The round deadline is today. No intraday result is possible without both a recorded cutoff and comparison instant; do not assume midnight.' };
  if (r.applicationOpen) return { state: 'within_recorded_dates', reason: 'Within this round’s recorded dates and before any recorded cutoff. Availability and eligibility are not confirmed.' };
  return { state: 'cutoff_ahead', reason: 'Before the recorded round cutoff, but its opening date and current availability are unconfirmed.' };
}

export const nextRound = rounds => rounds.filter(r => ['cutoff_ahead', 'within_recorded_dates', 'not_yet_open', 'deadline_today'].includes(r.state)).sort((a, b) => a.deadline.localeCompare(b.deadline) || (a.deadlineAt && b.deadlineAt ? Date.parse(a.deadlineAt) - Date.parse(b.deadlineAt) : 0))[0] || null;
