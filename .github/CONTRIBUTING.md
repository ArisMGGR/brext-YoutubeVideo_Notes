# Contributing

Thanks for taking a look. This is a small, dependency-free Manifest V3
extension — there is no build step, no bundler and no package manager. The
folder you clone is exactly the folder the browser loads.

## Getting set up

1. Clone the repo.
2. Open `chrome://extensions` (or `opera://extensions`) and turn on
   **Developer mode**.
3. **Load unpacked** and pick the repo folder.
4. After editing, press the reload icon on the extension card. Reloading the
   extension orphans the content script in any YouTube tab that is already
   open; the popup re-injects it automatically, so you should not need to
   reload the page.

## Code style

Formatting is handled by [Prettier](https://prettier.io) using the checked-in
`.prettierrc`. Prettier is not a dependency of this repo — run it however you
prefer, e.g.:

```sh
npx prettier --write .
```

Prettier reads the repo's `.gitignore` as its ignore list -- there is no
separate `.prettierignore`. CI runs `prettier --check .` on every pull request,
along with a syntax check of both scripts and a `manifest.json` validity check,
so an unformatted commit fails the build.

Beyond formatting, please match what's already there:

- Double quotes in JS, `camelCase` for JS identifiers and HTML ids,
  `kebab-case` for CSS classes.
- HTML ids map to keys on the `els` object at the top of `popup/popup.js`.
- Comments explain _why_, not _what_. The existing code is commented at a
  fairly high density — keep that up for anything non-obvious.
- No `console.log` left in committed code.

## Things to be careful about

- **Never widen the injection surface.** `popup/popup.js` only calls
  `chrome.scripting.executeScript` on tabs whose URL passes `isYouTubeTab()`.
  `host_permissions` is the real boundary — the extension declares one origin,
  and injecting anywhere else would fail on permissions regardless — but the
  check keeps the popup from asking in the first place, and keeps the guard
  honest if another origin is ever added to the manifest.
- **Frontmatter values must go through `yamlScalar()` / `yamlKey()`.** Channel
  names, tag values and custom property values are free text and regularly
  contain characters (`:`, `#`, quotes) that break unquoted YAML.
- **Keep the storage shape backward compatible.** `loadItems()` decides where
  a settings object's property list comes from: the stored `items` array, an
  older split shape (`migrateLegacyProperties()`), or `defaultItems()` for a
  fresh install. A **new pre-built property goes in `defaultItems()`** -- that
  is the single definition of them, and the only one a fresh install reads;
  adding it to `migrateLegacyProperties()` alone reaches existing users and no
  one else. Extend `normalizeItem()` for a new field on an item. Don't break
  existing users' saved preferences.
- **The draft panel belongs to a video, not to whatever is playing.** An open
  draft tracks `draftVideoId`, and `syncDraftToCurrentVideo()` detaches it when
  a refresh lands on a different video. Read `state.videoId` for the _current_
  page and `draftVideoId` for the note being written; conflating them files
  notes under the wrong video.
- **Route draft writes through `queueDraftWrite()`.** `chrome.storage` calls
  started earlier can finish later, so an unqueued write can land after the
  remove meant to discard it and bring a deleted draft back. The one exception
  is `flushDraftNow()`, used only by the `pagehide` handler: a queued write
  there waits on an earlier write whose callback never fires in a closing
  popup, so the last keystrokes would be lost. Don't route it through the
  queue, and don't add a second unqueued call site.
- **Reordering must stay reachable from the keyboard.** Drag-and-drop is
  pointer-only, so the ⠿ handle is focusable and `Alt`+`↑`/`↓` moves a row via
  `moveItem()`. `renderProps()` rebuilds every row, so a move has to restore
  focus (`focusHandleFor()`) or the second arrow press goes nowhere.
- **Don't commit secrets.** There are none in this repo today and it should
  stay that way; `.gitignore` covers the usual suspects.

## Testing

There is no test runner. Before opening a PR, exercise the paths you touched
by hand:

- Capture, save, and delete a note on a normal watch page and on a Short.
- Close and reopen the popup mid-note to confirm the draft is restored.
- Export with properties on and off, and paste the result into Obsidian to
  confirm the frontmatter parses.
- Open the popup on a non-YouTube page and confirm it degrades gracefully.
- Reorder a property with the ⠿ handle and again with `Alt`+`↑`/`↓`, and
  confirm the export preview follows the new order both times.
- Start a note, let YouTube navigate to another video, press ⟳, and confirm the
  draft panel clears rather than following you to the new video.
- Reload the extension from the extensions page with a YouTube tab already
  open, then use the popup without reloading that tab.

## Pull requests

Keep changes focused, explain the user-visible effect in the description, and
bump `version` in `manifest.json` if the change is user-facing.
