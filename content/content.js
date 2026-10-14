// Content script injected into YouTube pages.
// It answers requests from the popup for the current video's
// id, title, URL and the exact playback time of the <video> element.

// YouTube keeps every page type it has built in the DOM and only hides the
// ones not on screen: a Shorts page always carries a hidden watch page, with
// its own #movie_player and -- after a watch page was visited -- that video's
// title and channel. A document-wide querySelector finds those first, so every
// lookup here skips anything inside a [hidden] page.
function isShown(el) {
  return !el.closest("[hidden]");
}

function queryShown(selector) {
  for (const el of document.querySelectorAll(selector)) {
    if (isShown(el)) return el;
  }
  return null;
}

function isShortsPage() {
  return /^\/shorts\//.test(window.location.pathname);
}

function getVideoElement() {
  // The player showing the video getVideoId() named. Picking by "whichever
  // <video> happens to be playing" is not enough on pages that hold more than
  // one: a hover-preview in the watch page sidebar plays while the main video
  // is paused, and would report its own currentTime under the current id. The
  // page type decides which player is asked first; queryShown() keeps the
  // hidden one of the pair from answering.
  //
  // The list lives inside the function for the same reason getChannel()'s does:
  // a top-level const breaks re-injection (see the note above getChannel).
  const scopes = isShortsPage()
    ? ["#shorts-player video", "#movie_player video"]
    : ["#movie_player video", "#shorts-player video"]; // watch and /embed/<id>
  scopes.push("video.html5-main-video");
  for (const selector of scopes) {
    const el = queryShown(selector);
    if (el) return el;
  }
  // Nothing identified itself as the main player. Fall back to whichever
  // visible <video> is playing, then to the first visible one.
  const videos = Array.from(document.querySelectorAll("video")).filter(isShown);
  if (videos.length === 0) return null;
  const playing = videos.find((v) => !v.paused && v.currentTime > 0);
  return playing || videos[0];
}

// An ad plays in the same <video> element as the video, so while one is on
// screen currentTime is the ad's position, not the video's. YouTube marks its
// player with "ad-showing" for the length of the ad.
function isAdShowing(video) {
  const player = video && video.closest(".html5-video-player");
  return !!player && player.classList.contains("ad-showing");
}

function getVideoId() {
  try {
    const url = new URL(window.location.href);
    // Standard watch URL: youtube.com/watch?v=ID
    const v = url.searchParams.get("v");
    if (v) return v;
    // Shorts: youtube.com/shorts/ID
    const shortsMatch = url.pathname.match(/^\/shorts\/([^/]+)/);
    if (shortsMatch) return shortsMatch[1];
    // Live streams and their replays: youtube.com/live/ID. The address keeps
    // this form -- it is not redirected to /watch -- while the page is a full
    // watch page with the usual player.
    const liveMatch = url.pathname.match(/^\/live\/([^/]+)/);
    if (liveMatch) return liveMatch[1];
    // Embed: youtube.com/embed/ID
    // /embed/videoseries?list=<playlist> is the playlist embed: that segment is
    // a literal, not a video id, and the id of whatever the playlist is playing
    // appears nowhere in the URL. Accepting it files every note from every
    // playlist under the one "videoseries" record and exports links to
    // watch?v=videoseries, which is not a video. Better no id: the popup then
    // says this is not a video page instead of quietly mixing the notes.
    const embedMatch = url.pathname.match(/^\/embed\/([^/]+)/);
    if (embedMatch && embedMatch[1] !== "videoseries") return embedMatch[1];
    // Clips: youtube.com/clip/<clipId>. The address names the clip, not a
    // video, and keeps that form while an ordinary watch page plays a stretch
    // of the source video. currentTime there is the source video's own, so the
    // notes and their &t= links belong under the source video's id, which the
    // shown watch page carries.
    if (/^\/clip\//.test(url.pathname)) {
      const watch = queryShown("ytd-watch-flexy[video-id]");
      const clipVideoId = watch && watch.getAttribute("video-id");
      if (clipVideoId) return clipVideoId;
    }
  } catch (e) {
    /* ignore */
  }
  return null;
}

