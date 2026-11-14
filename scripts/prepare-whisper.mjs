import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const vendor = resolve(root, 'modules/show-voice/vendor');
const source = resolve(vendor, 'whisper.cpp');
const commit = 'd1be6fde11ac6e0407606b4e42fe72d34add8037';
mkdirSync(vendor, { recursive: true });
if (!existsSync(resolve(source, 'CMakeLists.txt'))) {
  execFileSync('git', ['clone', '--depth', '1', '--branch', 'v1.9.5', 'https://github.com/ggml-org/whisper.cpp.git', source], { stdio: 'inherit' });
}
const actual = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
if (actual !== commit) throw new Error('Offline speech source does not match its pinned commit');
if (!readFileSync(resolve(source, 'LICENSE'), 'utf8').includes('MIT')) throw new Error('Speech engine license is missing');
if (process.platform === 'darwin' && process.argv.includes('--ios')) {
  execFileSync('bash', ['build-xcframework.sh'], { cwd: source, stdio: 'inherit' });
}
process.stdout.write(`Verified whisper.cpp v1.9.5 (${commit})\n`);
