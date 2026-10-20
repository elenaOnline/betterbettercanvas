// The built-in looks: Design's preset themes (design/spec/themes/, verified
// against upstream and checked by check_themes.py), bundled at build time as
// JSON imports (values are never copied: a unit test checks every file in
// design/spec/themes/ is listed here or in EXCLUDED). Third-party palettes carry their licence; the shipped notice
// is THEMES-NOTICE.txt next to this file.
//
// Gruvbox Dark and Gruvbox Light are left out: morhetz/gruvbox has no LICENSE
// file (GitHub reports no licence; only the README and package.json say MIT),
// so its licence isn't confirmed (checked 2026-10-20). Add them back here,
// and to THEMES-NOTICE.txt, once it is.

import type { Theme } from './format.ts';
import canvas from '../../../../design/spec/themes/canvas.b2c-theme.json';
import dark from '../../../../design/spec/themes/dark.b2c-theme.json';
import gray from '../../../../design/spec/themes/gray.b2c-theme.json';
import black from '../../../../design/spec/themes/black.b2c-theme.json';
import warm from '../../../../design/spec/themes/warm.b2c-theme.json';
import catppuccinMocha from '../../../../design/spec/themes/catppuccin-mocha.b2c-theme.json';
import catppuccinLatte from '../../../../design/spec/themes/catppuccin-latte.b2c-theme.json';
import nord from '../../../../design/spec/themes/nord.b2c-theme.json';
import rosePine from '../../../../design/spec/themes/rose-pine.b2c-theme.json';
import rosePineDawn from '../../../../design/spec/themes/rose-pine-dawn.b2c-theme.json';
import tokyoNight from '../../../../design/spec/themes/tokyo-night.b2c-theme.json';
import solarizedDark from '../../../../design/spec/themes/solarized-dark.b2c-theme.json';
import solarizedLight from '../../../../design/spec/themes/solarized-light.b2c-theme.json';
import everforestDark from '../../../../design/spec/themes/everforest-dark.b2c-theme.json';
import dracula from '../../../../design/spec/themes/dracula.b2c-theme.json';
import paper from '../../../../design/spec/themes/paper.b2c-theme.json';
import sepia from '../../../../design/spec/themes/sepia.b2c-theme.json';
import highContrastLight from '../../../../design/spec/themes/high-contrast-light.b2c-theme.json';
import highContrastDark from '../../../../design/spec/themes/high-contrast-dark.b2c-theme.json';

export interface Licence {
  spdx: 'MIT' | 'Apache-2.0';
  holder: string;
  url: string;
}

export interface Preset {
  /** File id, e.g. "nord". */
  id: string;
  theme: Theme;
  /** Third-party palettes only (b²c's own presets have none). */
  licence?: Licence;
}

const MIT = (holder: string, url: string): Licence => ({ spdx: 'MIT', holder, url });

export const PRESETS: readonly Preset[] = [
  { id: 'canvas', theme: canvas as Theme },
  { id: 'dark', theme: dark as Theme },
  { id: 'gray', theme: gray as Theme },
  { id: 'black', theme: black as Theme },
  { id: 'warm', theme: warm as Theme },
  { id: 'paper', theme: paper as Theme },
  { id: 'sepia', theme: sepia as Theme },
  { id: 'high-contrast-light', theme: highContrastLight as Theme },
  { id: 'high-contrast-dark', theme: highContrastDark as Theme },
  { id: 'catppuccin-mocha', theme: catppuccinMocha as Theme, licence: MIT('Copyright (c) 2021 Catppuccin', 'https://github.com/catppuccin/catppuccin/blob/main/LICENSE') },
  { id: 'catppuccin-latte', theme: catppuccinLatte as Theme, licence: MIT('Copyright (c) 2021 Catppuccin', 'https://github.com/catppuccin/catppuccin/blob/main/LICENSE') },
  { id: 'nord', theme: nord as Theme, licence: MIT('Copyright (c) 2016-present Sven Greb', 'https://github.com/nordtheme/nord/blob/develop/license') },
  { id: 'rose-pine', theme: rosePine as Theme, licence: MIT('Copyright (c) 2023 Rosé Pine', 'https://github.com/rose-pine/rose-pine-theme/blob/main/LICENSE') },
  { id: 'rose-pine-dawn', theme: rosePineDawn as Theme, licence: MIT('Copyright (c) 2023 Rosé Pine', 'https://github.com/rose-pine/rose-pine-theme/blob/main/LICENSE') },
  { id: 'tokyo-night', theme: tokyoNight as Theme, licence: { spdx: 'Apache-2.0', holder: 'Folke Lemaitre (folke/tokyonight.nvim)', url: 'https://github.com/folke/tokyonight.nvim/blob/main/LICENSE' } },
  { id: 'solarized-dark', theme: solarizedDark as Theme, licence: MIT('Copyright (c) 2011 Ethan Schoonover', 'https://github.com/altercation/solarized/blob/master/LICENSE') },
  { id: 'solarized-light', theme: solarizedLight as Theme, licence: MIT('Copyright (c) 2011 Ethan Schoonover', 'https://github.com/altercation/solarized/blob/master/LICENSE') },
  { id: 'everforest-dark', theme: everforestDark as Theme, licence: MIT('Copyright (c) 2019 sainnhe', 'https://github.com/sainnhe/everforest/blob/master/LICENSE') },
  { id: 'dracula', theme: dracula as Theme, licence: MIT('Copyright (c) 2023 Dracula Theme', 'https://github.com/dracula/dracula-theme/blob/main/LICENSE') },
];

/** Left out until their licence is confirmed. */
export const EXCLUDED: Record<string, string> = {
  'gruvbox-dark': 'morhetz/gruvbox has no LICENSE file; its MIT/X11 claim (README, package.json) is unconfirmed.',
  'gruvbox-light': 'morhetz/gruvbox has no LICENSE file; its MIT/X11 claim (README, package.json) is unconfirmed.',
};

export const preset = (id: string): Theme | undefined => PRESETS.find(p => p.id === id)?.theme;
