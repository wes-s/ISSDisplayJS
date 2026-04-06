# ISS Display static client

This build removes the FarmSense moon phase API dependency and computes moon phase locally in the browser.

## Run locally

1. Extract this zip.
2. Open a terminal in the extracted folder.
3. Run:
   ```bash
   python3 -m http.server 8000
   ```
4. Open:
   ```text
   http://localhost:8000/
   ```

The page auto-refreshes every 15 minutes.

## GitHub Pages

You can deploy this folder directly to GitHub Pages. The moon phase now works without FarmSense, so one less CORS issue remains. N2YO still needs a proxy or Worker if you want those extra satellite overlays from a static site.
