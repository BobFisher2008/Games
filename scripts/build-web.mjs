// Turns src/game.html (the artifact page, which has no <html>/<head>/<body>)
// into www/index.html for the Android app:
//  - wraps it in a full document with the same base styles the artifact host adds
//  - swaps Google Fonts for font files bundled from @fontsource, so the game works offline
//  - mirrors saved progress into Capacitor Preferences (native storage) and maps the
//    Android back button to "close the open panel", then minimises the app
//  - adds rewarded ads (AdMob) as window.LC_ADS; ids come from ads.config.json
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

// 3. Rewarded ads (AdMob). Debug builds always use Google's test ad, so testing on
// your own phone never touches real ads. Release builds use ads.config.json.
const ADS = JSON.parse(readFileSync(join(root, "ads.config.json"), "utf8"));
const GOOGLE_TEST_PUB = "ca-app-pub-3940256099942544";
const GOOGLE_TEST_REWARDED = GOOGLE_TEST_PUB + "/5224354917";
if (!/^ca-app-pub-\d{16}~\d{10}$/.test(ADS.appId || "")) throw new Error("ads.config.json: appId should look like ca-app-pub-0000000000000000~0000000000");
if (!/^ca-app-pub-\d{16}\/\d{10}$/.test(ADS.rewardedId || "")) throw new Error("ads.config.json: rewardedId should look like ca-app-pub-0000000000000000/0000000000");
if (ADS.appId.split("~")[0] !== ADS.rewardedId.split("/")[0]) throw new Error("ads.config.json: appId and rewardedId come from different AdMob accounts");
const rewardedId = BUILD === "release" ? ADS.rewardedId : GOOGLE_TEST_REWARDED;
const adsTesting = rewardedId.startsWith(GOOGLE_TEST_PUB + "/");
if (BUILD === "release" && adsTesting) console.warn("Note: this release build shows Google test ads. Put your own AdMob ids in ads.config.json before going live.");
// Debug only, optional: LC_CONSENT_TEST_DEVICE=<id from logcat> makes this phone act as if it's in
// the EEA so the consent form can be checked.
const consentOpts = BUILD === "debug" && process.env.LC_CONSENT_TEST_DEVICE
  ? { debugGeography: 1, testDeviceIdentifiers: [process.env.LC_CONSENT_TEST_DEVICE] }
  : {};

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
  // Rewarded ads. The game calls window.LC_ADS when it exists and falls back to its
  // pretend ad otherwise (web prototype). Consent (EEA/UK) is asked at launch via
  // Google's consent form, before any ad is requested.
  var AdMob = plugins.AdMob;
  if (native && AdMob) {
    var AD_ID = ${JSON.stringify(rewardedId)};
    var canAds = false, privacyRequired = false, setupFailed = false, loaded = false, loading = null;
    var runSetup = function () {
      setupFailed = false;
      return AdMob.requestConsentInfo(${JSON.stringify(consentOpts)})
        .then(function (info) {
          return info.status === "REQUIRED" && info.isConsentFormAvailable ? AdMob.showConsentForm() : info;
        })
        .then(function (info) {
          canAds = !!info.canRequestAds;
          privacyRequired = info.privacyOptionsRequirementStatus === "REQUIRED";
          if (canAds) return AdMob.initialize({ maxAdContentRating: "Teen" }).then(function () { load(); });
        })
        .catch(function () { setupFailed = true; });
    };
    var load = function () {
      if (loaded) return Promise.resolve(true);
      if (!loading) {
        loading = AdMob.prepareRewardVideoAd({ adId: AD_ID })
          .then(function () { loaded = true; return true; }, function () { return false; })
          .then(function (ok) { loading = null; return ok; });
      }
      return loading;
    };
    var setup = runSetup();
    window.LC_ADS = {
      testing: ${JSON.stringify(adsTesting)},
      // Resolves true when an ad is loaded and ready to show (gives up after 12 seconds).
      ready: function () {
        if (setupFailed) setup = runSetup();
        return setup.then(function () {
          if (!canAds) return false;
          return Promise.race([load(), new Promise(function (r) { setTimeout(function () { r(false); }, 12000); })]);
        });
      },
      // Resolves "rewarded", "closed" (closed early) or "failed".
      show: function () {
        return new Promise(function (resolve) {
          var rewarded = false, finished = false, handles = [];
          var done = function (result) {
            if (finished) return;
            finished = true; loaded = false;
            handles.forEach(function (h) { h.then(function (x) { x.remove(); }).catch(function () {}); });
            resolve(result);
            setTimeout(load, 1000);
          };
          handles.push(AdMob.addListener("onRewardedVideoAdReward", function () { rewarded = true; }));
          handles.push(AdMob.addListener("onRewardedVideoAdDismissed", function () {
            // The reward event can arrive just after the ad closes.
            setTimeout(function () { done(rewarded ? "rewarded" : "closed"); }, 300);
          }));
          handles.push(AdMob.addListener("onRewardedVideoAdFailedToShow", function () { done("failed"); }));
          AdMob.showRewardVideoAd().then(function () { rewarded = true; }, function () { done("failed"); });
        });
      },
      privacyRequired: function () { return privacyRequired; },
      privacyOptions: function () { return AdMob.showPrivacyOptionsForm().catch(function () {}); }
    };
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
