import { CardLookSegments } from '../condensed-cards/ui.tsx';
export const CardStyle = (props: { value: boolean; onChange(value: boolean): void }) =>
  <CardLookSegments label="Card style" standard="Standard" alternative="Gradient" {...props} />;
