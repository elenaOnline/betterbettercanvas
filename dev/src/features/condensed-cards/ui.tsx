/** Native radios retain arrow-key behavior and expose the selected state. */
export function CardLookSegments({ label, standard, alternative, value, onChange }: {
  label: string; standard: string; alternative: string; value: boolean; onChange(value: boolean): void;
}) {
  const name = `b2c-${label.toLowerCase().replace(/\s+/g, '-')}`;
  return <fieldset class="b2c-card-look"><legend>{label}</legend>
    <label><input type="radio" name={name} checked={!value} onChange={() => onChange(false)} />{standard}</label>
    <label><input type="radio" name={name} checked={value} onChange={() => onChange(true)} />{alternative}</label>
  </fieldset>;
}
export const CardHeight = (props: { value: boolean; onChange(value: boolean): void }) =>
  <CardLookSegments label="Card height" standard="Standard" alternative="Condensed" {...props} />;
