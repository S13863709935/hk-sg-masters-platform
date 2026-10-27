import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { CatalogueStore } from '../server/database.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts } from '../server/applicants.mjs';
import { validateProfile, isOfficialUrl } from '../server/validation.mjs';
import { matchProgramme } from '../server/matching.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { optionSnapshot, sameOptions, shortlistExport } from '../public/saved-options.js';

const canonical = v => Array.isArray(v) ? v.map(canonical) : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonical(v[k])])) : v;
const hash = v => createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const validDate = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const componentScores = n => ({ listening: n, reading: n, writing: n, speaking: n });
const base = { major: 'Computer Science', degreeStatus: 'graduated', classification: 'second_upper', gpa: 3.8, gpaScale: 4, experienceYears: 2, language: { type: 'ielts', total: 7.5, components: componentScores(7), singleAttempt: true, atHome: false, testDate: '2026-05-01' } };
// Synthetic fixtures only: no students, survey participants or admission decisions.
export const coreScenarios = [
  { id: 'COMPUTING-STRONG', label: 'Synthetic computing graduate, strong IELTS', profile: structuredClone(base) },
  { id: 'BUSINESS-GRADUATE', label: 'Synthetic business graduate, no work experience', profile: { ...structuredClone(base), major: 'Business Administration', classification: 'ordinary', gpa: 3.2, experienceYears: 0, language: { ...base.language, total: 6.5, components: componentScores(6) } } },
  { id: 'CIVIL-GRADUATE', label: 'Synthetic civil graduate, one year experience', profile: { ...structuredClone(base), major: 'Civil Engineering', gpa: 3.4, experienceYears: 1, language: { ...base.language, total: 6, components: componentScores(5.5) } } },
  { id: 'MISSING-EVIDENCE', label: 'Synthetic final-year applicant, no GPA/test', profile: { ...structuredClone(base), major: 'Economics', degreeStatus: 'final_year', classification: 'unknown', gpa: null, gpaScale: null, experienceYears: null, language: { type: 'none' } } },
  { id: 'WAIVER-CLAIM', label: 'Synthetic unverified English-degree waiver', profile: { ...structuredClone(base), language: { type: 'waiver', waiverBasis: 'english_degree' } } },
  { id: 'DIFFERENT-GPA-SCALE', label: 'Synthetic original GPA scale 100, no conversion', profile: { ...structuredClone(base), gpa: 85, gpaScale: 100 } },
  { id: 'LOW-ENGLISH', label: 'Synthetic low IELTS despite strong academics', profile: { ...structuredClone(base), language: { ...base.language, total: 5, components: componentScores(4.5) } } }
];
const inputFiles = ['data/catalogue.json', 'data/catalogue-expansion.json', 'data/checked-programmes.json', 'data/directory-audit.json', 'data/programme-scope-audit.json', 'data/directory-links.json', 'data/route-programmes.json', 'data/applicant-contexts.json'];

