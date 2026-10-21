#!/bin/bash
# Creates, once, a local code-signing certificate so rebuilds keep their macOS permissions.
#
# Why this exists
# ---------------
# `codesign --sign -` is an ad-hoc signature: there is no certificate, so the app's
# designated requirement degrades to its exact cdhash. macOS keys TCC grants (Screen
# Recording, Accessibility, Microphone) to that requirement, so every rebuild produces a
# binary macOS has never seen, the old grant no longer matches, and the app is prompted
# again — while a stale duplicate entry piles up in System Settings.
#
# Signing with a certificate makes the requirement `identifier "..." and certificate leaf
# = H"<cert>"`, which does not change when the binary does. The grant survives rebuilds.
#
# The certificate is self-signed and lives only in your login keychain. It is for keeping
# permissions on this machine; it is not a Developer ID and does not notarize anything.
#
#   ./scripts/macos-signing-identity.sh          create it if missing, print the name
#   ./scripts/macos-signing-identity.sh --check  print the name if it exists, else exit 1
set -euo pipefail

IDENTITY_NAME="${RUST_SOUND_SIGN_IDENTITY:-SoundsSource Local Dev}"

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS only; nothing to do on $(uname -s)." >&2
  exit 0
fi

identity_exists() {
  security find-identity -v -p codesigning 2>/dev/null | grep -qF "$IDENTITY_NAME"
}

if identity_exists; then
  echo "$IDENTITY_NAME"
  exit 0
fi

if [[ "${1:-}" == "--check" ]]; then
  exit 1
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT

# codeSigning is the extended key usage codesign looks for; without it the certificate is
# in the keychain but `security find-identity -p codesigning` will not list it.
cat >"$workdir/openssl.cnf" <<EOF
[ req ]
distinguished_name = dn
x509_extensions = ext
prompt = no

[ dn ]
CN = $IDENTITY_NAME

[ ext ]
basicConstraints = critical,CA:false
keyUsage = critical,digitalSignature
extendedKeyUsage = critical,codeSigning
EOF

echo "Creating a local signing certificate: $IDENTITY_NAME"
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout "$workdir/key.pem" -out "$workdir/cert.pem" \
  -config "$workdir/openssl.cnf" >/dev/null 2>&1

openssl pkcs12 -export -out "$workdir/identity.p12" \
  -inkey "$workdir/key.pem" -in "$workdir/cert.pem" \
  -passout pass: -name "$IDENTITY_NAME" >/dev/null 2>&1

keychain="$(security default-keychain | tr -d ' "')"

# -T codesign lets codesign use the key without a prompt on every build. The key stays in
# your login keychain and never leaves this machine.
security import "$workdir/identity.p12" -k "$keychain" -P "" \
  -T /usr/bin/codesign -T /usr/bin/security >/dev/null

# Without this, macOS asks for the keychain password on every signature.
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "" "$keychain" >/dev/null 2>&1 ||
  echo "Note: could not pre-authorize the key; macOS may ask for your keychain password on the first build." >&2

if ! identity_exists; then
  cat >&2 <<EOF

Could not register "$IDENTITY_NAME" as a code-signing identity.

Create it by hand instead:
  Keychain Access > Certificate Assistant > Create a Certificate...
    Name:              $IDENTITY_NAME
    Identity Type:     Self Signed Root
    Certificate Type:  Code Signing
Then run 'pnpm rebuild:app' again.
EOF
  exit 1
fi

cat >&2 <<EOF

Created "$IDENTITY_NAME".

The first build signed with it still asks for Screen Recording once, because macOS has
not seen this identity before. Grant it, and every rebuild after that keeps the grant.
If System Settings shows stale duplicate entries for this app, remove them first.
EOF

echo "$IDENTITY_NAME"
