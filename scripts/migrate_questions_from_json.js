'use strict';

const fs = require('fs');
const path = require('path');
const initOptions = {
  error: (err) => { console.error(err); }
};
const pgp = require('pg-promise')(initOptions);
const dbconnString = "postgresql://postgres:postgres@64.226.93.50:5432/trendr";
if (!dbconnString) {
  console.error('Environment variable DB is not set. Set DB to your Postgres connection string and re-run.');
  process.exit(1);
}
const db = pgp({ connectionString: dbconnString, max: 5, ssl: { rejectUnauthorized: false } });

async function migrate() {
  const filePath = path.join(__dirname, '..', 'public', 'questions.json');
  if (!fs.existsSync(filePath)) {
    console.error('questions.json not found at', filePath);
    process.exit(1);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  let questions;
  try {
    questions = JSON.parse(raw);
  } catch (e) {
    console.error('Failed to parse questions.json:', e.message);
    process.exit(1);
  }

  console.log(`Found ${questions.length} questions in JSON`);

  const summary = { insertedQuestions: 0, updatedQuestions: 0, insertedTags: 0 };

  try {
    await db.tx(async t => {
      for (const q of questions) {
        if (!q.id) continue;
        const qid = String(q.id);
        const media = q.media || null;
        const text = q.question || null;

        // Upsert question
        const upsertQ = `
          INSERT INTO "Tquestion" (id, "Tquestion_media", "Tquestion_question")
          VALUES ($1, $2, $3)
          ON CONFLICT (id) DO UPDATE SET
            "Tquestion_media" = EXCLUDED."Tquestion_media",
            "Tquestion_question" = EXCLUDED."Tquestion_question"
        `;

        // Check if exists to count inserted vs updated
        const exists = await t.oneOrNone('SELECT id FROM "Tquestion" WHERE id = $1', [qid]);
        if (exists) {
          await t.none(upsertQ, [qid, media, text]);
          summary.updatedQuestions += 1;
        } else {
          await t.none(upsertQ, [qid, media, text]);
          summary.insertedQuestions += 1;
        }

        // Tags
        const tags = Array.isArray(q.tags) ? q.tags : [];
        for (const tagIdRaw of tags) {
          const tagId = String(tagIdRaw);
          // insert relation if not exists
          const insertTagRel = `
            INSERT INTO "Tquestion_tag" ("Tquestion_id", "Ttag_id")
            SELECT $1, $2
            WHERE NOT EXISTS (
              SELECT 1 FROM "Tquestion_tag" WHERE "Tquestion_id" = $1 AND "Ttag_id" = $2
            )
          `;
          const result = await t.result(insertTagRel, [qid, tagId]);
          // result.rowCount will be 1 if inserted, 0 if existed
          if (result.rowCount && result.rowCount > 0) summary.insertedTags += 1;
        }
      }
    });

    console.log('Migration finished. Summary:');
    console.log(`  Questions inserted: ${summary.insertedQuestions}`);
    console.log(`  Questions updated: ${summary.updatedQuestions}`);
    console.log(`  Question-tag relations inserted: ${summary.insertedTags}`);

  } catch (err) {
    console.error('Migration failed:', err.message || err);
    process.exit(1);
  } finally {
    pgp.end();
  }
}

if (require.main === module) migrate();
