// Popup logic for YouTube Timestamp Notes.
//
// Data model (chrome.storage.local):
//   key "notes:<videoId>" -> {
//     videoId, title, channel, url,
//     entries: [ { id, seconds, timestamp, note, createdAt } ]
//   }
//   key "draft:<videoId>" -> { seconds, timestamp, note }
//     The in-progress note for a video. Persisted so a half-written note (and
//     its captured timestamp) survives the popup closing, and restored when the
//     popup reopens. Cleared once the note is saved or discarded.
//   key "settings" -> {
//     obsidian: bool,
//     titleAsHeading: bool,
//     properties: {
//       enabled: bool,
//       items: [ ordered list, drag-reorderable, each:
//         { id, kind:"link",    enabled, name }
//         { id, kind:"channel", enabled, name, wikilink }
//         { id, kind:"tags",    enabled, name, value }
//         { id, kind:"custom",  enabled, name, type:"text"|"list", value }
//       ]
//     }
//   }

const els = {
  videoTitle: document.getElementById("videoTitle"),
  reloadBtn: document.getElementById("reloadBtn"),
  gearBtn: document.getElementById("gearBtn"),
  backBtn: document.getElementById("backBtn"),
  mainView: document.getElementById("mainView"),
  mainFooter: document.getElementById("mainFooter"),
  settingsView: document.getElementById("settingsView"),
  captureBtn: document.getElementById("captureBtn"),
  draft: document.getElementById("draft"),
  draftTimestamp: document.getElementById("draftTimestamp"),
  cancelDraftBtn: document.getElementById("cancelDraftBtn"),
  noteInput: document.getElementById("noteInput"),
  saveBtn: document.getElementById("saveBtn"),
  notesList: document.getElementById("notesList"),
  emptyState: document.getElementById("emptyState"),
  count: document.getElementById("count"),
  exportBtn: document.getElementById("exportBtn"),
  clearBtn: document.getElementById("clearBtn"),
  toast: document.getElementById("toast"),
  // settings controls
  setObsidian: document.getElementById("setObsidian"),
  setTitleHeading: document.getElementById("setTitleHeading"),
  setProperties: document.getElementById("setProperties"),
  propsOptions: document.getElementById("propsOptions"),
  propsList: document.getElementById("propsList"),
  addPropBtn: document.getElementById("addPropBtn"),
  preview: document.getElementById("preview"),
};

// Properties are a single ordered list so they can be reordered by dragging.
// Each item has a `kind`: the pre-built "link" / "channel" / "tags" derive
// their value from the page (or, for tags, from a typed field), while "custom"
// is a user-defined property.
const DEFAULT_SETTINGS = {
  obsidian: true,
  titleAsHeading: true,
  properties: {
    enabled: false,
    items: [], // filled by loadSettings() (see defaultItems / migration)
  },
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function defaultNameFor(kind) {
  if (kind === "link") return "Link";
  if (kind === "channel") return "Channel";
  if (kind === "tags") return "tags";
  return "";
}

// The pre-built properties, in their default order.
function defaultItems() {
  return [
    { id: uid(), kind: "link", enabled: true, name: "Link" },
    {
      id: uid(),
      kind: "channel",
      enabled: true,
      name: "Channel",
      wikilink: false,
    },
    { id: uid(), kind: "tags", enabled: false, name: "tags", value: "" },
  ];
}

// Normalize one stored item into a valid shape.
function normalizeItem(it) {
  if (!it || typeof it !== "object") return null;
  const kind = ["link", "channel", "tags", "custom"].includes(it.kind)
    ? it.kind
    : "custom";
  const base = {
    id: it.id || uid(),
    kind,
    enabled: it.enabled !== false,
    name: typeof it.name === "string" ? it.name : defaultNameFor(kind),
  };
  if (kind === "channel") base.wikilink = !!it.wikilink;
  if (kind === "tags")
    base.value = typeof it.value === "string" ? it.value : "";
  if (kind === "custom") {
    base.type = it.type === "list" ? "list" : "text";
    base.value = typeof it.value === "string" ? it.value : "";
  }
  return base;
}

// The stored properties, whatever shape they are in. A settings object either
// carries the current ordered `items` list or the older split keys; anything
// else — including a brand-new install with nothing stored — starts from
// defaultItems(), so that stays the single definition of the pre-built
// properties and adding one there reaches new users.
function loadItems(p) {
  if (Array.isArray(p.items)) {
    const items = p.items.map(normalizeItem).filter(Boolean);
    // Only custom items are deletable, so the UI can neither empty this list
    // nor strip every pre-built property from it. Either shape means the
    // stored list was corrupted, and keeping it would be worse than an empty
    // one: nothing in the UI adds a pre-built property back, so the user would
    // be stranded without Link / Channel / tags and no way to restore them.
    const hasPrebuilt = items.some((it) => it.kind !== "custom");
    return hasPrebuilt ? items : defaultItems();
  }
  if (p.link || p.channel || p.tags || Array.isArray(p.custom)) {
    return migrateLegacyProperties(p);
  }
  return defaultItems();
}

// Build the items array from an older settings shape (link/channel/tags/custom
// as separate keys) so previously-saved settings keep working.
function migrateLegacyProperties(p) {
  const items = [];
  const L = p.link || {};
  items.push({
    id: uid(),
    kind: "link",
    enabled: L.enabled !== false,
    name: L.name || "Link",
  });
  const C = p.channel || {};
  items.push({
    id: uid(),
    kind: "channel",
    enabled: C.enabled !== false,
    name: C.name || "Channel",
    wikilink: !!C.wikilink,
  });
  const T = p.tags || {};
  items.push({
    id: uid(),
    kind: "tags",
    enabled: !!T.enabled,
    name: T.name || "tags",
    value: typeof T.value === "string" ? T.value : "",
  });
  if (Array.isArray(p.custom)) {
    // The spread is an object whatever `c` is, so normalizeItem() cannot
    // return null here -- a junk entry comes back as a blank custom property.
    for (const c of p.custom) {
      items.push(normalizeItem({ ...c, kind: "custom" }));
    }
  }
  return items;
}

let state = null; // current video state from the content script
let settings = DEFAULT_SETTINGS; // loaded from storage on open

// ---------- draft state ----------
//
// The draft panel belongs to one specific video, which is not always the video
// `state` now points at: the popup re-reads the page on every open and on ⟳,
// and YouTube's in-page navigation can move on underneath a half-written note.
// `boundVideoId` is the video the panel was last synced to and `draftVideoId`
// the video an *open* draft was captured on; keeping both distinct from
// `state.videoId` is what stops a refresh from filing a note under the wrong
// video.
let draftVideoId = null; // video an open draft belongs to, null when closed
let draftSeconds = null; // seconds captured for the pending note
let boundVideoId; // undefined until the first refresh syncs the panel
let draftSaveTimer = null;
// Set while saveDraft() is filing a note, so a second Save arriving mid-flight
// is dropped instead of filing a duplicate.
let savingDraft = false;
// Bumped whenever an open draft is closed or detached, so a write still queued
// for the previous draft becomes a no-op instead of resurrecting it.
let draftGeneration = 0;
// Every draft write goes through this one chain. chrome.storage calls started
// earlier can otherwise finish later, letting a save already in flight land
// after the remove that was meant to discard it.
let draftWrites = Promise.resolve();

// Run a draft write after every write queued before it.
function queueDraftWrite(run) {
  const next = draftWrites.then(run, run);
  draftWrites = next.catch(() => {});
  return next;
}

// The same discipline for a note record, extended to cover the read. Every
// caller of setRecord() first reads the record, changes it, and writes it
// back; two of those overlapping would both read the same copy and the second
// write would undo the first -- deleting two notes in quick succession would
// leave one of them in storage. Queueing only the write is not enough, so the
// whole read-modify-write runs inside this one chain.
let recordWrites = Promise.resolve();

function queueRecordUpdate(run) {
  const next = recordWrites.then(run, run);
  recordWrites = next.catch(() => {});
  return next;
}

// chrome.storage reports a failed call (quota, I/O, an invalidated context)
// through runtime.lastError instead of throwing, so a write that never landed
// looks exactly like one that did. Reading the property also clears it, which
// is why every callback below reads it: an unread error is inherited by the
// next, unrelated call and logged by the browser as "Unchecked
// runtime.lastError".
function storageFailed() {
  return !!chrome.runtime.lastError;
}

// Set when the settings read failed, and never cleared for the life of the
// popup: `settings` then holds DEFAULT_SETTINGS rather than what is stored, and
// writing that back would replace the user's renamed properties, custom
// properties and tag values with the defaults. This is the rule getRecord()
// already enforces for notes -- a failed read is not an empty result -- applied
// to settings, which are written from a different path and so need their own.
let settingsReadFailed = false;
// The refusal is reported once. saveSettings() runs on a 250 ms keystroke
// debounce, so toasting every time would fire on every character typed.
let settingsErrorToasted = false;

function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get("settings", (data) => {
      // A failed read yields no data at all. Falling back to the defaults keeps
      // the popup usable; reading `data.settings` off undefined would throw
      // inside this callback and leave init() half-finished. Remember that it
      // failed so nothing writes those defaults back over the real settings.
      settingsReadFailed = storageFailed();
      const s = (!settingsReadFailed && data && data.settings) || {};
      const p = s.properties || {};
      // Merge against defaults so missing keys stay valid.
      settings = {
        obsidian:
          s.obsidian !== undefined ? s.obsidian : DEFAULT_SETTINGS.obsidian,
        titleAsHeading:
          s.titleAsHeading !== undefined
            ? s.titleAsHeading
            : DEFAULT_SETTINGS.titleAsHeading,
        properties: {
          enabled:
            p.enabled !== undefined
              ? p.enabled
              : DEFAULT_SETTINGS.properties.enabled,
          // New unified ordered list, an older split shape, or the defaults.
          items: loadItems(p),
        },
      };
      resolve(settings);
    });
  });
}

