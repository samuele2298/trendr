const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'public', 'votes.json');
const backup = file + '.bak';

console.log('Reading', file);
const raw = fs.readFileSync(file, 'utf8');
let votes = JSON.parse(raw);
fs.writeFileSync(backup, JSON.stringify(votes, null, 2));
console.log('Backup written to', backup);

function bucketAge(ageStr) {
  if (typeof ageStr === 'number') ageStr = String(ageStr);
  if (!ageStr) return '1';
  if (ageStr === '1' || ageStr === '2' || ageStr === '3') return ageStr;
  const n = parseInt(ageStr, 10);
  if (isNaN(n)) return '1';
  if (n <= 29) return '1';
  if (n <= 44) return '2';
  return '3';
}

votes = votes.map(v => {
  try {
    const u = JSON.parse(v.user);
    // remove location
    if (u.hasOwnProperty('location')) delete u.location;
    // normalize age to bucket 1/2/3
    u.age = bucketAge(u.age);
    // ensure interests exists as array if present
    if (u.interests && !Array.isArray(u.interests)) u.interests = [u.interests];
    v.user = JSON.stringify(u);
  } catch (e) {
    // if user parsing fails, leave as-is
    // attempt a simple removal of location substring
    v.user = v.user.replace(/"location"\s*:\s*"[^"]*",?\s*/g, '');
    // ensure age numeric strings are bucketed (best effort)
    v.user = v.user.replace(/"age"\s*:\s*"(\d{1,3})"/g, function(_,a){
      const bucket = bucketAge(a);
      return '"age":"'+bucket+'"';
    });
  }
  return v;
});

fs.writeFileSync(file, JSON.stringify(votes, null, 2));
console.log('Updated votes written to', file);
