#!/usr/bin/env python3
"""Upload an already exported IPA to TestFlight and report processing. Does not submit for review."""
import base64
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.request

BUNDLE_ID = "ca.razzberry.app"
FORBIDDEN = "ca.uniquem.app"


def b64(data: bytes) -> bytes:
    return base64.urlsafe_b64encode(data).rstrip(b"=")


def der_to_raw(der: bytes) -> bytes:
    if der[0] != 0x30:
        raise SystemExit("API key signature was not an ECDSA sequence")
    index = 2
    if der[1] & 0x80:
        index = 2 + (der[1] & 0x7F)

    def read_int(buf: bytes, at: int) -> tuple[bytes, int]:
        if buf[at] != 0x02:
            raise SystemExit("API key signature integer missing")
        size = buf[at + 1]
        at += 2
        value = buf[at : at + size]
        if value[:1] == b"\x00":
            value = value[1:]
        return value, at + size

    part_r, index = read_int(der, index)
    part_s, _index = read_int(der, index)
    return part_r.rjust(32, b"\x00")[-32:] + part_s.rjust(32, b"\x00")[-32:]


def asc_token(key_id: str, issuer: str, key_path: str) -> str:
    header = b64(json.dumps({"alg": "ES256", "kid": key_id, "typ": "JWT"}).encode())
    payload = b64(json.dumps({"iss": issuer, "exp": int(time.time()) + 500, "aud": "appstoreconnect-v1"}).encode())
    signing = header + b"." + payload
    der = subprocess.check_output(["openssl", "dgst", "-sha256", "-sign", key_path], input=signing)
    return (signing + b"." + b64(der_to_raw(der))).decode()


