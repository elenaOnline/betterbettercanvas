"""Tests for canvasread.py.  Standard library only:

    /usr/bin/python3 -m unittest discover -s agentkit/skills/canvas/tests -v

Everything is synthetic: made-up school (canvas.example.edu), made-up ids.  The REST tests talk to
a tiny http.server started in-process on 127.0.0.1.  One optional test starts dev/mock-canvas (needs
`node`) and skips itself when it cannot.
"""
import contextlib
import http.server
import io
import json
import os
import shutil
import socket
import stat
import subprocess
import sys
import tempfile
import threading
import time
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
import canvasread as cr  # noqa: E402

LA = "America/Los_Angeles"
HOST = "canvas.example.edu"


def vevent(*lines):
    return "BEGIN:VEVENT\r\n" + "".join(l + "\r\n" for l in lines) + "END:VEVENT\r\n"


def calendar(*events, nl="\r\n"):
    text = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Instructure//Canvas//EN\r\n" + "".join(events) + "END:VCALENDAR\r\n"
    return text.replace("\r\n", nl)


def assignment(aid, course, title, code, start, desc=None, html=None, stamp="20261010T170000Z", host=HOST, extra=()):
    lines = ["UID:event-assignment-%s" % aid, "DTSTAMP:%s" % stamp, start]
    if start.startswith("DTSTART:"):
        lines.append("DTEND:" + start[len("DTSTART:"):])
    lines.append("SUMMARY:%s [%s]" % (title, code))
    if desc is not None:
        lines.append("DESCRIPTION:" + desc)
    if html is not None:
        lines.append("X-ALT-DESC;FMTTYPE=text/html:" + html)
    lines.append("URL;VALUE=URI:https://%s/calendar?include_contexts=course_%s&month=10&year=2026#assignment_%s" % (host, course, aid))
    lines += list(extra)
    return vevent(*lines)


# ---------------------------------------------------------------------------------- ICS

