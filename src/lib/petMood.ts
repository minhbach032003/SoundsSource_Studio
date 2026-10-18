export type PetMood =
  | "idle"
  | "working"
  | "reading"
  | "waiting"
  | "done"
  | "celebrate"
  | "sleepy";

type MoodSession = {
  state?: string | null;
  tool_name?: string | null;
};

/** Công cụ chỉ đọc chứ không sửa gì: pet ngồi đọc thay vì gõ. */
const READING_TOOLS = ["read", "grep", "find", "search", "inspect"];

/**
 * Tâm trạng của **một** agent. Khi mỗi agent có một con pet riêng, mỗi con phải phản
 * ánh đúng phiên của nó — tính gộp cả danh sách thì ba con sẽ làm cùng một động tác.
 */
export function petMoodFor(
  session: MoodSession | null | undefined,
  options: { celebrating?: boolean } = {}
): PetMood {
  if (options.celebrating) return "celebrate";
  switch (session?.state) {
    case "working": {
      const tool = (session.tool_name ?? "").toLowerCase();
      return READING_TOOLS.some((name) => tool.includes(name)) ? "reading" : "working";
    }
    case "waiting":
      return "waiting";
    case "done":
      return "done";
    default:
      return "idle";
  }
}

/** Nhiều hơn chừng này thì pet nhỏ tới mức vô nghĩa và tràn ra khỏi màn hình. */
export const SPLIT_PET_MAX = 3;

/** Những agent được cấp một con pet riêng khi bật Split pet. */
export function splitPetSessions<T extends MoodSession>(
  sessions: readonly T[],
  enabled: boolean
): readonly T[] {
  if (!enabled) return [];
  return sessions
    .filter((session) => session.state === "working" || session.state === "waiting")
    .slice(0, SPLIT_PET_MAX);
}
