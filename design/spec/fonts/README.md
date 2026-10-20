# fonts/: faces for `custom-font`

These are the latin subsets from @fontsource (npm), all under the SIL Open Font
License 1.1 (each `LICENSE-*` is alongside). Dev bundles them as
web_accessible_resources and declares `@font-face` with `font-display: swap`.

| Menu label | Family | Files |
|---|---|---|
| Canvas default | (Canvas's Lato; nothing bundled) | none |
| System | system-ui stack | none |
| Inter | Inter | inter-latin-{400,600,700}-normal, 400-italic |
| Atkinson Hyperlegible | Atkinson Hyperlegible | atkinson-hyperlegible-latin-{400,700}-normal, 400-italic |
| Source Serif | Source Serif 4 | source-serif-4-latin-{400,600,700}-normal, 400-italic |
| JetBrains Mono | JetBrains Mono | jetbrains-mono-latin-{400,600,700}-normal, 400-italic |

IBM Plex Sans and Literata were dropped (the download failed; four faces plus
Canvas and System is enough for v1).

## Lato (for the Studio stage)
`Lato-Regular.woff2` and `Lato-Bold.woff2` (OFL, `LICENSE-lato`) are used only on
the Studio's stage, so the miniature Canvas looks like Canvas on machines
without Lato. They aren't in the custom-font menu, because "Canvas default"
already means Canvas's own Lato on Canvas pages.
