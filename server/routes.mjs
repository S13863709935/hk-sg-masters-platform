import { readFileSync } from 'node:fs';
import { InputError, validateProgramme, isOfficialUrl } from './validation.mjs';
import { resolveOffering } from './offerings.mjs';

// A client/import cannot assert this trust marker by adding a JSON property.
const resolvedRoutes = new WeakSet();
export const hasResolvedRoute = programme => resolvedRoutes.has(programme);
const isDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function loadRoutes(path, programmes) {
  const index = new Map();
  if (!path) return index;
  const batch = JSON.parse(readFileSync(path, 'utf8'));
  if (batch?.schemaVersion !== 1 || !isDate(batch.checkedOn) || !Array.isArray(batch.programmes) || batch.programmes.length > 1000) throw new InputError('Invalid route evidence batch');
  const bases = new Map(programmes.map(p => [p.id, p]));
  for (const group of batch.programmes) {
    const base = bases.get(group?.programmeId);
    if (!base || index.has(base.id) || !Array.isArray(group.routes) || !group.routes.length || group.routes.length > 50 || !base.directoryListing?.variants.length) throw new InputError('Route evidence requires a unique grouped programme');
    const ids = new Set();
    const routes = group.routes.map(route => {
      if (!route || typeof route.routeId !== 'string' || !route.routeId.startsWith(`${base.id}-ROUTE-`) || !/^[A-Z0-9-]+$/.test(route.routeId) || route.routeId.length > 100 || ids.has(route.routeId)) throw new InputError('Invalid or duplicate route ID');
      ids.add(route.routeId);
      if (!base.directoryListing.variants.some(v => v.officialUrl === route.officialUrl && v.nameEn === route.name)) throw new InputError('Route must match explicit directory evidence');
      if (route.lastChecked !== batch.checkedOn || !Array.isArray(route.sources) || !route.sources.some(s => s.url === route.officialUrl && s.checkedOn === route.lastChecked) || route.sources.some(s => !isOfficialUrl(s.url) || s.checkedOn !== route.lastChecked)) throw new InputError('Route evidence date or programme source is missing');
      // A full standalone snapshot is mandatory: never spread the parent/sibling rules.
      const record = { ...route, id: base.id, universityId: base.universityId };
      validateProgramme(record, new Set([base.universityId]));
      if (record.offerings.some(o => o.applicationOpen && (!isDate(o.applicationOpen) || (o.deadline && o.applicationOpen > o.deadline)))) throw new InputError('Invalid route application window');
      return record;
    });
    index.set(base.id, routes);
  }
  return index;
}

export function resolveRoute(base, index, routeId) {
  const routes = index.get(base.id) || [];
  const routeOptions = routes.map(r => ({ id: r.routeId, name: r.name, checkedOn: r.lastChecked, verification: r.verification, requirementsCoverage: r.requirementsCoverage }));
  if (!routeId) return routes.length ? { ...base, routeOptions } : base;
  const route = routes.find(r => r.routeId === routeId);
  if (!route) throw new InputError('Unknown route for this programme');
  const result = { ...route, id: base.id, universityId: base.universityId, university: base.university, directoryListing: base.directoryListing, ...(base.scope ? { scope: base.scope } : {}), routeOptions, selectedRoute: { id: route.routeId, name: route.name } };
  resolvedRoutes.add(result);
  return result;
}

export function validateSelections(input, programmes, index) {
  if (input === undefined) return {};
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).length > 1000) throw new InputError('Invalid programme-route selections');
  const bases = new Map(programmes.map(p => [p.id, p]));
  for (const [id, route] of Object.entries(input)) {
    if (!bases.has(id) || typeof route !== 'string' || !route) throw new InputError('Invalid programme-route selection');
    resolveRoute(bases.get(id), index, route);
  }
  return input;
}

export function resolveProgramme(base, index, routeId, offeringId) {
  const routed = resolveRoute(base, index, routeId);
  if (routed.directoryListing?.variants.length && !hasResolvedRoute(routed)) {
    if (offeringId) throw new InputError('Choose a verified specific route before choosing a study option');
    return routed;
  }
  const result = resolveOffering(routed, offeringId);
  // Preserve trust only across this server-owned projection, never from JSON.
  if (hasResolvedRoute(routed)) resolvedRoutes.add(result);
  return result;
}

export function routeSummary(index) {
  const all = [...index.values()].flat();
  return { groups: index.size, routes: all.length, pageChecked: all.filter(p => ['programme_page_checked', 'peer_reviewed'].includes(p.verification)).length, peerReviewed: all.filter(p => p.verification === 'peer_reviewed').length, complete: all.filter(p => p.requirementsCoverage === 'complete').length };
}
