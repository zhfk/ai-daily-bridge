'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const date = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) throw new Error('Pass YYYY-MM-DD.');
(async () => {
  const candidate = [process.env.BRIEF_BROWSER_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Google/Chrome/Application/chrome.exe'].find(p => p && fs.existsSync(p));
  const browser = await chromium.launch({ headless: true, ...(candidate ? { executablePath: candidate } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1776, height: 1100 }, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(path.join(root, date, 'preview.html')).href, { waitUntil: 'load', timeout: 60000 });
    const images = await page.locator('.brief-gallery img').evaluateAll(list => list.map(img => ({ src: img.src, loaded: img.complete && img.naturalWidth > 0, width: img.getBoundingClientRect().width, height: img.getBoundingClientRect().height })));
    const desktop = await page.evaluate(() => ({ headings: document.querySelectorAll('h2').length, h1: document.querySelectorAll('h1').length, overflow: document.documentElement.scrollWidth > innerWidth, galleries: [...document.querySelectorAll('.brief-gallery')].map(x => getComputedStyle(x).gridTemplateColumns) }));
    await page.screenshot({ path: path.join(root, date, 'preview-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    await page.screenshot({ path: path.join(root, date, 'preview-mobile.png'), fullPage: true });
    console.log(JSON.stringify({ desktop, mobileOverflow, images }, null, 2));
    if (desktop.headings !== 5 || desktop.h1 !== 0 || desktop.overflow || mobileOverflow || images.some(x => !x.loaded)) process.exitCode = 1;
  } finally { await browser.close(); }
})().catch(err => { console.error(err.message); process.exitCode = 1; });
