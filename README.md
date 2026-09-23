# YouTube Timestamp Notes

An Opera GX (and any Chromium browser) extension that lets you capture the exact
timestamp of the YouTube video you are watching, attach a note to it, save as
many timestamped notes per video as you like, and export them all as Markdown.

## Features

- **Capture the current timestamp** with one click, formatted as `[MM:SS]` (or
  `[HH:MM:SS]` for videos an hour or longer).
- **Attach a note** to each captured timestamp.
- **Save multiple notes per video.** Notes are stored locally per video ID and
  persist across browser restarts.
- **Jump back** to any saved timestamp by clicking it in the list.
- **Drafts survive.** A half-written note — and the timestamp you captured for
  it — is kept if you close the popup, and is restored exactly where you left
  off next time you open it.
- **Re-read the page** with ⟳ when YouTube's in-page navigation leaves the
  popup pointing at the wrong video.
- **Export & copy Markdown** — one click copies the whole video's notes to your
  clipboard in Markdown.
- **Delete** a single note with ✕, or clear the whole video with **Delete all** —
  which asks for a second press (the button turns orange and reads _CONFIRM
  DELETE_) before it removes anything, and disarms itself after a few seconds.
- **Export settings** (⚙ in the top-right) — a second tab where you choose how
  the Markdown is formatted, with a live preview:
  - _Obsidian-flavored links_ — escapes the timestamp brackets so Obsidian
    doesn't read `[[07:50]]` as an internal wiki-link.
  - _Video title as heading_ — put the title as an `#` heading (or plain text).
  - _Add properties_ — include an Obsidian YAML frontmatter block with three
    pre-built, renameable properties: **Link** (text → the video URL),
    **Channel** (list → the channel name, optionally written as an Obsidian
    `[[wiki-link]]`), and **tags** (named `tags` by default so Obsidian
    recognises it as the Tags property — a list you fill in, comma-separated).
    Use **+ Add property** to add your own custom properties (text or list;
    list values are comma-separated). Each property has an enable checkbox, and
    you can **reorder them** by dragging the ⠿ handle or, from the keyboard,
    with `Alt`+`↑`/`↓` — the frontmatter is written in the order shown. Two
    properties cannot share a name (YAML has no way to express it): the first
    one wins and the later row is outlined in orange to show it is left out of
    the export.

All data lives in `chrome.storage.local` on your machine. Nothing is sent
anywhere, and the extension makes no network requests of its own.

## Permissions

The extension asks for the minimum it needs, and nothing that reaches beyond
YouTube:

| Permission                                         | Why                                                                                                                  |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `storage`                                          | Saves your notes, drafts and export settings locally.                                                                |
| `scripting`                                        | Re-injects the content script into a YouTube tab that was already open when the extension was installed or updated.  |
| `clipboardWrite`                                   | Copies the exported Markdown when the browser refuses the modern clipboard API and the fallback copy has to be used. |
| `host_permissions` for `https://www.youtube.com/*` | Reads the current video's id, title, channel and playback time.                                                      |

The content script is only ever injected into tabs whose URL matches that one
YouTube origin.

## Markdown output

With the default settings the exported Markdown looks like this:

```markdown
# Video title here

https://www.youtube.com/watch?v=VIDEO_ID

- [\[00:42\]](https://www.youtube.com/watch?v=VIDEO_ID&t=42s) - The intro finally gets to the point
- [\[03:15\]](https://www.youtube.com/watch?v=VIDEO_ID&t=195s) - Key argument starts
- [\[12:08\]](https://www.youtube.com/watch?v=VIDEO_ID&t=728s) - Summary and links
```

Each line renders in Obsidian (and any Markdown viewer) as a clickable
**[07:50] - your note**, where clicking the timestamp opens the video at that
exact moment (`&t=<seconds>s`). The brackets in the link text are escaped so
Obsidian doesn't mistake them for an internal `[[wiki-link]]`. Timestamps are
sorted chronologically regardless of the order you saved them.

