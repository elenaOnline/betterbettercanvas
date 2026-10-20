#!/usr/bin/env python3
"""canvasread: read Canvas (any school) from a script or an agent, with no browser.

Python 3.9+, standard library only. Import it or run it.

Two readers:

  1. The calendar feed (ICS).  Needs no login: Canvas gives every user a private
     link (Calendar -> "Calendar Feed").  It shows dated assignments and calendar
     events from 30 days ago to a year ahead.  parse_feed() / fetch_feed().
  2. The REST API, GET only, with a personal access token.  class Canvas.  It
     refuses anything that is not on a read-safe allowlist (see check_read_safe).

Command line:

  python3 canvasread.py feed <url-or-file> [--course ID] [--kind K] [--tz ZONE] [--json]
  python3 canvasread.py rest <base_url> --token-file F planner|courses|assignments|modules|me [ID]
                              [--start D --end D] [--tz ZONE] [--json | --raw]

  e.g.  python3 canvasread.py feed ./canvas_feed.url --course 4821
        python3 canvasread.py rest https://canvas.example.edu --token-file ~/.config/canvas/token assignments 4821

The feed link and the token are secrets: error messages never echo them.
"""
from __future__ import annotations

import argparse
import datetime as dt
import html.parser
import json
import os
import re
import shlex
import ssl
import stat
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

__all__ = [
    "CanvasError", "FeedError", "CanvasUnavailable", "NotReadSafe",
    "parse_feed", "fetch_feed", "for_course",
    "Canvas", "check_read_safe", "read_token_file",
    "summarize_planner", "summarize_assignment", "summarize_course", "file_ids_in_html", "html_links",
]

SAFETY_DOC = "research/canvas-read-safety.md"
USER_AGENT = "canvasread/1 (read-only; personal use)"


class CanvasError(Exception):
    """Anything that went wrong reading Canvas."""


class FeedError(CanvasError):
    """The calendar feed could not be fetched or is not a calendar."""


class CanvasUnavailable(CanvasError):
    """HTTP 401/403/404: the feature is off at this school, or the token lacks access."""

    def __init__(self, message, status=None):
        super().__init__(message)
        self.status = status


class NotReadSafe(CanvasError):
    """Refused before any network: the request is not on the read-safe allowlist."""


# --------------------------------------------------------------------------- time zones

def _resolve_tz(tz):
    """tz arg -> (tzinfo or None meaning 'the system zone', warning or None)."""
    if tz is None:
        return None, None
    if isinstance(tz, dt.tzinfo):
        return tz, None
    name = str(tz).strip()
    if name.upper() in ("UTC", "Z", "GMT"):
        return dt.timezone.utc, None
    try:
        from zoneinfo import ZoneInfo
    except ImportError:
        return dt.timezone.utc, "zoneinfo is not available; times are kept in UTC"
    try:
        return ZoneInfo(name), None
    except Exception:
        raise ValueError("unknown time zone %r (use an IANA name such as America/Los_Angeles)" % name)


def _localize(naive, tzinfo):
    """A wall-clock time in tzinfo (None = the system zone)."""
    return naive.astimezone() if tzinfo is None else naive.replace(tzinfo=tzinfo)


def _convert(aware, tzinfo):
    return aware.astimezone() if tzinfo is None else aware.astimezone(tzinfo)


def _iso(d):
    return d.isoformat(timespec="seconds") if d else None


def _iso_from_canvas(value, tzinfo):
    """Canvas JSON time ('2026-10-24T06:59:00Z') -> ISO 8601 in tzinfo. Passes None and oddities through."""
    if not value or not isinstance(value, str):
        return value or None
    try:
        s = value.strip()
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        d = dt.datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return _iso(_convert(d, tzinfo))
    except ValueError:
        return value


# --------------------------------------------------------------------------- ICS feed

_ICS_TIME = re.compile(r"^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$", re.I)
_FOLD_BYTES = re.compile(rb"(?:\r\n|\n|\r)[ \t]")
_FOLD = re.compile(r"(?:\r\n|\n|\r)[ \t]")
_NEWLINE = re.compile(r"\r\n|\n|\r")
_ESC = re.compile(r"\\(.)", re.S)


def _unescape(v):
    """RFC 5545 TEXT unescaping in one pass (so a literal backslash followed by n stays two characters)."""
    def one(m):
        c = m.group(1)
        if c in "nN":
            return "\n"
        if c in "\\,;":
            return c
        return m.group(0)
    return _ESC.sub(one, v)


def _split_unquoted(s, sep):
    parts, cur, q = [], [], False
    for ch in s:
        if ch == '"':
            q = not q
        if ch == sep and not q:
            parts.append("".join(cur))
            cur = []
        else:
            cur.append(ch)
    parts.append("".join(cur))
    return parts


def _content_line(line):
    """'NAME;P=v:value' -> (NAME, {P: v}, value), or None if there is no colon."""
    q = False
    for i, ch in enumerate(line):
        if ch == '"':
            q = not q
        elif ch == ":" and not q:
            head, value = line[:i], line[i + 1:]
            break
    else:
        return None
    parts = _split_unquoted(head, ";")
    params = {}
    for p in parts[1:]:
        k, _, v = p.partition("=")
        params[k.upper()] = v.strip('"')
    return parts[0].strip().upper(), params, value


