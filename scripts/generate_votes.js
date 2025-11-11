'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');

// Config
const MIN_VOTES_PER_QUESTION = 40; // random lower bound
const MAX_VOTES_PER_QUESTION = 50; // random upper bound
const MAX_INTERESTS_PER_USER = 3;
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

function backupVotesFile(srcPath) {
  const bakPath = srcPath + '.bak.' + Date.now();
  fs.copyFileSync(srcPath, bakPath);
  return bakPath;
}

function main() {
  const publicDir = path.join(__dirname, '..', 'public');
  const votesPath = path.join(publicDir, 'votes.json');

  console.log('Reading data from public/...');
  const questions = db.read('questions') || [];
  const interests = db.read('interests') || [];
  const genders = db.read('gender') || [];
  const ages = db.read('ages') || [];
  const sectors = db.read('sectors') || [];
  const cities = db.read('cities') || [];

  let votes = db.read('votes') || [];

  // Build quick sets for existing user-question pairs to avoid duplicates
  const existingPairs = new Set();
  votes.forEach(v => {
    try {
      const u = JSON.parse(v.user || '{}');
      if (u && u.id) existingPairs.add(`${String(v.questionId)}::${String(u.id)}`);
    } catch (e) {
      // ignore
    }
  });

  const report = [];

  questions.forEach(question => {
    const qid = Number(question.id);
    const currentCount = votes.filter(v => Number(v.questionId) === qid).length;
    let added = 0;
    // pick a random number of votes to ADD this run (between MIN and MAX)
    const toAdd = randInt(MIN_VOTES_PER_QUESTION, MAX_VOTES_PER_QUESTION);

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

      const pairKey = `${qid}::${user.id}`;
      if (existingPairs.has(pairKey)) continue; // extremely unlikely but safe

      const vote = {
        questionId: qid,
        user: JSON.stringify(user),
        time: randomRecentDate(DAYS_SPAN)
      };

      votes.push(vote);
      existingPairs.add(pairKey);
      added++;
      // Safety cap to avoid runaway in unexpected cases
      if (added > toAdd * 3) break;
    }

    report.push({ qid, before: currentCount, added });
  });

  // Backup and write
  const bak = backupVotesFile(votesPath);
  console.log('Backup written to', bak);

  const success = db.write('votes', votes);
  if (!success) {
    console.error('Failed to write votes.json');
    process.exit(1);
  }

  // Summary
  console.log('Generation complete. Summary per question:');
  report.forEach(r => console.log(`Q ${r.qid}: before=${r.before} added=${r.added} total=${r.before + r.added}`));
  console.log('Total votes now:', votes.length);
}

if (require.main === module) main();
