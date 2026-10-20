# Bundled themes

Preset themes in the shareable format from `design/spec/rice.md` ("Theme file"): one
`<id>.b2c-theme.json` per theme, 14 palette roles each. Palette-only; the other primitives
(shape, type, layout) are omitted so applying one leaves hers alone. Built-in presets carry
no `courseColors`; the riced themes carry 6–8 chosen for white hero titles.

## Themes

| File | Name | Scheme | Source of the values | Licence | Adjusted? |
|---|---|---|---|---|---|
| `canvas` | Canvas | light | identity: no `palette`, applies nothing | n/a | no |
| `dark` | Dark | dark | `design/spec/palettes.json` (v1 slate) | b²c | no |
| `gray` | Gray | dark | same | b²c | no |
| `black` | Black | dark | same | b²c | no |
| `warm` | Warm | dark | same | b²c | no |
| `catppuccin-mocha` | Catppuccin Mocha | dark | https://catppuccin.com/palette | [MIT](https://github.com/catppuccin/catppuccin/blob/main/LICENSE) | yes |
| `catppuccin-latte` | Catppuccin Latte | light | https://catppuccin.com/palette | [MIT](https://github.com/catppuccin/catppuccin/blob/main/LICENSE) | yes |
| `nord` | Nord | dark | https://www.nordtheme.com/docs/colors-and-palettes | [MIT](https://github.com/nordtheme/nord/blob/develop/license) | yes |
| `gruvbox-dark` | Gruvbox Dark | dark | https://github.com/morhetz/gruvbox#palette | MIT/X11 per README and `package.json`; **no LICENSE file** ([README](https://github.com/morhetz/gruvbox#license)) | yes |
| `gruvbox-light` | Gruvbox Light | light | https://github.com/morhetz/gruvbox#palette | MIT/X11 per README and `package.json`; **no LICENSE file** ([README](https://github.com/morhetz/gruvbox#license)) | no |
| `rose-pine` | Rosé Pine | dark | https://rosepinetheme.com/palette/ | [MIT](https://github.com/rose-pine/rose-pine-theme/blob/main/LICENSE) | yes |
| `rose-pine-dawn` | Rosé Pine Dawn | light | https://rosepinetheme.com/palette/ | [MIT](https://github.com/rose-pine/rose-pine-theme/blob/main/LICENSE) | yes |
| `tokyo-night` | Tokyo Night | dark | https://github.com/folke/tokyonight.nvim/blob/main/extras/lua/tokyonight_night.lua (Night variant) | **[Apache-2.0](https://github.com/folke/tokyonight.nvim/blob/main/LICENSE)** | yes |
| `solarized-dark` | Solarized Dark | dark | https://ethanschoonover.com/solarized/ | [MIT](https://github.com/altercation/solarized/blob/master/LICENSE) | yes |
| `solarized-light` | Solarized Light | light | https://ethanschoonover.com/solarized/ | [MIT](https://github.com/altercation/solarized/blob/master/LICENSE) | yes |
| `everforest-dark` | Everforest Dark | dark | https://github.com/sainnhe/everforest/blob/master/palette.md (dark, medium background) | [MIT](https://github.com/sainnhe/everforest/blob/master/LICENSE) | yes |
| `dracula` | Dracula | dark | https://draculatheme.com/spec | [MIT](https://github.com/dracula/dracula-theme/blob/main/LICENSE) | yes |

The built-in presets keep `link`, `accent` and `nav` as `"school"`; every riced theme has its
own link, accent and nav (the `source` field in each file repeats the URL). Licences are those of the upstream repositories, checked
against their LICENSE files on 2026-10-20 (see the last section); they cover the published colour values and none of
this folder copies upstream code or artwork. Tokyo Night is Apache-2.0, not MIT, and Gruvbox ships no LICENSE file.

## How the palettes were mapped

- `bg` is the palette's base. `surface` and `surfaceRaised` are its next official steps. In dark
  themes, Catppuccin Mocha uses mantle (darker than base, as Catppuccin does for panels) and
  surface0; the others step lighter. Light themes step darker (Latte, Solarized) or use
  the palette's own light panel colours (Rosé Pine Dawn, Gruvbox Light).
- `nav` is the palette's darkest official colour. For light themes that is a dark nav
  (as in Canvas itself) with the base as `navText`. Nord and Rosé Pine have nothing darker than
  base, so `nav` equals `bg` there.
- `link` is the palette's blue (Rosé Pine: foam or pine, which are its blue-greens; Dracula:
  cyan). `accent` is a deeper accent that takes a white label (filled buttons, switches).
