const comparableKinds = new Set(['degree', 'major', 'gpa', 'classification', 'language', 'experience']);

// Summarise recorded mandatory background comparisons only. University judgement,
// evidence completeness and route/intake applicability remain separate conditions.
export function summarizeRecordedCriteria(checks) {
  const comparable = checks.filter(c => c.mandatory && comparableKinds.has(c.kind));
  const pending = c => c.status === 'unknown' || c.unresolved;
  const counts = {
    total: comparable.length,
    met: comparable.filter(c => c.status === 'pass' && !c.unresolved).length,
    gaps: comparable.filter(c => c.status === 'fail').length,
    unresolved: comparable.filter(pending).length
  };
  return {
    status: !counts.total ? 'not_available' : counts.gaps ? 'has_gap' : counts.unresolved ? 'needs_confirmation' : 'recorded_checks_met',
    ...counts,
    otherConditionsPending: checks.filter(c => c.mandatory && !comparableKinds.has(c.kind) && pending(c)).length
  };
}