// Resolves false when the write failed, or when it was refused because the
// settings in memory came from a read that failed. Settings are re-written on
// the next keystroke and on leaving the view, so no caller acts on the result;
// it is returned for symmetry with the other writes and so a future caller can.
function saveSettings() {
  return new Promise((resolve) => {
    // The defaults loaded after a failed read are not the user's settings.
    // Persisting them would drop every rename, custom property and tag value
    // still sitting in storage, so say so and leave storage alone.
    if (settingsReadFailed) {
      if (!settingsErrorToasted) {
        settingsErrorToasted = true;
        showToast("Settings could not be read — changes are not saved");
      }
      resolve(false);
      return;
    }
    chrome.storage.local.set({ settings }, () => resolve(!storageFailed()));
  });
}

// ---------- helpers ----------

function pad(n) {
  return String(n).padStart(2, "0");
}

// Format seconds as "[MM:SS]" or "[HH:MM:SS]" when an hour or more.
function formatTimestamp(totalSeconds) {
  // currentTime is NaN while the player is still loading metadata, and would
  // otherwise render (and be stored) as "[NaN:NaN]".
  const n = Number(totalSeconds);
  const s = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  const core =
    hours > 0
      ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`
      : `${pad(minutes)}:${pad(seconds)}`;
  return `[${core}]`;
}

function storageKey(videoId) {
  return `notes:${videoId}`;
}

// Build a URL that opens the video at the given moment: ...&t=42s
function timestampUrl(baseUrl, seconds) {
  const s = Math.max(0, Math.floor(seconds));
  try {
    const url = new URL(baseUrl);
    url.searchParams.set("t", `${s}s`);
    return url.toString();
  } catch (e) {
    const sep = baseUrl.includes("?") ? "&" : "?";
    return `${baseUrl}${sep}t=${s}s`;
  }
}

// Resolves null when the read itself failed, which is not the same thing as a
// video having no notes yet: treating a failed read as an empty record would
// let the caller write that empty record back over notes that are still there.
function getRecord(videoId) {
  return new Promise((resolve) => {
    const key = storageKey(videoId);
    chrome.storage.local.get(key, (data) => {
      if (storageFailed() || !data) {
        resolve(null);
        return;
      }
      resolve(
        data[key] || {
          videoId,
          title: "",
          channel: "",
          url: `https://www.youtube.com/watch?v=${videoId}`,
          entries: [],
        }
      );
    });
  });
}

// The record writes resolve false on failure, and every caller tells the user:
// a note reported as saved when the write was refused is the one outcome this
// popup must never produce.
function setRecord(record) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [storageKey(record.videoId)]: record }, () =>
      resolve(!storageFailed())
    );
  });
}

function removeRecord(videoId) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(storageKey(videoId), () =>
      resolve(!storageFailed())
    );
  });
}

function draftKey(videoId) {
  return `draft:${videoId}`;
}

// A failed draft read resolves null, the same as no stored draft: the panel
// opens empty on the live timestamp instead of restoring text, which is what a
// missing draft does anyway.
function getDraft(videoId) {
  return new Promise((resolve) => {
    const key = draftKey(videoId);
    chrome.storage.local.get(key, (data) =>
      resolve((!storageFailed() && data && data[key]) || null)
    );
  });
}

// The draft writes report failure the same way the record writes do, but
// nothing surfaces it: they fire on a 300 ms keystroke debounce and on
// pagehide, where a toast would either interrupt typing or arrive after the
// popup is gone. A draft is a convenience; the note itself is what must not be
// lost silently.
function setDraft(videoId, draft) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ [draftKey(videoId)]: draft }, () =>
      resolve(!storageFailed())
    );
  });
}

