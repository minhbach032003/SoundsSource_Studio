#!/bin/bash
# Create a stable local code-signing identity, not a distribution/notarization identity.
# --check only looks up an existing valid identity; it never modifies Keychain.
# Keep this certificate: replacing it can invalidate macOS privacy grants.
set -euo pipefail
umask 077

IDENTITY_NAME="${RUST_SOUND_SIGN_IDENTITY:-SoundsSource Local Dev}"
if [[ -z "$IDENTITY_NAME" || "$IDENTITY_NAME" == *$'\n'* || "$IDENTITY_NAME" == *$'\r'* || "$IDENTITY_NAME" == *'"'* ]]; then
  echo "Invalid signing identity name." >&2
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "macOS only." >&2
  exit 1
fi

identity_exists() {
  security find-identity -v -p codesigning 2>/dev/null | grep -F -- "\"$IDENTITY_NAME\"" >/dev/null
}

if identity_exists; then
  echo "$IDENTITY_NAME"
  exit 0
fi

if [[ "${1:-}" == "--check" ]]; then
  exit 1
fi

# Do not silently replace an expired/untrusted identity: that changes privacy identity too.
if security find-certificate -c "$IDENTITY_NAME" >/dev/null 2>&1; then
  echo "A certificate named '$IDENTITY_NAME' exists but is not a valid signing identity. Repair its Code Signing trust/private key in Keychain Access rather than creating a replacement." >&2
  exit 1
fi

# This name is interpolated into OpenSSL configuration only when creating a new identity.
if [[ ! "$IDENTITY_NAME" =~ ^[a-zA-Z0-9][a-zA-Z0-9._\ -]*$ ]]; then
  echo "New local identity names may contain only letters, digits, spaces, dots, underscores and hyphens." >&2
  exit 1
fi

workdir="$(mktemp -d)"
trap 'rm -rf "$workdir"' EXIT
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

echo "Creating a local signing certificate: $IDENTITY_NAME" >&2
# Use macOS's OpenSSL/LibreSSL so the PKCS#12 encoding is accepted by Keychain.
/usr/bin/openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout "$workdir/key.pem" -out "$workdir/cert.pem" \
  -config "$workdir/openssl.cnf" >/dev/null 2>&1
# Keychain can reject empty-password PKCS#12 files. Use a temporary random password.
p12_password="$(/usr/bin/openssl rand -hex 24)"
/usr/bin/openssl pkcs12 -export -out "$workdir/identity.p12" \
  -inkey "$workdir/key.pem" -in "$workdir/cert.pem" \
  -passout "pass:$p12_password" -name "$IDENTITY_NAME" >/dev/null 2>&1

keychain="$(security default-keychain)"
keychain="${keychain#*\"}"
keychain="${keychain%\"*}"
security import "$workdir/identity.p12" -k "$keychain" -P "$p12_password" \
  -T /usr/bin/codesign >/dev/null

# User-domain trust, restricted to code signing; never blanket-edit other keys' ACLs.
# macOS may ask for authorization here or on the first use of the signing key.
security add-trusted-cert -r trustRoot -p codeSign -k "$keychain" "$workdir/cert.pem"

if ! identity_exists; then
  echo "Identity is not valid yet. In Keychain Access, check '$IDENTITY_NAME' and its Code Signing trust. Do not create a replacement." >&2
  exit 1
fi

cat >&2 <<EOF
Created "$IDENTITY_NAME". The first signed build may need a new Screen Recording grant.
Quit and reopen SoundsSource Studio after granting access. Later builds using this same
certificate and bundle identifier keep a stable signing identity; macOS may still require
its own consent or restart. This is local signing, not Developer ID or notarization.
EOF
echo "$IDENTITY_NAME"
