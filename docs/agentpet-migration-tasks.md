# AgentPet migration — backlog triển khai cho đội subagent

## 1. Mục tiêu và cách sử dụng

Chuyển đầy đủ **hành vi** AgentPet từ Swift sang rust-sound: ingestion, session, care, token/usage, project routing, approval, terminal, lịch sử, tích hợp agent, desktop companion và settings. Không chỉ sao chép UI; không cần sao chép kiến trúc Swift.

- **Nguồn chuẩn:** `/Users/mac/Documents/agentpet` (chỉ đọc).
- **Đích:** `/Users/mac/Documents/rust-sound`.
- **Trạng thái tài liệu:** backlog từ đối chiếu source; chưa chứng nhận parity toàn bộ, chưa có runtime acceptance cho các thiếu sót nêu dưới đây.
- **CONFIRMED:** đã thấy đường chạy thiếu/sai cụ thể.
- **VERIFY:** mới xác định chức năng nguồn hoặc rủi ro; phải trace implementation đích trước, không mặc định viết mới.
- Mỗi task chỉ hoàn thành khi có evidence và kiểm tra hành vi. Nếu đã tương đương, đóng bằng bằng chứng `đã có`, không viết lại.
- Phạm vi là chức năng sản phẩm macOS đang hợp nhất. Backend/web/CDN/Windows của nguồn chỉ cần đọc khi xác định protocol hoặc parity; không tự triển khai lại các sản phẩm đó.

### Prompt giao một task

```text
Thực hiện TASK AP-XX trong docs/agentpet-migration-tasks.md.
Đọc mục 1–4, task được giao và kết quả dependency; không đọc toàn bộ repo.
Đối chiếu file nguồn được chỉ định, trace caller thật ở đích trước khi sửa.
CONFIRMED vẫn cần kiểm tra source hiện tại; VERIFY có thể kết luận đã có.
Chỉ sửa phạm vi được giao. Shared files do coordinator tích hợp.
Không tự chạy thêm subagent, không commit/push/deploy trong worker.
Viết regression nhỏ nhất chứng minh hành vi; chạy test liên quan.
Bàn giao: files, behavior, checks/result, integration needs, blockers.
Không sửa Gemini, Keychain/signing hoặc file không thuộc task.
```

## 2. Ràng buộc bắt buộc

1. Đọc `AGENTS.md`, `CONTEXT.md`, ADR liên quan trước khi làm. Tuân thủ `app -> engine -> core`; shared app state thuộc `AppState`; command mỏng, native API ở `core`.
2. Svelte 5 + Tailwind v4; icon dùng `@lucide/svelte` hoặc SVG, không emoji làm icon. Giữ thuật ngữ và design hiện tại, không redesign ngoài yêu cầu.
3. Sensitive/destructive action cần `Modal`; state-changing operation có toast báo kết quả thật. Không báo thành công khi persistence/backend thất bại.
4. Validate IPC/event/path/network payload; giới hạn kích thước và tài nguyên. Không log token, credential, nội dung transcript nhạy cảm.
5. Không tự đổi Keychain, signing, cấp quyền hệ thống, upload transcript hoặc liên kết tài khoản thật. Cần authorization riêng cho các thao tác đó.
6. Reuse helper/module/native capability hiện có; không thêm framework, generic event bus hay abstraction chỉ để port.
7. Không xoá preferences/hook/config người dùng. Migration có backup, idempotent, không ghi đè dữ liệu nguồn đang còn dùng.
8. Tests dùng temp HOME/path, fake clock/fixtures; không ghi `~/.agentpet`, config agent thật, notification thật hoặc gọi cloud thật.
9. Trước mỗi task ghi nhận `git status`. Đã có thay đổi không thuộc backlog tại `src/lib/geminiLive.svelte.ts`, `tests/gemini-live.test.mjs` và `docs/superpowers/`; giữ nguyên.
10. Expanded Gemini patch chưa qua toàn bộ gate: lần chạy trước `tests/voice-ai-view.test.mjs:214` lỗi assertion preview. Không sửa lẫn hoặc deploy các thay đổi này chỉ để hoàn tất task AgentPet.