class FeedParsing(unittest.TestCase):
    def parse(self, *events, **kw):
        kw.setdefault("tz", LA)
        return cr.parse_feed(calendar(*events), **kw)

    def test_basic_assignment(self):
        (it,) = self.parse(assignment("90017", "4821", "Homework 3", "MATH-101-001 Fall 2026",
                                      "DTSTART:20261025T065900Z", desc="Do problems 1-5"))
        self.assertEqual(it["id"], "assignment:90017")
        self.assertEqual(it["kind"], "assignment")
        self.assertEqual(it["course_id"], "4821")
        self.assertEqual(it["course_code"], "MATH-101-001 Fall 2026")
        self.assertEqual(it["title"], "Homework 3")
        self.assertEqual(it["due"], "2026-10-24T23:59:00-07:00")
        self.assertEqual(it["due_date"], "2026-10-24")
        self.assertFalse(it["all_day"])
        self.assertEqual(it["url"], "https://canvas.example.edu/courses/4821/assignments/90017")
        self.assertIn("calendar?include_contexts=course_4821", it["calendar_url"])
        self.assertEqual(it["description"], "Do problems 1-5")
        self.assertEqual(it["updated"], "2026-10-10T10:00:00-07:00")
        self.assertFalse(it["override"])
        self.assertNotIn("warnings", it)

    def test_utc_converts_across_dst(self):
        a, b = self.parse(assignment("1", "4821", "Summer", "C1", "DTSTART:20260715T065900Z"),
                          assignment("2", "4821", "Winter", "C1", "DTSTART:20261215T075900Z"))
        self.assertEqual(a["due"], "2026-07-14T23:59:00-07:00")
        self.assertEqual(b["due"], "2026-12-14T23:59:00-08:00")

    def test_utc_zone_and_tzinfo_objects(self):
        (it,) = self.parse(assignment("1", "4821", "T", "C", "DTSTART:20261025T065900Z"), tz="UTC")
        self.assertEqual(it["due"], "2026-10-25T06:59:00+00:00")
        (it,) = self.parse(assignment("1", "4821", "T", "C", "DTSTART:20261025T065900Z"),
                           tz=cr.dt.timezone(cr.dt.timedelta(hours=2)))
        self.assertEqual(it["due"], "2026-10-25T08:59:00+02:00")

    def test_default_tz_is_the_system_zone(self):
        old = os.environ.get("TZ")
        os.environ["TZ"] = "America/New_York"
        time.tzset()
        try:
            (it,) = cr.parse_feed(calendar(assignment("1", "4821", "T", "C", "DTSTART:20261025T065900Z")))
            self.assertEqual(it["due"], "2026-10-25T02:59:00-04:00")
            (it,) = cr.parse_feed(calendar(assignment("1", "4821", "T", "C", "DTSTART:20261225T065900Z")))
            self.assertEqual(it["due"], "2026-12-25T01:59:00-05:00")
        finally:
            if old is None:
                os.environ.pop("TZ", None)
            else:
                os.environ["TZ"] = old
            time.tzset()

    def test_unknown_zone_name_is_an_error(self):
        with self.assertRaises(ValueError):
            cr.parse_feed(calendar(), tz="Mars/Olympus")

    def test_all_day(self):
        (it,) = self.parse(vevent(
            "UID:event-assignment-91", "DTSTAMP:20261001T000000Z", "DTSTART;VALUE=DATE:20261030",
            "SUMMARY:Reading log [BIO-200]",
            "URL;VALUE=URI:https://canvas.example.edu/calendar?include_contexts=course_4821#assignment_91"))
        self.assertTrue(it["all_day"])
        self.assertEqual(it["due"], "2026-10-30T00:00:00-07:00")
        self.assertEqual(it["due_date"], "2026-10-30")
        self.assertIsNone(it["end"])

    def test_tzid_and_floating(self):
        got = self.parse(
            vevent("UID:event-assignment-1", "DTSTART;TZID=America/New_York:20261026T170000", "SUMMARY:A [X]",
                   "URL:https://canvas.example.edu/calendar?include_contexts=course_4821#assignment_1"),
            vevent("UID:event-assignment-2", "DTSTART:20261026T120000", "SUMMARY:B [X]",
                   "URL:https://canvas.example.edu/calendar?include_contexts=course_4821#assignment_2"),
            vevent("UID:event-assignment-3", 'DTSTART;TZID="America/New_York":20261027T170000', "SUMMARY:C [X]",
                   "URL:https://canvas.example.edu/calendar?include_contexts=course_4821#assignment_3"),
            vevent("UID:event-assignment-4", "DTSTART;TZID=Not/AZone:20261028T090000", "SUMMARY:D [X]",
                   "URL:https://canvas.example.edu/calendar?include_contexts=course_4821#assignment_4"))
        by = {i["id"]: i for i in got}
        ny, floating, quoted, bad = (by["assignment:%d" % n] for n in (1, 2, 3, 4))
        self.assertEqual(ny["due"], "2026-10-26T14:00:00-07:00")          # 17:00 EDT
        self.assertEqual(floating["due"], "2026-10-26T12:00:00-07:00")    # wall clock in the output zone
        self.assertEqual(quoted["due"], "2026-10-27T14:00:00-07:00")      # quoted TZID param
        self.assertEqual(bad["due"], "2026-10-28T09:00:00-07:00")
        self.assertTrue(any("Not/AZone" in w for w in bad["warnings"]))

    def test_folding_crlf_lf_and_tab(self):
        long = "x" * 200
        ev = ("UID:event-assignment-5\r\nDTSTART:20261025T065900Z\r\nSUMMARY:Fold\r\n ed title [C1]\r\n"
              "DESCRIPTION:" + long[:70] + "\r\n " + long[70:140] + "\r\n\t" + long[140:] + "\r\n"
              "URL:https://canvas.example.edu/calendar?include_contexts=course_4821#assignm\r\n ent_5\r\n")
        for nl in ("\r\n", "\n"):
            text = ("BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\n" + ev + "END:VEVENT\r\nEND:VCALENDAR\r\n").replace("\r\n", nl)
            (it,) = cr.parse_feed(text, tz=LA)
            self.assertEqual(it["title"], "Folded title")
            self.assertEqual(it["description"], long)
            self.assertEqual(it["id"], "assignment:5")
            self.assertEqual(it["course_code"], "C1")

    def test_fold_inside_a_multibyte_character_in_bytes(self):
        snow = "☃".encode("utf-8")                     # 3 bytes: e2 98 83
        data = (b"BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:event-assignment-6\r\nDTSTART:20261025T065900Z\r\n"
                b"SUMMARY:Cold [C]\r\nDESCRIPTION:ab" + snow[:2] + b"\r\n " + snow[2:] + b"cd\r\n"
                b"END:VEVENT\r\nEND:VCALENDAR\r\n")
        (it,) = cr.parse_feed(data, tz=LA)
        self.assertEqual(it["description"], "ab☃cd")

    def test_escapes(self):
        (it,) = self.parse(assignment("7", "4821", "Esc\\, aped\\; title", "C",
                                      "DTSTART:20261025T065900Z",
                                      desc="Line one\\nLine two\\NLine three\\, comma\\; semi \\\\ backslash \\\\n literal"))
        self.assertEqual(it["title"], "Esc, aped; title")
        self.assertEqual(it["description"], "Line one\nLine two\nLine three, comma; semi \\ backslash \\n literal")

    def test_description_html_and_links(self):
        html = ('<p>Read <a href="https://canvas.example.edu/courses/4821/files/7001/download?wrap=1">the handout</a>'
                ' and <a href="https://canvas.example.edu/api/v1/courses/4821/files/7002">data\\, set</a>'
                ' and <a href="https://example.org/x?files=3">elsewhere</a>.</p>')
        (it,) = self.parse(assignment("8", "4821", "Links", "C", "DTSTART:20261025T065900Z", desc="Read the handout", html=html))
        self.assertIn("<a href", it["description_html"])
        self.assertEqual([(l["file_id"], l["text"]) for l in it["links"]],
                         [("7001", "the handout"), ("7002", "data, set"), (None, "elsewhere")])
        self.assertFalse(it["locked_or_no_description"])

    def test_missing_description_means_locked_or_none(self):
        (it,) = self.parse(assignment("9", "4821", "Locked", "C", "DTSTART:20261025T065900Z"))
        self.assertEqual(it["description"], "")
        self.assertIsNone(it["description_html"])
        self.assertEqual(it["links"], [])
        self.assertTrue(it["locked_or_no_description"])

    def test_course_ids_that_are_substrings_of_each_other(self):
        items = self.parse(assignment("1", "4821", "In short", "SHORT", "DTSTART:20261025T065900Z"),
                           assignment("2", "482177", "In long", "LONG", "DTSTART:20261026T065900Z"),
                           assignment("3", "148217", "Contains it", "OTHER", "DTSTART:20261027T065900Z"))
        self.assertEqual([i["title"] for i in cr.for_course(items, 4821)], ["In short"])
        self.assertEqual([i["title"] for i in cr.for_course(items, "482177")], ["In long"])
        self.assertEqual([i["title"] for i in cr.for_course(items, "course_4821")], ["In short"])
        self.assertEqual(cr.for_course(items, 48), [])

    def test_course_id_from_courses_path_url_is_exact(self):
        (it,) = self.parse(vevent("UID:event-assignment-4", "DTSTART:20261025T065900Z", "SUMMARY:P [C]",
                                  "URL:https://canvas.example.edu/courses/482177/assignments/4"))
        self.assertEqual(it["course_id"], "482177")
        (it,) = self.parse(vevent("UID:event-assignment-4", "DTSTART:20261025T065900Z", "SUMMARY:P [C]",
                                  "URL:https://canvas.example.edu/calendar?include_contexts=course_482177,course_4821"))
        self.assertEqual(it["course_id"], "482177")          # first context wins
        self.assertEqual(it["id"], "assignment:4")           # no fragment: the UID's id

    def test_calendar_event(self):
        (it,) = self.parse(vevent(
            "UID:event-calendar-event-777", "DTSTAMP:20261001T000000Z",
            "DTSTART:20261028T170000Z", "DTEND:20261028T180000Z",
            "SUMMARY:Review session [BIO-200]", "LOCATION:Room 12\\, Hall B",
            "URL;VALUE=URI:https://canvas.example.edu/calendar?include_contexts=course_4821&month=10&year=2026#calendar_event_777"))
        self.assertEqual(it["kind"], "calendar_event")
        self.assertEqual(it["id"], "calendar_event:777")
        self.assertIsNone(it["due"])
        self.assertEqual(it["start"], "2026-10-28T10:00:00-07:00")
        self.assertEqual(it["end"], "2026-10-28T11:00:00-07:00")
        self.assertEqual(it["location"], "Room 12, Hall B")
        self.assertEqual(it["course_id"], "4821")
        self.assertIn("/calendar?", it["url"])
        self.assertFalse(it["locked_or_no_description"])

    def test_override_event_uses_the_assignment_id_from_the_fragment(self):
        (it,) = self.parse(vevent(
            "UID:event-assignment-override-55", "DTSTART:20261029T065900Z", "SUMMARY:Essay (Section B) [ENG-1]",
            "URL:https://canvas.example.edu/calendar?include_contexts=course_4821&month=10&year=2026#assignment_90017"))
        self.assertTrue(it["override"])
        self.assertEqual(it["id"], "assignment:90017")
        self.assertEqual(it["uid"], "event-assignment-override-55")
        self.assertEqual(it["title"], "Essay (Section B)")
        self.assertEqual(it["url"], "https://canvas.example.edu/courses/4821/assignments/90017")
        (it,) = self.parse(vevent("UID:event-assignment-override-55", "DTSTART:20261029T065900Z", "SUMMARY:E [X]",
                                  "URL:https://canvas.example.edu/calendar?include_contexts=course_4821"))
        self.assertEqual(it["id"], "assignment_override:55")  # no fragment: never pass the override id off as an assignment id

    def test_host_comes_from_the_feed(self):
        (it,) = self.parse(assignment("1", "55", "T", "C", "DTSTART:20261025T065900Z", host="canvas.example.edu"))
        self.assertEqual(it["url"], "https://canvas.example.edu/courses/55/assignments/1")

    def test_host_argument_for_events_without_a_url_host(self):
        ev = vevent("UID:event-assignment-9", "DTSTART:20261025T065900Z", "SUMMARY:T [C]",
                    "URL:/calendar?include_contexts=course_55#assignment_9")
        (it,) = cr.parse_feed(calendar(ev), tz=LA, host="other.example.edu")
        self.assertEqual(it["url"], "https://other.example.edu/courses/55/assignments/9")

    def test_valarm_description_is_ignored(self):
        (it,) = self.parse(assignment("1", "4821", "T", "C", "DTSTART:20261025T065900Z", desc="real",
                                      extra=["BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:alarm text", "END:VALARM"]))
        self.assertEqual(it["description"], "real")

    def test_title_with_brackets_keeps_all_but_the_last(self):
        (it,) = self.parse(assignment("1", "4821", "Quiz [bonus]", "CS 101", "DTSTART:20261025T065900Z"))
        self.assertEqual((it["title"], it["course_code"]), ("Quiz [bonus]", "CS 101"))
        (it,) = self.parse(vevent("UID:event-assignment-1", "DTSTART:20261025T065900Z", "SUMMARY:No code here"))
        self.assertEqual((it["title"], it["course_code"]), ("No code here", None))

    def test_sorted_soonest_first_undated_last(self):
        items = self.parse(assignment("1", "4821", "Later", "C", "DTSTART:20261101T065900Z"),
                           vevent("UID:event-assignment-2", "SUMMARY:Undated [C]"),
                           assignment("3", "4821", "Sooner", "C", "DTSTART:20261025T065900Z"))
        self.assertEqual([i["title"] for i in items], ["Sooner", "Later", "Undated"])

    def test_not_a_calendar_and_empty_calendar(self):
        with self.assertRaises(cr.FeedError):
            cr.parse_feed("<!DOCTYPE html><html>Sign in to Canvas</html>")
        self.assertEqual(cr.parse_feed(calendar()), [])

    def test_bom_and_lowercase_property_names(self):
        text = "﻿" + calendar(vevent("uid:event-assignment-3", "dtstart:20261025T065900Z", "summary:Low [C]"))
        (it,) = cr.parse_feed(text, tz=LA)
        self.assertEqual(it["id"], "assignment:3")
        self.assertEqual(it["due"], "2026-10-24T23:59:00-07:00")


