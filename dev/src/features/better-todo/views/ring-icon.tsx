// The view switcher's Ring glyph: a round ring with one filled arc, because
// the icon depicts its data (Design 2026-10-20). The only round thing in the
// switcher; its segment stays square. Exempt from the square audit by path.

export const RingIcon = () => (
  <svg class="icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <circle cx="8" cy="8" r="5.25" fill="none" stroke="currentColor" stroke-width="2" stroke-opacity=".35" />
    <path d="M8 2.75A5.25 5.25 0 0 1 13.25 8" fill="none" stroke="currentColor" stroke-width="2" />
  </svg>
);
