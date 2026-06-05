# Development Setup

## Prerequisites

- Node.js available in the workspace
- Chrome for extension loading and testing
- PowerShell for current build scripts

## Install

The repository already contains the project dependencies used by the current workspace.

Relevant areas:

- [local-web/package.json](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/local-web/package.json)
- root build scripts and extension files under [chrome-plugin/](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin)

## Run

Chrome plugin build commands from the workspace root:

```powershell
.\build-extension.ps1 -Variant public
.\build-extension.ps1 -Variant private
```

For local loading:

1. open `chrome://extensions`
2. enable Developer mode
3. click Load unpacked
4. choose [chrome-plugin/](D:/00_Projects_WSY/AI/Codex_Projects/MediaDownloader/chrome-plugin)

## Common Troubleshooting

- if extension behavior looks stale, reload the unpacked extension
- if content-script behavior changes but popup results do not, reload the target page after extension reload
- use `node --check` on edited JS files before claiming structural work is complete