## 3. Chia việc và tiết kiệm token

### Quyền sở hữu

- Một writer trên một worktree; workers song song phải có worktree riêng.
- Coordinator sở hữu: `crates/app/src/lib.rs`, `crates/engine/src/lib.rs`, `crates/engine/src/pet/mod.rs`, shared DTO/types, đăng ký command/capability, `AgentPetView.svelte`, `PetOverlay.svelte` và integration chung.
- Worker cần shared-file change: bàn giao signature + vị trí gọi + diff đề xuất, không tranh sửa trên cùng checkout.
- File dùng chung khác (đặc biệt `server.rs`, `session.rs`, `transcript.rs`, `hooks.rs`, `care.rs`) phải được coordinator khoá theo task; không chạy hai writer cùng lúc.
- Không worker nào commit/push/deploy. Coordinator làm sau tích hợp và verification theo AGENTS.md.

### Các wave đề nghị

- **Wave 0:** AP-00 — inventory/gap closure và chốt contract tối thiểu.
- **Wave 1:** AP-01 (care), AP-02 (transcript), AP-06 (archive/session), AP-08 (hooks), AP-10 (break), AP-13 (asset review) nếu không trùng file.
- **Wave 2:** AP-03 sau AP-02; AP-04 sau AP-01/AP-03; AP-05 sau AP-06/AP-08; AP-07 sau AP-06; AP-09 sau AP-03/AP-06; AP-11 sau AP-01/AP-04; AP-14 sau AP-01/AP-04.
- **Wave 3:** AP-12 và AP-15 tích hợp frontend/native sau dependencies tương ứng.
- **Wave 4:** AP-16 acceptance và deploy. AP-00 reconciliation cuối để không bỏ sót chức năng nguồn.
- Các wave không tự cho phép concurrency: dependency của từng task và file ownership luôn ưu tiên.

### Bàn giao ngắn

Mỗi worker trả tối đa khoảng 30 dòng, không dump source/log:

```text
Task: AP-XX | DONE / ALREADY_PRESENT / BLOCKED
Behavior: 1–3 dòng khác biệt đã xử lý
Files: danh sách
Checks: command -> pass/fail, số test nếu có
Integration: signature/caller/registration cần coordinator áp dụng
Evidence: source:line -> destination:line
Blockers/remaining: cụ thể, không viết “cần test thêm” chung chung
```

Chỉ coordinator cập nhật checkbox trong file này. Không truyền toàn bộ lịch sử chat cho worker; truyền task + handoff dependency. File đầu vào dưới đây là điểm bắt đầu, không phải lệnh đọc toàn bộ file bất kể kích thước.

## 4. Definition of Done chung

- [ ] Hành vi nguồn được trace đến caller/runtime thật; khác biệt cố ý phải được ghi nhận và chấp thuận.
- [ ] Backend, persistence, IPC và UI cần thiết nối end-to-end; không chỉ thêm export/test helper.
- [ ] Regression kiểm tra hành vi, ưu tiên fake clock/temp files/mock transport; không chỉ regex kiểm tra có tên hàm.
- [ ] Reload/restart, duplicate/stale event và failure path liên quan không làm mất dữ liệu hoặc báo thành công sai.
- [ ] Test liên quan và typecheck/format phù hợp pass; diff không có secret hoặc unrelated edits.
- [ ] Có handoff đủ để coordinator tích hợp; không claim đã kiểm thử thực tế nếu mới chạy mock.

## 5. Tasks

### AP-00 — Khóa inventory và contract tối thiểu [VERIFY]

