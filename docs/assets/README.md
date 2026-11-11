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
| [Role settings](settings.webp) | 560 × 665 | Current configuration component at desktop settings content width; three demo roles and the configuration assistant entry |
| [Advanced role settings](settings-full.webp) | 560 × 995 | The same component with advanced fields expanded |
| [Role editor](role-editor.webp) | 560 × 665 | Review role expanded; other roles collapsed |
| [Model routes](models.webp) | 560 × 711 | Current Models tab with two demo routes and reasoning effort |
| [General settings](general.webp) | 560 × 628 | Current concurrency, overview and managed-settings controls |
| [Model badge](model-badge.webp) | 976 × 222 | Actual header contribution and installed official header CSS, with demo request/catalog data |
| [Narrow model badge](model-badge-narrow.webp) | 304 × 242 | Historical narrow-layout capture of the same component; no new mobile acceptance is implied |
| [Native agent sidebar](overview-sidebar.webp) | 1280 × 900 | Isolated DSH Web profile with native sidebar and scripted model responses |
| [Native usage sidebar](usage-sidebar.webp) | 1280 × 900 | The same isolated native sidebar, with one demo child |
| [Usage filters](usage-filters.webp) | 460 × 1145 | Current component with 50 synthetic members in a simulated sidebar container; not actual model usage |
| [Combined usage filters](usage-filtered.webp) | 460 × 1145 | Same component after clicking the finished-state and one model legend to hide their entries |
| [Native shared task board](task-board-sidebar.webp) | 1440 × 1000 | Isolated DSH Web profile; tasks created and persisted by native Team services, with scripted model replies |

The settings and usage-filter assets were refreshed for 0.13.0 on 2026-11-11. Native sidebar captures were retained after checking the current component and interaction contract. Screenshots were captured with Playwright and encoded to lossless WebP. Matching PNG files are retained. The fixtures use in-memory configuration, Session faces, and a demo model catalog that only supplies display names; no user profile, private conversation, provider credential, or external model response is included. UI controls were not redrawn or fabricated.

## Market tile icon

[icon.png](icon.png) is 512 × 512 with a transparent background, rasterized from the package's vector [icon.svg](../../packages/subagent-hub/icon.svg) by rendering it at 512 px in headless Chromium and capturing with a transparent background. It is project artwork, not a product screenshot.

The plugin market requires a GitHub-hosted **raster** tile (SVG is refused), so the PNG is the file to submit; the SVG stays the editable source. Regenerate with:

```bash
cp packages/subagent-hub/icon.svg output/playwright/hub-icon.svg
# open it at 512 px and screenshot with omitBackground, then:
cp output/playwright/icon-512.png docs/assets/icon.png
```

See [the screenshot gallery](../screenshots.md) and [contribution guide](../../CONTRIBUTING.md) for reproduction. Documentation and original project assets are distributed with the project's [MIT License](../../LICENSE).
