// Turns apps/lately/app.html (an artifact-style page with no <html>/<head>/<body>)
// into a full web page at docs/lately/index.html, served by GitHub Pages.
// Same wrapping approach as scripts/build-web.mjs for Last Coat.
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const src = readFileSync(join(here, "app.html"), "utf8");

const styleStart = src.indexOf("<style>");
if (styleStart < 0) throw new Error("Could not find the <style> block in app.html");
const headPart = src.slice(0, styleStart);           // <title>, meta, font links
const rest = src.slice(styleStart);
const styleEnd = rest.indexOf("</style>") + "</style>".length;
const style = rest.slice(0, styleEnd);
const body = rest.slice(styleEnd);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Lately keeps track of the things you do every so often, and shows what's due today.">
<meta name="theme-color" content="#F1F4F2">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="icon-192.png">
<link rel="apple-touch-icon" href="icon-192.png">
${headPart.trim()}
<style>
:root { color-scheme: light; padding-top: env(safe-area-inset-top, 0px); padding-bottom: env(safe-area-inset-bottom, 0px); }
body { margin: 0; font: 14px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
img { max-width: 100%; }
[hidden] { display: none !important; }
</style>
${style}
</head>
<body>
${body.trim()}
<script>
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) navigator.serviceWorker.register("sw.js").catch(function () {});
</script>
</body>
</html>
`;

const outDir = join(root, "docs", "lately");
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "index.html"), html);
copyFileSync(join(here, "sw.js"), join(outDir, "sw.js"));
writeFileSync(join(outDir, "manifest.webmanifest"), JSON.stringify({
  name: "Lately",
  short_name: "Lately",
  description: "Keeps track of the things you do every so often, and shows what's due today.",
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#F1F4F2",
  theme_color: "#F1F4F2",
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
  ]
}, null, 2) + "\n");
console.log(`Built docs/lately/index.html (${(html.length / 1024).toFixed(1)} KB)`);
