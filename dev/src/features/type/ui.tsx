import { fonts, selectedStack, type Font } from './fonts.ts';
export function FontSettings({ family, localFamily, dyslexia = false, onChange }: {
  family: Font; localFamily: string; dyslexia?: boolean;
  onChange(family: Font, localFamily: string): void;
}) {
  return <div class="b2c-font-settings">
    <label for="b2c-font-choice">Font</label>
    <select id="b2c-font-choice" value={family} onChange={e => onChange(e.currentTarget.value as Font, localFamily)}>
      {fonts.map(font => <option key={font} value={font} style={{ fontFamily: font === 'Installed' || font === 'System' || font === 'Canvas default' ? selectedStack(font, localFamily) : `"${font}"` }}>{font === 'Installed' ? 'A font installed on this Mac' : font}</option>)}
    </select>
    {family === 'Installed' && <label>Installed font name<input type="text" maxLength={100} value={localFamily} onChange={e => onChange(family, e.currentTarget.value)} /></label>}
    <p role="status">{dyslexia ? 'Canvas’s dyslexia font is active. Your font choice is paused on this page.' : ''}</p>
  </div>;
}
