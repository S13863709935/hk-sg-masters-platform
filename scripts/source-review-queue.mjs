import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { CatalogueStore } from '../server/database.mjs';
import { loadRoutes, resolveProgramme } from '../server/routes.mjs';
import { loadApplicantContexts, hasApplicantDateEvidence, offeringFingerprint } from '../server/applicants.mjs';
import { programmeTimeline } from '../server/application-dates.mjs';
import { isOfficialUrl } from '../server/validation.mjs';

const fields = ['academicYear', 'major', 'gpa', 'language', 'tuition', 'deadline'];
const checked = p => ['programme_page_checked', 'peer_reviewed'].includes(p.verification);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(k => value[k] !== undefined).map(k => [k, canonical(value[k])])) : value;
const hash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const identifiedYear = value => typeof value === 'string' && /^(?:(?:January|February|March|April|May|June|July|August|September|October|November|December) )?20\d{2}(?:\/(?:\d{2}|20\d{2}))?(?: (?:intake|entry))?$/.test(value);
const daysBetween = (start, end) => (Date.parse(end) - Date.parse(start)) / 86400000;
const sourceReviewRecorded = p => p.verification === 'peer_reviewed' && typeof p.reviewer === 'string' && !!p.reviewer.trim();
const contextKey = (p, route, offering) => [p, route || '', offering].join('|');

function recordedCutoffs(p, asOfDate, futureSource) {
  if (futureSource) return [];
  const timeline = programmeTimeline(p, asOfDate);
  return timeline.offerings.flatMap(item => {
    const offering = p.offerings.find(o => o.id === item.offeringId);
    if (!offering || offering.applicantCategoryRequired || ['unverified', 'excluded', 'route_required', 'applicant_required', 'invalid_dates'].includes(item.state)) return [];
    if (!identifiedYear(offering.academicYear || p.academicYear)) return [];
    if (p.fieldStatus?.deadline?.status !== 'known' && !hasApplicantDateEvidence(offering)) return [];
    const candidates = item.rounds?.filter(r => ['cutoff_ahead', 'within_recorded_dates', 'not_yet_open', 'deadline_today', 'deadline_passed', 'cutoff_reached'].includes(r.state))
      .map(r => ({ roundId: r.id, deadline: r.deadline })) || (item.deadline ? [{ roundId: null, deadline: item.deadline }] : []);
    return candidates.filter(r => validDate(r.deadline)).map(r => ({ offeringId: item.offeringId, ...r, daysFromSnapshot: daysBetween(asOfDate, r.deadline), sourceUrl: item.sourceUrl, sourceCheckedOn: item.sourceCheckedOn }));
  });
}

function programmeUnit(p, { kind, key, routeId = null, asOfDate }) {
  const sourceDates = [p.lastChecked, ...(p.sources || []).map(s => s.checkedOn)].filter(validDate);
  const futureSource = sourceDates.some(d => d > asOfDate);
  const fieldStates = Object.fromEntries(fields.map(k => [k, p.fieldStatus?.[k]?.status || 'unrecorded']));
  const unconfirmedFields = fields.filter(k => ['unknown', 'unrecorded'].includes(fieldStates[k]));
  const notPublishedFields = fields.filter(k => fieldStates[k] === 'not_published');
  const archived = p.admissionRoute === 'transfer_only' || p.scope?.status === 'out_of_scope';
  const cutoffs = recordedCutoffs(p, asOfDate, futureSource);
  const upcoming = cutoffs.filter(d => d.daysFromSnapshot >= 0 && d.daysFromSnapshot <= 14);
  return {
    key, kind, programmeId: p.id, routeId, offeringId: null, name: p.name,
    universityId: p.universityId, officialUrl: p.officialUrl, sourceFingerprint: hash(p),
    sourceCheckedOn: p.lastChecked || null, sourceDates, sourceReviewRecorded: sourceReviewRecorded(p),
    status: sourceReviewRecorded(p) ? 'review_recorded_in_source' : 'pending_human_review',
    sourceVerification: p.verification, requirementsCoverage: p.requirementsCoverage || 'unreviewed',
    reviewOrder: archived ? 'archive_only' : futureSource ? 'reconcile_evidence' : upcoming.length ? 'cutoff_within_14_days' : unconfirmedFields.length ? 'reconcile_evidence' : 'independent_check',
    reasons: [...(archived ? ['Not a direct-entry recommendation candidate; preserve its exclusion.'] : []), ...(futureSource ? ['Source observations postdate the comparison snapshot; no historical availability is reconstructed.'] : []), ...(unconfirmedFields.length ? ['Unconfirmed fields: ' + unconfirmedFields.join(', ')] : []), ...(upcoming.length ? ['Recorded cutoff within fourteen days; this is not a live-open claim.'] : [])],
    fieldStates, unconfirmedFields, notPublishedFields,
    fieldNotes: Object.fromEntries(fields.filter(k => p.fieldStatus?.[k]).map(k => [k, { ...p.fieldStatus[k] }])),
    manualConditions: (p.rules || []).filter(r => r.kind === 'manual').map(r => ({ label: r.labelEn, note: r.noteEn || '', mandatory: r.mandatory !== false, sourceUrl: r.sourceUrl })),
    recordedCutoffs: cutoffs, upcomingRecordedCutoffs: upcoming,
    sources: (p.sources || []).map(s => ({ ...s }))
  };
}

