#!/usr/bin/env bash
# Chrome Web Store upload/publish for Tab Automator, via the Chrome Web Store API v2.
#
#   scripts/upload-cws.sh status             read-only: show the listing's current state (default)
#   scripts/upload-cws.sh upload [zip]       upload a package as a draft (default: tab-automator.zip)
#   scripts/upload-cws.sh publish            submit the uploaded draft for review/publication
#
# Needs in the environment: GOOGLE_SA_JSON (path to a service-account key that is added to the
# listing's publisher account) and CWS_PUBLISHER_ID (shown in the developer dashboard under Account).
# CWS_ITEM_ID defaults to the Tab Automator listing. Nothing secret is ever printed.
set -euo pipefail

ACTION="${1:-status}"
ZIP="${2:-tab-automator.zip}"
ITEM_ID="${CWS_ITEM_ID:-mookagdegldeclccpbjgpbdacipiehff}"
API="https://chromewebstore.googleapis.com"

: "${GOOGLE_SA_JSON:?GOOGLE_SA_JSON is not set (path to the service-account key)}"
: "${CWS_PUBLISHER_ID:?CWS_PUBLISHER_ID is not set (developer dashboard > Account)}"
[ -r "$GOOGLE_SA_JSON" ] || { echo "Cannot read the key file named by GOOGLE_SA_JSON" >&2; exit 1; }

# Signs a JWT with the service-account key and exchanges it for a short-lived access token.
token() {
	python3 - "$GOOGLE_SA_JSON" <<'PY'
import base64, json, subprocess, sys, time, urllib.parse, urllib.request

key = json.load(open(sys.argv[1]))
b64 = lambda raw: base64.urlsafe_b64encode(raw).rstrip(b"=")
now = int(time.time())
header = b64(json.dumps({"alg": "RS256", "typ": "JWT"}).encode())
claims = b64(json.dumps({
    "iss": key["client_email"],
    "scope": "https://www.googleapis.com/auth/chromewebstore",
    "aud": "https://oauth2.googleapis.com/token",
    "iat": now,
    "exp": now + 600,
}).encode())
signing_input = header + b"." + claims

# openssl needs the key as a file; keep it in a private temp file for the signing call only.
import os, tempfile
fd, path = tempfile.mkstemp()
try:
    os.write(fd, key["private_key"].encode())
    os.close(fd)
    signature = subprocess.run(
        ["openssl", "dgst", "-sha256", "-sign", path],
        input=signing_input, capture_output=True, check=True,
    ).stdout
finally:
    os.remove(path)

body = urllib.parse.urlencode({
    "grant_type": "urn:ietf:params:oauth:grant-type:jwt-bearer",
    "assertion": (signing_input + b"." + b64(signature)).decode(),
}).encode()
with urllib.request.urlopen(urllib.request.Request("https://oauth2.googleapis.com/token", data=body)) as response:
    print(json.load(response)["access_token"])
PY
}

TOKEN="$(token)"
AUTH=(-H "Authorization: Bearer ${TOKEN}")
ITEM="publishers/${CWS_PUBLISHER_ID}/items/${ITEM_ID}"

case "$ACTION" in
	status)
		curl -sS --fail-with-body "${AUTH[@]}" "${API}/v2/${ITEM}:fetchStatus"
		;;
	upload)
		[ -f "$ZIP" ] || { echo "No such package: $ZIP" >&2; exit 1; }
		curl -sS --fail-with-body "${AUTH[@]}" -X POST -T "$ZIP" "${API}/upload/v2/${ITEM}:upload"
		;;
	publish)
		curl -sS --fail-with-body "${AUTH[@]}" -X POST "${API}/v2/${ITEM}:publish"
		;;
	*)
		echo "Usage: $0 [status|upload [zip]|publish]" >&2
		exit 2
		;;
esac
echo
