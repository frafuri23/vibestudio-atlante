// Real SQLite persistence for native builds (iOS/Android). NOT executed by the web
// preview (see lib/db/repository.ts) — this file only runs inside a native build.
import * as SQLite from "expo-sqlite";
import { Repository } from "./repository";
import {
  AppSettingsRecord,
  IndexJobStatus,
  MemoryChapter,
  Place,
  PhotoAsset,
  PhotoOverride,
  PrivateZone,
  QuizQuestionRecord,
  QuizSessionRecord,
  ShareDraftRecord,
  Visit,
} from "../types";

const DB_NAME = "atlante.db";

export class NativeSqliteRepository implements Repository {
  backend: "native_sqlite" = "native_sqlite";
  private db: SQLite.SQLiteDatabase | null = null;

  private async getDb(): Promise<SQLite.SQLiteDatabase> {
    if (!this.db) this.db = await SQLite.openDatabaseAsync(DB_NAME);
    return this.db;
  }

  async init(): Promise<void> {
    const db = await this.getDb();
    // Versioned schema — matches the subset of docs/IMPLEMENTATION_PLAN.md needed
    // by this build. Foreign keys enabled; indices on lookup columns.
    // WAL: page commits during a scan no longer block the reads the UI does meanwhile,
    // and each commit is a cheap append instead of a full journal rewrite.
    try {
      await db.execAsync(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;`);
    } catch (e: any) {
      console.warn("[Atlante] WAL not enabled", e?.message ?? e);
    }
    await db.execAsync(`
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS photo_overrides (
        photo_id TEXT PRIMARY KEY,
        manual_latitude REAL,
        manual_longitude REAL,
        manual_date INTEGER,
        exclude_from_app INTEGER NOT NULL DEFAULT 0,
        exclude_from_quiz INTEGER NOT NULL DEFAULT 0,
        exclude_from_sharing INTEGER NOT NULL DEFAULT 0,
        favorite_local INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS places (
        id TEXT PRIMARY KEY,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        level TEXT NOT NULL,
        name TEXT,
        provenance TEXT NOT NULL,
        confirmed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        period_start INTEGER,
        period_end INTEGER,
        cover_photo_id TEXT,
        origin TEXT NOT NULL,
        status TEXT NOT NULL,
        user_edited INTEGER NOT NULL DEFAULT 0,
        algorithm_version INTEGER NOT NULL DEFAULT 1,
        photo_ids TEXT NOT NULL DEFAULT '[]',
        place_name TEXT
      );
      CREATE TABLE IF NOT EXISTS memory_photos (
        memory_id TEXT NOT NULL,
        photo_id TEXT NOT NULL,
        ord INTEGER NOT NULL DEFAULT 0,
        explicit_inclusion INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (memory_id, photo_id)
      );
      CREATE TABLE IF NOT EXISTS visits (
        id TEXT PRIMARY KEY,
        place_id TEXT,
        start_at INTEGER NOT NULL,
        end_at INTEGER NOT NULL,
        status TEXT NOT NULL,
        algorithm_version INTEGER NOT NULL DEFAULT 1
      );
      CREATE TABLE IF NOT EXISTS visit_photos (
        visit_id TEXT NOT NULL,
        photo_id TEXT NOT NULL,
        ord INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (visit_id, photo_id)
      );
      CREATE TABLE IF NOT EXISTS photo_assets (
        id TEXT PRIMARY KEY,
        library_asset_id TEXT UNIQUE,
        kind TEXT NOT NULL DEFAULT 'photo',
        width INTEGER NOT NULL DEFAULT 0,
        height INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER,
        modified_at INTEGER,
        latitude REAL,
        longitude REAL,
        location_source TEXT NOT NULL DEFAULT 'none',
        media_subtype TEXT NOT NULL DEFAULT 'photo',
        cloud_availability TEXT NOT NULL DEFAULT 'unknown',
        uri TEXT NOT NULL,
        is_demo INTEGER NOT NULL DEFAULT 0,
        metadata_status TEXT NOT NULL DEFAULT 'ok',
        scan_generation INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS quiz_sessions (
        id TEXT PRIMARY KEY,
        mode TEXT NOT NULL,
        seed TEXT NOT NULL,
        status TEXT NOT NULL,
        question_index INTEGER NOT NULL DEFAULT 0,
        score INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        completed_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS quiz_questions (
        session_id TEXT NOT NULL,
        photo_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        choices TEXT,
        correct_index INTEGER,
        given_index INTEGER,
        outcome TEXT,
        PRIMARY KEY (session_id, photo_id)
      );
      CREATE TABLE IF NOT EXISTS private_zones (
        id TEXT PRIMARY KEY,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radius_meters REAL NOT NULL,
        scope TEXT NOT NULL DEFAULT 'whole_app',
        label TEXT
      );
      CREATE TABLE IF NOT EXISTS share_drafts (
        id TEXT PRIMARY KEY,
        format TEXT NOT NULL,
        selected_photo_ids TEXT NOT NULL DEFAULT '[]',
        precision_settings TEXT NOT NULL DEFAULT '{}',
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        approved_revision INTEGER
      );
      CREATE TABLE IF NOT EXISTS app_settings (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        reduce_motion_override INTEGER,
        language TEXT NOT NULL DEFAULT 'it',
        demo_dismissed INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS index_jobs (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        phase TEXT NOT NULL,
        scanned INTEGER NOT NULL DEFAULT 0,
        total INTEGER,
        cursor TEXT,
        scan_mode TEXT NOT NULL DEFAULT 'real',
        generation INTEGER NOT NULL DEFAULT 0,
        last_error TEXT,
        observed_permission TEXT NOT NULL DEFAULT 'unknown'
      );
    `);
    // Existing TestFlight installs created these tables with an OLDER column set.
    // CREATE TABLE IF NOT EXISTS never adds columns, so every column introduced
    // later is added here (checked via PRAGMA table_info, so it is idempotent).
    // Without this, the first INSERT that names a new column (scan_generation,
    // metadata_status...) failed, no page and no checkpoint was ever saved, and
    // every launch started the scan over with an empty map.
    await this.migrateColumns(db, "photo_assets", [
      ["library_asset_id", "TEXT"],
      ["kind", "TEXT NOT NULL DEFAULT 'photo'"],
      ["width", "INTEGER NOT NULL DEFAULT 0"],
      ["height", "INTEGER NOT NULL DEFAULT 0"],
      ["created_at", "INTEGER"],
      ["modified_at", "INTEGER"],
      ["latitude", "REAL"],
      ["longitude", "REAL"],
      ["location_source", "TEXT NOT NULL DEFAULT 'none'"],
      ["media_subtype", "TEXT NOT NULL DEFAULT 'photo'"],
      ["cloud_availability", "TEXT NOT NULL DEFAULT 'unknown'"],
      ["uri", "TEXT NOT NULL DEFAULT ''"],
      ["is_demo", "INTEGER NOT NULL DEFAULT 0"],
      ["metadata_status", "TEXT NOT NULL DEFAULT 'ok'"],
      ["scan_generation", "INTEGER NOT NULL DEFAULT 0"],
    ]);
    await this.migrateColumns(db, "index_jobs", [
      ["scanned", "INTEGER NOT NULL DEFAULT 0"],
      ["total", "INTEGER"],
      ["cursor", "TEXT"],
      ["scan_mode", "TEXT NOT NULL DEFAULT 'real'"],
      ["generation", "INTEGER NOT NULL DEFAULT 0"],
      ["start_generation", "INTEGER"],
      ["last_error", "TEXT"],
      ["observed_permission", "TEXT NOT NULL DEFAULT 'unknown'"],
    ]);
    await this.migrateColumns(db, "memories", [
      ["period_start", "INTEGER"],
      ["period_end", "INTEGER"],
      ["cover_photo_id", "TEXT"],
      ["user_edited", "INTEGER NOT NULL DEFAULT 0"],
      ["algorithm_version", "INTEGER NOT NULL DEFAULT 1"],
      ["photo_ids", "TEXT NOT NULL DEFAULT '[]'"],
      ["place_name", "TEXT"],
    ]);
    await this.migrateColumns(db, "app_settings", [
      ["reduce_motion_override", "INTEGER"],
      ["language", "TEXT NOT NULL DEFAULT 'it'"],
      ["demo_dismissed", "INTEGER NOT NULL DEFAULT 0"],
    ]);
    await this.migrateColumns(db, "private_zones", [
      ["scope", "TEXT NOT NULL DEFAULT 'whole_app'"],
      ["label", "TEXT"],
    ]);
    // Indices on migrated columns are created only AFTER the columns exist; one
    // failing index must not abort startup (it is an optimisation, not data).
    // ALL indices live here (none in the CREATE TABLE batch above): an index on a
    // column an old install lacks would otherwise abort the whole init().
    for (const sql of [
      `CREATE INDEX IF NOT EXISTS idx_places_coords ON places(latitude, longitude);`,
      `CREATE INDEX IF NOT EXISTS idx_memories_period ON memories(period_start, period_end);`,
      `CREATE INDEX IF NOT EXISTS idx_memory_photos_memory ON memory_photos(memory_id);`,
      `CREATE INDEX IF NOT EXISTS idx_visit_photos_visit ON visit_photos(visit_id);`,
      `CREATE INDEX IF NOT EXISTS idx_quiz_questions_session ON quiz_questions(session_id);`,
      `CREATE INDEX IF NOT EXISTS idx_photo_assets_created ON photo_assets(created_at);`,
      `CREATE INDEX IF NOT EXISTS idx_photo_assets_coords ON photo_assets(latitude, longitude);`,
      `CREATE INDEX IF NOT EXISTS idx_photo_assets_generation ON photo_assets(scan_generation);`,
      `CREATE INDEX IF NOT EXISTS idx_photo_assets_demo ON photo_assets(is_demo);`,
    ]) {
      try {
        await db.execAsync(sql);
      } catch (e: any) {
        console.warn("[Atlante] index creation skipped", e?.message ?? e);
      }
    }
  }

  /** Adds any missing column to an existing table. Idempotent. */
  private async migrateColumns(db: SQLite.SQLiteDatabase, table: string, columns: [string, string][]): Promise<void> {
    let existing: Set<string>;
    try {
      const info: any[] = await db.getAllAsync(`PRAGMA table_info(${table});`);
      existing = new Set(info.map((c) => String(c.name)));
    } catch (e: any) {
      console.warn(`[Atlante] cannot inspect table ${table}`, e?.message ?? e);
      return;
    }
    for (const [name, def] of columns) {
      if (existing.has(name)) continue;
      try {
        await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${name} ${def};`);
        console.warn(`[Atlante] migrated ${table}.${name}`);
      } catch (e: any) {
        console.warn(`[Atlante] migration failed for ${table}.${name}`, e?.message ?? e);
      }
    }
  }

  async upsertOverride(o: PhotoOverride): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO photo_overrides (photo_id, manual_latitude, manual_longitude, manual_date, exclude_from_app, exclude_from_quiz, exclude_from_sharing, favorite_local)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(photo_id) DO UPDATE SET manual_latitude=excluded.manual_latitude, manual_longitude=excluded.manual_longitude,
         manual_date=excluded.manual_date, exclude_from_app=excluded.exclude_from_app, exclude_from_quiz=excluded.exclude_from_quiz,
         exclude_from_sharing=excluded.exclude_from_sharing, favorite_local=excluded.favorite_local;`,
      [
        o.photoId,
        o.manualLatitude,
        o.manualLongitude,
        o.manualDate,
        o.excludeFromApp ? 1 : 0,
        o.excludeFromQuiz ? 1 : 0,
        o.excludeFromSharing ? 1 : 0,
        o.favoriteLocal ? 1 : 0,
      ],
    );
  }

  async getOverride(photoId: string): Promise<PhotoOverride | null> {
    const db = await this.getDb();
    const row: any = await db.getFirstAsync(`SELECT * FROM photo_overrides WHERE photo_id = ?;`, [photoId]);
    return row ? rowToOverride(row) : null;
  }

  async listOverrides(): Promise<PhotoOverride[]> {
    const db = await this.getDb();
    const rows: any[] = await db.getAllAsync(`SELECT * FROM photo_overrides;`);
    return rows.map(rowToOverride);
  }

  async upsertPlace(p: Place): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO places (id, latitude, longitude, level, name, provenance, confirmed)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET latitude=excluded.latitude, longitude=excluded.longitude, level=excluded.level,
         name=excluded.name, provenance=excluded.provenance, confirmed=excluded.confirmed;`,
      [p.id, p.latitude, p.longitude, p.level, p.name, p.provenance, p.confirmed ? 1 : 0],
    );
  }

  async listPlaces(): Promise<Place[]> {
    const db = await this.getDb();
    const rows: any[] = await db.getAllAsync(`SELECT * FROM places;`);
    return rows.map((r) => ({
      id: r.id,
      latitude: r.latitude,
      longitude: r.longitude,
      level: r.level,
      name: r.name,
      provenance: r.provenance,
      confirmed: !!r.confirmed,
    }));
  }

  async upsertMemory(m: MemoryChapter): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO memories (id, title, period_start, period_end, cover_photo_id, origin, status, user_edited, algorithm_version, photo_ids, place_name)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET title=excluded.title, period_start=excluded.period_start, period_end=excluded.period_end,
         cover_photo_id=excluded.cover_photo_id, status=excluded.status, user_edited=excluded.user_edited,
         algorithm_version=excluded.algorithm_version, photo_ids=excluded.photo_ids, place_name=excluded.place_name;`,
      [
        m.id,
        m.title,
        m.periodStart,
        m.periodEnd,
        m.coverPhotoId,
        m.origin,
        m.status,
        m.userEdited ? 1 : 0,
        m.algorithmVersion,
        JSON.stringify(m.photoIds),
        m.placeName,
      ],
    );
    // memory_photos junction — write-through so the ordered relation exists as an
    // actual table (plan §3), not only the denormalized photo_ids column above.
    await db.runAsync(`DELETE FROM memory_photos WHERE memory_id = ?;`, [m.id]);
    await this.withStatement(
      db,
      `INSERT INTO memory_photos (memory_id, photo_id, ord, explicit_inclusion) VALUES (?, ?, ?, 1)
       ON CONFLICT(memory_id, photo_id) DO UPDATE SET ord=excluded.ord;`,
      async (run) => {
        for (let i = 0; i < m.photoIds.length; i++) await run([m.id, m.photoIds[i], i]);
      },
    );
  }

  /** Prepares a statement once, runs it many times, always finalizes it. Re-preparing
   * the same SQL for every row was the dominant cost of writing big batches. */
  private async withStatement(
    db: SQLite.SQLiteDatabase,
    sql: string,
    fn: (run: (params: any[]) => Promise<void>) => Promise<void>,
  ): Promise<void> {
    const stmt = await db.prepareAsync(sql);
    try {
      await fn(async (params) => {
        await stmt.executeAsync(params);
      });
    } finally {
      await stmt.finalizeAsync();
    }
  }

  async replaceSuggestions(chapters: MemoryChapter[], visits: Visit[]): Promise<void> {
    const db = await this.getDb();
    await db.withTransactionAsync(async () => {
      // Drop suggestions that are no longer produced (never user-touched ones only).
      const keep = new Set(chapters.map((c) => c.id));
      const stale: any[] = await db.getAllAsync(`SELECT id FROM memories WHERE status = 'suggested' AND user_edited = 0;`);
      for (const r of stale) {
        if (keep.has(r.id)) continue;
        await db.runAsync(`DELETE FROM memories WHERE id = ?;`, [r.id]);
        await db.runAsync(`DELETE FROM memory_photos WHERE memory_id = ?;`, [r.id]);
      }
      await this.withStatement(
        db,
        `INSERT INTO memories (id, title, period_start, period_end, cover_photo_id, origin, status, user_edited, algorithm_version, photo_ids, place_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET title=excluded.title, period_start=excluded.period_start, period_end=excluded.period_end,
           cover_photo_id=excluded.cover_photo_id, status=excluded.status, user_edited=excluded.user_edited,
           algorithm_version=excluded.algorithm_version, photo_ids=excluded.photo_ids, place_name=excluded.place_name;`,
        async (run) => {
          for (const m of chapters) {
            await run([m.id, m.title, m.periodStart, m.periodEnd, m.coverPhotoId, m.origin, m.status, m.userEdited ? 1 : 0, m.algorithmVersion, JSON.stringify(m.photoIds), m.placeName]);
          }
        },
      );
      await this.withStatement(db, `DELETE FROM memory_photos WHERE memory_id = ?;`, async (run) => {
        for (const m of chapters) await run([m.id]);
      });
      await this.withStatement(
        db,
        `INSERT INTO memory_photos (memory_id, photo_id, ord, explicit_inclusion) VALUES (?, ?, ?, 1)
         ON CONFLICT(memory_id, photo_id) DO UPDATE SET ord=excluded.ord;`,
        async (run) => {
          for (const m of chapters) for (let i = 0; i < m.photoIds.length; i++) await run([m.id, m.photoIds[i], i]);
        },
      );
      // Visits are fully derived from the photos: replace them wholesale.
      await db.execAsync(`DELETE FROM visits; DELETE FROM visit_photos;`);
      await this.withStatement(
        db,
        `INSERT INTO visits (id, place_id, start_at, end_at, status, algorithm_version) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET start_at=excluded.start_at, end_at=excluded.end_at;`,
        async (run) => {
          for (const v of visits) await run([v.id, v.placeId, v.startAt, v.endAt, v.status, v.algorithmVersion]);
        },
      );
      await this.withStatement(
        db,
        `INSERT OR IGNORE INTO visit_photos (visit_id, photo_id, ord) VALUES (?, ?, ?);`,
        async (run) => {
          for (const v of visits) for (let i = 0; i < v.photoIds.length; i++) await run([v.id, v.photoIds[i], i]);
        },
      );
    });
  }

  async listMemories(): Promise<MemoryChapter[]> {
    const db = await this.getDb();
    const rows: any[] = await db.getAllAsync(`SELECT * FROM memories;`);
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      periodStart: r.period_start,
      periodEnd: r.period_end,
      coverPhotoId: r.cover_photo_id,
      origin: r.origin,
      status: r.status,
      userEdited: !!r.user_edited,
      algorithmVersion: r.algorithm_version,
      photoIds: JSON.parse(r.photo_ids || "[]"),
      placeName: r.place_name,
    }));
  }

  async deleteMemory(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(`DELETE FROM memories WHERE id = ?;`, [id]);
    await db.runAsync(`DELETE FROM memory_photos WHERE memory_id = ?;`, [id]);
  }

  async upsertVisit(v: Visit): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO visits (id, place_id, start_at, end_at, status, algorithm_version) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET place_id=excluded.place_id, start_at=excluded.start_at, end_at=excluded.end_at,
         status=excluded.status, algorithm_version=excluded.algorithm_version;`,
      [v.id, v.placeId, v.startAt, v.endAt, v.status, v.algorithmVersion],
    );
    await db.runAsync(`DELETE FROM visit_photos WHERE visit_id = ?;`, [v.id]);
    await this.withStatement(db, `INSERT OR IGNORE INTO visit_photos (visit_id, photo_id, ord) VALUES (?, ?, ?);`, async (run) => {
      for (let i = 0; i < v.photoIds.length; i++) await run([v.id, v.photoIds[i], i]);
    });
  }

