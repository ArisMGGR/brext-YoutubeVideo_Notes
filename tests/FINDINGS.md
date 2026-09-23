# Audit findings

Project: `brext-YoutubeVideo_Notes-v1` (Manifest V3 browser extension, no build step)
Scope: full read-only audit of the working tree for public release readiness.

This is the Round 10 report. It replaces the Round 9 narrative in this file, as each earlier
round did to its predecessor (see the standing `tests/FINDINGS.md` decisions in
[LOG.md](LOG.md)). Round 1 to Round 9 defect keys survive in [LOG.md](LOG.md) and in section 5
below. The highest ID in LOG.md and the prior report was F-030, so new IDs start at F-031.

---

## 1. Summary

| Severity             | Count |
| -------------------- | ----- |
| CRITICAL             | 0     |
| HIGH                 | 0     |
| MEDIUM               | 0     |
| **Live total**       | **0** |
| LOW (Backlog)        | 4     |
| REOPENED (in live)   | 0     |
| Suppressed by LOG.md | 30    |

The live total (0) equals the checkbox lines in section 3. The Backlog count (4) equals the
checkbox lines in section 4. The Suppressed count (30) equals the lines in section 5.

---

## 2. Coverage and limits

**Files read in full (19 text files):** `tests/LOG.md` (first), `tests/FINDINGS.md` (prior
content, used only as an ID registry), `tests/VERIFY.md`, `.gitattributes`, `.gitignore`,
`.prettierrc`, `LICENSE`, `README.md`, `manifest.json`, `content/content.js`,
`popup/popup.html`, `popup/popup.css`, `popup/popup.js`, `.github/CONTRIBUTING.md`,
`.github/SECURITY.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/config.yml`,
`.github/ISSUE_TEMPLATE/bug_report.md`, `.github/ISSUE_TEMPLATE/feature_request.md`.

**Files not read, and why:** one further file under `.github/` is out of scope by instruction;
it was covered by the secrets sweep only. The three `icons/*.png` were checked by IHDR header
(16×16, 48×48, 128×128, matching the `manifest.json` `icons` map) plus a printable-string scan
(only chunk names found); pixel data was not decoded.

**LOG.md:** there is no `LOG.md` at the project root. The registry is `tests/LOG.md`, read
first and treated as the authoritative LOG.md. It covers nine rounds: 42 defect lines for 30
distinct IDs (F-001 to F-030, all `fixed`) and 40 `decision` entries. Section 5 carries all 30
logged defect keys forward, as every earlier round did. Three of this round's candidates mapped
onto logged entries and were not reported (see "Considered and not reported": the
`live_stream` embed segment, wiki-link `/` and `:`, and `tests/FINDINGS.md` under Prettier). 0
were reopened; no candidate reproduced a logged failure, so none was re-executed as a reopening.

**Prior tests/FINDINGS.md:** it existed and listed F-001 to F-030. All 30 IDs were carried
over. New IDs are F-031 to F-034. `tests/` already existed and was not created.

**Entry points and modes:**

- The toolbar popup (`popup/popup.html` → `popup/popup.js`, via `init()`), with its notes view,
  its settings view, and its `pagehide` flush.
- The declarative content script (`content/content.js`: `document_idle`,
  `https://www.youtube.com/*`, top frame only).
- On-demand re-injection of that file through `chrome.scripting.executeScript`.
- The two messages the content script answers: `GET_STATE`, and `SEEK_TO` with or without
  `videoId`.

There is no CLI, service worker, options page, environment variable, external command or
network request.

**Stated invariants checked:**

- No top-level `const`/`let`/`var` in `content/content.js`: holds (read; the file's top level
  is function declarations plus the listener swap).
- Every content-script lookup skips `[hidden]` pages: holds (`queryShown()` everywhere, the
  `<video>` fallback filtered by `isShown`).
