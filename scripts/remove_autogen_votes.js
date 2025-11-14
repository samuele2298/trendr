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

async function main() {
  try {
    console.log('Reading votes from database...');

    // Get count of autogen votes (match on userid column)
    const autogenCount = await db.one(`
      SELECT COUNT(*) as count
      FROM "Tvote"
      WHERE "Tvote_userid" LIKE 'autogen_%'
    `);

    console.log(`Found ${autogenCount.count} autogen votes to remove`);

    if (parseInt(autogenCount.count) === 0) {
      console.log('No autogen votes found to remove.');
      return;
    }

    // Create a backup by exporting current votes to JSON (optional but good practice)
    console.log('Creating backup of current votes...');
    const allVotes = await db.any(`
      SELECT "Tvote_Tquestion_id", "Tvote_userid" as userid, "Tvote_vote" as vote, "Tvote_createtime" as createtime,
             "Tvote_userinterest" as interests, "Tvote_userage" as age, "Tvote_usergender" as gender,
             "Tvote_usersector" as sector, "Tvote_userlocation" as location
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
      WHERE "Tvote_userid" LIKE 'autogen_%'
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