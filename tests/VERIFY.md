# Verification round 9

Scope: confirm the Round 9 fixes recorded in [LOG.md](LOG.md) against the findings in
[FINDINGS.md](FINDINGS.md). Not an audit. The previous `tests/VERIFY.md` was round 8 and
recorded no STILL FAILING finding, so no STUCK status can apply this round.

`LOG.md` was found at `tests/LOG.md`, not at the project root. Highest ID in any input: F-030.

---

## Coverage and limits

**Executed.** Every harness, tree copy and mutant was in the session scratchpad, outside the
project. The project tree was only read.

- **`vm` harness** loading the real `popup/popup.js` from a full tree copy, with a permissive DOM
  stub and a `chrome.storage` stub that returns copies. `settings` was set in the context and
  `buildMarkdown()` called directly. The frontmatter was parsed back with js-yaml and yaml,
  already on disk inside another globally installed npm package, loaded by path. Nothing was
  installed.
  - **F-029 repro:** channel `Foo | Bar`, Channel property in wiki-link mode, gives
    `- "[[Foo Bar]]"`. Also `News #1` → `[[News 1]]`, `A [b] c` → `[[A b c]]`, `x^y` →
    `[[x y]]`. Controls: `@Handle` and `Plain` unchanged, `|||` written plain, empty channel
    gives `Channel: []`, wiki-link off writes `Foo | Bar` as given.
  - **F-030 repro:** custom text value `.nan` gives `Score: ".nan"`, which both parsers read as the
    string. A custom property named `.inf` gives the key `".inf"`, read back as `.inf`, not
    `Infinity`. Also `.Inf` as a list value, and keys `+.inf` and `.NaN`: all round-trip as text.
  - **Mutation (the harness can fail):** in a second copy, only the two fixes were reverted
    (`wikiLinkTarget()` returns its input; `YAML_SPECIAL_FLOAT` matches nothing). The round 1
    failures came back: `"[[Foo | Bar]]"`, `Score: .nan` → NaN, `.inf: x` → key `Infinity`,
    `.NaN: z` → key `NaN`.
  - Both README Markdown examples reproduce byte-for-byte from `buildMarkdown()` on the fixed tree.
- Cached Prettier 3.9.8 `--check .` on the tree copy. `node --check` on both scripts.
  `JSON.parse` on `manifest.json` (`version` 1.3.9) and `.prettierrc`. No CR bytes in
  `popup/popup.js` or `manifest.json`.

**Confirmed by reading only:** none. Both findings were executed.

**Fix-test efficacy:** not applicable. Both findings are LOW, no fix added or changed a test, and
the project has no test suite.

**Regression scope examined, exactly:**

- `popup/popup.js`: `wikiLinkTarget` (new), `buildMarkdown` (channel branch), `YAML_SPECIAL_FLOAT`
  (new), `yamlNeedsQuotes`, `yamlRenumbersKey`, and their callers `yamlScalar`, `yamlKey` and
  `resolvedKeyFor`. The only `[[…]]` builder is the channel branch (grep); preview and export
  both go through `buildMarkdown()`. Every `record.channel` writer stores a string.
- `manifest.json`: `version` (the logged decision; CONTRIBUTING requires the bump).
- README statements about the Channel wiki-link and both Markdown examples.
- Files newer than `tests/FINDINGS.md`: none.

**What was NOT examined:**

- Everything outside that scope: `content/content.js`, the rest of `popup/popup.js`,
  `popup/popup.html`, `popup/popup.css`, `.github/` and the icons.
- The suppressed findings F-001 to F-028 were not re-checked.
- The extension was never loaded into a browser, and Obsidian was not run. F-029 rests on
  Obsidian's documented link syntax, F-030 on two general YAML parsers, not Obsidian's own.

This file does not state, and must not be read as stating, that the project is clean. It
states only the status of the tracked findings and what the scope above covered.

---

## Tracked findings

Suppressed entries (F-001 to F-028) are not tracked and carry no status here.

| ID    | Severity | file:symbol                    | Status   | Evidence                                          | Note                                           |
| ----- | -------- | ------------------------------ | -------- | ------------------------------------------------- | ---------------------------------------------- |
| F-029 | LOW      | popup/popup.js:buildMarkdown   | VERIFIED | vm: `Foo \| Bar` exports `[[Foo Bar]]`            | reverted mutant reproduces failure; stub only  |
| F-030 | LOW      | popup/popup.js:yamlNeedsQuotes | VERIFIED | `.nan` value and `.inf` key round-trip as strings | js-yaml and yaml; mutant reproduces NaN / Infinity |

VERIFIED: 2
STILL FAILING: 0
STUCK: 0
NEEDS MANUAL REVIEW: 0
ACCEPTED: 0
OPEN: 0

---

## Regressions

No MEDIUM+ regressions in changed files.

---

## Tests and linters

- `prettier --check .` (cached Prettier 3.9.8, on a tree copy) — fail — `tests/FINDINGS.md`
  only, its `repro:` line indent; LOG.md records this as a decision. No project source file is
  flagged.
- `node --check content/content.js` — pass.
- `node --check popup/popup.js` — pass.
- `JSON.parse(manifest.json)` — pass (`version` 1.3.9).
- `JSON.parse(.prettierrc)` — pass.
- Test suite — none configured.

---

Backlog: `prettier --check .` still exits 1 on `tests/FINDINGS.md`'s audit-format indent; F-029 and F-030 were seen only in a stubbed popup and general YAML parsers, never in Obsidian; the extension was not loaded this round.

---

## Result

All tracked blocking findings verified; no MEDIUM+ regressions in changed files.
