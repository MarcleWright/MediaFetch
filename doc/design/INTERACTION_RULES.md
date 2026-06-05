# Interaction Rules

## Popup Behavior

The Chrome plugin popup supports extraction range selection:

- `images`
- `videos`
- `both`

This is an execution control, not just a display filter.

## Selection Rules

- image and video canonical states remain separate
- merged media may be shown together in the UI
- `Select Original` applies only to images
- when the extraction range is `videos`, `Select Original` should not act on video items

## Status Rules

The popup should use media-neutral wording when the view can contain mixed media.

Examples:

- use `Extracting media...`
- use `Found X item(s): Y image(s), Z video(s).`

Avoid image-only status wording in mixed-media flows.

## Error Rules

- generic extraction failure should not imply that special-domain rules are required
- image failures and video failures should remain distinguishable in debug output
- debug output should separate image and video evidence
