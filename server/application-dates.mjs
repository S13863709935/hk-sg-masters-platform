import { hasResolvedRoute } from './routes.mjs';
import { hasApplicantDateEvidence } from './applicants.mjs';

const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' });
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const identifiedYear = value => typeof value === 'string' && /^(?:(?:January|February|March|April|May|June|July|August|September|October|November|December) )?20\d{2}(?:\/(?:\d{2}|20\d{2}))?(?: (?:intake|entry))?$/.test(value);
export const applicationDate = (now = new Date()) => formatter.format(now);
export const applicationLabels = {
  not_yet_open: 'Before the recorded opening date',
  within_recorded_dates: 'Within recorded dates · verify availability',
  deadline_today: 'Recorded deadline is today · verify cutoff time',
  deadline_passed: 'Recorded deadline has passed',
  dates_incomplete: 'Application dates need confirmation',
  invalid_dates: 'Recorded dates need reconciliation',
  mixed: 'Mixed dates · review each study option / intake',
  route_required: 'Choose a specific route before checking dates',
  applicant_required: 'Choose an applicant category before comparing these dates',
  unverified: 'Application dates are not source-checked',
  excluded: 'Not a direct-entry taught master’s option'
};

function offeringDate(programme, offering, asOfDate) {
  const start = offering.applicationOpen || null;
  const end = offering.deadline || null;
  const categoryEvidence = hasApplicantDateEvidence(offering) ? offering.applicantDateEvidence : null;
  const sourceUrl = categoryEvidence?.sourceUrl || programme.fieldStatus?.deadline?.sourceUrl || programme.officialUrl;
  const sourceCheckedOn = categoryEvidence?.checkedOn || programme.sources?.find(s => s.url === sourceUrl)?.checkedOn || programme.lastChecked || null;
  const result = (state, reason) => ({ offeringId: offering.id, mode: offering.mode || null, intake: offering.intake || null, academicYear: offering.academicYear || programme.academicYear || null, openingDate: start, deadline: end, state, label: applicationLabels[state], reason, sourceUrl, sourceCheckedOn });
  if (programme.scope?.status === 'out_of_scope' || programme.admissionRoute === 'transfer_only') return result('excluded', 'A scope or transfer-only exclusion is not an academic-background failure.');
  if (programme.directoryListing?.variants.length && !hasResolvedRoute(programme)) return result('route_required', 'A grouped directory entry cannot establish the dates of every direction.');
  if (!['programme_page_checked', 'peer_reviewed'].includes(programme.verification) || programme.admissionRoute !== 'direct') return result('unverified', 'A catalogue lead or unconfirmed admission route is not evidence of an application window.');
  if (offering.applicantCategoryRequired) return result('applicant_required', 'Choose a study option and a university-specific category. The platform does not determine applicant status.');
  if ((start && !validDate(start)) || (end && !validDate(end)) || (start && end && start > end)) return result('invalid_dates', 'The stored date values or their order need correction; no availability conclusion is made.');
  if (!identifiedYear(offering.academicYear || programme.academicYear)) return result('dates_incomplete', 'The applicable intake year is not identified. Recurring months are not dated application windows.');
  if (!categoryEvidence && programme.fieldStatus?.deadline && programme.fieldStatus.deadline.status !== 'known') return result('dates_incomplete', 'The stored date-coverage flag is unresolved; individual date values do not override that evidence gap.');
  if (end && end < asOfDate) return result('deadline_passed', 'The recorded date is in the past. Check the university for extensions or another intake; this is not an academic gap.');
  if (start && start > asOfDate) return result('not_yet_open', 'The recorded opening date is in the future. This does not verify future portal availability.');
  if (end === asOfDate) return result('deadline_today', 'The calendar date matches the recorded deadline. Exact cutoff time and applicant-category rules still need confirmation.');
  if (start && end) return result('within_recorded_dates', 'Today falls between the recorded dates. Rolling closure, capacity, eligibility, extensions and the live portal are not verified.');
  return result('dates_incomplete', end ? 'A future deadline alone does not establish that applications have opened.' : start ? 'An opening date without a closing date does not establish a current application window.' : 'No complete dated window is recorded. Notes or recurring dates are not converted into inferred years.');
}

export function programmeTimeline(programme, asOfDate = applicationDate()) {
  if (!validDate(asOfDate)) throw new TypeError('A valid comparison date is required');
  const offerings = programme.offerings.map(o => offeringDate(programme, o, asOfDate));
  const states = [...new Set(offerings.map(o => o.state))];
  const state = states.length > 1 ? 'mixed' : states[0] || 'dates_incomplete';
  return { asOfDate, timeZone: 'Asia/Singapore', state, label: applicationLabels[state], livePortalChecked: false, offerings, disclaimer: 'Date comparison only, not a live application-portal check or an assessment of admission eligibility. Source-check dates are unchanged.' };
}