- Derived, not official: Solarized `surfaceRaised` (a 30% mix of two palette steps) and Dracula
  `textSecondary` (35% mix of foreground and comment), Nord `textTertiary` start value `#616e88` (the Nord documentation's suggested comment
  colour, a lightened nord3).
- Solarized is deliberately low-contrast, so its text roles move the most.

## Adjustments (lightness only, hue and chroma kept)

Each value below was nudged in OKLCH lightness in steps of 0.002 until the floor passed, then
rounded to hex. Everything not listed is the official value. Gruvbox Light passes untouched.
`success`, `warning` and `danger`, `border` and Canvas are never adjusted (reported as
information by the checker only).

| Theme | Role | Original → adjusted | Why |
|---|---|---|---|
| Catppuccin Mocha | textTertiary | `#9399b2` → `#9aa0b9` | tertiary 4.5:1 and Lc 45 on all three surfaces |
| Catppuccin Mocha | link | `#89b4fa` → `#92beff` | link 4.5:1 and Lc 60 on all three surfaces |
| Catppuccin Mocha | accent | `#cba6f7` → `#8a66b2` | white label on filled accent (buttons, switches) needs 4.5:1 |
| Catppuccin Mocha | courseColors (8) | `#f38ba8` → `#db7592`, `#fab387` → `#c9855b`, `#f9e2af` → `#a89262`, `#a6e3a1` → `#68a263`, `#94e2d5` → `#54a296`, `#74c7ec` → `#4a9ec2`, `#89b4fa` → `#6c95d9`, `#cba6f7` → `#a985d3` | white hero title needs 3:1 |
| Catppuccin Latte | text | `#4c4f69` → `#3d4059` | text 7:1 and Lc 75 on all three surfaces |
| Catppuccin Latte | textTertiary | `#6c6f85` → `#606278` | tertiary 4.5:1 and Lc 45 on all three surfaces |
| Catppuccin Latte | link | `#1e66f5` → `#0d57e5` | link 4.5:1 and Lc 60 on all three surfaces |
| Catppuccin Latte | courseColors (2) | `#fe640b` → `#fd6309`, `#df8e1d` → `#d28200` | white hero title needs 3:1 |
| Nord | textTertiary | `#616e88` → `#adbcd9` | tertiary 4.5:1 and Lc 45 on all three surfaces |
| Nord | link | `#88c0d0` → `#9ad2e2` | link 4.5:1 and Lc 60 on all three surfaces |
| Nord | accent | `#5e81ac` → `#5679a3` | white label on filled accent (buttons, switches) needs 4.5:1 |
| Nord | courseColors (6) | `#d08770` → `#cb826b`, `#ebcb8b` → `#af9152`, `#a3be8c` → `#829c6c`, `#8fbcbb` → `#709c9b`, `#81a1c1` → `#7998b8`, `#b48ead` → `#af89a8` | white hero title needs 3:1 |
| Gruvbox Dark | textTertiary | `#a89984` → `#b1a28c` | tertiary 4.5:1 and Lc 45 on all three surfaces |
| Gruvbox Dark | link | `#83a598` → `#a3c6b8` | link 4.5:1 and Lc 60 on all three surfaces |
| Gruvbox Dark | courseColors (1) | `#d79921` → `#c68900` | white hero title needs 3:1 |
| Rosé Pine | textSecondary | `#908caa` → `#b7b3d2` | secondary 4.5:1 and Lc 60 on all three surfaces |
| Rosé Pine | textTertiary | `#6e6a86` → `#9c98b6` | tertiary 4.5:1 and Lc 45 on all three surfaces |
| Rosé Pine | courseColors (5) | `#eb6f92` → `#e86c90`, `#f6c177` → `#be8b41`, `#ebbcba` → `#b68a88`, `#9ccfd8` → `#6b9da6`, `#c4a7e7` → `#a588c6` | white hero title needs 3:1 |
| Rosé Pine Dawn | textSecondary | `#797593` → `#6a6683` | secondary 4.5:1 and Lc 60 on all three surfaces |
| Rosé Pine Dawn | textTertiary | `#9893a5` → `#6c6778` | tertiary 4.5:1 and Lc 45 on all three surfaces |
| Rosé Pine Dawn | accent | `#907aa9` → `#836d9b` | white label on filled accent (buttons, switches) needs 4.5:1 |
| Rosé Pine Dawn | courseColors (2) | `#ea9d34` → `#cf8403`, `#d7827e` → `#d27d79` | white hero title needs 3:1 |
| Tokyo Night | text | `#c0caf5` → `#d3ddff` | text 7:1 and Lc 75 on all three surfaces |
| Tokyo Night | textSecondary | `#a9b1d6` → `#bbc3e8` | secondary 4.5:1 and Lc 60 on all three surfaces |
| Tokyo Night | textTertiary | `#737aa2` → `#a6aed9` | tertiary 4.5:1 and Lc 45 on all three surfaces |
| Tokyo Night | link | `#7aa2f7` → `#9dc7ff` | link 4.5:1 and Lc 60 on all three surfaces |
| Tokyo Night | courseColors (8) | `#f7768e` → `#eb6b84`, `#ff9e64` → `#da7d42`, `#e0af68` → `#bb8c45`, `#9ece6a` → `#75a23e`, `#1abc9c` → `#00a889`, `#7dcfff` → `#4b9dcb`, `#7aa2f7` → `#6c93e7`, `#bb9af7` → `#a584df` | white hero title needs 3:1 |
| Solarized Dark | textSecondary | `#93a1a1` → `#b8c7c7` | secondary 4.5:1 and Lc 60 on all three surfaces |
| Solarized Dark | textTertiary | `#839496` → `#a0b1b3` | tertiary 4.5:1 and Lc 45 on all three surfaces |
| Solarized Dark | link | `#268bd2` → `#70ceff` | link 4.5:1 and Lc 60 on all three surfaces |
| Solarized Dark | accent | `#6c71c4` → `#6a6fc2` | white label on filled accent (buttons, switches) needs 4.5:1 |
| Solarized Light | text | `#073642` → `#002c38` | text 7:1 and Lc 75 on all three surfaces |
| Solarized Light | textSecondary | `#586e75` → `#42575e` | secondary 4.5:1 and Lc 60 on all three surfaces |
| Solarized Light | textTertiary | `#657b83` → `#495e66` | tertiary 4.5:1 and Lc 45 on all three surfaces |
| Solarized Light | link | `#268bd2` → `#005497` | link 4.5:1 and Lc 60 on all three surfaces |
| Solarized Light | accent | `#6c71c4` → `#6a6fc2` | white label on filled accent (buttons, switches) needs 4.5:1 |
| Everforest Dark | text | `#d3c6aa` → `#ebdec1` | text 7:1 and Lc 75 on all three surfaces |
| Everforest Dark | textSecondary | `#9da9a0` → `#bcc9bf` | secondary 4.5:1 and Lc 60 on all three surfaces |
| Everforest Dark | textTertiary | `#859289` → `#a9b7ad` | tertiary 4.5:1 and Lc 45 on all three surfaces |
| Everforest Dark | link | `#7fbbb3` → `#94d1c9` | link 4.5:1 and Lc 60 on all three surfaces |
| Everforest Dark | accent | `#a7c080` → `#687e41` | white label on filled accent (buttons, switches) needs 4.5:1 |
| Everforest Dark | courseColors (7) | `#e67e80` → `#dd7678`, `#e69875` → `#ce8260`, `#dbbc7f` → `#ae9054`, `#a7c080` → `#859d5f`, `#83c092` → `#66a276`, `#7fbbb3` → `#649f98`, `#d699b6` → `#be83a0` | white hero title needs 3:1 |
| Dracula | textTertiary | `#6272a4` → `#a3b5eb` | tertiary 4.5:1 and Lc 45 on all three surfaces |
| Dracula | accent | `#bd93f9` → `#8c62c4` | white label on filled accent (buttons, switches) needs 4.5:1 |
| Dracula | courseColors (6) | `#ffb86c` → `#ca8638`, `#f1fa8c` → `#959b26`, `#50fa7b` → `#00ac2b`, `#8be9fd` → `#40a1b4`, `#bd93f9` → `#aa80e5`, `#ff79c6` → `#e965b2` | white hero title needs 3:1 |