- `executeScript` only on tabs passing `isYouTubeTab()`: one call site, guarded.
- Every record read-modify-write inside `queueRecordUpdate()`: holds (`saveDraft`,
  `deleteEntry`; `clearAll`'s `removeRecord` queued). All six `getRecord()` callers handle `null`.
- Draft writes through `queueDraftWrite()` except the two in `flushDraftNow()`: holds (grep:
  six `setDraft`/`removeDraft` call sites, exactly as CONTRIBUTING describes).
- Every `chrome.*` callback reads `runtime.lastError`: holds for all 11 callbacks.
- HTML ids map to `els` keys: 26 of 26; every `els` key is used. Every CSS class is used.
- Frontmatter keys and values go through `yamlKey()` / `yamlScalar()`: holds in `buildMarkdown()`.
- `openDraft()`: "Always read the _live_ playback time at the moment Capture is pressed, not the
  value cached when the popup first opened": **violated** when the re-read returns nothing
  (F-032).
- LOG.md Round 7 decision: `prettier --check .` flags only `tests/FINDINGS.md`, "Every project
  file passes": **violated**, `tests/VERIFY.md` is flagged too (F-033).

**What was executed.** Every harness and tree copy was in the session scratchpad, outside the
project. The project tree was only read.

- `node --check` on both scripts, `JSON.parse` on `manifest.json` and `.prettierrc`: pass.
- Line-ending census: CR bytes only in the three PNGs (binary); none in any text file.
- Secrets sweep: vendor value patterns (`AKIA…`, `ghp_…`, `github_pat_…`, `sk-…`, `AIza…`,
  `xox?-…`, PEM private-key headers) over the whole tree; keyword patterns
  (`password`/`secret`/`api_key`/`token`/`bearer` followed by `:` or `=`) outside `tests/`; a
  search for `.env*`, `.pem`, `.key`, `.p12`, `secrets.json`. The only hit is the prior report's
  own description of the sweep. No such file.
- `console.*`/`debugger`/`TODO`/`FIXME`/`XXX`/`HACK` grep over `content/` and `popup/`: none.
- Cached Prettier 3.9.8 (already on disk, nothing installed) `--check .` on a tree copy: flags
  `tests/FINDINGS.md` (the Round 7 decision) and `tests/VERIFY.md` (F-033); the diff for
  `tests/VERIFY.md` is the table's Note column width only.
- `vm` harness running the real `popup/popup.js` with a DOM stub and a `chrome.storage` stub that
  returns copies:
  - Frontmatter for custom property names `<<`, `=`, `2024-01-01`, `1:30` and values
    `2024-01-01`, `1:30`, `<<`, parsed back with js-yaml 5.4.1 and yaml 1.10.3 (both already on
    disk inside another globally installed npm package, loaded by path). All round-trip as text
    in js-yaml and yaml's default 1.2 mode. Only yaml's explicit 1.1 mode differs (see
    "Considered").
  - `formatTimestamp(42)` → `[00:42]`, `formatTimestamp(3723)` → `[01:02:03]` (F-034).
  - Capture with the re-read failing: popup opened at `currentTime` 10, then
    `tabs.sendMessage` erroring and `executeScript` failing. The draft opened at `[00:10]`.
    Control, same harness with the re-read succeeding at 300 s: `[05:00]`. So the harness can
    tell the two apart (F-032).
- `vm` harness running the real `content/content.js`: `getVideoTitle()` on `/shorts/abc` with
  no `h1` and five document titles. `(2) Part two - YouTube` → `Part two`,
  `(2024) Year recap - YouTube` → `Year recap`, `(5) (2) Part two - YouTube` → `(2) Part two`,
  and the two plain or count-only controls came out correct (F-031).
- **Live YouTube DOM** (in-app browser, no account, no consent prompt shown). The file's
  functions were evaluated in the page's main world, transcribed without comments.
  - A directly loaded Short read its own id, title, `@handle` and the shown player's time
    (8.8 s, with the hidden watch player at 0.0 s). After keyboard ↓ the next Short read its own
    id, title and `@handle`.
  - `/embed/dQw4w9WgXcQ` opened directly showed YouTube's "Video player configuration error"
    (Error 153). `getState()` returned `ok: true`, `currentTime` 0, and empty title and channel.
    See "not examined".
- No mutation of project behaviour was run. There is no test suite to mutate (see PASS 5).

**Routines excluded from PASS 1, and why:** `pad`, `storageKey`, `draftKey`, `defaultNameFor`,
`reorderLabel`, `uid`, the queue helpers, `moveItem`, the drag handlers and the DOM builders.
They only receive values the code produced itself. Traced by hand through source:
`yamlNeedsQuotes`, `yamlScalar`, `yamlKey`, `yamlRenumbersKey`, `resolvedKeyFor`,
`wikiLinkTarget`, `formatTimestamp`, `timestampUrl`, `normalizeItem`, `loadItems`,
`migrateLegacyProperties`, `loadSettings`, `buildMarkdown`, `withPageDetails`, `openDraft`,
content `onMessage`/`seekTo`, `getVideoTitle` and `getVideoId`. Reading cannot detect a future
caller that passes raw input.

**PASS 4 (regressions):** the newest project files are `popup/popup.js` and `manifest.json`
(09-24 01:01, the Round 9 fix set), then `tests/VERIFY.md` (09-24 01:07, the Round 9
verification), `popup/popup.html` (09-23 18:56, Round 8), and `content/content.js` and
`README.md` (09-23 18:18, Round 7). The Round 9 regions were read for what they do:
`wikiLinkTarget`, the channel branch of `buildMarkdown`, `YAML_SPECIAL_FLOAT`,
`yamlNeedsQuotes`, `yamlRenumbersKey`, `yamlKey`. No earlier copy of any file was diffed this
round. One PASS 4 finding: the rewritten `tests/VERIFY.md` no longer passes Prettier (F-033).

**PASS 5 (test efficacy):** there is no test runner and no test file; LOG.md records this as a
decision. There is no automated coverage claim to mutate.

**Considered and not reported:**

- A custom property named `<<` is the YAML 1.1 merge key: yaml's 1.1 mode throws on it, and
  1.1 also reads key `1:30` as 90 and `2024-01-01` as a date. js-yaml and YAML 1.2 read all
  three as text. This is the same YAML 1.1-only family Round 9 set aside, and the name is
  implausible.
- `/embed/live_stream?channel=…` takes `live_stream` as a video id. It is 11 characters from the
  id alphabet, so shape cannot tell it from a real id. Rejecting it would reverse the logged
  F-018 decision that only the literal `videoseries` is rejected.
- In wiki-link mode, a channel named with `/` or `:` (e.g. `AC/DC`) is linked as written, which
  Obsidian reads as a path or cannot create as a file. This is the F-029 failure family, under
  its logged decision. Obsidian was not run.
- `tests/FINDINGS.md` failing `prettier --check .` (which makes the PR template's "passes" item
  untickable) is the logged Round 7 decision. This report's `repro:` indent keeps it so.
- A fast double-click on **Delete all** deletes: both presses await the same read and the second
  sees the button armed. A synchronous arm would behave the same, so this is the two-press
  design itself, not a defect of it.
- The popup's `seekTo()` stays silent on a missing reply or a bare `{ok:false}`, and `clearAll()`
  discards the open draft even when the record removal fails. Both are loud enough for the user
  to notice, or match the code's stated "Delete all means all" intent.

**What this audit did NOT examine:**

- **The extension was never loaded as an extension.** Storage, messaging, clipboard,
  drag-and-drop, focus and the popup were traced by reading and `vm` stubs only. The live
  content-script check ran in the page's main world, not the extension's isolated world.
- **Embed pages live:** `/embed/<id>` opened directly returned YouTube's Error 153 in the in-app
  browser, so no embed selector was exercised. The same URL opened in a normal Chrome tab would
  settle whether the README's "embed pages opened directly" support still holds.
- Signed-in YouTube (where the `(N)` notification prefix actually appears), mid-roll and Shorts
  ads, and live streams were not observed.
- Obsidian itself was not run. No screen reader, axe run or visual rendering check. The sibling
  `brext-YoutubeVideo_Notes-v0` folder, outside this project, was not examined.

**No-findings categories:** each category's method and blind spot is stated in section 3.

**Backlog was not capped.** Four LOW findings exist and all are listed.

This report does not say, and must not be read as saying, that the project as a whole is
clean, safe, or free of defects. It covers only what the methods above covered.

---

## 3. Live findings

### 1. Code quality

No findings at MEDIUM or above. Every function in both scripts was traced by reading, with
`vm` execution of the YAML helpers, `buildMarkdown()`, `openDraft()` and `getVideoTitle()`, and
a live Shorts check of `getState()`. This cannot detect behaviour that depends on the extension's
real isolated world, real `chrome.*` timing, signed-in pages or Obsidian's parser. F-031 and
F-032 (LOW) are in the Backlog.

### 2. Dead code

No findings. Checked: the id/`els` mapping, every CSS class against HTML and JS, every
function's call sites, and early-return reachability (the `saveDraft()` video-mismatch toast is
reachable while `syncDraftToCurrentVideo()` awaits a flush). Static reading cannot detect a
selector that is live in source but matches nothing on a page not observed.

