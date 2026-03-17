# PPTX Slide Analytics

A client-side browser application for analyzing and compressing PowerPoint (.pptx) files. No data ever leaves the browser.

## Security Architecture

### Data Processing Model

**All processing happens entirely in the browser.** There is no backend, no API, no server-side logic. The application is served as static HTML, CSS, JavaScript, and WebAssembly. Once loaded, it operates fully offline.

| Property | Detail |
|---|---|
| **Data transmission** | None. Zero network requests after initial page load. Verifiable via browser DevTools → Network tab. |
| **Data storage** | None. No cookies, no localStorage, no IndexedDB, no Cache API, no Service Workers. |
| **Data retention** | All data exists only in browser memory (JavaScript heap). Closing the tab releases all memory immediately. |
| **File access** | Read-only via the browser File API. The application cannot access any files beyond what the user explicitly selects. |
| **Third-party services** | None. No analytics, no telemetry, no tracking, no CDN-loaded resources. |
| **Image processing** | Performed via WebAssembly (WASM) modules bundled with the application. MozJPEG and OxiPNG run as compiled binaries inside the browser sandbox — no external calls. |

### Threat Mitigations

| Threat | Mitigation |
|---|---|
| **Zip bomb** | Decompressed size is checked against a 500 MB hard limit, both via ZIP metadata upfront and incrementally during extraction. Processing aborts with an error if exceeded. |
| **Memory exhaustion** | Blob URLs are created via `URL.createObjectURL()` and explicitly revoked on component unmount to prevent memory leaks during repeated use. |
| **ReDoS (Regular Expression Denial of Service)** | XML files larger than 10 MB are skipped before any regex processing. All regex patterns use non-greedy quantifiers. |
| **XSS via filenames** | All user-facing strings (filenames, layout names) are rendered through React's JSX, which escapes output by default. No `dangerouslySetInnerHTML` is used anywhere. |
| **Path traversal (Zip Slip)** | Not applicable. JSZip operates entirely in memory. No files are written to the filesystem. ZIP entry paths are used only as dictionary keys. |
| **Supply chain** | Minimal dependency tree: React, JSZip, jSquash codecs (MozJPEG, OxiPNG, PNG), Vite, Tailwind CSS. All dependencies are pinned via `package-lock.json`. WASM binaries are compiled from well-known open-source projects (Mozilla's MozJPEG, OxiPNG by Rust community). |

### Compliance Notes

- **GDPR / DSGVO**: No personal data is collected, processed, or transmitted. The application has no concept of users, sessions, or accounts. All file processing is performed locally in the browser's memory — files never leave the user's device.
- **Data residency**: All processing happens on the end user's device. No data crosses any network boundary.
- **Audit**: The complete source code is available in this repository. The production build can be reproduced via `npm ci && npm run build` and diffed against the deployed version.

### Recommended Deployment Headers

When deploying behind a reverse proxy or CDN, the following HTTP headers are recommended:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' blob:; connect-src 'none'; worker-src 'self' blob:
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

Note: `'wasm-unsafe-eval'` is required for WebAssembly execution. `worker-src 'self' blob:` allows OxiPNG's Web Worker. `connect-src 'none'` enforces at the browser level that no outbound network requests can be made.

## Features

### Analysis

After dropping a .pptx file, the application provides:

- **Master quality score** (0–100): Evaluates number of slide masters, layout naming conventions, layout count, orphaned layouts, and image weight in the master
- **Slide quality score** (0–100): Evaluates image sizes, formats (BMP/TIFF detection), resolution, and average image data per slide
- **Size breakdown**: Images vs. XML/structure vs. other content, with percentages
- **Image inventory**: Every embedded image listed with dimensions, format, file size, and whether it belongs to the master or to slide content
- **Layout listing**: All slide layouts with their names (flags unnamed or generically named layouts)

### Compression — Two Modes

#### Visually Lossless (like TinyPNG)

Uses WebAssembly ports of industry-standard compressors:

- **JPEG images**: Re-encoded with [MozJPEG](https://github.com/nicpottier/mozjpeg) (Mozilla's optimized JPEG encoder, quality 75, progressive). Typically 30–50% smaller.
- **PNG images**: Optimized with [OxiPNG](https://github.com/nicpottier/oxipng) (lossless). Large non-transparent PNGs (>500 KB, likely photos) are additionally tested as MozJPEG — the smaller result wins.
- **BMP/TIFF images**: Converted to JPEG (opaque) or optimized PNG (transparent).
- **Transparency detection**: PNGs with alpha channel are never converted to JPEG.
- **ZIP repackaging**: DEFLATE level 9.

Expected savings: **50–80%** on typical presentation files.

#### Strictly Lossless

Zero quality loss — bit-identical pixel data:

- **PNG images**: Optimized with OxiPNG (better compression, same pixels).
- **BMP/TIFF images**: Converted to PNG (lossless format change).
- **JPEG images**: Left untouched (cannot be losslessly recompressed in the browser).
- **ZIP repackaging**: DEFLATE level 9.

Expected savings: **5–20%** depending on how well the original images were compressed.

### Safety Guarantees (Both Modes)

- Compressed output is only used if it is actually smaller than the original
- Images below 50 KB are skipped (logos, icons)
- Image dimensions are never changed (no resize, no crop)
- Image positions on slides are not affected
- Slide content, structure, and formatting remain unchanged
- Embedded fonts, charts, videos, and other non-image media remain unchanged
- When image formats change (e.g., PNG → JPEG, BMP → PNG), all internal references (`.rels` files, `[Content_Types].xml`) are updated automatically

## Tech Stack

| Component | Technology | Purpose |
|---|---|---|
| Framework | React 19 + Vite 8 | UI and build tooling |
| Styling | Tailwind CSS 3 | Utility-first CSS |
| ZIP handling | JSZip 3 | PPTX unpacking and repacking |
| JPEG compression | @jsquash/jpeg (MozJPEG WASM) | Visually lossless JPEG encoding |
| PNG optimization | @jsquash/oxipng (OxiPNG WASM) | Lossless PNG compression |
| PNG decoding | @jsquash/png (WASM) | Alpha channel detection |
| Deployment | Static site (GitHub Pages) | No server required |

All image processing libraries run as WebAssembly inside the browser sandbox. No server-side processing occurs.

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

The production build is a set of static files in `dist/` (~500 KB gzipped, including WASM binaries) that can be hosted on any static file server.

## License

MIT
