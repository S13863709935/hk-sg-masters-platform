import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { InputError, isOfficialUrl, universityDomains } from './validation.mjs';
import { validApplicationRounds } from './application-rounds.mjs';

const trustedDates = new WeakSet();
export const hasApplicantDateEvidence = offering => trustedDates.has(offering);
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])])) : value;
export const offeringFingerprint = o => createHash('sha256').update(JSON.stringify(canonical(o))).digest('hex');
const date = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const key = (p, route, offering) => `${p}|${route || ''}|${offering}`;
const matches = (record, o) => o && o.mode === record.mode && o.intake === record.intake && o.academicYear === record.academicYear && offeringFingerprint(o) === record.offeringFingerprint;
const evidence = record => ({ checkedOn: record.checkedOn, verification: record.verification, reviewer: null, feeSourceUrl: record.feeSourceUrl, dateSourceUrl: record.dateSourceUrl, noteEn: record.noteEn });
const institutionDomain = value => {
  if (!isOfficialUrl(value)) return null;
  const host = new URL(value).hostname;
  return universityDomains.find(domain => host === domain || host.endsWith(`.${domain}`));
};

export function loadApplicantContexts(path, programmes, routes = new Map()) {
  const index = new Map();
  if (!path) return index;
  const batch = JSON.parse(readFileSync(path, 'utf8'));
  if (batch?.schemaVersion !== 1 || !date(batch.checkedOn) || !Array.isArray(batch.contexts) || batch.contexts.length > 1000) throw new InputError('Invalid applicant-category evidence batch');
  for (const r of batch.contexts) {
    const base = programmes.find(p => p.id === r?.programmeId);
    const p = r?.routeId ? routes.get(base?.id)?.find(route => route.routeId === r.routeId) : base;
    const ownSource = value => p && institutionDomain(value) && institutionDomain(value) === institutionDomain(p.officialUrl);
    if (!p || (r.routeId !== null && typeof r.routeId !== 'string') || r.officialUrl !== p.officialUrl || !p.offerings.some(o => o.id === r.offeringId) || !/^[a-f0-9]{64}$/.test(r.offeringFingerprint || '') || !r.academicYear || !r.intake || !r.mode || !date(r.checkedOn) || r.checkedOn > batch.checkedOn || r.verification !== 'programme_page_checked' || r.reviewer !== null || !ownSource(r.feeSourceUrl) || !ownSource(r.dateSourceUrl) || typeof r.noteEn !== 'string' || r.noteEn.length > 2000) throw new InputError('Invalid applicant-category identity or evidence');
    const contextKey = key(base.id, r.routeId, r.offeringId);
    // An official local-only intake can have one supported category; selection is still explicit.
    if (index.has(contextKey) || !Array.isArray(r.options) || r.options.length < 1 || r.options.length > 20 || new Set(r.options.map(o => o?.id)).size !== r.options.length) throw new InputError('Missing or duplicate applicant categories');
    for (const o of r.options) {
      if (o?.tuitionEstimate !== undefined && typeof o.tuitionEstimate !== 'boolean') throw new InputError('Invalid tuition estimate flag');
      if (o && !validApplicationRounds(o.applicationRounds, o)) throw new InputError('Invalid applicant-category application rounds');
      // A category can retain a known fee while its deadline is unresolved (and vice versa).
      // Only explicit null represents an unknown date; malformed or missing values still fail.
      if (!o || typeof o.id !== 'string' || !o.id.startsWith(`${r.offeringId}-`) || !/^[A-Z0-9-]+$/.test(o.id) || o.id.length > 200 || typeof o.label !== 'string' || !o.label.trim() || o.label.length > 150 || !/^[A-Z]{3}$/.test(o.currency) || (o.tuition !== null && (!Number.isFinite(o.tuition) || o.tuition < 0)) || (o.applicationFee !== null && (!Number.isFinite(o.applicationFee) || o.applicationFee < 0)) || typeof o.feeBasis !== 'string' || !o.feeBasis || (o.deadline !== null && !date(o.deadline)) || (o.applicationOpen !== null && (!date(o.applicationOpen) || (o.deadline !== null && o.applicationOpen > o.deadline))) || (o.deadlineNote !== undefined && (typeof o.deadlineNote !== 'string' || o.deadlineNote.length > 2000))) throw new InputError('Invalid applicant-category fees or dates');
    }
    index.set(contextKey, r);
  }
  if (batch.contexts.length && batch.checkedOn !== batch.contexts.map(r => r.checkedOn).sort().at(-1)) throw new InputError('Applicant batch date must identify the latest source observation');
  return index;
}

