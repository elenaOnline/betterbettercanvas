# Third-party notices

b²c is licensed AGPL-3.0-or-later (see LICENSE). It includes or derives from:

- **canvas-lms** (Instructure, Inc., AGPL-3.0). The mock Canvas used for
  testing (`dev/mock-canvas/`) reconstructs page markup from canvas-lms
  templates, and `dev/mock-canvas/vendor-built/` holds CSS compiled from
  canvas-lms SCSS (source commit in `vendor-built/SOURCE.json`). The palette
  engine's generated layer maps selectors from Canvas's compiled CSS.
- **Instructure UI icons** (MIT), in the mock, including the icon fonts in
  `dev/mock-canvas/vendor-built/fonts/`.
- **Better Canvas** (ksucpea / UseBetterCanvas), behaviour reference only. b²c
  re-implements features from the behaviour of v5.12.6, which was MIT-licensed
  at release. No Better Canvas code is included.
- **Fonts** (SIL Open Font License 1.1, licence files alongside):
  Inter, Atkinson Hyperlegible, Source Serif 4, JetBrains Mono, and Lato (the
  Studio's preview only).
- **Theme palettes**, by their upstream projects (see
  `design/spec/themes/ATTRIBUTIONS.md`): Catppuccin, Dracula, Nord, Rosé Pine,
  Solarized, Everforest (MIT); Tokyo Night (Apache-2.0).
