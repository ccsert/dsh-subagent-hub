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
| [Models and roles](settings.webp) | 960 × 680 | Actual configuration component, demo data; cropped to its model and role sections |
| [Full settings](settings-full.webp) | 960 × 1783 | Same actual component with an expanded role |
| [Role editor](role-editor.webp) | 960 × 634 | Expanded role section |
| [Model badge](model-badge.webp) | 978 × 222 | Actual header contribution and the installed official conversation header CSS |
| [Narrow model badge](model-badge-narrow.webp) | 306 × 242 | The same component in a 320px viewport |
| [Agent overview](overview.webp) | 928 × 792 | Actual overview dialog with synthetic native session stores and the installed dark-theme token values |

Screenshots were captured with Playwright and encoded to lossless WebP. Matching PNG files are retained. The fixtures use in-memory configuration and Session faces; no user profile, private conversation, provider credential, or external model response is included. UI controls were not redrawn or fabricated.

## Market tile icon

[icon.png](icon.png) is 512 × 512 with a transparent background, rasterized from the package's vector [icon.svg](../../packages/subagent-hub/icon.svg) by rendering it at 512 px in headless Chromium and capturing with a transparent background. It is project artwork, not a product screenshot.

The plugin market requires a GitHub-hosted **raster** tile (SVG is refused), so the PNG is the file to submit; the SVG stays the editable source. Regenerate with:

```bash
cp packages/subagent-hub/icon.svg output/playwright/hub-icon.svg
# open it at 512 px and screenshot with omitBackground, then:
cp output/playwright/icon-512.png docs/assets/icon.png
```

See [the screenshot gallery](../screenshots.md) and [contribution guide](../../CONTRIBUTING.md) for reproduction. Documentation and original project assets are distributed with the project's [MIT License](../../LICENSE).
