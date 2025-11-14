'use strict';

const fs = require('fs');
const path = require('path');
const initOptions = {
    error: (error, e) => {
        console.log(error);
    }
};
const pgp = require('pg-promise')(initOptions);
const dbconnString = process.env.DB;
const db = pgp({connectionString: dbconnString, application_name: process.env.APP_NAME, max: 5, ssl: {rejectUnauthorized: false}});

function backupVotesFile(votesPath) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bakPath = `${votesPath}.${timestamp}.bak`;
  try {
    if (fs.existsSync(votesPath)) {
      fs.copyFileSync(votesPath, bakPath);
    }
    return bakPath;
  } catch (error) {
    console.error('Failed to create backup:', error.message);
    return null;
  }
}

async function main() {
  try {
    console.log('Reading votes from database...');

    // Get count of autogen votes
    const autogenCount = await db.one(`
      SELECT COUNT(*) as count
      FROM "Tvote"
      WHERE "Tvote_user" LIKE 'autogen_%'
    `);

    console.log(`Found ${autogenCount.count} autogen votes to remove`);

    if (parseInt(autogenCount.count) === 0) {
      console.log('No autogen votes found to remove.');
      return;
    }

    // Create a backup by exporting current votes to JSON (optional but good practice)
    console.log('Creating backup of current votes...');
    const allVotes = await db.any(`
      SELECT "Tvote_Tquestion_id", "Tvote_user", "Tvote_vote", "Tvote_createtime", interests, age, gender, sector, location
      FROM "Tvote"
      ORDER BY "Tvote_createtime" DESC
    `);

    const backupData = {
      exported_at: new Date().toISOString(),
      total_votes: allVotes.length,
      votes: allVotes
    };

    const backupPath = path.join(__dirname, '..', 'public', `votes_backup_${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2));
    console.log(`Backup created at: ${backupPath}`);

    // Remove autogen votes
    console.log('Removing autogen votes...');
    const deleteResult = await db.result(`
      DELETE FROM "Tvote"
      WHERE "Tvote_user" LIKE 'autogen_%'
    `);

    console.log(`Removed ${deleteResult.rowCount} autogen votes`);

    // Verify final count
    const finalCount = await db.one('SELECT COUNT(*) as total FROM "Tvote"');
    console.log(`Total votes remaining: ${finalCount.total}`);

  } catch (error) {
    console.error('Error in remove_autogen_votes:', error);
    process.exit(1);
  }
}

if (require.main === module) main();