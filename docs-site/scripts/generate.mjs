/**
 * Build-time generator for the Lume Visual Spec site.
 *
 * Single source of truth is git: each published version is reconstructed from
 * the commit that defined it via `git show <commit>:docs/visual-spec.md`, the
 * "latest" page is the current working-tree file, and the authorship history is
 * derived from `git log --follow`. Nothing here is hand-copied, so the site can
 * never drift from the document's real history.
 *
 * Outputs (all git-ignored — regenerated on every build):
 *   latest/index.md, v0.4/index.md … v0.1/index.md   (one page per version)
 *   history.md                                        (versions + commit log)
 *   public/previews/*                                 (companion HTML + svg)
 *   .vitepress/versions.json                          (nav dropdown source)
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(SITE_DIR, '..');
const SPEC_PATH = 'docs/visual-spec.md'; // path within the repo (stable across history)
const GH = 'https://github.com/byte5ai/omadia-ui';

// Newest first. `commit: null` means "current working tree" (the live latest).
// Commit→version mapping verified against `git log --follow -- docs/visual-spec.md`.
const VERSIONS = [
  { id: 'v0.4', dir: 'latest', alias: 'v0.4', label: 'v0.4 (latest)', commit: null,
    title: 'Surface-nesting ladder & chrome budget' },
  { id: 'v0.3', dir: 'v0.3', label: 'v0.3', commit: '78a904b',
    title: 'Three-register typography' },
  { id: 'v0.2', dir: 'v0.2', label: 'v0.2', commit: '57282cc',
    title: 'Lume material adoption' },
  { id: 'v0.1', dir: 'v0.1', label: 'v0.1', commit: '0a977bb',
    title: 'First draft — tokens, primitives, idioms' },
];

const git = (args) => execSync(`git ${args}`, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

function readSpecAt(commit) {
  if (commit === null) return readFileSync(join(REPO_ROOT, SPEC_PATH), 'utf8');
  return git(`show ${commit}:${SPEC_PATH}`);
}

/** Rewrite the spec's relative companion links to site-absolute /previews/ paths. */
function fixLinks(md) {
  return md.replace(/\]\(\.\/(visual-spec-preview[^)]*\.html)\)/g, '](/previews/$1)');
}

