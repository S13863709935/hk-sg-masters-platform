import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { validateProgramme, validateDirectoryAudit, validateScopeAudit, validateDirectoryListing, InputError } from './validation.mjs';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => [key, canonical(value[key])])) : value;
const recordHash = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const withoutScope = ({ scope, directoryListing, university, ...p }) => p;

export class CatalogueStore {
  constructor(path, { seedPath, expansionPath, checkedPath, directoryAuditPath, scopeAuditPath, directoryEvidencePath, seed } = {}) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS universities (id TEXT PRIMARY KEY, document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS programmes (id TEXT PRIMARY KEY, university_id TEXT NOT NULL REFERENCES universities(id), document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS offerings (id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE, document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS requirements (id TEXT PRIMARY KEY, programme_id TEXT NOT NULL REFERENCES programmes(id) ON DELETE CASCADE, document TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS change_log (id INTEGER PRIMARY KEY, programme_id TEXT NOT NULL, changed_at TEXT NOT NULL, reason TEXT NOT NULL, previous_document TEXT, new_document TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS programmes_school ON programmes(university_id);
    `);
    if (!this.db.prepare('SELECT COUNT(*) AS n FROM programmes').get().n) {
      const snapshot = seed || JSON.parse(readFileSync(seedPath, 'utf8'));
      this.db.exec('BEGIN');
      try {
        for (const u of snapshot.universities) this.db.prepare('INSERT INTO universities VALUES (?, ?)').run(u.id, JSON.stringify(u));
        for (const p of snapshot.programmes) this.upsert(p, 'Initial catalogue seed');
        this.setMeta('snapshotDate', snapshot.snapshotDate);
        this.db.exec('COMMIT');
      } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    }
    if (expansionPath) {
      const text = readFileSync(expansionPath, 'utf8');
      const hash = createHash('sha256').update(text).digest('hex');
      if (this.getMeta('expansionHash') !== hash) {
        const batch = JSON.parse(text);
        if (batch.schemaVersion !== 1 || !Array.isArray(batch.programmes)) throw new InputError('Invalid directory expansion batch');
        if (batch.programmes?.some(p => p.verification !== 'catalogue_seed' || p.requirementsCoverage !== 'unreviewed' || p.reviewer || p.rules?.length)) throw new InputError('Directory expansion must contain unreviewed leads without admissions rules');
        // Never replace an existing record, including later checked/admin-imported data.
        const existingIds = new Set(this.db.prepare('SELECT id FROM programmes').all().map(p => p.id));
        const newRecords = batch.programmes.filter(p => !existingIds.has(p.id));
        if (newRecords.length) this.importBatch({ ...batch, programmes: newRecords }, 'Versioned directory expansion; admissions unreviewed');
        this.setMeta('expansionHash', hash);
      }
    }
    if (checkedPath) {
      const text = readFileSync(checkedPath, 'utf8');
      const hash = createHash('sha256').update(text).digest('hex');
      this.refreshCheckedBatch(JSON.parse(text), hash);
    }
    if (directoryAuditPath) {
      const text = readFileSync(directoryAuditPath, 'utf8');
      const hash = createHash('sha256').update(text).digest('hex');
      if (this.getMeta('directoryAuditHash') !== hash) {
        const audit = validateDirectoryAudit(JSON.parse(text), new Set(this.universities().map(u => u.id)));
        this.db.exec('BEGIN');
        try {
          const schools = new Map(this.universities().map(u => [u.id, u]));
          for (const entry of audit.universities) this.db.prepare('UPDATE universities SET document=? WHERE id=?').run(JSON.stringify({ ...schools.get(entry.universityId), directoryUrl: entry.directoryUrl, directoryAudit: entry }), entry.universityId);
          this.setMeta('directoryAuditDate', audit.checkedOn);
          this.setMeta('directoryAuditHash', hash);
          this.db.exec('COMMIT');
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
      }
    }
    if (scopeAuditPath) {
      const text = readFileSync(scopeAuditPath, 'utf8');
      const hash = createHash('sha256').update(text).digest('hex');
      if (this.getMeta('scopeAuditHash') !== hash) {
        const audit = validateScopeAudit(JSON.parse(text), new Set(this.all().map(p => p.id)));
        this.db.exec('BEGIN');
        try {
          for (const { programmeId, ...scope } of audit.decisions) {
            const { university, ...p } = this.get(programmeId);
            this.upsert({ ...p, scope }, 'Versioned programme-scope correction; admissions fields preserved');
          }
          this.setMeta('scopeAuditDate', audit.checkedOn);
          this.setMeta('scopeAuditHash', hash);
          this.db.exec('COMMIT');
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
      }
    }
    if (directoryEvidencePath) {
      const text = readFileSync(directoryEvidencePath, 'utf8');
      const hash = createHash('sha256').update(text).digest('hex');
      if (this.getMeta('directoryLinksHash') !== hash) {
        const batch = JSON.parse(text), ids = new Set(this.all().map(p=>p.id));
        if (batch?.schemaVersion !== 1 || !Array.isArray(batch.listings) || batch.listings.length > 1000 || new Set(batch.listings.map(p=>p?.programmeId)).size !== batch.listings.length) throw new InputError('Invalid directory evidence batch');
        for (const listing of batch.listings) { if (!ids.has(listing?.programmeId)) throw new InputError('Directory evidence refers to an unknown programme'); validateDirectoryListing(listing); }
        this.db.exec('BEGIN');
        try {
          for (const { programmeId, ...directoryListing } of batch.listings) {
            const { university, ...p } = this.get(programmeId);
            this.upsert({ ...p, directoryListing }, 'Versioned directory links and route evidence; admissions fields preserved');
          }
          this.setMeta('directoryLinksHash', hash);
          this.setMeta('directoryLinksDate', batch.checkedOn);
          this.db.exec('COMMIT');
        } catch (error) { this.db.exec('ROLLBACK'); throw error; }
      }
    }
  }
  setMeta(key, value) { this.db.prepare('INSERT INTO metadata VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, value); }
  getMeta(key) { return this.db.prepare('SELECT value FROM metadata WHERE key=?').get(key)?.value || null; }
  universities() { return this.db.prepare('SELECT document FROM universities ORDER BY id').all().map(r => JSON.parse(r.document)); }
  all() {
    const schools = new Map(this.universities().map(u => [u.id, u]));
    return this.db.prepare('SELECT document FROM programmes').all().map(r => { const p = JSON.parse(r.document); return { ...p, university: schools.get(p.universityId) }; });
  }
  get(id) {
    const row = this.db.prepare('SELECT p.document, u.document AS school_document FROM programmes p JOIN universities u ON p.university_id=u.id WHERE p.id=?').get(id);
    return row ? { ...JSON.parse(row.document), university: JSON.parse(row.school_document) } : null;
  }
  upsert(p, reason) {
    validateProgramme(p, new Set(this.universities().map(u => u.id)));
    const previous = this.db.prepare('SELECT document FROM programmes WHERE id=?').get(p.id)?.document || null;
    const document = JSON.stringify(p);
    this.db.prepare('INSERT INTO programmes VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET university_id=excluded.university_id, document=excluded.document').run(p.id, p.universityId, document);
    this.db.prepare('DELETE FROM offerings WHERE programme_id=?').run(p.id);
    this.db.prepare('DELETE FROM requirements WHERE programme_id=?').run(p.id);
    for (const o of p.offerings) this.db.prepare('INSERT INTO offerings VALUES (?, ?, ?)').run(o.id, p.id, JSON.stringify(o));
    p.rules.forEach((r, i) => this.db.prepare('INSERT INTO requirements VALUES (?, ?, ?)').run(`${p.id}-R${i + 1}`, p.id, JSON.stringify(r)));
    if (previous !== document) this.db.prepare('INSERT INTO change_log(programme_id,changed_at,reason,previous_document,new_document) VALUES (?, ?, ?, ?, ?)').run(p.id, new Date().toISOString(), reason, previous, document);
  }
  importBatch(batch, reason) {
    if (batch?.schemaVersion !== 1 || !Array.isArray(batch.programmes) || !batch.programmes.length || batch.programmes.length > 1000) throw new InputError('Invalid import batch');
    if (new Set(batch.programmes.map(p => p.id)).size !== batch.programmes.length) throw new InputError('Duplicate programme IDs in batch');
    this.db.exec('BEGIN');
    try { for (const p of batch.programmes) this.upsert(p, reason); this.db.exec('COMMIT'); } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { imported: batch.programmes.length };
  }
  refreshCheckedBatch(batch, fileHash) {
    if (batch?.schemaVersion !== 1 || !Array.isArray(batch.programmes) || !batch.programmes.length || batch.programmes.length > 1000 || new Set(batch.programmes.map(p => p.id)).size !== batch.programmes.length) throw new InputError('Invalid checked source batch');
    const universityIds = new Set(this.universities().map(u => u.id));
    for (const p of batch.programmes) validateProgramme(p, universityIds);
    const sameLegacyBatch = this.getMeta('checkedHash') === fileHash;
    const pendingConflicts = new Set(JSON.parse(this.getMeta('sourceRefreshConflicts') || '[]'));
    const conflicts = [];
    this.db.exec('BEGIN');
    try {
      for (const incoming of batch.programmes) {
        const key = `checkedRecordHash:${incoming.id}`;
        const previousHash = this.getMeta(key);
        const nextHash = recordHash(withoutScope(incoming));
        // An unchanged source record must never replace a later manual update.
        if (previousHash === nextHash) continue;
        // Migrate older stores without rewriting their existing documents.
        if (!previousHash && sameLegacyBatch && !pendingConflicts.has(incoming.id)) { this.setMeta(key, nextHash); continue; }
        const current = this.get(incoming.id);
        const latest = this.db.prepare('SELECT reason FROM change_log WHERE programme_id=? ORDER BY id DESC LIMIT 1').get(incoming.id);
        const legacySource = this.db.prepare("SELECT new_document FROM change_log WHERE programme_id=? AND reason='Versioned official-page checks' ORDER BY id DESC LIMIT 1").get(incoming.id);
        // A directory/scope overlay does not change an untouched lead's admission baseline.
        const catalogueSource = this.db.prepare("SELECT new_document FROM change_log WHERE programme_id=? AND reason IN ('Initial catalogue seed', 'Versioned directory expansion; admissions unreviewed') ORDER BY id DESC LIMIT 1").get(incoming.id);
        const baseline = legacySource || catalogueSource;
        const expectedHash = previousHash || (baseline ? recordHash(withoutScope(JSON.parse(baseline.new_document))) : null);
        const safeToRefresh = !current || (current.verification !== 'peer_reviewed' && (latest?.reason === 'Initial catalogue seed' || recordHash(withoutScope(current)) === expectedHash));
        if (safeToRefresh) {
          this.upsert({ ...incoming, ...(current?.scope ? { scope: current.scope } : {}), ...(current?.directoryListing ? { directoryListing: current.directoryListing } : {}) }, 'Versioned official-page checks');
          this.setMeta(key, nextHash);
        } else conflicts.push(incoming.id);
      }
      this.setMeta('checkedHash', fileHash);
      this.setMeta('sourceRefreshConflicts', JSON.stringify(conflicts));
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  quality() {
    const all = this.all();
    return {
      total: all.length, universities: this.universities().length,
      browsable: all.filter(p => p.admissionRoute !== 'transfer_only' && p.scope?.status !== 'out_of_scope').length,
      checked: all.filter(p => ['programme_page_checked', 'peer_reviewed'].includes(p.verification)).length,
      peerReviewed: all.filter(p => p.verification === 'peer_reviewed').length,
      complete: all.filter(p => p.requirementsCoverage === 'complete').length,
      transferOnly: all.filter(p => p.admissionRoute === 'transfer_only').length,
      outOfScope: all.filter(p => p.scope?.status === 'out_of_scope').length,
      scopeAuditDate: this.getMeta('scopeAuditDate'),
      sourceRefreshConflicts: JSON.parse(this.getMeta('sourceRefreshConflicts') || '[]'),
      snapshotDate: this.getMeta('snapshotDate'),
      directoryAuditDate: this.getMeta('directoryAuditDate'),
      enumeratedUniversities: this.universities().filter(u => u.directoryAudit?.enumerationStatus === 'complete_for_consulted_directory').length,
      schools: this.universities().map(u => ({ ...u, seeds: all.filter(p => p.universityId === u.id).length, checked: all.filter(p => p.universityId === u.id && ['programme_page_checked', 'peer_reviewed'].includes(p.verification)).length, peerReviewed: all.filter(p => p.universityId === u.id && p.verification === 'peer_reviewed').length })),
    };
  }
  export() { return { schemaVersion: 1, exportedAt: new Date().toISOString(), snapshotDate: this.getMeta('snapshotDate'), universities: this.universities(), programmes: this.all().map(({ university, ...p }) => p) }; }
  close() { this.db.close(); }
}
