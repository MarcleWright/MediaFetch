# Video DownloadHelper Technical Reference

Status: Reference

Scope:

- inspected the locally installed Chrome extension `lmjnegcaeklhafolokijcfjliaokphfk`
- recorded the implementation paths that explain why Video DownloadHelper can download video more reliably than the current project plugin
- this is a technical reference only, not an implementation task

Extension identity:

- name: `Video DownloadHelper`
- Chrome extension id: `lmjnegcaeklhafolokijcfjliaokphfk`
- inspected local version: `10.2.71.2`

Inspected local paths:

- `C:/Users/Freshman/AppData/Local/Google/Chrome/User Data/Default/Extensions/lmjnegcaeklhafolokijcfjliaokphfk/10.2.71.2_0/manifest.json`
- `C:/Users/Freshman/AppData/Local/Google/Chrome/User Data/Default/Extensions/lmjnegcaeklhafolokijcfjliaokphfk/10.2.71.2_0/service/main.js`
- `C:/Users/Freshman/AppData/Local/Google/Chrome/User Data/Default/Extensions/lmjnegcaeklhafolokijcfjliaokphfk/10.2.71.2_0/download_worker/main.js`

Observed architecture:

1. Manifest-level capability

- `host_permissions` includes `<all_urls>`
- permissions include:
  - `tabs`
  - `offscreen`
  - `downloads`
  - `webRequest`
  - `webNavigation`
  - `scripting`
  - `declarativeNetRequest`
  - `storage`
  - `notifications`
  - `contextMenus`
  - `unlimitedStorage`
- the extension also ships many domain-specific content script entries

2. Background orchestration

- `service/main.js` is the background service worker entry
- the service worker launches a dedicated download worker
- download execution is not limited to `chrome.downloads.download(url)`

3. Download worker pipeline

- `download_worker/main.js` contains a large media-processing pipeline
- it includes LibAV / ffmpeg-style processing through browser-side worker code and WASM assets
- the worker supports multiple strategy families instead of a single direct-download path

Observed strategy types in `download_worker/main.js`:

- `m3u8_audio_only`
- `m3u8_audio_video_one_source`
- `m3u8_audio_video_two_sources`
- `youtube_audio_only`
- `youtube_audio_video_one_source`
- `youtube_audio_video_two_sources`
- `http_audio_video_one_source`
- `http_audio_video_two_sources_jsfetch`
- `http_audio_video_one_source_jsfetch`
- `http_strip_audio_jsfetch`
- `http_video_preview_jsfetch`
- `mpd_audio_only`
- `mpd_audio_video_one_source`
- `mpd_video_preview`

What this implies:

- the extension supports segmented streaming, not just single-file MP4
- it can download separate audio and video tracks
- it can fetch via JavaScript rather than relying only on browser direct download
- it can merge or transform streams after retrieval

Important conclusion:

- Video DownloadHelper stability does not come from a small header tweak alone
- it appears to rely on:
  - domain-aware extraction
  - request observation / page integration
  - worker-based download execution
  - JS fetch strategies
  - LibAV/WASM post-processing

What was not observed in this pass:

- no confirmed reliance on `nativeMessaging` was identified in the inspected extension manifest or the main implementation paths reviewed here
- this reference does not claim the extension never uses external helpers in other distributions or optional flows; it only records what was observed in the inspected local Chrome extension package

Relevance to this project:

- the current project plugin is still much lighter than Video DownloadHelper
- for domains such as `xinpianchang.com` and `weibo.com`, a stable downloader may require:
  - domain-specific video extraction
  - domain-specific download strategy
  - page-context-aware fetch behavior
- for platforms such as `youtube.com` or segmented-stream sites, the current project architecture is not yet equivalent to Video DownloadHelper

Recommended follow-up use of this reference:

- use this document as a baseline when deciding whether a failed domain should be solved by:
  - a light domain download rule
  - a heavier page-context fetch pipeline
  - a future worker-based media pipeline