def _events(text):
    """Yield {NAME: (params, value)} for each VEVENT. Nested components (VALARM) are skipped."""
    ev, depth = None, 0
    for line in _NEWLINE.split(text):
        if not line:
            continue
        cl = _content_line(line)
        if cl is None:
            continue
        name, params, value = cl
        if name == "BEGIN":
            if value.strip().upper() == "VEVENT" and ev is None:
                ev, depth = {}, 0
            elif ev is not None:
                depth += 1
        elif name == "END":
            if ev is not None:
                if depth:
                    depth -= 1
                elif value.strip().upper() == "VEVENT":
                    yield ev
                    ev = None
        elif ev is not None and depth == 0:
            ev.setdefault(name, (params, value))


def _parse_ics_time(value, params, out_tz, warns):
    """-> (aware datetime in out_tz or None, all_day)."""
    m = _ICS_TIME.match(value.strip())
    if not m:
        warns.append("unreadable time %r" % value)
        return None, False
    y, mo, d, h, mi, s, z = m.groups()
    try:
        if h is None:                                   # a date: all day
            return _localize(dt.datetime(int(y), int(mo), int(d)), out_tz), True
        naive = dt.datetime(int(y), int(mo), int(d), int(h), int(mi), int(s or 0))
    except ValueError:
        warns.append("invalid time %r" % value)
        return None, False
    if z:
        return _convert(naive.replace(tzinfo=dt.timezone.utc), out_tz), False
    tzid = params.get("TZID")
    if tzid:
        try:
            from zoneinfo import ZoneInfo
            return _convert(naive.replace(tzinfo=ZoneInfo(tzid)), out_tz), False
        except Exception:
            warns.append("unknown TZID %r; read as %s time" % (tzid, "the output zone"))
    return _localize(naive, out_tz), False              # floating: wall clock in the output zone


