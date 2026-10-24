#!/bin/bash
# Builds the production macOS app, signs it with a stable identity, and deploys it to
# /Applications.
#
# Never replace the installed app with an ad-hoc build: its changing identity can
# invalidate existing macOS privacy grants even when Settings still shows them enabled.
set -euo pipefail

APP_NAME="SoundsSource Studio.app"
BUILT_APP="target/release/bundle/macos/$APP_NAME"
LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "pnpm rebuild:app is macOS only. On Linux/CI, build the frontend and run the Rust tests instead." >&2
  exit 1
fi

if ! identity="$(./scripts/macos-signing-identity.sh --check)"; then
  echo "No valid stable signing identity. Run ./scripts/macos-signing-identity.sh once, then retry. Installed app was not changed." >&2
  exit 1
fi

rm -rf dist target/release/bundle
pnpm tauri build --bundles app

if [[ ! -d "$BUILT_APP" ]]; then
  echo "Build did not produce $BUILT_APP" >&2
  exit 1
fi

echo "Signing with \"$identity\" (stable local identity)"
codesign --force --deep --sign "$identity" --preserve-metadata=entitlements,flags,runtime "$BUILT_APP"
codesign --verify --deep --strict "$BUILT_APP"

rm -rf "/Applications/$APP_NAME" /Applications/rust-sound.app
cp -R "$BUILT_APP" /Applications/
"$LSREGISTER" -u "$PWD/$BUILT_APP" 2>/dev/null || true
rm -rf target/release/bundle

echo "Successfully deployed /Applications/$APP_NAME"
