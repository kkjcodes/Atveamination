# Scrapbook assets

Two static assets the pipeline uses at composite-time. Both are **optional** —
`lib/scrapbook/assemble.ts` falls back to a parchment color source + `sans` font
if they're missing (so the feature works out-of-box; these are quality upgrades).

## page_bg.png
1920×1080 scrapbook page background. Kraft paper texture, tape/tab corners.
Drop-in options:
- Generate once via FLUX img2img with prompt like "kraft paper scrapbook page background, 4 tape strips at corners, subtle paper grain, warm cream tone, 1920x1080, empty center for photo".
- Or use a licensed stock image (must be redistributable).

## handwriting.ttf
Handwritten caption font, TTF format. **Caveat** (OFL, free) is the spec's
suggested choice — download from Google Fonts:

```
https://fonts.google.com/specimen/Caveat
```

Rename `Caveat-Regular.ttf` → `handwriting.ttf` and drop it here.

License note: Caveat is under the SIL Open Font License 1.1. Include the OFL
license text in production distributions.
