const { spawnSync } = require('node:child_process');
const path = require('node:path');
for (const name of ['build-wheel', 'build-pdf', 'build-image', 'build-color', 'build-color-pages', 'build-site', 'check-shell']) {
  const result = spawnSync(process.execPath, [path.join(__dirname, name + '.js')], {
    cwd: path.resolve(__dirname, '..'), stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
