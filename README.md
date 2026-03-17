# PPTX Slide Analytics

A client-side browser application for analyzing and losslessly compressing PowerPoint (.pptx) files. No data ever leaves the browser.

## Security Architecture

### Data Processing Model

**All processing happens entirely in the browser.** There is no backend, no API, no server-side logic. The application is served as static HTML, CSS, and JavaScript. Once loaded, it operates fully offline.

| Property | Detail |
|---|---|
| **Data transmission** | None. Zero network requests after initial page load. Verifiable via browser DevTools → Network tab. |
| **Data storage** | None. No cookies, no localStorage, no IndexedDB, no Cache API, no Service Workers. |
| **Data retention** | All data exists only in browser memory (JavaScript heap). Closing the tab releases all memory immediately. |
| **File access** | Read-only via the browser File API. The application cannot access any files beyond what the user explicitly selects. |
| **Third-party services** | None. No analytics, no telemetry, no tracking, no CDN-loaded resources. |

### Threat Mitigations

| Threat | Mitigation |
|---|---|
| **Zip bomb** | Decompressed size is checked against a 500 MB hard limit, both via ZIP metadata upfront and incrementally during extraction. Processing aborts with an error if exceeded. |
| **Memory exhaustion** | Blob URLs are created via `URL.createObjectURL()` and explicitly revoked on component unmount to prevent memory leaks during repeated use. |
| **ReDoS (Regular Expression Denial of Service)** | XML files larger than 10 MB are skipped before any regex processing. All regex patterns use non-greedy quantifiers. |
| **XSS via filenames** | All user-facing strings (filenames, layout names) are rendered through React's JSX, which escapes output by default. No `dangerouslySetInnerHTML` is used anywhere. |
| **Path traversal (Zip Slip)** | Not applicable. JSZip operates entirely in memory. No files are written to the filesystem. ZIP entry paths are used only as dictionary keys. |
| **Supply chain** | Minimal dependency tree: React, JSZip, Vite, Tailwind CSS. All dependencies are pinned via `package-lock.json`. |

### Compliance Notes

- **GDPR / DSGVO**: No personal data is collected, processed, or transmitted. The application has no concept of users, sessions, or accounts.
- **Data residency**: All processing happens on the end user's device. No data crosses any network boundary.
- **Audit**: The complete source code is available in this repository. The production build can be reproduced via `npm ci && npm run build` and diffed against the deployed version.

### Recommended Deployment Headers

When deploying behind a reverse proxy or CDN, the following HTTP headers are recommended:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

The `connect-src 'none'` directive enforces at the browser level that no outbound network requests can be made by the application.

## Features

### Analysis

After dropping a .pptx file, the application provides:

- **Size breakdown**: Images vs. XML/structure vs. other content, with percentages
- **Master quality score** (0–100): Evaluates number of slide masters, layout naming conventions, layout count, orphaned layouts, and image weight in the master
- **Slide quality score** (0–100): Evaluates image sizes, formats (BMP/TIFF detection), resolution, and average image data per slide
- **Image inventory**: Every embedded image listed with dimensions, format, file size, and whether it belongs to the master or to slide content
- **Layout listing**: All slide layouts with their names (flags unnamed or generically named layouts)

### Lossless Compression

- **PNG re-encoding**: Same pixels, potentially smaller file size due to better compression
- **BMP/TIFF → PNG conversion**: Lossless format change with significant size reduction. Updates all `.rels` references and `[Content_Types].xml` automatically.
- **JPEG images are left untouched**: Cannot be losslessly recompressed in the browser
- **ZIP repackaging**: DEFLATE level 9 (many PPTX files use suboptimal compression)
- **Safety guarantee**: Compressed output is only used if it is smaller than the original. Images below 50 KB are skipped (logos, icons).

### What does NOT change

- Image dimensions (no resize, no crop)
- Image positions on slides
- Slide content, structure, or formatting
- Embedded fonts, charts, or other non-image media

## Tech Stack

| Component | Technology |
|---|---|
| Framework | React 19 + Vite 8 |
| Styling | Tailwind CSS 3 |
| ZIP handling | JSZip 3 |
| Image processing | Canvas API (browser-native) |
| Deployment | Static site (GitHub Pages) |

## Development

```bash
npm install
npm run dev        # Start dev server at http://localhost:5173
npm run build      # Production build → dist/
npm run preview    # Preview production build locally
```

### Requirements

- Node.js >= 18

## Deployment

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that automatically builds and deploys to GitHub Pages on every push to `main`.

The production build is a set of static files in `dist/` (~95 KB gzipped) that can be hosted on any static file server.

## License

MIT
