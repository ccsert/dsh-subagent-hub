# Documentation assets

## Hero

The primary [Hero WebP](hero.webp) was generated with **dsh-image-gen 0.9.2**, using its Studio endpoint and the configured ChatGPT subscription channel. The model reported by the plugin was `gpt-image-2.5-flare`.

- Requested: 16:9, high quality, one image.
- Returned: 1672 × 941; the service reported quality `low`.
- Publication: crop the central band `(0, 136, 1672, 805)`, resize to 1600 × 640, and encode WebP at quality 90.
- README WebP: 48,996 bytes. A [PNG version](hero.png) is available for downloads.
- The exact design prompt is retained in [hero.prompt.md](hero.prompt.md).

The Hero is project artwork. It does not depict a working product screen. The separate [SVG concept](hero.svg) is an original editable vector study created before image generation; it is not the source of the generated Hero.

## Screenshots

| Asset | Dimensions | Source |
|---|---|---|
| [Role settings](settings.webp) | 960 × 800 | 0.14.0 configuration component at desktop content width; three demo roles and stable tabs/footer |
| [Advanced role settings](settings-full.webp) | 960 × 800 | The same component with advanced fields expanded and scrolled into view |
| [Role editor](role-editor.webp) | 960 × 800 | Review role expanded; other roles collapsed |
| [Model routes](models.webp) | 960 × 800 | Current Models tab with two demo routes; one editor expanded |
| [General settings](general.webp) | 960 × 800 | Current concurrency, overview and managed-settings controls |
| [Role and route analysis](overview-analysis.webp) | 580 × 995 | Actual 0.14.0 overview component in a simulated sidebar; six synthetic members across two levels |
| [Model badge](model-badge.webp) | 976 × 222 | Actual header contribution and installed official header CSS, with demo request/catalog data |
| [Narrow model badge](model-badge-narrow.webp) | 304 × 242 | Historical narrow-layout capture of the same component; no new mobile acceptance is implied |
| [Member monitor](overview-sidebar.webp) | 580 × 995 | Actual 0.14.0 component in a simulated sidebar; six synthetic members |
| [Historical native usage sidebar](usage-sidebar.webp) | 1280 × 900 | Retained 0.13.0 isolated native-sidebar capture, with one demo child |
| [Member distribution](usage-filters.webp) | 580 × 995 | Actual 0.14.0 distribution with six synthetic members; not actual model usage |
| [Combined distribution filters](usage-filtered.webp) | 580 × 995 | Same component after hiding the idle state and GPT model route |
| [Shared task board](task-board-sidebar.webp) | 580 × 995 | Actual 0.14.0 component with five synthetic task projections; native persistence is verified separately by SDK tests |

Settings, analysis, monitor, distribution and task-board assets were refreshed for 0.14.0 on 2026-11-12. Model-badge and historical native usage/sidebar assets were retained with their original provenance. Screenshots were captured with Playwright and encoded to lossless WebP. Matching PNG files are retained. The fixtures use in-memory configuration, Session faces, and a demo model catalog that only supplies display names; no user profile, private conversation, provider credential, or external model response is included. UI controls were not redrawn or fabricated.

## Market tile icon

[icon.png](icon.png) is 512 × 512 with a transparent background, rasterized from the package's vector [icon.svg](../../packages/subagent-hub/icon.svg) by rendering it at 512 px in headless Chromium and capturing with a transparent background. It is project artwork, not a product screenshot.

The plugin market requires a GitHub-hosted **raster** tile (SVG is refused), so the PNG is the file to submit; the SVG stays the editable source. Regenerate with:

```bash
cp packages/subagent-hub/icon.svg output/playwright/hub-icon.svg
# open it at 512 px and screenshot with omitBackground, then:
cp output/playwright/icon-512.png docs/assets/icon.png
```

See [the screenshot gallery](../screenshots.md) and [contribution guide](../../CONTRIBUTING.md) for reproduction. Documentation and original project assets are distributed with the project's [MIT License](../../LICENSE).