// A source-data worklist, never a review approval or an admissions assessment.
export function buildSourceReviewQueue({ programmes, routes = new Map(), applicants = new Map(), asOfDate, inputFingerprints = {} }) {
  if (!validDate(asOfDate)) throw new TypeError('An explicit real YYYY-MM-DD snapshot date is required');
  if (!Array.isArray(programmes) || new Set(programmes.map(p => p.id)).size !== programmes.length || !(routes instanceof Map) || !(applicants instanceof Map)) throw new TypeError('Unique programme identities and validated evidence maps are required');
  for (const [key, c] of applicants) if (key !== contextKey(c.programmeId, c.routeId, c.offeringId)) throw new TypeError('Applicant context index key does not match its identity');
  const bases = new Map(programmes.map(p => [p.id, p])), units = [];
  // Mask category-bound base values through the existing resolver; do not guess a category.
  for (const p of programmes.filter(checked)) {
    units.push(programmeUnit(resolveProgramme(p, routes, undefined, undefined, undefined, applicants), { kind: 'programme', key: 'programme:' + p.id, asOfDate }));
  }
  for (const [id, records] of routes) {
    const base = bases.get(id);
    if (!base) throw new TypeError('Route parent is missing');
    for (const route of records) units.push(programmeUnit(resolveProgramme(base, routes, route.routeId, undefined, undefined, applicants), { kind: 'route', key: 'route:' + route.routeId, routeId: route.routeId, asOfDate }));
  }
  for (const context of applicants.values()) {
    const base = bases.get(context.programmeId), routeId = context.routeId || null;
    const original = routeId ? routes.get(base?.id)?.find(r => r.routeId === routeId) : base;
    const offering = original?.offerings.find(o => o.id === context.offeringId);
    if (!base || !original || !offering) throw new TypeError('Applicant context target is missing');
    const aligned = context.officialUrl === original.officialUrl && context.mode === offering.mode && context.intake === offering.intake && context.academicYear === offering.academicYear && context.offeringFingerprint === offeringFingerprint(offering);
    const sourceDates = [context.checkedOn, original.lastChecked, ...(original.sources || []).map(s => s.checkedOn)].filter(validDate);
    const futureSource = sourceDates.some(d => d > asOfDate);
    const categories = context.options.map(option => {
      const resolved = aligned && !futureSource ? resolveProgramme(base, routes, routeId || undefined, offering.id, option.id, applicants) : null;
      return {
        id: option.id, label: option.label, currency: option.currency,
        tuition: aligned && !futureSource ? option.tuition : null, applicationFee: aligned && !futureSource ? option.applicationFee : null,
        feeBasis: aligned && !futureSource ? option.feeBasis : 'Fee basis withheld: reconcile the stale or future-dated source context.',
        recordedFeeBasisForReconciliation: option.feeBasis, deadlineNote: option.deadlineNote || null,
        recordedCutoffs: resolved ? recordedCutoffs(resolved, asOfDate, futureSource) : []
      };
    });
    const upcoming = categories.flatMap(c => c.recordedCutoffs.filter(d => d.daysFromSnapshot >= 0 && d.daysFromSnapshot <= 14).map(d => ({ applicantId: c.id, ...d })));
    units.push({
      key: 'applicant:' + contextKey(base.id, routeId, offering.id), kind: 'applicant_context', programmeId: base.id, routeId, offeringId: offering.id,
      universityId: base.universityId, name: original.name + ' / ' + offering.intake + ' / ' + offering.mode, officialUrl: original.officialUrl,
      sourceFingerprint: hash(context), sourceCheckedOn: context.checkedOn, sourceDates, sourceReviewRecorded: false, status: 'pending_human_review',
      sourceVerification: context.verification, requirementsCoverage: 'partial', reviewOrder: !aligned || futureSource ? 'reconcile_evidence' : upcoming.length ? 'cutoff_within_14_days' : 'independent_check',
      reasons: [...(!aligned ? ['Context fingerprint or cohort/mode identity no longer matches; prices and dates are withheld.'] : []), ...(futureSource ? ['Evidence postdates the comparison snapshot; prices and dates are withheld.'] : []), ...(upcoming.length ? ['Recorded category cutoff within fourteen days; no live availability is implied.'] : [])],
      offeringFingerprintMatches: aligned, note: context.noteEn, categories, upcomingRecordedCutoffs: upcoming,
      sources: [{ url: context.feeSourceUrl, purpose: 'Category fees and eligibility', checkedOn: context.checkedOn }, { url: context.dateSourceUrl, purpose: 'Category dates', checkedOn: context.checkedOn }]
    });
  }
  const order = ['cutoff_within_14_days', 'reconcile_evidence', 'independent_check', 'archive_only'];
  units.sort((a, b) => order.indexOf(a.reviewOrder) - order.indexOf(b.reviewOrder) || a.key.localeCompare(b.key, 'en'));
  if (new Set(units.map(u => u.key)).size !== units.length) throw new TypeError('Duplicate review-unit identity');
  const counts = {
    catalogueRecords: programmes.length, programmePageRecords: programmes.filter(checked).length,
    remainingCatalogueLeads: programmes.filter(p => !checked(p)).length,
    routeRecords: [...routes.values()].flat().length, applicantContexts: applicants.size,
    applicantCategories: [...applicants.values()].reduce((sum, c) => sum + c.options.length, 0),
    reviewUnits: units.length, pendingHumanReview: units.filter(u => u.status === 'pending_human_review').length,
    reviewRecordedInSource: units.filter(u => u.sourceReviewRecorded).length,
    nearCutoffUnits: units.filter(u => u.reviewOrder === 'cutoff_within_14_days').length,
    staleApplicantContexts: units.filter(u => u.kind === 'applicant_context' && !u.offeringFingerprintMatches).length
  };
  const report = {
    schemaVersion: 1, asOfDate, timeZone: 'Asia/Singapore', method: 'Read-only worklist derived from local source snapshots; no websites or daily database are opened.',
    livePortalChecked: false, reviewApprovalGranted: false,
    caution: 'Review units are not additional programmes. Recorded review labels are not independently authenticated here. Missing GPA is not zero and not_published is not an unknown-field error. Manual conditions, fee-year/category scope and source conflicts still require a real person to inspect the official evidence. This tool does not change review status, source dates, matching tiers or release permission.',
    inputFingerprints, counts, units
  };
  return { ...report, queueFingerprint: hash(report) };
}

