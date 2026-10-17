.DEFAULT_GOAL := all

.PHONY: all build dev check test run clean help reinstall reset-screen-permission signing-identity

APP_ID := com.soundssource.rust-sound
INSTALLED_APP := /Applications/rust-sound.app

# macOS gắn mọi quyền (Accessibility, Screen Recording) vào chữ ký của bundle. Bản
# ad-hoc đổi cdhash sau mỗi lần build, nên app vừa cấp quyền xong build lại là macOS
# coi như app lạ và hỏi lại từ đầu. Ký bằng một identity cố định thì quyền sống mãi.
SIGN_ID ?= rust-sound Dev
HAS_SIGN_ID = $(shell security find-identity -v -p codesigning 2>/dev/null | grep -c "$(SIGN_ID)")

# Build production release desktop app (.app + DMG installer)
build:
	pnpm tauri build

# Một lệnh `make` duy nhất: xóa bản cũ, build lại, cài lại, mở app. Chỉ xóa quyền ghi
# màn hình khi bundle ký ad-hoc; ký bằng identity cố định thì quyền cũ vẫn dùng được.
all: reinstall
	@if [ "$(HAS_SIGN_ID)" -gt 0 ]; then \
		echo "Chữ ký cố định: quyền đã cấp vẫn còn hiệu lực, không đụng vào."; \
	else \
		$(MAKE) --no-print-directory reset-screen-permission; \
	fi

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
	@if [ "$(HAS_SIGN_ID)" -gt 0 ]; then \
		echo "Ký bằng identity '$(SIGN_ID)' → quyền đã cấp vẫn giữ nguyên sau khi build."; \
		APPLE_SIGNING_IDENTITY="$(SIGN_ID)" pnpm tauri build --bundles app; \
	else \
		echo "Không có identity '$(SIGN_ID)' → build ad-hoc, macOS sẽ hỏi lại quyền sau mỗi lần build. Chạy 'make signing-identity' một lần để hết."; \
		pnpm tauri build --bundles app; \
	fi
	cp -R target/release/bundle/macos/rust-sound.app /Applications/
	@echo "Đã cài lại $(INSTALLED_APP)"
	open "$(INSTALLED_APP)"

# macOS khóa quyền ghi màn hình theo cdhash, nên mỗi lần build lại quyền cũ có thể
# không còn khớp. Lệnh này xóa bản ghi cũ để app hỏi lại quyền từ đầu.
reset-screen-permission:
	tccutil reset ScreenCapture $(APP_ID)
	@echo "Đã xóa quyền ghi màn hình của $(APP_ID). Mở app và chia sẻ lại để macOS hỏi quyền."

# Tạo một lần: self-signed code signing identity để chữ ký của app cố định qua các
# lần build. Ghi vào login keychain, nên lệnh này do người dùng tự chạy.
signing-identity:
	@if [ "$(HAS_SIGN_ID)" -gt 0 ]; then echo "Đã có identity '$(SIGN_ID)', không cần tạo lại."; exit 0; fi; \
	d=$$(mktemp -d); \
	openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
		-keyout "$$d/key.pem" -out "$$d/cert.pem" -subj "/CN=$(SIGN_ID)" \
		-addext "basicConstraints=critical,CA:false" \
		-addext "extendedKeyUsage=critical,codeSigning" >/dev/null 2>&1; \
	openssl pkcs12 -export -inkey "$$d/key.pem" -in "$$d/cert.pem" -out "$$d/id.p12" -passout pass: >/dev/null 2>&1; \
	security import "$$d/id.p12" -k "$$HOME/Library/Keychains/login.keychain-db" -P "" -T /usr/bin/codesign -A; \
	rm -rf "$$d"; \
	echo "Đã tạo identity '$(SIGN_ID)'. Chạy 'make' để build lại và cấp quyền lần cuối cùng."

# Clean build artifacts
clean:
	cargo clean
	rm -rf dist

# Show available commands
help:
	@echo "SoundsSource Rust - Build Commands:"
	@echo "  make                  - Wipe old builds, rebuild, reinstall, reopen, reset screen permission"
	@echo "  make build            - Build production .app and .dmg installer"
	@echo "  make dev              - Start Tauri dev server with live reload"
	@echo "  make check            - Run frontend build and Rust test suite"
	@echo "  make run              - Launch the built macOS application"
	@echo "  make reinstall        - Delete every old build + /Applications copy, rebuild, reinstall, open"
	@echo "  make reset-screen-permission - Clear the stale Screen Recording grant after a rebuild"
	@echo "  make signing-identity - One-time: stable self-signed signature so granted permissions survive rebuilds"
	@echo "  make clean            - Remove build artifacts (dist/ and target/)"
	@echo "  make help             - Show this help message"
