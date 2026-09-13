import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'client', 'src');
const vueFunctions = ['computed', 'nextTick', 'onMounted', 'onUnmounted', 'onBeforeUnmount', 'reactive', 'ref', 'watch', 'watchEffect'];

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.vue') || entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

for (const file of walk(root)) {
  const text = fs.readFileSync(file, 'utf8');
  const importMatch = text.match(/import\s*\{([^}]+)\}\s*from\s*['"]vue['"]/);
  const imported = new Set(importMatch ? importMatch[1].split(',').map(x => x.trim()).filter(Boolean) : []);

  for (const fn of vueFunctions) {
    const used = new RegExp(`\\b${fn}\\s*\\(`).test(text);
    if (used && !imported.has(fn)) {
      throw new Error(`${fn}() is used but not imported from vue in ${path.relative(root, file)}`);
    }
  }
}

const agent = fs.readFileSync(path.join(root, 'components', 'AgentCard.vue'), 'utf8');
if (!agent.includes("import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';")) {
  throw new Error('AgentCard.vue must use the explicit complete Vue import list.');
}

console.log('vue_import_usage_static_test: PASS');