export function resolveApplicantContext(programme, index = new Map(), applicantId) {
  const routeId = programme.selectedRoute?.id;
  const originals = programme.offeringOptions || programme.offerings;
  const selected = programme.selectedOffering;
  if (applicantId && !selected) throw new InputError('Choose a study option before an applicant category');
  const record = selected && index.get(key(programme.id, routeId, selected.id));
  const original = selected && originals.find(o => o.id === selected.id);
  const current = record && matches(record, original);
  if (applicantId && (!current || !record.options.some(o => o.id === applicantId))) throw new InputError('Unknown or stale applicant category for this programme, route and study option');
  const project = o => {
    const r = index.get(key(programme.id, routeId, o.id));
    if (!r) return o;
    const valid = matches(r, originals.find(option => option.id === o.id));
    // Never present an old non-local amount/date as a universal/default value.
    const { applicationRounds, ...withoutRounds } = o;
    const masked = { ...withoutRounds, tuition: null, applicationFee: null, applicationOpen: null, deadline: null, deadlineNote: valid ? 'Choose the university-specific applicant category to resolve recorded fees and dates.' : 'Applicant-category evidence needs reconciliation after a source change.', feeBasis: 'Applicant category required; no default fee is assumed.', applicantCategoryRequired: true };
    if (valid) {
      masked.applicantDateEvidence = { sourceUrl: r.dateSourceUrl, checkedOn: r.checkedOn };
      trustedDates.add(masked);
    }
    return masked;
  };
  if (!record && !originals.some(o => index.has(key(programme.id, routeId, o.id)))) return programme;
  const result = { ...programme, offerings: programme.offerings.map(project), offeringOptions: originals.map(project) };
  if (record) {
    result.applicantEvidence = evidence(record);
    result.applicantContextStatus = current ? 'available' : 'stale';
    result.applicantOptions = current ? record.options.map(o => ({ ...o })) : [];
  }
  if (applicantId) {
    const category = record.options.find(o => o.id === applicantId);
    // A category without round evidence must not inherit rounds from another scope.
    const { applicationRounds, ...withoutRounds } = original;
    const offering = { ...withoutRounds, ...(category.applicationRounds ? { applicationRounds: structuredClone(category.applicationRounds) } : {}), tuition: category.tuition, currency: category.currency, feeBasis: category.feeBasis, applicationFee: category.applicationFee, applicationOpen: category.applicationOpen, deadline: category.deadline, deadlineNote: category.deadlineNote || 'Recorded category-specific deadline; exact cutoff time and live portal availability are not verified.', applicantCategory: { id: category.id, label: category.label }, applicantDateEvidence: { sourceUrl: record.dateSourceUrl, checkedOn: record.checkedOn }, feeEvidence: { sourceUrl: record.feeSourceUrl, checkedOn: record.checkedOn } };
    trustedDates.add(offering);
    if (category.tuitionEstimate === true) offering.tuitionEstimate = true;
    result.offerings = [offering];
    result.selectedApplicant = { id: category.id, label: category.label };
  }
  return result;
}

export function validateApplicantSelections(input, programmes) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 1000) throw new InputError('Invalid applicant-category selections');
  const ids = new Set(programmes.map(p => p.id));
  for (const [id, choice] of Object.entries(input)) if (!ids.has(id) || typeof choice !== 'string' || !choice || choice.length > 200) throw new InputError('Invalid applicant-category selection');
  return input;
}

export const applicantSummary = index => ({ studyOptions: index.size, categories: [...index.values()].reduce((sum, r) => sum + r.options.length, 0), peerReviewed: 0 });