function removeDraft(videoId) {
  return new Promise((resolve) => {
    chrome.storage.local.remove(draftKey(videoId), () =>
      resolve(!storageFailed())
    );
  });
}

function showToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.remove("hidden");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => els.toast.classList.add("hidden"), 1800);
}

// A failed query reports through runtime.lastError and calls back with no tab
// list at all, so `tabs` cannot be indexed blindly: the TypeError would be
// thrown inside this callback, where nothing catches it, leaving the promise
// unsettled and whichever caller awaited it -- init(), openDraft(), seekTo() --
// waiting forever. Reading lastError also keeps it from being inherited by the
// next, unrelated call, the way sendToTab() already does.
function queryActiveTab() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs) {
        resolve(null);
        return;
      }
      resolve(tabs[0] || null);
    });
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

const YOUTUBE_URL = /^https:\/\/www\.youtube\.com\//;

// Defense in depth. host_permissions already limits executeScript to YouTube,
// so injecting elsewhere would fail on permissions anyway; this keeps the
// popup from asking in the first place, and keeps the guard correct if an
// origin is ever added to the manifest for some other reason.
function isYouTubeTab(tab) {
  return !!(tab && typeof tab.url === "string" && YOUTUBE_URL.test(tab.url));
}

// Inject the content script into a tab on demand. Needed when the extension
// was reloaded/updated while a YouTube tab stayed open: the old content script
// is orphaned and Chrome does not auto-inject the new one, so messages get no
// listener. Resolves true if the script is now present.
function injectContentScript(tabId) {
  return new Promise((resolve) => {
    chrome.scripting.executeScript(
      { target: { tabId }, files: ["content/content.js"] },
      () => resolve(!chrome.runtime.lastError)
    );
  });
}

// Ask a tab for its state, injecting the content script and retrying once if
// it isn't loaded yet.
async function getStateFromTab(tab) {
  if (!tab || !tab.id) return null;
  let resp = await sendToTab(tab.id, { type: "GET_STATE" });
  if (!resp && isYouTubeTab(tab)) {
    const injected = await injectContentScript(tab.id);
    if (injected) resp = await sendToTab(tab.id, { type: "GET_STATE" });
  }
  return resp;
}

// ---------- YAML ----------

// A YAML scalar has to be quoted whenever its plain form would parse as
// something other than that exact string: empty, whitespace-padded, opening
// with an indicator character, carrying ": " or " #", or spelling out a
// boolean / null / number.
const YAML_INDICATORS = "-?:,[]{}#&*!|>'\"%@`";
const YAML_RESERVED = /^(?:true|false|yes|no|on|off|null|~)$/i;
const YAML_NUMBER = /^[+-]?(?:\d[\d_]*(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
// Hex, octal and binary forms, which YAML_NUMBER does not describe and which
// resolve to a plain integer: `0x10` is read as 16, `0o17` as 15.
const YAML_RADIX = /^[+-]?0[xXoObB][0-9a-fA-F_]+$/;
// Infinity and NaN, which YAML spells with a leading dot: `.inf` is read as
// Infinity and `.nan` as NaN. Matched in any case, like YAML_RESERVED.
const YAML_SPECIAL_FLOAT = /^[+-]?\.(?:inf|nan)$/i;
// Characters YAML does not allow anywhere in a document, quoted or not: C0
// controls other than tab / LF / CR, DEL, the C1 block except NEL, and the
// noncharacters U+FFFE / U+FFFF. One of them makes a parser reject the whole
// frontmatter, so yamlScalar() writes them as escapes instead.
const YAML_NON_PRINTABLE =
  /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x84\x86-\x9F\uFFFE\uFFFF]/;
const YAML_NON_PRINTABLE_ALL = new RegExp(YAML_NON_PRINTABLE.source, "g");

function yamlNeedsQuotes(s) {
  return (
    s === "" ||
    s !== s.trim() ||
    YAML_INDICATORS.includes(s[0]) ||
    s.includes(": ") ||
    s.endsWith(":") ||
    s.includes(" #") ||
    /[\n\r\t]/.test(s) ||
    YAML_NON_PRINTABLE.test(s) ||
    YAML_RESERVED.test(s) ||
    YAML_NUMBER.test(s) ||
    YAML_RADIX.test(s) ||
    YAML_SPECIAL_FLOAT.test(s)
  );
}

// Render a value as a YAML scalar, double-quoting and escaping only when the
// bare form would be misread. Channel names, tags and custom values are all
// free text, so any of them can contain a colon, a quote or a leading "#".
function yamlScalar(value) {
  const s = value === undefined || value === null ? "" : String(value);
  if (!yamlNeedsQuotes(s)) return s;
  const escaped = s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\r/g, "\\r")
    .replace(/\n/g, "\\n")
    .replace(/\t/g, "\\t")
    .replace(YAML_NON_PRINTABLE_ALL, (c) => {
      const code = c.charCodeAt(0);
      return code <= 0xff
        ? `\\x${code.toString(16).padStart(2, "0")}`
        : `\\u${code.toString(16)}`;
    });
  return `"${escaped}"`;
}

// A number-like key is safe bare only while YAML reads it back as the same
// text. `2024` is: the parser makes it the integer 2024 and it renders as
// "2024" again. `007`, `+5`, `1_000`, `1e3` and `0x10` are not — they resolve
// to 7, 5, 1000, 1000 and 16, so Obsidian would show a property under a name
// nobody typed; `.inf` and `.nan` come back as "Infinity" and "NaN". Anything
// this flags is quoted by yamlScalar(), which treats every YAML_NUMBER /
// YAML_RADIX / YAML_SPECIAL_FLOAT match as needing quotes.
function yamlRenumbersKey(s) {
  if (YAML_RADIX.test(s) || YAML_SPECIAL_FLOAT.test(s)) return true;
  if (!YAML_NUMBER.test(s)) return false;
  return String(Number(s.replace(/_/g, ""))) !== s;
}

// Mapping keys need the same treatment as scalars, minus the number case for
// names YAML gives back unchanged — a property literally named "2024" is
// unambiguous on the left of a colon. Booleans are not exempt: a property named
// "on" or "no" written bare is read as the key `true` / `false`, so Obsidian
// shows a property that is not the one named.
function yamlKey(name) {
  const s = String(name || "").trim();
  if (s === "") return '""';
  const risky =
    YAML_INDICATORS.includes(s[0]) ||
    s.includes(": ") ||
    s.endsWith(":") ||
    s.includes(" #") ||
    /[\n\r\t]/.test(s) ||
    YAML_NON_PRINTABLE.test(s) ||
    YAML_RESERVED.test(s) ||
    yamlRenumbersKey(s);
  return risky ? yamlScalar(s) : s;
}

// The frontmatter key a property is written under, or null when it contributes
// nothing (a custom property whose name was left blank). Shared by the exporter
// and the settings UI so both agree on which rows collide.
function resolvedKeyFor(item) {
  const name = (item.name || "").trim();
  if (item.kind === "custom") return name ? yamlKey(name) : null;
  return yamlKey(name || defaultNameFor(item.kind));
}

