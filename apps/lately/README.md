# Lately

Keeps track of the things you do every so often (bedsheets, plants, descaling the kettle) and shows what's due today. Each next date counts from when you actually did it.

**The one job:** show at a glance what's due, and let you log it done in one tap, including "I did it yesterday and forgot to log it."

## Try it

| Where | How |
|---|---|
| Phone, installable | Once this branch is merged to `main`, open https://bobfisher2008.github.io/Games/lately/ in Chrome on Android, then tap ⋮ → **Add to Home screen** (or **Install app**). It works offline. |
| Preview, right now | The private claude.ai preview (link in the conversation). Data is kept in that browser only. |
| Locally | `node apps/lately/build.mjs`, then open `docs/lately/index.html` in a browser. To test install and offline, serve `docs/` over `http://localhost` (for example `cd docs && python3 -m http.server`). |

Data is stored in the browser's `localStorage` on the device. There's no account and no server. **More → Copy backup** gives you a text backup to paste back later.

## Files

| Path | What it is |
|---|---|
| `app.html` | The whole app (HTML, CSS, JS in one file), and the master copy. The claude.ai preview is published from it. |
| `build.mjs` | Wraps `app.html` into `docs/lately/index.html` for GitHub Pages and adds the web app manifest and offline service worker. |
| `sw.js` | The service worker: loads the page from the network first, falls back to the cache when offline. |
| `icon.svg`, `make-icons.cjs` | App icon, and the script that renders it to the 192 and 512 px PNGs. |
| `test/flow.mjs` | Automated checks: date logic plus a full first-time-user run on a phone-sized screen. |

Commands, run from the repo root:

```bash
node apps/lately/build.mjs
```

```bash
node apps/lately/test/flow.mjs
```

```bash
node apps/lately/make-icons.cjs
```

## Why this app

### Research summary (November 2026)

Three candidates, each a recurring problem people already have.

| | A. Flexible chore tracker | B. Routine and place reminders | C. Subscription and free-trial tracker |
|---|---|---|---|
| Who | People running a home: renters, couples, ADHD users | People who forget errands at the moment they matter | Anyone with streaming, software or trial sign-ups |
| Today's struggle | Chores that repeat every so often slip from memory; apps either nag with fixed dates or lock features behind a paywall | Google Keep's location reminders were removed when reminders moved to Google Tasks (2025); Android users look for replacements | People forget what they pay for and forget to cancel trials |
| What existing apps miss | Sweepy reviews ask for no points, family sharing without premium, fair sorting, and a way to log a past day. Wheneri reviewers praise "no guilt" and no paywall | Free, reliable, battery-friendly triggers. Background location needs a Google Play declaration, and Play calls "convenience" a minimal user benefit | Bank-linked trackers need account access. Banks are adding this themselves |
| Verified demand | **User reviews**: Sweepy (justuseapp aggregator), Wheneri (App Store, 4.6, 74 ratings). Many 2025–26 entrants (LastTime, LastDone, Recurrence, ReDo Loop, TaskLoop) | **Product change**: Google Tasks help page and MakeUseOf (Sep 2025) confirm the removal. Paid alternatives exist (Any.do $5.99/mo for location) | **Surveys**: Finder (Australia, n=1,004, Sep 2026): 34% pay for a subscription they don't use |
| Assumptions | Review pain generalises to Android users | People want a new app for this rather than switching to Tasks.org or Samsung Reminder | People will type subscriptions in by hand |

Gaps in the research: Google Play listing pages didn't render for the reader, so Play install counts and Play reviews weren't collected. No search-volume data (Google Trends) was available. Review evidence is from one aggregator and one App Store listing.

### Decision

| | A. Chores | B. Routine reminders | C. Subscriptions |
|---|---|---|---|
| Verified demand | Medium-high (direct review pain) | Medium (feature removed; no review text collected) | Medium (survey data only) |
| Competition | Crowded, but weak on Android, and leaders paywall the basics | Moderate; free options exist | Strong (Rocket Money, banks) |
| How often it's used | Daily to weekly | Daily | Monthly |
| Speed to build and test here | Fast: no special permissions, fully testable in a browser | Slow: needs native background location and app-usage access, Play policy review, and real-device field testing | Fast |

**Chosen: A.** It has the clearest user pain in real reviews, it gets used every day or week, and its core needs no sensitive permissions, so the whole flow can be built and tested now. Routine-triggered reminders (B) have real but indirect evidence. Their core depends on background location and usage access, which can't be validated without physical devices and a Play policy decision. They make a good later addition to this app (for example, a "remind me when I get home" nudge for due chores).

## What the MVP does

- **Setup in two steps:** pick chores from 19 common ones (or type your own), then say roughly when you last did each: Today, This week, Last week, or Can't remember (shows as due).
- **Today list:** Due, Coming up, Later. Sorted by how far each chore is through its own cycle, so a yearly job doesn't jump ahead of the plants.
- **One-tap Done**, with Undo.
- **Done on an earlier day:** Yesterday, 2 days ago, or any date. Fixes the "forgot to press complete" complaint.
- **Not today:** pushes a due chore to tomorrow without guilt.
- **Learned rhythm:** after four logs, if you really do something every 10 days instead of every 2 weeks, it offers to change the interval. It only suggests and never changes it on its own.
- **History** per chore, with remove. Edit name, interval and area. Delete with confirmation.
- **No points, no streaks, no paywall, no account.** Backup by copy and paste. Works offline once installed. Light and dark themes.

## Test record

Automated: `test/flow.mjs`, headless Chromium, 390×844 phone screen, clock fixed to 12 Nov 2026. **47 of 47 checks pass.**

- **Date logic:** month ends (31 Jan + 1 month = 28 Feb), leap years, crossing a year, day counts across a daylight-saving change, due-today boundaries, snooze, sorting fairness, learned-rhythm suggestion on and off.
- **New-user flow, driven only by visible labels:** setup with three suggested chores plus one typed in; set last-done answers and one interval; list headline and Due section correct; Done updates the list and the toast says when it's next due; Undo; data survives a reload; log yesterday from the detail sheet; add a chore with a picked date (a known name fills in its usual interval); Not today; empty-name error; delete with confirmation; refresh on a new day while the app is open; no sideways scrolling.
- **Sample data, backup and theme:** learned-rhythm suggestion applies; backup copy, erase, bad-backup rejection and restore; dark theme.
- **Offline:** served over localhost, the service worker installs, and an offline reload shows the saved list.

Bugs found and fixed during testing: logging an earlier day didn't refresh the list behind the detail sheet; "3 mores coming up soon" wording.

First-time-user walkthrough: see the section below.

## Still needs validation

1. **Real people.** Five or more first-time users on their own Android phones, unguided, timed on setup → first Done. The walkthrough above is a stand-in, not user research.
2. **Retention.** Does anyone still open it after two weeks? Needs a small closed test.
3. **Reminders.** The web version has no notifications, so people must open it. The next step is one daily nudge ("3 things are due") through Capacitor Local Notifications in an Android build, reusing Last Coat's Capacitor setup.
4. **Real phones.** Install from GitHub Pages on two or three Android phones (Chrome, Samsung Internet), including offline use and storage after weeks of not opening it. Browsers may clear site storage, so check whether "Copy backup" is enough or the native build should store data natively, like Last Coat's Preferences mirror.
5. **Household sharing.** The top paid feature in competitors' reviews. It needs sync and an account, so it was left out of the MVP on purpose.
6. **Name.** "Lately" is a working name. Check store and trademark conflicts before publishing.
7. **Mongolian translation** if the first testers are local.
