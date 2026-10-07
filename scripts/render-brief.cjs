'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Pass YYYY-MM-DD.');
const dir = path.join(root, date);
const md = fs.readFileSync(path.join(dir, 'brief.md'), 'utf8').trim();
const metaPath = path.join(dir, 'wordpress.json');
const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
const images = JSON.parse(fs.readFileSync(path.join(dir, 'images.json'), 'utf8'));
const css = fs.readFileSync(path.join(root, 'templates', 'daily-brief.css'), 'utf8');
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(s) {
  return escape(s).replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>');
}
let newsIndex = 0;
const body = md.split(/\r?\n\s*\r?\n/).map((block, index) => {
  if (block === '---') return '<hr>';
  if (block.startsWith('## ')) { newsIndex++; return `<h2>${inline(block.slice(3))}</h2>`; }
  if (block.startsWith('![')) {
    const matches = [...block.matchAll(/!\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)];
    if (!matches.length || matches.length > 3) throw new Error('Gallery must have 1–3 verified images.');
    const cards = matches.map(m => {
      const asset = images.find(x => x.news_index === newsIndex && x.image_url === m[2]);
      if (!asset || !asset.source_page_url || !asset.credit) throw new Error(`Missing image provenance for news ${newsIndex}.`);
      const fit = asset.fit === 'cover' ? 'cover' : 'contain';
      return `<a href="${escape(asset.source_page_url)}" target="_blank" rel="noopener noreferrer"><img src="${escape(m[2])}" alt="${escape(m[1])}" style="object-fit:${fit}" loading="eager"></a>`;
    });
    return `<div class="brief-gallery">${cards.join('')}</div>`;
  }
  const cls = index === 0 ? 'daily-title' : block.startsWith('*图片：') ? 'image-credit' : block.startsWith('来源：') ? 'source-links' : block === '**今天最值得记住的一件事**' ? 'editorial-title' : '';
  return `<p${cls ? ` class="${cls}"` : ''}>${inline(block.replace(/\r?\n/g, ' '))}</p>`;
}).join('\n');
if (newsIndex !== 5 || /<h1\b/i.test(body)) throw new Error('Expected exactly five H2s and no H1.');
meta.content = `<style>${css}</style>\n<article class="ai-daily">\n${body}\n</article>`;
fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf8');
fs.writeFileSync(path.join(dir, 'preview.html'), `<!doctype html>\n<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(meta.title)}</title><style>body{margin:0;background:#fff}</style></head><body>\n${meta.content}\n</body></html>\n`, 'utf8');
console.log(`Rendered ${date}: one article, five news headings, verified image provenance.`);
