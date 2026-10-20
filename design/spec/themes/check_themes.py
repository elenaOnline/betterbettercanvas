#!/usr/bin/env python3
"""Check every bundled b²c theme (*.b2c-theme.json in this folder).
Run: python3 -I design/spec/themes/check_themes.py [-q]   (-q prints failures and the summary only)
For each theme with a palette: text / textSecondary / textTertiary / link on bg, surface and
surfaceRaised against the floors below (WCAG 2 ratio AND APCA Lc), navText on nav, white on the
accent fill (filled buttons), and white on every courseColor (large hero title, 3:1).
"school" roles resolve for the pilot school like check_palettes.py does. Exits 1 if anything misses a floor.
Numbers are a floor, not the authority: rendered specimens get the last word."""
import json, sys, re, pathlib

HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from oklch import hex_to_oklch, oklch_to_hex

def lin(c):
    c /= 255
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def rgb(h):
    h = h.lstrip('#'); return [int(h[i:i+2], 16) for i in (0, 2, 4)]

def rel_lum(h):
    r, g, b = map(lin, rgb(h)); return 0.2126*r + 0.7152*g + 0.0722*b

def wcag(fg, bg):
    a, b = sorted([rel_lum(fg), rel_lum(bg)], reverse=True); return (a+0.05)/(b+0.05)

def apca(fg, bg):  # APCA-W3 0.0.98G-4g
    def y(h):
        r, g, b = [(c/255) ** 2.4 for c in rgb(h)]
        v = 0.2126729*r + 0.7151522*g + 0.0721750*b
        return v + (0.022 - v) ** 1.414 if v < 0.022 else v
    yt, yb = y(fg), y(bg)
    if abs(yb - yt) < 0.0005: return 0.0
    if yb > yt:
        s = (yb ** 0.56 - yt ** 0.57) * 1.14
        return 0 if s < 0.1 else (s - 0.027) * 100
    s = (yb ** 0.65 - yt ** 0.62) * 1.14
    return 0 if s > -0.1 else (s + 0.027) * 100

# role -> (min WCAG ratio, min |APCA Lc|)
FLOORS = {'text': (7.0, 75), 'textSecondary': (4.5, 60), 'textTertiary': (4.5, 45), 'link': (4.5, 60)}
SURFACES = ['bg', 'surface', 'surfaceRaised']
ROLES = ['bg', 'surface', 'surfaceRaised', 'border', 'text', 'textSecondary', 'textTertiary', 'link',
         'accent', 'nav', 'navText', 'success', 'warning', 'danger']
the pilot school = {'link': '#005F85', 'nav': '#213921', 'primary': '#213921'}
CANVAS = {'link': '#0e68b3', 'nav': '#334451', 'primary': '#2b7abc'}  # Canvas's default brand
BRANDS = {'the pilot school': the pilot school, 'Canvas default': CANVAS}
HEX = re.compile(r'^#[0-9a-f]{6}$')

def resolve(p, scheme='dark', brand=None):
    """'school' roles as palette.css derives them for the scheme (the pilot school brand).
    Light schemes use the school's own link and primary (they were made for
    light pages); dark schemes lift them (dark-mode.md §4)."""
    the pilot school = brand or BRANDS['the pilot school']  # the sample school brand for "school" roles
    q = dict(p)
    if scheme == 'light':
        if q['link'] == 'school': q['link'] = the pilot school['link']
        if q['accent'] == 'school': q['accent'] = the pilot school['primary']
    if q['link'] == 'school':
        L, C, H = hex_to_oklch(the pilot school['link']); q['link'] = oklch_to_hex(0.80, min(C, 0.11), H)
    if q['nav'] == 'school':
        q['nav'] = the pilot school['nav'] if wcag(q['navText'], the pilot school['nav']) >= 4.5 else q['surface']
    if q['accent'] == 'school':
        L, C, H = hex_to_oklch(the pilot school['primary']); q['accent'] = oklch_to_hex(0.50, max(C, 0.08), H)
    return q