- **Owner:** coordinator. **Depends:** không.
- **Nguồn:** `Sources/AgentPetCore/`, `Sources/App/`, `Tests/`; README và docs chỉ khi cần giải thích behavior.
- **Đích:** `crates/engine/src/pet/`, `crates/core/src/pet_notifications.rs`, commands pet trong `crates/app/src/lib.rs`, `src/views/*Pet*.svelte`, `src/components/pet/`, `src/lib/pet*`, test pet hiện có.
- Đọc ADR `0001-svelte-5-frontend-migration.md`; ADR 0002 chỉ khi đụng tích hợp Pingloom.
- Lập mapping theo capability, không theo số file; phân biệt `done`, `partial`, `missing`, `unwired`, `out-of-scope-approved`.
- Chốt pet identity/project identity và đường sở hữu state bằng cách reuse domain hiện có; không tạo schema tổng quát trước khi có nhu cầu.
- Giao cụ thể ownership của từng shared file. Chốt migration data contract cho AP-01 và usage delta contract AP-02/AP-03.
- **Accept:** mọi nhóm chức năng nguồn có task hoặc evidence đã có; các phần chưa được kiểm tra trong audit không bị mặc định là thiếu. Chạy lại reconciliation cuối AP-16.
- [x] Hoàn thành.

### AP-01 — Care theo pet + migration dữ liệu [CONFIRMED]

- **Depends:** AP-00.
- **Nguồn:** `App/PetCareController.swift`, `AgentPetCore/PetCare.swift`, phần selected pet trong `PetController.swift` (đều dưới `Sources/`).
- **Đích:** `crates/engine/src/pet/care.rs`; đề xuất API manager/DTO cho coordinator.
- Hiện đích đọc một `PetCareState`; nguồn lưu dictionary `agentpet.care.v2` theo pet, có migration v1.
- Implement state độc lập theo pet, selected-pet fallback đúng nguồn; level/hunger/rollover/streak/achievement đối chiếu công thức nguồn.
- Hỗ trợ chuyển state đơn của rust-sound và dữ liệu legacy thực tế nếu người dùng có. Phải xác minh format/location thật trước khi viết importer; không đoán rằng `petcare.json` là UserDefaults v2.
- Không silent-default khi dữ liệu lỗi rồi ghi đè; propagate save failure; atomic persistence theo helper sẵn có.
- **Accept:** A/B không chia sẻ XP; pet mới fresh; migration chạy hai lần không nhân đôi; backup/parse lỗi không mất dữ liệu; save lỗi tới caller; test boundary ngày/level có fake time.
- [x] Hoàn thành.

### AP-02 — Transcript Claude/Codex/subagent và usage delta [CONFIRMED]

- **Depends:** AP-00. **Ownership:** `transcript.rs`, `pricing.rs`; không sửa ingest `server.rs` đồng thời AP-03.
- **Nguồn:** `AgentPetCore/TranscriptReader.swift`, `ModelPricing.swift`; `App/AppDaemon.swift::feedLiveTokens/feedCodexTokens/feedSubagentTokens/resolveModel/resolveTitle`.
- **Đích:** `crates/engine/src/pet/transcript.rs`, `pricing.rs`, fixtures/tests liên quan.
- Bổ sung Codex rollout và subagent resolution, Claude incremental usage/title/model theo source. Pricing hiện có: đối chiếu, không viết lại mặc định.
- Xác định rõ token có/không gồm cache theo nguồn; tránh double-count cumulative usage, event token và transcript cùng một lượt.
- Xử lý partial JSONL line, file truncate/rotate, read lại, restart và giới hạn đọc. Định nghĩa bootstrap policy dựa trên nguồn để không feed lại cả history ngoài ý muốn.
- Validate transcript path/root, subagent ID, symlink theo trust boundary hiện có; không bỏ sandbox checks để đọc được file.
- **Accept:** fixtures Claude, Codex, subagent cho delta chính xác; lần đọc thứ hai = 0; dòng đang ghi dở được đọc sau khi hoàn chỉnh; model/title/cost đúng; malformed/path invalid không crash.
- [x] Hoàn thành.

### AP-03 — Ingestion accounting, replay và lifecycle server [CONFIRMED + VERIFY]

