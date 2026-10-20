#!/usr/bin/env bash
# Re-captures the public, unauthenticated the pilot school Canvas assets into vendor-live/.
# Only public URLs: the login page, Instructure's CDN, and the pilot school's brand images on S3.
# Never sends cookies or credentials. Safe to re-run; it overwrites in place.
set -euo pipefail
cd "$(dirname "$0")/../vendor-live"
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
CDN=https://du11hjcvx0uqb.cloudfront.net

curl -sS -D login.headers -o login-canvas.html -A "$UA" https://canvas.example.edu/login/canvas
date -u +%Y-%m-%dT%H:%M:%SZ > CAPTURED_AT

# CSS/JS bundles referenced by the login page
for u in $(grep -oE "$CDN/dist/[^\"' )]+\.(css|js)" login-canvas.html | sort -u); do
  p=${u#$CDN/}; mkdir -p "$(dirname "$p")"
  curl -sS --compressed -A "$UA" -o "$p" -w "%{http_code} $p\n" "$u" || true
done

# Fonts and images referenced from those stylesheets
cat dist/brandable_css/*/*.css dist/brandable_css/*/bundles/*.css \
  | grep -oE "url\([\"']?/dist/[^)\"'?#]+" | sed -E "s/url\([\"']?\///" | sort -u \
  | while read -r p; do
      mkdir -p "$(dirname "$p")"
      curl -sS --compressed -A "$UA" -o "$p" -w "%{http_code} $p\n" "$CDN/$p" || true
    done

# Stale-but-public brandable_css manifests (last built 2021; kept for reference only)
for f in brandable_css_bundles_with_deps.json brandable_css_file_checksums.json; do
  curl -sS --compressed -A "$UA" -o "dist/brandable_css/$f" "$CDN/dist/brandable_css/$f"
done

# the pilot school account JS (YuJa Panorama loader) and brand images
mkdir -p school-account
curl -sS -A "$UA" -o school-account/account-script.js \
  "https://instructure-uploads.s3.amazonaws.com/account_100000000000000001/attachments/16516694/Example%20University%20-%20Production-account-script.js"
for a in 310/school_logo_white_smaller.png 315/school_logo_biggest.png 305/school_logo.png 295/school_logo.png 311/school_logo_white_Big.png; do
  curl -sS -A "$UA" -o "school-account/${a/\//-}" \
    "https://instructure-uploads.s3.amazonaws.com/account_100000000000000001/attachments/$a"
done

# Some CDN objects are stored pre-gzipped without Content-Encoding; normalise them.
find dist school-account -type f -print0 | while IFS= read -r -d '' f; do
  if file "$f" | grep -q 'gzip compressed'; then gunzip -c "$f" > "$f.tmp" && mv "$f.tmp" "$f"; fi
done
echo done