function getVideoTitle() {
  // Prefer the on-page title element, fall back to the document title.
  // On Shorts these match only the hidden watch page, so queryShown() skips
  // them and the document title answers instead.
  const el =
    queryShown("h1.ytd-watch-metadata yt-formatted-string") ||
    queryShown("h1.title yt-formatted-string") ||
    queryShown("h1.ytd-watch-metadata");
  if (el && el.textContent && el.textContent.trim()) {
    return el.textContent.trim();
  }
  // Next, the player's own title bar: on Shorts it is the only element that
  // names the video, and on /embed/<id> the only place at all. It follows
  // whatever the player is showing, including a pre-roll ad -- on a watch page
  // it reads the ad's title with an empty href. Accept it only while its link
  // still points at the video we identified.
  const videoId = getVideoId();
  const playerTitle = queryShown("a.ytp-title-link");
  if (
    videoId &&
    playerTitle &&
    playerTitle.textContent.trim() &&
    (playerTitle.getAttribute("href") || "").includes(videoId)
  ) {
    return playerTitle.textContent.trim();
  }
  // Last, the document title. It carries YouTube's unread-notification count
  // as a "(3) " prefix, which would otherwise end up in the exported note
  // title. The strip cannot tell that prefix from a title that itself opens
  // with "(2024)", which is why the title bar above is asked first.
  const fromDocument = document.title
    .replace(/^\(\d+\)\s*/, "")
    .replace(/\s*-\s*YouTube\s*$/, "")
    .trim();
  // On /embed/<id> the document title is the bare word "YouTube": the suffix
  // strip above needs a preceding "-", so it survives and would be exported as
  // the note's heading. Better no title than a placeholder: every caller
  // already falls back on the video id or "YouTube video".
  return fromDocument !== "YouTube" ? fromDocument : "";
}

// Selectors are tried in order and the first one yielding non-empty text wins.
// Matching on existence alone is not enough: the owner element is in the DOM
// before YouTube fills it in, so an early read would settle on a hydrating
// element and return "" while a later selector would have worked.
//
// The list lives inside the function on purpose. This file is re-injected into
// tabs that already ran it, and a top-level `const` would throw "Identifier has
// already been declared" the second time -- which is why everything at this
// file's top level is a function declaration.
function getChannel() {
  // The microdata block (#watch7-content) is rendered once with the page and
  // never updated by in-page navigation, so it names whatever video the tab
  // first loaded. Offer it only while its identifier is still this video.
  const microdataId = queryShown('#watch7-content meta[itemprop="identifier"]');
  const microdataCurrent =
    !!microdataId && microdataId.getAttribute("content") === getVideoId();
  const selectors = [
    "ytd-video-owner-renderer ytd-channel-name a",
    "#owner #channel-name a",
    "ytd-channel-name#channel-name a",
    // Never on Shorts. A Short loaded directly carries current microdata too,
    // but it names the display name, while the reel below gives the @handle --
    // and the reel's channel bar is still empty for about two seconds after
    // such a load. Offering the microdata there would file one channel as
    // "Name" or "@handle" depending on how the Short was reached or how soon
    // the popup opened. An empty answer is filled in by a later save or by
    // the export instead.
    ...(microdataCurrent && !isShortsPage()
      ? ['span[itemprop="author"] link[itemprop="name"]']
      : []),
    // Shorts names the owner by @handle in the channel bar of the reel that
    // holds the player; scoping to that reel keeps a neighbouring one out.
    'ytd-reel-video-renderer:has(#shorts-player) yt-reel-channel-bar-view-model a[href^="/@"]',
    // /embed/<id> has no ytd-* elements and no microdata at all -- the player's
    // title bar is the only place it names the channel. It is last because on a
    // watch page the element exists but is empty, and an empty match is skipped.
    // During an ad the title bar names the advertiser, so it is not asked then --
    // the same reason getVideoTitle() checks the title bar's href.
    ...(isAdShowing(getVideoElement()) ? [] : [".ytp-title-channel-name"]),
  ];
  for (const selector of selectors) {
    const el = queryShown(selector);
    if (!el) continue;
    // The microdata fallback is a <link>, which carries its value in the
    // content attribute rather than as text.
    const text = el.textContent || el.getAttribute("content") || "";
    if (text.trim()) return text.trim();
  }
  return "";
}

