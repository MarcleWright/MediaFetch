# Product Brief

## Purpose

MediaDownloader is a workspace for media extraction workflows centered on MediaFetch.

The repository currently contains two delivery paths:

- a local web app for local extraction and download workflows
- a Chrome plugin that runs inside the user's logged-in browser session for harder sites

## Target Users

- users who need to extract media from real browser sessions
- users who need project-oriented folder naming and metadata capture
- users who work with image-heavy and increasingly video-capable workflows across modern sites

## Core Value

- use the real browser session instead of trying to simulate logged-in state externally
- preserve practical download workflows over perfect theoretical metadata
- support domain-aware extraction while retaining generic fallback behavior

## Core Workflows

1. open a target page in a real browser session
2. extract media candidates from the current tab
3. review and select desired media
4. download selected items into a structured folder
5. preserve project metadata in `metadata.json`
6. optionally export supported image results to Eagle or Lineage

## Non-goals

- full streaming downloader support in the current Chrome plugin phase
- HLS or DASH handling in the current first video phase
- universal media conversion and post-processing
- mixing image, video, and future audio rules into one shared rule function