// A record saved while the page could not name the video (an embed before its
// player chrome loads, or an ad hiding the channel) keeps an empty title or
// channel until the next save. Fill the gaps from the page the popup is on now,
// so the preview and the export -- which both build from this -- agree.
function withPageDetails(record) {
  if (!record.title) record.title = (state && state.title) || "";
  if (!record.channel) record.channel = (state && state.channel) || "";
  return record;
}

// Inside [[...]] Obsidian reads `|` as the start of an alias, `#` as a heading
// and `^` as a block reference, and brackets end or nest the link, so a channel
// named "Foo | Bar" would link to a note called "Foo " shown as " Bar". None of
// them can appear in an Obsidian note name anyway, so each run becomes a space.
// Null when nothing is left to link to; the caller then writes the plain name.
function wikiLinkTarget(name) {
  const target = name
    .replace(/[[\]|#^]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return target || null;
}

// The plain-text title is still a Markdown line of its own, so a title that
// opens like a block -- "1. Introduction", "- Live -", "> Quote", "## Part 2"
// -- would render as a list, quote or heading. A backslash before the marker
// keeps it literal text; CommonMark and Obsidian both honour the escape.
function plainTitleLine(title) {
  const ordered = title.match(/^(\d{1,9})([.)])(?=\s|$)/);
  if (ordered) {
    return `${ordered[1]}\\${ordered[2]}${title.slice(ordered[0].length)}`;
  }
  return /^[#>+\-*_~`<]/.test(title) ? `\\${title}` : title;
}

// ---------- rendering ----------

function buildMarkdown(record) {
  const title = record.title || "YouTube video";
  const lines = [];

  const props = settings.properties;
  const items = props.items || [];
  const splitList = (v) =>
    String(v || "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  // A sequence with nothing in it is written as a flow "[]". The block form
  // with a bare "-" would be a one-element list whose element is null, which
  // Obsidian shows as a stray empty tag.
  const pushList = (block, key, values) => {
    if (values.length === 0) {
      block.push(`${key}: []`);
      return;
    }
    block.push(`${key}:`);
    for (const v of values) block.push(`  - ${yamlScalar(v)}`);
  };
  // Obsidian YAML frontmatter properties, emitted in the saved order.
  let linkInFrontmatter = false;
  if (props.enabled) {
    const block = [];
    // A YAML mapping cannot hold the same key twice — a parser keeps only one
    // of them — so the first property to claim a name wins and any later one is
    // dropped. renderProps() flags the dropped rows so this is never silent.
    const claimed = new Set();
    for (const it of items) {
      if (!it.enabled) continue;
      const key = resolvedKeyFor(it);
      if (key === null || claimed.has(key)) continue;
      claimed.add(key);
      if (it.kind === "link") {
        block.push(`${key}: ${yamlScalar(record.url)}`);
        linkInFrontmatter = true;
      } else if (it.kind === "channel") {
        // An unknown channel yields an empty list rather than a list holding
        // one empty string.
        const chan = record.channel || "";
        const target = it.wikilink && chan ? wikiLinkTarget(chan) : null;
        pushList(block, key, chan ? [target ? `[[${target}]]` : chan] : []);
      } else if (it.kind === "tags" || it.type === "list") {
        pushList(block, key, splitList(it.value));
      } else {
        block.push(`${key}: ${yamlScalar(it.value || "")}`);
      }
    }
    if (block.length > 0) {
      lines.push("---", ...block, "---", "");
    }
  }

  // Title, as a heading or plain text.
  lines.push(
    settings.titleAsHeading ? `# ${title}` : plainTitleLine(title),
    ""
  );

  // Plain video URL line — skip it when the Link property already carries it.
  if (!linkInFrontmatter) {
    lines.push(record.url, "");
  }

  const sorted = [...record.entries].sort((a, b) => a.seconds - b.seconds);
  for (const entry of sorted) {
    const link = timestampUrl(record.url, entry.seconds);
    // In Obsidian, escape the brackets so the link text renders as a literal
    // "[07:50]" instead of being read as an internal "[[wiki-link]]".
    const label = settings.obsidian
      ? entry.timestamp.replace(/\[/g, "\\[").replace(/\]/g, "\\]")
      : entry.timestamp;
    // Keep a multi-line note inside its own bullet: continuation lines get a
    // two-space indent so Markdown reads them as part of the same list item
    // instead of breaking out into sibling bullets.
    const noteText = entry.note
      ? ` - ${String(entry.note).replace(/\r\n?/g, "\n").replace(/\n/g, "\n  ")}`
      : "";
    lines.push(`- [${label}](${link})${noteText}`);
  }
  return lines.join("\n") + "\n";
}

async function render() {
  disarmClear(); // never leave the delete button armed across a refresh
  const hasVideo = !!(state && state.ok);
  els.captureBtn.disabled = !hasVideo;

  if (hasVideo) {
    els.videoTitle.textContent = state.title || state.videoId;
  } else if (state && state.reason === "no-video-id") {
    els.videoTitle.textContent = "This is not a YouTube video page.";
  } else {
    els.videoTitle.textContent = "Open a YouTube video…";
  }

  const record = hasVideo ? await getRecord(state.videoId) : null;
  // A null record on a video means the read itself failed, which is not the
  // same thing as a video with no notes yet. Rendering the empty state there
  // tells the user that notes still sitting in storage are gone, and a count of
  // "0" is a number this popup has no business claiming: say what happened
  // instead. Export and Delete all stay disabled either way -- neither can act
  // on a record that could not be read.
  const readFailed = hasVideo && record === null;
  const entries = record ? record.entries : [];

  els.count.textContent = readFailed ? "—" : String(entries.length);
  els.notesList.innerHTML = "";
  els.emptyState.textContent = readFailed
    ? "Could not read the notes — storage error."
    : "No notes saved for this video yet.";
  els.emptyState.classList.toggle("hidden", entries.length > 0);

  const hasEntries = entries.length > 0;
  els.exportBtn.disabled = !hasEntries;
  els.clearBtn.disabled = !hasEntries;

  const sorted = [...entries].sort((a, b) => a.seconds - b.seconds);
  for (const entry of sorted) {
    els.notesList.appendChild(renderEntry(entry));
  }
}

function renderEntry(entry) {
  const li = document.createElement("li");
  li.className = "note-item";

  const head = document.createElement("div");
  head.className = "note-item-head";

  const ts = document.createElement("button");
  ts.className = "note-ts";
  ts.textContent = entry.timestamp;
  ts.title = "Jump to this timestamp in the video";
  ts.addEventListener("click", () => void seekTo(entry.seconds));

  const del = document.createElement("button");
  del.className = "icon-btn";
  del.textContent = "✕";
  del.title = "Delete this note";
  del.setAttribute("aria-label", `Delete the note at ${entry.timestamp}`);
  del.addEventListener("click", () => void deleteEntry(entry.id));

  head.appendChild(ts);
  head.appendChild(del);
  li.appendChild(head);

  if (entry.note) {
    const body = document.createElement("div");
    body.className = "note-body";
    body.textContent = entry.note;
    li.appendChild(body);
  }
  return li;
}

// ---------- actions ----------

// Re-fetch the current video from the content script. Handy when YouTube's
// SPA navigation means the popup didn't pick up the video on its own.
async function reloadVideo() {
  els.reloadBtn.classList.add("spinning");
  els.reloadBtn.disabled = true;
  try {
    await refreshState();
    showToast(state && state.ok ? "Video reloaded" : "No video found");
  } finally {
    els.reloadBtn.disabled = false;
    // Let the spin finish a full turn before stopping it.
    setTimeout(() => els.reloadBtn.classList.remove("spinning"), 400);
  }
}

async function refreshState() {
  const tab = await queryActiveTab();
  if (!tab || !tab.id) {
    state = { ok: false, reason: "no-tab" };
  } else {
    const resp = await getStateFromTab(tab);
    state = resp || { ok: false, reason: "no-content-script" };
  }
  await syncDraftToCurrentVideo();
  await render();
}

// Point the draft panel at whatever video is current now. Without this a
// refresh (⟳, or reopening the popup after an in-page navigation) would leave
// the panel showing the previous video's timestamp and text while saveDraft()
// filed it under the new video.
async function syncDraftToCurrentVideo() {
  const videoId = state && state.ok ? state.videoId : null;
  if (videoId === boundVideoId) return;
  // Flush whatever was typed for the previous video first: the draft stays
  // stored under that video and reopens next time the popup lands on it.
  if (draftSaveTimer !== null) {
    cancelPendingDraftSave();
    await persistDraft();
  }
  draftGeneration += 1;
  draftVideoId = null;
  draftSeconds = null;
  els.draft.classList.add("hidden");
  els.noteInput.value = "";
  boundVideoId = videoId;
  await restoreDraft();
}

async function openDraft() {
  // Always read the *live* playback time at the moment Capture is pressed,
  // not the value cached when the popup first opened.
  const previousVideoId = boundVideoId;
  const tab = await queryActiveTab();
  const fresh = tab && tab.id ? await getStateFromTab(tab) : null;
  if (fresh) state = fresh;
  // That re-read may have landed on a different video than the panel is bound
  // to; rebind before touching the draft.
  await syncDraftToCurrentVideo();
  // The rest of the popup has to follow `state` too. Everything below the
  // header -- the title, the saved notes, ✕, Delete all, Export -- reads the
  // new video from here on, so leaving the old video's notes on screen would
  // offer actions that quietly apply somewhere else: the ✕ on a listed note
  // would delete nothing, and Delete all would do nothing at all.
  const videoChanged = boundVideoId !== previousVideoId;
  if (videoChanged || !state || !state.ok) await render();
  if (!state || !state.ok) return;
  // The panel is already open on this video: it holds the newest text there is,
  // including keystrokes the 300ms debounce has not written out yet. Reading
  // storage here would overwrite them with a staler copy, so leave it alone and
  // just put the cursor back.
  if (draftVideoId === state.videoId) {
    els.noteInput.focus();
    return;
  }
  // If a note is already in progress for this video, reopen it as-is: keep the
  // timestamp captured the first time (don't re-capture the live time) and the
  // text written so far.
  const existing = await getDraft(state.videoId);
  if (existing) {
    draftSeconds = existing.seconds;
    els.noteInput.value = existing.note || "";
  } else if (!fresh) {
    // The re-read failed, so `state` is still the one from when the popup
    // opened. Its currentTime is the stale value the rule above forbids, and
    // its adPlaying flag is just as old: say so instead of using either.
    showToast("Could not read the playback time — try again");
    return;
  } else if (state.adPlaying) {
    // The content script withholds the time during an ad: the only one it has
    // is the ad's, and filing that under the video would be silently wrong.
    showToast("An ad is playing — capture once the video is back");
    return;
  } else if (Number.isFinite(state.currentTime)) {
    draftSeconds = state.currentTime;
    els.noteInput.value = "";
  } else {
    showToast("Playback time not available yet");
    return;
  }
  draftVideoId = state.videoId;
  els.draftTimestamp.textContent = formatTimestamp(draftSeconds);
  els.draft.classList.remove("hidden");
  els.noteInput.focus();
}

// Coalesce the per-keystroke writes.
function schedulePersistDraft() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = setTimeout(() => {
    draftSaveTimer = null;
    void persistDraft();
  }, 300);
}

function cancelPendingDraftSave() {
  clearTimeout(draftSaveTimer);
  draftSaveTimer = null;
}

// Persist the in-progress note so it survives the popup closing. An emptied
// note removes the draft so it won't reopen later.
//
// Everything the write needs is read up front and the write itself is queued,
// so it targets the video the draft was captured on even if `state` has moved
// on, and cannot overtake a remove queued after it. The generation check drops
// the write outright if the draft was saved or discarded while it waited.
async function persistDraft() {
  if (draftVideoId === null || draftSeconds === null) return;
  const videoId = draftVideoId;
  const seconds = draftSeconds;
  const generation = draftGeneration;
  const note = els.noteInput.value;
  await queueDraftWrite(async () => {
    if (generation !== draftGeneration) return;
    if (note.trim() === "") {
      await removeDraft(videoId);
      return;
    }
    await setDraft(videoId, {
      seconds,
      timestamp: formatTimestamp(seconds),
      note,
    });
  });
}

// Write the in-progress note out now, bypassing queueDraftWrite(). For pagehide
// only. A queued write waits on whatever is already in flight, and that earlier
// write's callback fires after the popup document is gone, so the queued one is
// never dispatched and the last keystrokes are lost -- the opposite of what the
// pagehide flush is for. The ordering the queue protects has nothing left to
// protect here: the document is going away, so no further write can be queued,
// and the flush only runs with a pending keystroke timer, which means no close
// or save has happened since the last keystroke.
function flushDraftNow() {
  if (draftVideoId === null || draftSeconds === null) return;
  const note = els.noteInput.value;
  if (note.trim() === "") {
    void removeDraft(draftVideoId);
    return;
  }
  void setDraft(draftVideoId, {
    seconds: draftSeconds,
    timestamp: formatTimestamp(draftSeconds),
    note,
  });
}

// Discard the open draft: clear the panel and drop the stored copy. Bumping the
// generation neutralises any write still waiting, and queueing the removal puts
// it behind any write already in flight, so the draft cannot come back.
async function closeDraft() {
  cancelPendingDraftSave();
  const videoId = draftVideoId;
  draftGeneration += 1;
  draftVideoId = null;
  draftSeconds = null;
  els.draft.classList.add("hidden");
  els.noteInput.value = "";
  if (videoId !== null) await queueDraftWrite(() => removeDraft(videoId));
}

async function saveDraft() {
  // Ctrl+Enter key-repeat and a double-clicked Save both re-enter this before
  // the first pass has closed the draft. The guards below still read the old
  // draft state at that point, so without this the same note is filed twice.
  if (savingDraft) return;
  if (!state || !state.ok || draftSeconds === null) return;
  // Never file a note under a video it wasn't captured on. Say so rather than
  // returning silently, or the click looks like it simply did nothing.
  if (draftVideoId !== state.videoId) {
    showToast("Video changed — press ⟳, then capture again");
    return;
  }
  cancelPendingDraftSave();
  // Read everything the write needs up front, then let the queue serialise the
  // record read-modify-write against any other one already running.
  const videoId = state.videoId;
  const entry = {
    id: uid(),
    seconds: draftSeconds,
    timestamp: formatTimestamp(draftSeconds),
    note: els.noteInput.value.trim(),
    createdAt: new Date().toISOString(),
  };
  const { title, channel, url } = state;
  savingDraft = true;
  try {
    const saved = await queueRecordUpdate(async () => {
      const record = await getRecord(videoId);
      if (!record) return false; // unreadable: writing now would drop the rest
      record.title = title || record.title;
      record.channel = channel || record.channel || "";
      record.url = url || record.url;
      record.entries.push(entry);
      return setRecord(record);
    });
    // Leave the draft open on failure: its text is the only copy of the note
    // that did not reach storage.
    if (!saved) {
      showToast("Could not save the note — storage error");
      return;
    }
    await closeDraft();
  } finally {
    savingDraft = false;
  }
  await render();
  showToast("Note saved");
}

async function deleteEntry(id) {
  if (!state || !state.ok) return;
  const videoId = state.videoId;
  const deleted = await queueRecordUpdate(async () => {
    const record = await getRecord(videoId);
    if (!record) return false;
    record.entries = record.entries.filter((e) => e.id !== id);
    if (record.entries.length === 0) {
      return removeRecord(videoId);
    }
    return setRecord(record);
  });
  await render(); // the note is still listed when the delete did not land
  if (!deleted) showToast("Could not delete the note — storage error");
}

// The list shows the notes of `state.videoId`, but the tab can move on while
// the popup stays open (autoplay, in-page navigation). Name the video so the
// content script refuses to jump a different one, and say why.
async function seekTo(seconds) {
  if (!state || !state.ok) return;
  const tab = await queryActiveTab();
  if (!tab || !tab.id) return;
  const resp = await sendToTab(tab.id, {
    type: "SEEK_TO",
    seconds,
    videoId: state.videoId,
  });
  if (resp && resp.reason === "video-changed") {
    showToast("Video changed — press ⟳ to see its notes");
  } else if (resp && resp.reason === "ad-playing") {
    showToast("An ad is playing — try again once the video is back");
  } else if (resp && resp.reason === "video-loading") {
    showToast("The video is still loading — try again in a moment");
  }
}

async function exportMarkdown() {
  if (!state || !state.ok) return;
  const record = await getRecord(state.videoId);
  if (!record) {
    showToast("Could not read the notes — storage error");
    return;
  }
  if (record.entries.length === 0) return;
  const md = buildMarkdown(withPageDetails(record));
  try {
    await navigator.clipboard.writeText(md);
    showToast("Markdown copied to clipboard");
  } catch (e) {
    // The async clipboard API needs a focused document and can be refused
    // outright by policy. Fall back to a selection-based copy so the export
    // still works where it isn't available.
    showToast(
      copyViaTextarea(md)
        ? "Markdown copied to clipboard"
        : "Could not copy to clipboard"
    );
  }
}

// Copy by selecting the text in an offscreen textarea. Deprecated, but it is
// the only path that works without the async clipboard API.
function copyViaTextarea(text) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.setAttribute("aria-hidden", "true");
  ta.style.position = "fixed";
  ta.style.top = "-1000px";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  try {
    ta.select();
    return document.execCommand("copy");
  } catch (e) {
    return false;
  } finally {
    ta.remove();
  }
}

let clearArmed = false;
let clearArmTimer = null;

// Reset the "Delete all" button back to its normal state.
function disarmClear() {
  clearArmed = false;
  clearTimeout(clearArmTimer);
  els.clearBtn.classList.remove("btn-confirm");
  els.clearBtn.textContent = "Delete all";
}

async function clearAll() {
  if (!state || !state.ok) return;
  const record = await getRecord(state.videoId);
  // A failed read is not an empty record. Returning silently here makes the
  // button look dead on a video that does have notes, and every other action
  // that reads a record before touching it already reports this.
  if (!record) {
    showToast("Could not read the notes — storage error");
    return;
  }
  if (record.entries.length === 0) return;

  // First press arms the button (orange + "CONFIRM DELETE"); a second press
  // within a few seconds actually deletes. It disarms itself on timeout.
  if (!clearArmed) {
    clearArmed = true;
    els.clearBtn.classList.add("btn-confirm");
    els.clearBtn.textContent = "CONFIRM DELETE";
    clearArmTimer = setTimeout(disarmClear, 4000);
    return;
  }

  disarmClear();
  const videoId = state.videoId;
  const cleared = await queueRecordUpdate(() => removeRecord(videoId));
  await closeDraft();
  // "Delete all" means all: drop a stored draft even if the panel was closed.
  await queueDraftWrite(() => removeDraft(videoId));
  await render();
  showToast(cleared ? "All notes deleted" : "Could not delete — storage error");
}

// ---------- settings view ----------

function showView(name) {
  const onSettings = name === "settings";
  // The two views are both <main>, and HTML allows only one <main> without the
  // hidden attribute, so these two are hidden by the attribute, not the class.
  els.settingsView.hidden = !onSettings;
  els.mainView.hidden = onSettings;
  els.mainFooter.classList.toggle("hidden", onSettings);
  els.reloadBtn.classList.toggle("hidden", onSettings);
  els.gearBtn.classList.toggle("hidden", onSettings);
  els.backBtn.classList.toggle("hidden", !onSettings);
  if (onSettings) void updatePreview();
}

// Push the loaded settings into the top-level controls + render the prop rows.
function syncSettingsUI() {
  els.setObsidian.checked = settings.obsidian;
  els.setTitleHeading.checked = settings.titleAsHeading;
  els.setProperties.checked = settings.properties.enabled;
  els.propsOptions.classList.toggle("hidden", !settings.properties.enabled);
  renderProps();
}

// Read the top-level controls back into `settings`, persist, refresh preview.
function onSettingsChanged() {
  settings.obsidian = els.setObsidian.checked;
  settings.titleAsHeading = els.setTitleHeading.checked;
  settings.properties.enabled = els.setProperties.checked;
  els.propsOptions.classList.toggle("hidden", !settings.properties.enabled);
  persistAndPreview();
}

let settingsSaveTimer = null;

// The property name and value fields fire on every keystroke. Coalesce the
// storage write and the preview rebuild the way draft notes are coalesced,
// rather than doing both once per character. Duplicate markers are pure DOM
// work and update immediately, so they never lag behind what is typed.
function persistAndPreview() {
  markDuplicateProps();
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = setTimeout(() => {
    settingsSaveTimer = null;
    void saveSettings();
    void updatePreview();
  }, 250);
}

// Write a coalesced settings change out now instead of on the timer: used when
// leaving the settings view, and when the popup is dismissed mid-keystroke.
function flushSettings() {
  if (settingsSaveTimer === null) return Promise.resolve();
  clearTimeout(settingsSaveTimer);
  settingsSaveTimer = null;
  return saveSettings();
}

// ----- property rows (unified, drag-reorderable) -----

let dragId = null; // id of the item currently being dragged

// Rows are only draggable while their handle is held, so the text inputs inside
// them stay normally selectable. Disarming every row on any release is what
// makes that safe: a press that ends outside the row it started on would
// otherwise leave that row armed, and the next text selection inside its inputs
// would drag the whole row instead of selecting. Bound once, in the wiring
// section, rather than per row -- renderProps() rebuilds the rows often.
function disarmRowDragging() {
  for (const el of els.propsList.querySelectorAll(".prop-item")) {
    el.draggable = false;
  }
}

// Rebuild every property row. Called on add / delete / reorder — while typing
// we mutate the model in place so the inputs keep focus.
function renderProps() {
  els.propsList.innerHTML = "";
  for (const item of settings.properties.items) {
    els.propsList.appendChild(buildPropRow(item));
  }
  markDuplicateProps();
}

// Flag every row whose frontmatter key an earlier row already claimed.
// buildMarkdown() drops those rows, and silently omitting a property the user
// deliberately configured is worse than saying so.
function markDuplicateProps() {
  const rows = new Map();
  for (const row of els.propsList.querySelectorAll(".prop-item")) {
    rows.set(row.dataset.id, row);
  }
  const claimed = new Set();
  for (const item of settings.properties.items) {
    const key = item.enabled ? resolvedKeyFor(item) : null;
    const dupe = key !== null && claimed.has(key);
    if (key !== null) claimed.add(key);
    const row = rows.get(item.id);
    if (!row) continue;
    row.classList.toggle("prop-dupe", dupe);
    row.title = dupe
      ? `An earlier property already uses the name ${key}, so this one is left out of the export.`
      : "";
  }
}

const KIND_LABEL = {
  link: "text · video URL",
  channel: "list · channel",
  tags: "tags",
};

function buildPropRow(item) {
  const card = document.createElement("div");
  card.className = "prop-item";
  card.dataset.id = item.id;

  const main = document.createElement("div");
  main.className = "prop-main";

  // Drag handle — makes the card draggable only while grabbed here, so the
  // inputs stay normally selectable.
  const handle = document.createElement("span");
  handle.className = "drag-handle";
  handle.textContent = "⠿";
  handle.title = "Drag to reorder, or focus and press Alt+↑ / Alt+↓";
  handle.tabIndex = 0;
  handle.setAttribute("role", "button");
  handle.setAttribute("aria-label", reorderLabel(item));
  handle.addEventListener("mousedown", () => (card.draggable = true));
  // Dragging is pointer-only, so the same reorder is offered from the keyboard.
  handle.addEventListener("keydown", (e) => {
    if (!e.altKey) return;
    const delta = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
    if (delta === 0) return;
    e.preventDefault();
    if (moveItem(item.id, delta)) focusHandleFor(item.id);
  });
  card.addEventListener("dragend", () => {
    card.draggable = false;
    card.classList.remove("dragging");
    clearDropMarkers();
    dragId = null; // a drag cancelled outside the list ends here, not in onRowDrop
  });
  card.addEventListener("dragstart", (e) => {
    // A text selection dragged out of one of the row's inputs fires dragstart
    // on that input and bubbles here. Taking it as a row drag would reorder
    // the properties on drop and swallow the text, so leave it to the browser.
    if (e.target !== card) return;
    dragId = item.id;
    card.classList.add("dragging");
    e.dataTransfer.effectAllowed = "move";
    try {
      e.dataTransfer.setData("text/plain", item.id);
    } catch (err) {
      // Some browsers reject setData outside a genuine user drag. The reorder
      // reads `dragId` rather than the payload, so there is nothing to recover.
    }
  });
  card.addEventListener("dragover", (e) => onRowDragOver(e, card));
  card.addEventListener("drop", (e) => onRowDrop(e, item.id));

  // Enabled checkbox.
  const enabled = document.createElement("input");
  enabled.type = "checkbox";
  enabled.checked = item.enabled;
  enabled.title = "Include this property";
  enabled.setAttribute("aria-label", "Include this property");
  enabled.addEventListener("change", () => {
    item.enabled = enabled.checked;
    persistAndPreview();
  });

  // Name field.
  const name = document.createElement("input");
  name.type = "text";
  name.className = "prop-name";
  name.spellcheck = false;
  name.placeholder = item.kind === "custom" ? "Property name" : "Name";
  name.setAttribute("aria-label", "Property name");
  name.value = item.name;
  name.addEventListener("input", () => {
    item.name = name.value;
    handle.setAttribute("aria-label", reorderLabel(item));
    persistAndPreview();
  });

  main.append(handle, enabled, name);

  // Kind-specific trailing control.
  if (item.kind === "custom") {
    const type = document.createElement("select");
    type.className = "prop-type-select";
    type.setAttribute("aria-label", "Property type");
    for (const t of ["text", "list"]) {
      const opt = document.createElement("option");
      opt.value = t;
      opt.textContent = t;
      type.appendChild(opt);
    }
    type.value = item.type;
    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn";
    del.textContent = "✕";
    del.title = "Remove property";
    del.setAttribute("aria-label", "Remove property");
    del.addEventListener("click", () => {
      settings.properties.items = settings.properties.items.filter(
        (p) => p.id !== item.id
      );
      renderProps();
      persistAndPreview();
    });
    main.append(type, del);
    card.appendChild(main);

    // Value field for custom.
    const value = document.createElement("input");
    value.type = "text";
    value.className = "prop-value prop-inset";
    value.spellcheck = false;
    value.placeholder =
      item.type === "list" ? "Values (comma-separated)" : "Value";
    value.setAttribute("aria-label", "Property value");
    value.value = item.value;
    value.addEventListener("input", () => {
      item.value = value.value;
      persistAndPreview();
    });
    type.addEventListener("change", () => {
      item.type = type.value;
      value.placeholder =
        item.type === "list" ? "Values (comma-separated)" : "Value";
      persistAndPreview();
    });
    card.appendChild(value);
  } else {
    const label = document.createElement("span");
    label.className = "prop-type";
    label.textContent = KIND_LABEL[item.kind] || "";
    main.append(label);
    card.appendChild(main);

    // Channel gets a wiki-link sub-checkbox.
    if (item.kind === "channel") {
      const sub = document.createElement("label");
      sub.className = "prop-sub";
      const wiki = document.createElement("input");
      wiki.type = "checkbox";
      wiki.checked = !!item.wikilink;
      wiki.addEventListener("change", () => {
        item.wikilink = wiki.checked;
        persistAndPreview();
      });
      const span = document.createElement("span");
      const codeEl = document.createElement("code");
      codeEl.textContent = "[[wiki-link]]";
      span.append("Format as ", codeEl);
      sub.append(wiki, span);
      card.appendChild(sub);
    }

    // Tags gets a value field for the (typed) tag list.
    if (item.kind === "tags") {
      const value = document.createElement("input");
      value.type = "text";
      value.className = "prop-value prop-inset";
      value.spellcheck = false;
      value.placeholder = "Tags (comma-separated)";
      value.setAttribute("aria-label", "Tags");
      value.value = item.value || "";
      value.addEventListener("input", () => {
        item.value = value.value;
        persistAndPreview();
      });
      card.appendChild(value);
    }
  }

  return card;
}

function reorderLabel(item) {
  return `Reorder ${item.name || "property"}: press Alt plus the up or down arrow`;
}

// Move one property up or down the list. Returns false at the ends, so the
// caller can tell a no-op from a real move.
function moveItem(id, delta) {
  const items = settings.properties.items;
  const from = items.findIndex((i) => i.id === id);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= items.length) return false;
  const [moved] = items.splice(from, 1);
  items.splice(to, 0, moved);
  renderProps();
  persistAndPreview();
  return true;
}

