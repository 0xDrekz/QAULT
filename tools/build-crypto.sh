#!/bin/sh
# Rebuilds public/vault/crypto.js from pinned, audited libraries.
set -e
DIR=$(mktemp -d)
cp "$(dirname "$0")/crypto-entry.js" "$DIR/entry.js"
cd "$DIR"
npm init -y >/dev/null
npm i --silent @noble/hashes@1.8.0 @noble/curves@1.9.7 @scure/bip39@1.6.0 @scure/base@1.2.6 esbuild@0.25.10
OUT="$OLDPWD/$(dirname "$0")/../public/vault/crypto.js"
npx esbuild entry.js --bundle --format=esm --minify --legal-comments=inline \
  --banner:js="/* QAULT vault crypto: @noble/hashes 1.8.0, @noble/curves 1.9.7, @scure/bip39 1.6.0, @scure/base 1.2.6 (MIT). Built by tools/build-crypto.sh */" \
  --outfile="$OUT"
