# ISS Display static client

## Local run

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

## GitHub Pages deployment

1. Create a new GitHub repository.
2. Extract these files into a local folder for that repo.
3. Copy all files from this bundle into the repo root.
4. In a terminal:
   ```bash
   git init
   git add .
   git commit -m "Initial ISS Display site"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git push -u origin main
   ```
5. In GitHub, open the repository.
6. Go to **Settings** -> **Pages**.
7. Under **Build and deployment**, set:
   - **Source** = Deploy from a branch
   - **Branch** = main
   - **Folder** = / (root)
8. Save.
9. Wait about 1-2 minutes.
10. Your site will appear at:
    ```text
    https://YOUR_USERNAME.github.io/YOUR_REPO/
    ```

## Notes

- GitHub Pages will serve the static app fine.
- Direct browser calls to N2YO may still hit CORS limits.
- The refresh timer uses a normal page reload every 15 minutes.
