# Eagle for Chrome MP4 Technical Reference

Status: Reference

Scope:

- inspected the locally installed Chrome extension `lieogkinebikhdchceieedcigeafdkid`
- focused on how Eagle for Chrome handles MP4 or other remote media before handing the result to the Eagle desktop app
- this is a technical reference only, not an implementation task

Extension identity:

- name: `Eagle for Chrome`
- Chrome extension id: `lieogkinebikhdchceieedcigeafdkid`
- inspected local version: `3.1.23`

Inspected local paths:

- `C:/Users/Freshman/AppData/Local/Google/Chrome/User Data/Default/Extensions/lieogkinebikhdchceieedcigeafdkid/3.1.23_0/manifest.json`
- `C:/Users/Freshman/AppData/Local/Google/Chrome/User Data/Default/Extensions/lieogkinebikhdchceieedcigeafdkid/3.1.23_0/js/background-v3.js`
- `C:/Users/Freshman/AppData/Local/Google/Chrome/User Data/Default/Extensions/lieogkinebikhdchceieedcigeafdkid/3.1.23_0/js/lib/api/item.js`
- `C:/Users/Freshman/AppData/Local/Google/Chrome/User Data/Default/Extensions/lieogkinebikhdchceieedcigeafdkid/3.1.23_0/js/lib/api/downloader.js`
- `C:/Users/Freshman/AppData/Local/Google/Chrome/User Data/Default/Extensions/lieogkinebikhdchceieedcigeafdkid/3.1.23_0/js/lib/api/bypass-downloader.js`
- `C:/Users/Freshman/AppData/Local/Google/Chrome/User Data/Default/Extensions/lieogkinebikhdchceieedcigeafdkid/3.1.23_0/js/lib/api/fetch.js`
- `C:/Users/Freshman/AppData/Local/Google/Chrome/User Data/Default/Extensions/lieogkinebikhdchceieedcigeafdkid/3.1.23_0/eagle-opener/app.js`

Observed architecture:

1. Extension role

- the extension injects broad page collectors and many site plugins
- it can mark video elements as collectable and gather structured metadata
- it does not present itself as a browser-only final downloader in the way Video DownloadHelper does

2. Desktop-app integration

- Eagle for Chrome clearly expects a local Eagle desktop app to be present
- observed local endpoints:
  - `http://localhost:41593`
  - `http://localhost:41595/api/item/addFromURL`
  - `http://localhost:41595/api/preferences/collect/on`
  - `http://localhost:41595/api/preferences/collect/off`
- observed app opener path:
  - `eagle://open`

3. MP4 / remote media save path

The most important implementation path is in `js/lib/api/item.js`.

When `downloadViaBrowser` is enabled and the source starts with `http`, Eagle does not directly pass the original remote URL to a browser download dialog first.

Instead it:

1. calls `eagle.downloader.download(...)`
2. lets the downloader retrieve the remote resource
3. converts the downloaded result into a base64 data URL
4. posts that data URL to the local Eagle desktop API:
   - `http://localhost:41595/api/item/addFromURL`

Observed behavior in `item.js`:

- on successful browser-side retrieval:
  - if the result contains `image` or `video`, the extension builds a payload where `url` is actually a base64 data URL
  - then it submits that payload to the local Eagle app API
- on failure:
  - it falls back to the older local endpoint at `http://localhost:41593`

Observed downloader behavior:

- `js/lib/api/downloader.js` implements a browser-side downloader
- it first tries an iframe-based retrieval path
- if that does not work, it falls back to a `fetch(...)` path
- when successful, it converts the downloaded blob into a data URL via `FileReader`
- the completion payload delivered upstream is not a saved file path; it is base64 media content

Observed bypass path:

- `js/lib/api/bypass-downloader.js` creates an iframe and fetches `location.href` from inside that iframe
- when successful, it converts the response into a blob URL
- this looks like a browser-context bypass helper for tricky asset access, especially images

What this implies:

- Eagle for Chrome is not solving MP4 persistence by building a heavy in-browser media pipeline
- instead, it solves the persistence problem by:
  - collecting the remote media in browser context
  - converting it to base64
  - sending that media payload to the local Eagle desktop application

Important contrast with Video DownloadHelper:

- Video DownloadHelper is browser-heavy:
  - worker pipeline
  - JS fetch strategies
  - segmented stream handling
  - LibAV/WASM muxing
- Eagle is app-assisted:
  - browser collection
  - base64 conversion
  - local desktop app ingestion via localhost APIs

What was not observed in this pass:

- no evidence in the inspected paths that Eagle for Chrome performs a DownloadHelper-style in-browser HLS/DASH mux pipeline
- no evidence in the inspected paths that its MP4 persistence depends on native messaging; the dominant observed handoff is local HTTP plus the custom `eagle://open` protocol

Relevance to this project:

- Eagle's approach is closer to:
  - "browser extracts media, local app stores it"
- Video DownloadHelper's approach is closer to:
  - "browser extension itself owns the download and media assembly pipeline"

Initial implementation conclusion for this project:

- if this project is willing to depend on a local helper or desktop app, Eagle's approach is easier to reproduce than Video DownloadHelper
- if this project must remain a standalone browser-only downloader that saves playable media files directly to disk, Video DownloadHelper is the more relevant model, but it is much heavier and much harder to replicate

Practical comparison:

- easier path:
  - Eagle-style local helper / localhost API handoff
- harder path:
  - Video DownloadHelper-style browser-only heavy media pipeline

