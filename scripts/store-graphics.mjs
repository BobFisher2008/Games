// Renders the Google Play store listing graphics into marketing/store/:
//   icon-512.png            512×512 app icon for the listing
//   feature-graphic.png     1024×500 banner
//   screenshot-1..6.png     1080×1920 phone screenshots with captions
// Screens come from the real release build, rendered in headless Chrome with
// a prepared save file; levels are played with the game's own solver.
import puppeteer from "puppeteer-core";
import sharp from "sharp";
import { execSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "marketing", "store");
const rawDir = join(outDir, "raw");
mkdirSync(rawDir, { recursive: true });
const CHROME = process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe";
const BG = "#1F2430";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Release build: testing tools and test notes are removed.
execSync("node scripts/build-web.mjs --release", { cwd: root, stdio: "inherit" });
const GAME_URL = pathToFileURL(join(root, "www", "index.html")).href;

// Level solutions from the game's own generator and solver.
const src = readFileSync(join(root, "src", "game.html"), "utf8");
const core = src.slice(src.indexOf("// CORE-START"), src.indexOf("// CORE-END"));
const G = new Function(core + "; return { LEVELS, generate, planSolve, seedForLevel };")();
function solution(idx) {
  const L = G.generate(G.LEVELS[idx], G.seedForLevel(idx));
  return G.planSolve(L, L.target, L.rollers, new Array(L.r * L.c).fill(-1), new Set());
}

// A believable mid-game save: levels 1-11 done (29 stars), a few items owned.
function save(over = {}) {
  return {
    stars: { 0: 3, 1: 3, 2: 3, 3: 3, 4: 2, 5: 3, 6: 3, 7: 2, 8: 3, 9: 3, 10: 1 },
    symbols: false, sound: false, haptics: false, endless: 0, current: 11,
    drops: 345, tokens: 1, savers: 1,
    owned: { paints: ["classic", "pastel"], handle: ["classic", "birch"], frame: ["matte", "tape", "oak"] },
    equip: { paints: "classic", handle: "birch", frame: "tape" },
    daily: { last: null, streak: 4 }, claimed: [6, 15],
    can: { fill: 2, ready: 0 }, canRoll: null,
    ads: 0, choices: { doubled: 0, skipped: 0 }, dayShift: 0,
    ...over
  };
}

const SHOTS = [
  {
    title: "Paint whole rows and columns", sub: "Tap a roller and it covers everything in its line.",
    state: save({ current: 11 }),
    act: async (p) => playRollers(p, solution(11).slice(0, 4))
  },
  {
    title: "The last coat wins", sub: "Work out the painting order that matches the reference card.",
    state: save({ current: 15 }),
    act: async (p) => { const s = solution(15); await playRollers(p, s.slice(0, s.length - 3)); await click(p, "#btn-hint"); }
  },
  {
    title: "Finish clean for three stars", sub: "No undos, no hints. Then double your drops or skip.",
    state: save({ current: 12, claimed: [6, 15, 30], owned: { paints: ["classic", "pastel"], handle: ["classic", "birch", "brass"], frame: ["matte", "tape", "oak"] } }),
    act: async (p) => { await playRollers(p, solution(12)); await sleep(500); }
  },
  {
    title: "20 canvases, then endless mode", sub: "Every finished canvas joins your collection.",
    state: save({ current: 11 }),
    act: async (p) => click(p, "#btn-levels")
  },
  {
    title: "Pick a reward from every paint can", sub: "Drops, free hints, streak savers and rare paint sets.",
    state: save({ can: { fill: 1, ready: 1 }, canRoll: [{ type: "drops", amount: 60 }, { type: "item", slot: "paints", id: "neon" }, { type: "hints", amount: 2 }] }),
    act: async (p) => {
      await click(p, "#btn-wallet");
      await click(p, "#studio-inv button");
      await p.evaluate(() => { document.getElementById("studio").hidden = true; });
    }
  },
  {
    title: "Make the studio yours", sub: "Unlock paint sets, roller handles and canvas frames.",
    state: save({
      owned: { paints: ["classic", "pastel", "neon"], handle: ["classic", "birch"], frame: ["matte", "tape", "oak"] },
      equip: { paints: "neon", handle: "birch", frame: "tape" }
    }),
    act: async (p) => click(p, "#btn-wallet")
  }
];

async function click(page, selector) {
  await page.evaluate((s) => { const el = document.querySelector(s); if (!el) throw new Error("Missing " + s); el.click(); }, selector);
  await sleep(250);
}
async function playRollers(page, ids) {
  for (const id of ids) {
    await page.evaluate((i) => document.querySelectorAll(".roller")[i].click(), id);
    await sleep(150);
  }
}

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ["--allow-file-access-from-files", "--hide-scrollbars", "--force-color-profile=srgb"]
});

async function renderGame(shot, file) {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 780, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.emulateMediaFeatures([
    { name: "prefers-reduced-motion", value: "reduce" },
    { name: "prefers-color-scheme", value: "light" }
  ]);
  await page.evaluateOnNewDocument((json) => {
    const s = JSON.parse(json);
    s.daily.last = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
    localStorage.setItem("last-coat-v1", JSON.stringify(s));
  }, JSON.stringify(shot.state));
  await page.goto(GAME_URL, { waitUntil: "load" });
  await page.addStyleTag({ content: ".note, .toast, .gain { display: none !important; }" });
  await page.evaluate(() => document.fonts.ready);
  await sleep(400);
  await shot.act(page);
  await sleep(300);
  // Scripted clicks leave keyboard-style focus rings that touch users never see.
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  await page.screenshot({ path: file });
  await page.close();
}

