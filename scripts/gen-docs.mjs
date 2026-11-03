// docs-as-code generator step 1: mirror README.md into the mkdocs site root.
// Pure node, zero dependencies. Idempotent — rewrites docs/index.md only when
// the README content actually differs, so repeat runs produce no git diff.
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const src = join(root, 'README.md');
const dest = join(root, 'docs', 'index.md');

if (!existsSync(src)) {
  console.error(`gen-docs: README.md not found at ${src}`);
  process.exit(1);
}

mkdirSync(dirname(dest), { recursive: true });
if (!existsSync(dest) || readFileSync(dest, 'utf8') !== readFileSync(src, 'utf8')) {
  copyFileSync(src, dest);
  console.log(`gen-docs: wrote ${dest}`);
} else {
  console.log('gen-docs: docs/index.md already up to date');
}