### 3. Dependencies

No findings. There is no package manifest, by design. Every `chrome.*` API used is covered by
`permissions`/`host_permissions`, and there is no external command or network call. A static
check cannot detect browser-specific API behaviour.

### 4. Project health

No findings at MEDIUM or above. README, LICENSE (MIT, author and year consistent with
`manifest.json`), `.gitignore`, `.gitattributes`, `.prettierrc`, CONTRIBUTING, SECURITY and the
templates are present and not placeholders. The debug-artifact grep found nothing. This cannot
tell whether the install steps work, since the extension was never loaded. F-033 (LOW) is in the
Backlog.

### 5. Secrets exposure

No findings. The pattern sweep and file-type check covered the whole working tree. They cannot
detect a secret that matches no pattern, one that is encoded, or one in PNG pixel data.

### 6. Documented behaviour that is false

No findings at MEDIUM or above. Checked against source: both README Markdown examples (by
reading `buildMarkdown()`), the permissions table, the project-structure list, the scope and
limitation bullets, the feature list, CONTRIBUTING's set-up, code-style, "careful about" and
testing rules, SECURITY's scope, the templates, and the code comments of every LOG.md-touched
region. This pass cannot detect false claims about runtime behaviour that was never observed.
F-034 (LOW) is in the Backlog.

