// Only explicit choice IDs and a save timestamp belong in this storage format.
const fields = new Set(['programmeId', 'routeId', 'offeringId', 'applicantId', 'savedAt']);
const id = value => typeof value === 'string' && value.length <= 100 && /^(HK|SG)-[A-Z]+-P\d{3,}$/.test(value);
const choice = (value, prefix) => value === null || (typeof value === 'string' && value.length <= 200 && /^[A-Z0-9-]+$/.test(value) && value.startsWith(prefix));

export function parseSavedOption(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !fields.has(k)) || !id(input.programmeId)) return null;
  const { programmeId } = input;
  const routeId = input.routeId ?? null, offeringId = input.offeringId ?? null, applicantId = input.applicantId ?? null;
  if (!choice(routeId, `${programmeId}-ROUTE-`) || !choice(offeringId, `${programmeId}-`) || !choice(applicantId, `${offeringId}-`) || (applicantId && !offeringId)) return null;
  if (input.savedAt !== undefined && (typeof input.savedAt !== 'string' || !Number.isFinite(Date.parse(input.savedAt)) || new Date(input.savedAt).toISOString() !== input.savedAt)) return null;
  return { programmeId, routeId, offeringId, applicantId, ...(input.savedAt ? { savedAt: input.savedAt } : {}) };
}

export function normalizeSavedOptions(value, attachedIds) {
  const entries = Object.create(null);
  if (value === null || value === undefined) return { entries, rejected: 0 };
  if (value?.schemaVersion !== 1 || !Array.isArray(value.items)) return { entries, rejected: 1 };
  const attached = new Set(attachedIds);
  let rejected = Math.max(0, value.items.length - 500);
  for (const item of value.items.slice(0, 500)) {
    const parsed = parseSavedOption(item);
    if (!parsed || !attached.has(parsed.programmeId) || entries[parsed.programmeId]) { rejected++; continue; }
    entries[parsed.programmeId] = parsed;
  }
  return { entries, rejected };
}

export const optionSnapshot = (p, now = new Date().toISOString()) => ({ programmeId: p.id, routeId: p.selectedRoute?.id || null, offeringId: p.selectedOffering?.id || null, applicantId: p.selectedApplicant?.id || null, savedAt: now });
export const sameOptions = (p, saved) => !!saved && saved.programmeId === p.id && (saved.routeId || null) === (p.selectedRoute?.id || null) && (saved.offeringId || null) === (p.selectedOffering?.id || null) && (saved.applicantId || null) === (p.selectedApplicant?.id || null);
export const savedOptionsPayload = entries => ({ schemaVersion: 1, items: Object.values(entries).map(parseSavedOption).filter(Boolean).slice(0, 500) });

const object = value => value && typeof value === 'object' && !Array.isArray(value);
// Project only published evidence fields, never profile/match objects or staff metadata.
const publishedFields = (value, keys) => Object.fromEntries(object(value) ? keys.filter(key => Object.hasOwn(value, key) && (['string', 'boolean'].includes(typeof value[key]) || (typeof value[key] === 'number' && Number.isFinite(value[key])))).map(key => [key, value[key]]) : []);
const requirementFields = {
  degree: [], major: ['any', 'relatedAllowed'], classification: ['min'], gpa: ['min', 'scale'], experience: ['min'],
  manual: [], language: ['singleAttempt', 'atHomeAccepted', 'validityMonths', 'testDateNotBefore', 'testDateSourceUrl']
};
function publishedRequirement(rule) {
  if (!object(rule) || !Object.hasOwn(requirementFields, rule.kind) || typeof rule.labelEn !== 'string' || typeof rule.sourceUrl !== 'string') return null;
  const result = { ...publishedFields(rule, ['kind', 'labelEn', 'noteEn', 'sourceUrl', ...requirementFields[rule.kind]]), mandatory: rule.mandatory !== false };
  if (rule.kind === 'major') result.accepted = Array.isArray(rule.accepted) ? rule.accepted.filter(value => typeof value === 'string') : [];
  if (rule.kind === 'language') result.tests = Object.fromEntries(object(rule.tests) ? Object.entries(rule.tests).filter(([kind, value]) => ['ielts', 'toefl_120', 'toefl_6'].includes(kind) && object(value)).map(([kind, value]) => [kind, publishedFields(value, ['total', 'componentMin', 'validFrom', 'validBefore'])]) : []);
  return result;
}
function programmeEvidence(programme) {
  const fieldStatus = object(programme.fieldStatus) ? programme.fieldStatus : {};
  const checked = ['programme_page_checked', 'peer_reviewed'].includes(programme.verification);
  return {
    lastChecked: typeof programme.lastChecked === 'string' ? programme.lastChecked : null,
    requirementsCoverage: checked && ['unreviewed', 'partial', 'complete'].includes(programme.requirementsCoverage) ? programme.requirementsCoverage : 'unreviewed',
    requirementsNotice: checked ? 'Published programme/route-level criteria only. Applicability to the selected intake, mode and applicant category still needs confirmation. This is not a check of your background.' : 'No source-checked admission criteria are exported for this catalogue lead or unconfirmed record.',
    notesEn: typeof programme.notesEn === 'string' ? programme.notesEn : null,
    fieldStatus: Object.fromEntries(['academicYear', 'major', 'gpa', 'language', 'tuition', 'deadline', 'independentReview'].filter(key => Object.hasOwn(fieldStatus, key) && object(fieldStatus[key])).map(key => [key, publishedFields(fieldStatus[key], ['status', 'noteEn', 'sourceUrl'])])),
    sources: Array.isArray(programme.sources) ? programme.sources.filter(source => object(source) && typeof source.url === 'string').map(source => publishedFields(source, ['url', 'purpose', 'checkedOn'])) : [],
    publishedRequirements: checked && Array.isArray(programme.rules) ? programme.rules.map(publishedRequirement).filter(Boolean) : []
  };
}

export function shortlistExport(programmes, remembered = {}, now = new Date().toISOString()) {
  const unresolved = programmes.filter(p => p.unavailable || p.savedOptionIssue).map(p => ({ id: p.id, requestedOptions: remembered[p.id] ? parseSavedOption(remembered[p.id]) : null, reason: p.savedOptionIssue || p.issue || 'Programme unavailable; recheck the current source.' }));
  return {
    exportedAt: now,
    selectionPersistence: 'Only explicitly remembered choices persist in this browser. Current facts are reloaded from source records; unresolved saved choices are listed separately without substitute fees or dates.',
    evidenceNotice: 'Published programme evidence and unresolved conditions only, not a complete admissions assessment. Source-read dates are separate from export and date-comparison times. No student background, matching decisions or admission predictions are included. Verify current requirements and availability with the university.',
    programmes: programmes.filter(p => !p.unavailable && !p.savedOptionIssue).map(p => ({
      id: p.id, selectedRoute: p.selectedRoute || null, selectedOffering: p.selectedOffering || null,
      selectedApplicant: p.selectedApplicant || null, applicantEvidence: p.applicantEvidence || null,
      offeringDisclaimer: p.offeringDisclaimer || null, name: p.name, university: p.university.nameEn,
      officialUrl: p.officialUrl, verification: p.verification, academicYear: p.academicYear, scope: p.scope || null,
      offerings: p.offerings, applicationTimeline: p.applicationTimeline,
      evidence: programmeEvidence(p),
      rememberedChoice: sameOptions(p, remembered[p.id])
    })),
    unresolved
  };
}
