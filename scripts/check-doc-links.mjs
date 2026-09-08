import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ignored = new Set([
  '.git',
  'node_modules',
  '.pnpm-store',
  '.local',
  '.data',
  'uploads',
  'dist',
  'build',
  'coverage',
]);

async function markdownFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await markdownFiles(target)));
    else if (entry.isFile() && entry.name.endsWith('.md')) files.push(target);
  }
  return files;
}

// Checks inline Markdown link targets only. No HTTP calls, anchor validation,
// reference-style links, or full Markdown parsing are claimed here.
export async function checkDocLinks(root) {
  const files = await markdownFiles(root);
  const errors = [];
  let checked = 0;
  for (const file of files) {
    const text = (await readFile(file, 'utf8')).replace(
      /^```[^\n]*\n[\s\S]*?^```\s*$/gm,
      '',
    );
    for (const match of text.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
      const target = match[1].trim();
      if (/^[a-z][a-z\d+.-]*:/i.test(target) || target.startsWith('#')) {
        continue;
      }
      if (target.startsWith('//')) continue;
      const filename = target.split(/[?#]/)[0];
      if (!filename) continue;
      checked += 1;
      const resolved = path.resolve(path.dirname(file), filename);
      try {
        await stat(resolved);
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
        errors.push(`${path.relative(root, file)}: missing ${target}`);
      }
    }
  }
  return { files: files.length, checked, errors };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const result = await checkDocLinks(process.cwd());
  for (const error of result.errors) console.error(error);
  console.log(
    `Checked ${result.checked} local links in ${result.files} Markdown files; ${result.errors.length} errors.`,
  );
  process.exitCode = result.errors.length ? 1 : 0;
}
