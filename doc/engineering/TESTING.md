# Testing

## Automated Checks

Current minimum static checks:

```powershell
node --check chrome-plugin\content.js
node --check chrome-plugin\popup.js
node --check chrome-plugin\background.js
git diff --check
```

## Manual Verification

Current important manual checks:

1. supported image-domain extraction still works
2. generic image extraction still works on unsupported sites
3. generic direct single-file video extraction works on standard HTML5 pages
4. extraction range works for:
   - `images`
   - `videos`
   - `both`
5. mixed-media selection still renders correctly
6. mixed-media download still works for current supported scope

## Release Validation

Before packaging or pushing meaningful Chrome plugin changes:

1. run all static checks
2. reload the unpacked extension
3. test at least one known image-special-domain page
4. test at least one generic video page
5. confirm Eagle and Lineage remain image-only in current video phase
