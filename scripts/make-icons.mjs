// Renders assets/icon.svg into the source images @capacitor/assets expects,
// then you run `npm run icons` to generate every Android icon and splash size.
//
// The artwork sits inside the adaptive-icon safe zone (a 611px circle on the
// 1024px canvas), so round, squircle and teardrop launcher masks never clip it.
import { readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assets = join(root, "assets");
mkdirSync(assets, { recursive: true });

const ICON_BG = "#1F2430";
const SPLASH_LIGHT = "#E3E7EA";
const SPLASH_DARK = "#13161B";

// @capacitor/assets insets the foreground by 16.7% on each side, so scale the
// artwork up to fill that inner area without reaching the corners round masks cut.
const ART_SCALE = 1.33;
const big = Math.round(1024 * ART_SCALE), off = Math.round((big - 1024) / 2);
const fgSvg = readFileSync(join(assets, "icon.svg"));
const fg = await sharp(fgSvg, { density: 192 }).resize(big, big)
  .extract({ left: off, top: off, width: 1024, height: 1024 }).png().toBuffer();

const solid = (size, color) => sharp({ create: { width: size, height: size, channels: 4, background: color } });

await sharp(fg).toFile(join(assets, "icon-foreground.png"));
await solid(1024, ICON_BG).png().toFile(join(assets, "icon-background.png"));
await solid(1024, ICON_BG).composite([{ input: fg }]).png().toFile(join(assets, "icon-only.png"));

const splashArt = await sharp(fg).resize(1500, 1500).png().toBuffer();
for (const [name, color] of [["splash.png", SPLASH_LIGHT], ["splash-dark.png", SPLASH_DARK]]) {
  await solid(2732, color).composite([{ input: splashArt, gravity: "center" }]).png().toFile(join(assets, name));
}
console.log("Wrote assets/icon-only.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png");
