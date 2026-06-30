const { execSync } = require('child_process');

function run(label, cmd) {
  console.log(`[prestart] ${label}`);
  try {
    execSync(cmd, { stdio: 'inherit', shell: true });
  } catch {
    console.warn(`[prestart] ${label} finished with errors (continuing).`);
  }
}

run('build', 'npm run build');
run('attendance import/export compile', 'npm run compile:attendance-io');
run('employee company-scope compile', 'npm run compile:employee-scope');
