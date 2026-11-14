import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(path.join(root, 'package.json'));
const ts = require('typescript');
const cache = new Map();

/** Fixture-only loader for the actual pure canonical validators/writer.
 * No platform adapters, provider code or untrusted source are evaluated. */
export function loadSource(relative) {
  let file = path.resolve(root, relative);
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.ts');
  else if (!file.endsWith('.ts')) file += '.ts';
  if (!file.startsWith(path.join(root, 'src') + path.sep)) throw Error('Fixture loader escaped canonical source');
  if (cache.has(file)) return cache.get(file).exports;
  const module = { exports: {} }; cache.set(file, module);
  const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const localRequire = (name) => {
    if (name.startsWith('.')) return loadSource(path.relative(root, path.resolve(path.dirname(file), name)));
    if (['zod', 'fflate'].includes(name)) return require(name);
    throw Error('Unexpected fixture dependency: ' + name);
  };
  vm.runInThisContext('(function(require,module,exports){' + source + '\n})', { filename: file })(localRequire, module, module.exports);
  return module.exports;
}
