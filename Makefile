.DEFAULT_GOAL := build

.PHONY: all build dev check test run clean help reinstall reset-screen-permission

APP_ID := com.soundssource.rust-sound
INSTALLED_APP := /Applications/rust-sound.app

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

# Wipe every old build of the app, build fresh and reinstall it into /Applications.
# Quits the running copy first: its bundle is about to be deleted under it.
reinstall:
	-pkill -x rust-sound
	rm -rf dist target/release/bundle "$(INSTALLED_APP)"
	pnpm tauri build --bundles app
	cp -R target/release/bundle/macos/rust-sound.app /Applications/
	@echo "Đã cài lại $(INSTALLED_APP)"
	@echo "Bundle mới có cdhash mới: nếu chia sẻ màn hình không ra hình, chạy 'make reset-screen-permission'."
	open "$(INSTALLED_APP)"

# macOS khóa quyền ghi màn hình theo cdhash, nên mỗi lần build lại quyền cũ có thể
# không còn khớp. Lệnh này xóa bản ghi cũ để app hỏi lại quyền từ đầu.
reset-screen-permission:
	tccutil reset ScreenCapture $(APP_ID)
	@echo "Đã xóa quyền ghi màn hình của $(APP_ID). Mở app và chia sẻ lại để macOS hỏi quyền."

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
	@echo "  make reinstall        - Delete every old build + /Applications copy, rebuild, reinstall, open"
	@echo "  make reset-screen-permission - Clear the stale Screen Recording grant after a rebuild"
	@echo "  make clean            - Remove build artifacts (dist/ and target/)"
	@echo "  make help             - Show this help message"
