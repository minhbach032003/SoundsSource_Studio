# ADR 0005: Native Google Calendar Integration with PKCE & Local Storage

## Bối cảnh
Người dùng cần xem và đồng bộ lịch từ Google Calendar trực tiếp vào màn hình Focus Timer (`TimerView.svelte`) của `rust-sound` để:
- Hiển thị danh sách cuộc hẹn, sự kiện trong ngày hôm nay.
- Biến các sự kiện lịch thành mục tiêu tập trung (Focus Goal / Pomodoro Session).
- Bấm vào link Google Meet trực tiếp từ app nếu có.

## Quyết định Kiến trúc
1. **OAuth2 Flow**:
   - Sử dụng direct OAuth 2.0 with PKCE (RFC 7636) từ ứng dụng desktop tới Google Authorization Server.
   - Redirect URI: `http://127.0.0.1:<random-port>/callback` (sử dụng loopback listener đã có sẵn trong engine).
   - Scope: `https://www.googleapis.com/auth/calendar.events.readonly` + `openid email profile`.
2. **Bảo mật & Quản lý Token**:
   - Access token và Refresh token được lưu an toàn cục bộ trong macOS Keychain / secure local storage.
   - Không chuyển token sang server trung gian để đảm bảo quyền riêng tư tối đa.
   - Hỗ trợ auto-refresh token khi access token hết hạn.
3. **API & Data Flow**:
   - Endpoint: `https://www.googleapis.com/calendar/v3/calendars/primary/events`
   - Filter: `timeMin = đầu ngày hôm nay (00:00:00)`, `timeMax = cuối ngày hôm nay (23:59:59)`, `singleEvents = true`, `orderBy = startTime`.
   - IPC Tauri Commands:
     - `google_calendar_status`: kiểm tra trạng thái kết nối và email đã liên kết.
     - `google_calendar_login`: mở trình duyệt xác thực Google Calendar OAuth.
     - `google_calendar_sync`: gọi API Google Calendar, trả về danh sách sự kiện chuẩn hóa.
     - `google_calendar_disconnect`: ngắt kết nối và xóa token.
4. **Giao diện & Tương tác**:
   - Cập nhật `GoogleCalendarState` trong frontend để gọi Tauri IPC thay vì mock data.
   - `TimerView.svelte`: Hiển thị rõ danh sách sự kiện thật của hôm nay, có nút Sync, mở link Meet, chuyển đổi sự kiện thành Pomodoro timebox.

## Hệ quả & Rủi ro
- Khi chưa cấu hình Google Client ID riêng trong biến môi trường / settings, app sẽ thông báo rõ ràng cho người dùng hướng dẫn cài đặt.
- Phù hợp với tiêu chuẩn kiến trúc: `app -> engine -> core`.
