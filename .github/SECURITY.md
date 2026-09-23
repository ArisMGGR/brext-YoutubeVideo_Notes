# Security policy

## Supported versions

This is a small extension with no release branches. Only the latest version on
`main` is supported.

## Reporting a vulnerability

Please report security issues privately through GitHub's
[private vulnerability reporting](https://github.com/ArisMGGR/brext-YoutubeVideo_Notes/security/advisories/new)
rather than opening a public issue.

Expect an acknowledgement within a couple of weeks. This is a spare-time
project, so there is no formal response-time commitment.

## Scope

The extension runs entirely in the browser: it stores notes in
`chrome.storage.local`, requests one host permission
(`https://www.youtube.com/*`), and makes no network requests of its own. There
is no server and no account.

Findings that are in scope include anything that would let a page read or
modify stored notes, widen where the content script is injected, or get the
popup to execute page-controlled content. Reports that YouTube itself can see
your activity on YouTube are not in scope.
