import {
  Utensils,
  Trophy,
  Crown,
  Zap,
  Flame,
  PawPrint,
  Compass,
  Shield,
  Award,
  Sparkles,
  Medal,
  Calendar,
  Moon,
} from "@lucide/svelte";

export interface PetEvent {
  id: string;
  category: "coding" | "audio" | "vitals" | "system";
  source: string;
  event: string;
  message: string;
  time: string;
}

export interface PetCareStateDto {
  xp: number;
  level: number;
  display_level: number;
  progress: number;
  stage_name: string;
  stage_index: number;
  hunger: string;
  tokens_today: number;
  meals_today: number;
  total_tokens: number;
  total_meals: number;
  streak_days: number;
  unlocked_achievements: string[];
}

export interface AgentSessionDto {
  id: string;
  agent_kind: string;
  state: "registered" | "working" | "waiting" | "done" | "idle";
  project?: string | null;
  message?: string | null;
  model?: string | null;
  tool_name?: string | null;
  tool_summary?: string | null;
  started_at: number;
  last_event_at: number;
}

/** Live state of the AgentPet unix socket bridge, measured by the Rust listener. */
export interface PetBridgeStatusDto {
  socket_path: string | null;
  is_listening: boolean;
  last_error: string | null;
  events_received: number;
  events_replayed: number;
  queued_events: number;
  last_event_at: number | null;
}

export interface AgentIntegrationDto {
  kind: string;
  display_name: string;
  is_supported: boolean;
  is_installed: boolean;
  note?: string | null;
}

export interface PetFormMeta {
  id: string;
  name: string;
  minLevel: number;
  hairDescription?: string;
  auraDescription?: string;
  avatarUrl: string;
  spritesheetPath: string;
  themeOverride?: {
    primaryColor?: string;
    aura?: string;
    sparkleType?: string;
    backlightClass?: string;
  };
}

export interface PetArchetype {
  id: string;
  name: string;
  tag: string;
  tagline: string;
  description: string;
  unlockLevel: number;
  avatarUrl: string;
  theme: {
    primaryColor: string;
    aura: string;
    sparkleType: string;
  };
  forms?: PetFormMeta[];
}

export type PetMood = "idle" | "working" | "reading" | "waiting" | "done" | "celebrate" | "sleepy";

