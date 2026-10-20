import { readFileSync } from 'node:fs';
import { CatalogueStore } from '../server/database.mjs';
import { loadRoutes, routeSummary } from '../server/routes.mjs';
import { loadApplicantContexts, applicantSummary } from '../server/applicants.mjs';

const root = new URL('../', import.meta.url);
const seed = JSON.parse(readFileSync(new URL('data/catalogue.json', root), 'utf8'));
if (seed.universities.length !== 14 || seed.programmes.length !== 175) throw new Error('Source snapshot count changed unexpectedly');
const store = new CatalogueStore(':memory:', { seed, expansionPath: new URL('data/catalogue-expansion.json', root), checkedPath: new URL('data/checked-programmes.json', root), directoryAuditPath: new URL('data/directory-audit.json', root), scopeAuditPath: new URL('data/programme-scope-audit.json', root), directoryEvidencePath: new URL('data/directory-links.json', root) });
try {
  const q = store.quality();
  const routes = loadRoutes(new URL('data/route-programmes.json', root), store.all());
  const applicants = loadApplicantContexts(new URL('data/applicant-contexts.json', root), store.all(), routes);
  console.log(JSON.stringify({ ...q, routeEvidence: routeSummary(routes), applicantEvidence: applicantSummary(applicants) }, null, 2));
  const expansion = JSON.parse(readFileSync(new URL('data/catalogue-expansion.json', root), 'utf8'));
  if (q.peerReviewed > q.checked || q.total !== 175 + expansion.programmes.length) throw new Error('Quality counts do not reconcile');
} finally { store.close(); }
