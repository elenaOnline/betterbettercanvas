export const CardOverlay = ({ value, onChange }: { value: boolean; onChange(value: boolean): void }) =>
  <label>Color overlay on images<input type="checkbox" role="switch" checked={value} onChange={e => onChange(e.currentTarget.checked)} /></label>;
