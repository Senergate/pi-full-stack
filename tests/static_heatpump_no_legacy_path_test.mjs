import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const scanRoots = ['client/src', 'server'].map(dir => path.join(root, dir));
const deny = ['targetHeatpump / HEATPUMP_LEVELS', 'safeLoad * 10', 'EspService.heatpump(0.8', 'EspService.heatpump(0.6', 'EspService.heatpump(0.4', '_.heatpump.load'];
function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist', 'build', '.git'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(js|mjs|vue)$/.test(entry.name)) out.push(full);
  }
  return out;
}
for (const file of scanRoots.flatMap(walk)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const term of deny) if (text.includes(term)) throw new Error(`${term} still exists in ${path.relative(root, file)}`);
}
console.log('static_heatpump_no_legacy_path_test: PASS');