def hc_roles(p, scheme):
    """Roles as palette.css computes them under Canvas High Contrast."""
    from oklch import hex_to_oklch, oklch_to_hex
    q = dict(p)
    q['border'] = p['textTertiary']
    q['textSecondary'] = q['textTertiary'] = p['text']
    L, C, H = hex_to_oklch(p['link']); A = hex_to_oklch(p['accent'])
    if scheme == 'dark':
        q['link'] = oklch_to_hex(0.93, min(C, 0.08), H)
        q['accent'] = oklch_to_hex(0.42, A[1], A[2])
    else:
        q['link'] = oklch_to_hex(min(L, 0.36), C, H)
        q['accent'] = oklch_to_hex(min(A[0], 0.42), A[1], A[2])
    return q

# Canvas's own course colour picker presets: used for the checkbox-fill check
# when a theme carries no course colours of its own.
CANVAS_COURSE = ['#bd3c14', '#ff2717', '#e71f63', '#8f3e97', '#65499d', '#4554a4', '#1770ab', '#0b9be3',
                 '#06a3b7', '#009688', '#009606', '#8d9900', '#d97900', '#fd5d10', '#f06291', '#111111',
                 '#74919b', '#525252']

def checkbox_fill(c, scheme):
    """The to-do checkbox fill: course colour clamped (todo-views.md): L <= .55 light, >= .74 dark."""
    L, C, H = hex_to_oklch(c)
    return oklch_to_hex(min(L, 0.55), C, H) if scheme == 'light' else oklch_to_hex(max(L, 0.74), C, H)