With **properties** enabled (and, say, _Channel_ renamed to _Author_) the same
export gains an Obsidian frontmatter block at the top:

```markdown
---
Link: https://www.youtube.com/watch?v=VIDEO_ID
Author:
  - "[[Channel Name]]"
tags:
  - youtube
  - tutorial
---

# Video title here

- [\[00:42\]](https://www.youtube.com/watch?v=VIDEO_ID&t=42s) - The intro finally gets to the point
```

(Here _Channel_ was renamed to _Author_ and set to wiki-link mode, and the
pre-built _tags_ property was enabled and filled in with `youtube, tutorial`.)

Open the ⚙ **Export settings** tab to toggle these and watch the live preview
update. Your choices are saved and reused for every export.

## Install (unpacked)

Opera GX and Chrome both load unpacked Manifest V3 extensions the same way:

### Opera GX

1. Open `opera://extensions` (or menu → Extensions → Manage Extensions).
2. Turn on **Developer mode** (top-right toggle).
3. Click **Load unpacked** and select this project folder (the one containing
   `manifest.json`).
4. Pin the extension so its button is visible on the toolbar.

### Chrome / Edge / Brave

1. Open `chrome://extensions`.
2. Turn on **Developer mode**.
3. Click **Load unpacked** and select this project folder.

## How to use

1. Open any YouTube video.
2. Click the extension button to open the popup.
3. Click **● Capture current timestamp**. The current playback time is grabbed
   as `[MM:SS]`.
4. Type your note and click **Save note** (or press `Ctrl`/`Cmd`+`Enter`).
5. Repeat as many times as you want.
6. Click **Export & copy Markdown** to copy all notes for the video.
7. Use the **✕** on a note to remove it, or press **Delete all** twice to clear
   the video.

If the header shows the wrong video — or "Open a YouTube video…" on a page you
know is a video — press **⟳** to re-read the page.

## Project structure

```
manifest.json        Extension manifest (MV3)
content/content.js   Reads current time / title / video id from the page
popup/popup.html     Popup markup
popup/popup.css      Popup styling (Opera GX flavored dark theme)
popup/popup.js       Popup logic + storage + Markdown export
icons/               Toolbar icons (16 / 48 / 128 px)
```

There is no build step and no dependencies — the folder you clone is exactly
the folder you load.

## Notes & limitations

- Works on watch pages (`youtube.com/watch?v=...`), live streams and their
  replays (`/live/<id>`), Shorts (`/shorts/<id>`) and embed pages opened
  directly (`/embed/<id>`), on `www.youtube.com`.
- **Playlist embeds (`/embed/videoseries?list=...`) are not supported.** That URL
  names a playlist, not a video, so there is no video id to file notes under —
  the popup reports it as not a video page rather than mixing every playlist's
  notes together.
- **Only `www.youtube.com` is in scope.** `m.youtube.com` and
  `music.youtube.com` are not: the extension does not request access to them,
  so nothing runs there.
- Videos **embedded on other sites are not supported.** The extension is only
  granted access to YouTube's own domain, so no content script runs on a
  third-party page that happens to host a YouTube iframe.
- Timestamps use the video element's real `currentTime`, so they match the
  moment you clicked capture.
- **Capture and jump-to-timestamp wait out ads.** An ad plays in the same player,
  so while one is on screen the popup says so instead of saving (or seeking) the
  ad's position.
- Because YouTube is a single-page app, the popup re-reads the current video
  each time you open it — no page reload required. In-page navigation can still
  leave it out of date, which is what the **⟳** button is for.
- Notes are stored per browser profile. They are not synced between devices,
  and uninstalling the extension discards them — export anything you want to
  keep.
- Notes accumulate per video and are only reachable from that video. There is
  no browse-all view and no bulk delete, so the way to retrieve a video's notes
  is to open that video again.

## Contributing

See [CONTRIBUTING.md](.github/CONTRIBUTING.md). Issues and pull requests are
welcome.

## License

[MIT](LICENSE) © ArisMGGR
