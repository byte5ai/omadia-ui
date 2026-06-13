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
// Same default as .vitepress/config.mts. VitePress does NOT prepend base to raw
// HTML anchors, so the preview links below must carry it themselves.
const BASE = process.env.DOCS_BASE ?? '/omadia-ui/';

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

/**
 * Rewrite the spec's relative companion-preview links.
 *
 * The previews are standalone static .html files served from /previews/. They
 * are NOT VitePress pages, so an in-app (SPA) click would be intercepted by the
 * router — and cleanUrls strips the `.html`, producing a 404 even though the
 * file resolves on a full load. Emitting a real anchor with target="_blank"
 * makes VitePress skip SPA interception: the browser does a full navigation to
 * the .html, and the preview opens in a new tab. VitePress prepends `base` to
 * the `/`-rooted href at build time, so it must NOT be hard-coded here.
 */
function fixLinks(md) {
  return md.replace(
    /\[`\.?\/?(visual-spec-preview[^`]*\.html)`\]\(\.\/visual-spec-preview[^)]*\.html\)/g,
    (_m, file) => `<a href="${BASE}previews/${file}" target="_blank" rel="noreferrer"><code>${file}</code></a>`,
  );
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

/* ─────────────────────────────────────────────────────────────────────────
 * Lume theme tokens — parsed from the spec's §2 so the site is always styled
 * from the CURRENT spec. Each lookup falls back to a baked v0.4 default, so a
 * format change in one row degrades to the default instead of breaking the build.
 * ───────────────────────────────────────────────────────────────────────── */

// Baked v0.4 defaults (also the fallback if a row can't be parsed).
const TOKEN_DEFAULTS = {
  light: {
    'bg-canvas-top': '#FDFDFE', 'bg-canvas-btm': '#F7F8FB',
    'bg-surface-top': '#FFFFFF', 'bg-surface-btm': '#FAFAFD',
    'bg-raised-top': '#FFFFFF', 'bg-raised-btm': '#FCFCFE',
    'bg-sunken-top': '#F2F3F7', 'bg-sunken-btm': '#ECEDF2',
    'text-1': '#1B1D24', 'text-2': '#5B5F6B', 'text-3': '#8D9099',
    'border-subtle-top': 'rgba(20,24,36,0.05)', 'border-subtle-btm': 'rgba(20,24,36,0.09)',
    'border-default-top': 'rgba(20,24,36,0.08)', 'border-default-btm': 'rgba(20,24,36,0.14)',
    accent: '#1F8FA3', 'accent-hover': '#197D90', 'accent-active': '#146B7C',
    'accent-subtle': 'rgba(31,143,163,0.12)', 'accent-glow': 'rgba(60,175,195,0.32)',
    'accent-glow-strong': 'rgba(60,175,195,0.48)', 'accent-glow-core': 'rgba(180,238,248,0.60)',
  },
  dark: {
    'bg-canvas-top': '#232631', 'bg-canvas-btm': '#1B1D24',
    'bg-surface-top': '#2A2D38', 'bg-surface-btm': '#23262F',
    'bg-raised-top': '#303440', 'bg-raised-btm': '#292C37',
    'bg-sunken-top': '#1D1F26', 'bg-sunken-btm': '#16181E',
    'text-1': '#EEEFF3', 'text-2': '#B6B9C3', 'text-3': '#888B95',
    'border-subtle-top': 'rgba(255,255,255,0.06)', 'border-subtle-btm': 'rgba(0,0,0,0.40)',
    'border-default-top': 'rgba(255,255,255,0.10)', 'border-default-btm': 'rgba(0,0,0,0.50)',
    accent: '#6FC8D6', 'accent-hover': '#88D2DE', 'accent-active': '#A1DCE6',
    'accent-subtle': 'rgba(111,200,214,0.20)', 'accent-glow': 'rgba(111,200,214,0.32)',
    'accent-glow-strong': 'rgba(111,200,214,0.48)', 'accent-glow-core': 'rgba(210,245,250,0.50)',
  },
  radius: { sm: '6px', md: '8px', lg: '12px', pill: '999px' },
};

const sliceBetween = (s, from, toRe) => {
  const i = s.indexOf(from);
  if (i < 0) return '';
  const rest = s.slice(i + from.length);
  const j = rest.search(toRe);
  return j < 0 ? rest : rest.slice(0, j);
};
const hexesIn = (line) => line.match(/#[0-9A-Fa-f]{6}\b/g) || [];
const rgbasIn = (line) => line.match(/rgba?\([^)]*\)/g) || [];
const rowOf = (block, token) => {
  const m = block.match(new RegExp('\\|\\s*`' + token.replace(/\./g, '\\.') + '`\\s*\\|([^\\n]*)'));
  return m ? m[1] : '';
};

function parseTokens() {
  const spec = readFileSync(join(REPO_ROOT, SPEC_PATH), 'utf8');
  // deep-clone defaults so we only overwrite what we can parse
  const out = JSON.parse(JSON.stringify(TOKEN_DEFAULTS));
  try {
    // §2.2 surfaces — light table, then dark table
    const s22 = sliceBetween(spec, '### 2.2 Surface tokens', /\n### 2\.3 /);
    const s22light = sliceBetween(s22, '#### Light mode', /#### Dark mode/);
    const s22dark = sliceBetween(s22, '#### Dark mode', /\n### /);
    const surf = [['bg.canvas', 'bg-canvas'], ['bg.surface', 'bg-surface'],
      ['bg.surface.raised', 'bg-raised'], ['bg.surface.sunken', 'bg-sunken']];
    for (const [tok, key] of surf) {
      const l = hexesIn(rowOf(s22light, tok)); if (l.length >= 2) { out.light[`${key}-top`] = l[0]; out.light[`${key}-btm`] = l[1]; }
      const d = hexesIn(rowOf(s22dark, tok)); if (d.length >= 2) { out.dark[`${key}-top`] = d[0]; out.dark[`${key}-btm`] = d[1]; }
    }
    // §2.3 text — each row: lightHex then darkHex
    const s23 = sliceBetween(spec, '### 2.3 Text tokens', /\n### 2\.4 /);
    for (const [tok, key] of [['text.primary', 'text-1'], ['text.secondary', 'text-2'], ['text.tertiary', 'text-3']]) {
      const h = hexesIn(rowOf(s23, tok)); if (h.length >= 2) { out.light[key] = h[0]; out.dark[key] = h[1]; }
    }
    // §2.4 borders — light then dark, rgba pairs
    const s24 = sliceBetween(spec, '### 2.4 Border tokens', /\n### 2\.5 /);
    const s24light = sliceBetween(s24, '#### Light mode', /#### Dark mode/);
    const s24dark = sliceBetween(s24, '#### Dark mode', /\n### /);
    for (const [tok, key] of [['border.subtle', 'border-subtle'], ['border.default', 'border-default']]) {
      const l = rgbasIn(rowOf(s24light, tok)).map((x) => x.replace(/\s+/g, '')); if (l.length >= 2) { out.light[`${key}-top`] = l[0]; out.light[`${key}-btm`] = l[1]; }
      const d = rgbasIn(rowOf(s24dark, tok)).map((x) => x.replace(/\s+/g, '')); if (d.length >= 2) { out.dark[`${key}-top`] = d[0]; out.dark[`${key}-btm`] = d[1]; }
    }
    // §2.5.3 Lagoon (default palette) — scoped so we don't catch Petrol/Atelier
    const lag = sliceBetween(spec, '#### 2.5.3', /#### 2\.5\.4/);
    const lagLight = sliceBetween(lag, '**Light mode**', /\*\*Dark mode\*\*/);
    const lagDark = sliceBetween(lag, '**Dark mode**', /$(?![\s\S])/);
    const accHex = [['accent', 'accent'], ['accent.hover', 'accent-hover'], ['accent.active', 'accent-active']];
    const accRgba = [['accent.subtle', 'accent-subtle'], ['accent.glow', 'accent-glow'],
      ['accent.glow-strong', 'accent-glow-strong'], ['accent.glow-core', 'accent-glow-core']];
    for (const [tok, key] of accHex) {
      const l = hexesIn(rowOf(lagLight, tok)); if (l[0]) out.light[key] = l[0];
      const d = hexesIn(rowOf(lagDark, tok)); if (d[0]) out.dark[key] = d[0];
    }
    for (const [tok, key] of accRgba) {
      const l = rgbasIn(rowOf(lagLight, tok)).map((x) => x.replace(/\s+/g, '')); if (l[0]) out.light[key] = l[0];
      const d = rgbasIn(rowOf(lagDark, tok)).map((x) => x.replace(/\s+/g, '')); if (d[0]) out.dark[key] = d[0];
    }
    // §2.9 radii
    const s29 = sliceBetween(spec, '### 2.9 Radii', /\n### /);
    for (const [tok, key] of [['radius.sm', 'sm'], ['radius.md', 'md'], ['radius.lg', 'lg'], ['radius.pill', 'pill']]) {
      const m = rowOf(s29, tok).match(/([0-9]+px|999px)/); if (m) out.radius[key] = m[1];
    }
  } catch (e) {
    console.log(`generate: token parse partial (${e.message}); using defaults where needed`);
  }
  return out;
}

function emitVars(mode) {
  return Object.entries(mode).map(([k, v]) => `  --lume-${k}: ${v};`).join('\n');
}

function generateThemeTokens() {
  const t = parseTokens();
  const radius = Object.entries(t.radius).map(([k, v]) => `  --lume-radius-${k}: ${v};`).join('\n');
  const css = `/* GENERATED from docs/visual-spec.md §2 by scripts/generate.mjs — do not edit. */
:root {
${emitVars(t.light)}
${radius}
}
.dark {
${emitVars(t.dark)}
}
`;
  mkdirSync(join(SITE_DIR, '.vitepress', 'theme'), { recursive: true });
  writeFileSync(join(SITE_DIR, '.vitepress', 'theme', 'lume-tokens.css'), css, 'utf8');
  console.log(`generate: wrote theme/lume-tokens.css (accent ${t.light.accent} / ${t.dark.accent})`);
}

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
generateThemeTokens();
writeVersionsJson();
console.log('generate: done');
