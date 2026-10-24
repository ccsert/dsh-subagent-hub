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
| [Full settings](settings-full.webp) | 960 × 1628 | Same actual component with an expanded role |
| [Role editor](role-editor.webp) | 960 × 634 | Expanded role section |
| [Model badge](model-badge.webp) | 998 × 204 | Actual header contribution and the installed official conversation header CSS |
| [Narrow model badge](model-badge-narrow.webp) | 302 × 204 | The same component in a 320px viewport |

Screenshots were captured with Playwright and encoded to lossless WebP. Matching PNG files are retained. The fixtures use in-memory configuration and Session faces; no user profile, private conversation, provider credential, or external model response is included. UI controls were not redrawn or fabricated.

See [the screenshot gallery](../screenshots.md) and [contribution guide](../../CONTRIBUTING.md) for reproduction. Documentation and original project assets are distributed with the project's [MIT License](../../LICENSE).
