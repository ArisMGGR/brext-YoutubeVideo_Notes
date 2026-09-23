# Defect log

Permanent registry of defects and decisions that have been handled. Append-only: entries are
never edited or removed once written, so a later audit round can suppress anything already
dealt with instead of re-reporting it.

Status values: `fixed`, `attempted`, `accepted` (won't fix), `decision`.

Suppression is keyed on the **defect** — file/symbol plus failure — not on the wording of the
fix. A later round reopens an entry only by reproducing its exact failure again.

Findings detail for Round 1, including repro steps and the coverage limits the audit ran under,
is in [FINDINGS.md](FINDINGS.md) beside this file.

## Round 1 — audit and fixes

```
F-001 | fixed    | content/content.js:getVideoTitle    | reject bare "YouTube" doc title on /embed/<id>; fall back to a.ytp-title-link guarded by an href carrying the video id; return "" not a placeholder
F-001 | fixed    | content/content.js:getChannel       | add .ytp-title-channel-name last, so the embed page can name the channel; empty on watch pages, so it is skipped there
F-002 | fixed    | content/content.js:getChannel       | add two ytd-reel-video-renderer[is-active]-scoped selectors for Shorts, after the watch-page ones
F-003 | fixed    | content/content.js:getVideoElement  | prefer the player the page marks active ([is-active] reel, #movie_player, #shorts-player, .html5-main-video) before the old playing/first heuristic
F-004 | fixed    | manifest.json:permissions          | add "clipboardWrite" so the execCommand fallback in copyViaTextarea() can work; README permissions table given the matching row
F-005 | fixed    | popup/popup.js:loadSettings        | new loadItems() seeds a fresh install from defaultItems(); migrateLegacyProperties() now reserved for genuinely legacy stored shapes
F-006 | fixed    | .github/CONTRIBUTING.md:Code style | camelCase for JS identifiers and HTML ids, kebab-case for CSS classes -- matches all 26 ids in popup.html
F-007 | fixed    | popup/popup.js:yamlKey             | also quote YAML_RESERVED matches, so a property named on/no/yes is not read as a boolean key
-     | decision | manifest.json:version              | bumped 1.3.0 -> 1.3.1 for the above, per the CONTRIBUTING rule on user-facing changes
```

### Decisions worth not re-litigating

```
-     | decision | popup/popup.js:yamlKey             | number-like property names stay unquoted on the left of a colon ("2024" is unambiguous there); only the boolean/null case was added in F-007
-     | decision | content/content.js                 | no top-level const/let/var in this file, ever: it is re-injected into tabs that already ran it and a top-level binding throws "Identifier has already been declared"
-     | decision | tests/                             | no test runner; CONTRIBUTING substitutes a manual checklist, so there is no automated suite to add to
```

### Verification that backed the Round 1 fixes

- Both scripts and `manifest.json` re-parsed after every change.
- `content/content.js` re-checked for top-level bindings — none, so re-injection stays safe.
- Both README Markdown examples still reproduce byte-for-byte from `buildMarkdown()`.
- F-003 proved by old-vs-new comparison: a paused watch page with a sidebar preview playing
  returned the preview at 3s and now returns the main player at 42.5s; a paused Short returned
  the wrong reel at 0s and now returns the active reel at 7.2s.
- F-005 proved by mutation: a 4th property added to `defaultItems()` now reaches a fresh
  install; before the fix it did not.
- F-001 proved against simulated embed DOMs built from the live `youtube.com/embed/<id>` and
  `/watch?v=` pages: real title and channel when the player chrome is present, `""` rather than
  `"YouTube"` when it is not, and a pre-roll ad title correctly rejected.

### Known gaps carried out of Round 1

Not defects, and not suppressions — limits on what the Round 1 verification could reach.

- The extension was never loaded into a browser, so no runtime behaviour (storage, messaging,
  clipboard, drag-and-drop, focus) has been observed.
- The live Shorts DOM was behind a consent wall that was not accepted, so the F-002 and F-003
  Shorts selectors are unconfirmed against a real Shorts page. They are fail-safe by
  construction — an `[is-active]` scope matching nothing falls through to the previous
  behaviour — but a manual check on Shorts is still owed.
- `prettier --check .` was never run; Prettier is not installed and installing it was out of
  scope.

## Round 2 — audit and fixes

```
F-008 | fixed    | .github/CONTRIBUTING.md:storage shape | name loadItems() as the dispatcher and defaultItems() as the single definition a fresh install reads; adding a pre-built property to migrateLegacyProperties() alone reaches existing users and no one else
F-009 | fixed    | popup/popup.js:deleteEntry            | new queueRecordUpdate() serialises the whole notes-record read-modify-write in deleteEntry(), saveDraft() and clearAll() -- the discipline queueDraftWrite() already applied to drafts, extended to cover the read
F-009 | fixed    | popup/popup.js:saveDraft              | new savingDraft flag drops a Save arriving mid-flight, so serialising the write cannot let Ctrl+Enter key-repeat file the same note twice
F-010 | fixed    | popup/popup.js:migrateLegacyProperties | drop the unreachable `|| {...}` fallback beside normalizeItem(): object spread always yields an object, so it cannot return null there
F-011 | fixed    | popup/popup.js:loadItems              | rebuild from defaultItems() when no pre-built kind survives, not only when the list is empty; a stored list of customs alone cannot come from the UI and strands the user without Link/Channel/tags
-     | decision | manifest.json:version                 | bumped 1.3.1 -> 1.3.2 for the above, per the CONTRIBUTING rule on user-facing changes
```

### Decisions worth not re-litigating

```
-     | decision | popup/popup.js:queueRecordUpdate      | record reads stay outside the queue: render(), updatePreview() and exportMarkdown() only display, so a stale read there costs nothing and serialising them would make every refresh wait on writes
-     | decision | popup/popup.js:loadItems              | a corrupted list is replaced wholesale, custom properties included, rather than merged: the same behaviour the empty-list guard already had
-     | decision | tests/FINDINGS.md                     | the Round 2 report replaced the Round 1 narrative in this file. Round 1 IDs and defect keys survive in its Suppressed section; Round 1 repro and coverage detail is now the Round 1 block above plus VERIFY.md. The Round 1 header line pointing at FINDINGS.md for that detail is stale and left unedited, this log being append-only
```

### Verification that backed the Round 2 fixes

- Both scripts and `manifest.json` re-parsed after every change; `content/content.js` re-checked
  for top-level bindings (none, so re-injection stays safe); tree still LF throughout.
- **F-009 proved by old-vs-new comparison** against a full tree copy with a 5 ms artificial
  `chrome.storage.local` latency. Before: two concurrent `deleteEntry()` calls left `e1,e3`
  where `e3` was expected, three concurrent ones left `e1,e2`, and a delete racing a save lost
  the delete entirely (`e1,e2,e3` plus the new note). After: `e3`, `(none)`, and `e2,e3` plus
  the new note. Sequential deletes, a single save and `clearAll()` are unchanged in both.
- **F-009 (savingDraft) proved by mutation:** `Promise.all([saveDraft(), saveDraft()])` files
  exactly one note, both before and after the fix. Serialising the write alone would have made
  it two.
- **F-008 proved by mutation:** a fourth pre-built property added to `defaultItems()` only, as
  the rewritten bullet instructs, now reaches a fresh install (`Link,Channel,tags,FOURTH`).
  Before the rewrite, following the old bullet put it in `migrateLegacyProperties()`, where a
  fresh install returned `Link,Channel,tags`.
- **F-011 proved by execution:** stored `items` of `[{}]`, `[null,3,"x",{}]`, custom-only and
  `[]` all rebuild to Link/Channel/tags. Unchanged: a normal three-item list, three plus a
  custom, a reordered and renamed list, a list holding one pre-built property, a fresh install
  and the legacy split shape.
- **F-010 proved by execution:** `normalizeItem({...c, kind:"custom"})` returned an object for
  every `c` tried (`null`, `undefined`, `0`, `""`, `false`, `NaN`, string, number, array,
  object), so the removed fallback could never have run. Junk legacy entries still arrive as
  blank custom properties.
- Both README Markdown examples still reproduce byte-for-byte from `buildMarkdown()`, and
  `yamlKey` / `yamlScalar` / `formatTimestamp` still answer as before on the spot checks.

### Known gaps carried out of Round 2

Not defects, and not suppressions — limits on what the Round 2 verification could reach.

- The extension was still never loaded into a browser. The F-009 race was reproduced and fixed
  against a stubbed `chrome.storage.local` with injected latency, not against the real one, so
  the real-world width of the window it closes is unmeasured.
- No selector in `content/content.js` was evaluated against a live YouTube page this round:
  browser navigation was unavailable. The Round 1 gap on the Shorts and embed selectors is
  unchanged and still owes one manual check.
- `prettier --check .` was still not run; Prettier is not installed and installing it was out of
  scope.
- The `tests/FINDINGS.md` decision above is a bookkeeping choice, not a verified behaviour.
  Nothing was run against it: it records where Round 1 detail went, so a later round does not
  hunt for it in a file that no longer carries it.

## Round 3 — audit and fixes

```
F-012 | fixed    | popup/popup.js:openDraft        | render() after syncDraftToCurrentVideo() when the Capture re-read lands on a different video, so the header, the notes list and the actions below them follow `state` instead of describing the previous video
F-013 | fixed    | popup/popup.js:setRecord        | new storageFailed() reads chrome.runtime.lastError in every storage callback; the record writes resolve false and saveDraft()/deleteEntry()/clearAll() say so, getRecord() resolves null on a failed read so a caller cannot write an empty record over notes that are still there
F-014 | fixed    | popup/popup.js:yamlKey          | new YAML_RADIX plus yamlRenumbersKey(): quote a number-like key only when YAML would read it back as different text -- 007, +5, 1_000, 1e3, 0x10, 0o17, 0b101; YAML_RADIX also added to yamlNeedsQuotes(), so hex/octal/binary values are quoted too
-     | decision | manifest.json:version           | bumped 1.3.2 -> 1.3.3 for the above, per the CONTRIBUTING rule on user-facing changes
```

### Decisions worth not re-litigating

```
-     | decision | popup/popup.js:yamlKey          | plain decimal names still go bare, exactly as the Round 1 decision says: `2024`, `0`, `42`, `1.5` round-trip through a YAML parser as the same text, so F-014 narrows that decision rather than reversing it
-     | decision | popup/popup.js:setDraft         | draft writes report failure like every other write but nothing surfaces it: they fire on a 300 ms keystroke debounce and on pagehide, where a toast would interrupt typing or arrive after the popup is gone. The note is what must not be lost silently; the draft is a convenience
-     | decision | popup/popup.js:saveSettings     | same -- resolves a boolean no caller reads, kept for symmetry with the other writes. Settings are rewritten on the next keystroke and on leaving the view
-     | decision | popup/popup.js:loadSettings     | a failed settings read falls back to DEFAULT_SETTINGS rather than aborting init(): reading `data.settings` off an undefined `data` used to throw inside the callback and leave the popup half-initialised
-     | decision | tests/FINDINGS.md               | the Round 3 report replaced the Round 2 narrative in this file, same as Round 2 did to Round 1. Round 2 IDs and defect keys survive in its Suppressed section; Round 2 repro and coverage detail is the Round 2 block above plus VERIFY.md. Its section 1b records the F-012/F-013/F-014 fixes and ticks their checkboxes, so the report reads as the audit plus what was done about it
```

### Verification that backed the Round 3 fixes

- Both scripts and `manifest.json` re-parsed after every change; `content/content.js` untouched
  and still free of top-level bindings; tree still LF throughout.
- **F-012 proved by old-vs-new comparison** in the stub-DOM harness: popup opened on video AAA
  (2 stored notes), the tab then answering as BBB, then `openDraft()`. Before: header stayed
  "Video A" with 2 rows while `state.videoId` was already `BBB`, the ✕ on a listed note left
  AAA's record untouched, and two `clearAll()` presses produced no toast and deleted nothing.
  After: header reads "Video B" and the list is empty, matching the video the capture belongs
  to. An unchanged video still does not re-render, so there is no extra flicker on the common
  path.
- **F-013 proved by revert:** with `storageFailed()` forced to `false` the old failures
  reproduce exactly — a refused `set` still toasted "Note saved" and discarded the draft, a
  refused `get` wrote a one-entry record over `e1,e2` (both existing notes lost), a refused
  delete produced no toast, and `clearAll()` claimed "All notes deleted" with everything still
  stored. On the current tree the same injections give "Could not save the note — storage
  error" with the draft and its text still open, "Could not delete the note — storage error"
  with the note still listed, and no record overwritten. Checked with the failed read
  delivering both `{}` and `undefined`; `init()` still comes up on the three pre-built
  properties.
- **F-014 proved by execution** over 37 names. Quoted: `0x10`, `0X1f`, `0o17`, `0b101`, `007`,
  `0899`, `+5`, `-5`, `1_000`, `1e3`, `1E3`, `.5`, `1.50`, `0.0`, `00`,
  `12345678901234567890`, plus the reserved words F-007 already covered. Bare, unchanged:
  `2024`, `0`, `42`, `1`, `1.5`, `3.14`, `Link`, `Channel`, `tags`, `Author`, `my 2024 notes`,
  `v2`, `2024a`, `1-2`. A first attempt that routed the new case through `yamlScalar()` alone
  left hex keys bare — `yamlNeedsQuotes()` makes its own decision — which is why `YAML_RADIX`
  sits there rather than only in `yamlKey()`.
- Regressions re-run on the final tree, all unchanged: both README Markdown examples reproduce
  byte-for-byte from `buildMarkdown()`; duplicate keys, blank-named customs, an empty channel,
  comma-lists and CRLF notes all render as before; two and three concurrent `deleteEntry()`
  calls, a delete racing `refreshState()` and two overlapping `render()` calls all leave the
  correct rows and stored entries at 0 ms and 5 ms latency; `loadItems()` over nine shapes,
  `formatTimestamp`, `timestampUrl`, `resolvedKeyFor` and `yamlScalar` all answer as before.

### Known gaps carried out of Round 3

Not defects, and not suppressions — limits on what the Round 3 verification could reach.

- The extension was still never loaded into a browser. F-013 was proved against a stubbed
  `chrome.storage.local` with `runtime.lastError` injected by hand, not against a real quota
  failure, so the wording and timing of a real failure are unobserved.
- No YAML parser was run against the exported frontmatter. F-014 rests on YAML 1.1/1.2
  resolution rules, not on watching Obsidian read a key back. The check that would settle it is
  exporting a property named `007` or `0x10` and opening the result in Obsidian.
- No selector in `content/content.js` was evaluated against a live YouTube page; that file was
  not touched this round and the Round 1 gap on the Shorts and embed selectors is unchanged.
- `prettier --check .` was still not run; Prettier is not installed and installing it was out
  of scope.
- The `tests/FINDINGS.md` decision above is a bookkeeping choice, not a verified behaviour.
  Nothing was run against it: it records where the Round 2 detail went, so a later round does
  not hunt for it in a file that no longer carries it.
- `tests/VERIFY.md` still describes round 2 and was not touched this session. No verification
  round has been run against the Round 3 fixes; the evidence above is the fixing session's own,
  which is why F-012 to F-014 carry no VERIFIED status anywhere.

## Round 4 — audit and fixes

```
F-015 | fixed    | popup/popup.js:render          | a null record on a video means the read failed, not a video with no notes: the count reads "—" and the empty-state line reads "Could not read the notes — storage error." instead of claiming 0 notes
F-015 | fixed    | popup/popup.js:clearAll        | toast the failed read instead of returning silently, the same shape exportMarkdown() already used; the empty-record early return is unchanged
F-016 | fixed    | popup/popup.js:queryActiveTab  | read runtime.lastError and guard `tabs` before indexing it: a failed tabs.query used to throw inside the callback, leaving the promise unsettled and init() / openDraft() / seekTo() awaiting it forever
-     | decision | manifest.json:version          | bumped 1.3.3 -> 1.3.4 for the above, per the CONTRIBUTING rule on user-facing changes
```

### Decisions worth not re-litigating

```
-     | decision | popup/popup.js:render          | render() reports the failed read in the empty-state line rather than a toast: it is called on every refresh, so a toast would re-fire on each one, and render() displays rather than acts. Export and Delete all stay disabled on a failed read -- neither can act on a record that was not read
-     | decision | popup/popup.js:clearAll        | the gating getRecord() read stays outside queueRecordUpdate(), per the Round 2 decision: it only decides whether the button arms, and the destructive removeRecord() is already queued
-     | decision | tests/FINDINGS.md              | the Round 4 report replaced the Round 3 narrative in this file, same as Rounds 2 and 3 did to their predecessors. Round 3 IDs and defect keys survive in its Suppressed section; Round 3 repro and coverage detail is the Round 3 block above plus VERIFY.md. Its section 1b records the F-015/F-016 fixes and ticks their checkboxes, so the report reads as the audit plus what was done about it
```

### Verification that backed the Round 4 fixes

- Both scripts and `manifest.json` re-parsed after every change; `content/content.js` untouched
  and still free of top-level bindings; tree still LF throughout.
- **F-015 proved by revert.** Current tree, every `chrome.storage.local.get` failing after a
  normal init on a video holding `e1,e2`: `render()` gives count `—` and "Could not read the
  notes — storage error.", and `clearAll()` toasts the same on the first press without arming.
  A reverted copy reproduced the old failure exactly — count `0`, "No notes saved for this video
  yet." and a silent `clearAll()` — so the repro can still fail and the pass is causal. The
  record was still `e1,e2` in both.
- **F-016 proved by revert.** `chrome.tabs.query` calling back with `undefined` and
  `runtime.lastError` set: the current tree completes `init()` and renders the ordinary no-tab
  state; the reverted copy raised `TypeError: Cannot read properties of undefined (reading '0')`
  inside the callback and `render()` never ran. `tabs.query` answering `[]` is unchanged on both.
- The first revert attempt reverted `exportMarkdown()` instead of `clearAll()`: the fixed
  `clearAll()` gate is byte-identical to the one `exportMarkdown()` already had, so an
  unanchored replace hit the earlier copy. The revert was rescoped to `clearAll()`'s own body.
  Worth knowing before editing either gate — they are the same five lines twice.
- Regressions re-run on the final tree, all unchanged: both README Markdown examples reproduce
  byte-for-byte from `buildMarkdown()`; two and three concurrent `deleteEntry()` calls, a
  doubled `saveDraft()`, a delete racing a save and `clearAll()`'s two-press flow all leave the
  correct rows and stored entries at 0 ms and 5 ms latency; the F-012 sequence still renders
  "Video B" with an empty list; the happy path (capture → type → debounced draft → Save →
  Export) and draft restore on reopen both behave as before; `yamlKey`, `yamlScalar`,
  `formatTimestamp`, `timestampUrl`, `normalizeItem`, `loadItems` and `resolvedKeyFor` answer as
  before on the full degenerate-input sweep.
- **No false positive from the new message:** a video with no notes yet, and a non-YouTube tab,
  both still read "No notes saved for this video yet." with count `0`; and after a failed read
  is followed by a successful one, the line resets rather than sticking.

### Known gaps carried out of Round 4

Not defects, and not suppressions — limits on what the Round 4 verification could reach.

- The extension was still never loaded into a browser. F-015 and F-016 were both proved against
  stubs — `chrome.storage.local` with `runtime.lastError` injected by hand, and a scripted
  `chrome.tabs.query` — not against a real quota failure or a real tab-query error, so the
  wording and timing of a real failure remain unobserved.
- No selector in `content/content.js` was evaluated against a live YouTube page; that file was
  not touched this round and the Round 1 gap on the Shorts and embed selectors is unchanged.
- No YAML parser was run against the exported frontmatter this round either; the Round 3 gap on
  F-014 stands.
- `prettier --check .` was still not run; Prettier is not installed and installing it was out of
  scope. The new lines were hand-wrapped to the 80-column `printWidth`.
- `tests/VERIFY.md` still describes round 2 and was not touched. No verification round has been
  run against the Round 4 fixes; the evidence above is the fixing session's own.
- The `tests/FINDINGS.md` decision above is a bookkeeping choice, not a verified behaviour.
  Nothing was run against it: it records where the Round 3 detail went, so a later round does
  not hunt for it in a file that no longer carries it.

## Round 5 — audit and fixes

```
F-017 | fixed    | popup/popup.js:loadSettings   | new settingsReadFailed flag, set from storageFailed() and never cleared; saveSettings() refuses to write while it is set and toasts once, so the DEFAULT_SETTINGS fallback can no longer be persisted over the user's renamed and custom properties and tag values
F-018 | fixed    | content/content.js:getVideoId | reject the literal "videoseries" segment on /embed/: a playlist embed names a playlist, not a video, and taking it as an id filed every playlist's notes under one record and exported links to watch?v=videoseries; README gained a matching limitation bullet
F-019 | fixed    | popup/popup.js:persistDraft   | new flushDraftNow() writes the in-progress note straight to chrome.storage for the pagehide handler only; the queued write was waiting on an in-flight write whose callback lands after the popup document is gone, so it was never dispatched
F-020 | fixed    | popup/popup.js:updatePreview  | report a failed record read in the preview, in render()'s words, instead of falling through to the dQw4w9WgXcQ sample
-     | decision | manifest.json:version         | bumped 1.3.4 -> 1.3.5 for the above, per the CONTRIBUTING rule on user-facing changes
```

### Decisions worth not re-litigating

```
-     | decision | popup/popup.js:loadSettings   | the DEFAULT_SETTINGS fallback on a failed read stays exactly as the Round 3 decision set it. F-017 narrows it rather than reversing it: the popup still comes up usable on the defaults, it just may not write them back. settingsReadFailed is never cleared, because loadSettings() runs only from init() -- there is no later successful read to recover the real settings from, so the session stays read-only for settings
-     | decision | popup/popup.js:flushDraftNow  | the one place a draft write is allowed outside queueDraftWrite(). The queue exists so a write cannot land after the remove meant to discard it; at pagehide nothing can be queued afterwards, and the flush only runs with a pending keystroke timer, which means no close or save has happened since the last keystroke. Every other draft write stays queued -- do not widen this
-     | decision | content/content.js:getVideoId | only the exact literal "videoseries" is rejected. "videoseries2" and any other segment are still accepted as ids, so a real video whose id merely starts with those letters is unaffected
-     | decision | popup/popup.js:updatePreview  | the preview shows the error line instead of the sample on a failed read, so the format cannot be previewed during a storage outage. That is consistent: with F-017 in place a settings change cannot be saved during one either
-     | decision | tests/FINDINGS.md             | the Round 5 report replaced the Round 4 narrative in this file, same as Rounds 2 to 4 did to their predecessors. Round 4 IDs and defect keys survive in its Suppressed section; Round 4 repro and coverage detail is the Round 4 block above plus VERIFY.md. Its section 1b records the F-017 to F-020 fixes and ticks their checkboxes
```

### Verification that backed the Round 5 fixes

- Both scripts and `manifest.json` re-parsed after every change; `content/content.js` re-checked
  for top-level bindings (none, so re-injection stays safe); tree still LF throughout.
- **F-017 proved by old-vs-new comparison.** Stored settings holding `Source` / `Author` /
  `tags` / a custom `Course`, with `chrome.storage.local.get` failing during `init()` only: the
  pre-fix copy wrote `Link,Channel,tags` over them on the first settings change; the fixed tree
  leaves `Source,Author,tags,Course` in storage and toasts "Settings could not be read — changes
  are not saved". Controls unchanged on both: a healthy read still persists a settings change
  through the 250 ms debounce and through `flushSettings()`, and the popup after a failed
  settings read still renders, captures and saves notes normally.
- **F-018 proved by old-vs-new comparison** over 7 location URLs.
  `/embed/videoseries?list=PLabcdef123` was `"videoseries"`, is now null (`getState()` reason
  `no-video-id`). Byte-identical on both trees: `/embed/abc123`, `/embed/videoseries2`,
  `/watch?v=dQw4w9WgXcQ`, `/shorts/abc123`, `/embed/` and the site root.
- **F-019 proved by old-vs-new comparison** at 20 ms storage latency, with a debounced draft
  write dispatched and still in flight and more text typed after it: the pre-fix copy dispatched
  nothing at all in the microtask window a dying document gets, the fixed tree dispatches the
  `set`. Control: with an idle queue both trees dispatch in the first microtask, so the fix adds
  no extra call on the common path.
- **F-020 proved by old-vs-new comparison** with every `chrome.storage.local.get` failing: the
  pre-fix copy previewed `# Example video title`, the fixed tree previews "Could not read the
  notes — storage error." Controls unchanged on both: a healthy read previews the real record,
  and a video with no notes yet still previews the sample.
- Regressions re-run on the final tree, all unchanged: the full PASS 1 degenerate-input sweep
  (`yamlKey`, `yamlScalar`, `formatTimestamp`, `timestampUrl`, `normalizeItem`, `loadItems`,
  `resolvedKeyFor`) is byte-identical to the pre-fix tree once uids are normalised; the happy
  path (Capture `[00:42]` -> type -> Save -> Export) reproduces the README's default-settings
  Markdown byte-for-byte; two concurrent `deleteEntry()` calls leave `e3`; a doubled
  `saveDraft()` files one note; a doubled `openDraft()` leaves one panel bound to the video; the
  F-012 sequence renders "Video B" with an empty list; draft cancel removes the stored draft and
  a stored draft is restored on reopen.
- The only unqueued `setDraft` / `removeDraft` call sites in the tree are the two inside
  `flushDraftNow()`, checked by grep after the change.

### Known gaps carried out of Round 5

Not defects, and not suppressions — limits on what the Round 5 verification could reach.

- The extension was still never loaded into a browser. F-017, F-019 and F-020 were all closed
  against a stubbed `chrome.storage.local` with `runtime.lastError` injected by hand, not
  against a real quota or I/O failure.
- F-019's real-world width is unmeasured in both directions: it depends on when Chrome actually
  destroys a dismissed popup relative to a dispatched storage call, which was never observed.
  The fix makes the call go out synchronously, which is the most this code can do from
  `pagehide`; whether Chrome delivers it is outside the extension.
- F-018 was closed against `getVideoId()` in isolation. No playlist embed page was opened in a
  browser, so the popup's resulting "This is not a YouTube video page." was not seen on one.
- No selector in `content/content.js` was evaluated against a live YouTube page; the Round 1 gap
  on the Shorts and embed selectors is unchanged and still owes one manual check.
- No YAML parser was run against the exported frontmatter; the Round 3 gap on F-014 stands.
- `prettier --check .` was still not run; Prettier is not installed and installing it was out of
  scope. The new lines were hand-wrapped to the 80-column `printWidth`.
- `tests/VERIFY.md` still describes round 4 and was not touched this session. No verification
  round has been run against the Round 5 fixes; the evidence above is the fixing session's own,
  which is why F-017 to F-020 carry no VERIFIED status anywhere.

## Round 6 — audit and fixes

```
F-021 | fixed    | content/content.js:getVideoElement | new queryShown() skips anything inside a [hidden] page; the page type (isShortsPage()) decides whether #shorts-player or #movie_player is asked first; the fallback considers visible <video>s only. The dead [is-active] reel selector is gone
F-021 | fixed    | content/content.js:getVideoTitle   | h1 and player-title lookups go through queryShown(), so on Shorts the hidden watch page's title is skipped and document.title answers
F-021 | fixed    | content/content.js:getChannel      | selectors go through queryShown(); microdata offered only while #watch7-content's identifier is the current video; both dead [is-active] Shorts selectors replaced by the @handle link of the reel holding #shorts-player
F-022 | fixed    | content/content.js:getVideoId      | accept /live/<id>, which YouTube keeps in the address bar for streams and replays; README scope bullet gained it
F-023 | fixed    | popup/popup.js:seekTo              | SEEK_TO carries state.videoId; content-script seekTo() refuses a mismatch with reason "video-changed" and the popup toasts it. A message without videoId still seeks, as before
F-023 | fixed    | content/content.js:seekTo          | seekTo(seconds, videoId) returns {ok:false, reason:"video-changed"} without seeking when videoId is given and differs from getVideoId(); onMessage passes message.videoId through
F-024 | fixed    | .github/CONTRIBUTING.md:Things to be careful about | the queueDraftWrite() rule now names flushDraftNow() as its one pagehide exception
-     | decision | manifest.json:version              | bumped 1.3.5 -> 1.3.6 for the above, per the CONTRIBUTING rule on user-facing changes
```

### Decisions worth not re-litigating

```
-     | decision | content/content.js:queryShown      | "hidden" means inside a [hidden] ancestor, which is how YouTube's ytd-page-manager parks the page types not on screen. Layout visibility (getBoundingClientRect, offsetParent) is not used: a player can be legitimately zero-sized mid-transition
-     | decision | content/content.js:getChannel      | Shorts channel is the @handle as YouTube shows it on the reel ("@RateRabbit"), not a display name -- the Shorts UI exposes no other. Watch pages still give the display name
-     | decision | content/content.js:getChannel      | :has() is used to scope to the reel holding the player; it needs Chromium 105+, older than any Opera GX / Chrome that runs this MV3 extension today
-     | decision | tests/FINDINGS.md                  | the Round 6 report replaced the Round 5 narrative, same as every earlier round. Its section 1b records the F-021 to F-024 fixes and ticks their checkboxes
```

### Verification that backed the Round 6 fixes

- `node --check` on both scripts and `JSON.parse(manifest.json)` pass (`version` 1.3.6);
  `content/content.js` still has no top-level `const`/`let`/`var`, so re-injection stays safe.
- **F-021 proved by old-vs-new comparison on the live YouTube DOM** (in-app browser, cookies
  rejected, the file's functions evaluated in the page). Old: a directly loaded Short playing at
  22.0 s read `0`; a Short reached from a watch page read `0` with the watch video's title and
  channel. New: a directly loaded Short read 16.7 s against 16.7 s on the visible player with
  its own title and channel; a Short reached from a watch page read 3.5 s against 3.5 s with
  its own title and `@handle` (the stale microdata still named the watch video and was
  skipped); the next Short in the feed (keyboard ↓) read 4.2 s against 4.2 s with the new
  handle; a watch page reached after Shorts read 49.2 s against 49.2 s with the right title and
  channel.
- **F-022 proved by execution:** `getVideoId()` over 11 URLs in a `vm` sandbox — `/live/<id>` and
  `/live/<id>?si=` now give the id; `/live/`, `/@channel/live`, `/`, `/results` stay null;
  `/watch?v=`, `/shorts/…?feature=share`, `/embed/abc123`, `/embed/videoseries2` unchanged;
  `/embed/videoseries?list=` still null. Live: `/live/jfKfPfyJRdk` now returns `ok: true` with
  the stream's title and channel.
- **F-023 proved by execution:** live, `seekTo(1, currentId)` moved the Short from 10 s to 1.2 s
  and `seekTo(3, otherId)` returned `video-changed` without seeking. In a `vm` sandbox with
  stubbed `chrome`/DOM, the popup's `seekTo()` sends `{type, seconds, videoId}`, toasts
  "Video changed — press ⟳ to see its notes" on a `video-changed` reply, and stays silent on a
  normal or missing reply. Content-script `seekTo()` without a `videoId` still seeks.

- **F-024 checked by reading and grep:** `.github/CONTRIBUTING.md` line 69 now names
  `flushDraftNow()` as the exception to the `queueDraftWrite()` rule. A grep of every
  `setDraft(` / `removeDraft(` call in `popup/popup.js` finds six call sites: two inside
  `persistDraft()`'s queued closure, one each wrapped in `queueDraftWrite()` in `closeDraft()` and
  `clearAll()`, and two in `flushDraftNow()`. So the documented rule and its one exception now
  match the code exactly. This is a documentation fix, so this text check is its only evidence.
- The `content/content.js:seekTo` line under F-023 was added after the Round 6 block was first
  written. The change it records is the same one the F-023 verification above exercised live
  (`seekTo(1, currentId)` seeks, `seekTo(3, otherId)` refuses) and in the `vm` sandbox (no
  `videoId` still seeks).

### Known gaps carried out of Round 6

- The extension was still never loaded into a browser; the content-script functions were run in
  the page's main world, not the extension's isolated world, and the popup only in a stub.
- No embed page and no A/B-tested Shorts layout was checked live. If YouTube renames
  `yt-reel-channel-bar-view-model`, the Shorts channel falls through to the player title bar or
  `""`; hidden pages still cannot answer, so it cannot fall back to the previous watch video.
- A live stream's `currentTime` is a position in the stream's DVR window, not in a finished
  video; timestamps captured mid-stream were not checked against the replay.
- `prettier --check .` was still not run; new lines were hand-wrapped to 80 columns except one
  selector string Prettier cannot break.
- F-024 has no behavioural evidence: whether a contributor now leaves `flushDraftNow()`
  unqueued cannot be observed. Its evidence is the grep above only.
- `tests/LOG.md` integrity was checked by diffing its first 342 lines against the copy read at
  the start of the session. There is no version history for this folder to compare against.

## Round 7 — audit and fixes

```
F-025 | fixed    | content/content.js:getVideoElement | `prettier --write` on content/content.js, README.md and tests/VERIFY.md: two over-wrapped statements joined, two markdown tables realigned. No code behaviour changed
F-026 | fixed    | content/content.js:getState        | new isAdShowing(): while the player carries "ad-showing", getState() sends currentTime null plus adPlaying:true, seekTo() refuses with reason "ad-playing", and getChannel() skips .ytp-title-channel-name
F-026 | fixed    | popup/popup.js:openDraft           | a fresh capture during an ad toasts "An ad is playing — capture once the video is back" instead of opening the draft on the ad's time; a stored draft still reopens with its own time
F-026 | fixed    | popup/popup.js:seekTo              | toasts an "ad-playing" refusal the same way it toasts "video-changed"; README gained a matching limitation bullet
-     | decision | manifest.json:version              | bumped 1.3.6 -> 1.3.7 for the above, per the CONTRIBUTING rule on user-facing changes
```

### Decisions worth not re-litigating

```
-     | decision | content/content.js:getState        | an ad does not make getState() fail: ok stays true so the header, the notes list, Export and Delete keep working during an ad. Only the playback time is withheld
-     | decision | tests/FINDINGS.md                  | its two `repro:` lines keep the two-space indent the audit format requires, so `prettier --check .` still flags this one file. Every project file passes
```

### Verification that backed the Round 7 fixes

- `node --check` on both scripts and `JSON.parse(manifest.json)` pass (`version` 1.3.7);
  `content/content.js` still has no top-level `const`/`let`/`var`; no CR bytes in the tree.
- **F-025:** Prettier 3.9.8 (from the existing npm cache, nothing installed) `--check .` now
  flags only `tests/FINDINGS.md`, on its two `repro:` lines (see the decision above).
- **F-026 proved by old-vs-new comparison** in a `vm` stub with the player's `<video>` inside a
  `.html5-video-player.ad-showing`. Old: `currentTime` 7 (the ad's), channel "Advertiser" from
  the title bar, `seekTo(99)` moved the ad to 99. New: `currentTime` null, `adPlaying` true,
  channel `""`, `seekTo` refused with `ad-playing` and the time left at 7. Without the class,
  both trees give the same answer, including the embed title-bar channel. Popup: the old tree
  opened the draft at `[00:07]` on the old reply. The new tree toasts and leaves the draft
  closed. A stored draft still reopens at `[02:03]`, and with no ad a fresh capture opens at
  `[00:42]`.
- **Live YouTube DOM** (in-app browser, no account): a pre-roll ad was playing on
  `/watch?v=dQw4w9WgXcQ`. `#movie_player` carried `ad-showing`, and `#movie_player video` read
  8.45 s of a 19.4 s ad. The class cleared 6.6 s later, and the same element then read 0.13 s
  of the 213 s video. That confirms the old capture would have filed the ad's position.

### Known gaps carried out of Round 7

- The extension was still never loaded as an extension. The live check read the DOM in the
  page's main world; the popup ran only in a stub.
- Only a watch-page pre-roll was observed. Mid-rolls, Shorts ad reels and embed ads were not
  seen live, so they rest on the same `ad-showing` class being used there.

### Round 7 — entries added after the block above

The Round 7 block above named `content/content.js:seekTo` and `content/content.js:getChannel`
only inside the `getState` line. They get lines of their own here so a later round can match
them by file and symbol. Nothing above was edited.

```
F-026 | fixed    | content/content.js:seekTo          | returns {ok:false, reason:"ad-playing"} without touching currentTime while isAdShowing() holds for the player's <video>
F-026 | fixed    | content/content.js:getChannel      | .ytp-title-channel-name is left out of the selector list while an ad shows, so the embed page cannot name the advertiser as the channel
-     | decision | tests/FINDINGS.md                  | the Round 7 report replaced the Round 6 narrative, same as every earlier round. Round 6 IDs and defect keys survive in its Suppressed section; its section 1b records the F-025/F-026 fixes and ticks their checkboxes
```

### Verification behind these entries

- **`content/content.js:seekTo`**, same `vm` stub run as the Round 7 F-026 evidence above, old
  tree against new. The `<video>` sat inside `.html5-video-player.ad-showing` at 7 s. Old:
  `seekTo(99, "VID")` returned `{ok:true}` and moved the ad to 99. New: it returned
  `{ok:false, reason:"ad-playing"}` and the time stayed at 7. Without the class, both trees
  seeked to 99.
- **`content/content.js:getChannel`**, same run. The only channel element was
  `.ytp-title-channel-name` reading "Advertiser". Old: the channel was "Advertiser" with or
  without the ad. New: the channel was `""` under `ad-showing`, and "Advertiser" without it on
  both a watch and an `/embed/` path, so embed channels are unchanged outside ads.
- **`tests/FINDINGS.md` decision:** bookkeeping, not a behaviour. Nothing was run against it.

### Known gaps behind these entries

- The `seekTo` refusal was seen only in the stub. Live, only `getState()`'s inputs were read
  during an ad (the `ad-showing` class and the ad's `currentTime`); no seek was attempted on the
  live page.
- The `getChannel` change was not seen live. The watch page's `.ytp-title-channel-name` was
  empty during the observed pre-roll, and no embed page with an ad was opened.

## Round 8 — audit and fixes

```
F-027 | fixed    | popup/popup.js:exportMarkdown     | new withPageDetails() fills an empty record title/channel from `state`; exportMarkdown() and updatePreview() both call it, so the preview and the copied Markdown agree. The filled record is only built from, never written back
F-028 | fixed    | popup/popup.html:#count           | dropped the aria-label, which ARIA 1.2 prohibits on a generic <span>; the h2 now reads "Saved notes <n>" from its text
-     | decision | manifest.json:version             | bumped 1.3.7 -> 1.3.8 for the above, per the CONTRIBUTING rule on user-facing changes
```

### Decisions worth not re-litigating

```
-     | decision | popup/popup.js:withPageDetails    | the export takes the preview's behaviour, not the reverse: a title and channel the page can name now are better than "YouTube video" and `Channel: []`. A title or channel the record already holds always wins over `state`
-     | decision | tests/FINDINGS.md                 | the Round 8 report replaced the Round 7 narrative, same as every earlier round. Its section 1b records the F-027/F-028 fixes and ticks their checkboxes
```

### Verification that backed the Round 8 fixes

- `node --check popup/popup.js` and `JSON.parse(manifest.json)` pass (`version` 1.3.8); no CR
  bytes in the changed files; cached Prettier 3.9.8 `--check .` flags only `tests/FINDINGS.md`
  (the Round 7 decision).
- **F-027 proved by old-vs-new comparison** in a `vm` stub whose `chrome.storage` returns
  copies. Stored record with title `""` and channel `""`, `state` naming "Real Title" /
  "Real Channel". Old: preview showed both, export gave `# YouTube video` and `Channel: []`.
  New: preview and export are byte-identical and both carry the page's title and channel.
  Control: a record holding "Saved Title" / "Saved Chan" keeps them in both outputs on the new
  tree.
- **F-028 checked by reading only:** the `aria-label` is gone from `#count`. No screen reader
  or axe run was available.

### Known gaps carried out of Round 8

- The extension was still never loaded into a browser; F-027 was proved in the stub only.
- F-028 has no AT evidence: what a screen reader announces for the heading was not observed.

### Round 8 — entries added after the block above

The Round 8 block above filed F-027 under `popup/popup.js:exportMarkdown` only, while the
Round 8 report keys the defect as `popup/popup.js:updatePreview`. It gets a line of its own
here so a later round can match it by file and symbol. Nothing above was edited.

```
F-027 | fixed    | popup/popup.js:updatePreview      | its two inline `state` fallbacks for an empty title/channel replaced by a call to withPageDetails(), the same helper exportMarkdown() now uses, so the two cannot drift apart again
```

### Verification behind these entries

- **`popup/popup.js:updatePreview`**, same `vm` run as the Round 8 F-027 evidence above, old
  tree against new: preview and export differed before and are byte-identical after, and a
  record's own "Saved Title" / "Saved Chan" still win on the new tree. A grep of `popup/popup.js`
  finds `withPageDetails` defined once and called twice, in `exportMarkdown()` and
  `updatePreview()`, and no other empty-title/channel fallback left.
- **F-028, the static half:** a grep of `popup/popup.html` finds
  `<span id="count" class="count">0</span>` and no `aria-label="Saved note count"`, so the
  prohibited attribute the finding named is gone.
- `tests/LOG.md` integrity: its first 491 lines, everything before Round 8, are identical to a
  copy taken before this session's first edit (`diff -q`).

### Known gaps behind these entries

- F-028's effect on assistive technology is unobserved: no screen reader, axe or browser
  accessibility tree was run, so what the heading announces rests on the ARIA 1.2 rules only.
- F-027 was proved in a stubbed popup only. No real embed page or ad was used to make a record
  with an empty title or channel, and the extension was not loaded.

## Round 9 — audit and fixes

```
F-029 | fixed    | popup/popup.js:buildMarkdown      | new wikiLinkTarget(): in wiki-link mode each run of [ ] | # ^ in the channel name becomes one space before it is wrapped in [[ ]]; a name made only of those characters is written plain. Wiki-link off is unchanged
F-030 | fixed    | popup/popup.js:yamlNeedsQuotes    | new YAML_SPECIAL_FLOAT (^[+-]?\.(inf|nan)$, any case) quotes .inf / .nan values, which YAML reads as Infinity / NaN
F-030 | fixed    | popup/popup.js:yamlRenumbersKey   | the same YAML_SPECIAL_FLOAT check, so a property named .inf or .nan is quoted instead of becoming the key Infinity / NaN
-     | decision | manifest.json:version             | bumped 1.3.8 -> 1.3.9 for the above, per the CONTRIBUTING rule on user-facing changes
```

### Decisions worth not re-litigating

```
-     | decision | popup/popup.js:wikiLinkTarget     | the link characters are replaced, not escaped: Obsidian note names cannot contain [ ] | # ^ at all, so no escaped form links anywhere. "Foo | Bar" links to "Foo Bar". The plain (non-wiki-link) channel keeps the name exactly as YouTube shows it
-     | decision | popup/popup.js:YAML_SPECIAL_FLOAT | matched case-insensitively, like YAML_RESERVED. Mixed-case forms such as .iNf, which YAML leaves as strings, get quoted too; over-quoting is harmless
-     | decision | tests/FINDINGS.md                 | the Round 9 report replaced the Round 8 narrative, same as every earlier round. Its section 1b records the F-029/F-030 fixes and ticks their checkboxes
```

### Verification that backed the Round 9 fixes

- `node --check popup/popup.js` and `JSON.parse(manifest.json)` pass (`version` 1.3.9); cached
  Prettier 3.9.8 `--check popup/popup.js` passes.
- **F-029 proved by old-vs-new comparison** in the Round 9 `vm` harness (real `popup/popup.js`,
  Channel property in wiki-link mode). Old: `Foo | Bar` → `"[[Foo | Bar]]"`, `News #1` →
  `"[[News #1]]"`, `A [b] c` → `"[[A [b] c]]"`. New: `"[[Foo Bar]]"`, `"[[News 1]]"`,
  `"[[A b c]]"`. Controls on the new tree: `@Handle` and `Plain` are unchanged, `|||` is written
  plain as `"|||"`, an empty channel still gives `Channel: []`, and with wiki-link off every
  name is written exactly as given.
- **F-030 proved by old-vs-new comparison** with js-yaml 5.4.1 and yaml 1.10.3 (already on
  disk, loaded by path, nothing installed). Old: value `.nan` parsed to NaN, list value `.Inf`
  to Infinity, key `.inf` to `Infinity`. New: all three come back as the typed text. The
  71-string `yamlScalar()` / `yamlKey()` round-trip sweep now fails only on `a\u0007b` (a C0
  control, not reported in Round 9); `.inf`, `.NaN` and `+.inf` pass.
- Both README Markdown examples still reproduce byte-for-byte from `buildMarkdown()`.
- `tests/LOG.md` integrity: everything before this Round 9 section is identical to a copy taken
  just before it was appended (`cmp`).

### Known gaps carried out of Round 9

- Obsidian itself was not run. F-029 rests on Obsidian's documented link syntax, and F-030 on
  two general YAML parsers rather than Obsidian's own.
- The extension was still never loaded into a browser; both fixes were proved in the stub only.
