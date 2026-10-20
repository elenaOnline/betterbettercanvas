import { widths } from './index.ts';
export function PageWidth({ value, onChange }: { value: keyof typeof widths; onChange(value: keyof typeof widths): void }) {
  return <fieldset class="b2c-page-width"><legend>Page width</legend>
    {(Object.keys(widths) as (keyof typeof widths)[]).map(width => <label key={width}>
      <input type="radio" name="b2c-page-width" value={width} checked={value === width} onChange={() => onChange(width)} />
      {width[0]!.toUpperCase() + width.slice(1)}
    </label>)}
  </fieldset>;
}
