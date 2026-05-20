# MediaFetch Chrome Plugin

This folder contains a Chrome extension prototype for MediaFetch.

## What it does

- Reads images from the current active tab
- Uses your logged-in browser session
- Auto-detects a project name and fills `Folder Name`
- Lets you click to select images
- Supports `Select All`, `Clear`, `Select Original`, and `Download`
- Downloads into your default Chrome downloads folder under `Folder Name/`
- Private builds can also import the downloaded folder into Image Dataset Lineage Manager through its local API.

## Why this version exists

Sites like Weibo and Instagram often require:

- Logged-in browser state
- Cookies and local storage
- Client-side rendering

The plugin runs inside your real Chrome session, so it is a better fit for those sites than the local web app.

## Load it in Chrome

1. Open `chrome://extensions`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Choose this `chrome-plugin` folder

## Notes

- This version does not use a custom local file path. It downloads into Chrome's default downloads location.
- The folder name is still auto-detected from the current page and can be edited before download.
- The current prototype focuses on extraction and selection inside the logged-in tab.
- The source folder defaults to showing the private Lineage integration for local development. Public exports still hide it.
- The Lineage integration is hidden in public builds. Eagle remains available in public and private builds through Eagle's local API.

## Public and private exports

From the repository root:

```powershell
.\build-extension.ps1 -Variant public
.\build-extension.ps1 -Variant private
```

The public zip writes `features.js` with `lineageIntegration: false` and `eagleIntegration: true`, so the Lineage UI is hidden while Eagle remains available. The private zip writes `lineageIntegration: true`, uses the embedded API URL/token, loads Custom Folders through `GET /custom-folders`, and imports downloads through `POST /imports/originals`. The selected Custom Folder is used as the parent; MediaFetch creates a child Custom Folder named from `Folder Name` and imports into that child. The Eagle module loads folders through `GET /api/folder/list`, creates a child folder under the selected parent with `POST /api/folder/create`, and imports images with `POST /api/item/addFromURL`.

To pair a private build with a fixed Lineage token, start Image Dataset Lineage Manager with the same token:

```powershell
$env:LINEAGE_EXTERNAL_API_TOKEN="your-fixed-token"
```

Then build the private extension with that token embedded as the default:

```powershell
.\build-extension.ps1 -Variant private -LineageToken "your-fixed-token"
```

The token is written only to the private build's `features.js`. Public builds always write an empty default token. The popup does not show URL or token fields; it only lets the user enable Lineage import, probe the connection, choose the target Custom Folder, and save selected images to Lineage.
