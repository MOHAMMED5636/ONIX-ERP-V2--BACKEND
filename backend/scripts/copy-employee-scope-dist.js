const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const from = path.join(root, 'dist-temp');
const copies = [
  ['controllers/employee.controller.js', 'dist/controllers/employee.controller.js'],
  ['controllers/employee.controller.js.map', 'dist/controllers/employee.controller.js.map'],
  ['controllers/departments.controller.js', 'dist/controllers/departments.controller.js'],
  ['controllers/departments.controller.js.map', 'dist/controllers/departments.controller.js.map'],
  ['controllers/attendanceProgram.controller.js', 'dist/controllers/attendanceProgram.controller.js'],
  ['controllers/attendanceProgram.controller.js.map', 'dist/controllers/attendanceProgram.controller.js.map'],
  ['utils/company-name-aliases.js', 'dist/utils/company-name-aliases.js'],
  ['utils/company-name-aliases.js.map', 'dist/utils/company-name-aliases.js.map'],
  ['services/companyAccess.service.js', 'dist/services/companyAccess.service.js'],
  ['services/companyAccess.service.js.map', 'dist/services/companyAccess.service.js.map'],
  ['config/database.js', 'dist/config/database.js'],
  ['config/database.js.map', 'dist/config/database.js.map'],
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

