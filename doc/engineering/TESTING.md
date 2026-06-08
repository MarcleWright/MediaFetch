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
3. `xiaohongshu` image download works on a real sample URL when available
4. `weibo` image download works on a real sample URL when available
5. `behance` stays on the generic image download path unless a real failure is observed
6. generic direct single-file video extraction works on standard HTML5 pages
7. extraction range works for:
   - `images`
   - `videos`
   - `both`
   - the popup segmented pill control updates and persists the chosen range
8. `weibo` direct single-file video extraction and download work on a real sample URL when available
9. `xinpianchang` direct single-file video extraction and domain-specific direct-download path work on a real sample URL when available
10. mixed-media selection still renders correctly
11. mixed-media download still works for current supported scope

Current branch note:

- `xiaohongshu` image download has been revalidated by user testing after the download-layer cleanup
- `weibo` and `xinpianchang` video download remain open stabilization items for the next iteration and should not be treated as release-complete in this branch snapshot

## Release Validation

Before packaging or pushing meaningful Chrome plugin changes:

1. run all static checks
2. reload the unpacked extension
3. test at least one known image-special-domain page
4. test at least one generic video page
5. confirm Eagle and Lineage remain image-only in current video phase