- **Depends:** AP-02. **Ownership:** `server.rs`, phần event cần bổ sung theo contract.
- **Nguồn:** `App/AppDaemon.swift`, `AgentPetCore/EventSocketServer.swift`, `EventSender.swift`, `EventCoding.swift`.
- **Đích:** `crates/engine/src/pet/server.rs`, `event.rs`; coordinator nối manager nếu cần.
- **Confirmed:** live ingest feed 500 token khi `tokens_to_feed == 0`; queue replay không dùng cùng accounting path; save errors bị bỏ qua.
- Bỏ token giả; xác định precedence event usage/transcript và chỉ feed delta thực. Route subagent usage kể cả khi event không làm đổi state nếu nguồn có hành vi đó.
- Đưa live/replay về cùng policy accounting phù hợp nguồn; giữ timestamp replay và idempotency, không tự replay side effects cũ nếu nguồn không làm.
- **Verify:** startup/socket ownership, cleanup, shutdown, malformed/oversized event, timeout, concurrency, queue read/parse failures. Không xoá queue data chưa xử lý thành công mà không có policy phục hồi rõ.
- **Accept:** zero-usage event không tăng XP; duplicate/replay không feed hai lần; stale event không hồi sinh session; persistence lỗi không mất sự kiện âm thầm; stop/restart không phá socket process khác. Test subprocess/temp HOME.
- [ ] Hoàn thành.

### AP-04 — Project → pet routing và project usage/cost [CONFIRMED]

- **Depends:** AP-01, AP-03.
- **Nguồn:** `App/AppDaemon.swift::careTarget`, `ProjectPetSettings.swift`, `ProjectUsageStore.swift`, `PetBindings.swift`; `AgentPetCore/ProjectPetMapping.swift`, `ProjectPetResolver.swift`.
- **Đích:** domain pet engine; routing call site do coordinator tích hợp; UI cấu hình giao AP-12.
- Split OFF → selected pet; ON → project pet, fallback theo nguồn. Normalize project identity theo source; không gộp chỉ vì cùng basename.
- Ghi token, cost và session theo project/agent, nối data thật thay vì bỏ `UsageDelta.cost_usd/model`.
- Đối chiếu semantics một “session/meal”: không đổi từ completed-turn count sang process-session count chỉ vì tên trường.
- **Accept:** hai project cùng tên thư mục cuối không trộn; split toggle/fallback đúng; usage ghi đúng một lần; restart giữ mapping/statistics; không chứa transcript trong usage upload payload.
- [ ] Hoàn thành.

### AP-05 — Approval request/decision end-to-end [CONFIRMED]

- **Depends:** AP-06, AP-08; coordinator tích hợp event/server thay đổi sau AP-03 để tránh conflict.
- **Nguồn:** `AgentPetCore/PendingApprovalRegistry.swift`, `ApprovalGateConfig.swift`, `AgentEvent.swift`, `SessionStore.swift`; `App/AppDaemon.swift::resolveApproval`; hook payload/CLI liên quan.
- **Đích:** event/session domain, socket response, command và UI approval qua coordinator.
- Port request ID, pending tool summary, decision response/timeout/disconnect lifecycle và optimistic state update đúng nguồn.
- Approval chỉ hợp lệ cho request đang pending; không mặc định auto-allow, không trả success chỉ vì UI đổi state.
- Validate origin/window/capability và decision enum; confirm các thao tác nhạy cảm theo AGENTS.md.
- **Accept:** allow/deny tới đúng requester; ID sai/stale/double-click không approve request mới; mất socket/timeout fail an toàn; test không thực thi tool thật.
- [x] Hoàn thành.

### AP-06 — Session metadata, archive và lifecycle parity [CONFIRMED]