/** Insert a version banner right after the document's first H1. */
function withBanner(md, version, meta) {
  const lines = md.split('\n');
  const h1 = lines.findIndex((l) => /^#\s/.test(l));
  const banner = version.commit === null
    ? `\n::: tip Latest version — ${version.id}\nThis is the current published spec. `
      + `[Version history & authorship →](/history)\n:::\n`
    : `\n::: warning Archived snapshot — ${version.id}\n${version.title}. Reconstructed from commit `
      + `[\`${version.commit}\`](${GH}/commit/${meta.full}) (${meta.date}, ${meta.author}). `
      + `[View latest →](/latest/) · [Version history →](/history)\n:::\n`;
  const at = h1 >= 0 ? h1 + 1 : 0;
  lines.splice(at, 0, banner);
  return lines.join('\n');
}

function commitMeta(commit) {
  const out = git(`show -s --format=%H%x09%an%x09%ad --date=short ${commit}`).trim();
  const [full, author, date] = out.split('\t');
  return { full, author, date };
}

function clean() {
  for (const v of VERSIONS) {
    rmSync(join(SITE_DIR, v.dir), { recursive: true, force: true });
    if (v.alias) rmSync(join(SITE_DIR, v.alias), { recursive: true, force: true });
  }
  rmSync(join(SITE_DIR, 'history.md'), { force: true });
  rmSync(join(SITE_DIR, 'public', 'previews'), { recursive: true, force: true });
}

function writePage(dir, md) {
  const target = join(SITE_DIR, dir);
  mkdirSync(target, { recursive: true });
  writeFileSync(join(target, 'index.md'), md, 'utf8');
}

function generateVersionPages() {
  for (const v of VERSIONS) {
    const meta = v.commit ? commitMeta(v.commit) : null;
    const md = withBanner(fixLinks(readSpecAt(v.commit)), v, meta);
    writePage(v.dir, md);
    if (v.alias) writePage(v.alias, md); // latest also addressable as /v0.4/
  }
  console.log(`generate: wrote ${VERSIONS.length} version pages`);
}

function copyPreviews() {
  const previews = [
    'docs/visual-spec-preview.html',
    'docs/visual-spec-preview-lume.html',
    'docs/visual-spec-preview-type.html',
    'docs/architecture-3tier.svg',
  ];
  const dest = join(SITE_DIR, 'public', 'previews');
  mkdirSync(dest, { recursive: true });
  let n = 0;
  for (const p of previews) {
    const src = join(REPO_ROOT, p);
    if (existsSync(src)) { copyFileSync(src, join(dest, p.split('/').pop())); n++; }
  }
  console.log(`generate: copied ${n} companion assets to public/previews/`);
}

function generateHistory() {
  // One commit per line; fields tab-separated. Subjects never contain tabs/newlines.
  const raw = git(`log --follow --date=short --format=%H%x09%h%x09%an%x09%ad%x09%s -- ${SPEC_PATH}`);
  const commits = raw.split('\n').map((r) => r.trimEnd()).filter(Boolean).map((r) => {
    const [full, short, author, date, ...rest] = r.split('\t');
    return { full, short, author, date, subject: rest.join('\t') };
  });
  const byCommit = new Map(VERSIONS.filter((v) => v.commit).map((v) => [v.commit, v]));

  const versionRows = VERSIONS.map((v) => {
    const meta = v.commit ? commitMeta(v.commit) : latestMeta(commits);
    const link = v.commit ? `[\`${v.commit}\`](${GH}/commit/${meta.full})` : '_(working tree)_';
    return `| [${v.label}](/${v.dir}/) | ${meta.date} | ${meta.author} | ${v.title} | ${link} |`;
  }).join('\n');

  const logRows = commits.map((c) => {
    const v = byCommit.get(c.short);
    const tag = v ? ` \`${v.id}\`` : '';
    return `| ${c.date} | ${c.author} | ${escapePipes(c.subject)}${tag} | [\`${c.short}\`](${GH}/commit/${c.full}) |`;
  }).join('\n');

  const md = `# Version history & authorship

> Auto-generated from \`git log --follow -- ${SPEC_PATH}\` at build time — who added
> what, when. The summaries mirror the document's own §12 changelog; the dates and
> authors come straight from git, so this page cannot drift from the real history.

## Versions

| Version | Date | Author | Summary | Defining commit |
|---|---|---|---|---|
${versionRows}

Each version above is a full, browsable snapshot reconstructed from the commit that
defined it. Use the **Versions** dropdown in the top navigation to switch between them.

## Full commit history

Every commit that touched the spec, newest first.

| Date | Author | Change | Commit |
|---|---|---|---|
${logRows}
`;
  writeFileSync(join(SITE_DIR, 'history.md'), md, 'utf8');
  console.log(`generate: wrote history.md (${commits.length} commits)`);
}

function latestMeta(commits) {
  // newest commit that touched the file = the latest page's effective authorship
  const c = commits[0];
  return { full: c.full, author: c.author, date: c.date };
}

const escapePipes = (s) => s.replace(/\|/g, '\\|');

function writeVersionsJson() {
  const items = VERSIONS.map((v) => ({ text: v.label, link: `/${v.dir}/` }));
  mkdirSync(join(SITE_DIR, '.vitepress'), { recursive: true });
  writeFileSync(join(SITE_DIR, '.vitepress', 'versions.json'), JSON.stringify(items, null, 2), 'utf8');
  console.log(`generate: wrote .vitepress/versions.json (${items.length} entries)`);
}

clean();
generateVersionPages();
copyPreviews();
generateHistory();
writeVersionsJson();
console.log('generate: done');