export const INSTALLED_PETS: PetArchetype[] = [
  {
    id: "code-frenzy-cat",
    name: "Code Frenzy Cat",
    tag: "Creature",
    tagline: "Neon cyber systems boundary and runtime telemetry analysis cat overclocking every build",
    description: "A high-octane cyber systems boundary and runtime telemetry analysis cat frantically typing code on a glowing holographic terminal, turning caffeine and keystrokes into zero-warning Rust builds.",
    unlockLevel: 1,
    avatarUrl: "/pets/code-frenzy-cat/avatar.svg",
    theme: {
      primaryColor: "cyan",
      aura: "neon-cyan-pulse",
      sparkleType: "matrix-glitch",
    },
    forms: [
      {
        id: "terminal",
        name: "Terminal Hacker",
        minLevel: 1,
        hairDescription: "Bộ lông xanh neon điện toán nguyên bản",
        auraDescription: "Xung điện cyan ma trận",
        avatarUrl: "/pets/code-frenzy-cat/forms/terminal/avatar.png",
        spritesheetPath: "/pets/code-frenzy-cat/forms/terminal/spritesheet.webp",
      },
      {
        id: "bash",
        name: "Bash Automator",
        minLevel: 3,
        hairDescription: "Ánh sáng shell script tự động hóa tác vụ",
        auraDescription: "Tia xung dòng lệnh console sắc bén",
        avatarUrl: "/pets/code-frenzy-cat/forms/bash/avatar.png",
        spritesheetPath: "/pets/code-frenzy-cat/forms/bash/spritesheet.webp",
      },
      {
        id: "overclock",
        name: "Matrix Overclock",
        minLevel: 5,
        hairDescription: "Tông màu lục bảo huỳnh quang ép xung",
        auraDescription: "Dòng chảy mã nguồn Matrix tốc độ cao",
        avatarUrl: "/pets/code-frenzy-cat/forms/overclock/avatar.png",
        spritesheetPath: "/pets/code-frenzy-cat/forms/overclock/spritesheet.webp",
      },
      {
        id: "hex-dump",
        name: "Hex Decoder",
        minLevel: 8,
        hairDescription: "Lăng kính nhị phân giải mã cấu trúc bộ nhớ",
        auraDescription: "Quầng sáng phân tích byte CoreAudio",
        avatarUrl: "/pets/code-frenzy-cat/forms/hex-dump/avatar.png",
        spritesheetPath: "/pets/code-frenzy-cat/forms/hex-dump/spritesheet.webp",
      },
      {
        id: "compiler",
        name: "LLVM Optimizer",
        minLevel: 12,
        hairDescription: "Kiến trúc tối ưu hóa biên dịch không cảnh báo",
        auraDescription: "Vòng xoáy tối ưu hóa CPU song song",
        avatarUrl: "/pets/code-frenzy-cat/forms/compiler/avatar.png",
        spritesheetPath: "/pets/code-frenzy-cat/forms/compiler/spritesheet.webp",
      },
      {
        id: "cyberpunk",
        name: "Synthwave Cyberpunk",
        minLevel: 15,
        hairDescription: "Sắc tím hồng neon Synthwave rực rỡ",
        auraDescription: "Aura siêu dẫn Neon Overdrive",
        avatarUrl: "/pets/code-frenzy-cat/forms/cyberpunk/avatar.png",
        spritesheetPath: "/pets/code-frenzy-cat/forms/cyberpunk/spritesheet.webp",
      },
      {
        id: "zero-day",
        name: "Zero-Day Hunter",
        minLevel: 20,
        hairDescription: "Bộ giáp bảo mật ngăn chặn lỗi tràn bộ đệm",
        auraDescription: "Lưới radar quét lỗ hổng thời gian thực",
        avatarUrl: "/pets/code-frenzy-cat/forms/zero-day/avatar.png",
        spritesheetPath: "/pets/code-frenzy-cat/forms/zero-day/spritesheet.webp",
      },
      {
        id: "quantum",
        name: "Quantum Qubit",
        minLevel: 25,
        hairDescription: "Hạt lượng tử chồng chập đa trạng thái",
        auraDescription: "Dòng tính toán lượng tử không độ trễ",
        avatarUrl: "/pets/code-frenzy-cat/forms/quantum/avatar.png",
        spritesheetPath: "/pets/code-frenzy-cat/forms/quantum/spritesheet.webp",
      },
      {
        id: "neural-net",
        name: "Neural Nexus",
        minLevel: 30,
        hairDescription: "Mạng nơ-ron học sâu đồng bộ tư duy kiến trúc",
        auraDescription: "Mạng lưới synaptic đa chiều bùng nổ",
        avatarUrl: "/pets/code-frenzy-cat/forms/neural-net/avatar.png",
        spritesheetPath: "/pets/code-frenzy-cat/forms/neural-net/spritesheet.webp",
      },
      {
        id: "singularity",
        name: "Cyber Singularity",
        minLevel: 35,
        hairDescription: "Hình thái điểm kỳ dị trí tuệ nhân tạo tối thượng",
        auraDescription: "Quang trường siêu chiều xuyên không gian",
        avatarUrl: "/pets/code-frenzy-cat/forms/singularity/avatar.png",
        spritesheetPath: "/pets/code-frenzy-cat/forms/singularity/spritesheet.webp",
      },
    ],
  },
  {
    id: "boba",
    name: "Boba Otter",
    tag: "Creature",
    tagline: "Calm river companion serving sweet focus and fresh PRs",
    description: "A delightful river otter companion holding a chilled boba tea with dark tapioca pearls, keeping code reviews lighthearted and stress-free.",
    unlockLevel: 1,
    avatarUrl: "/pets/boba/avatar.svg",
    theme: {
      primaryColor: "pink",
      aura: "taro-pearl-sweetness",
      sparkleType: "bubble-pop",
    },
    forms: [
      {
        id: "classic",
        name: "Milk Tea Otter",
        minLevel: 1,
        hairDescription: "Bộ lông màu đường nâu kem béo ngọt ngào",
        auraDescription: "Hương vị trà sữa trân châu ấm áp",
        avatarUrl: "/pets/boba/forms/classic/avatar.png",
        spritesheetPath: "/pets/boba/forms/classic/spritesheet.webp",
      },
      {
        id: "jasmine",
        name: "Jasmine Green",
        minLevel: 3,
        hairDescription: "Hương hoa lài thanh khiết sảng khoái",
        auraDescription: "Gió mát nhẹ nhàng làm dịu áp lực code",
        avatarUrl: "/pets/boba/forms/jasmine/avatar.png",
        spritesheetPath: "/pets/boba/forms/jasmine/spritesheet.webp",
      },
      {
        id: "matcha",
        name: "Matcha Pearl Otter",
        minLevel: 5,
        hairDescription: "Tông xanh Matcha thanh mát tươi mới",
        auraDescription: "Tập trung sảng khoái hương bạc hà",
        avatarUrl: "/pets/boba/forms/matcha/avatar.png",
        spritesheetPath: "/pets/boba/forms/matcha/spritesheet.webp",
      },
      {
        id: "cheese-foam",
        name: "Cheese Foam Cap",
        minLevel: 8,
        hairDescription: "Lớp bọt kem phô mai sánh mịn béo ngậy",
        auraDescription: "Năng lượng phục hồi sau giờ debug",
        avatarUrl: "/pets/boba/forms/cheese-foam/avatar.png",
        spritesheetPath: "/pets/boba/forms/cheese-foam/spritesheet.webp",
      },
      {
        id: "oolong",
        name: "Roasted Oolong",
        minLevel: 12,
        hairDescription: "Vị trà ô long nướng đậm đà lắng đọng",
        auraDescription: "Trầm tĩnh suy ngẫm giải thuật tối ưu",
        avatarUrl: "/pets/boba/forms/oolong/avatar.png",
        spritesheetPath: "/pets/boba/forms/oolong/spritesheet.webp",
      },
      {
        id: "taro",
        name: "Taro Dream Otter",
        minLevel: 15,
        hairDescription: "Sắc tím khoai môn pastel mộng mơ",
        auraDescription: "Dòng chảy thạch anh thư giãn tuyệt đối",
        avatarUrl: "/pets/boba/forms/taro/avatar.png",
        spritesheetPath: "/pets/boba/forms/taro/spritesheet.webp",
      },
      {
        id: "coconut",
        name: "Coconut Jelly Pop",
        minLevel: 20,
        hairDescription: "Thạch dừa giòn ngọt nhiệt đới tươi vui",
        auraDescription: "Sóng nước nhiệt đới tràn trề năng lượng",
        avatarUrl: "/pets/boba/forms/coconut/avatar.png",
        spritesheetPath: "/pets/boba/forms/coconut/spritesheet.webp",
      },
      {
        id: "lychee",
        name: "Crystal Lychee",
        minLevel: 25,
        hairDescription: "Ngọc thạch vải trong suốt lấp lánh",
        auraDescription: "Thanh lọc tâm trí tập trung cao độ",
        avatarUrl: "/pets/boba/forms/lychee/avatar.png",
        spritesheetPath: "/pets/boba/forms/lychee/spritesheet.webp",
      },
      {
        id: "galaxy",
        name: "Galaxy Passion",
        minLevel: 30,
        hairDescription: "Trà chanh dây ánh sao ngân hà huyền ảo",
        auraDescription: "Vũ trụ trân châu rực rỡ lấp lánh",
        avatarUrl: "/pets/boba/forms/galaxy/avatar.png",
        spritesheetPath: "/pets/boba/forms/galaxy/spritesheet.webp",
      },
      {
        id: "dragon-boba",
        name: "Dragon Pearl Emperor",
        minLevel: 35,
        hairDescription: "Hoàng kim long châu vương giả tối thượng",
        auraDescription: "Khí phách long châu thịnh vượng ngút ngàn",
        avatarUrl: "/pets/boba/forms/dragon-boba/avatar.png",
        spritesheetPath: "/pets/boba/forms/dragon-boba/spritesheet.webp",
      },
    ],
  },
  {
    id: "shinchan-3",
    name: "Shinchan 3",
    tag: "Character",
    tagline: "Cheeky humor and fearless mischief to brighten your hardest debug sessions.",
    description: "The spirited and playful kindergarten hero Crayon Shin-chan. With his iconic thick eyebrows and cheerful red shirt, he keeps developer morale soaring.",
    unlockLevel: 2,
    avatarUrl: "/pets/shinchan-3/avatar.svg",
    theme: {
      primaryColor: "rose",
      aura: "playful-radiance",
      sparkleType: "comic-stars",
    },
    forms: [
      {
        id: "kid",
        name: "Shinchan (Kid)",
        minLevel: 1,
        hairDescription: "Đầu đinh cậu bé tinh nghịch",
        auraDescription: "Vô tư hồn nhiên",
        avatarUrl: "/pets/shinchan-3/forms/kid/avatar.png",
        spritesheetPath: "/pets/shinchan-3/forms/kid/spritesheet.webp",
      },
      {
        id: "pajamas",
        name: "Pajama Dreamer",
        minLevel: 3,
        hairDescription: "Bộ đồ ngủ họa tiết hình học quen thuộc",
        auraDescription: "Giấc mơ ngọt ngào về bánh socola Chocobi",
        avatarUrl: "/pets/shinchan-3/forms/pajamas/avatar.png",
        spritesheetPath: "/pets/shinchan-3/forms/pajamas/spritesheet.webp",
      },
      {
        id: "kindergarten",
        name: "Futaba Uniform",
        minLevel: 5,
        hairDescription: "Đồng phục mẫu giáo Futaba mũ vàng áo xanh",
        auraDescription: "Tinh thần đồng đội nhóm Kasukabe",
        avatarUrl: "/pets/shinchan-3/forms/kindergarten/avatar.png",
        spritesheetPath: "/pets/shinchan-3/forms/kindergarten/spritesheet.webp",
      },
      {
        id: "classic",
        name: "Shinchan (Classic)",
        minLevel: 8,
        hairDescription: "Tóc ngắn mắt to tròn áo đỏ quần vàng",
        auraDescription: "Năng động vui nhộn",
        avatarUrl: "/pets/shinchan-3/forms/classic/avatar.png",
        spritesheetPath: "/pets/shinchan-3/forms/classic/spritesheet.webp",
      },
      {
        id: "sunflower",
        name: "Sunflower Hero",
        minLevel: 12,
        hairDescription: "Lớp học hoa hướng dương tràn đầy sức sống",
        auraDescription: "Nụ cười lạc quan đánh bay mọi bug phức tạp",
        avatarUrl: "/pets/shinchan-3/forms/sunflower/avatar.png",
        spritesheetPath: "/pets/shinchan-3/forms/sunflower/spritesheet.webp",
      },
      {
        id: "action",
        name: "Action Mask Shinchan",
        minLevel: 15,
        hairDescription: "Đầu đeo kính đen & tai nghe siêu quậy",
        auraDescription: "Chiến binh súng nước cực ngầu",
        avatarUrl: "/pets/shinchan-3/forms/action/avatar.png",
        spritesheetPath: "/pets/shinchan-3/forms/action/spritesheet.webp",
      },
      {
        id: "buri-buri",
        name: "Buri Buri Zaemon",
        minLevel: 20,
        hairDescription: "Hiệp sĩ lợn dũng cảm mang thanh kiếm gỗ",
        auraDescription: "Cứu nguy trong 3 phút với mức phí đắt đỏ",
        avatarUrl: "/pets/shinchan-3/forms/buri-buri/avatar.png",
        spritesheetPath: "/pets/shinchan-3/forms/buri-buri/spritesheet.webp",
      },
      {
        id: "kantam",
        name: "Kantam Robot",
        minLevel: 25,
        hairDescription: "Người máy Kantam Robo biến hình dũng mãnh",
        auraDescription: "Tia đấm thép Kantam Punch uy lực",
        avatarUrl: "/pets/shinchan-3/forms/kantam/avatar.png",
        spritesheetPath: "/pets/shinchan-3/forms/kantam/spritesheet.webp",
      },
      {
        id: "space-hero",
        name: "Kasukabe Space Hero",
        minLevel: 30,
        hairDescription: "Bộ giáp phi hành gia vũ trụ Kasukabe",
        auraDescription: "Thám hiểm không gian bảo vệ địa cầu",
        avatarUrl: "/pets/shinchan-3/forms/space-hero/avatar.png",
        spritesheetPath: "/pets/shinchan-3/forms/space-hero/spritesheet.webp",
      },
      {
        id: "future",
        name: "Future Legend Shin",
        minLevel: 35,
        hairDescription: "Shinchan trưởng thành phong thái đĩnh đạc",
        auraDescription: "Hào quang người lớn vẫn giữ trọn nụ cười trẻ thơ",
        avatarUrl: "/pets/shinchan-3/forms/future/avatar.png",
        spritesheetPath: "/pets/shinchan-3/forms/future/spritesheet.webp",
      },
    ],
  },
  {
    id: "work-blue-cat",
    name: "Cyber Coding Cat",
    tag: "Creature",
    tagline: "Cozy indie feline in a sage hoodie deep in the zone",
    description: "An adult blue feline wearing a warm sage-green striped hoodie, locked in focused flow at a minimalist laptop with amber eyes and soft screen luminescence.",
    unlockLevel: 3,
    avatarUrl: "/pets/work-blue-cat/avatar.svg",
    theme: {
      primaryColor: "sky",
      aura: "sage-knit-comfort",
      sparkleType: "soft-luminescence",
    },
    forms: [
      {
        id: "classic",
        name: "Cozy Sage Hoodie",
        minLevel: 1,
        hairDescription: "Áo hoodie len xanh xô thơm ấm cúng",
        auraDescription: "Ánh sáng màn hình êm dịu ban đêm",
        avatarUrl: "/pets/work-blue-cat/forms/classic/avatar.png",
        spritesheetPath: "/pets/work-blue-cat/forms/classic/spritesheet.webp",
      },
      {
        id: "midnight",
        name: "Midnight Coder",
        minLevel: 3,
        hairDescription: "Bóng tối êm đềm cùng tách cà phê khuya",
        auraDescription: "Sự tĩnh lặng tuyệt đối không xao nhãng",
        avatarUrl: "/pets/work-blue-cat/forms/midnight/avatar.png",
        spritesheetPath: "/pets/work-blue-cat/forms/midnight/spritesheet.webp",
      },
      {
        id: "indigo",
        name: "Midnight Indigo Flow",
        minLevel: 5,
        hairDescription: "Áo hoodie chàm bóng đêm huyền bí",
        auraDescription: "Dòng tập trung sâu lắng Deep Flow",
        avatarUrl: "/pets/work-blue-cat/forms/indigo/avatar.png",
        spritesheetPath: "/pets/work-blue-cat/forms/indigo/spritesheet.webp",
      },
      {
        id: "deep-work",
        name: "Deep Work Master",
        minLevel: 8,
        hairDescription: "Không gian làm việc tối giản chuẩn Pomodoro",
        auraDescription: "Hiệu suất nhân đôi trong từng khối thời gian",
        avatarUrl: "/pets/work-blue-cat/forms/deep-work/avatar.png",
        spritesheetPath: "/pets/work-blue-cat/forms/deep-work/spritesheet.webp",
      },
      {
        id: "lofi-study",
        name: "Lo-Fi Beats Companion",
        minLevel: 12,
        hairDescription: "Giai điệu thư giãn cùng nhịp thở êm đềm",
        auraDescription: "Âm thanh chillhop cộng hưởng với DSP Mixer",
        avatarUrl: "/pets/work-blue-cat/forms/lofi-study/avatar.png",
        spritesheetPath: "/pets/work-blue-cat/forms/lofi-study/spritesheet.webp",
      },
      {
        id: "aurora",
        name: "Golden Amber Flow",
        minLevel: 15,
        hairDescription: "Ánh hoàng hôn vàng hổ phách rực rỡ",
        auraDescription: "Hào quang cực quang hoàng kim tỏa sáng",
        avatarUrl: "/pets/work-blue-cat/forms/aurora/avatar.png",
        spritesheetPath: "/pets/work-blue-cat/forms/aurora/spritesheet.webp",
      },
      {
        id: "amber-flow",
        name: "Solar Resonator",
        minLevel: 20,
        hairDescription: "Ánh dương ban mai tiếp năng lượng cho não bộ",
        auraDescription: "Sóng nhiệt ấm áp duy trì sức bền mã hóa",
        avatarUrl: "/pets/work-blue-cat/forms/amber-flow/avatar.png",
        spritesheetPath: "/pets/work-blue-cat/forms/amber-flow/spritesheet.webp",
      },
      {
        id: "synthwave",
        name: "Retro Synthwave",
        minLevel: 25,
        hairDescription: "Đường chân trời hoàng hôn thập niên 80",
        auraDescription: "Dòng cảm hứng cổ điển pha lẫn công nghệ cao",
        avatarUrl: "/pets/work-blue-cat/forms/synthwave/avatar.png",
        spritesheetPath: "/pets/work-blue-cat/forms/synthwave/spritesheet.webp",
      },
      {
        id: "astral",
        name: "Astral Mind Cat",
        minLevel: 30,
        hairDescription: "Tâm trí phiêu du giữa các vì sao bao la",
        auraDescription: "Trực giác siêu nhiên thấu tỏ mọi kiến trúc",
        avatarUrl: "/pets/work-blue-cat/forms/astral/avatar.png",
        spritesheetPath: "/pets/work-blue-cat/forms/astral/spritesheet.webp",
      },
      {
        id: "timeless",
        name: "Timeless Architect",
        minLevel: 35,
        hairDescription: "Đỉnh cao thông thái tĩnh lặng vượt thời gian",
        auraDescription: "Hòa hợp tuyệt đối giữa logic và sự thanh thản",
        avatarUrl: "/pets/work-blue-cat/forms/timeless/avatar.png",
        spritesheetPath: "/pets/work-blue-cat/forms/timeless/spritesheet.webp",
      },
    ],
  },
  {
    id: "super-saiyan-goku",
    name: "Super Saiyan Goku",
    tag: "Character",
    tagline: "Push past runtime limits with legendary Super Saiyan focus.",
    description: "A legendary Super Saiyan martial artist radiating golden ki energy and fearless determination. Goku stands vigilant beside your workspace.",
    unlockLevel: 5,
    avatarUrl: "/pets/super-saiyan-goku/avatar.svg",
    theme: {
      primaryColor: "amber",
      aura: "golden-ki",
      sparkleType: "electric-sparks",
    },
    forms: [
      {
        id: "base",
        name: "Goku (Base)",
        minLevel: 1,
        hairDescription: "Tóc đen nhánh đặc trưng của người Saiyan",
        auraDescription: "Khí tự nhiên thuần khiết",
        avatarUrl: "/pets/super-saiyan-goku/forms/base/avatar.png",
        spritesheetPath: "/pets/super-saiyan-goku/forms/base/spritesheet.webp",
      },
      {
        id: "kaioken",
        name: "Kaio-ken Power",
        minLevel: 3,
        hairDescription: "Khí công Kaio-ken gấp 20 lần uy lực",
        auraDescription: "Hào quang đỏ thẫm cuộn trào bùng nổ",
        avatarUrl: "/pets/super-saiyan-goku/forms/kaioken/avatar.png",
        spritesheetPath: "/pets/super-saiyan-goku/forms/kaioken/spritesheet.webp",
      },
      {
        id: "ss1",
        name: "Super Saiyan 1",
        minLevel: 5,
        hairDescription: "Tóc vàng dựng đứng kinh điển",
        auraDescription: "Ki vàng Super Saiyan",
        avatarUrl: "/pets/super-saiyan-goku/forms/ss1/avatar.png",
        spritesheetPath: "/pets/super-saiyan-goku/forms/ss1/spritesheet.webp",
      },
      {
        id: "ss2",
        name: "Super Saiyan 2",
        minLevel: 10,
        hairDescription: "Tóc vàng chĩa sắc nhọn với tia điện",
        auraDescription: "Aura vàng bốc cháy & sấm sét",
        avatarUrl: "/pets/super-saiyan-goku/forms/ss2/avatar.png",
        spritesheetPath: "/pets/super-saiyan-goku/forms/ss2/spritesheet.webp",
      },
      {
        id: "ss3",
        name: "Super Saiyan 3",
        minLevel: 15,
        hairDescription: "Tóc vàng dài chạm gót chân không chân mày",
        auraDescription: "Sức mạnh khổng lồ rung chuyển vũ trụ",
        avatarUrl: "/pets/super-saiyan-goku/forms/ss3/avatar.png",
        spritesheetPath: "/pets/super-saiyan-goku/forms/ss3/spritesheet.webp",
      },
      {
        id: "god",
        name: "Super Saiyan God",
        minLevel: 20,
        hairDescription: "Mái tóc đỏ rực lửa của thần linh",
        auraDescription: "Thần khí thuần khiết bất hoại",
        avatarUrl: "/pets/super-saiyan-goku/forms/god/avatar.png",
        spritesheetPath: "/pets/super-saiyan-goku/forms/god/spritesheet.webp",
      },
      {
        id: "ssblue",
        name: "Super Saiyan Blue",
        minLevel: 25,
        hairDescription: "Tóc xanh lam ngọc của Ki Thần",
        auraDescription: "Hào quang lam ngọc thần thánh",
        avatarUrl: "/pets/super-saiyan-goku/forms/ssblue/avatar.png",
        spritesheetPath: "/pets/super-saiyan-goku/forms/ssblue/spritesheet.webp",
      },
      {
        id: "blue-kaioken",
        name: "Blue Kaio-ken x20",
        minLevel: 30,
        hairDescription: "Sự kết hợp hoàn mỹ giữa Thần khí và Kaio-ken",
        auraDescription: "Lớp hào quang kép đỏ rực bọc lấy sắc lam",
        avatarUrl: "/pets/super-saiyan-goku/forms/blue-kaioken/avatar.png",
        spritesheetPath: "/pets/super-saiyan-goku/forms/blue-kaioken/spritesheet.webp",
      },
      {
        id: "ui-sign",
        name: "Ultra Instinct -Sign-",
        minLevel: 35,
        hairDescription: "Bản Năng Vô Cực điềm báo với đôi mắt bạc",
        auraDescription: "Nhiệt lượng vô hạn cùng chuyển động tự tại",
        avatarUrl: "/pets/super-saiyan-goku/forms/ui-sign/avatar.png",
        spritesheetPath: "/pets/super-saiyan-goku/forms/ui-sign/spritesheet.webp",
      },
      {
        id: "mui",
        name: "Mastered Ultra Instinct",
        minLevel: 40,
        hairDescription: "Mái tóc bạch kim sáng chói tối thượng",
        auraDescription: "Cảnh giới tối cao cơ thể tự phản xạ",
        avatarUrl: "/pets/super-saiyan-goku/forms/mui/avatar.png",
        spritesheetPath: "/pets/super-saiyan-goku/forms/mui/spritesheet.webp",
      },
    ],
  },
  {
    id: "wode-daodun-3d",
    name: "Sword & Shield Guardian",
    tag: "Creature",
    tagline: "Armed with the sword of syntax and the shield of memory safety.",
    description: "A goofy yet fiercely determined guardian armed with a glowing code sword and high-tech defense shield, standing sentinel over your repository.",
    unlockLevel: 8,
    avatarUrl: "/pets/wode-daodun-3d/avatar.svg",
    theme: {
      primaryColor: "blue",
      aura: "cyber-shield",
      sparkleType: "shield-pulses",
    },
    forms: [
      {
        id: "wood",
        name: "Training Wood Guard",
        minLevel: 1,
        hairDescription: "Kiếm gỗ tập luyện & khiên mây sơ cấp",
        auraDescription: "Bước khởi đầu làm quen với kỷ luật cú pháp",
        avatarUrl: "/pets/wode-daodun-3d/forms/wood/avatar.png",
        spritesheetPath: "/pets/wode-daodun-3d/forms/wood/spritesheet.webp",
      },
      {
        id: "copper",
        name: "Copper Sentinel",
        minLevel: 3,
        hairDescription: "Đồng đỏ kiên cố rèn giũa độ bền",
        auraDescription: "Bảo vệ các luồng tác vụ an toàn cơ bản",
        avatarUrl: "/pets/wode-daodun-3d/forms/copper/avatar.png",
        spritesheetPath: "/pets/wode-daodun-3d/forms/copper/spritesheet.webp",
      },
      {
        id: "iron",
        name: "Iron Guard",
        minLevel: 5,
        hairDescription: "Thanh kiếm sắt kiên định & khiên đồng cổ",
        auraDescription: "Lá chắn phòng ngự an toàn bộ nhớ",
        avatarUrl: "/pets/wode-daodun-3d/forms/iron/avatar.png",
        spritesheetPath: "/pets/wode-daodun-3d/forms/iron/spritesheet.webp",
      },
      {
        id: "steel",
        name: "Steel Defender",
        minLevel: 8,
        hairDescription: "Thép tinh luyện tôi luyện qua hàng ngàn bài test",
        auraDescription: "Kháng hoàn toàn lỗi Null Pointer Dereference",
        avatarUrl: "/pets/wode-daodun-3d/forms/steel/avatar.png",
        spritesheetPath: "/pets/wode-daodun-3d/forms/steel/spritesheet.webp",
      },
      {
        id: "knight",
        name: "Silver Knight",
        minLevel: 12,
        hairDescription: "Kiếm thép bạc sáng loáng & lõi khiên Sapphire",
        auraDescription: "Lưới chắn từ trường xanh thẫm",
        avatarUrl: "/pets/wode-daodun-3d/forms/knight/avatar.png",
        spritesheetPath: "/pets/wode-daodun-3d/forms/knight/spritesheet.webp",
      },
      {
        id: "paladin",
        name: "Golden Paladin",
        minLevel: 15,
        hairDescription: "Thánh kiếm thái dương vàng óng & hào quang thánh",
        auraDescription: "Lá chắn mặt trời bất khả xâm phạm",
        avatarUrl: "/pets/wode-daodun-3d/forms/paladin/avatar.png",
        spritesheetPath: "/pets/wode-daodun-3d/forms/paladin/spritesheet.webp",
      },
      {
        id: "aegis",
        name: "Aegis Prism",
        minLevel: 20,
        hairDescription: "Lăng kính phản xạ mọi ngoại lệ hệ thống",
        auraDescription: "Hào quang lăng trụ phân tán áp lực tải",
        avatarUrl: "/pets/wode-daodun-3d/forms/aegis/avatar.png",
        spritesheetPath: "/pets/wode-daodun-3d/forms/aegis/spritesheet.webp",
      },
      {
        id: "mithril",
        name: "Mithril Vanguard",
        minLevel: 25,
        hairDescription: "Kim loại huyền thoại siêu nhẹ siêu bền",
        auraDescription: "Phản hồi tức thì với tốc độ CoreAudio FFI",
        avatarUrl: "/pets/wode-daodun-3d/forms/mithril/avatar.png",
        spritesheetPath: "/pets/wode-daodun-3d/forms/mithril/spritesheet.webp",
      },
      {
        id: "titan",
        name: "Obsidian Titan",
        minLevel: 30,
        hairDescription: "Đá hắc diện thạch đúc thành thành lũy kiên cố",
        auraDescription: "Sức mạnh phòng ngự tuyệt đối trước crash",
        avatarUrl: "/pets/wode-daodun-3d/forms/titan/avatar.png",
        spritesheetPath: "/pets/wode-daodun-3d/forms/titan/spritesheet.webp",
      },
      {
        id: "celestial",
        name: "Celestial Bastion",
        minLevel: 35,
        hairDescription: "Thành trì tinh tú tối cao bảo hộ toàn bộ codebase",
        auraDescription: "Vòng bảo vệ vũ trụ không thể xuyên thủng",
        avatarUrl: "/pets/wode-daodun-3d/forms/celestial/avatar.png",
        spritesheetPath: "/pets/wode-daodun-3d/forms/celestial/spritesheet.webp",
      },
    ],
  },
  {
    id: "eddy",
    name: "Eddy Educator Bear",
    tag: "Creature",
    tagline: "Thoughtful mentor bear guiding you through complex architectures",
    description: "A wise, calm educator yellow bear in round glasses and a cozy green hoodie, offering serene guidance through tough debugging sessions.",
    unlockLevel: 10,
    avatarUrl: "/pets/eddy/avatar.svg",
    theme: {
      primaryColor: "yellow",
      aura: "golden-amber-serenity",
      sparkleType: "warm-ember",
    },
    forms: [
      {
        id: "storybook",
        name: "Storybook Cub",
        minLevel: 1,
        hairDescription: "Chú gấu nhỏ bên trang sách thiếu nhi hồn nhiên",
        auraDescription: "Sự tò mò học hỏi không ngừng",
        avatarUrl: "/pets/eddy/forms/storybook/avatar.png",
        spritesheetPath: "/pets/eddy/forms/storybook/spritesheet.webp",
      },
      {
        id: "school",
        name: "School Reader",
        minLevel: 3,
        hairDescription: "Cặp kính tròn chăm chỉ nghiên cứu tài liệu",
        auraDescription: "Kiên nhẫn đọc kỹ từng dòng đặc tả hệ thống",
        avatarUrl: "/pets/eddy/forms/school/avatar.png",
        spritesheetPath: "/pets/eddy/forms/school/spritesheet.webp",
      },
      {
        id: "scholar",
        name: "Classic Scholar",
        minLevel: 5,
        hairDescription: "Áo len cardigan xanh rừng học thức",
        auraDescription: "Kiến thức thâm sâu & kiên nhẫn giảng dạy",
        avatarUrl: "/pets/eddy/forms/scholar/avatar.png",
        spritesheetPath: "/pets/eddy/forms/scholar/spritesheet.webp",
      },
      {
        id: "scribe",
        name: "Library Scribe",
        minLevel: 8,
        hairDescription: "Bút lông ghi chép lịch sử phiên bản tỉ mỉ",
        auraDescription: "Lưu giữ kiến thức bất biến qua năm tháng",
        avatarUrl: "/pets/eddy/forms/scribe/avatar.png",
        spritesheetPath: "/pets/eddy/forms/scribe/spritesheet.webp",
      },
      {
        id: "professor",
        name: "Royal Professor",
        minLevel: 12,
        hairDescription: "Áo cardigan đỏ burgundy hoàng gia sang trọng",
        auraDescription: "Trực giác kiến trúc sư cao cấp",
        avatarUrl: "/pets/eddy/forms/professor/avatar.png",
        spritesheetPath: "/pets/eddy/forms/professor/spritesheet.webp",
      },
      {
        id: "lecturer",
        name: "Master Lecturer",
        minLevel: 15,
        hairDescription: "Bục giảng khoa học máy tính truyền cảm hứng",
        auraDescription: "Giải thích các khái niệm phức tạp thành đơn giản",
        avatarUrl: "/pets/eddy/forms/lecturer/avatar.png",
        spritesheetPath: "/pets/eddy/forms/lecturer/spritesheet.webp",
      },
      {
        id: "architect",
        name: "Grand Architect",
        minLevel: 20,
        hairDescription: "Áo cardigan tím tinh tú vũ trụ huyền ảo",
        auraDescription: "Hào quang bậc thầy kiến trúc hệ thống",
        avatarUrl: "/pets/eddy/forms/architect/avatar.png",
        spritesheetPath: "/pets/eddy/forms/architect/spritesheet.webp",
      },
      {
        id: "philosopher",
        name: "Chief Philosopher",
        minLevel: 25,
        hairDescription: "Triết lý thiết kế tối giản Pit of Success",
        auraDescription: "Tư duy sáng tỏ loại bỏ mọi code thừa",
        avatarUrl: "/pets/eddy/forms/philosopher/avatar.png",
        spritesheetPath: "/pets/eddy/forms/philosopher/spritesheet.webp",
      },
      {
        id: "cosmic-dean",
        name: "Cosmic Dean",
        minLevel: 30,
        hairDescription: "Viện trưởng học viện tri thức ngân hà",
        auraDescription: "Thấu suốt bản chất của mọi ngôn ngữ lập trình",
        avatarUrl: "/pets/eddy/forms/cosmic-dean/avatar.png",
        spritesheetPath: "/pets/eddy/forms/cosmic-dean/spritesheet.webp",
      },
      {
        id: "sage",
        name: "Sage of Whispers",
        minLevel: 35,
        hairDescription: "Đại hiền triết tĩnh lặng chỉ dẫn con đường tối ưu",
        auraDescription: "Trực giác thông tuệ soi sáng giải pháp hoàn mỹ",
        avatarUrl: "/pets/eddy/forms/sage/avatar.png",
        spritesheetPath: "/pets/eddy/forms/sage/spritesheet.webp",
      },
    ],
  },
  {
    id: "pikachu",
    name: "Pikachu",
    tag: "Character",
    tagline: "Iconic electric mouse energizing your builds with thunderous focus",
    description: "An energetic electric-type mouse companion radiating playful sparks and high-voltage determination. Pikachu stays vigilant beside your terminal, zapping away runtime bugs and powering through complex test suites.",
    unlockLevel: 4,
    avatarUrl: "/pets/pikachu/avatar.svg",
    theme: {
      primaryColor: "amber",
      aura: "thunder-spark",
      sparkleType: "electric-sparks",
    },
    forms: [
      {
        id: "pichu",
        name: "Pichu Spark",
        minLevel: 1,
        hairDescription: "Chú chuột điện nhỏ bé đáng yêu",
        auraDescription: "Tia điện tí hon nạp năng lượng ban đầu",
        avatarUrl: "/pets/pikachu/forms/pichu/avatar.png",
        spritesheetPath: "/pets/pikachu/forms/pichu/spritesheet.webp",
      },
      {
        id: "classic",
        name: "Pikachu (Classic)",
        minLevel: 3,
        hairDescription: "Phong cách Pixel Art hoài niệm",
        auraDescription: "Tia sét pixel vui vẻ",
        avatarUrl: "/pets/pikachu/forms/classic/avatar.png",
        spritesheetPath: "/pets/pikachu/forms/classic/spritesheet.webp",
      },
      {
        id: "spark",
        name: "Spark Volt",
        minLevel: 5,
        hairDescription: "Hai má đỏ phóng ra dòng điện cao áp",
        auraDescription: "Tia lửa điện cảnh báo runtime",
        avatarUrl: "/pets/pikachu/forms/spark/avatar.png",
        spritesheetPath: "/pets/pikachu/forms/spark/spritesheet.webp",
      },
      {
        id: "studio",
        name: "Pikachu (Studio HD)",
        minLevel: 8,
        hairDescription: "Tạo hình 3D Chibi Figure mịn màng",
        auraDescription: "Luồng điện vàng chanh tỏa sáng",
        avatarUrl: "/pets/pikachu/forms/studio/avatar.png",
        spritesheetPath: "/pets/pikachu/forms/studio/spritesheet.webp",
      },
      {
        id: "electro-ball",
        name: "Electro Ball",
        minLevel: 12,
        hairDescription: "Cầu sấm sét tích tụ trên đầu đuôi",
        auraDescription: "Bùng nổ điện năng quét sạch lỗi",
        avatarUrl: "/pets/pikachu/forms/electro-ball/avatar.png",
        spritesheetPath: "/pets/pikachu/forms/electro-ball/spritesheet.webp",
      },
      {
        id: "iron-tail",
        name: "Iron Tail Strike",
        minLevel: 15,
        hairDescription: "Chiếc đuôi thép đập tan rào cản compiler",
        auraDescription: "Ánh kim sắc bén cắt đứt mọi nghẽn cổ chai",
        avatarUrl: "/pets/pikachu/forms/iron-tail/avatar.png",
        spritesheetPath: "/pets/pikachu/forms/iron-tail/spritesheet.webp",
      },
      {
        id: "thunderbolt",
        name: "Thunderbolt 100K Volts",
        minLevel: 20,
        hairDescription: "Tuyệt kỹ sấm sét 10 vạn vôn kinh điển",
        auraDescription: "Cột sét vàng rực giáng xuống",
        avatarUrl: "/pets/pikachu/forms/thunderbolt/avatar.png",
        spritesheetPath: "/pets/pikachu/forms/thunderbolt/spritesheet.webp",
      },
      {
        id: "overcharge",
        name: "Pikachu (Raichu Aura)",
        minLevel: 25,
        hairDescription: "Tông cam đậm Raichu & năng lượng dâng trào",
        auraDescription: "Sấm sét siêu áp Overcharge",
        avatarUrl: "/pets/pikachu/forms/overcharge/avatar.png",
        spritesheetPath: "/pets/pikachu/forms/overcharge/spritesheet.webp",
      },
      {
        id: "gigantamax",
        name: "Gigantamax Thunder",
        minLevel: 30,
        hairDescription: "Hình thái Gigantamax đuôi sét khổng lồ",
        auraDescription: "Bão sấm sét bao phủ toàn bộ workspace",
        avatarUrl: "/pets/pikachu/forms/gigantamax/avatar.png",
        spritesheetPath: "/pets/pikachu/forms/gigantamax/spritesheet.webp",
      },
      {
        id: "ash-cap",
        name: "Champion Cap Pikachu",
        minLevel: 35,
        hairDescription: "Chiếc mũ quán quân thế giới huyền thoại",
        auraDescription: "Sức mạnh tình bạn và quyết tâm bất diệt",
        avatarUrl: "/pets/pikachu/forms/ash-cap/avatar.png",
        spritesheetPath: "/pets/pikachu/forms/ash-cap/spritesheet.webp",
      },
    ],
  },
];

