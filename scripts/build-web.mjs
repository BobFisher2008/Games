// Turns src/game.html (the artifact page, which has no <html>/<head>/<body>)
// into www/index.html for the Android app:
//  - wraps it in a full document with the same base styles the artifact host adds
//  - swaps Google Fonts for font files bundled from @fontsource, so the game works offline
//  - mirrors saved progress into Capacitor Preferences (native storage) and maps the
//    Android back button to "close the open panel", then minimises the app
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// --release hides the Studio's testing tools (used for Play Store builds).
const BUILD = process.argv.includes("--release") ? "release" : "debug";
const src = readFileSync(join(root, "src", "game.html"), "utf8");
const out = join(root, "www");
const STORE_KEY = "last-coat-v1"; // must match STORE_KEY in src/game.html

if (!src.includes(`"${STORE_KEY}"`)) {
  throw new Error(`src/game.html no longer uses the storage key "${STORE_KEY}". Update STORE_KEY in scripts/build-web.mjs.`);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "fonts", "licenses"), { recursive: true });

// 1. Bundle fonts
const FONTS = [
  { pkg: "big-shoulders-display", family: "Big Shoulders Display", weights: [700, 900] },
  { pkg: "atkinson-hyperlegible", family: "Atkinson Hyperlegible", weights: [400, 700] },
  { pkg: "ibm-plex-mono", family: "IBM Plex Mono", weights: [500] }
];
let fontCss = "";
for (const f of FONTS) {
  const dir = join(root, "node_modules", "@fontsource", f.pkg);
  for (const w of f.weights) {
    const file = `${f.pkg}-latin-${w}-normal.woff2`;
    const from = join(dir, "files", file);
    if (!existsSync(from)) throw new Error(`Missing font file ${from}. Run npm install.`);
    copyFileSync(from, join(out, "fonts", file));
    fontCss += `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${w};font-display:swap;src:url("./${file}") format("woff2");}\n`;
  }
  copyFileSync(join(dir, "LICENSE"), join(out, "fonts", "licenses", `${f.pkg}.txt`));
}
writeFileSync(join(out, "fonts", "fonts.css"), fontCss);

// 2. Split the artifact into head and body parts
const title = (src.match(/<title>[\s\S]*?<\/title>/) || ["<title>Last Coat</title>"])[0];
const styleStart = src.indexOf("<style>");
const styleEnd = src.indexOf("</style>") + "</style>".length;
if (styleStart < 0 || styleEnd < styleStart) throw new Error("Could not find the <style> block in src/game.html");
const style = src.slice(styleStart, styleEnd);
let body = src.slice(styleEnd);

// Start the game only after saved progress has been read from native storage.
const scriptOpen = body.indexOf("<script>");
const scriptClose = body.lastIndexOf("</script>");
if (scriptOpen < 0 || scriptClose < scriptOpen) throw new Error("Could not find the game <script> in src/game.html");
body =
  body.slice(0, scriptOpen) +
  "<script>window.__lcBoot(function () {" +
  body.slice(scriptOpen + "<script>".length, scriptClose) +
  "});</script>" +
  body.slice(scriptClose + "</script>".length);

const bootstrap = `<script>window.LC_BUILD = ${JSON.stringify(BUILD)};</script>
<script>
(function () {
  var KEY = ${JSON.stringify(STORE_KEY)};
  var cap = window.Capacitor;
  var native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
  var plugins = (cap && cap.Plugins) || {};
  var ready = Promise.resolve();
  var Prefs = plugins.Preferences;
  if (native && Prefs) {
    var setItem = Storage.prototype.setItem;
    ready = Prefs.get({ key: KEY }).then(function (r) {
      try { if (r && r.value) setItem.call(window.localStorage, KEY, r.value); } catch (e) {}
    }).catch(function () {});
    Storage.prototype.setItem = function (k, v) {
      setItem.call(this, k, v);
      if (k === KEY && this === window.localStorage) Prefs.set({ key: KEY, value: String(v) }).catch(function () {});
    };
  }
  var App = plugins.App;
  if (native && App) {
    App.addListener("backButton", function () {
      if (document.querySelector(".sheet:not([hidden])")) {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      } else if (App.minimizeApp) {
        App.minimizeApp();
      } else {
        App.exitApp();
      }
    });
  }
  window.__lcBoot = function (start) { ready.then(start, start); };
})();
</script>`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">
${title}
<link rel="stylesheet" href="fonts/fonts.css">
<style>
:root { color-scheme: light; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body { margin: 0; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; -webkit-user-select: none; user-select: none; overscroll-behavior: none; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>
${bootstrap}
${style}
</head>
<body>
${body.trim()}
</body>
</html>
`;
writeFileSync(join(out, "index.html"), html);
console.log(`Built www/index.html (${BUILD}, ${(html.length / 1024).toFixed(1)} KB) with ${FONTS.reduce((n, f) => n + f.weights.length, 0)} bundled font files.`);