  async listVisits(): Promise<Visit[]> {
    const db = await this.getDb();
    // Two queries total (was one query per visit).
    const rows: any[] = await db.getAllAsync(`SELECT * FROM visits;`);
    const links: any[] = await db.getAllAsync(`SELECT visit_id, photo_id FROM visit_photos ORDER BY visit_id, ord;`);
    const byVisit = new Map<string, string[]>();
    for (const l of links) {
      const list = byVisit.get(l.visit_id);
      if (list) list.push(l.photo_id);
      else byVisit.set(l.visit_id, [l.photo_id]);
    }
    return rows.map((r) => ({
      id: r.id,
      placeId: r.place_id,
      startAt: r.start_at,
      endAt: r.end_at,
      status: r.status,
      algorithmVersion: r.algorithm_version,
      photoIds: byVisit.get(r.id) ?? [],
    }));
  }

  async cachePhotoAssets(photos: PhotoAsset[]): Promise<void> {
    if (photos.length === 0) return;
    const db = await this.getDb();
    // One transaction for the batch: hundreds of autocommitted INSERTs are what made
    // late pages of a big library crawl.
    await db.withTransactionAsync(async () => {
      await this.writeAssetRows(db, photos);
    });
  }

  async commitScanPage(pageAssets: PhotoAsset[], job: IndexJobStatus): Promise<void> {
    const db = await this.getDb();
    // Rows and checkpoint commit together or not at all.
    await db.withTransactionAsync(async () => {
      await this.writeAssetRows(db, pageAssets);
      await this.writeIndexJob(db, job);
    });
  }

