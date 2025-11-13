'use strict';

const fs = require('fs');
const path = require('path');
const db = require('../db');

function main() {
  const publicDir = path.join(__dirname, '..', 'public');
  const votesPath = path.join(publicDir, 'votes.json');

  console.log('Reading votes.json...');
  let votes = db.read('votes') || [];

  const originalCount = votes.length;

  // Filter out votes where user.id starts with 'autogen'
  const filteredVotes = votes.filter(vote => {
    try {
      const user = JSON.parse(vote.user || '{}');
      return !(user.id && user.id.startsWith('autogen'));
    } catch (e) {
      // If can't parse, keep it (assume not autogen)
      return true;
    }
  });

  const removedCount = originalCount - filteredVotes.length;

  if (removedCount === 0) {
    console.log('No autogen votes found to remove.');
    return;
  }

  // Backup
  const bak = backupVotesFile(votesPath);
  console.log('Backup written to', bak);

  // Write filtered
  const success = db.write('votes', filteredVotes);
  if (!success) {
    console.error('Failed to write votes.json');
    process.exit(1);
  }

  console.log(`Removed ${removedCount} autogen votes.`);
  console.log(`Total votes now: ${filteredVotes.length}`);
}

if (require.main === module) main();