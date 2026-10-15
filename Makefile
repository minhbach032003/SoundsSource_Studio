.DEFAULT_GOAL := build

.PHONY: all build dev check test run clean help

# Build production release desktop app (.app + DMG installer)
build:
	pnpm tauri build

all: build

# Run local development with live HMR
dev:
	pnpm tauri dev

# Run full project checks (TypeScript build + Cargo test suite)
check:
	pnpm build
	cargo test

test: check

# Open the built macOS application directly
run:
	open target/release/bundle/macos/rust-sound.app

# Clean build artifacts
clean:
	cargo clean
	rm -rf dist

# Show available commands
help:
	@echo "SoundsSource Rust - Build Commands:"
	@echo "  make (or make build)  - Build production .app and .dmg installer"
	@echo "  make dev              - Start Tauri dev server with live reload"
	@echo "  make check            - Run frontend build and Rust test suite"
	@echo "  make run              - Launch the built macOS application"
	@echo "  make clean            - Remove build artifacts (dist/ and target/)"
	@echo "  make help             - Show this help message"
