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

export function shortlistExport(programmes, remembered = {}, now = new Date().toISOString()) {
  const unresolved = programmes.filter(p => p.unavailable || p.savedOptionIssue).map(p => ({ id: p.id, requestedOptions: remembered[p.id] ? parseSavedOption(remembered[p.id]) : null, reason: p.savedOptionIssue || p.issue || 'Programme unavailable; recheck the current source.' }));
  return {
    exportedAt: now,
    selectionPersistence: 'Only explicitly remembered choices persist in this browser. Current facts are reloaded from source records; unresolved saved choices are listed separately without substitute fees or dates.',
    programmes: programmes.filter(p => !p.unavailable && !p.savedOptionIssue).map(p => ({
      id: p.id, selectedRoute: p.selectedRoute || null, selectedOffering: p.selectedOffering || null,
      selectedApplicant: p.selectedApplicant || null, applicantEvidence: p.applicantEvidence || null,
      offeringDisclaimer: p.offeringDisclaimer || null, name: p.name, university: p.university.nameEn,
      officialUrl: p.officialUrl, verification: p.verification, academicYear: p.academicYear, scope: p.scope || null,
      offerings: p.offerings, applicationTimeline: p.applicationTimeline,
      rememberedChoice: sameOptions(p, remembered[p.id])
    })),
    unresolved
  };
}
