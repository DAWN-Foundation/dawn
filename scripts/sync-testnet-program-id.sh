#!/usr/bin/env bash

# Copy dawn-localnet-keypair.json to target location before build
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DAWN_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
TARGET_DIR="$DAWN_DIR/target/deploy"

# Create target/deploy directory if it doesn't exist
mkdir -p "$TARGET_DIR"

# Copy the keypair file
cp "$DAWN_DIR/dawn-localnet-keypair.json" "$TARGET_DIR/dawn-keypair.json"

echo "Copied $DAWN_DIR/dawn-localnet-keypair.json to $TARGET_DIR/dawn-keypair.json"