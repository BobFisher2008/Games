// Renders apps/lately/icon.svg to the PNG sizes the web app manifest needs.
// Run once after changing the icon: node apps/lately/make-icons.cjs
const { chromium } = require("playwright");
const { readFileSync, mkdirSync } = require("node:fs");
const { join } = require("node:path");
(async () => {
  const svg = readFileSync(join(__dirname, "icon.svg"), "utf8");
  const out = join(__dirname, "..", "..", "docs", "lately");
  mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  for (const size of [192, 512]) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await page.screenshot({ path: join(out, `icon-${size}.png`) });
    await page.close();
  }
  await browser.close();
  console.log("Wrote docs/lately/icon-192.png and icon-512.png");
})();