  async pruneStalePhotoAssets(isDemo: boolean, minGeneration: number): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(`DELETE FROM photo_assets WHERE is_demo = ? AND scan_generation < ?;`, [isDemo ? 1 : 0, minGeneration]);
  }

  private async writeAssetRows(db: SQLite.SQLiteDatabase, photos: PhotoAsset[]): Promise<void> {
    if (photos.length === 0) return;
    await this.withStatement(
      db,
      `INSERT INTO photo_assets (id, library_asset_id, kind, width, height, created_at, modified_at, latitude, longitude, location_source, media_subtype, cloud_availability, uri, is_demo, metadata_status, scan_generation)
       VALUES (?, ?, 'photo', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET width=excluded.width, height=excluded.height, created_at=excluded.created_at,
         modified_at=excluded.modified_at, latitude=excluded.latitude, longitude=excluded.longitude,
         location_source=excluded.location_source, cloud_availability=excluded.cloud_availability,
         uri=excluded.uri, metadata_status=excluded.metadata_status, scan_generation=excluded.scan_generation;`,
      async (run) => {
        for (const p of photos) {
          await run([
            p.id, p.libraryAssetId, p.width, p.height, p.createdAt, p.modifiedAt, p.latitude, p.longitude,
            p.locationSource, p.mediaSubtype, p.cloudAvailability, p.uri, p.isDemo ? 1 : 0, p.metadataStatus, p.scanGeneration,
          ]);
        }
      },
    );
  }

  async replacePhotoAssets(photos: PhotoAsset[], isDemo: boolean): Promise<void> {
    const db = await this.getDb();
    // Scope the replacement so a demo rescan never removes real-library rows.
    await db.withTransactionAsync(async () => {
      await db.runAsync(`DELETE FROM photo_assets WHERE is_demo = ?;`, [isDemo ? 1 : 0]);
      await this.writeAssetRows(db, photos);
    });
  }

  async getCachedPhotoAssets(): Promise<PhotoAsset[]> {
    const db = await this.getDb();
    const rows: any[] = await db.getAllAsync(`SELECT * FROM photo_assets;`);
    return rows.map((r) => ({
      id: r.id,
      libraryAssetId: r.library_asset_id,
      createdAt: r.created_at,
      modifiedAt: r.modified_at,
      width: r.width,
      height: r.height,
      latitude: r.latitude,
      longitude: r.longitude,
      locationSource: r.location_source,
      mediaSubtype: r.media_subtype,
      cloudAvailability: r.cloud_availability,
      uri: r.uri,
      isDemo: !!r.is_demo,
      metadataStatus: r.metadata_status,
      scanGeneration: r.scan_generation,
    }));
  }

  async upsertQuizSession(s: QuizSessionRecord): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO quiz_sessions (id, mode, seed, status, question_index, score, created_at, completed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET status=excluded.status, question_index=excluded.question_index, score=excluded.score,
         completed_at=excluded.completed_at;`,
      [s.id, s.mode, s.seed, s.status, s.questionIndex, s.score, s.createdAt, s.completedAt],
    );
  }

  async getActiveQuizSession(): Promise<QuizSessionRecord | null> {
    const db = await this.getDb();
    const row: any = await db.getFirstAsync(`SELECT * FROM quiz_sessions WHERE status = 'in_progress' ORDER BY created_at DESC LIMIT 1;`);
    return row ? rowToQuizSession(row) : null;
  }

  async upsertQuizQuestion(q: QuizQuestionRecord): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO quiz_questions (session_id, photo_id, kind, choices, correct_index, given_index, outcome) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(session_id, photo_id) DO UPDATE SET given_index=excluded.given_index, outcome=excluded.outcome;`,
      [q.sessionId, q.photoId, q.kind, q.choices ? JSON.stringify(q.choices) : null, q.correctIndex, q.givenIndex, q.outcome],
    );
  }

  async listQuizQuestions(sessionId: string): Promise<QuizQuestionRecord[]> {
    const db = await this.getDb();
    const rows: any[] = await db.getAllAsync(`SELECT * FROM quiz_questions WHERE session_id = ?;`, [sessionId]);
    return rows.map((r) => ({
      sessionId: r.session_id,
      photoId: r.photo_id,
      kind: r.kind,
      choices: r.choices ? JSON.parse(r.choices) : null,
      correctIndex: r.correct_index,
      givenIndex: r.given_index,
      outcome: r.outcome,
    }));
  }

  async upsertPrivateZone(z: PrivateZone): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO private_zones (id, latitude, longitude, radius_meters, scope, label) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET latitude=excluded.latitude, longitude=excluded.longitude, radius_meters=excluded.radius_meters,
         scope=excluded.scope, label=excluded.label;`,
      [z.id, z.latitude, z.longitude, z.radiusMeters, z.scope, z.label],
    );
  }

  async listPrivateZones(): Promise<PrivateZone[]> {
    const db = await this.getDb();
    const rows: any[] = await db.getAllAsync(`SELECT * FROM private_zones;`);
    return rows.map((r) => ({ id: r.id, latitude: r.latitude, longitude: r.longitude, radiusMeters: r.radius_meters, scope: r.scope, label: r.label }));
  }

  async deletePrivateZone(id: string): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(`DELETE FROM private_zones WHERE id = ?;`, [id]);
  }

  async upsertShareDraft(d: ShareDraftRecord): Promise<void> {
    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO share_drafts (id, format, selected_photo_ids, precision_settings, title, status, approved_revision) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET selected_photo_ids=excluded.selected_photo_ids, precision_settings=excluded.precision_settings,
         title=excluded.title, status=excluded.status, approved_revision=excluded.approved_revision;`,
      [d.id, d.format, JSON.stringify(d.selectedPhotoIds), JSON.stringify(d.precisionSettings), d.title, d.status, d.approvedRevision],
    );
  }

  async listShareDrafts(): Promise<ShareDraftRecord[]> {
    const db = await this.getDb();
    const rows: any[] = await db.getAllAsync(`SELECT * FROM share_drafts;`);
    return rows.map((r) => ({
      id: r.id,
      format: r.format,
      selectedPhotoIds: JSON.parse(r.selected_photo_ids || "[]"),
      precisionSettings: JSON.parse(r.precision_settings || "{}"),
      title: r.title,
      status: r.status,
      approvedRevision: r.approved_revision,
    }));
  }

  async getAppSettings(): Promise<AppSettingsRecord> {
    const db = await this.getDb();
    const row: any = await db.getFirstAsync(`SELECT * FROM app_settings WHERE id = 1;`);
    if (!row) return { reduceMotionOverride: null, language: "it", demoDismissed: false };
    return { reduceMotionOverride: row.reduce_motion_override == null ? null : !!row.reduce_motion_override, language: row.language, demoDismissed: !!row.demo_dismissed };
  }

  async setAppSettings(patch: Partial<AppSettingsRecord>): Promise<AppSettingsRecord> {
    const current = await this.getAppSettings();
    const next: AppSettingsRecord = { ...current, ...patch };
    const db = await this.getDb();
    await db.runAsync(
      `INSERT INTO app_settings (id, reduce_motion_override, language, demo_dismissed) VALUES (1, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET reduce_motion_override=excluded.reduce_motion_override, language=excluded.language, demo_dismissed=excluded.demo_dismissed;`,
      [next.reduceMotionOverride == null ? null : next.reduceMotionOverride ? 1 : 0, next.language, next.demoDismissed ? 1 : 0],
    );
    return next;
  }

  async getIndexJob(): Promise<IndexJobStatus | null> {
    const db = await this.getDb();
    const row: any = await db.getFirstAsync(`SELECT * FROM index_jobs WHERE id = 1;`);
    if (!row) return null;
    return {
      phase: row.phase,
      scanned: row.scanned,
      total: row.total,
      cursor: row.cursor ?? null,
      scanMode: row.scan_mode === "demo" ? "demo" : "real",
      generation: row.generation,
      startGeneration: typeof row.start_generation === "number" ? row.start_generation : null,
      lastError: row.last_error,
      observedPermission: row.observed_permission ?? "unknown",
    };
  }

  async setIndexJob(job: IndexJobStatus): Promise<void> {
    const db = await this.getDb();
    await this.writeIndexJob(db, job);
  }

  private async writeIndexJob(db: SQLite.SQLiteDatabase, job: IndexJobStatus): Promise<void> {
    await db.runAsync(
      `INSERT INTO index_jobs (id, phase, scanned, total, cursor, scan_mode, generation, start_generation, last_error, observed_permission) VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET phase=excluded.phase, scanned=excluded.scanned, total=excluded.total,
         cursor=excluded.cursor, scan_mode=excluded.scan_mode, generation=excluded.generation, start_generation=excluded.start_generation,
         last_error=excluded.last_error, observed_permission=excluded.observed_permission;`,
      [job.phase, job.scanned, job.total, job.cursor, job.scanMode, job.generation, job.startGeneration ?? null, job.lastError, job.observedPermission],
    );
  }

  async clearAll(): Promise<void> {
    const db = await this.getDb();
    await db.execAsync(`
      DELETE FROM photo_overrides; DELETE FROM places; DELETE FROM memories; DELETE FROM memory_photos;
      DELETE FROM visits; DELETE FROM visit_photos; DELETE FROM photo_assets; DELETE FROM quiz_sessions;
      DELETE FROM quiz_questions; DELETE FROM private_zones; DELETE FROM share_drafts; DELETE FROM app_settings;
      DELETE FROM index_jobs;
    `);
  }
}

function rowToOverride(r: any): PhotoOverride {
  return {
    photoId: r.photo_id,
    manualLatitude: r.manual_latitude,
    manualLongitude: r.manual_longitude,
    manualDate: r.manual_date,
    excludeFromApp: !!r.exclude_from_app,
    excludeFromQuiz: !!r.exclude_from_quiz,
    excludeFromSharing: !!r.exclude_from_sharing,
    favoriteLocal: !!r.favorite_local,
  };
}

function rowToQuizSession(r: any): QuizSessionRecord {
  return {
    id: r.id,
    mode: r.mode,
    seed: r.seed,
    status: r.status,
    questionIndex: r.question_index,
    score: r.score,
    createdAt: r.created_at,
    completedAt: r.completed_at,
  };
}
