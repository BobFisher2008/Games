// End-to-end check of Lately in headless Chromium on a phone-sized screen.
// Run: node apps/lately/build.mjs && node apps/lately/test/flow.mjs [screenshot-dir]
// Drives the app only through visible labels, the way a person would.
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { mkdirSync } from "node:fs";

// The pre-installed Playwright resolves through require(), not ESM import.
const { chromium } = createRequire(import.meta.url)("playwright");

const here = dirname(fileURLToPath(import.meta.url));
const page_url = pathToFileURL(join(here, "..", "..", "..", "docs", "lately", "index.html")).href;
const shots = process.argv[2] || null;
if (shots) mkdirSync(shots, { recursive: true });

let passed = 0, failed = 0;
const results = [];
function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : "  -> " + detail}`);
  ok ? passed++ : failed++;
}
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const browser = await chromium.launch();
const errors = [];
async function newPage(scheme = "light") {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, colorScheme: scheme, hasTouch: true, isMobile: true });
  // Fonts come from Google Fonts; block them so the test doesn't depend on the network.
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/net::ERR_FAILED|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  return { ctx, page };
}
const noSideScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

// ---------- 1. Date and status logic ----------
{
  const { ctx, page } = await newPage();
  await page.clock.install({ time: new Date("2026-11-12T10:00:00") });
  await page.goto(page_url);
  const L = (fn, ...args) => page.evaluate(([fn, args]) => window.__lately[fn](...args), [fn, args]);
  eq("month add clamps to end of February", await L("addMonths", "2026-01-31", 1), "2026-02-28");
  eq("month add handles leap year", await L("addMonths", "2028-01-31", 1), "2028-02-29");
  eq("month add crosses the year", await L("addMonths", "2026-11-30", 3), "2027-02-28");
  eq("weekly interval", await L("addInterval", "2026-11-12", { n: 2, u: "w" }), "2026-11-26");
  eq("day count across a DST change", await L("daysBetween", "2026-03-28", "2026-03-30"), 2);
  eq("day count across a year", await L("daysBetween", "2026-12-30", "2027-01-02"), 3);
  const st = (c, t) => L("statusOf", c, t);
  const base = { every: { n: 1, u: "w" }, snooze: null };
  eq("never logged is due now", (await st({ ...base, history: [] }, "2026-11-12")).kind, "due");
  eq("due exactly on the day", (await st({ ...base, history: ["2026-11-05"] }, "2026-11-12")).kind, "due");
  eq("weekly done 6 days ago is coming up", (await st({ ...base, history: ["2026-11-06"] }, "2026-11-12")).kind, "soon");
  eq("weekly done yesterday is later", (await st({ ...base, history: ["2026-11-11"] }, "2026-11-12")).kind, "later");
  eq("overdue days counted", (await st({ ...base, history: ["2026-11-01"] }, "2026-11-12")).over, 4);
  eq("snooze pushes due date", (await st({ ...base, history: ["2026-11-01"], snooze: "2026-11-13" }, "2026-11-12")).kind, "soon");
  const yearly = await st({ every: { n: 12, u: "m" }, history: ["2025-11-12"], snooze: null }, "2026-11-12");
  const plants = await st({ every: { n: 4, u: "d" }, history: ["2026-11-06"], snooze: null }, "2026-11-12");
  check("a yearly job just due ranks below plants 2 days over", yearly.progress < plants.progress, `${yearly.progress} vs ${plants.progress}`);
  const rh = await L("rhythmOf", { every: { n: 2, u: "w" }, history: ["2026-10-01", "2026-10-11", "2026-10-22", "2026-11-01"] });
  eq("learned rhythm suggests every 10 days", rh && rh.every, { n: 10, u: "d" });
  eq("no suggestion when rhythm matches", await L("rhythmOf", { every: { n: 1, u: "w" }, history: ["2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22"] }), null);
  await ctx.close();
}

// ---------- 2. A new user sets up and completes the main task ----------
{
  const { ctx, page } = await newPage();
  await page.clock.install({ time: new Date("2026-11-12T10:00:00") });
  await page.goto(page_url);
  const heading = await page.getByRole("heading", { level: 1 }).textContent();
  eq("first screen asks what to track", heading, "What do you need to do every so often?");
  check("Next is disabled until something is picked", await page.getByRole("button", { name: "Next" }).isDisabled());
  if (shots) await page.screenshot({ path: join(shots, "1-setup.png"), fullPage: false });

  for (const name of ["Water plants", "Change bedsheets", "Wash towels"]) await page.getByRole("button", { name: new RegExp("^" + name) }).click();
  await page.getByLabel("Add something else").fill("Clean gutters");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  eq("picked count shown", await page.locator("#pick-count").textContent(), "4 chores picked");
  check("no sideways scrolling on setup", await noSideScroll(page));
  await page.getByRole("button", { name: "Next" }).click();

  eq("second screen asks when", await page.getByRole("heading", { level: 1 }).textContent(), "When did you last do each one?");
  await page.getByRole("radiogroup", { name: "Last done: Water plants" }).getByRole("radio", { name: "Last week" }).click();
  await page.getByRole("radiogroup", { name: "Last done: Change bedsheets" }).getByRole("radio", { name: "This week" }).click();
  await page.getByRole("radiogroup", { name: "Last done: Clean gutters" }).getByRole("radio", { name: "Today" }).click();
  await page.getByLabel("How often: Clean gutters").selectOption({ label: "Every 3 months" });
  if (shots) await page.screenshot({ path: join(shots, "2-when.png") });
  await page.getByRole("button", { name: "Show my list" }).click();

  eq("list headline counts due chores", await page.getByRole("heading", { level: 1 }).textContent(), "2 things are due");
  const dueSec = page.getByRole("region", { name: "Due" });
  eq("due section lists the right chores", await dueSec.locator(".chore-name").allTextContents(), ["Water plants", "Wash towels"]);
  check("setup toast explains the next step", (await page.locator("#toast-msg").textContent()).includes("Tap Done"));
  if (shots) await page.screenshot({ path: join(shots, "3-list.png") });

  // The main task: mark something done.
  await page.getByRole("button", { name: "Mark Water plants done today" }).click();
  eq("headline updates after Done", await page.getByRole("heading", { level: 1 }).textContent(), "1 thing is due");
  check("toast says when it is next due", (await page.locator("#toast-msg").textContent()).includes("Due in 4 days"));
  if (shots) await page.screenshot({ path: join(shots, "4-after-done.png") });

  // Undo
  await page.getByRole("button", { name: "Mark Wash towels done today" }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  eq("undo restores the due chore", await page.getByRole("heading", { level: 1 }).textContent(), "1 thing is due");

  // Persistence
  await page.reload();
  eq("list survives a reload", await page.getByRole("heading", { level: 1 }).textContent(), "1 thing is due");

  // Log an earlier day from the detail sheet (the "forgot to tap Done" case)
  await page.getByRole("button", { name: /^Wash towels: Due now/ }).click();
  await page.getByRole("button", { name: "Done on an earlier day" }).click();
  await page.getByRole("button", { name: "Yesterday" }).click();
  check("sheet shows the new history entry", await page.locator("#sheet .history").getByText("Wed 11 Nov").isVisible());
  eq("status follows the backdated entry", await page.locator("#sheet .status-big").textContent(), "Due in 6 days");
  if (shots) await page.screenshot({ path: join(shots, "5-detail.png") });
  await page.getByRole("button", { name: "Close" }).click();
  eq("everything is caught up", await page.getByRole("heading", { level: 1 }).textContent(), "You're all caught up");

  // Add a chore with a picked date, then push it to tomorrow
  await page.getByRole("button", { name: "+ Add chore" }).click();
  await page.getByLabel("What do you do every so often?").fill("Descale kettle");
  await page.getByLabel("What do you do every so often?").dispatchEvent("change");
  eq("known chore fills in its usual interval", await page.locator("#a-every").inputValue(), "1m");
  await page.getByRole("radio", { name: "Pick a day" }).click();
  await page.getByLabel("Day you last did it").fill("2026-09-30");
  await page.getByRole("button", { name: "Add chore", exact: true }).click();
  eq("added chore is due", await page.getByRole("region", { name: "Due" }).locator(".chore-name").allTextContents(), ["Descale kettle"]);
  await page.getByRole("button", { name: /^Descale kettle:/ }).click();
  await page.getByRole("button", { name: "Not today" }).click();
  eq("Not today moves it to Coming up", await page.getByRole("region", { name: "Coming up" }).locator(".chore-name").allTextContents(), ["Descale kettle"]);

  // Empty name is rejected with a clear message
  await page.getByRole("button", { name: "+ Add chore" }).click();
  await page.getByRole("button", { name: "Add chore", exact: true }).click();
  eq("empty name shows an error", await page.locator("#a-err").textContent(), "Give the chore a name.");
  await page.keyboard.press("Escape");

  // Edit and delete with in-page confirmation
  await page.locator("#later-sec > summary").click();
  await page.getByRole("button", { name: /^Clean gutters:/ }).click();
  await page.getByRole("button", { name: "Delete chore" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  check("deleted chore is gone", !(await page.locator(".chore-name").allTextContents()).includes("Clean gutters"));

  // Day rollover while the app is open
  await page.clock.fastForward(4 * 24 * 60 * 60 * 1000);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  check("list refreshes on a new day", (await page.getByRole("heading", { level: 1 }).textContent()) !== "You're all caught up");
  check("no sideways scrolling on the list", await noSideScroll(page));
  await ctx.close();
}

// ---------- 3. Sample data, learned rhythm, backup, dark theme ----------
{
  const { ctx, page } = await newPage("dark");
  await page.clock.install({ time: new Date("2026-11-12T10:00:00") });
  await page.goto(page_url);
  await page.getByRole("button", { name: "Just looking? Try it with sample chores" }).click();
  eq("sample shows 4 due", await page.getByRole("heading", { level: 1 }).textContent(), "4 things are due");
  check("sample banner is visible", await page.getByText("You're looking at sample chores.").isVisible());
  if (shots) await page.screenshot({ path: join(shots, "6-sample-dark.png") });
  await page.getByRole("button", { name: /^Change bedsheets:/ }).click();
  check("learned rhythm is suggested", await page.getByText("You've been doing this about every 10 days").isVisible());
  await page.getByRole("button", { name: "Change to every 10 days" }).click();
  check("rhythm change applied", (await page.locator("#sheet .mini").first().textContent()).includes("Every 10 days"));
  await page.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "More" }).click();
  await page.getByRole("button", { name: "Copy backup" }).click();
  const backup = await page.locator("#m-backup").inputValue();
  check("backup text is produced", backup.startsWith('{"v":1'));
  await page.getByRole("button", { name: "Erase everything" }).click();
  await page.getByRole("button", { name: "Yes, replace my list" }).click();
  eq("erase returns to setup", await page.getByRole("heading", { level: 1 }).textContent(), "What do you need to do every so often?");
  await page.getByRole("button", { name: "Just looking? Try it with sample chores" }).click();
  await page.getByRole("button", { name: "More" }).click();
  await page.locator("#m-backup").fill("not a backup");
  await page.getByRole("button", { name: "Restore from pasted backup" }).click();
  check("bad backup is rejected", await page.getByText("doesn't look like a Lately backup").isVisible());
  await page.locator("#m-backup").fill(backup);
  await page.getByRole("button", { name: "Restore from pasted backup" }).click();
  check("good backup restores", (await page.locator("#toast-msg").textContent()) === "Backup restored.");
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  eq("dark theme background applied", bodyBg, "rgb(18, 24, 21)");
  await ctx.close();
}

await browser.close();
eq("no script errors", errors, []);
console.log(results.join("\n"));
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
