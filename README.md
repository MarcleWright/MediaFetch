# MediaDownloader Workspace

This workspace is now split into two parts:

- [local-web/README.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/local-web/README.md)
  Current Node-based local web app. This version keeps the existing local extraction and download flow.
- [chrome-plugin/README.md](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin/README.md)
  Chrome extension prototype. This version is designed to run inside your logged-in browser session and extract images from the current tab.

## Extension export variants

Build the Chrome extension from the workspace root:

```powershell
.\build-extension.ps1 -Variant public
.\build-extension.ps1 -Variant private
```

The public variant hides the Image Dataset Lineage Manager integration but keeps the Eagle integration enabled. The private variant exposes the Lineage integration and also keeps Eagle enabled.

For a paired private build, run Lineage with a fixed token and pass the same value at export time:

```powershell
$env:LINEAGE_EXTERNAL_API_TOKEN="your-fixed-token"
.\build-extension.ps1 -Variant private -LineageToken "your-fixed-token"
```