## Verified against upstream on 2026-10-20

Every riced palette was compared with the upstream source (official palette files fetched from
the repositories named in each theme's `source`) and each repo's LICENSE file was read.

Corrected (the value had been written from memory and did not match upstream):

- **Rosé Pine Dawn `text`**: `#575279` was the pre-2023 value; the current official Dawn text is
  `#464261` (rose-pine-palette `palette.json`, rose-pine/neovim). It passes the floors unadjusted, so
  the old `#575279` → `#4d486e` adjustment is gone. `nav` (Dawn's darkest official colour, its text)
  changed from `#575279` to `#464261` to match.
- **Tokyo Night `surface`**: `#24283b` is Tokyo Night *Storm*'s background, not a Night value. Now
  `#292e42` (`bg_highlight`), with `surfaceRaised` `#3b4261` (`fg_gutter`) and `border` `#545c7e`
  (`dark3`) stepping on from it, all from `tokyonight_night.lua`. The lighter steps needed fresh
  lightness-only nudges (OKLCH, 0.002 steps) on text, textSecondary, textTertiary and link (table above).
- **Dracula `surface`**: was a derived 50% mix (`#363848`); now the official "Background Light"
  `#343746` from the spec page. `source` changed to https://draculatheme.com/spec (the
  `/contribute` page is not the palette). No other Dracula value needed a new adjustment.
- **Tokyo Night licence**: README said MIT; the repository is Apache-2.0 (corrected above).

Confirmed against upstream, no change: Catppuccin Mocha and Latte (catppuccin/palette
`palette.json`), Nord (nord.css; the `#616e88` start value is nord-vim's "brightened nord3"),
Gruvbox Dark and Light (`colors/gruvbox.vim`), Rosé Pine (all 12 roles plus `highlight_med` for
the border), Solarized Dark and Light (README palette table), Everforest Dark medium
(`palette.md`), and the remaining Tokyo Night and Dracula values.

Licence findings (LICENSE files read):

- MIT: Catppuccin, Nord (`license`), Rosé Pine, Solarized (MIT text, no title line), Everforest,
  Dracula (dracula-theme; the draculatheme.com spec page itself states no licence).
- **Apache-2.0: Tokyo Night** (folke/tokyonight.nvim). Colour values are facts; nothing is copied
  from the repo, but if a notice is ever wanted, this is the one theme that has a NOTICE-style obligation.
- **Gruvbox: no LICENSE file** in morhetz/gruvbox (GitHub reports none). The README says "MIT/X11"
  and `package.json` says MIT, so MIT is declared but not shipped as a file. Treat as unclear.

## Run the checker

```
python3 -I design/spec/themes/check_themes.py        # every pair
python3 -I design/spec/themes/check_themes.py -q     # failures and the summary only
```

Exit code 1 if any pair misses a floor. Floors (WCAG 2 ratio and APCA Lc, both required):
text 7:1 / Lc 75, textSecondary 4.5:1 / Lc 60, textTertiary 4.5:1 / Lc 45, link 4.5:1 / Lc 60,
each on bg, surface and surfaceRaised; navText on nav 4.5:1 / Lc 60; white on `accent` 4.5:1;
white on each `courseColors` entry 3:1. `"school"` roles resolve for the pilot school the same way
`check_palettes.py` does. Numbers are a floor, not the authority: rendered specimens get the last word.

## Format migration and High Contrast pass (Design lead, 2026-10-20)
- All files now use the **agreed theme file v1** (`design/spec/rice.md`):
  `"$b2c": "theme", "v": 1`, `palette.<scheme>`, and course colours in
  `cards.colors.list` (they were `courseColors` above).
- `check_themes.py` has a **High Contrast (AAA) pass** that mirrors
  `surfaces/palette.css` under Canvas's HC flag:
  - secondary and tertiary text are promoted to text
  - control borders use tertiary (≥ 3:1)
  - links: dark `oklch(L .93, C ≤ .08)`, light `L ≤ .36`, ≥ 7:1 on every surface
  - accent: L .42 (dark), ≤ .42 (light), so white is ≥ 7:1

  All 17 themes pass.

## Shipping set (Dev, 2026-10-20)
**Gruvbox Dark and Gruvbox Light are not shipped** for now, because
morhetz/gruvbox has no LICENSE file. The files stay here as a record, and 15
presets ship. The light-scheme High Contrast fallback uses Dev's light **High
contrast** preset.

## Craft warnings (Design lead, 2026-10-20)
`check_themes.py` prints non-failing **warn** lines for the measurable parts of
the "not hacky" list:
- a link too close to body text (ΔEok < 0.10 or link chroma < 0.05)
- two course colours hard to tell apart (ΔEok < 0.045)
- a riced theme with its own link or accent but no `cards.colors.list`

Fixes from the first run:
- Tokyo Night's link is now its official cyan `#7dcfff` (it was `#9dc7ff`,
  ΔEok 0.094 from text).
- Everforest dropped `#66a276`, which was too close to `#859d5f`, leaving 6
  course colours.

The High contrast presets keep Canvas's own course colours on purpose, so
their "no course colours" warning is expected.
