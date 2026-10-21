#!/bin/bash
# Builds the production macOS app, signs it with a stable identity, and deploys it to
# /Applications.
#
# This used to be one long line in package.json ending in `codesign --sign -`. That
# ad-hoc signature is what made macOS forget Screen Recording on every rebuild, so the
# signing step now prefers a real certificate and says plainly what the fallback costs.
set -euo pipefail

APP_NAME="SoundsSource Studio.app"
BUILT_APP="target/release/bundle/macos/$APP_NAME"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "pnpm rebuild:app is macOS only. On Linux/CI, build the frontend and run the Rust tests instead." >&2
  exit 1
fi

rm -rf dist target/release/bundle
pnpm tauri build --bundles app

if [[ ! -d "$BUILT_APP" ]]; then
  echo "Build did not produce $BUILT_APP" >&2
  exit 1
fi

# A certificate keeps the app's identity stable across builds, so macOS keeps the
# permissions you granted it. Ad-hoc signing does not.
if identity="$(./scripts/macos-signing-identity.sh --check 2>/dev/null)"; then
  echo "Signing with \"$identity\" (permissions survive rebuilds)"
  codesign --force --deep --sign "$identity" "$BUILT_APP"
else
  codesign --force --deep --sign - "$BUILT_APP"
  cat >&2 <<'EOF'

Signed ad-hoc. macOS identifies an ad-hoc build by its exact binary, so this rebuild
looks like a brand new app: Screen Recording, Accessibility and Microphone all have to be
granted again, and System Settings collects a stale entry each time.

Run this once to stop that happening:
  ./scripts/macos-signing-identity.sh

EOF
fi

rm -rf "/Applications/$APP_NAME" /Applications/rust-sound.app
cp -R "$BUILT_APP" /Applications/
"$LSREGISTER" -u "$PWD/$BUILT_APP" 2>/dev/null || true
rm -rf target/release/bundle

echo "Successfully deployed /Applications/$APP_NAME"