### 7. Internal consistency

No findings. Compared: `yamlNeedsQuotes()` against `yamlKey()`, `buildMarkdown()` against
`markDuplicateProps()`, the two entry sorts, `restoreDraft()` against `openDraft()`'s stored-draft
path, `persistDraft()` against `flushDraftNow()`, the `exportMarkdown()` and `clearAll()` read
gates, `render()` against `updatePreview()` on a failed read, the two `seekTo()` halves,
`YOUTUBE_URL` against the manifest match pattern, and `getVideoTitle()`'s and `getChannel()`'s
ad guards. This compares code within the tree only.

---

## 4. Backlog (LOW)

- [ ] F-031 [LOW] content/content.js:getVideoTitle (L101) — notification-count strip also removes a title's own leading "(N)" → Short titled "(2024) Year recap" exported as "Year recap" — fix: prefer a shown on-page Shorts title element over document.title — evidence: reproduced, vm over five document titles
  repro: vm, pathname /shorts/abc, no h1, document.title "(2024) Year recap - YouTube"; getVideoTitle() returns "Year recap".
- [ ] F-032 [LOW] popup/popup.js:openDraft (L816) — failed Capture re-read falls back to popup-open cached currentTime → draft opens on a stale timestamp, breaking the stated live-read rule — fix: refuse and toast when the fresh read returns null — evidence: reproduced, vm stub, control opens live time
  repro: stub: popup opens at currentTime 10; tabs.sendMessage then errors and executeScript fails; openDraft() badge reads [00:10], not the live time.
- [ ] F-034 [LOW] README.md:Features (L9) — `[HH:MM:SS]` tied to video length; code uses the timestamp itself → a 0:42 capture in a 2-hour video is `[00:42]`, not `[00:00:42]` — fix: say "for timestamps an hour or later" — evidence: reproduced, formatTimestamp(42) and (3723) in vm
  repro: README L9-10 against popup/popup.js:formatTimestamp L314; formatTimestamp(42) returns "[00:42]" whatever the video's length.
- [ ] F-033 [LOW] tests/VERIFY.md (L69) — tracked-findings table misaligned against Prettier's markdown table format → `prettier --check .` flags a second file beyond the decision-covered one — fix: format VERIFY.md with Prettier whenever a round rewrites it — evidence: reproduced, cached Prettier 3.9.8 on tree copy
  repro: `prettier --check .` (3.9.8) on a tree copy lists tests/VERIFY.md as well as tests/FINDINGS.md; the diff is the Note column width.

---

## 5. Suppressed

