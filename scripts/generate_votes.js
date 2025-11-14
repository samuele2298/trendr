'use strict';

const fs = require('fs');
const path = require('path');
const initOptions = {
    error: (error, e) => {
        console.log(error);
    }
};
const pgp = require('pg-promise')(initOptions);
const dbconnString = "postgresql://postgres:postgres@64.226.93.50:5432/trendr";
const db = pgp({connectionString: dbconnString, application_name: process.env.APP_NAME, max: 5, ssl: {rejectUnauthorized: false}});

// Config
const MIN_VOTES_PER_QUESTION = 200; // random lower bound
const MAX_VOTES_PER_QUESTION = 500; // random upper bound
const MAX_INTERESTS_PER_USER = 5;
const DAYS_SPAN = 365 * 2; // distribute votes across the last 2 years (730 days)

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  if (!arr || arr.length === 0) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickMany(arr, maxCount) {
  const n = Math.max(1, Math.floor(Math.random() * maxCount) + 1);
  const copy = arr.slice();
  const out = [];
  while (out.length < n && copy.length > 0) {
    const i = Math.floor(Math.random() * copy.length);
    out.push(copy.splice(i, 1)[0]);
  }
  return out;
}

function randomRecentDate(daysSpan) {
  // Uniform random date within the last `daysSpan` days.
  // Choose a random number of days (0..daysSpan) and random time within that day.
  const days = Math.floor(Math.random() * (daysSpan + 1));
  const hours = Math.floor(Math.random() * 24);
  const minutes = Math.floor(Math.random() * 60);
  const seconds = Math.floor(Math.random() * 60);
  const ms = ((days * 24 + hours) * 60 * 60 + minutes * 60 + seconds) * 1000;
  return new Date(Date.now() - ms).toISOString();
}

function makeUserId() {
  return `autogen_${Date.now()}_${Math.floor(Math.random() * 1e9)}`;
}

async function main() {
  try {
    console.log('Reading data from database...');

    // Read questions from database
    const questions = await db.any('SELECT id, "Tquestion_question" question FROM "Tquestion"');
    console.log(`Found ${questions.length} questions`);

    // Read interests from database (Tinterest table)
    const interests = await db.any('SELECT id, "Tinterest_name" name FROM "Tinterest"');
    console.log(`Found ${interests.length} interests`);

    // Read sectors from database (Tsector table)
    const sectors = await db.any('SELECT id, "Tsector_name" name FROM "Tsector"');
    console.log(`Found ${sectors.length} sectors`);

    // Read static data from JSON files
    const publicDir = path.join(__dirname, '..', 'public');
    const genders = JSON.parse(fs.readFileSync(path.join(publicDir, 'gender.json'), 'utf8'));
    const ages = JSON.parse(fs.readFileSync(path.join(publicDir, 'ages.json'), 'utf8'));
    const cities = JSON.parse(fs.readFileSync(path.join(publicDir, 'cities.json'), 'utf8'));

    console.log(`Found ${genders.length} genders, ${ages.length} ages, ${cities.length} cities`);

    // Count existing autogen votes per question to avoid re-inserting duplicates
    const existingVotes = await db.any(`
      SELECT "Tvote_Tquestion_id", COUNT(*) as count
      FROM "Tvote"
      WHERE "Tvote_userid" LIKE 'autogen_%'
      GROUP BY "Tvote_Tquestion_id"
    `);
    const existingCounts = {};
    existingVotes.forEach(row => {
      existingCounts[String(row.Tvote_Tquestion_id)] = parseInt(row.count, 10);
    });

    const report = [];
    let totalAdded = 0;

    for (const question of questions) {
      const qid = question.id;
      const currentCount = existingCounts[qid] || 0;
      let added = 0;

      // pick a random number of votes to ADD this run (between MIN and MAX)
      const toAdd = randInt(MIN_VOTES_PER_QUESTION, MAX_VOTES_PER_QUESTION);

      console.log(`Processing question ${qid}: current=${currentCount}, target to add=${toAdd}`);

      for (let i = 0; i < toAdd; i++) {
        // generate a synthetic user
        const user = {};
        user.id = makeUserId();

        // pick age/gender/interests/sector
        if (ages.length > 0) user.age = pickRandom(ages).id;
        if (genders.length > 0) user.gender = pickRandom(genders).id;
        if (sectors.length > 0) user.sector = pickRandom(sectors).id;
        if (interests.length > 0) {
          // number of interests per user random between 1 and MAX_INTERESTS_PER_USER
          const picked = pickMany(interests.map(i => i.id), Math.min(MAX_INTERESTS_PER_USER, interests.length));
          user.interests = picked;
        }
        // optionally add location (higher probability to include a city)
        if (cities.length > 0 && Math.random() < 0.7) {
          const c = pickRandom(cities);
          // try id first, then nome/name
          user.location = c.id || c.nome || c.name || '';
        }

        const voteValue = Math.random() < 0.5 ? 0 : 1; // random 0 (negative) or 1 (positive)
        const voteTime = randomRecentDate(DAYS_SPAN);

        try {
          // Insert vote into database (use the same columns the app expects)
          await db.none(`
            INSERT INTO "Tvote" (
              "Tvote_Tquestion_id", "Tvote_userid", "Tvote_vote", "Tvote_createtime",
              "Tvote_userinterest", "Tvote_userage", "Tvote_usergender", "Tvote_usersector", "Tvote_userlocation"
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `, [
            qid,
            user.id,
            voteValue,
            voteTime,
            user.interests ? JSON.stringify(user.interests) : null,
            user.age || null,
            user.gender || null,
            user.sector || null,
            user.location || null
          ]);

          added++;
          totalAdded++;

          // Progress logging every 100 votes
          if (totalAdded % 100 === 0) {
            console.log(`Added ${totalAdded} votes so far...`);
          }

        } catch (error) {
          console.error(`Error inserting vote for question ${qid}, user ${user.id}:`, error.message);
          // Continue with next vote
        }

        // Safety cap to avoid runaway in unexpected cases
        if (added > toAdd * 3) break;
      }

      report.push({ qid, before: currentCount, added });
    }

    // Summary
    console.log('\nGeneration complete. Summary per question:');
    report.forEach(r => console.log(`Q ${r.qid}: before=${r.before} added=${r.added} total=${r.before + r.added}`));
    console.log(`Total votes added: ${totalAdded}`);

    // Final count
    const finalCount = await db.one('SELECT COUNT(*) as total FROM "Tvote"');
    console.log(`Total votes in database: ${finalCount.total}`);

  } catch (error) {
    console.error('Error in generate_votes:', error);
    process.exit(1);
  }
}

if (require.main === module) main();
