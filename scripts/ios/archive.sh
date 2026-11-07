#!/bin/bash
# Archive Razzberry for App Store distribution. Does not upload.
# Secrets arrive only as environment variables from GitHub Actions.
# This script never prints those values.
set -euo pipefail

BUNDLE_ID="ca.razzberry.app"
FORBIDDEN_ID="ca.uniquem.app"
EXPECTED_PROFILE_NAME="Razzberry App Store"
EXPECTED_PROFILE_UUID="78e76fb8-4d32-44f1-8693-3d63f9c8e263"
EXPECTED_TEAM="3CW838WDQC"

for name in IOS_DIST_P12 IOS_DIST_P12_PASSWORD IOS_APPSTORE_PROFILE ASC_KEY_ID ASC_ISSUER_ID ASC_KEY_P8; do
  if [ -z "${!name:-}" ]; then
    echo "Missing $name. Archive was not signed."
    exit 1
  fi
done

WORK="${RUNNER_TEMP:-/tmp}/razzberry-sign"
rm -rf "$WORK"
mkdir -p "$WORK"
chmod 700 "$WORK"

write_material() {
  local value="$1"
  local dest="$2"
  if printf '%s' "$value" | grep -q 'BEGIN '; then
    printf '%s\n' "$value" > "$dest"
  else
    printf '%s' "$value" | base64 --decode > "$dest"
  fi
  chmod 600 "$dest"
}

write_material "$IOS_DIST_P12" "$WORK/dist.p12"
write_material "$IOS_APPSTORE_PROFILE" "$WORK/profile.mobileprovision"
write_material "$ASC_KEY_P8" "$WORK/AuthKey.p8"

security cms -D -i "$WORK/profile.mobileprovision" > "$WORK/profile.plist"
PROFILE_NAME="$(/usr/libexec/PlistBuddy -c 'Print :Name' "$WORK/profile.plist")"
PROFILE_UUID="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$WORK/profile.plist")"
TEAM="$(/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' "$WORK/profile.plist")"
APP_ID="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$WORK/profile.plist")"
APS="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:aps-environment' "$WORK/profile.plist" || true)"

echo "Profile name: $PROFILE_NAME"
echo "Profile UUID: $PROFILE_UUID"
echo "Team: $TEAM"
echo "Application identifier: $APP_ID"
echo "aps-environment: ${APS:-none}"

if [ "$PROFILE_NAME" != "$EXPECTED_PROFILE_NAME" ] || [ "$PROFILE_UUID" != "$EXPECTED_PROFILE_UUID" ] || [ "$TEAM" != "$EXPECTED_TEAM" ]; then
  echo "Refusing profile. Expected '$EXPECTED_PROFILE_NAME' $EXPECTED_PROFILE_UUID for team $EXPECTED_TEAM."
  exit 1
fi
case "$APP_ID" in
  *"$FORBIDDEN_ID"*)
    echo "Refusing Uniq Group application identifier."
    exit 1
    ;;
  *"$BUNDLE_ID") ;;
  *)
    echo "Profile is not for $BUNDLE_ID."
    exit 1
    ;;
esac
if [ "$APS" != "production" ]; then
  echo "Profile aps-environment must be production."
  exit 1
fi

KEYCHAIN="$WORK/razzberry.keychain-db"
KEYCHAIN_PASSWORD="$(openssl rand -base64 24)"
cleanup() {
  security delete-keychain "$KEYCHAIN" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

security create-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security set-keychain-settings -lut 21600 "$KEYCHAIN"
security unlock-keychain -p "$KEYCHAIN_PASSWORD" "$KEYCHAIN"
security import "$WORK/dist.p12" -k "$KEYCHAIN" -P "$IOS_DIST_P12_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASSWORD" "$KEYCHAIN" >/dev/null
security list-keychains -d user -s "$KEYCHAIN"

IDENTITY="$(security find-identity -v -p codesigning "$KEYCHAIN" | sed -n 's/.*"\(Apple Distribution[^"]*\)".*/\1/p' | head -n 1)"
if [ -z "$IDENTITY" ]; then
  echo "No Apple Distribution identity in the certificate."
  exit 1
fi
echo "Signing identity: $IDENTITY"

mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles"
cp "$WORK/profile.mobileprovision" "$HOME/Library/MobileDevice/Provisioning Profiles/$PROFILE_UUID.mobileprovision"

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
/usr/libexec/PlistBuddy -c 'Clear dict' "$WORK/ExportOptions.plist" >/dev/null 2>&1 || true
cat > "$WORK/ExportOptions.plist" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>app-store-connect</string>
  <key>teamID</key>
  <string>$TEAM</string>
  <key>signingStyle</key>
  <string>manual</string>
  <key>uploadSymbols</key>
  <true/>
  <key>provisioningProfiles</key>
  <dict>
    <key>$BUNDLE_ID</key>
    <string>$PROFILE_NAME</string>
  </dict>
</dict>
</plist>
EOF

cd "$ROOT/ios/App"
xcodebuild \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -destination "generic/platform=iOS" \
  -archivePath "$WORK/Razzberry.xcarchive" \
  CODE_SIGN_STYLE=Manual \
  "CODE_SIGN_IDENTITY=$IDENTITY" \
  "CODE_SIGN_IDENTITY[sdk=iphoneos*]=$IDENTITY" \
  DEVELOPMENT_TEAM="$TEAM" \
  PROVISIONING_PROFILE_SPECIFIER="$PROFILE_NAME" \
  CODE_SIGN_ENTITLEMENTS=App/App.entitlements \
  archive

xcodebuild \
  -exportArchive \
  -archivePath "$WORK/Razzberry.xcarchive" \
  -exportPath "$WORK/export" \
  -exportOptionsPlist "$WORK/ExportOptions.plist"

IPA="$(find "$WORK/export" -name '*.ipa' -print -quit)"
if [ -z "$IPA" ]; then
  echo "Export did not produce an ipa."
  exit 1
fi
echo "Archived and exported $(basename "$IPA")."
echo "Not uploaded. App Store Connect has no Razzberry app record yet, so TestFlight upload stays off."