class _LinkParser(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.links, self._cur = [], None

    def handle_starttag(self, tag, attrs):
        if tag == "a":
            a = dict(attrs)
            self._cur = {"href": a.get("href") or "", "text": [], "api": a.get("data-api-endpoint") or ""}

    def handle_data(self, data):
        if self._cur is not None:
            self._cur["text"].append(data)

    def handle_endtag(self, tag):
        if tag == "a" and self._cur is not None:
            c, self._cur = self._cur, None
            self.links.append(c)


_FILE_ID = re.compile(r"/files/(\d+)(?![\d])")


def _file_id(*urls):
    for u in urls:
        if u:
            m = _FILE_ID.search(urllib.parse.urlsplit(u).path)
            if m:
                return m.group(1)
    return None


def html_links(html_text):
    """Links in an HTML fragment -> [{href, text, file_id}]. file_id (str) is set for Canvas file links
    (/files/<id>, /courses/<cid>/files/<id>, /api/v1/files/<id>), else None."""
    if not html_text:
        return []
    p = _LinkParser()
    try:
        p.feed(html_text)
        p.close()
    except Exception:
        pass
    out = []
    for c in p.links:
        text = re.sub(r"\s+", " ", "".join(c["text"])).strip()
        out.append({"href": c["href"], "text": text, "file_id": _file_id(c["href"], c["api"])})
    return out


def file_ids_in_html(html_text):
    """Canvas file ids linked from an HTML fragment, in order, without repeats."""
    seen, out = set(), []
    for l in html_links(html_text):
        if l["file_id"] and l["file_id"] not in seen:
            seen.add(l["file_id"])
            out.append(l["file_id"])
    return out


_COURSE_IN_URL = re.compile(r"(?<![A-Za-z0-9])course_(\d+)(?!\d)|/courses/(\d+)(?!\d)")
_UID = re.compile(r"^event-(.+)-(\d+)$")
_TRAILING_CODE = re.compile(r"\s*\[([^\[\]]*)\]\s*$")


def _course_id_from_url(url):
    if not url:
        return None
    sp = urllib.parse.urlsplit(url)
    for chunk in (sp.query, sp.path):                   # include_contexts=course_N first, then /courses/N
        m = _COURSE_IN_URL.search(chunk)
        if m:
            return m.group(1) or m.group(2)
    return None


def parse_feed(ics_text, tz=None, host=None):
    """Parse a Canvas calendar feed -> list of dicts, soonest first (undated last).

    ics_text: str or bytes.  tz: IANA name or tzinfo for the output (default: the system zone).
    host: fallback host for rebuilt URLs (default: the feed's own events say).

    Each item:
      id            'assignment:<id>' / 'calendar_event:<id>' (override events: the assignment they belong to)
      kind          'assignment' | 'calendar_event' | other event type from the UID
      override      True for per-section / per-student due-date events (UID event-assignment-override-N)
      uid, course_id (str|None), course_code (the trailing ' [CODE]' of SUMMARY), title
      due           ISO 8601 with offset (assignments only; all-day items: local midnight, all_day=True)
      due_date      'YYYY-MM-DD' in tz (assignments only)
      all_day, start, end, updated (DTSTAMP = the assignment's updated_at; the best change signal)
      url           https://<host>/courses/<cid>/assignments/<aid> (calendar events: the feed's own URL)
      calendar_url  the URL exactly as the feed gave it
      description   plain text ('' if none);  description_html (str|None)
      links         [{href, text, file_id}] from description_html; file_id marks Canvas file links
      locked_or_no_description  True when an assignment has no description at all in the feed (Canvas
                    leaves it out while the assignment is locked for you)
      location, warnings (only present when something was odd)
    """
    if isinstance(ics_text, bytes):
        ics_text = _FOLD_BYTES.sub(b"", ics_text).decode("utf-8-sig", "replace")
    else:
        ics_text = ics_text.lstrip("\ufeff")
    ics_text = _FOLD.sub("", ics_text)
    if "BEGIN:VCALENDAR" not in ics_text.upper():
        head = " ".join(ics_text[:60].split())
        raise FeedError("this is not an iCalendar feed (starts with %r). Canvas answers with a sign-in page "
                        "when the feed link is wrong or was reset." % head)
    out_tz, tz_warn = _resolve_tz(tz)
    raw = list(_events(ics_text))

    if host is None:
        hosts = {}
        for ev in raw:
            sp = urllib.parse.urlsplit(ev.get("URL", ({}, ""))[1].strip())
            if sp.netloc:
                hosts[(sp.scheme, sp.netloc)] = hosts.get((sp.scheme, sp.netloc), 0) + 1
        default_origin = max(hosts, key=hosts.get) if hosts else None
    else:
        default_origin = ("https", host) if "://" not in host else tuple(urllib.parse.urlsplit(host)[:2])

    items = []
    for ev in raw:
        warns = [tz_warn] if tz_warn else []
        get = lambda n: ev.get(n, ({}, ""))
        uid = get("UID")[1].strip()
        cal_url = get("URL")[1].strip()
        sp = urllib.parse.urlsplit(cal_url)
        origin = (sp.scheme, sp.netloc) if sp.netloc else default_origin

        m = _UID.match(uid)
        etype = m.group(1).replace("-", "_") if m else "event"
        uid_num = m.group(2) if m else None
        override = etype == "assignment_override"
        kind = "assignment" if etype in ("assignment", "assignment_override") else etype

        frag = re.match(r"assignment_(\d+)", sp.fragment or "")
        course_id = _course_id_from_url(cal_url)
        if kind == "assignment":
            aid = frag.group(1) if frag else (None if override else uid_num)
            item_id = "assignment:%s" % aid if aid else ("assignment_override:%s" % uid_num if uid_num else uid)
        else:
            aid = None
            item_id = "%s:%s" % (kind, uid_num) if uid_num else uid

        title = _unescape(get("SUMMARY")[1]).strip()
        cm = _TRAILING_CODE.search(title)
        course_code = None
        if cm:
            course_code = cm.group(1).strip() or None
            title = title[:cm.start()].rstrip()

        start, all_day = (None, False)
        if "DTSTART" in ev:
            start, all_day = _parse_ics_time(get("DTSTART")[1], get("DTSTART")[0], out_tz, warns)
        end = _parse_ics_time(get("DTEND")[1], get("DTEND")[0], out_tz, warns)[0] if "DTEND" in ev else None
        updated = _parse_ics_time(get("DTSTAMP")[1], get("DTSTAMP")[0], out_tz, warns)[0] if "DTSTAMP" in ev else None

        if kind == "assignment" and aid and course_id and origin:
            url = "%s://%s/courses/%s/assignments/%s" % (origin[0] or "https", origin[1], course_id, aid)
        else:
            url = cal_url or None

        desc = _unescape(get("DESCRIPTION")[1]).strip()
        desc_html = _unescape(ev["X-ALT-DESC"][1]).strip() if "X-ALT-DESC" in ev else None
        item = {
            "id": item_id, "kind": kind, "override": override, "uid": uid or None,
            "course_id": course_id, "course_code": course_code, "title": title,
            "due": _iso(start) if kind == "assignment" else None,
            "due_date": ("%04d-%02d-%02d" % (start.year, start.month, start.day)) if (start and kind == "assignment") else None,
            "all_day": all_day, "start": _iso(start), "end": _iso(end), "updated": _iso(updated),
            "url": url, "calendar_url": cal_url or None,
            "description": desc, "description_html": desc_html or None,
            "links": html_links(desc_html),
            "locked_or_no_description": kind == "assignment" and not desc and not desc_html,
            "location": _unescape(get("LOCATION")[1]).strip() or None,
        }
        if warns:
            item["warnings"] = warns
        items.append(item)
    items.sort(key=lambda i: (i["start"] is None, i["start"] or ""))
    return items


def _ssl_context():
    """The default context; certifi's CA bundle when the interpreter has no CA store of its own
    (python.org builds on macOS) and certifi is installed."""
    paths = ssl.get_default_verify_paths()
    have = (paths.cafile and os.path.exists(paths.cafile)) or (paths.capath and os.path.isdir(paths.capath))
    if not have:
        try:
            import certifi
            return ssl.create_default_context(cafile=certifi.where())
        except ImportError:
            pass
    return ssl.create_default_context()


def fetch_feed(source, timeout=30):
    """Read a calendar feed -> text (folded lines already joined).

    source: an https:// (or webcal://) URL, a path to a saved .ics, or a path to a small file that holds
    the link (like a canvas_feed.url).  Errors never include the link."""
    if not isinstance(source, str):
        source = os.fspath(source)
    s = source.strip()
    if re.match(r"^(https?|webcal)://", s, re.I):
        return _fetch_feed_url(s, timeout)
    path = os.path.expanduser(s)
    try:
        with open(path, "rb") as f:
            data = f.read()
    except OSError as e:
        raise FeedError("cannot read the feed file %s: %s" % (path, e.strerror or e))
    one = data.strip()
    if re.match(rb"^(https?|webcal)://\S+$", one, re.I):          # a file holding the link
        return _fetch_feed_url(one.decode("ascii", "replace"), timeout)
    return _FOLD_BYTES.sub(b"", data).decode("utf-8-sig", "replace")


def _fetch_feed_url(url, timeout):
    if url.lower().startswith("webcal://"):
        url = "https://" + url[9:]
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "text/calendar, */*"})
    try:
        with urllib.request.urlopen(req, timeout=timeout, context=_ssl_context()) as r:
            data = r.read()
    except urllib.error.HTTPError as e:
        hint = (" The link may have been reset: Canvas -> Calendar -> 'Calendar Feed' shows the current one."
                if e.code in (401, 403, 404) else "")
        raise FeedError("the calendar feed answered HTTP %s.%s" % (e.code, hint)) from None
    except urllib.error.URLError as e:
        raise FeedError("could not reach the calendar feed host (%s)" % (getattr(e, "reason", None) or "network error")) from None
    except (OSError, ValueError) as e:                  # timeouts, bad URL; never print the URL itself
        raise FeedError("could not read the calendar feed (%s)" % type(e).__name__) from None
    return _FOLD_BYTES.sub(b"", data).decode("utf-8-sig", "replace")