- F-001 [MEDIUM] content/content.js:getVideoTitle — embed pages export the title "YouTube" — suppressed: LOG.md fixed
- F-002 [LOW] content/content.js:getChannel — channel empty on Shorts — suppressed: LOG.md fixed
- F-003 [LOW] content/content.js:getVideoElement — wrong `currentTime` from a sidebar preview or neighbouring reel — suppressed: LOG.md fixed
- F-004 [LOW] manifest.json:permissions — `execCommand` copy fallback lacked `clipboardWrite` — suppressed: LOG.md fixed
- F-005 [LOW] popup/popup.js:loadSettings — `defaultItems()` unreachable on a fresh install — suppressed: LOG.md fixed
- F-006 [LOW] .github/CONTRIBUTING.md:Code style — id naming rule contradicted the tree — suppressed: LOG.md fixed
- F-007 [LOW] popup/popup.js:yamlKey — boolean-like property names emitted bare — suppressed: LOG.md fixed
- F-008 [MEDIUM] .github/CONTRIBUTING.md:storage shape — new pre-built property never reached fresh installs — suppressed: LOG.md fixed
- F-009 [MEDIUM] popup/popup.js:deleteEntry — unserialised record read-modify-write lost deletes — suppressed: LOG.md fixed
- F-010 [LOW] popup/popup.js:migrateLegacyProperties — unreachable `|| {...}` fallback — suppressed: LOG.md fixed
- F-011 [LOW] popup/popup.js:loadItems — corrupted-list guard fired only on an empty result — suppressed: LOG.md fixed
- F-012 [MEDIUM] popup/popup.js:openDraft — re-read changed video without re-rendering — suppressed: LOG.md fixed
- F-013 [LOW] popup/popup.js:setRecord — `runtime.lastError` unchecked, refused write reported saved — suppressed: LOG.md fixed
- F-014 [LOW] popup/popup.js:yamlKey — number-like property names re-read as different keys — suppressed: LOG.md fixed
- F-015 [MEDIUM] popup/popup.js:render — failed read shown as zero notes — suppressed: LOG.md fixed
- F-016 [LOW] popup/popup.js:queryActiveTab — failed query left the promise unsettled — suppressed: LOG.md fixed
- F-017 [MEDIUM] popup/popup.js:loadSettings — defaults written over stored settings after a failed read — suppressed: LOG.md fixed
- F-018 [MEDIUM] content/content.js:getVideoId — `/embed/videoseries` taken as a video id — suppressed: LOG.md fixed
- F-019 [LOW] popup/popup.js:persistDraft — pagehide flush queued behind an in-flight write — suppressed: LOG.md fixed
- F-020 [LOW] popup/popup.js:updatePreview — failed read fell through to the sample preview — suppressed: LOG.md fixed
- F-021 [HIGH] content/content.js:getVideoElement — Shorts capture read the hidden watch player, with a stale title and channel — suppressed: LOG.md fixed
- F-022 [MEDIUM] content/content.js:getVideoId — `/live/<id>` URL form not recognised — suppressed: LOG.md fixed
- F-023 [LOW] popup/popup.js:seekTo — timestamp click seeked a different video after autoplay — suppressed: LOG.md fixed
- F-024 [LOW] .github/CONTRIBUTING.md:Things to be careful about — draft-write rule omitted the `flushDraftNow()` exception — suppressed: LOG.md fixed
- F-025 [LOW] content/content.js:getVideoElement — tree not Prettier-formatted against `.prettierrc` — suppressed: LOG.md fixed
- F-026 [LOW] content/content.js:getState — Capture during an ad stored the ad's time — suppressed: LOG.md fixed
- F-027 [LOW] popup/popup.js:updatePreview — preview filled missing title/channel from `state`, export did not — suppressed: LOG.md fixed
- F-028 [LOW] popup/popup.html:#count — prohibited `aria-label` on a generic `<span>` — suppressed: LOG.md fixed
- F-029 [LOW] popup/popup.js:buildMarkdown — wiki-link channel written raw inside `[[…]]`, link metacharacters unescaped — suppressed: LOG.md fixed
- F-030 [LOW] popup/popup.js:yamlNeedsQuotes — YAML special floats `.inf`/`.nan` re-read as numbers — suppressed: LOG.md fixed

---

## 6. Must fix before first commit

Nothing.
