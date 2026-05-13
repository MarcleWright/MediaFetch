# MediaFetch Chrome Plugin

This folder contains a Chrome extension prototype for MediaFetch.

## What it does

- Reads images from the current active tab
- Uses your logged-in browser session
- Auto-detects a project name and fills `Folder Name`
- Lets you click to select images
- Supports `Select All`, `Clear`, `Select Original`, and `Download`
- Downloads into your default Chrome downloads folder under `Folder Name/`

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