export interface AchievementMeta {
  id: string;
  name: string;
  description: string;
  icon: typeof Utensils;
}

export const ACHIEVEMENTS_METADATA: AchievementMeta[] = [
  { id: "firstMeal", name: "First Meal", description: "1st finished session", icon: Utensils },
  { id: "sessions100", name: "100 Sessions", description: "Completed 100 sessions", icon: Trophy },
  { id: "sessions500", name: "500 Sessions", description: "Completed 500 sessions", icon: Crown },
  { id: "tokens1M", name: "1M Tokens", description: "Consumed 1,000,000 tokens", icon: Zap },
  { id: "tokens10M", name: "10M Tokens", description: "Consumed 10,000,000 tokens", icon: Flame },
  { id: "tokens50M", name: "50M Tokens", description: "Consumed 50,000,000 tokens", icon: Sparkles },
  { id: "level5", name: "Companion", description: "Evolution Stage 2", icon: PawPrint },
  { id: "level10", name: "Scout", description: "Evolution Stage 3", icon: Compass },
  { id: "level20", name: "Hero", description: "Evolution Stage 4", icon: Shield },
  { id: "level35", name: "Legend", description: "Evolution Stage 5", icon: Medal },
  { id: "streak7", name: "7-Day Streak", description: "7 consecutive days active", icon: Flame },
  { id: "streak14", name: "14-Day Streak", description: "14 consecutive days active", icon: Calendar },
  { id: "streak30", name: "30-Day Streak", description: "30 consecutive days active", icon: Award },
  { id: "nightOwl", name: "Night Owl", description: "Completed task between midnight and 6 AM", icon: Moon },
];

