// Convert a markdown file to a PDF via marked + headless Chrome.
// Designed for the CTO doc — generous margins, comfortable line-height,
// proper page-break behavior on headings.

import { marked } from 'marked'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { execSync } from 'node:child_process'

const [, , mdPath, outPdfPath] = process.argv
if (!mdPath || !outPdfPath) {
  console.error('usage: node _md-to-pdf.mjs <input.md> <output.pdf>')
  process.exit(1)
}

const md = fs.readFileSync(mdPath, 'utf8')
const title = (md.match(/^#\s+(.+)$/m) ?? [, 'Document'])[1]
const bodyHtml = marked.parse(md, { gfm: true, breaks: false })

const css = `
:root {
  --ink: #1a1a1a;
  --ink-soft: #4a4a4a;
  --rule: #d8d4cc;
  --paper: #fefdfa;
  --code-bg: #f5f1ea;
  --accent: #b8531a;
  --accent-soft: #f0b85c;
}

@page {
  size: Letter;
  margin: 0.9in 0.9in 1in 0.9in;
}

* { box-sizing: border-box; }

html, body {
  background: var(--paper);
  color: var(--ink);
  font-family: "Charter", "Iowan Old Style", "Palatino", "Georgia", serif;
  font-size: 11pt;
  line-height: 1.55;
  margin: 0;
  padding: 0;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

main {
  max-width: 100%;
}

/* Front matter (italics block right after title) */
em {
  font-style: italic;
}

h1, h2, h3, h4 {
  font-family: "Inter", "Helvetica Neue", "Arial", sans-serif;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--ink);
  page-break-after: avoid;
  break-after: avoid;
}

h1 {
  font-size: 22pt;
  line-height: 1.2;
  margin: 0 0 0.6em 0;
  color: var(--ink);
  border-bottom: 2px solid var(--accent);
  padding-bottom: 0.3em;
}

h2 {
  font-size: 15pt;
  margin: 2em 0 0.6em 0;
  padding-top: 0.3em;
  border-top: 1px solid var(--rule);
  page-break-before: auto;
  break-before: auto;
}

/* keep first h2 close to the front matter */
h1 + p + hr + h2 {
  page-break-before: avoid;
  break-before: avoid;
}

h3 {
  font-size: 12.5pt;
  margin: 1.6em 0 0.4em 0;
  color: var(--ink);
}

h4 {
  font-size: 11pt;
  margin: 1.2em 0 0.3em 0;
  color: var(--ink-soft);
  font-weight: 600;
}

p {
  margin: 0 0 0.85em 0;
  orphans: 3;
  widows: 3;
}

/* Lists */
ul, ol {
  margin: 0.4em 0 1em 0;
  padding-left: 1.5em;
}

li {
  margin: 0.3em 0;
  line-height: 1.5;
}

li > p {
  margin: 0.2em 0;
}

li > ul, li > ol {
  margin: 0.3em 0 0.4em 0;
}

/* Strong / emphasis */
strong {
  font-weight: 600;
  color: var(--ink);
}

/* Code: prefer comfortable contrast and readability */
code {
  font-family: "JetBrains Mono", "SF Mono", "Menlo", "Consolas", monospace;
  font-size: 9.5pt;
  background: var(--code-bg);
  padding: 0.05em 0.35em;
  border-radius: 3px;
  color: var(--ink);
}

pre {
  font-family: "JetBrains Mono", "SF Mono", "Menlo", "Consolas", monospace;
  font-size: 9pt;
  background: var(--code-bg);
  padding: 0.85em 1em;
  border-radius: 5px;
  border-left: 3px solid var(--accent-soft);
  overflow-x: auto;
  line-height: 1.45;
  margin: 0.85em 0 1.2em 0;
  white-space: pre;
  page-break-inside: avoid;
  break-inside: avoid;
}

pre code {
  background: transparent;
  padding: 0;
  border-radius: 0;
  font-size: inherit;
}

/* Tables */
table {
  border-collapse: collapse;
  width: 100%;
  margin: 0.8em 0 1.2em 0;
  font-size: 10.5pt;
  page-break-inside: avoid;
  break-inside: avoid;
}

thead th {
  font-family: "Inter", "Helvetica Neue", sans-serif;
  font-weight: 600;
  text-align: left;
  border-bottom: 1.5px solid var(--ink);
  padding: 0.5em 0.6em;
  font-size: 10pt;
  color: var(--ink);
}

tbody td {
  padding: 0.45em 0.6em;
  border-bottom: 1px solid var(--rule);
  vertical-align: top;
  line-height: 1.45;
}

tbody tr:last-child td {
  border-bottom: none;
}

/* Blockquotes */
blockquote {
  margin: 1em 0;
  padding: 0.4em 1em;
  border-left: 3px solid var(--accent-soft);
  background: var(--code-bg);
  color: var(--ink-soft);
  font-style: italic;
}

blockquote p {
  margin: 0.4em 0;
}

/* Horizontal rule */
hr {
  border: none;
  border-top: 1px solid var(--rule);
  margin: 2em 0;
}

/* Links */
a {
  color: var(--accent);
  text-decoration: none;
  border-bottom: 1px dotted var(--accent);
}

/* Top-of-doc front matter (italics block) — slightly muted */
h1 + p {
  color: var(--ink-soft);
  font-size: 10.5pt;
  line-height: 1.4;
  margin-bottom: 1.5em;
}

/* Avoid breaking inside small sections */
h2, h3 { break-inside: avoid; }
table, pre, blockquote { break-inside: avoid; }

/* Section number style for h2/h3 — auto, leave the doc's existing numbering */
`

const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>${css}</style>
</head>
<body>
  <main>
    ${bodyHtml}
  </main>
</body>
</html>`

// Write HTML to a temp file, then invoke headless Chrome to print to PDF.
const tmpHtml = path.join(path.dirname(outPdfPath), '.md-to-pdf-tmp.html')
fs.writeFileSync(tmpHtml, html)

const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const cmd = [
  `"${chrome}"`,
  '--headless=new',
  '--disable-gpu',
  '--no-pdf-header-footer',
  `--print-to-pdf="${path.resolve(outPdfPath)}"`,
  `"file://${path.resolve(tmpHtml)}"`,
].join(' ')

console.log('Running:', cmd)
execSync(cmd, { stdio: 'inherit' })

fs.unlinkSync(tmpHtml)
console.log(`Wrote: ${outPdfPath}`)
