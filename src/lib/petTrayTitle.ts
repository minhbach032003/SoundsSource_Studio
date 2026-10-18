/** Thanh menu macOS rất hẹp và nằm cạnh đồng hồ, Wi-Fi, pin. Dài hơn chừng này là
 * nó đẩy mọi thứ khác đi, nên cắt chứ không để tràn. */
export const TRAY_TITLE_MAX = 48;

type TraySession = {
  state?: string | null;
  project?: string | null;
  tool_summary?: string | null;
};

type TrayTitlePrefs = {
  count: boolean;
  chat: boolean;
  bubble: boolean;
};

/** Xuống dòng và khoảng trắng thừa làm vỡ status item, nên gom hết về một dòng. */
function oneLine(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function clamp(value: string): string {
  if (value.length <= TRAY_TITLE_MAX) return value;
  return `${value.slice(0, TRAY_TITLE_MAX - 1).trimEnd()}…`;
}

/**
 * Chữ hiện cạnh biểu tượng pet trên thanh menu.
 *
 * Bong bóng và tán gẫu loại trừ nhau theo đúng cách spec phân biệt chúng: bong bóng
 * là việc agent đang làm, tán gẫu là câu pet nói lúc rảnh. Bật cả hai thì luôn có
 * một câu, và không bao giờ có hai câu chen nhau.
 */
export function composeTrayTitle(
  sessions: readonly TraySession[],
  prefs: TrayTitlePrefs,
  idleLine: string
): string {
  const running = sessions.filter((session) => session.state === "working");
  const parts: string[] = [];

  if (prefs.count) parts.push(String(running.length));

  if (prefs.bubble && running.length > 0) {
    const [first] = running;
    const project = oneLine(first.project);
    const summary = oneLine(first.tool_summary);
    // Một agent vừa khởi động chưa có project lẫn tool nào: đừng để lại dấu phân cách trống.
    if (project) parts.push(project);
    if (summary) parts.push(summary);
  } else if (prefs.chat && running.length === 0) {
    const line = oneLine(idleLine);
    if (line) parts.push(line);
  }

  return clamp(parts.join(" · "));
}

/** Câu pet nói lúc rảnh. Dùng chung cho bong bóng trên màn hình và chữ trên thanh menu,
 * để hai nơi không bao giờ nói hai câu khác nhau cùng lúc. */
export const IDLE_BOOST_LINES = [
  "One clean diff can fix the whole afternoon.",
  "Let's grill some bugs.",
  "I miss you. Open a branch for me.",
  "Tiny commit, tiny dopamine.",
  "The build is quiet. Too quiet.",
  "Ship something small. Future you is watching.",
  "Your TODOs are pretending not to see us.",
  "No agents running. The keyboard has entered standby drama.",
  "Turn coffee into code. Carefully.",
  "Open one file. Intimidate it professionally.",
  "The repo is calm. Suspicious, but calm.",
  "Refactor lightly. Leave with dignity.",
] as const;