// After an in-page move from one watch video to another, the address names the
// new video at once, but the shown watch page keeps the previous video's h1,
// owner and document title for a couple of seconds while it re-renders (about
// 2.4 s live). ytd-watch-flexy's video-id attribute moves with that content,
// not with the address, so while it names another video everything read off
// the page belongs to that video. Shorts and embeds have no shown flexy.
function isWatchPageBehind(videoId) {
  const watch = queryShown("ytd-watch-flexy[video-id]");
  return !!watch && watch.getAttribute("video-id") !== videoId;
}

function getState() {
  const video = getVideoElement();
  const videoId = getVideoId();
  if (!videoId) {
    return { ok: false, reason: "no-video-id" };
  }
  if (!video) {
    return { ok: false, reason: "no-video-element", videoId };
  }
  // The page is still this video during an ad, so the popup keeps working; only
  // the playback time is withheld, since the one available belongs to the ad.
  const adPlaying = isAdShowing(video);
  // An empty title and channel are the lesser wrong while the page lags: a save
  // keeps a record's existing values over "", and the export fills empty ones
  // from the page once it has caught up. The player lags with them -- it still
  // holds the previous video's position -- so the time is withheld too, the
  // same way it is during an ad.
  const behind = isWatchPageBehind(videoId);
  return {
    ok: true,
    videoId,
    currentTime: adPlaying || behind ? null : video.currentTime,
    adPlaying,
    title: behind ? "" : getVideoTitle(),
    channel: behind ? "" : getChannel(),
    url: `https://www.youtube.com/watch?v=${videoId}`,
  };
}

// `videoId` is the video the popup listed the note under. The tab may have
// moved on since (autoplay, in-page navigation) while the popup stayed open;
// seeking then would jump a different video to a moment in the listed one.
function seekTo(seconds, videoId) {
  const currentId = getVideoId();
  if (videoId && videoId !== currentId) {
    return { ok: false, reason: "video-changed" };
  }
  // Right after an in-page move the player can still hold the previous video,
  // which is why getState() withholds the time then. Seeking now would move
  // that video, or be lost when the new one loads.
  if (currentId && isWatchPageBehind(currentId)) {
    return { ok: false, reason: "video-loading" };
  }
  const video = getVideoElement();
  if (!video) return { ok: false };
  // Setting currentTime now would move through the ad, not the video.
  if (isAdShowing(video)) return { ok: false, reason: "ad-playing" };
  try {
    video.currentTime = seconds;
    return { ok: true };
  } catch (e) {
    return { ok: false };
  }
}

// The popup re-injects this file when a tab doesn't answer. Two cases have to
// work, and a plain "already loaded" boolean only handles the first:
//
//   1. The original listener is still live (the tab just hadn't been asked
//      yet). Adding a second listener would leave both replying to the same
//      message, so the previous one is removed first.
//   2. The extension was reloaded or updated while the tab stayed open. The
//      isolated world and its globals survive that, but the old listener's
//      extension context is invalidated and it can no longer answer. Bailing
//      out on a leftover flag here would leave the tab permanently mute --
//      which is the very case re-injection exists to repair -- so the stale
//      handle is discarded (removeListener throws on the dead context) and a
//      working listener installed in its place.
function onMessage(message, sender, sendResponse) {
  if (!message || typeof message.type !== "string") return;
  if (message.type === "GET_STATE") {
    sendResponse(getState());
    return; // synchronous response
  }
  if (message.type === "SEEK_TO") {
    sendResponse(seekTo(message.seconds, message.videoId));
    return;
  }
}

if (window.__ytTimestampNotesListener) {
  try {
    chrome.runtime.onMessage.removeListener(window.__ytTimestampNotesListener);
  } catch (e) {
    // Orphaned context: there is nothing left to remove.
  }
}
window.__ytTimestampNotesListener = onMessage;
chrome.runtime.onMessage.addListener(onMessage);