const inputFiles = ['data/catalogue.json', 'data/catalogue-expansion.json', 'data/checked-programmes.json', 'data/directory-audit.json', 'data/programme-scope-audit.json', 'data/directory-links.json', 'data/route-programmes.json', 'data/applicant-contexts.json'];
export function loadRepositoryReviewQueue(asOfDate, root = new URL('../', import.meta.url)) {
  const inputFingerprints = Object.fromEntries(inputFiles.map(file => [file, hash(JSON.parse(readFileSync(new URL(file, root), 'utf8')))]));
  const store = new CatalogueStore(':memory:', {
    seedPath: new URL(inputFiles[0], root), expansionPath: new URL(inputFiles[1], root), checkedPath: new URL(inputFiles[2], root),
    directoryAuditPath: new URL(inputFiles[3], root), scopeAuditPath: new URL(inputFiles[4], root), directoryEvidencePath: new URL(inputFiles[5], root)
  });
  try {
    const programmes = store.all(), routes = loadRoutes(new URL(inputFiles[6], root), programmes), applicants = loadApplicantContexts(new URL(inputFiles[7], root), programmes, routes);
    return buildSourceReviewQueue({ programmes, routes, applicants, asOfDate, inputFingerprints });
  } finally { store.close(); }
}

const cell = value => String(value ?? '').replace(/\s+/g, ' ').replace(/[\\\x60*_[\]<>|]/g, c => '\\' + c);
const linkedName = u => isOfficialUrl(u.officialUrl) ? '[' + cell(u.name) + '](<' + u.officialUrl + '>)' : cell(u.name);
const label = { cutoff_within_14_days: '先查：14 日内有记录截止', reconcile_evidence: '先解决未确认依据', independent_check: '待独立核对', archive_only: '仅保留归档／排除' };
export function formatSourceReviewMarkdown(q) {
  const c = q.counts;
  const lines = [
    '# 官方数据独立复核工作清单',
    '',
    '本地快照比较日期：' + q.asOfDate + '（UTC+08）。这是维护清单，不是已完成的研究结果、课程提交正文或录取判断。',
    '',
    '## 当前范围与限制',
    '',
    '- 目录 ' + c.catalogueRecords + ' 条；项目页记录 ' + c.programmePageRecords + ' 条；其余 ' + c.remainingCatalogueLeads + ' 条仍是目录线索，不能全部视为范围内或开放申请。',
    '- 项目记录 ' + c.programmePageRecords + '、具体方向 ' + c.routeRecords + '、费用／日期上下文 ' + c.applicantContexts + ' 分开核对，共 ' + c.reviewUnits + ' 个工作单元，不是 ' + c.reviewUnits + ' 个项目。上下文内共有 ' + c.applicantCategories + ' 个类别选项。',
    '- 待人工复核 ' + c.pendingHumanReview + ' 个单元；来源中记录复核 ' + c.reviewRecordedInSource + ' 个；本工具不核实身份、不批准复核、不写回数据库，也不新增人工贡献记录。',
    '- 有记录截止落在快照日起 14 天内的单元 ' + c.nearCutoffUnits + ' 个；不等于现在可申请，不安排提醒。失配费用上下文 ' + c.staleApplicantContexts + ' 个。',
    '',
    '## 人工实际操作',
    '',
    '1. 由真实复核者打开下列官方来源，确认学位类型、交付地点、批次、学制及页面日期；不要仅核对目录标题。',
    '2. 保留专业／学历替代路线、语言版本与豁免、申请时有效期、未公布 GPA 和所有人工判断条件，不把 unknown 改成通过或把 not_published 改成零门槛。',
    '3. 分开核对每个方向和费用类别；确认含税／按年或按项目、订金是否已计入、优惠资格、杂费、轮次和精确截止。不能用另一批次、学制或类别替代。',
    '4. 实际记录复核者、真实日期、所看页面或 PDF 页码、发现的差异及处理结论；未确认或存在冲突的内容继续留待确认。复核一个字段不代表整条招生要求完整。',
    '5. 本清单不能替代正式复核记录。不要在清单中自动填成员名字、签名、已完成日期或批准状态；公开仓库不保存私人资料或签名。',
    '',
    '原件复核提醒：来源备注中如有 PDF 仅文字可读、视觉未核对或下载遇到安全验证的限制，须由可正常访问的复核者查看原件，不能宣称视觉验证或独立人工复核完成。具体限制以各条人工条件与类别备注为准，不由本清单自动取消；不要绕过网站验证。',
    '',
    '## 项目记录',
    '',
    '| 优先顺序 | 稳定 ID／官方来源 | 原查阅日 | 尚未确认字段 | 未公布字段（不补造门槛） |',
    '| --- | --- | --- | --- | --- |'
  ];
  for (const u of q.units.filter(u => u.kind === 'programme')) lines.push('| ' + label[u.reviewOrder] + ' | ' + cell(u.programmeId) + ' · ' + linkedName(u) + ' | ' + cell(u.sourceCheckedOn) + ' | ' + cell(u.unconfirmedFields.join(', ') || '另查人工条件与完整性') + ' | ' + cell(u.notPublishedFields.join(', ') || '无此标签') + ' |');
  lines.push('', '## 方向记录（不继承兄弟方向结论）', '', '| 优先顺序 | 方向 ID／官方来源 | 原查阅日 | 尚未确认字段 |', '| --- | --- | --- | --- |');
  for (const u of q.units.filter(u => u.kind === 'route')) lines.push('| ' + label[u.reviewOrder] + ' | ' + cell(u.routeId) + ' · ' + linkedName(u) + ' | ' + cell(u.sourceCheckedOn) + ' | ' + cell(u.unconfirmedFields.join(', ') || '另查人工条件与完整性') + ' |');
  lines.push('', '## 费用／日期上下文（每一类别都要检查）', '', '| 优先顺序 | 项目／学习选项 | 方向 | 类别数 | 绑定一致 | 原查阅日 |', '| --- | --- | --- | ---: | --- | --- |');
  for (const u of q.units.filter(u => u.kind === 'applicant_context')) {
    const feeUrl = u.sources[0]?.url;
    const optionLink = isOfficialUrl(feeUrl) ? '[' + cell(u.offeringId) + '](<' + feeUrl + '>)' : cell(u.offeringId);
    lines.push('| ' + label[u.reviewOrder] + ' | ' + cell(u.programmeId) + ' / ' + optionLink + ' | ' + cell(u.routeId || '直接项目') + ' | ' + u.categories.length + ' | ' + (u.offeringFingerprintMatches ? '是，仍需人工复核' : '否，禁止套用价格日期') + ' | ' + cell(u.sourceCheckedOn) + ' |');
  }
  lines.push('', '## 截止优先项', '');
  const due = q.units.filter(u => u.upcomingRecordedCutoffs.length);
  if (!due.length) lines.push('快照日期下没有满足依据条件的 14 日内记录截止；这不证明没有遗漏的截止或所有项目都开放。');
  for (const u of due) for (const d of u.upcomingRecordedCutoffs) lines.push('- ' + cell(u.programmeId) + ' / ' + cell(d.offeringId) + (d.applicantId ? ' / ' + cell(d.applicantId) : '') + '：记录截止 ' + cell(d.deadline) + '，距快照 ' + d.daysFromSnapshot + ' 天；来源查阅 ' + cell(d.sourceCheckedOn) + '。须检查最新状态、类别和确切时间。');
  lines.push('', '## 可重复检查', '', '在仓库根目录运行（只读；使用 Node 24）：', '', '\x60\x60\x60text', 'node scripts/source-review-queue.mjs --as-of ' + q.asOfDate, 'node scripts/source-review-queue.mjs --as-of ' + q.asOfDate + ' --format markdown', '\x60\x60\x60', '', 'JSON 输出含逐条来源、字段说明、人工条件、类别与记录截止。快照日期不改写来源日期；不联网、不打开日常 SQLite 文件，不推送或部署。源数据修改后应重新检查，不把旧清单当成新资料的复核结果。', '', '语义化输入指纹（忽略 JSON 键顺序和换行差异）：', '');
  for (const [file, fingerprint] of Object.entries(q.inputFingerprints)) lines.push('- \x60' + file + '\x60: \x60' + fingerprint + '\x60');
  lines.push('', '清单指纹：\x60' + q.queueFingerprint + '\x60', '');
  return lines.join('\n');
}

export function parseReviewArgs(args) {
  if (args.length === 1 && args[0] === '--help') return { help: true };
  const result = { format: 'json' }, seen = new Set();
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i], value = args[i + 1];
    if (!['--as-of', '--format'].includes(key) || seen.has(key) || !value) throw new TypeError('Use --as-of YYYY-MM-DD [--format json|markdown]');
    seen.add(key); result[key === '--as-of' ? 'asOfDate' : 'format'] = value;
  }
  if (!validDate(result.asOfDate) || !['json', 'markdown'].includes(result.format)) throw new TypeError('An explicit real --as-of date and json|markdown format are required');
  return result;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const args = parseReviewArgs(process.argv.slice(2));
    if (args.help) console.log('Read-only source worklist: node scripts/source-review-queue.mjs --as-of YYYY-MM-DD [--format json|markdown]. No network, review approval, database persistence or publication.');
    else {
      const report = loadRepositoryReviewQueue(args.asOfDate);
      process.stdout.write(args.format === 'markdown' ? formatSourceReviewMarkdown(report) : JSON.stringify(report, null, 2) + '\n');
    }
  } catch (error) { console.error('Review worklist not generated: ' + error.message); process.exitCode = 1; }
}