class FeedFetching(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def test_local_ics_file(self):
        p = os.path.join(self.tmp, "feed.ics")
        with open(p, "w", newline="") as f:
            f.write(calendar(assignment("1", "4821", "T", "C", "DTSTART:20261025T065900Z")))
        self.assertEqual(len(cr.parse_feed(cr.fetch_feed(p), tz=LA)), 1)

    def test_missing_file(self):
        with self.assertRaises(cr.FeedError):
            cr.fetch_feed(os.path.join(self.tmp, "nope.ics"))

    def test_url_and_file_holding_the_url_and_errors_never_echo_the_link(self):
        body = calendar(assignment("1", "4821", "T", "C", "DTSTART:20261025T065900Z")).encode()
        secret = "feeds/calendars/user_SECRETSECRET.ics"

        class H(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                self.server.seen.append((self.path, self.headers.get("User-Agent")))
                if "SECRETSECRET" in self.path and "gone" not in self.path:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/calendar")
                    self.end_headers()
                    self.wfile.write(body)
                else:
                    self.send_response(404)
                    self.end_headers()

            def log_message(self, *a):
                pass

        srv = http.server.HTTPServer(("127.0.0.1", 0), H)
        srv.seen = []
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        url = "http://127.0.0.1:%d/%s" % (srv.server_address[1], secret)
        self.assertEqual(len(cr.parse_feed(cr.fetch_feed(url), tz=LA)), 1)
        self.assertIn("canvasread", srv.seen[0][1])
        linkfile = os.path.join(self.tmp, "canvas_feed.url")
        with open(linkfile, "w") as f:
            f.write(url + "\n")
        self.assertEqual(len(cr.parse_feed(cr.fetch_feed(linkfile), tz=LA)), 1)
        for bad in (url.replace("SECRETSECRET", "gone-SECRETSECRET"), "http://127.0.0.1:1/SECRETSECRET.ics"):
            with self.assertRaises(cr.FeedError) as cm:
                cr.fetch_feed(bad)
            self.assertNotIn("SECRET", str(cm.exception))
            self.assertNotIn("127.0.0.1", str(cm.exception))


# ---------------------------------------------------------------------------------- REST

class FakeCanvas(http.server.ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self):
        super().__init__(("127.0.0.1", 0), self.Handler)
        self.log = []                    # (path_with_query, headers dict)
        self.lock = threading.Lock()
        self.in_flight = self.max_in_flight = 0
        self.delay = 0.0
        self.counters = {}
        self.port = self.server_address[1]

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_GET(self):
            s = self.server
            with s.lock:
                s.in_flight += 1
                s.max_in_flight = max(s.max_in_flight, s.in_flight)
                s.log.append((self.path, dict(self.headers)))
            try:
                if s.delay:
                    time.sleep(s.delay)
                self.route()
            finally:
                with s.lock:
                    s.in_flight -= 1

        do_POST = do_PUT = do_DELETE = do_GET

        def send(self, status, payload, headers=(), prefix=""):
            body = (prefix + (payload if isinstance(payload, str) else json.dumps(payload))).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            for k, v in headers:
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def route(self):
            s = self.server
            base = "http://127.0.0.1:%d" % s.port
            path, _, query = self.path.partition("?")
            q = dict(kv.split("=", 1) for kv in query.split("&") if "=" in kv)
            n = s.counters[path] = s.counters.get(path, 0) + 1
            if path == "/api/v1/users/self":
                return self.send(200, {"id": "1", "name": "Test Student"}, prefix="while(1);")
            if path == "/api/v1/courses/4821/assignments":
                page = int(q.get("page", "1"))
                items = [{"id": str(100 + i), "course_id": "4821", "name": "HW %d" % i,
                          "due_at": "2026-10-%02dT06:59:00Z" % (10 + i), "created_at": "2026-09-01T17:00:00Z",
                          "unlock_at": None, "points_possible": 10.0,
                          "html_url": base + "/courses/4821/assignments/%d" % (100 + i),
                          "submission_types": ["online_upload"], "has_submitted_submissions": False,
                          "description": '<p><a href="%s/courses/4821/files/7001/download?wrap=1">sheet</a></p>' % base if i == 1 else None,
                          "submission": {"workflow_state": "unsubmitted", "score": None}}
                         for i in range(1 + (page - 1) * 2, 1 + page * 2 if page < 3 else 6)]
                hdr = []
                if page < 3:
                    hdr.append(("Link", '<%s%s?page=%d&per_page=100>; rel="next", <%s%s?page=1&per_page=100>; rel="first"'
                                % (base, path, page + 1, base, path)))
                return self.send(200, items, hdr, prefix="while(1);" if page == 2 else "")
            if path == "/api/v1/planner/items":
                return self.send(200, [{"plannable_type": "assignment", "plannable_id": "100", "course_id": "4821",
                                        "context_name": "Algebra", "html_url": "/courses/4821/assignments/100",
                                        "plannable_date": "2026-10-25T06:59:00Z",
                                        "plannable": {"title": "HW 0", "due_at": "2026-10-25T06:59:00Z", "points_possible": 5},
                                        "submissions": {"submitted": True}, "planner_override": None}])
            if path == "/api/v1/courses":
                return self.send(200, [{"id": "4821", "name": "Algebra", "course_code": "MATH-101", "term": {"name": "Fall 2026"}}],
                                 [("X-Rate-Limit-Remaining", "10.0")])
            if path == "/api/v1/dashboard/dashboard_cards":
                if n == 1:
                    return self.send(403, "403 Forbidden (Rate Limit Exceeded)", [("X-Rate-Limit-Remaining", "0.0")])
                return self.send(200, [{"id": "4821"}])
            if path == "/api/v1/courses/9/modules":
                return self.send(404, {"errors": [{"message": "not found"}]})
            if path == "/api/v1/courses/8/modules":
                return self.send(401, {"errors": [{"message": "Invalid access token."}]})
            if path == "/api/v1/courses/7/modules":
                return self.send(302, "", [("Location", "http://127.0.0.1:1/login")])
            if path == "/api/v1/courses/6/modules":
                return self.send(200, [{"id": "1"}], [("Link", '<http://evil.example.net/api/v1/courses/6/modules?page=2>; rel="next"')])
            if path == "/api/v1/courses/5/modules":
                return self.send(200, [{"id": "1"}], [("Link", '<%s/api/v1/users/self/settings>; rel="next"' % base)])
            if path == "/api/v1/courses/4821/modules":
                return self.send(200, [{"id": "1", "name": "Week 1", "items": [{"type": "Page", "title": "Intro"}]}])
            if path == "/api/v1/files/7001":
                return self.send(200, {"id": "7001", "display_name": "sheet.docx", "size": 1234,
                                       "content-type": "application/msword", "url": base + "/files/7001/download?verifier=x",
                                       "updated_at": "2026-10-01T00:00:00Z", "locked_for_user": False})
            return self.send(404, {"errors": []})


class RestBase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.srv = FakeCanvas()
        threading.Thread(target=cls.srv.serve_forever, daemon=True).start()
        cls.base = "http://127.0.0.1:%d" % cls.srv.port
        cls.tmp = tempfile.mkdtemp()

    @classmethod
    def tearDownClass(cls):
        cls.srv.shutdown()
        cls.srv.server_close()
        shutil.rmtree(cls.tmp, True)

    def setUp(self):
        self.srv.log.clear()
        self.srv.counters.clear()
        self.srv.delay = 0.0
        self.sleeps = []
        self.c = cr.Canvas(self.base, token="TOKEN-abc123", sleep=self.sleeps.append)


class RestReading(RestBase):
    def test_headers_and_while1_prefix(self):
        me = self.c.me()
        self.assertEqual(me["name"], "Test Student")
        path, h = self.srv.log[0]
        self.assertEqual(h["Authorization"], "Bearer TOKEN-abc123")
        self.assertEqual(h["Accept"], "application/json+canvas-string-ids")
        self.assertIn("per_page=100", path)

    def test_pagination_follows_link_next_and_strips_prefix_per_page(self):
        items = self.c.assignments(4821)
        self.assertEqual([a["id"] for a in items], ["101", "102", "103", "104", "105"])
        self.assertEqual(len(self.srv.log), 3)
        self.assertIn("include%5B%5D=submission", self.srv.log[0][0])

    def test_assignments_carry_the_fields_agents_need(self):
        a = self.c.assignments(4821)[0]
        for k in ("created_at", "unlock_at", "due_at", "points_possible", "html_url", "submission_types",
                  "has_submitted_submissions"):
            self.assertIn(k, a)
        s = cr.summarize_assignment(a, tz=LA)
        self.assertEqual(s["id"], "assignment:101")
        self.assertEqual(s["due"], "2026-10-10T23:59:00-07:00")
        self.assertEqual(s["created_at"], "2026-09-01T10:00:00-07:00")
        self.assertEqual(s["course_id"], "4821")

    def test_planner_requires_dates_and_summarises(self):
        with self.assertRaises(cr.NotReadSafe):
            self.c.get("planner/items")
        with self.assertRaises(cr.NotReadSafe):
            self.c.get("planner/items", {"start_date": "2026-10-01"})
        self.assertEqual(self.srv.log, [])
        raw = self.c.planner("2026-10-14", "2026-11-04")
        self.assertIn("start_date=2026-10-14", self.srv.log[0][0])
        self.assertIn("end_date=2026-11-04", self.srv.log[0][0])
        (s,) = cr.summarize_planner(raw, self.base, tz=LA)
        self.assertEqual(s["id"], "assignment:100")
        self.assertEqual(s["due"], "2026-10-24T23:59:00-07:00")
        self.assertEqual(s["url"], self.base + "/courses/4821/assignments/100")
        self.assertEqual(s["course_name"], "Algebra")

    def test_modules(self):
        (m,) = self.c.modules(4821)
        self.assertEqual(m["items"][0]["title"], "Intro")
        self.assertIn("include%5B%5D=items", self.srv.log[0][0])

    def test_low_rate_limit_slows_down(self):
        self.c.courses()
        self.assertEqual(len(self.sleeps), 1)
        self.assertGreater(self.sleeps[0], 0)

    def test_rate_limited_403_is_retried_not_unavailable(self):
        self.assertEqual(self.c.dashboard_cards(), [{"id": "4821"}])
        self.assertEqual(len(self.srv.log), 2)
        self.assertTrue(self.sleeps)

    def test_401_403_404_are_canvas_unavailable_with_a_clear_message(self):
        for cid, status in (("9", 404), ("8", 401)):
            with self.assertRaises(cr.CanvasUnavailable) as cm:
                self.c.modules(cid)
            self.assertEqual(cm.exception.status, status)
            self.assertIn("off at this school, or the token lacks access", str(cm.exception))
            self.assertNotIn("TOKEN-abc123", str(cm.exception))

    def test_redirect_is_not_followed(self):
        with self.assertRaises(cr.CanvasUnavailable):
            self.c.modules(7)
        self.assertEqual(len(self.srv.log), 1)

    def test_link_to_another_host_is_not_followed_and_never_gets_the_token(self):
        with self.assertRaises(cr.CanvasError):
            self.c.modules(6)
        self.assertEqual(len(self.srv.log), 1)

    def test_link_to_a_path_off_the_allowlist_is_refused(self):
        with self.assertRaises(cr.NotReadSafe):
            self.c.modules(5)
        self.assertEqual(len(self.srv.log), 1)

    def test_one_request_in_flight(self):
        self.srv.delay = 0.05
        errs = []

        def work():
            try:
                for _ in range(3):
                    self.c.me()
            except Exception as e:  # pragma: no cover
                errs.append(e)
        ts = [threading.Thread(target=work) for _ in range(3)]
        other = cr.Canvas(self.base, token="x")                 # a second client shares the same limit
        ts.append(threading.Thread(target=lambda: [other.me() for _ in range(3)]))
        [t.start() for t in ts]
        [t.join() for t in ts]
        self.assertEqual(errs, [])
        self.assertEqual(self.srv.max_in_flight, 1)
        self.assertEqual(len(self.srv.log), 12)

    def test_assignment_files_reads_metadata_only(self):
        a = self.c.assignments(4821)[0]
        self.srv.log.clear()
        files = self.c.assignment_files(4821, a)
        self.assertEqual(files[0]["id"], "7001")
        self.assertEqual(files[0]["name"], "sheet.docx")
        self.assertEqual(files[0]["size"], 1234)
        self.assertEqual([p.split("?")[0] for p, _ in self.srv.log], ["/api/v1/files/7001"])
        self.assertTrue(all("download" not in p for p, _ in self.srv.log))

    def test_assignment_files_missing_file_is_reported_not_raised(self):
        files = self.c.assignment_files(4821, {"description": '<a href="/courses/4821/files/7999/download">gone</a>'})
        self.assertEqual(files[0]["id"], "7999")
        self.assertIn("error", files[0])


class RestRefusals(RestBase):
    def assertRefused(self, method, path, params=None, word=None):
        with self.assertRaises(cr.NotReadSafe) as cm:
            self.c.request(method, path, params)
        self.assertIn("canvas-read-safety.md", str(cm.exception))
        if word:
            self.assertIn(word, str(cm.exception))

    def test_methods_other_than_get(self):
        for m in ("POST", "PUT", "DELETE", "PATCH", "post"):
            self.assertRefused(m, "courses/4821/assignments", word=m.upper())
        self.assertRefused("PUT", "users/self/colors/course_4821", {"hexcode": "#fff"})
        self.assertRefused("POST", "planner/overrides", {"plannable_id": 1})
        self.assertEqual(self.srv.log, [])

    def test_grades_and_single_topics_and_mark_read_paths(self):
        self.assertRefused("GET", "/courses/1/grades", word="bulk_mark_read")
        self.assertRefused("GET", "courses/1/discussion_topics/5")
        self.assertRefused("GET", "courses/1/discussion_topics/5/entries")
        self.assertRefused("GET", "courses/1/discussion_topics/5/read")
        self.assertRefused("GET", "courses/1/discussion_topics/read_all")
        self.assertRefused("GET", "courses/1/modules/2/items/3/mark_read")
        self.assertRefused("GET", "courses/1/modules/2/items/3")
        self.assertRefused("GET", "courses/1/submissions/bulk_mark_read")
        self.assertRefused("GET", "conversations")
        self.assertRefused("GET", "planner/overrides")
        self.assertRefused("GET", "planner_notes")
        self.assertRefused("GET", "courses/1/pages/some-page")
        self.assertRefused("GET", "courses/1/files/9")
        self.assertRefused("GET", "files/9/download")
        self.assertRefused("GET", "files/9/public_url")
        self.assertRefused("GET", "users/self/colors/course_1")
        self.assertRefused("GET", "users/self/dashboard_positions")
        self.assertRefused("GET", "courses/1/assignments/5/submissions/self")
        self.assertEqual(self.srv.log, [])

    def test_off_the_allowlist_and_sneaky_paths(self):
        for p in ("accounts/1/courses", "courses/abc/assignments", "courses/1/assignments/", "courses/1/../users/self/x",
                  "courses/1//assignments/9", "courses/1/assignments%2f9", "courses/1/tabs", "courses/1/enrollments",
                  "courses/1/assignments;x", "users/self/profile", ""):
            if p == "courses/1/assignments/":
                continue                                    # a trailing slash is the same list
            with self.assertRaises(cr.NotReadSafe, msg=p):
                self.c.request("GET", p)
        self.assertEqual(self.srv.log, [])

    def test_other_host_is_refused(self):
        with self.assertRaises(cr.NotReadSafe):
            self.c.request("GET", "http://evil.example.net/api/v1/users/self")
        self.assertEqual(self.srv.log, [])

    def test_page_bodies_and_announcements_without_context(self):
        self.assertRefused("GET", "courses/1/pages", {"include[]": ["body"]}, word="body")
        self.assertRefused("GET", "announcements")
        self.assertRefused("GET", "announcements", {"start_date": "2026-01-01"})
        self.assertEqual(self.srv.log, [])

    def test_refused_before_any_network_even_with_nothing_listening(self):
        dead = cr.Canvas("http://127.0.0.1:1", token="t")
        for args in (("POST", "courses"), ("GET", "courses/1/grades"), ("GET", "courses/1/discussion_topics/5")):
            with self.assertRaises(cr.NotReadSafe):
                dead.request(*args)
        self.assertEqual(dead.requests, 0)

    def test_what_is_allowed_passes_the_check(self):
        ok = ["users/self", "users/self/colors", "users/self/course_nicknames", "courses", "dashboard/dashboard_cards",
              "courses/1/modules", "courses/1/modules/2/items", "courses/1/assignment_groups", "courses/1/assignments",
              "courses/1/pages", "courses/1/files", "files/9", "courses/1/discussion_topics", "/api/v1/courses/1/assignments"]
        for p in ok:
            cr.check_read_safe("GET", p)
        cr.check_read_safe("GET", "planner/items", {"start_date": "2026-10-01", "end_date": "2026-10-31"})
        cr.check_read_safe("GET", "planner/items?start_date=2026-10-01&end_date=2026-10-31")
        cr.check_read_safe("GET", "announcements", {"context_codes[]": ["course_1"]})

    def test_bad_ids_are_rejected_by_the_helpers(self):
        with self.assertRaises(ValueError):
            self.c.assignments("1/../2")


class TokenAndBase(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def tokfile(self, mode, text="secret-token-value\n"):
        p = os.path.join(self.tmp, "token")
        with open(p, "w") as f:
            f.write(text)
        os.chmod(p, mode)
        return p

    def test_token_file_must_be_private(self):
        for mode in (0o644, 0o640, 0o604, 0o666):
            p = self.tokfile(mode)
            with self.assertRaises(cr.CanvasError) as cm:
                cr.Canvas("http://127.0.0.1:1", token_file=p)
            self.assertIn("chmod 600", str(cm.exception))
            self.assertNotIn("secret-token-value", str(cm.exception))
        for mode in (0o600, 0o400):
            self.assertEqual(cr.read_token_file(self.tokfile(mode)), "secret-token-value")

    def test_bad_token_files(self):
        with self.assertRaises(cr.CanvasError):
            cr.read_token_file(os.path.join(self.tmp, "absent"))
        with self.assertRaises(cr.CanvasError):
            cr.read_token_file(self.tokfile(0o600, "  \n"))
        with self.assertRaises(cr.CanvasError):
            cr.read_token_file(self.tokfile(0o600, "two words"))

    def test_token_never_in_repr_and_not_sent_over_plain_http_to_a_real_host(self):
        c = cr.Canvas("http://127.0.0.1:1", token="topsecret")
        self.assertNotIn("topsecret", repr(c))
        with self.assertRaises(cr.CanvasError):
            cr.Canvas("http://canvas.example.edu", token="topsecret")
        cr.Canvas("https://canvas.example.edu", token="topsecret")
        cr.Canvas("canvas.example.edu/api/v1/", token="topsecret")

    def test_base_url_forms(self):
        self.assertEqual(cr.Canvas("https://canvas.example.edu/api/v1").origin, "https://canvas.example.edu")
        with self.assertRaises(ValueError):
            cr.Canvas("https://canvas.example.edu/courses/1")
        with self.assertRaises(ValueError):
            cr.Canvas("ftp://canvas.example.edu")
        with self.assertRaises(ValueError):
            cr.Canvas("https://x", token="a", token_file="b")


# ---------------------------------------------------------------------------------- CLI

def run_cli(*argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = cr.main(list(argv))
    return code, out.getvalue(), err.getvalue()


class Cli(RestBase):
    def test_feed_cli_human_and_json_and_course_filter(self):
        p = os.path.join(self.tmp, "cli.ics")
        with open(p, "w", newline="") as f:
            f.write(calendar(assignment("90017", "4821", "Homework 3", "MATH-101", "DTSTART:20261025T065900Z", desc="x"),
                             assignment("90018", "482177", "Other", "ART-1", "DTSTART:20261026T065900Z")))
        code, out, _ = run_cli("feed", p, "--course", "4821", "--tz", LA)
        self.assertEqual(code, 0)
        lines = out.strip().splitlines()
        self.assertEqual(len(lines), 1)
        self.assertTrue(lines[0].startswith("2026-10-24 23:59"))
        self.assertIn("assignment:90017", lines[0])
        self.assertIn("Homework 3", lines[0])
        self.assertIn("https://canvas.example.edu/courses/4821/assignments/90017", lines[0])
        code, out, _ = run_cli("feed", p, "--json", "--tz", LA)
        self.assertEqual([i["id"] for i in json.loads(out)], ["assignment:90017", "assignment:90018"])

    def test_feed_cli_error_is_one_line_exit_3(self):
        code, out, err = run_cli("feed", os.path.join(self.tmp, "absent.ics"))
        self.assertEqual((code, out), (3, ""))
        self.assertTrue(err.startswith("canvasread:"))

    def test_rest_cli(self):
        p = os.path.join(self.tmp, "cli-token")
        with open(p, "w") as f:
            f.write("TOKEN-cli\n")
        os.chmod(p, 0o600)
        code, out, _ = run_cli("rest", self.base, "--token-file", p, "assignments", "4821", "--tz", LA)
        self.assertEqual(code, 0)
        self.assertEqual(len(out.strip().splitlines()), 5)
        self.assertTrue(out.splitlines()[0].startswith("2026-10-10 23:59"))
        code, out, _ = run_cli("rest", self.base, "--token-file", p, "planner", "--start", "2026-10-14", "--end", "2026-11-04", "--json")
        self.assertEqual(json.loads(out)[0]["id"], "assignment:100")
        code, out, err = run_cli("rest", self.base, "--token-file", p, "modules", "9")
        self.assertEqual(code, 3)
        self.assertNotIn("TOKEN-cli", err)
        os.chmod(p, 0o644)
        code, _, err = run_cli("rest", self.base, "--token-file", p, "courses")
        self.assertEqual(code, 3)
        self.assertIn("chmod 600", err)

    def test_runs_as_a_script_on_the_system_python(self):
        p = os.path.join(self.tmp, "s.ics")
        with open(p, "w", newline="") as f:
            f.write(calendar(assignment("1", "4821", "T", "C", "DTSTART:20261025T065900Z")))
        r = subprocess.run([sys.executable, cr.__file__, "feed", p, "--tz", LA], capture_output=True, text=True, timeout=30)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("assignment:1", r.stdout)


# ---------------------------------------------------------------------------------- optional: dev/mock-canvas

MOCK_DIR = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", "dev", "mock-canvas"))


class AgainstMockCanvas(unittest.TestCase):
    """Starts dev/mock-canvas (node, loopback only, no window) and reads it. Skips when node or the mock is missing."""

    @classmethod
    def setUpClass(cls):
        node = shutil.which("node")
        if not node or not os.path.exists(os.path.join(MOCK_DIR, "server.mjs")):
            raise unittest.SkipTest("node or dev/mock-canvas not available")
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        cls.proc = subprocess.Popen([node, os.path.join(MOCK_DIR, "server.mjs"), "--port", "0", "--http-port", str(port)],
                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, cwd=MOCK_DIR)
        cls.base = "http://127.0.0.1:%d" % port
        for _ in range(50):
            try:
                socket.create_connection(("127.0.0.1", port), 0.2).close()
                return
            except OSError:
                time.sleep(0.2)
        cls.proc.kill()
        raise unittest.SkipTest("mock-canvas did not start")

    @classmethod
    def tearDownClass(cls):
        proc = getattr(cls, "proc", None)
        if proc:
            proc.terminate()
            try:
                proc.wait(5)
            except subprocess.TimeoutExpired:
                proc.kill()

    def test_reads_the_mock(self):
        c = cr.Canvas(self.base, token="mock")
        courses = c.courses()
        self.assertGreaterEqual(len(courses), 5)
        cid = courses[0]["id"]
        a = c.assignments(cid)
        self.assertGreater(len(a), 0)
        self.assertIn("due_at", a[0])
        p = c.planner("2026-10-14", "2026-11-04")
        self.assertIsInstance(p, list)
        self.assertIsInstance(cr.summarize_planner(p, c.origin, tz=LA), list)
        self.assertTrue(c.modules(cid) is not None)


if __name__ == "__main__":
    unittest.main()
