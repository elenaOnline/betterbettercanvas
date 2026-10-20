// options_page: the b²c Studio (design/spec/surfaces/studio.md). It replaces
// the v1 settings page; the settings rows live on as its Features mode
// (features.tsx), and first run, Sites, Backup and Diagnostics with them.
import { schema as registrySchema } from '../../core/registry.ts';
import studioCss from '../studio/studio.css';
import studioAdd from '../studio/studio.add.css';
import { startStudio } from '../studio/studio.ts';
import { initSettings } from '../shared/state.ts';
import { loadSetup } from './setup.tsx';

const style = document.createElement('style');
style.textContent = studioCss + '\n' + studioAdd;
document.head.append(style);
document.body.classList.add('studio');
document.title = 'b²c Studio';

void (async () => {
  await Promise.all([initSettings(registrySchema), loadSetup()]);
  await startStudio(document.getElementById('app')!);
})();