export function buildCoreAcceptance({ programmes, pilotIds, routes = new Map(), applicants = new Map(), asOfDate, scenarios = coreScenarios, inputFingerprints = {} }) {
  if (!validDate(asOfDate)) throw new TypeError('An explicit real YYYY-MM-DD comparison date is required');
  if (!Array.isArray(programmes) || new Set(programmes.map(p => p.id)).size !== programmes.length || !(routes instanceof Map) || !(applicants instanceof Map) || !Array.isArray(pilotIds) || !pilotIds.length || new Set(pilotIds).size !== pilotIds.length || !Array.isArray(scenarios) || !scenarios.length || new Set(scenarios.map(s => s.id)).size !== scenarios.length) throw new TypeError('Unique core IDs, validated maps and synthetic scenarios are required');
  const byId = new Map(programmes.map(p => [p.id, p]));
  if (pilotIds.some(id => !byId.has(id))) throw new TypeError('Core programme missing from source data');
  for (const s of scenarios) validateProfile(s.profile);
  const selected = pilotIds.map(id => byId.get(id));
  if (selected.some(p => [p.lastChecked, ...(p.sources || []).map(s => s.checkedOn)].some(d => !validDate(d) || d > asOfDate))) throw new TypeError('Current source evidence postdates the comparison; historical admissions cannot be reconstructed');
  const before = hash({ programmes, routes: [...routes], applicants: [...applicants], scenarios });
  const violations = [], cases = [], summaries = [], selectedContexts = new Set();
  const require = (condition, code, detail) => { if (!condition) violations.push({ code, detail }); };
  const stamp = asOfDate + 'T04:00:00.000Z';
  for (const p of selected) {
    const variants = [{ id: 'BASE', programme: resolveProgramme(p, routes, undefined, undefined, undefined, applicants), offeringId: null, applicantId: null }];
    const records = routes.get(p.id) || [];
    for (const routeId of records.length ? records.map(r => r.routeId) : [undefined]) {
      const routed = resolveProgramme(p, routes, routeId, undefined, undefined, applicants);
      if (routed.directoryListing?.variants.length && !routed.selectedRoute) continue;
      for (const o of routed.offerings) {
        const bare = resolveProgramme(p, routes, routeId, o.id, undefined, applicants);
        variants.push({ id: [routeId || '', o.id].join('|'), programme: bare, offeringId: o.id, applicantId: null });
        const contextKey = [p.id, routeId || '', o.id].join('|'), context = applicants.get(contextKey);
        if (context) {
          if (context.checkedOn > asOfDate) throw new TypeError('Applicant evidence postdates the comparison');
          selectedContexts.add(contextKey);
          for (const category of context.options) variants.push({ id: [routeId || '', o.id, category.id].join('|'), programme: resolveProgramme(p, routes, routeId, o.id, category.id, applicants), offeringId: o.id, applicantId: category.id });
          for (const key of ['tuition', 'applicationFee', 'applicationOpen', 'deadline']) require(bare.offerings[0][key] === null, 'CATEGORY_DEFAULT', p.id + '/' + o.id + '/' + key);
        }
      }
    }
    const profileResults = Object.fromEntries(scenarios.map(s => [s.id, { has_gap: 0, needs_confirmation: 0, meets_checked: 0, out_of_scope: 0 }]));
    for (const variant of variants) {
      const q = variant.programme, timeline = programmeTimeline(q, asOfDate), saved = optionSnapshot(q, stamp);
      const exported = shortlistExport([{ ...q, applicationTimeline: timeline }], { [q.id]: saved }, stamp).programmes[0];
      const exportVerified = !!exported && sameOptions(q, saved) && exported.profile === undefined && exported.match === undefined && exported.evidence.lastChecked === q.lastChecked && (!variant.applicantId || (exported.selectedApplicant?.id === variant.applicantId && JSON.stringify(exported.offerings) === JSON.stringify(q.offerings)));
      require(sameOptions(q, saved), 'OPTION_IDENTITY', p.id + '/' + variant.id);
      require(exported && exported.profile === undefined && exported.match === undefined, 'PROFILE_EXPORT', p.id + '/' + variant.id);
      require(exported?.evidence.lastChecked === q.lastChecked, 'SOURCE_DATE_REPLACED', p.id + '/' + variant.id);
      require(timeline.livePortalChecked === false, 'LIVE_PORTAL_CLAIM', p.id + '/' + variant.id);
      if (variant.applicantId) {
        require(exported.selectedApplicant?.id === variant.applicantId, 'CATEGORY_EXPORT', p.id + '/' + variant.id);
        require(JSON.stringify(exported.offerings) === JSON.stringify(q.offerings), 'CATEGORY_FACT_EXPORT', p.id + '/' + variant.id);
      }
      for (const scenario of scenarios) {
        const result = matchProgramme(q, scenario.profile), mandatory = result.checks.filter(c => c.mandatory);
        const expected = mandatory.some(c => c.status === 'fail') ? 'has_gap' : mandatory.some(c => c.status === 'unknown' || c.unresolved) ? 'needs_confirmation' : 'meets_checked';
        require(result.status === 'out_of_scope' || result.status === expected, 'STATUS_EXPLANATION', p.id + '/' + scenario.id);
        require(result.tier === null && !('probability' in result), 'UNSUPPORTED_RECOMMENDATION', p.id + '/' + scenario.id);
        require(q.requirementsCoverage === 'complete' || result.status !== 'meets_checked', 'PARTIAL_AS_COMPLETE', p.id + '/' + scenario.id);
        require(result.checks.every(c => isOfficialUrl(c.sourceUrl) && typeof c.reasonEn === 'string' && !!c.reasonEn.trim()), 'MISSING_REASON_SOURCE', p.id + '/' + scenario.id);
        if (scenario.profile.language.type === 'waiver') require(result.checks.filter(c => c.kind === 'language').every(c => c.status === 'unknown'), 'AUTOMATIC_WAIVER', p.id);
        if (!q.rules.some(r => r.kind === 'gpa')) require(!result.checks.some(c => c.kind === 'gpa'), 'INVENTED_GPA', p.id);
        profileResults[scenario.id][result.status]++;
        cases.push({ programmeId: p.id, variant: variant.id, offeringId: variant.offeringId, applicantId: variant.applicantId, scenarioId: scenario.id, status: result.status, counts: result.counts, failed: result.checks.filter(c => c.mandatory && c.status === 'fail').map(c => ({ kind: c.kind, label: c.labelEn, reason: c.reasonEn, sourceUrl: c.sourceUrl })), unresolved: result.checks.filter(c => c.mandatory && (c.status === 'unknown' || c.unresolved)).map(c => c.kind), timeline: timeline.state, tier: result.tier, exportVerified });
      }
    }
    summaries.push({ id: p.id, name: p.name, officialUrl: p.officialUrl, sourceCheckedOn: p.lastChecked, sourceFingerprint: hash(p), variantCount: variants.length, scenarioCaseCount: variants.length * scenarios.length, unknownFields: Object.entries(p.fieldStatus || {}).filter(([k, v]) => k !== 'independentReview' && v.status === 'unknown').map(([k]) => k), notPublishedFields: Object.entries(p.fieldStatus || {}).filter(([, v]) => v.status === 'not_published').map(([k]) => k), manualConditions: p.rules.filter(r => r.kind === 'manual').map(r => r.labelEn), profileResults });
  }
  require(before === hash({ programmes, routes: [...routes], applicants: [...applicants], scenarios }), 'INPUT_MUTATION', 'Read-only acceptance changed inputs');
  const report = {
    schemaVersion: 1, asOfDate, syntheticOnly: true, livePortalChecked: false, independentReviewClaimed: false, sourceCoverageComplete: selected.every(p => p.requirementsCoverage === 'complete'),
    limits: 'Automated checks of stored public facts and synthetic backgrounds, not real-user research, independent human review, complete admissions verification, admission probabilities or publication approval. Official-source observations are separate; a test pass does not verify a university fact.',
    inputFingerprints, counts: { coreProgrammes: selected.length, scenarios: scenarios.length, selectionVariants: summaries.reduce((n, p) => n + p.variantCount, 0), selectedCategoryContexts: selectedContexts.size, cases: cases.length, hasGap: cases.filter(c => c.status === 'has_gap').length, needsConfirmation: cases.filter(c => c.status === 'needs_confirmation').length, meetsChecked: cases.filter(c => c.status === 'meets_checked').length, violations: violations.length },
    scenarios: scenarios.map(s => ({ id: s.id, label: s.label, profileFingerprint: hash(s.profile) })), programmes: summaries, cases, violations
  };
  return { ...report, fingerprint: hash(report) };
}
export function loadCoreAcceptance(asOfDate, root = new URL('../', import.meta.url)) {
  const inputs = inputFiles.map(file => JSON.parse(readFileSync(new URL(file, root), 'utf8')));
  const store = new CatalogueStore(':memory:', { seedPath: new URL(inputFiles[0], root), expansionPath: new URL(inputFiles[1], root), checkedPath: new URL(inputFiles[2], root), directoryAuditPath: new URL(inputFiles[3], root), scopeAuditPath: new URL(inputFiles[4], root), directoryEvidencePath: new URL(inputFiles[5], root) });
  try {
    const programmes = store.all(), routes = loadRoutes(new URL(inputFiles[6], root), programmes), applicants = loadApplicantContexts(new URL(inputFiles[7], root), programmes, routes);
    return buildCoreAcceptance({ programmes, pilotIds: inputs[2].pilotProgrammeIds, routes, applicants, asOfDate, inputFingerprints: Object.fromEntries(inputFiles.map((file, i) => [file, hash(inputs[i])])) });
  } finally { store.close(); }
}
const cell = v => String(v ?? '').replace(/\s+/g, ' ').trim().replace(/[\\\x60*_[\]<>|]/g, c => '\\' + c);
export function formatCoreAcceptance(r) {
  const c = r.counts, fence = String.fromCharCode(96).repeat(3);
  const lines = ['# 核心项目数据与筛选验收', '', '比较日期：' + r.asOfDate + '（UTC+08）。内部维护记录，不是课程提交正文。所有背景均为模拟数据，无真实用户访谈或独立人工复核。', '', '## 结果与边界', '', '- ' + c.coreProgrammes + ' 个原核心项目，' + c.scenarios + ' 组模拟背景，' + c.selectionVariants + ' 种项目／学制／类别选择，共 ' + c.cases + ' 次比较。', '- 存在已核对条件差距 ' + c.hasGap + ' 次；仍需确认 ' + c.needsConfirmation + ' 次；全部已核对条件符合 ' + c.meetsChecked + ' 次；自动一致性检查异常 ' + c.violations + ' 项。', '- 未公布 GPA 不补造数字，不做线性换算；豁免不自动通过，未选类别不默认费用／日期。检查通过不等于招生数据完整或保证录取。', '- 本批未修改网站功能、招生记录、原查阅日期、独立复核状态、主分支或周检查点，不推送、不部署。', '', '## 各核心项目', '', '| 稳定 ID／项目 | 原来源日 | 选择数／比较次数 | 未确认字段 | 未公布字段 |', '| --- | --- | --- | --- | --- |'];
  for (const p of r.programmes) lines.push('| ' + cell(p.id) + ' · ' + cell(p.name) + ' | ' + p.sourceCheckedOn + ' | ' + p.variantCount + ' / ' + p.scenarioCaseCount + ' | ' + cell(p.unknownFields.join(', ') || '另查具体人工判断条件') + ' | ' + cell(p.notPublishedFields.join(', ') || '无此标签') + ' |');
  lines.push('', '## 模拟背景结果', '', '每格为“有差距／待确认／已核对条件均符合”的次数；同一项目按未选／已选学制与各显式类别分别运行，不把次数当作不同项目。', '', '| 项目 | ' + r.scenarios.map(s => cell(s.id)).join(' | ') + ' |', '| --- | ' + r.scenarios.map(() => '---').join(' | ') + ' |');
  for (const p of r.programmes) lines.push('| ' + p.id + ' | ' + r.scenarios.map(s => { const v = p.profileResults[s.id]; return [v.has_gap, v.needs_confirmation, v.meets_checked].join(' / '); }).join(' | ') + ' |');
  lines.push('', '## 具体差距示例', '', '下列为模拟输入与已记录公开条件的差异，不是录取决定：', '');
  const examples = new Map();
  for (const v of r.cases) for (const f of v.failed) { const key = v.programmeId + '|' + f.kind + '|' + f.reason; if (!examples.has(key)) examples.set(key, '- ' + v.programmeId + ' · ' + v.scenarioId + ' · ' + cell(f.kind) + '：' + cell(f.reason)); }
  lines.push(...[...examples.values()].slice(0, 24), '', '## 可重复运行', '', '使用 Node 24，显式传入比较日期；只读仓库，在内存中组装，不打开日常数据库、不联网。早于当前来源的日期不重建历史招生事实。', '', fence + 'text', 'node scripts/core-pilot-acceptance.mjs --as-of ' + r.asOfDate + ' --format markdown', 'node scripts/core-pilot-acceptance.mjs --as-of ' + r.asOfDate, fence, '', '核心项目此前官方 HTML 抽查及其日期见 [官方来源抽查记录](core-pilot-source-checks-2026-10-25.md)。本只读验收不查阅官网、不修改来源查阅日，也不代表所有关联来源的完整更新。', '', '输入语义指纹：', '');
  for (const [file, value] of Object.entries(r.inputFingerprints)) lines.push('- ' + cell(file) + ': ' + value);
  lines.push('', '验收指纹：' + r.fingerprint, '');
  return lines.join('\n');
}
export function parseCoreArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const r = { format: 'json' }, seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!['--as-of', '--format'].includes(key) || seen.has(key) || !value) throw new TypeError('Use --as-of YYYY-MM-DD [--format json|markdown]');
    seen.add(key); r[key === '--as-of' ? 'asOfDate' : 'format'] = value;
  }
  if (!validDate(r.asOfDate) || !['json', 'markdown'].includes(r.format)) throw new TypeError('Explicit real date and json/markdown format required');
  return r;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = parseCoreArgs(process.argv.slice(2));
    if (args.help) console.log('Read-only synthetic core acceptance. Use --as-of YYYY-MM-DD [--format json|markdown]. No network, daily database, output-file writes, review approval or publication.');
    else { const r = loadCoreAcceptance(args.asOfDate); console.log(args.format === 'markdown' ? formatCoreAcceptance(r).trimEnd() : JSON.stringify(r, null, 2)); if (r.violations.length) process.exitCode = 1; }
  } catch (error) { console.error('Core acceptance not generated: ' + error.message); process.exitCode = 1; }
}