def _norm_course_id(course_id):
    s = str(course_id).strip()
    return re.sub(r"^(?:course|courses)[_:/]", "", s)


def for_course(items, course_id):
    """Items whose course_id equals course_id exactly (4821 does not match 482177).
    Accepts 4821, '4821', 'course_4821' or 'course:4821'."""
    want = _norm_course_id(course_id)
    return [i for i in items if i.get("course_id") is not None and str(i["course_id"]) == want]


# --------------------------------------------------------------------------- REST: the allowlist

# (path regex relative to /api/v1, params that must be present, what it is)
_ALLOW = [
    (r"users/self", (), "your identity"),
    (r"users/self/colors", (), "course colours (the list, not a single colour)"),
    (r"users/self/course_nicknames", (), "course nicknames (the list)"),
    (r"courses", (), "your courses"),
    (r"dashboard/dashboard_cards", (), "dashboard cards"),
    (r"planner/items", ("start_date", "end_date"), "the planner (dates are required: the default window is +-2 weeks)"),
    (r"courses/\d+/modules", (), "modules (include[]=items for their items)"),
    (r"courses/\d+/modules/\d+/items", (), "the items of one module (list only)"),
    (r"courses/\d+/assignment_groups", (), "assignment groups"),
    (r"courses/\d+/assignments", (), "assignments (list)"),
    (r"courses/\d+/pages", (), "page titles (no bodies)"),
    (r"courses/\d+/files", (), "file list"),
    (r"files/\d+", (), "one file's metadata (never its download)"),
    (r"courses/\d+/discussion_topics", (), "discussion topics (list)"),
    (r"announcements", ("context_codes",), "announcements (context_codes[] required)"),
]
_ALLOW_RE = [(re.compile(p), req, why) for p, req, why in _ALLOW]

# Specific reasons, checked first, for requests that look innocent but change state or are not allowlisted.
_HAZARDS = [
    (r"(^|/)(mark_read|mark_all_read|read_all|read|unread|subscribed)(/|$)", "mark-read and subscription endpoints change state"),
    (r"(^|/)grades(/|$)", "opening a Grades page fires bulk_mark_read and clears the 'new grade' dots; "
                          "read scores with assignments?include[]=submission instead"),
    (r"(^|/)submissions(/|$)", "submission endpoints are not on the allowlist; "
                               "use assignments?include[]=submission"),
    (r"^courses/\d+/discussion_topics/.+", "a single topic or its entries is a page view that marks read; list topics instead"),
    (r"^conversations", "opening an inbox thread marks it read"),
    (r"^planner(/overrides|/notes)|^planner_notes", "planner overrides and notes are writes (done/dismissed, to-dos)"),
    (r"modules/(items|\d+/items/\d+)", "a module item counts as a page view and can satisfy 'must view'"),
    (r"^files/\d+/.+|^courses/\d+/files/.+", "file download/preview/public_url count as views; "
                                            "use files/<id> for metadata only"),
    (r"^users/self/(colors|course_nicknames)/.+|dashboard_positions|^users/self/settings",
     "account preference endpoints change what every Canvas client shows"),
    (r"^courses/\d+/pages/.+", "a single page returns its body; list page titles instead"),
]
_HAZARDS_RE = [(re.compile(p), why) for p, why in _HAZARDS]


def _refuse(method, path, why):
    raise NotReadSafe("refused %s %s: %s. Only the read-safe list endpoints are allowed; "
                      "see %s (the 'Safe' table) in the betterbettercanvas repo." % (method, path, why, SAFETY_DOC))


