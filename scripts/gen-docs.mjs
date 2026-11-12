// docs-as-code generator step 1: mirror README.md into the mkdocs site root.
// Pure node, zero dependencies. Idempotent — rewrites docs/index.md only when
// the README content actually differs, so repeat runs produce no git diff.
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
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

// ---------------------------------------------------------------------------
// docs-as-code generator step 2: architecture page. Scan src/**/*.ts, resolve
// relative imports against actual files, aggregate them into directory-level
// edges and render docs/gen/architecture.md (mermaid flowchart + per-directory
// responsibility table pulled from leading file comments). Pure node, zero
// dependencies, deterministic (sorted traversal, sorted output), idempotent —
// rewrites only when the rendered content actually differs.
// ---------------------------------------------------------------------------
const srcDir = join(root, 'src');
const archDest = join(root, 'docs', 'gen', 'architecture.md');

if (!existsSync(srcDir)) {
  console.error(`gen-docs: src/ not found at ${srcDir}`);
  process.exit(1);
}

const RELATIVE_IMPORT_RE = /from\s+'(\.[^']+)'/g;
const JULI_IMPORT_RE = /from\s+'(@juli-os\/[^']+)'/g;
const FACADE_NODE = ''; // src-root files (index.ts facade) form their own node.

/** Recursively list src-relative .ts paths (posix separators), sorted for determinism. */
function listTsFiles(dir, prefix) {
  const out = [];
  const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const ent of entries) {
    if (ent.name.startsWith('.')) continue;
    const rel = prefix === '' ? ent.name : `${prefix}/${ent.name}`;
    if (ent.isDirectory()) out.push(...listTsFiles(join(dir, ent.name), rel));
    else if (ent.isFile() && ent.name.endsWith('.ts')) out.push(rel);
  }
  return out;
}

const tsFiles = listTsFiles(srcDir, '').sort();
const fileSet = new Set(tsFiles);

const dirOf = (rel) => {
  const i = rel.lastIndexOf('/');
  return i === -1 ? FACADE_NODE : rel.slice(0, i);
};