// renderProps() rebuilds every row, so the handle that was focused is gone.
// Put focus back on the row that moved, or the arrow keys stop working after
// the first press.
function focusHandleFor(id) {
  const row = els.propsList.querySelector(
    `.prop-item[data-id="${CSS.escape(id)}"]`
  );
  const handle = row && row.querySelector(".drag-handle");
  if (handle) handle.focus();
}

function clearDropMarkers() {
  for (const el of els.propsList.querySelectorAll(".prop-item")) {
    el.classList.remove("drop-before", "drop-after");
  }
}

function onRowDragOver(e, card) {
  if (dragId === null || card.dataset.id === dragId) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  const rect = card.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height / 2;
  clearDropMarkers();
  card.classList.add(after ? "drop-after" : "drop-before");
}

function onRowDrop(e, targetId) {
  // Not a row drag (text dropped into an input): let the browser insert it.
  if (dragId === null) return;
  e.preventDefault();
  clearDropMarkers();
  const items = settings.properties.items;
  if (dragId === targetId) {
    dragId = null;
    return;
  }
  const from = items.findIndex((i) => i.id === dragId);
  if (from < 0) {
    dragId = null;
    return;
  }
  const rect = e.currentTarget.getBoundingClientRect();
  const after = e.clientY > rect.top + rect.height / 2;
  const [moved] = items.splice(from, 1);
  let insertAt = items.findIndex((i) => i.id === targetId);
  if (after) insertAt += 1;
  items.splice(insertAt, 0, moved);
  dragId = null;
  renderProps();
  persistAndPreview();
}