def _param_pairs(params):
    """dict/list/None -> [(key, str)], repeating list values; None values are dropped."""
    pairs = []
    if not params:
        return pairs
    items = params.items() if hasattr(params, "items") else params
    for k, v in items:
        vals = v if isinstance(v, (list, tuple)) else [v]
        for x in vals:
            if x is None:
                continue
            if isinstance(x, bool):
                x = "true" if x else "false"
            elif isinstance(x, (dt.datetime, dt.date)):
                x = x.isoformat()
            pairs.append((str(k), str(x)))
    return pairs


def check_read_safe(method, path, params=None):
    """Raise NotReadSafe unless this is a GET of an allowlisted path.
    path is relative to /api/v1 ('courses/4821/assignments'), a '/api/v1/...' path, or has a '?query'.
    Returns (normalised path, [(key, value)]) for the request to send."""
    method = str(method).upper()
    pairs = _param_pairs(params)
    p = str(path)
    if "?" in p:
        p, _, q = p.partition("?")
        pairs = urllib.parse.parse_qsl(q, keep_blank_values=True) + pairs
    shown = p
    if method != "GET":
        _refuse(method, shown, "%s changes state and b2c only ever reads" % method)
    if re.search(r"[%\\\s;]|\.\.|//|#", p.strip("/")) or p != p.strip():
        _refuse(method, shown, "unusual characters in the path")
    p = p.strip("/")
    if p.startswith("api/v1/"):
        p = p[len("api/v1/"):]
    for rx, why in _HAZARDS_RE:
        if rx.search(p):
            _refuse(method, shown, why)
    for rx, required, _why in _ALLOW_RE:
        if rx.fullmatch(p):
            keys = {k[:-2] if k.endswith("[]") else k for k, v in pairs if v != ""}
            missing = [r for r in required if r not in keys]
            if missing:
                _refuse(method, shown, "missing required parameter(s): %s" % ", ".join(missing))
            if rx.pattern.endswith("/pages") and any(k == "include[]" and v == "body" for k, v in pairs):
                _refuse(method, shown, "include[]=body would fetch page bodies; b2c lists titles only")
            return p, pairs
    _refuse(method, shown, "not on the read-safe allowlist")


def read_token_file(path):
    """The token in a file that only you can read (mode 0600 or stricter, yours). Refuses otherwise."""
    p = os.path.expanduser(str(path))
    try:
        st = os.stat(p)
    except OSError as e:
        raise CanvasError("cannot read the token file %s: %s" % (p, e.strerror or e))
    if not stat.S_ISREG(st.st_mode):
        raise CanvasError("%s is not a regular file" % p)
    if st.st_mode & 0o077:
        raise CanvasError("%s is readable by other users (mode %s). Run: chmod 600 %s"
                          % (p, oct(st.st_mode & 0o777)[2:].rjust(3, "0"), shlex.quote(p)))
    if hasattr(os, "geteuid") and st.st_uid != os.geteuid():
        raise CanvasError("%s belongs to another user" % p)
    with open(p, "r", encoding="utf-8") as f:
        token = f.read().strip()
    if not token or re.search(r"\s", token):
        raise CanvasError("%s should hold the access token and nothing else" % p)
    return token


# --------------------------------------------------------------------------- REST: the client

class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


_REQUEST_LOCK = threading.Lock()                        # one request in flight, across every Canvas object
_LOOPBACK = ("localhost", "127.0.0.1", "::1")


def _parse_link_next(value):
    for m in re.finditer(r"<([^>]*)>([^,<]*)", value or ""):
        rels = re.search(r'rel="?([^";,]+)"?', m.group(2))
        if rels and "next" in rels.group(1).split():
            return m.group(1)
    return None


