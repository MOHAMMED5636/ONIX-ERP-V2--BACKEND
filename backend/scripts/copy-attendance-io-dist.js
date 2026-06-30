const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const from = path.join(root, 'dist-temp');
const copies = [
  ['controllers/attendanceImportExport.controller.js', 'dist/controllers/attendanceImportExport.controller.js'],
  ['utils/attendance-admin-rows.js', 'dist/utils/attendance-admin-rows.js'],
  ['config/attendanceImportSchema.js', 'dist/config/attendanceImportSchema.js'],
];

for (const [relSrc, relDst] of copies) {
  const src = path.join(from, relSrc);
  const dst = path.join(root, relDst);
  if (!fs.existsSync(src)) {
    console.error('Missing compiled file:', src);
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  console.log('Copied', relDst);
}