export function xpToReach(level: number): number {
  return level <= 1 ? 0 : 60 * level * (level - 1);
}

export function getInternalLevel(xp: number): number {
  let level = 1;
  while (xpToReach(level + 1) <= xp) {
    level++;
  }
  return level;
}

export type GokuFormId =
  | "base"
  | "kaioken"
  | "ss1"
  | "ss2"
  | "ss3"
  | "god"
  | "ssblue"
  | "blue-kaioken"
  | "ui-sign"
  | "mui";

export interface GokuFormMeta {
  id: GokuFormId;
  name: string;
  minLevel: number;
  hairDescription: string;
  auraDescription: string;
  avatarUrl: string;
  spritesheetPath: string;
}

export const GOKU_FORMS: Record<GokuFormId, GokuFormMeta> = {
  base: {
    id: "base",
    name: "Goku (Base)",
    minLevel: 1,
    hairDescription: "Tóc đen nhánh đặc trưng của người Saiyan",
    auraDescription: "Khí tự nhiên thuần khiết",
    avatarUrl: "/pets/super-saiyan-goku/forms/base/avatar.png",
    spritesheetPath: "/pets/super-saiyan-goku/forms/base/spritesheet.webp",
  },
  kaioken: {
    id: "kaioken",
    name: "Kaio-ken Power",
    minLevel: 3,
    hairDescription: "Khí công Kaio-ken gấp 20 lần uy lực",
    auraDescription: "Hào quang đỏ thẫm cuộn trào bùng nổ",
    avatarUrl: "/pets/super-saiyan-goku/forms/kaioken/avatar.png",
    spritesheetPath: "/pets/super-saiyan-goku/forms/kaioken/spritesheet.webp",
  },
  ss1: {
    id: "ss1",
    name: "Super Saiyan 1",
    minLevel: 5,
    hairDescription: "Tóc vàng dựng đứng kinh điển",
    auraDescription: "Ki vàng Super Saiyan",
    avatarUrl: "/pets/super-saiyan-goku/forms/ss1/avatar.png",
    spritesheetPath: "/pets/super-saiyan-goku/forms/ss1/spritesheet.webp",
  },
  ss2: {
    id: "ss2",
    name: "Super Saiyan 2",
    minLevel: 10,
    hairDescription: "Tóc vàng chĩa sắc nhọn với tia điện",
    auraDescription: "Aura vàng bốc cháy & sấm sét",
    avatarUrl: "/pets/super-saiyan-goku/forms/ss2/avatar.png",
    spritesheetPath: "/pets/super-saiyan-goku/forms/ss2/spritesheet.webp",
  },
  ss3: {
    id: "ss3",
    name: "Super Saiyan 3",
    minLevel: 15,
    hairDescription: "Tóc vàng dài chạm gót chân không chân mày",
    auraDescription: "Sức mạnh khổng lồ rung chuyển vũ trụ",
    avatarUrl: "/pets/super-saiyan-goku/forms/ss3/avatar.png",
    spritesheetPath: "/pets/super-saiyan-goku/forms/ss3/spritesheet.webp",
  },
  god: {
    id: "god",
    name: "Super Saiyan God",
    minLevel: 20,
    hairDescription: "Mái tóc đỏ rực lửa của thần linh",
    auraDescription: "Thần khí thuần khiết bất hoại",
    avatarUrl: "/pets/super-saiyan-goku/forms/god/avatar.png",
    spritesheetPath: "/pets/super-saiyan-goku/forms/god/spritesheet.webp",
  },
  ssblue: {
    id: "ssblue",
    name: "Super Saiyan Blue",
    minLevel: 25,
    hairDescription: "Tóc xanh lam ngọc của Ki Thần",
    auraDescription: "Hào quang lam ngọc thần thánh",
    avatarUrl: "/pets/super-saiyan-goku/forms/ssblue/avatar.png",
    spritesheetPath: "/pets/super-saiyan-goku/forms/ssblue/spritesheet.webp",
  },
  "blue-kaioken": {
    id: "blue-kaioken",
    name: "Blue Kaio-ken x20",
    minLevel: 30,
    hairDescription: "Sự kết hợp hoàn mỹ giữa Thần khí và Kaio-ken",
    auraDescription: "Lớp hào quang kép đỏ rực bọc lấy sắc lam",
    avatarUrl: "/pets/super-saiyan-goku/forms/blue-kaioken/avatar.png",
    spritesheetPath: "/pets/super-saiyan-goku/forms/blue-kaioken/spritesheet.webp",
  },
  "ui-sign": {
    id: "ui-sign",
    name: "Ultra Instinct -Sign-",
    minLevel: 35,
    hairDescription: "Bản Năng Vô Cực điềm báo với đôi mắt bạc",
    auraDescription: "Nhiệt lượng vô hạn cùng chuyển động tự tại",
    avatarUrl: "/pets/super-saiyan-goku/forms/ui-sign/avatar.png",
    spritesheetPath: "/pets/super-saiyan-goku/forms/ui-sign/spritesheet.webp",
  },
  mui: {
    id: "mui",
    name: "Mastered Ultra Instinct",
    minLevel: 40,
    hairDescription: "Mái tóc bạch kim sáng chói tối thượng",
    auraDescription: "Cảnh giới tối cao cơ thể tự phản xạ",
    avatarUrl: "/pets/super-saiyan-goku/forms/mui/avatar.png",
    spritesheetPath: "/pets/super-saiyan-goku/forms/mui/spritesheet.webp",
  },
};