class Canvas:
    """Read-only Canvas REST client.  GET only; allowlisted paths only; one request at a time.

        c = Canvas("https://canvas.example.edu", token_file="~/.config/canvas/token")
        c.assignments(4821)

    The token is never printed, logged or put in an exception.  A token is only sent over https
    (or to localhost).  Every list is followed through Link rel="next" (the URLs are treated as
    opaque, but must stay on the same host and on the allowlist)."""

    def __init__(self, base_url, token=None, token_file=None, *, timeout=30, per_page=100,
                 low_water=50, max_pages=200, retries=3, sleep=time.sleep):
        if token and token_file:
            raise ValueError("pass token or token_file, not both")
        if token_file:
            token = read_token_file(token_file)
        u = urllib.parse.urlsplit(base_url if "://" in base_url else "https://" + base_url)
        path = u.path.rstrip("/")
        if path.endswith("/api/v1"):
            path = path[:-7]
        if u.scheme not in ("http", "https") or not u.netloc or path or u.query:
            raise ValueError("base_url should be the school's address, like https://canvas.example.edu")
        if token and u.scheme == "http" and (u.hostname or "") not in _LOOPBACK:
            raise CanvasError("refusing to send an access token over plain http to %s" % u.netloc)
        self.origin = "%s://%s" % (u.scheme, u.netloc)
        self._scheme_netloc = (u.scheme, u.netloc)
        self._token = token
        self.timeout, self.per_page, self.low_water = timeout, per_page, low_water
        self.max_pages, self.retries, self._sleep = max_pages, retries, sleep
        self.requests = 0
        handlers = [_NoRedirect()]
        if (u.hostname or "") in _LOOPBACK:
            handlers.append(urllib.request.ProxyHandler({}))
        if u.scheme == "https":
            handlers.append(urllib.request.HTTPSHandler(context=_ssl_context()))
        self._opener = urllib.request.build_opener(*handlers)

    def __repr__(self):
        return "Canvas(%r, token=%s)" % (self.origin, "set" if self._token else "none")

    # -- the one way out ----------------------------------------------------------------

    def request(self, method, path, params=None):
        """Check, then GET (following pagination). Lists come back as one list; objects as a dict."""
        path = str(path)
        if path.startswith(("http://", "https://")):
            sp = urllib.parse.urlsplit(path)
            if (sp.scheme, sp.netloc) != self._scheme_netloc:
                _refuse(str(method).upper(), "<other host>", "only %s may be read" % self.origin)
            path = sp.path + ("?" + sp.query if sp.query else "")
        rel, pairs = check_read_safe(method, path, params)
        if not any(k == "per_page" for k, _ in pairs):
            pairs = pairs + [("per_page", str(self.per_page))]
        url = "%s/api/v1/%s?%s" % (self.origin, rel, urllib.parse.urlencode(pairs))
        results, seen = None, set()
        for _page in range(self.max_pages):
            if url in seen:
                raise CanvasError("Canvas paginated in a loop; stopping")
            seen.add(url)
            headers, data = self._get(url, rel)
            if not isinstance(data, list):
                return data
            results = (results or []) + data
            nxt = _parse_link_next(headers.get("Link"))
            if not nxt:
                return results
            nxt = urllib.parse.urljoin(url, nxt)
            sp = urllib.parse.urlsplit(nxt)
            if (sp.scheme, sp.netloc) != self._scheme_netloc:
                raise CanvasError("Canvas sent a Link to another host; not following it")
            check_read_safe("GET", sp.path + ("?" + sp.query if sp.query else ""))
            url = nxt
        raise CanvasError("more than %d pages of %s; narrow the request" % (self.max_pages, rel))

    def get(self, path, params=None, **kw):
        merged = dict(params or {})
        merged.update(kw)
        return self.request("GET", path, merged)

    def _get(self, url, rel):
        """One HTTP GET with backoff. Returns (headers, parsed JSON)."""
        req = urllib.request.Request(url, method="GET", headers={
            "Accept": "application/json+canvas-string-ids", "User-Agent": USER_AGENT,
            **({"Authorization": "Bearer " + self._token} if self._token else {})})
        with _REQUEST_LOCK:
            for attempt in range(self.retries + 1):
                self.requests += 1
                try:
                    resp = self._opener.open(req, timeout=self.timeout)
                    status, headers, raw = resp.status, resp.headers, resp.read()
                    resp.close()
                except urllib.error.HTTPError as e:
                    status, headers = e.code, e.headers
                    try:
                        raw = e.read()
                    except Exception:
                        raw = b""
                except urllib.error.URLError as e:
                    raise CanvasError("could not reach %s (%s)" % (self.origin, getattr(e, "reason", "network error"))) from None
                except OSError as e:
                    raise CanvasError("could not read from %s (%s)" % (self.origin, type(e).__name__)) from None
                try:
                    remaining = float(headers.get("X-Rate-Limit-Remaining"))
                except (TypeError, ValueError):
                    remaining = None
                if remaining is not None and remaining < self.low_water:
                    self._sleep(min(10.0, 0.5 + (self.low_water - max(remaining, 0)) / float(self.low_water) * 4))
                text = raw.decode("utf-8-sig", "replace")
                throttled = status == 429 or (status == 403 and (
                    "rate limit" in text.lower() or (remaining is not None and remaining <= 0)))
                if throttled or status in (502, 503, 504):
                    if attempt < self.retries:
                        self._sleep(min(30.0, 2.0 ** attempt + 1))
                        continue
                    raise CanvasError("Canvas kept answering HTTP %s for /%s; try again later" % (status, rel))
                if status in (301, 302, 303, 307, 308):
                    raise CanvasUnavailable("/%s redirected (HTTP %s): the token is probably missing, expired or for "
                                            "another school" % (rel, status), status)
                if status in (401, 403, 404):
                    raise CanvasUnavailable(
                        "/%s answered HTTP %s: this is off at this school, or the token lacks access%s"
                        % (rel, status, " (401 usually means the token is wrong or expired)" if status == 401 else ""), status)
                if status >= 400:
                    raise CanvasError("Canvas answered HTTP %s for /%s" % (status, rel))
                text = re.sub(r"^\s*while\s*\(\s*1\s*\)\s*;?", "", text)
                if not text.strip():
                    return headers, None
                try:
                    return headers, json.loads(text)
                except ValueError:
                    raise CanvasError("Canvas did not answer JSON for /%s (a sign-in page?)" % rel) from None

    # -- convenience --------------------------------------------------------------------

    def me(self):
        return self.get("users/self")

    def courses(self, enrollment_state="active", include=("term",)):
        return self.get("courses", {"enrollment_state": enrollment_state, "include[]": list(include)})

    def dashboard_cards(self):
        return self.get("dashboard/dashboard_cards")

    def planner(self, start, end, filter=None, context_codes=None, all_courses=True):
        """Planner items between two dates (date, datetime or ISO string). Both are required."""
        if not start or not end:
            raise NotReadSafe("planner/items needs start_date and end_date (the default window is +-2 weeks)")
        inc = ["all_courses"] if all_courses else []
        return self.get("planner/items", {"start_date": _day(start), "end_date": _day(end), "filter": filter,
                                          "context_codes[]": context_codes, "include[]": inc or None})

    def assignments(self, course_id, include=("submission",), **params):
        """Assignments of a course: created_at, unlock_at, lock_at, due_at, points_possible, html_url,
        submission_types, has_submitted_submissions, description, and (include=('submission',)) your submission."""
        p = {"include[]": list(include) or None, "order_by": "due_at"}
        p.update(params)
        return self.get("courses/%s/assignments" % _cid(course_id), p)

    def assignment_groups(self, course_id, include=("assignments", "submission")):
        return self.get("courses/%s/assignment_groups" % _cid(course_id), {"include[]": list(include)})

    def modules(self, course_id, include=("items", "content_details")):
        return self.get("courses/%s/modules" % _cid(course_id), {"include[]": list(include)})

    def module_items(self, course_id, module_id):
        return self.get("courses/%s/modules/%s/items" % (_cid(course_id), _cid(module_id)))

    def announcements(self, course_ids, start=None, end=None):
        ids = course_ids if isinstance(course_ids, (list, tuple)) else [course_ids]
        return self.get("announcements", {"context_codes[]": ["course_" + _cid(i) for i in ids],
                                          "start_date": _day(start) if start else None,
                                          "end_date": _day(end) if end else None})

    def discussion_topics(self, course_id, **params):
        return self.get("courses/%s/discussion_topics" % _cid(course_id), params)

    def pages(self, course_id):
        return self.get("courses/%s/pages" % _cid(course_id))

    def files(self, course_id):
        return self.get("courses/%s/files" % _cid(course_id))

    def file(self, file_id):
        """One file's metadata JSON. Never downloads it."""
        return self.get("files/%s" % _cid(file_id))

    def assignment_files(self, course_id, assignment):
        """Metadata for the files an assignment's description links to.

        assignment: an assignment dict from assignments() (uses its description), or an assignment id
        (looked up in the course).  Returns [{id, name, size, content_type, updated_at, locked,
        download_url}] -- metadata only; the download URL is returned, never fetched.  A file you
        cannot see comes back as {id, error}."""
        if not isinstance(assignment, dict):
            found = self.assignments(course_id, include=(), **{"assignment_ids[]": [str(assignment)]})
            if not found:
                raise CanvasUnavailable("assignment %s not found in course %s" % (assignment, course_id), 404)
            assignment = found[0]
        out = []
        for fid in file_ids_in_html(assignment.get("description")):
            try:
                f = self.file(fid)
            except CanvasUnavailable as e:
                out.append({"id": fid, "error": str(e)})
                continue
            out.append({"id": str(f.get("id", fid)), "name": f.get("display_name") or f.get("filename"),
                        "size": f.get("size"), "content_type": f.get("content-type") or f.get("content_type"),
                        "updated_at": f.get("updated_at"), "locked": f.get("locked_for_user") or f.get("locked"),
                        "download_url": f.get("url")})
        return out