- **Depends:** AP-00. **Ownership:** `session.rs`; coordinate event fields với AP-03/AP-05.
- **Nguồn:** `AgentPetCore/AgentSession.swift`, `SessionStore.swift`, `SessionArchive.swift`, `SessionArchiveStore.swift`, `AgentState.swift`.
- **Đích:** `crates/engine/src/pet/session.rs`, DTO integration giao coordinator.
- Giữ stale/sequence guards hiện có; port metadata cần cho title/model/terminal/approval/state timing.
- Ghi archive khi end/prune theo nguồn; không dùng historical records làm live sessions. Đối chiếu attention sorting thay vì mặc định working ưu tiên waiting.
- Kết nối title/model từ AP-02 sau khi module đó hoàn tất; không chặn AP-06 core vì enrichment.
- **Accept:** timer 30/90/300/600 giây đúng; end/prune archive đúng một lần; session ended không hồi sinh bởi event cũ; archive tồn tại sau restart nhưng không báo working; sort đúng nguồn.
- [ ] Hoàn thành.

### AP-07 — Focus terminal đúng session [CONFIRMED]

- **Depends:** AP-06.
- **Nguồn:** `App/TerminalFocus.swift`, `AgentPetCore/TerminalInfo.swift`, terminal metadata trong hooks.
- **Đích:** native module trong `crates/core/`; command/capability/UI action do coordinator tích hợp.
- Ưu tiên TTY/tab hoặc focus URL nếu nguồn hỗ trợ; app activation fallback rõ ràng.
- Validate program/TTY/scheme; không nội suy payload vào shell/AppleScript không escape; không mở URL tuỳ ý.
- **Accept:** unit test routing/invalid input; manual checklist Terminal.app/iTerm2 và fallback. Permission thiếu có hướng dẫn, không prompt lặp từ polling.
- [x] Hoàn thành.

### AP-08 — Hoàn thiện agent integrations và hook compatibility [CONFIRMED]

- **Depends:** AP-00. **Ownership:** `hooks.rs`, `statemap.rs`; event contract phối hợp coordinator.
- **Nguồn:** `AgentPetCore/AgentCatalog.swift`, `AgentHooks.swift`, `HookInstaller.swift`, `HookPayloads.swift`, agent-specific payload/config, `JcodeHook.swift`, `JcodeClaudeAuth.swift`, `HookArguments.swift`, `RunArguments.swift`; `App/CLI.swift`, `RunCLI.swift`.
- **Đích:** `crates/engine/src/pet/hooks.rs`, `statemap.rs`, hook scripts/templates và tests liên quan.
- Catalog đích hiện có Claude/Codex/Gemini/Cursor/Pi/Droid; nguồn còn opencode/Windsurf/Antigravity/Copilot/Kiro CLI/Grok/jcode.
- Inventory từng integration: installed detection, config path, install/uninstall, supported events, payload normalization, fallback sender/CLI. Một state-map entry không đủ để đánh dấu supported.
- Reuse native integration nếu đã có nơi khác; không sao chép credential từ app khác hoặc đổi auth thật khi chưa được phép.
- **Accept:** fixture matrix đủ 13 agent; idempotent install/uninstall trong temp HOME; giữ hook/config không thuộc AgentPet; corrupt config không bị overwrite; payload thật mẫu ra state đúng. Nếu CLI không cài, ghi rõ chưa smoke-test thay vì claim E2E.
- [ ] Hoàn thành.

### AP-09 — Notifications/sound không phụ thuộc view polling [CONFIRMED + VERIFY]

- **Depends:** AP-03, AP-06.
- **Nguồn:** `App/AppDaemon.swift::notifyIfNeeded/refineDoneIfQuestion`, `NotificationManager.swift`, `SoundSettings.swift`.
- **Đích:** `src/lib/petAudio.ts`, `petPreferences.ts`, view polling, `crates/core/src/pet_notifications.rs`; coordinator nối lifecycle owner.
- Hiện alerts dựa trên previous state ở frontend poll; trace tất cả consumers trước khi chọn điểm phát duy nhất.
- Nối notification decision vào lifecycle sống độc lập với trang AgentPet; giữ mute/custom sound/preferences hiện có và native permission boundary.
- Chống duplicate khi nhiều window; không bỏ waiting/done xảy ra giữa hai poll. Question refinement xong mới thông báo final state.
- **Accept:** tắt trang AgentPet/overlay vẫn có behavior đúng nguồn khi app chạy; hai window chỉ một alert; first-seen event xử lý theo nguồn; mute/no permission không tự prompt; restart/replay không spam historical alerts.
- [x] Hoàn thành.

