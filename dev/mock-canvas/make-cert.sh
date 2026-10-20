#!/usr/bin/env bash
# Generates a self-signed certificate for canvas.example.edu into .certs/ (gitignored).
# Tests pass --ignore-certificate-errors, so the cert is never installed anywhere.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .certs
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout .certs/canvas.example.edu.key -out .certs/canvas.example.edu.crt \
  -subj "/CN=canvas.example.edu/O=mock-canvas (b2c tests)" \
  -addext "subjectAltName=DNS:canvas.example.edu,DNS:localhost,IP:127.0.0.1" 2>/dev/null
echo "wrote .certs/canvas.example.edu.{key,crt}"
