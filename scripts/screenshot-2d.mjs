// One-shot Playwright self-verify for chunk 2d primitives.
// Usage: node scripts/screenshot-2d.mjs <baseUrl>
//   default baseUrl: http://localhost:8081

import { chromium } from 'playwright';

const baseUrl = process.argv[2] ?? 'http://localhost:8081';
const url = `${baseUrl}/dev-components`;
const outDir = new URL('../', import.meta.url).pathname;

async function shoot(page, name) {
  const path = `${outDir}dev-components-2d-${name}.png`;
  await page.screenshot({ path, fullPage: true });
  console.log('saved', path);
}

const browser = await chromium.launch();
try {
  // Mobile pass — 375×667
  {
    const ctx = await browser.newContext({
      viewport: { width: 375, height: 667 },
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shoot(page, '375-full');

    // Scroll to CurrencyInput section
    await page.getByText('CurrencyInput', { exact: true }).first().scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await page.screenshot({
      path: `${outDir}dev-components-2d-375-currency.png`,
    });

    // Open half-sheet
    await page.getByRole('button', { name: 'Open half-sheet' }).click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: `${outDir}dev-components-2d-375-sheet.png`,
    });
    await ctx.close();
  }

  // Desktop pass — 1280×900
  {
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.log('[console.error]', msg.text());
    });
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    await shoot(page, '1280-full');

    // Open half-sheet
    await page.getByRole('button', { name: 'Open half-sheet' }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${outDir}dev-components-2d-1280-sheet.png` });

    // Dismiss, then open dynamic
    await page.keyboard.press('Escape').catch(() => {});
    await page.waitForTimeout(400);
    // Backdrop click as fallback dismiss
    await page.mouse.click(50, 50).catch(() => {});
    await page.waitForTimeout(600);

    await page.getByRole('button', { name: 'Open dynamic-sized' }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Open dynamic-sized' }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${outDir}dev-components-2d-1280-sheet-dynamic.png` });
    await ctx.close();
  }
} finally {
  await browser.close();
}