### AP-10 — Break clock kết nối presence và pet rest [CONFIRMED]

- **Depends:** AP-00; integration UI AP-12.
- **Nguồn:** `App/BreakReminderController.swift`, `BreakReminderSettings.swift`, rest logic trong `PetController.swift`; `AgentPetCore/BreakClock.swift`.
- **Đích:** `crates/engine/src/pet/break_clock.rs`; trace hệ break timer/overlay hiện có trước khi thêm scheduler.
- Port presence = recent input hoặc active agent theo nguồn, sleep/stall reset, enabled/settings và cancel-rest lifecycle.
- Nối toggle `focusTimerSync` vào behavior thật và persistence. Không tạo hai timer cạnh tranh hoặc tự áp Break Scrim cưỡng chế nếu nguồn chỉ nhắc nghỉ.
- **Accept:** fake-clock test work→rest, disabled, settings change, idle, long sleep/wake; mở/đóng view không reset clock; toggle reload vẫn đúng; kiểm tra không trùng hệ break có sẵn.
- [ ] Hoàn thành.

### AP-11 — Reactive speech, hunger/rate-limit signals, idle boost [VERIFY]

- **Depends:** AP-01, AP-04.
- **Nguồn:** `App/ReactiveEngine.swift`, `BubbleMessages.swift`, `BubbleSettings.swift`, `IdleBoost.swift`, `NativeUsageProbe.swift`, `OpenUsageClient.swift`, `MenuBarChatBubble.swift`, `ChatSettings.swift`.
- **Đích:** trace speech/quote/mood/audio consumers hiện có; không coi quote rotation là reactive engine tương đương.
- Đối chiếu threshold, per-metric/cross-metric cooldown, hunger daily cap, session count, streak, quota và daily usage. Port phần thật sự chưa có.
- Xác minh idle boost và chat là chức năng gì trong nguồn trước khi implement; không tự tạo AI chat hoặc network polling mới từ tên file.
- Quota provider không có dữ liệu phải hiển thị unavailable, không giả số. Network/token handling theo authorization và secret policy.
- **Accept:** deterministic clock/input tests cho threshold/cooldown/day rollover; muted/disabled không phát bubble; không tạo request storm; liệt kê mục đã có hoặc cần authorization.
- [ ] Hoàn thành.

### AP-12 — Nối UI thật, theme, history và settings [CONFIRMED + VERIFY]

- **Depends:** AP-01, AP-04, AP-05, AP-06, AP-07, AP-09, AP-10; AP-11 cho reactive controls.
- **Owner:** coordinator hoặc một frontend writer duy nhất.
- **Nguồn:** `App/CareTabView.swift`, `HistoryTabView.swift`, `ProjectPetsView.swift`, `PetStatsView.swift`, settings/views tương ứng.
- **Đích:** `src/views/AgentPetView.svelte`, `AgentPetSettingsView.svelte`, `PetOverlay.svelte`, `PetPopover.svelte`, `src/components/pet/`, `src/lib/petPreferences.ts`.
- Nối selected pet, project mapping, per-pet care, approval/focus terminal, archive/usage vào API thật.
- `energy/mood/focus` local và demo event/default stats: xác định chỉ số nào có nguồn thật; nối đúng hoặc bỏ/ghi rõ unavailable. Không tạo công thức giả để giữ mock UI.
- Audio-reactive hiện chỉ đổi CSS glow: kiểm tra feature requirement/source, nối audio signal có sẵn nếu cần; nếu không có parity requirement, không tự thêm DSP mới.
- Activity theme setter có state app nhưng session formatter hardcode Chef: thống nhất source of truth, persistence và mọi consumer.
- Activity stream phải nhận events thực đầy đủ, không chỉ top session mỗi poll; dùng cơ chế event hiện có nếu có, tránh thêm event bus tổng quát.
- **Accept:** đổi pet/settings/reload/multi-window đúng; không toast giả; loading/error không hiện demo như số thật; history tách live; theme áp vào event mới; accessibility và Modal/toast đúng AGENTS.md; browser test các flow chính.
- [ ] Hoàn thành.