export function resolvePetActiveForm(
  pet: PetArchetype | string,
  level: number = 1,
  formPreference: string = "auto"
): PetFormMeta | null {
  const archetype = typeof pet === "string" ? INSTALLED_PETS.find((p) => p.id === pet) : pet;
  if (!archetype?.forms || archetype.forms.length === 0) return null;

  // Manual cosmetic lock
  if (formPreference && formPreference !== "auto") {
    const selected = archetype.forms.find((f) => f.id === formPreference);
    if (selected) return selected;
  }

  // Automatic level progression: select highest form with minLevel <= current level
  const sorted = [...archetype.forms].sort((a, b) => b.minLevel - a.minLevel);
  return sorted.find((f) => level >= f.minLevel) || sorted[sorted.length - 1]!;
}

export function resolveGokuForm(level: number, formPreference: string = "auto"): GokuFormMeta {
  const resolved = resolvePetActiveForm("super-saiyan-goku", level, formPreference);
  if (resolved && resolved.id in GOKU_FORMS) {
    return GOKU_FORMS[resolved.id as GokuFormId];
  }
  return GOKU_FORMS.base;
}

export const SPEECH_QUOTES: Record<string, string[]> = {
  "code-frenzy-cat": [
    "Clacking away on these Rust traits! Purrrfect execution!",
    "Zero compiler warnings, maximum runtime efficiency!",
    "Remember to hydrate and stretch between compiler passes!",
    "Brewing an espresso to optimize this audio DSP loop.",
    "Tail is synchronizing to the rhythm of your music stream!",
  ],
  boba: [
    "Sipping iced tea while reviewing your pull request diff.",
    "Clean architecture detected! High readability score.",
    "Focus level is at 100%, ready for the next coding milestone.",
    "Watching the build pipeline turn green line by line.",
    "Bubble tea refills fuel cleaner code refactors.",
  ],
  "shinchan-3": [
    "Checking every semicolon in the workspace!",
    "Hero mode activated: Let's ship this audio hub update!",
    "Energy is high, keeping the studio console active.",
    "Action hero debugging in progress!",
    "Nobody breaks the build while Action Shin-chan is on watch!",
  ],
  "work-blue-cat": [
    "Cyber-link established. 10-band DSP parametric EQ aligned.",
    "Neon buffer synchronized with active stream routing.",
    "Focus aura at maximum throughput.",
    "CoreAudio pipeline streaming with zero latency jitter.",
    "Coding matrix locked. Compiling release binaries.",
  ],
  "super-saiyan-goku": [
    "Pushing past limits! Kaio-ken compilation speed!",
    "Feel the power of clean code and zero runtime panics!",
    "Train hard, refactor harder. Let's conquer this feature!",
  ],
  "wode-daodun-3d": [
    "Defensive shield raised against null pointers and segfaults!",
    "Sword of static types swinging through the codebase.",
    "Standing guard over your audio routing state.",
  ],
  eddy: [
    "Patience and clarity. Every great codebase is built step by step.",
    "Observing memory allocations with calm focus.",
    "Reviewing test coverage metrics with serene satisfaction.",
  ],
  pikachu: [
    "Pika-pi! Charging up your CPU cores for instant compilation!",
    "Thunderbolt refactor! Zapping out memory leaks with zero panics!",
    "Pikachu senses clean code! Static analysis scores are off the charts!",
    "High-voltage motivation for this challenging test suite!",
    "Pika-chuuuu! Electric surge detected in the audio DSP pipeline!",
  ],
};

export const INITIAL_EVENTS: PetEvent[] = [
  {
    id: "1",
    category: "coding",
    source: "pi:coding-agent",
    event: "working",
    message: "Refactoring UI component architecture to Tailwind v4 & custom primitives",
    time: "10:52 AM",
  },
  {
    id: "2",
    category: "vitals",
    source: "agentpet.sock",
    event: "mood_boost",
    message: "Companion gained +15 Focus from clean cargo test pass",
    time: "10:50 AM",
  },
  {
    id: "3",
    category: "audio",
    source: "rust-sound",
    event: "registered",
    message: "Desktop audio mixer session connected to AgentPet IPC bridge",
    time: "10:45 AM",
  },
  {
    id: "4",
    category: "coding",
    source: "git:commit",
    event: "milestone",
    message: "Committed CoreAudio audio tap bindings (+50 XP)",
    time: "10:30 AM",
  },
  {
    id: "5",
    category: "audio",
    source: "audio:router",
    event: "auto_duck",
    message: "Background audio ducked to 15% during high-focus coding interval",
    time: "10:15 AM",
  },
];