/** Resolve a relative import spec against the importing file; null if it lands outside src/. */
function resolveImport(fromRel, spec) {
  const parts = dirOf(fromRel) === FACADE_NODE ? [] : dirOf(fromRel).split('/');
  for (const seg of spec.split('/')) {
    if (seg === '.' || seg === '') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  const raw = parts.join('/');
  const candidates = raw === FACADE_NODE ? [`${raw}.ts`] : [raw, `${raw}.ts`, `${raw}/index.ts`];
  for (const cand of candidates) {
    if (fileSet.has(cand)) return cand;
  }
  return null;
}

// Aggregate directory-level edges (same-directory internal edges are skipped).
const edges = new Map(); // `from\0to` -> resolved import count
const juliEdges = new Map(); // `fromNode\0@juli-os/pkg` -> import count
for (const rel of tsFiles) {
  const text = readFileSync(join(srcDir, rel), 'utf8');
  for (const m of text.matchAll(RELATIVE_IMPORT_RE)) {
    const target = resolveImport(rel, m[1]);
    if (target === null) continue;
    const fromNode = dirOf(rel);
    const toNode = dirOf(target);
    if (fromNode === toNode) continue;
    const key = `${fromNode}\u0000${toNode}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  for (const m of text.matchAll(JULI_IMPORT_RE)) {
    const key = `${dirOf(rel)}\u0000${m[1]}`;
    juliEdges.set(key, (juliEdges.get(key) ?? 0) + 1);
  }
}

const nodes = [...new Set(tsFiles.map(dirOf))].sort(); // facade ('') sorts first.
const nodeIds = new Map(nodes.map((n, i) => [n, `n${i}`]));
const nodeLabel = (n) => (n === FACADE_NODE ? 'facade（index.ts）' : n);

/** First sentence of a file's leading // comment block (cross-line aware, no fabrication). */
function headSentence(rel) {
  const lines = readFileSync(join(srcDir, rel), 'utf8').split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') i++;
  const head = [];
  while (i < lines.length && lines[i].startsWith('//')) {
    head.push(lines[i].replace(/^\/\/ ?/, ''));
    i++;
  }
  if (head.length === 0) return '';
  const isCjk = (ch) => ch !== undefined && ch !== '' && ch.charCodeAt(0) > 0x2e7f;
  let joined = '';
  for (const line of head) {
    joined = joined === '' ? line : joined + (isCjk(joined.at(-1)) || isCjk(line[0]) ? line : ` ${line}`);
  }
  const full = joined.replace(/\s+/g, ' ').trim();
  const zhStop = full.indexOf('。');
  let sentence = zhStop >= 0 ? full.slice(0, zhStop + 1) : (full.match(/^(.*?\.(?:\s|$))/)?.[1] ?? full).trim();
  if (sentence.length > 120) sentence = `${sentence.slice(0, 120)}…`;
  return sentence;
}

/** Largest file in a directory stands in as its representative module. */
function representativeFile(node) {
  let best = null;
  let bestSize = -1;
  for (const rel of tsFiles) {
    if (dirOf(rel) !== node) continue;
    const size = statSync(join(srcDir, rel)).size;
    if (size > bestSize) {
      best = rel;
      bestSize = size;
    }
  }
  return best;
}

const sortedPairs = (map) =>
  [...map.entries()]
    .map(([key, count]) => {
      const [a, b] = key.split('\u0000');
      return { a, b, count };
    })
    .sort((x, y) => (x.a === y.a ? (x.b < y.b ? -1 : x.b > y.b ? 1 : 0) : x.a < y.a ? -1 : 1));

const mermaidLines = ['flowchart LR'];
for (const n of nodes) {
  mermaidLines.push(`  ${nodeIds.get(n)}["${nodeLabel(n)}"]`);
}
for (const e of sortedPairs(edges)) {
  mermaidLines.push(`  ${nodeIds.get(e.a)} -->|${e.count}| ${nodeIds.get(e.b)}`);
}
const juliPkgs = [...new Set([...juliEdges.keys()].map((k) => k.split('\u0000')[1]))].sort();
const juliIds = new Map(juliPkgs.map((pkg, i) => [pkg, `x${i}`]));
for (const pkg of juliPkgs) {
  mermaidLines.push(`  ${juliIds.get(pkg)}:::external["${pkg}"]`);
}
for (const e of sortedPairs(juliEdges)) {
  mermaidLines.push(`  ${nodeIds.get(e.a)} -.->|${e.count}| ${juliIds.get(e.b)}`);
}
if (juliPkgs.length > 0) {
  mermaidLines.push('  classDef external stroke-dasharray: 5 5');
}

const legend = ['边上的数字 = 该方向聚合到的相对 import 条数；同目录内部依赖不画。'];
if (juliPkgs.length > 0) {
  legend.push('虚线节点 = 对 @juli-os/* 兄弟包的依赖。');
}

const tableRows = nodes.map((n) => {
  const rep = representativeFile(n);
  const desc = headSentence(rep) || `（无头注释，见 ${rep.split('/').pop()}）`;
  return `| \`${nodeLabel(n)}\` | ${desc.replaceAll('|', '\\|')} |`;
});

const archContent = [
  '<!-- generated by scripts/gen-docs.mjs — DO NOT EDIT -->',
  '> 本页由生成器产出（npm run docs:gen）：模块依赖由 src/ 相对 import 实测聚合。',
  '',
  '# 架构（模块依赖实测）',
  '',
  '## 模块依赖图',
  '',
  '```mermaid',
  ...mermaidLines,
  '```',
  '',
  ...legend,
  '',
  '## 目录职责',
  '',
  '| 目录 | 职责 |',
  '| --- | --- |',
  ...tableRows,
  '',
].join('\n');

mkdirSync(dirname(archDest), { recursive: true });
if (!existsSync(archDest) || readFileSync(archDest, 'utf8') !== archContent) {
  writeFileSync(archDest, archContent);
  console.log(`gen-docs: wrote ${archDest}`);
} else {
  console.log('gen-docs: docs/gen/architecture.md already up to date');
}

// ---------------------------------------------------------------------------
// docs-as-code generator step 3: typedoc API nav for mkdocs-literate-nav. Scan
// docs/api/ for .md pages, group them by subdirectory and render
// docs/api/SUMMARY.md so typedoc's deep pages join the site nav. Deterministic
// (fixed group order, sorted entries), idempotent — rewrites only when the
// rendered content actually differs. macOS duplicate copies ("Foo 2.md") are
// skipped so copy residue never enters the nav. literate-nav honors only the
// LAST top-level list in the file, so the groups must be items of one list
// with pages indented 4 spaces beneath each group.
// ---------------------------------------------------------------------------
const API_GROUP_ORDER = ['functions', 'interfaces', 'type-aliases', 'variables', 'enums'];
const COPY_RESIDUE_RE = / \d+\.md$/;
const apiDir = join(root, 'docs', 'api');
const groupRank = (name) => {
  const i = API_GROUP_ORDER.indexOf(name);
  return i === -1 ? API_GROUP_ORDER.length : i;
};

if (!existsSync(apiDir)) {
  console.error(`gen-docs: docs/api/ not found at ${apiDir} — run typedoc first`);
} else {
  const groups = [];
  for (const ent of readdirSync(apiDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const pages = readdirSync(join(apiDir, ent.name))
      .filter((name) => name.endsWith('.md') && !COPY_RESIDUE_RE.test(name))
      .sort();
    if (pages.length > 0) groups.push({ dir: ent.name, pages });
  }
  groups.sort((a, b) => groupRank(a.dir) - groupRank(b.dir) || (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));

  const summaryLines = ['<!-- generated by scripts/gen-docs.mjs — DO NOT EDIT -->', ''];
  for (const { dir, pages } of groups) {
    summaryLines.push(`- ${dir}`);
    for (const page of pages) summaryLines.push(`    - [${page.slice(0, -3)}](${dir}/${page})`);
  }

  const summaryDest = join(apiDir, 'SUMMARY.md');
  const summaryContent = summaryLines.join('\n');
  if (!existsSync(summaryDest) || readFileSync(summaryDest, 'utf8') !== summaryContent) {
    writeFileSync(summaryDest, summaryContent);
    console.log(`gen-docs: wrote ${summaryDest}`);
  } else {
    console.log('gen-docs: docs/api/SUMMARY.md already up to date');
  }
}