### AP-13 — Pet gallery, custom assets và renderer parity [VERIFY]

- **Depends:** AP-00; pet identity tích hợp sau AP-01.
- **Nguồn:** `App/BrowsePetsView.swift`, `CreatePetView.swift`, `PetBrowser.swift`, `PetInstaller.swift`, `ImagePetStore.swift`, `ImageSpriteView.swift`, `SpriteSlicer.swift`, `PetView.swift`, `PetMoodFX.swift`, `StageBadge.swift`, `Resources/`.
- **Đích:** gallery/animation picker, `AgentPetSprite.svelte`, `src/shared/lib/petRenderer.ts`, installed pet catalog/storage.
- Inventory browse/install/remove/custom creation, animation/state mapping, stage/mood effects. Đóng các phần đã có bằng evidence; không thay renderer đang hoạt động chỉ vì nguồn Swift khác.
- Asset download/import phải validate path, type, kích thước; không thực thi nội dung package; giữ pet đang dùng khi import thất bại.
- **Accept:** test asset fixtures hợp lệ/lỗi, animation identity không trộn pet; install/delete không phá mapping/care; restart giữ custom pet. Network thật chỉ khi được phép, test mặc định dùng fixtures.
- [ ] Hoàn thành.

### AP-14 — Cloud care/usage sync và restore [VERIFY]

- **Depends:** AP-01, AP-04.
- **Nguồn:** `App/CareSyncController.swift`, `PetCareController.swift::mergeFromCloud`, `ProjectUsageStore.swift`, deep-link handling trong app entry.
- **Đích:** tìm networking/auth/deep-link primitives hiện có trước khi thêm module.
- Xác minh API contract/version và dịch vụ nguồn còn dùng được. Port link/unlink, debounce/retry, pending usage acknowledgement, restore/merge nếu chưa có.
- Không dùng “max mọi field” như merge strategy khi chưa đối chiếu nguồn; xác định counter/date/achievement semantics và idempotency.
- Không tự mở link/account, upload care/usage thật hay đổi Keychain. Nếu secure credential storage cần quyền riêng: báo blocker, vẫn test contract bằng mock.
- **Accept:** mock link callback validation, offline retry, duplicate upload/ack, partial failure, restore không giảm/mất state, unlink ngừng sync; không log secret hoặc upload transcript/project path ngoài contract đã chấp thuận.
- [ ] Hoàn thành.

### AP-15 — Desktop/windows, onboarding và app lifecycle [VERIFY]

- **Depends:** AP-07, AP-10, AP-12, AP-13; AP-04 cho split/project windows.
- **Nguồn:** `App/PetController.swift`, `PetWindowController.swift`, `PetWindowModel.swift`, `ResizeMetrics.swift`, `ClickThroughHostingView.swift`, `StatusBarController.swift`, `PetBindings.swift`, `LoginItem.swift`, `OnboardingView.swift`, `SetupView.swift`, `SettingsModel.swift`, `AppLanguage.swift`, `UpdaterController.swift`, app entry; `AgentPetCore/PetWindowPlanner.swift`, `TickerFormatter.swift`.
- **Đích:** overlay/popover/tray/visibility helpers, Tauri windows/capabilities, native actions, existing startup/settings/updater.
- Đối chiếu split-pet windows, monitor placement/clamping, scaling, drag/click-through, focus/nonactivation, pet interactions, tray/ticker, restore visibility và cleanup.
- Đối chiếu onboarding/hook setup/login item/language/update behavior với app chủ. Reuse cơ chế rust-sound; không thêm updater hay login item thứ hai chỉ để copy AgentPet.
- Không phục hồi behavior legacy xung đột yêu cầu mới đã có (ví dụ tự bật overlay khi mount tab); nêu conflict để coordinator quyết định theo yêu cầu hiện tại.
- **Accept:** checklist multi-monitor/display disconnect, launch/quit/reopen, no focus stealing, no leaked windows/timers, persisted settings. Native permissions chỉ request theo thao tác người dùng; không can thiệp signing.
- [ ] Hoàn thành.

