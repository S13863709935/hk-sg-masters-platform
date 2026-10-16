import { validateProfile } from './profile.mjs';
const normalize = s => String(s || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const rank = { ordinary: 0, third: 1, second_lower: 2, second_upper: 3, first: 4 };
function evaluate(r, p) {
  const result = (status, reason, unresolved = false) => ({ kind: r.kind, label: r.labelEn, status, reason, unresolved, mandatory: r.mandatory !== false, sourceUrl: r.sourceUrl });
  if (r.kind === 'degree') return result(p.degreeStatus === 'graduated' ? 'pass' : 'unknown', 'Self-reported degree completion only; recognition and conditional-offer rules remain subject to university assessment.');
  if (r.kind === 'major') return r.any || r.accepted.map(normalize).includes(normalize(p.major)) ? result('pass', 'Reported major is explicitly included in this recorded rule.') : r.relatedAllowed ? result('unknown', 'A related discipline may be considered. Equivalence is not inferred automatically.') : result('fail', 'Reported major is outside the explicitly listed fields.');
  if (r.kind === 'gpa') return p.gpa === null || p.gpaScale !== r.scale ? result('unknown', 'GPA is missing or on a different original scale. No conversion is applied.') : result(p.gpa >= r.min ? 'pass' : 'fail', `Reported GPA ${p.gpa}/${p.gpaScale}; recorded minimum ${r.min}/${r.scale}.`);
  if (r.kind === 'classification') return !(p.classification in rank) ? result('unknown', 'A comparable degree classification is missing. It is not inferred from GPA.') : result(rank[p.classification] >= rank[r.min] ? 'pass' : 'fail', 'Comparison uses the self-reported classification, not a GPA conversion.');
  if (r.kind === 'experience') return p.experienceYears === null ? result('unknown', 'Experience is not provided.') : result(p.experienceYears >= r.min ? 'pass' : 'fail', `Reported experience ${p.experienceYears} years; recorded minimum ${r.min}.`);
  if (r.kind !== 'language') return result('unknown', r.noteEn || 'Manual or university confirmation is required.');
  const l = p.language; const target = r.tests?.[l.type];
  if (!target || l.type === 'waiver') return result('unknown', 'This test version, missing score or waiver route needs confirmation.');
  const fails = []; const unknown = [];
  if (l.total === null) unknown.push('total'); else if (l.total < target.total) fails.push('total');
  if (target.componentMin !== undefined) {
    if (l.type !== 'ielts') unknown.push('test-specific component scores');
    else for (const [k, v] of Object.entries(l.components)) { if (v === null) unknown.push(k); else if (v < target.componentMin) fails.push(k); }
  }
  if (r.singleAttempt && !l.singleAttempt) unknown.push('single-attempt confirmation');
  if (l.atHome && r.atHomeAccepted === false) fails.push('at-home option not accepted');
  if (l.atHome && r.atHomeAccepted === undefined) unknown.push('at-home acceptance');
  if ((target.validFrom || target.validBefore) && !l.testDate) unknown.push('test date');
  if (l.testDate && ((target.validFrom && l.testDate < target.validFrom) || (target.validBefore && l.testDate >= target.validBefore))) fails.push('test-version date');
  // Validity can be anchored to an application date or intake, not necessarily today.
  if (r.validityMonths) unknown.push('programme-specific validity anchor');
  return result(fails.length ? 'fail' : unknown.length ? 'unknown' : 'pass', fails.length || unknown.length ? `${fails.length ? `Not met: ${fails.join(', ')}. ` : ''}${unknown.length ? `Needs confirmation: ${unknown.join(', ')}.` : ''}` : 'Reported scores meet the recorded score conditions only.', unknown.length > 0);
}
export function checkProgramme(programme, input) {
  const p = validateProfile(input);
  const checked = ['programme_page_checked', 'peer_reviewed'].includes(programme.verification);
  const checks = checked ? programme.rules.map(r => evaluate(r, p)) : [];
  const addUnknown = (kind, reason) => checks.push({ kind, label: kind === 'coverage' ? 'Completeness and review' : 'Programme requirements', mandatory: true, status: 'unknown', reason, sourceUrl: programme.officialUrl });
  if (!checks.length) addUnknown('data', 'A directory lead cannot establish admission conditions.');
  if (programme.requirementsCoverage !== 'complete' || programme.verification !== 'peer_reviewed') addUnknown('coverage', 'Full requirements, current application status and independent review are not confirmed.');
  if (programme.admissionRoute !== 'direct') addUnknown('route', 'A direct-entry route has not been established.');
  const required = checks.filter(c => c.mandatory);
  const counts = { pass: required.filter(c => c.status === 'pass').length, fail: required.filter(c => c.status === 'fail').length, unknown: required.filter(c => c.status === 'unknown' || c.unresolved).length };
  return { status: counts.fail ? 'has_gap' : counts.unknown ? 'needs_confirmation' : 'meets_checked', tier: null, counts, checks, disclaimer: 'A self-reported comparison with recorded conditions, not university-confirmed eligibility, a probability or an admission guarantee. Recommendation tiers are not enabled in this checkpoint.' };
}
