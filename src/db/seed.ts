import type { AppDatabase } from './database';
import { importData } from '../import/importer';

// On first run, seed the database from the companion fitness_import.json (§6/§9).
// It's served statically from the app base so the same file doubles as the import
// example. Idempotent: re-import upserts, so seeding twice is harmless — but we skip
// when data already exists to avoid clobbering user edits with stale seed values.

export async function seedIfEmpty(db: AppDatabase): Promise<void> {
  const existing = await db.exercises.findOne().exec();
  if (existing) return;

  try {
    const url = `${import.meta.env.BASE_URL}fitness_import.json`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn('Seed file not found:', res.status);
      return;
    }
    const data = await res.json();
    const report = await importData(db, data);
    console.info(
      `Seeded ${report.totalInserted} documents (${report.totalErrors} errors).`,
    );
  } catch (e) {
    console.warn('Seeding skipped:', e);
  }
}