def _cid(x):
    s = str(x).strip()
    if not re.fullmatch(r"\d+", s):
        raise ValueError("expected a numeric id, got %r" % s)
    return s


def _day(d):
    if isinstance(d, dt.datetime):
        return d.isoformat(timespec="seconds")
    if isinstance(d, dt.date):
        return d.isoformat()
    return str(d)


# --------------------------------------------------------------------------- summaries (same shape as the feed's)

def _abs(base, href):
    return urllib.parse.urljoin(base + "/", href) if href else None


def summarize_planner(items, base_url, tz=None):
    """Planner items -> dicts shaped like parse_feed's (id, kind, course_id, course_code/name, title, due, url...)."""
    t = _resolve_tz(tz)[0]
    out = []
    for it in items:
        pl = it.get("plannable") or {}
        ptype = it.get("plannable_type") or "item"
        ov = it.get("planner_override") or {}
        out.append({
            "id": "%s:%s" % (ptype, it.get("plannable_id")), "kind": ptype,
            "course_id": str(it["course_id"]) if it.get("course_id") else None,
            "course_name": it.get("context_name"),
            "title": pl.get("title") or pl.get("name"),
            "due": _iso_from_canvas(pl.get("due_at") or it.get("plannable_date"), t),
            "points": pl.get("points_possible"),
            "url": _abs(base_url, it.get("html_url")),
            "submission": it.get("submissions") or None,
            "done": bool(ov.get("marked_complete")) if ov else False,
            "new_activity": it.get("new_activity"),
        })
    out.sort(key=lambda i: (i["due"] is None, i["due"] or ""))
    return out


