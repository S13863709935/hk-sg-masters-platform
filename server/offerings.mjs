import { InputError } from './validation.mjs';

export const offeringDisclaimer = 'Study-option selection filters recorded fees, duration and dates only. Applicant-category notes still apply. Requirements remain programme/route-level evidence; their applicability to this intake and mode needs confirmation.';

// A request-time view, not a source update or a new admissions verification.
export function resolveOffering(programme, offeringId) {
  const offeringOptions = programme.offerings.map(o => ({ ...o }));
  if (!offeringId) return { ...programme, offeringOptions };
  const selected = offeringOptions.find(o => o.id === offeringId);
  if (!selected) throw new InputError('Unknown study option for this programme and route');
  return {
    ...programme, offeringOptions, offerings: [{ ...selected }],
    academicYear: selected.academicYear || programme.academicYear,
    selectedOffering: { id: selected.id, mode: selected.mode || null, intake: selected.intake || null, academicYear: selected.academicYear || programme.academicYear || null },
    offeringDisclaimer
  };
}

export function validateOfferingSelections(input, programmes) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 1000) throw new InputError('Invalid study-option selections');
  const ids = new Set(programmes.map(p => p.id));
  for (const [id, offering] of Object.entries(input)) {
    if (!ids.has(id) || typeof offering !== 'string' || !offering || offering.length > 200) throw new InputError('Invalid study-option selection');
  }
  return input;
}