function addCustomProp() {
  settings.properties.items.push({
    id: uid(),
    kind: "custom",
    enabled: true,
    name: "",
    type: "text",
    value: "",
  });
  renderProps();
  persistAndPreview();
}

// Live example of what "Export & copy" will produce with current settings.
async function updatePreview() {
  let record = null;
  let readFailed = false;
  if (state && state.ok) {
    record = await getRecord(state.videoId); // null if that read failed
    readFailed = record === null;
    if (record) withPageDetails(record);
  }
  // Falling through to the sample below would show example notes for a video
  // whose real notes could not be read -- the same claim render() stopped
  // making. Say what happened instead, in render()'s words.
  if (readFailed) {
    els.preview.textContent = "Could not read the notes — storage error.";
    return;
  }
  if (!record || record.entries.length === 0) {
    record = {
      videoId: "dQw4w9WgXcQ",
      title: (record && record.title) || "Example video title",
      channel: (record && record.channel) || "Example Channel",
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      entries: [
        { seconds: 42, timestamp: "[00:42]", note: "the intro" },
        { seconds: 195, timestamp: "[03:15]", note: "key point" },
      ],
    };
  }
  els.preview.textContent = buildMarkdown(record);
}

// ---------- wiring ----------

// Reopen a saved in-progress note when the popup opens, so a half-written note
// (and its captured timestamp) is exactly where the user left it.
async function restoreDraft() {
  if (!state || !state.ok) return;
  const d = await getDraft(state.videoId);
  if (!d) return;
  draftVideoId = state.videoId;
  draftSeconds = d.seconds;
  els.draftTimestamp.textContent = d.timestamp || formatTimestamp(d.seconds);
  els.noteInput.value = d.note || "";
  els.draft.classList.remove("hidden");
}