def summarize_assignment(a, tz=None):
    t = _resolve_tz(tz)[0]
    sub = a.get("submission") or {}
    return {
        "id": "assignment:%s" % a.get("id"), "kind": "assignment",
        "course_id": str(a["course_id"]) if a.get("course_id") else None,
        "title": a.get("name"),
        "due": _iso_from_canvas(a.get("due_at"), t),
        "created_at": _iso_from_canvas(a.get("created_at"), t),
        "unlock_at": _iso_from_canvas(a.get("unlock_at"), t),
        "lock_at": _iso_from_canvas(a.get("lock_at"), t),
        "points": a.get("points_possible"),
        "url": a.get("html_url"),
        "submission_types": a.get("submission_types"),
        "has_submitted_submissions": a.get("has_submitted_submissions"),
        "published": a.get("published"),
        "submission": ({k: sub.get(k) for k in ("workflow_state", "submitted_at", "score", "grade",
                                                "late", "missing", "excused", "attempt") if k in sub} or None),
        "description_html": a.get("description"),
        "links": html_links(a.get("description")),
    }


def summarize_course(c):
    return {"id": "course:%s" % c.get("id"), "course_id": str(c.get("id")), "title": c.get("name"),
            "course_code": c.get("course_code"), "term": (c.get("term") or {}).get("name"),
            "url": None}


# --------------------------------------------------------------------------- command line

def _line(i):
    due = i.get("due")
    if due:
        when = due[:10] + (" (all day)" if i.get("all_day") else " " + due[11:16])
    elif i.get("start"):
        when = i["start"][:10] + " " + i["start"][11:16] + " (event)"
    else:
        when = "(no date)"
    course = i.get("course_code") or i.get("course_name") or (("course " + i["course_id"]) if i.get("course_id") else "")
    pts = (" %gpt" % i["points"]) if i.get("points") is not None else ""
    sub = i.get("submission") or {}
    state = ""
    if isinstance(sub, dict) and sub.get("workflow_state") in ("submitted", "graded", "pending_review"):
        state = " [" + sub["workflow_state"] + "]"
    elif isinstance(sub, dict) and sub.get("submitted"):
        state = " [submitted]"
    return "%-22s %-26s %s%s%s%s  %s" % (when, i.get("id", ""), i.get("title") or "", pts, state,
                                         ("  (" + course + ")") if course else "", i.get("url") or "")


def _print(items, as_json):
    if as_json:
        print(json.dumps(items, indent=2, ensure_ascii=False))
    else:
        for i in items:
            print(_line(i).rstrip())


def _cmd_feed(a):
    items = parse_feed(fetch_feed(a.source), tz=a.tz)
    if a.course:
        items = for_course(items, a.course)
    if a.kind:
        items = [i for i in items if i["kind"] == a.kind]
    _print(items, a.json)
    if not items and not a.json:
        print("(nothing matches)", file=sys.stderr)


def _cmd_rest(a):
    c = Canvas(a.base_url, token_file=a.token_file)
    what, cid = a.what, a.id
    if what in ("assignments", "modules") and not cid:
        raise SystemExit("usage: canvasread.py rest <base_url> --token-file F %s <course-id>" % what)
    if what == "me":
        data = c.me()
        print(json.dumps(data, indent=2, ensure_ascii=False))
        return
    if what == "planner":
        today = dt.date.today()
        data = c.planner(a.start or today - dt.timedelta(days=7), a.end or today + dt.timedelta(days=14))
        items = summarize_planner(data, c.origin, a.tz)
    elif what == "courses":
        data = c.courses()
        items = [summarize_course(x) for x in data if x.get("name")]
    elif what == "assignments":
        data = c.assignments(cid)
        items = sorted((summarize_assignment(x, a.tz) for x in data), key=lambda i: (i["due"] is None, i["due"] or ""))
    else:
        data = c.modules(cid)
        items = data
    if a.raw:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    elif what == "modules" and not a.json:
        for m in data:
            print("module:%s  %s  (%d items)" % (m.get("id"), m.get("name"), len(m.get("items") or [])))
            for it in m.get("items") or []:
                print("    %-12s %s" % (it.get("type"), it.get("title")))
    elif what == "courses" and not a.json:
        for i in items:
            print("%-14s %-16s %s  %s" % (i["id"], i["course_code"] or "", i["title"], i["term"] or ""))
    else:
        _print(items, a.json)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="canvasread.py", description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("feed", help="read a calendar feed (URL, .ics file, or a file holding the link)")
    f.add_argument("source")
    f.add_argument("--course", help="only this course id")
    f.add_argument("--kind", help="assignment | calendar_event")
    f.add_argument("--tz", help="IANA zone for times (default: this computer's)")
    f.add_argument("--json", action="store_true")
    f.set_defaults(fn=_cmd_feed)
    r = sub.add_parser("rest", help="read the REST API with an access token (GET only)")
    r.add_argument("base_url", help="https://canvas.example.edu")
    r.add_argument("what", choices=["planner", "courses", "assignments", "modules", "me"])
    r.add_argument("id", nargs="?", help="course id (assignments, modules)")
    r.add_argument("--token-file", required=True, help="file holding the token; must be chmod 600")
    r.add_argument("--start", help="planner: first day (default 7 days ago)")
    r.add_argument("--end", help="planner: last day (default 14 days ahead)")
    r.add_argument("--tz")
    r.add_argument("--json", action="store_true", help="summaries as JSON")
    r.add_argument("--raw", action="store_true", help="Canvas's own JSON")
    r.set_defaults(fn=_cmd_rest)
    a = ap.parse_args(argv)
    try:
        a.fn(a)
    except (CanvasError, ValueError) as e:
        print("canvasread: %s" % e, file=sys.stderr)
        return 3
    except BrokenPipeError:
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
