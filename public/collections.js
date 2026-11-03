export const storageKey = 'gradpath-week-07-candidate-references';
const id = value => typeof value === 'string' && /^[A-Z0-9-]{1,160}$/.test(value);
const reference = value => ({ programmeId: value.programmeId, offeringId: value.offeringId ?? null });

export function reconcileReferences(input, catalogue, limit = 20) {
  const choices = [], unresolved = [], seen = new Set();
  if (!Array.isArray(input) || input.length > 100) return { choices, unresolved: ['Invalid saved list'] };
  for (const value of input) {
    if (!value || !id(value.programmeId) || (value.offeringId != null && !id(value.offeringId))) { unresolved.push('Invalid saved reference'); continue; }
    const p = catalogue.find(p => p.id === value.programmeId);
    if (!p || (value.offeringId != null && !p.offerings.some(o => o.id === value.offeringId))) { unresolved.push(reference(value)); continue; }
    if (seen.has(p.id)) continue;
    if (choices.length === limit) { unresolved.push(reference(value)); continue; }
    seen.add(p.id); choices.push(reference(value));
  }
  return { choices, unresolved };
}

export function editReferences(input, action, programmeId, offeringId, catalogue, limit = 20) {
  const { choices } = reconcileReferences(input, catalogue, limit);
  const p = catalogue.find(p => p.id === programmeId), at = choices.findIndex(c => c.programmeId === programmeId);
  if (!p) return { choices, message: 'This programme is not in the published pilot.' };
  if (action === 'remove') return { choices: choices.filter(c => c.programmeId !== programmeId), message: 'Programme removed.' };
  if (offeringId != null && !p.offerings.some(o => o.id === offeringId)) return { choices, message: 'That study option is no longer valid. No substitute was selected.' };
  if (action === 'select') {
    if (at < 0) return { choices, message: 'Add this programme to the list first.' };
    choices[at] = { programmeId, offeringId: offeringId ?? null };
    return { choices, message: offeringId ? 'Study option selected.' : 'Study option cleared.' };
  }
  if (action !== 'add') return { choices, message: 'Unknown list action.' };
  if (at >= 0) return { choices, message: 'This programme is already on the list.' };
  if (choices.length >= limit) return { choices, message: `This list holds up to ${limit} programmes. Remove one before adding another.` };
  return { choices: [...choices, { programmeId, offeringId: offeringId ?? null }], message: 'Programme added. Select an intake and study mode before comparing its fees.' };
}

export function loadCandidateReferences(storage, catalogue) {
  try {
    const raw = storage.getItem(storageKey);
    if (raw === null) return { choices: [], unresolved: [], remembered: false, error: false };
    if (raw.length > 32000) throw new Error('Oversized storage');
    const saved = JSON.parse(raw);
    if (saved?.schemaVersion !== 1) throw new Error('Unsupported saved format');
    return { ...reconcileReferences(saved.choices, catalogue), remembered: true, error: false };
  } catch { return { choices: [], unresolved: ['Saved choices could not be read'], remembered: false, error: true }; }
}

export function saveCandidateReferences(storage, choices, catalogue) {
  const checked = reconcileReferences(choices, catalogue);
  if (checked.unresolved.length) return false;
  try { storage.setItem(storageKey, JSON.stringify({ schemaVersion: 1, choices: checked.choices })); return true; } catch { return false; }
}

export function forgetCandidateReferences(storage) {
  try { storage.removeItem(storageKey); return true; } catch { return false; }
}

export function programmeReferencesExport(choices, catalogue) {
  const checked = reconcileReferences(choices, catalogue);
  const pick = (object, keys) => Object.fromEntries(keys.filter(k => object[k] !== undefined).map(k => [k, object[k]]));
  return {
    schemaVersion: 1, checkpoint: 'week-07',
    note: 'Public programme references only. Partial historical observations, not confirmed eligibility or live application availability. No currency conversion or personal background is exported.',
    programmes: checked.choices.map(c => {
      const p = catalogue.find(p => p.id === c.programmeId), o = p.offerings.find(o => o.id === c.offeringId);
      return {
        ...pick(p, ['id', 'universityId', 'name', 'award', 'academicYear', 'officialUrl', 'lastChecked', 'verification', 'requirementsCoverage', 'notesEn']),
        selectedOffering: o ? pick(o, ['id', 'mode', 'duration', 'intake', 'academicYear', 'currency', 'tuition', 'applicationFee', 'feeBasis', 'applicationOpen', 'deadline', 'deadlineNote']) : null,
        selectionNote: o ? 'Exact selected study option; confirm its current fees, dates and applicability with the university.' : 'No study option selected; no default fee or intake assigned.',
        sources: (p.sources || []).map(s => pick(s, ['url', 'checkedOn', 'purpose']))
      };
    }), unresolved: checked.unresolved
  };
}