def asc_get(token: str, path: str) -> dict:
    request = urllib.request.Request(
        "https://api.appstoreconnect.apple.com" + path,
        headers={"Authorization": f"Bearer {token}", "Accept": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def require_app(token: str, app_id: str) -> None:
    try:
        body = asc_get(token, f"/v1/apps/{app_id}?fields[apps]=bundleId,name")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", "replace")[:500]
        raise SystemExit(f"App Store Connect app {app_id} was not readable ({error.code}). {detail}") from error
    bundle = body.get("data", {}).get("attributes", {}).get("bundleId", "")
    name = body.get("data", {}).get("attributes", {}).get("name", "")
    print(f"App Store Connect app {app_id}: {name} bundle {bundle}")
    if bundle == FORBIDDEN or FORBIDDEN in bundle:
        raise SystemExit("Refusing Uniq Group app")
    if bundle != BUNDLE_ID:
        raise SystemExit(f"App {app_id} is {bundle}, not {BUNDLE_ID}")


def upload_ipa(ipa: str, key_id: str, issuer: str, key_path: str) -> None:
    private = os.path.expanduser("~/.appstoreconnect/private_keys")
    os.makedirs(private, exist_ok=True)
    dest = os.path.join(private, f"AuthKey_{key_id}.p8")
    with open(key_path, "rb") as source, open(dest, "wb") as target:
        target.write(source.read())
    os.chmod(dest, 0o600)
    if subprocess.call(["xcrun", "--find", "altool"], stdout=subprocess.DEVNULL) == 0:
        command = ["xcrun", "altool", "--upload-app", "-f", ipa, "-t", "ios", "--apiKey", key_id, "--apiIssuer", issuer]
    else:
        command = ["xcrun", "iTMSTransporter", "-m", "upload", "-assetFile", ipa, "-apiKey", key_id, "-apiIssuer", issuer]
    print("Uploading IPA to App Store Connect for TestFlight processing. This is not an App Store review submission.")
    subprocess.check_call(command)


def latest_build(token: str, app_id: str) -> dict | None:
    body = asc_get(token, f"/v1/builds?filter[app]={app_id}&sort=-uploadedDate&limit=1&include=buildBetaDetail&fields[builds]=version,processingState,uploadedDate,expired&fields[buildBetaDetails]=internalBuildState,externalBuildState")
    data = body.get("data") or []
    if not data:
        return None
    build = data[0]
    detail = {}
    included = body.get("included") or []
    if included:
        detail = included[0].get("attributes") or {}
    attributes = build.get("attributes") or {}
    return {
        "id": build.get("id"),
        "version": attributes.get("version"),
        "processingState": attributes.get("processingState"),
        "uploadedDate": attributes.get("uploadedDate"),
        "internalBuildState": detail.get("internalBuildState"),
        "externalBuildState": detail.get("externalBuildState"),
    }


def main() -> None:
    app_id = os.environ.get("ASC_APP_ID", "").strip()
    if not app_id.isdigit():
        raise SystemExit("ASC_APP_ID must be the numeric App Store Connect id")
    for name in ("ASC_KEY_ID", "ASC_ISSUER_ID", "ASC_KEY_P8"):
        if not os.environ.get(name):
            raise SystemExit(f"Missing {name}")
    ipa = os.environ.get("IPA_PATH", "ios/App/output/Razzberry.ipa")
    if not os.path.isfile(ipa):
        raise SystemExit(f"IPA not found at {ipa}")
    key_path = os.environ.get("ASC_KEY_PATH", "")
    if not key_path:
        key_path = "/tmp/AuthKey-upload.p8"
        value = os.environ["ASC_KEY_P8"]
        with open(key_path, "w", encoding="utf-8") as handle:
            if "BEGIN " in value:
                handle.write(value if value.endswith("\n") else value + "\n")
            else:
                handle.write(base64.b64decode(value).decode("utf-8"))
        os.chmod(key_path, 0o600)
    token = asc_token(os.environ["ASC_KEY_ID"], os.environ["ASC_ISSUER_ID"], key_path)
    require_app(token, app_id)
    upload_ipa(ipa, os.environ["ASC_KEY_ID"], os.environ["ASC_ISSUER_ID"], key_path)
    expected = os.environ.get("EXPECTED_BUILD_VERSION", "").strip()
    print("Upload request accepted. Waiting for processing. Uploaded does not mean testers can install.")
    if expected:
        print(f"This upload must become build {expected}. An older ready build is not this upload.")
    deadline = time.time() + 20 * 60
    last = None
    while time.time() < deadline:
        time.sleep(30)
        token = asc_token(os.environ["ASC_KEY_ID"], os.environ["ASC_ISSUER_ID"], key_path)
        last = latest_build(token, app_id)
        if not last:
            print("No build listed yet.")
            continue
        print(
            f"Build {last['version']} id={last['id']} processing={last['processingState']} "
            f"internal={last['internalBuildState']} external={last['externalBuildState']}"
        )
        if expected and str(last.get("version")) != expected:
            print(f"Latest listed build is {last['version']}, still waiting for {expected}.")
            continue
        if last["processingState"] in ("FAILED", "INVALID"):
            raise SystemExit("Apple finished processing with a failure. The build is not installable.")
        if last["internalBuildState"] in ("READY_FOR_BETA_TESTING", "IN_BETA_TESTING", "IN_EXPORT_COMPLIANCE_REVIEW"):
            if last["internalBuildState"] == "READY_FOR_BETA_TESTING":
                print("Processing is complete enough for internal TestFlight, but this job did not add testers.")
            elif last["internalBuildState"] == "IN_BETA_TESTING":
                print("Build is in internal beta testing.")
            else:
                print("Build is still in export compliance review, so testers cannot install it yet.")
            return
        if last["processingState"] == "VALID" and last["internalBuildState"] not in (None, "PROCESSING"):
            print("Processing state is VALID. Confirm tester access in App Store Connect before calling it installable.")
            return
    print("Still processing after 20 minutes. The upload was accepted, but it is not available to testers yet.")
    if last:
        print(json.dumps(last))


if __name__ == "__main__":
    main()
