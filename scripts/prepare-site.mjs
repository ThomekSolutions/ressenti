import { createHash } from 'node:crypto';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const docs = new URL('../docs/', import.meta.url);
const names = (await readdir(docs, { recursive: true, withFileTypes: true }))
  .filter(file => file.isFile())
  .map(file => relative(fileURLToPath(docs), join(file.parentPath, file.name)).split(sep).join('/'))
  .filter(name => !name.startsWith('.') && name !== 'sw.js' && !name.endsWith('.txt'))
  .sort();

const template = await readFile(new URL('./sw-template.js', import.meta.url), 'utf8');
const hash = createHash('sha256').update(template);
for (const name of names) hash.update(name).update(await readFile(new URL(name, docs)));
const generated = template.replace('__VERSION__', hash.digest('hex').slice(0, 16)).replace('__FILES__', JSON.stringify(names, null, 2));
const sw = new URL('sw.js', docs);
if (process.argv.includes('--check')) {
  if (await readFile(sw, 'utf8') !== generated) {
    console.error('docs/sw.js est obsolète. Lancez npm run prepare:site.');
    process.exitCode = 1;
  }
} else {
  await writeFile(sw, generated);
}