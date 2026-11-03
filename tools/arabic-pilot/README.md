# Arabic local preview pilot

Run from the repository root:

```powershell
node tools/arabic-pilot/check.cjs
node tools/preview-arabic.js 8797
```

Open `http://127.0.0.1:8797/`. The server binds only to loopback. Existing preview8796 is unchanged.

Supported routes:

- `/image/image-compress/ar/`
- `/image/image-resize/ar/`
- `/pdf/jpg-to-pdf/ar/`

These use the site's actual processing engines and libraries. The server translates existing generated English page HTML and runtime configs in memory. It never writes Arabic production pages or changes generators, language registries, sitemaps, or canonical/hreflang declarations. All responses carry `X-Robots-Tag: noindex, nofollow, noarchive`; HTML has equivalent robots metadata. AdSense/GA and public canonical/alternate/JSON-LD metadata are omitted.

The local runtime response adapts numeric entry and thumbnail reorder arrows only. Arabic-Indic and Persian digits normalize to ASCII for the existing numeric parser, including the compression tool's custom target input. Invalid numbers remain invalid. Pixel coordinates and PDF file order are not mirrored. Filename, dimension and unit strings are isolated LTR. The optional compression size target, exact 1024-byte KB definition, invalid-target error, unmet-target warning and settings-changed message are translated locally; zero remains the engine's default without a size target. English/legal links explicitly leave the pilot for the existing8796 preview; the legal pages remain Korean and are labeled accordingly.

Known limits:

- This is a prototype, not a reviewed ninth-language release. Arabic copy has not received native-speaker review.
- Node assertions cover metadata/config/common-string completeness, transformation syntax, compression target labels and RTL fade logic at both ends, including no overflow. Actual files, RTL375/1280 light/dark, numeric input, order and downloads require browser testing.
- No speed advantage over competitors is claimed by this preview. Compression/resizing remain the actual engine behavior, including possible dimension reduction and original-file fallback.
- Cropping, drawing, color tools, HWP, passport policy, the full image/PDF catalog, production language redirects and full-site Arabic navigation are outside this prototype.
- Arabic typography uses the existing font stack's system fallback. Real Android/iOS Arabic keyboard, browser and glyph metrics need device testing.

Integration evidence (2026-11-03): Chromium3tools×1280/375×light/dark12cases, saved-image/PDF inspection, Arabic/Persian/ASCII numeric input, actual1280→375 resize, both menu scroll ends and PDF ordering passed. The optional compression target was then tested with actual outputs and18warning states across existing8languages+Arabic; invalid Arabic text and negative targets produced errors rather than disabling the limit. The combined unit suite passed100tests. Details and remaining production gates are in `INTERNATIONAL_COMPETITIVENESS_CHECKLIST.md`; local JSON/screenshots/files are in `output/playwright/international/` (Git-ignored). These observations are not real-phone or competitor speed results.

Production readiness findings:

1. `build-image.js`/`build-pdf.js` currently apply `Object.keys(commonStrings)` to every hub/tool/alternate/select and silently fall back to English when a tool translation is missing. Adding `ar` only to common strings would generate unreviewed English-content Arabic pages. A production rollout needs tool-specific supported-language intersections and filtered hub links.
2. Shared shell navigation assumes every language exists in image/PDF/color/wheel. An Arabic pilot must not create links to unsupported Arabic sections.
3. Current shared header fade code assumes nonnegative `scrollLeft`; RTL can use negative values. The pilot has its own normalized handling and RTL gradients. Production needs the same behavior with actual resize and touch checks.
4. Physical CSS properties (`margin-left/right`, padding and badge placement), mixed filenames/numbers/Latin formats and ordering arrows need explicit RTL choices. PDF array order must not be reversed merely to make the UI look RTL.
5. Existing `parseFloat` getters do not parse Arabic-Indic digits. The pilot accepts them via text/decimal controls; production needs a validated, tested localized number-input policy.
6. `tools/check-shell.js` recognizes only `ko|zh|ja|es|pt|de|fr` in routes, so its Arabic path classification needs updating before any production rollout.

Primary references:

- [MDN: RTL scrollLeft can be negative](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollLeft)
- [W3C: Arabic and Persian layout requirements](https://www.w3.org/International/alreq/)
- [W3C: bidi string isolation](https://www.w3.org/international/articles/strings-and-bidi/)