### AP-16 — Cross-review, acceptance và phát hành tích hợp [VERIFY]

- **Depends:** tất cả task đã DONE/ALREADY_PRESENT hoặc có blocker được người dùng chấp thuận.
- **Owner:** coordinator; reviewer chỉ đọc trên integration worktree.
- Kiểm tra lại AP-00 inventory; không đánh dấu “full parity” nếu còn VERIFY chưa giải quyết hoặc dịch vụ/CLI chưa smoke-test.
- Test matrix tối thiểu:
  1. Hook → socket → session → transcript usage → đúng pet/project → care persist → UI.
  2. Codex và subagent có usage thật fixture; zero/duplicate/replay không tăng token giả.
  3. Waiting/question → một notification → approval/focus đúng session → done → archive.
  4. View đóng, hai window mở, restart app, offline, sleep/wake, invalid input/save failure.
  5. Legacy care migration, split pets, custom pet và settings reload.
  6. Break/reactive/sync hoạt động thật, không chỉ exported helper hoặc toggle đổi màu.
- Chạy test Rust theo package thật trong workspace manifest (không đoán tên package); test pet Node hiện có, test mới, browser checks phù hợp; `pnpm check`; `git diff --check`.
- Tách baseline failures/unrelated edits; không sửa test cho pass bằng cách xoá assertion hành vi. Gemini failure đã biết cần coordinator giải quyết riêng hoặc báo blocker, không deploy lẫn patch chưa xác minh.
- Chỉ sau tất cả gate thành công mới chạy `pnpm rebuild:app` trong integration checkout được duyệt và kiểm tra app `/Applications/rust-sound.app`.
- Review diff secrets/unrelated changes; stage đúng task; commit mô tả rõ và normal push upstream theo AGENTS.md. Nếu test/build/commit/push lỗi hoặc upstream thiếu: dừng, báo blocker; không force push/bypass hook.
- **Accept:** ghi rõ command/result, manual scenario đã chạy/chưa chạy, commit và deploy status; không dùng mock pass để khẳng định native runtime đã pass.
- [ ] Hoàn thành.

## 6. Những kết luận không được tự suy diễn

- Có `BreakClock`/pricing/history module không đồng nghĩa runtime đã gọi nó.
- Có 13 state mappings không đồng nghĩa có 13 working hook installers.
- Có hai persistence paths không đồng nghĩa đã migrate per-pet UserDefaults của nguồn.
- Có level/token demo ban đầu không chứng minh cả màn hình là mock; care hiện có poll backend thật.
- Không thấy tên Swift trong Rust không chứng minh chức năng thiếu; phải trace behavior tương đương.
- Subagent đọc task không được coi các mục VERIFY là requirement tự sáng tác.
- Không sửa signing/Keychain trong backlog này. Prompt quyền macOS lặp lại là vấn đề riêng, đã biết app ad-hoc signing nhưng chưa có authorization đổi identity.

## 7. Trạng thái ban đầu

Chưa task implement nào trong tài liệu này được thực hiện. Tài liệu chỉ dùng để giao việc; không tự khởi chạy đội subagent. Gemini đang dở và các thay đổi không liên quan phải được giữ nguyên. Coordinator cần đối chiếu git status/baseline mới trước khi bắt đầu.
