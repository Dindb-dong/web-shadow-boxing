import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

if (process.platform !== 'linux' || process.arch !== 'x64') {
  process.exit(0);
}

const packageName = '@rollup/rollup-linux-x64-gnu';

try {
  require.resolve(packageName);
  process.exit(0);
} catch {
  // Missing optional dependency due npm optional-deps lockfile bug.
}

const rollupPackageJsonPath = require.resolve('rollup/package.json');
const rollupPackageJson = JSON.parse(readFileSync(rollupPackageJsonPath, 'utf8'));
const rollupVersion = rollupPackageJson.version;

execSync(
  `npm install --no-save --no-audit --no-fund ${packageName}@${rollupVersion}`,
  { stdio: 'inherit' },
);
