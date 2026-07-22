const puppeteer = require('puppeteer');
const env = require('../config/env');

/**
 * A single shared browser instance is reused across renders — launching a
 * full browser per PDF is expensive. Concurrency is capped by the PDF
 * worker's `concurrency` option (env.pdf.renderConcurrency), not here;
 * each concurrent job gets its own page, closed immediately after use.
 */
let browserPromise;

function getBrowser() {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      headless: true,
      executablePath: env.pdf.executablePath,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  }
  return browserPromise;
}

async function renderHtmlToPdf(html) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '32px', bottom: '32px', left: '32px', right: '32px' },
    });
  } finally {
    await page.close();
  }
}

async function closeBrowser() {
  if (browserPromise) {
    const browser = await browserPromise;
    await browser.close();
    browserPromise = undefined;
  }
}

module.exports = { renderHtmlToPdf, closeBrowser };