def main():
    quiet = '-q' in sys.argv
    args = [pathlib.Path(a) for a in sys.argv[1:] if not a.startswith('-')]
    files = args or sorted(HERE.glob('*.b2c-theme.json'))
    bad = 0; n = 0
    def say(s):
        if not quiet: print(s)
    for f in files:
        t = json.loads(f.read_text())
        if t.get('$b2c') != 'theme' or t.get('v') != 1 or not t.get('name'):
            print(f'FAIL {f.name}: needs "$b2c": "theme", "v": 1 and a name'); bad += 1; continue
        n += 1
        if 'palette' not in t:
            say(f"\n{t['name']} ({f.name}): identity theme, no palette, nothing to check"); continue
        course = t.get('cards', {}).get('colors', {}).get('list', [])
        for scheme, raw in t['palette'].items():
            miss = [r for r in ROLES if r not in raw]
            if miss: print(f'FAIL {f.name} [{scheme}]: missing roles {miss}'); bad += 1; continue
            for r in ROLES:
                if raw[r] != 'school' and not HEX.match(raw[r]): print(f'FAIL {f.name}: {r} {raw[r]!r} is not #rrggbb lowercase'); bad += 1
            schools = list(BRANDS.items()) if any(raw[r] == 'school' for r in ('link', 'accent', 'nav')) else [('', None)]
            for bname, brand in schools:
                p = resolve(raw, scheme, brand)
                tag = f"{t['name']} · {scheme}" + (f" @ {bname}" if bname else '')
                say(f"\n{tag}  {f.name}")
                if bname:
                    say(f"  school @ {bname}: link={p['link']} accent={p['accent']} nav={p['nav']}")
                rows = [(r, s_) for r in FLOORS for s_ in SURFACES] + [('navText', 'nav')]
                for fg, bgr in rows:
                    w, l = wcag(p[fg], p[bgr]), abs(apca(p[fg], p[bgr]))
                    fw, fl = FLOORS.get(fg, (4.5, 60))
                    ok = w >= fw and l >= fl; bad += not ok
                    if not ok or not quiet:
                        print(f"  {'ok ' if ok else 'LOW'} {fg:13} on {bgr:13} {w:5.2f}:1  Lc {l:5.1f}  (floor {fw}:1, Lc {fl})   [{tag}]")
                w = wcag('#ffffff', p['accent']); ok = w >= 4.5; bad += not ok
                if not ok or not quiet:
                    print(f"  {'ok ' if ok else 'LOW'} white on accent {p['accent']}  {w:5.2f}:1  (floor 4.5:1)   [{tag}]")
                # ── High Contrast pass (AAA), mirroring palette.css under Canvas's HC flag ──
                hc = hc_roles(p, scheme)
                for fg in ('text', 'link'):
                    for bgr in SURFACES:
                        w = wcag(hc[fg], hc[bgr]); ok = w >= 7.0; bad += not ok
                        if not ok or not quiet:
                            print(f"  {'ok ' if ok else 'LOW'} HC {fg:6} on {bgr:13} {w:5.2f}:1  (AAA 7:1)   [{tag}]")
                w = wcag('#ffffff', hc['accent']); ok = w >= 7.0; bad += not ok
                if not ok or not quiet:
                    print(f"  {'ok ' if ok else 'LOW'} HC white on accent {hc['accent']}  {w:5.2f}:1  (AAA 7:1)   [{tag}]")
                w = wcag(hc['border'], hc['bg']); ok = w >= 3.0; bad += not ok
                if not ok or not quiet:
                    print(f"  {'ok ' if ok else 'LOW'} HC control border on bg {w:5.2f}:1  (3:1)   [{tag}]")
                # ── Checkbox fill (ticked to-do): fill vs surface 3:1, tick mark on fill 3:1 ──
            tick = '#ffffff' if scheme == 'light' else p['bg']
            for c in (course or CANVAS_COURSE):
                fill = checkbox_fill(c, scheme)
                w1, w2 = wcag(fill, p['surface']), wcag(tick, fill)
                ok = w1 >= 3.0 and w2 >= 3.0; bad += not ok
                if not ok:
                    print(f"  LOW checkbox fill {c}→{fill}: vs surface {w1:.2f}:1, tick {w2:.2f}:1 (3:1 each)   [{tag}]")
                say_ok = None
            say(f"  info border vs bg {wcag(p['border'], p['bg']):.2f}:1 (non-text; aim 1.5-3); "
                    f"status on bg: " + ', '.join(f"{r} {wcag(p[r], p['bg']):.1f}" for r in ('success', 'warning', 'danger')))
        # ── Craft warnings (never failing): see the "not hacky" list in README ──
        import math
        def lab(h):
            L_, C_, H_ = hex_to_oklch(h); return (L_, C_ * math.cos(math.radians(H_)), C_ * math.sin(math.radians(H_)))
        for scheme, raw in t['palette'].items():
            if raw.get('link', 'school') != 'school' and HEX.match(raw.get('text', '')):
                d = math.dist(lab(raw['link']), lab(raw['text'])); c_ = hex_to_oklch(raw['link'])[1]
                if d < 0.10 or c_ < 0.05:
                    print(f"  warn link too close to body text (ΔEok {d:.3f}, link chroma {c_:.3f}; want ≥ 0.10 and ≥ 0.05)   [{t['name']} · {scheme}]")
        if len(course) > 1:
            m = min((math.dist(lab(a), lab(b)), a, b) for i, a in enumerate(course) for b in course[i + 1:])
            if m[0] < 0.045:
                print(f"  warn course colours {m[1]} and {m[2]} are hard to tell apart (ΔEok {m[0]:.3f}; want ≥ 0.045)   [{t['name']}]")
        if not course and any(v != 'school' for p_ in t['palette'].values() for k, v in p_.items() if k in ('link', 'accent')):
            print(f"  warn riced theme with its own link/accent but no cards.colors.list: Canvas's default course colours will clash   [{t['name']}]")
        for c in course:
            w = wcag('#ffffff', c); ok = w >= 3.0; bad += not ok
            if not ok or not quiet:
                print(f"  {'ok ' if ok else 'LOW'} white on course {c}  {w:5.2f}:1  (floor 3:1)   [{t['name']}]")
        if course and not 6 <= len(course) <= 8:
            preset = f.resolve().parent == HERE.resolve()
            print(f'  {"LOW" if preset else "warn"} cards.colors.list has {len(course)} entries (want 6-8; '
                  f'{"error for bundled presets" if preset else "warning only for imported or agent-written themes"})   [{t["name"]}]')
            bad += preset
    print(f"\n{n} themes, {'ALL PASS' if not bad else str(bad) + ' failing check(s)'}")
    sys.exit(1 if bad else 0)

if __name__ == '__main__':
    main()
