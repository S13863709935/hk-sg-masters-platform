import { validateProfile } from './validation.mjs';

const ranks = { ordinary: 0, third: 1, second_lower: 2, second_upper: 3, first: 4 };
const normalize = value => String(value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
const aliases = { 土木工程: 'civilengineering', 计算机科学: 'computerscience', 计算机: 'computerscience', 信息技术: 'informationtechnology', 软件工程: 'softwareengineering', 机械工程: 'mechanicalengineering', 电子工程: 'electricalengineering', 工商管理: 'businessadministration', 会计: 'accounting', 经济学: 'economics', 心理学: 'psychology', 教育学: 'education' };
export const normalizeMajor = value => aliases[normalize(value)] || normalize(value);
const outcome = (r, status, zh, en, extra = {}) => ({ kind: r.kind, labelZh: r.labelZh, labelEn: r.labelEn, mandatory: r.mandatory !== false, status, reasonZh: zh, reasonEn: en, sourceUrl: r.sourceUrl, ...extra });

function evaluateRule(r, profile) {
  if (r.kind === 'degree') return profile.degreeStatus === 'graduated' ? outcome(r, 'pass', '自报已获得学士学位；学校仍需审核院校认可及同等资格。', 'Self-reported bachelor’s degree completed. Institutional recognition remains the university’s decision.') : outcome(r, 'unknown', '尚未确认已取得学位；应查询是否接受条件录取。', 'Degree completion is not confirmed. Check conditional-offer rules with the university.');
  if (r.kind === 'major') {
    const major = normalizeMajor(profile.major);
    if (r.accepted.map(normalizeMajor).includes(major) || r.any) return outcome(r, 'pass', '自报专业在明确公布的范围内。', 'The reported major is explicitly included.', { directMajor: !r.any });
    return r.relatedAllowed ? outcome(r, 'unknown', '学校接受相关领域，但“相关”需要学校判断，不自动认定。', 'Related fields are accepted, but equivalence needs the university’s confirmation.') : outcome(r, 'fail', '自报专业不在明确列出的必需范围内。', 'The reported major is outside the explicitly listed required fields.');
  }
  if (r.kind === 'classification') {
    if (!(profile.classification in ranks)) return outcome(r, 'unknown', '未提供可比的荣誉学位等级；不从 GPA 自行换算。', 'A comparable honours classification is missing. GPA is not converted into honours.');
    const difference = ranks[profile.classification] - ranks[r.min];
    return outcome(r, difference >= 0 ? 'pass' : 'fail', difference >= 0 ? '自报荣誉等级达到公布要求。' : '自报荣誉等级低于公布要求。', difference >= 0 ? 'Reported honours classification meets the published minimum.' : 'Reported honours classification is below the published minimum.', { academicMargin: difference > 0 });
  }
  if (r.kind === 'gpa') {
    if (profile.gpa === null || profile.gpaScale !== r.scale) return outcome(r, 'unknown', 'GPA 缺失或原始量表不同，不进行线性换算。', 'GPA is missing or on a different original scale. No linear conversion is applied.');
    const pass = profile.gpa >= r.min;
    return outcome(r, pass ? 'pass' : 'fail', `自报 GPA ${profile.gpa}/${profile.gpaScale}，公布门槛 ${r.min}/${r.scale}。`, `Reported GPA ${profile.gpa}/${profile.gpaScale}; published minimum ${r.min}/${r.scale}.`, { academicMargin: profile.gpa > r.min });
  }
  if (r.kind === 'experience') {
    if (profile.experienceYears === null) return outcome(r, 'unknown', '未提供工作经验年数。', 'Work experience has not been provided.');
    return outcome(r, profile.experienceYears >= r.min ? 'pass' : 'fail', `自报工作经验 ${profile.experienceYears} 年，要求至少 ${r.min} 年。`, `Reported experience ${profile.experienceYears} years; minimum ${r.min}.`);
  }
  if (r.kind === 'manual') return outcome(r, 'unknown', r.noteZh || '该条件需要学校或人工确认。', r.noteEn || 'This condition needs manual or university confirmation.');
  const language = profile.language;
  if (language.type === 'waiver') return outcome(r, 'unknown', '已选择豁免途径，但证明材料及学校接受情况需要确认。', 'A waiver route was selected. Evidence and acceptance must be confirmed.');
  const target = r.tests?.[language.type];
  if (!target) return outcome(r, 'unknown', '此考试版本的要求未确认，或尚未提供语言成绩。', 'Requirements for this test version are unconfirmed, or no score was provided.');
  if (language.atHome && r.atHomeAccepted === false) return outcome(r, 'fail', '官方规则不接受在家考试版本。', 'The published rule does not accept the at-home test option.');
  const failures = [];
  const unknowns = [];
  if (language.total === null) unknowns.push('total');
  else if (language.total < target.total) failures.push('total');
  if (target.componentMin !== undefined) for (const [name, score] of Object.entries(language.components)) { if (score === null) unknowns.push(name); else if (score < target.componentMin) failures.push(name); }
  if (r.singleAttempt && !language.singleAttempt) unknowns.push('single attempt');
  if ((target.validFrom || target.validBefore || r.validityMonths) && !language.testDate) unknowns.push('test date');
  if (language.testDate && ((target.validFrom && language.testDate < target.validFrom) || (target.validBefore && language.testDate >= target.validBefore))) failures.push('version date');
  if (language.testDate && r.validityMonths) { const expiration = new Date(`${language.testDate}T00:00:00Z`); expiration.setUTCMonth(expiration.getUTCMonth() + r.validityMonths); if (expiration < new Date()) failures.push('expired'); }
  const status = failures.length ? 'fail' : unknowns.length ? 'unknown' : 'pass';
  const fieldsZh = { total: '总分', listening: '听力', reading: '阅读', writing: '写作', speaking: '口语', 'single attempt': '单次考试确认', 'test date': '考试日期', 'version date': '考试版本日期', expired: '有效期' };
  return outcome(r, status,
    status === 'pass' ? '自报总分、适用单项及已记录的考试条件达到要求。' : `${failures.length ? `未满足：${failures.map(x => fieldsZh[x]).join('、')}。` : ''}${unknowns.length ? `待确认：${unknowns.map(x => fieldsZh[x]).join('、')}。` : ''}`,
    status === 'pass' ? 'Reported total, applicable components and recorded test conditions meet the rule.' : `${failures.length ? `Not met: ${failures.join(', ')}. ` : ''}${unknowns.length ? `Needs confirmation: ${unknowns.join(', ')}.` : ''}`,
    { unresolved: unknowns.length > 0, languageMargin: status === 'pass' && language.total > target.total && (target.componentMin === undefined || Object.values(language.components).every(v => v > target.componentMin)) });
}

export function matchProgramme(programme, profileInput) {
  const profile = validateProfile(profileInput);
  if (programme.scope?.status === 'out_of_scope') return { status: 'out_of_scope', tier: null, checks: [{ kind: 'scope', labelEn: 'Programme scope', labelZh: '', mandatory: true, status: 'unknown', reasonEn: programme.scope.reasonEn, reasonZh: '', sourceUrl: programme.scope.sourceUrl }], counts: { pass: 0, fail: 0, unknown: 1 }, disclaimerEn: 'Excluded because of the programme type, not because of your background. No eligibility or admission conclusion is made.', disclaimerZh: '' };
  const canUseRules = ['programme_page_checked', 'peer_reviewed'].includes(programme.verification);
  const checks = canUseRules ? programme.rules.map(r => evaluateRule(r, profile)) : [];
  if (!checks.length) checks.push({ kind: 'data', labelZh: '项目要求', labelEn: 'Programme requirements', mandatory: true, status: 'unknown', reasonZh: '仍为目录线索，不能据此判断门槛。', reasonEn: 'This is a catalogue lead, not a checked admissions record.', sourceUrl: programme.officialUrl });
  if (programme.requirementsCoverage !== 'complete') checks.push({ kind: 'coverage', labelZh: '完整性', labelEn: 'Completeness', mandatory: true, status: 'unknown', reasonZh: '尚未确认完整招生条件、当期申请状态或独立复核。', reasonEn: 'The complete requirements, current application status or independent review remain unconfirmed.', sourceUrl: programme.officialUrl });
  if (programme.admissionRoute === 'transfer_only') checks.push({ kind: 'route', labelZh: '申请路径', labelEn: 'Admission route', mandatory: true, status: 'fail', reasonZh: '仅限现有学生转入，不是新生直接申请项目。', reasonEn: 'Transfer-only for existing students; not open to direct new admission.', sourceUrl: programme.officialUrl });
  if (programme.directoryListing?.variants.length) checks.push({ kind: 'route', labelZh: '', labelEn: 'Specific programme route', mandatory: true, status: 'unknown', reasonZh: '', reasonEn: 'The directory groups specialisations, languages or dual pathways. Select and verify one specific route; shared or sibling-route criteria cannot establish eligibility.', sourceUrl: programme.directoryListing.sourceUrl });
  const mandatory = checks.filter(c => c.mandatory);
  const failures = mandatory.filter(c => c.status === 'fail').length;
  const unknowns = mandatory.filter(c => c.status === 'unknown' || c.unresolved).length;
  const status = failures ? 'has_gap' : unknowns ? 'needs_confirmation' : 'meets_checked';
  let tier = null;
  if (status === 'meets_checked' && programme.verification === 'peer_reviewed' && programme.admissionRoute === 'direct') {
    if (checks.some(c => !c.mandatory && c.status === 'fail')) tier = 'stretch';
    else if (checks.every(c => c.status === 'pass') && checks.some(c => c.academicMargin) && checks.some(c => c.languageMargin) && checks.some(c => c.directMajor)) tier = 'relatively_safer';
    else if (checks.every(c => c.status === 'pass')) tier = 'match';
  }
  return { status, tier, checks, counts: { pass: mandatory.filter(c => c.status === 'pass').length, fail: failures, unknown: unknowns }, disclaimerZh: '仅比较自报背景与已核查的公开条件，不代表录取资格已获学校确认或录取概率。', disclaimerEn: 'Checks self-reported background against recorded public criteria. Not confirmed eligibility or an admission probability.' };
}
