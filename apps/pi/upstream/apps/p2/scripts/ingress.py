#!/usr/bin/env python3
"""Standalone p2 ingress v1 client; Python standard library only. Receipts mean admission, not reading/completion."""
import argparse
import hashlib
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, file, code, message, headers, new_url):
        return None


def valid_receipt(value, event_id, expected_hash):
    return (isinstance(value, dict)
            and set(value) == {"state", "eventId", "contentHash", "submissionId"}
            and value["state"] == "admitted"
            and value["eventId"] == event_id
            and isinstance(value["contentHash"], str)
            and len(value["contentHash"]) == 64
            and all(c in "0123456789abcdef" for c in value["contentHash"])
            and (expected_hash is None or value["contentHash"] == expected_hash)
            and type(value["submissionId"]) is int
            and value["submissionId"] > 0)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("event_id", help="stable ID; retry identical content with the same ID")
    source = parser.add_mutually_exclusive_group()
    source.add_argument("--text")
    source.add_argument("--file", type=pathlib.Path)
    source.add_argument("--receipt", action="store_true")
    parser.add_argument("--url", default="http://127.0.0.1:8788")
    parser.add_argument("--token-file", type=pathlib.Path, default=os.environ.get("P2_INGRESS_TOKEN_FILE"))
    args = parser.parse_args()
    if not args.token_file:
        parser.error("--token-file or P2_INGRESS_TOKEN_FILE is required")
    if not 1 <= len(args.event_id) <= 128 or any(c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._:-" for c in args.event_id):
        parser.error("invalid event ID")
    token = args.token_file.read_text().strip()
    expected_hash = None
    if args.receipt:
        path, body = "/api/ingress/v1/receipts/" + args.event_id, None
    else:
        text = args.text if args.text is not None else args.file.read_text() if args.file else sys.stdin.read()
        expected_hash = hashlib.sha256(text.encode("utf-8")).hexdigest()
        path = "/api/ingress/v1/events"
        body = json.dumps({"eventId": args.event_id, "text": text}, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(args.url.rstrip("/") + path, data=body,
                                     headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=60) as response:
            # HTTP response is an untrusted wire boundary, not proof of admission by itself.
            if response.status != 200:
                raise ValueError("Expected HTTP 200 admission receipt")
            body = response.read(65537)
            if len(body) > 65536:
                raise ValueError("Admission receipt too large")
            value = json.loads(body)
            if not valid_receipt(value, args.event_id, expected_hash):
                raise ValueError("Invalid admission receipt")
            print(json.dumps(value))
    except urllib.error.HTTPError as error:
        print("HTTP " + str(error.code) + "; not accepted. Redirects are refused.", file=sys.stderr)
        return 1
    except (ValueError, UnicodeError):
        print("Invalid admission response; outcome unknown. Retry the SAME event ID and content.", file=sys.stderr)
        return 1
    except (OSError, TimeoutError):
        print("Outcome unknown; retry the SAME event ID and content or read its receipt.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
