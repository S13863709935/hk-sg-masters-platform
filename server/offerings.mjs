import { InputError } from './validation.mjs';

export const offeringDisclaimer = 'Study-option selection filters recorded fees, duration and dates and activates only entry conditions explicitly bound to that option. Applicant-category notes still apply. Other requirements and complete applicability to this intake and mode need confirmation.';

// Only server-resolved choices can activate a rule scoped to a study option.
// A copied JSON selectedOffering property is not a trusted selection.
const resolvedOfferings = new WeakMap();
export const resolvedOfferingId = programme => resolvedOfferings.get(programme) || null;
export function carryOfferingSelection(from, to) {
  const id = resolvedOfferingId(from);
  if (id) resolvedOfferings.set(to, id);
  return to;
}

// A request-time view, not a source update or a new admissions verification.
export function resolveOffering(programme, offeringId) {
  const offeringOptions = programme.offerings.map(o => ({ ...o }));
  if (!offeringId) return { ...programme, offeringOptions };
  const selected = offeringOptions.find(o => o.id === offeringId);
  if (!selected) throw new InputError('Unknown study option for this programme and route');
  const result = {
    ...programme, offeringOptions, offerings: [{ ...selected }],
    academicYear: selected.academicYear || programme.academicYear,
    selectedOffering: { id: selected.id, mode: selected.mode || null, intake: selected.intake || null, academicYear: selected.academicYear || programme.academicYear || null },
    offeringDisclaimer
  };
  resolvedOfferings.set(result, selected.id);
  return result;
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
