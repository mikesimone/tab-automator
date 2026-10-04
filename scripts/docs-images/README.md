# Documentation and store images

Scripts that produced `docs/images/` and `docs/store/`. They are developer tooling, not part of the extension.

What they do: launch a real, headed Chromium on a private virtual display with the built extension loaded and its toolbar icon pinned, open real websites, apply the sample rules, and capture the actual browser window (tab strip included). Composite and infographic images are then built from those captures.

## You need

- `Xvfb` on display `:99`, e.g. `Xvfb :99 -screen 0 3400x1200x24 -nolisten tcp -ac &` (the display is private; do not point these at a real desktop)
- ImageMagick (`import`), Python 3 with Pillow, Node 20+ and `playwright-core` (`npm i playwright-core` somewhere on the module path)
- A Chromium build for Playwright (`TA_CHROME` overrides the default path), plus an emoji font such as Noto Color Emoji
- A built extension: `npm run build` (`TA_DIST` overrides the `dist/` location)
- Network access: the scenes load real sites (GitHub, Google, Wikipedia, BBC News, YouTube, Chrome docs and others)

`TA_TMP` (default `/tmp/ta-docs-images`) is where raw captures and throwaway browser profiles go.

## Run

```
node scripts/docs-images/scene-rules.mjs          # 01 before, 02 after
node scripts/docs-images/scene-strips.mjs         # tab strip close-ups (2x), before / after / paused
node scripts/docs-images/scene-paused.mjs         # paused strip with the toolbar badge
node scripts/docs-images/scene-demo-window.mjs    # 05 to 08, moving a group to a new window
node scripts/docs-images/scene-own-window.mjs     # 09
node scripts/docs-images/scene-session.mjs        # 10
node scripts/docs-images/scene-spot-search.mjs    # 12
node scripts/docs-images/infographics.mjs         # 19, 20 (from docs/images/source/*.html)
python3 scripts/docs-images/compose.py            # 03, 04, 11 and the copy into docs/images
```

`store-ui-screens.mjs`, `store-promo-tile.mjs` and `store-finalize.py` regenerate the Chrome Web Store screenshots and promo tile in `docs/store/`.

## Notes

- Some sites change over time (headlines, banners, page titles), so re-captured images will differ in the page content.
- claude.ai sometimes shows a "Just a moment..." security check to automated browsers; the scenes retry, but a page that keeps showing it should be swapped for another site in `scenes.mjs`.
- Chrome will not let extensions touch Chrome Web Store pages, and a few sites (for example Hacker News) keep their own favicon, so the sample rules avoid relying on those.
- These scripts were moved here and had their paths generalized after the last run, so give them a trial run before relying on them.