els.captureBtn.addEventListener("click", () => void openDraft());
els.cancelDraftBtn.addEventListener("click", () => void closeDraft());
els.saveBtn.addEventListener("click", () => void saveDraft());
els.noteInput.addEventListener("input", schedulePersistDraft);
els.exportBtn.addEventListener("click", () => void exportMarkdown());
els.clearBtn.addEventListener("click", () => void clearAll());

els.reloadBtn.addEventListener("click", () => void reloadVideo());
els.gearBtn.addEventListener("click", () => showView("settings"));
els.backBtn.addEventListener("click", () => {
  void flushSettings(); // don't let a coalesced write wait on the timer
  showView("main");
});

[els.setObsidian, els.setTitleHeading, els.setProperties].forEach((el) =>
  el.addEventListener("change", onSettingsChanged)
);

els.addPropBtn.addEventListener("click", addCustomProp);
document.addEventListener("mouseup", disarmRowDragging);

// Ctrl/Cmd+Enter saves the draft quickly.
els.noteInput.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
    e.preventDefault();
    void saveDraft();
  }
});

// The popup can be dismissed mid-keystroke. Get any coalesced write out before
// the document goes away: both calls below reach chrome.storage synchronously,
// so they are dispatched even though this document does not survive to see them
// resolve. Neither may be queued behind another write -- see flushDraftNow().
window.addEventListener("pagehide", () => {
  if (draftSaveTimer !== null) {
    cancelPendingDraftSave();
    flushDraftNow();
  }
  void flushSettings();
});

async function init() {
  await loadSettings();
  syncSettingsUI();
  await refreshState(); // also binds the draft panel to the current video
}

void init();
