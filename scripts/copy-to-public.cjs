const fs = require('fs');
const path = require('path');

// Remove old files
const distTarget = path.join(__dirname, '../public/dist');
const dataTarget = path.join(__dirname, '../public/data');

if (fs.existsSync(distTarget)) {
  fs.rmSync(distTarget, { recursive: true, force: true });
}
if (fs.existsSync(dataTarget)) {
  fs.rmSync(dataTarget, { recursive: true, force: true });
}

// Copy new files
fs.cpSync(
  path.join(__dirname, '../dist'),
  distTarget,
  { recursive: true }
);

fs.cpSync(
  path.join(__dirname, '../data'),
  dataTarget,
  { recursive: true }
);

console.log('✅ Copied dist/ and data/ to public/');