async function renderHtml(html, name, width, height) {
  const htmlFile = join(rawDir, name + ".html");
  writeFileSync(htmlFile, html);
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: 1 });
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  await sleep(200);
  const png = await page.screenshot({ type: "png" });
  await page.close();
  return png;
}

// Google Play wants screenshots and the feature graphic without an alpha channel.
const opaque = (buf, file) => sharp(buf).flatten({ background: BG }).removeAlpha().png().toFile(file);

const FONTS = `<link rel="stylesheet" href="../../../www/fonts/fonts.css">`;

for (let i = 0; i < SHOTS.length; i++) {
  const shot = SHOTS[i], n = i + 1;
  const raw = join(rawDir, `game-${n}.png`);
  await renderGame(shot, raw);
  const html = `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
    html, body { margin: 0; width: 1080px; height: 1920px; overflow: hidden; background: ${BG}; }
    .wrap { width: 1080px; height: 1920px; display: flex; flex-direction: column; align-items: center;
      background: radial-gradient(circle at 50% 78%, #2B3242 0, ${BG} 62%); }
    .cap { box-sizing: border-box; height: 440px; padding: 104px 90px 0; text-align: center; color: #F4F5F7; }
    h1 { margin: 0; font-family: "Big Shoulders Display", sans-serif; font-weight: 900; font-size: 92px; line-height: .98;
      letter-spacing: .02em; text-transform: uppercase; text-wrap: balance; }
    p { margin: 22px auto 0; max-width: 820px; font-family: "Atkinson Hyperlegible", sans-serif; font-size: 38px; line-height: 1.3; color: #BAC2CD; text-wrap: balance; }
    .phone { box-sizing: border-box; width: 700px; height: 1368px; padding: 16px; border-radius: 64px; background: #0B0D11;
      box-shadow: 0 0 0 2px #343B4A, 0 40px 90px rgba(0, 0, 0, .5); }
    .phone img { display: block; width: 668px; height: 1336px; border-radius: 50px; }
  </style></head><body><div class="wrap">
    <div class="cap"><h1>${shot.title}</h1><p>${shot.sub}</p></div>
    <div class="phone"><img src="game-${n}.png" alt=""></div>
  </div></body></html>`;
  const png = await renderHtml(html, `screenshot-${n}`, 1080, 1920);
  await opaque(png, join(outDir, `screenshot-${n}.png`));
  console.log(`screenshot-${n}.png  ${shot.title}`);
}

// Feature graphic 1024×500
const featureHtml = `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
  html, body { margin: 0; width: 1024px; height: 500px; overflow: hidden; }
  .fg { position: relative; width: 1024px; height: 500px; overflow: hidden;
    background: radial-gradient(circle at 80% 50%, #2C3445 0, ${BG} 58%); }
  .copy { position: absolute; left: 70px; top: 0; bottom: 0; width: 600px; display: flex; flex-direction: column; justify-content: center; gap: 34px; }
  .tape { align-self: flex-start; white-space: nowrap; font-family: "Big Shoulders Display", sans-serif; font-weight: 900; font-size: 100px; line-height: 1;
    letter-spacing: .05em; text-transform: uppercase; color: #3A311E; padding: 18px 40px 14px;
    background: repeating-linear-gradient(90deg, rgba(255,255,255,.18) 0 2px, transparent 2px 5px), #E8D59D;
    transform: rotate(-2.2deg);
    clip-path: polygon(3% 0, 97% 0, 100% 16%, 97.6% 32%, 100% 50%, 97.2% 67%, 99.6% 84%, 97% 100%, 3% 100%, 0 84%, 2.6% 67%, 0 50%, 2.8% 33%, .4% 16%); }
  .tag { margin: 0; font-family: "Atkinson Hyperlegible", sans-serif; font-size: 34px; line-height: 1.3; color: #D5DAE1; max-width: 470px; }
  .art { position: absolute; left: 520px; top: -55px; width: 610px; height: 610px; }
</style></head><body><div class="fg">
  <div class="copy"><div class="tape">Last Coat</div><p class="tag">A painting puzzle where the last coat wins.</p></div>
  <img class="art" src="../../../assets/icon.svg" alt="">
</div></body></html>`;
await opaque(await renderHtml(featureHtml, "feature-graphic", 1024, 500), join(outDir, "feature-graphic.png"));
console.log("feature-graphic.png");

await browser.close();

// Store icon 512×512: full-bleed square; Google Play adds the rounded corners.
const ICON_SCALE = 1.55, big = Math.round(1024 * ICON_SCALE), off = Math.round((big - 1024) / 2);
const art = await sharp(readFileSync(join(root, "assets", "icon.svg")), { density: 200 })
  .resize(big, big).extract({ left: off, top: off, width: 1024, height: 1024 }).png().toBuffer();
// sharp resizes before compositing within one pipeline, so composite first, then resize.
const icon1024 = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: BG } })
  .composite([{ input: art }]).flatten({ background: BG }).png().toBuffer();
await sharp(icon1024).resize(512, 512).png().toFile(join(outDir, "icon-512.png"));
console.log("icon-512.png");
