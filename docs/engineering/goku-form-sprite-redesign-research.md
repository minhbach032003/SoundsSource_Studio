# Research: Rebuilding the Son Goku Pet as Ten Distinct Per-Form Sprites

## 1. Overview & Objective

User report (translated from Vietnamese): "Redo the whole Songoku pet for each level. Right now it is only a colour overlay/tint and it does not match the character." In the Evolution Forms & Models panel, all 10 Goku forms show the same pixel sprite with a different colour wash. Super Saiyan 3 has no long hair, Super Saiyan God is just a red tint, Ultra Instinct -Sign- and Mastered Ultra Instinct are just purple and white tints, the gi changes colour when it should not, and every Animations clip (Idle, Working, Reading, Waiting, Done, Celebrate, Sleepy, Level up) is the same tinted base sprite.

This note covers three things:

1. how forms are defined, chosen and rendered today, and the exact root cause of the "just a tint" look (Section 2);
2. what each of the 10 forms must look like as a small pixel sprite, with reference palettes (Section 3);
3. a concrete rebuild approach, the code paths that must change, and a prioritised plan (Sections 4 to 7).

It replaces the visual guidance in `docs/engineering/goku-ki-evolution-research.md`. That note covered only auras; Section 2.7 lists what it got wrong or left out.

---

## 2. How It Works Today

### 2.1 Form registry (frontend only)

- Forms are a frontend concept. The Rust `sound-pet` crate has no notion of forms or spritesheets: `crates/pet/src/*.rs` has no matches for `forms`, `evolution` or `spritesheet`. It only supplies the level, through `display_level()` (`crates/pet/src/care.rs:77`).
- `PetFormMeta` holds `id`, `name`, `minLevel`, the free-text `hairDescription`/`auraDescription`, `avatarUrl`, `spritesheetPath` and an optional `themeOverride` (`src/components/pet/types.ts:74-88`). Nothing in it describes hair shape, eye colour or palette, so nothing in the type system can say "SSJ3 has a different silhouette".
- The Goku archetype and its 10 forms sit in `INSTALLED_PETS` (`src/components/pet/types.ts:534-637`). The levels are base 1, kaioken 3, ss1 5, ss2 10, ss3 15, god 20, ssblue 25, blue-kaioken 30, ui-sign 35, mui 40 (`types.ts:546-636`). Each form points at `/pets/super-saiyan-goku/forms/<id>/spritesheet.webp` and `.../avatar.png`.
- A second, duplicated registry, `GOKU_FORMS`, repeats the same 10 entries (`src/components/pet/types.ts:995-1107`). It is reached through `resolveGokuForm` (`types.ts:1129-1135`). Two sources of truth can drift apart.
- `resolvePetActiveForm` returns the manual lock if one is set. Otherwise it returns the highest form whose `minLevel <= level` (`src/components/pet/types.ts:1110-1127`). The lock is stored per pet as `ap_pet_form_<slug>`, plus the legacy `ap_goku_form` key (`src/lib/petPreferences.ts:63-75`).

### 2.2 Sprite selection and loading

- The main stage resolves `activeForm` from `display_level` and the preference (`src/views/AgentPetView.svelte:161-163`). It passes `formId` and `spritesheetPath` to `AgentPetSprite` (`src/views/AgentPetView.svelte:858-865`). The desktop overlay does the same for the main pet and for split session pets (`src/views/PetOverlay.svelte:856-892`, `src/views/PetOverlay.svelte:927-933`).
- `computeSpritesheetPath` prefers the direct path, then `/pets/<slug>/forms/<formId>/spritesheet.webp`. Otherwise it resolves with a hard-coded level `1` (`src/components/AgentPetSprite.svelte:34-46`, level at line 42). As a result, the gallery mini preview, which passes no `formId`, always shows the base form (`src/components/pet/PetGallery.svelte:253-257`).
- `resolvePetSpritesheetUrls` short-circuits every `/forms/` path to the local bundled file (`src/shared/lib/petRenderer.ts:607-614`). Only root sheets go to Cloudinary (`src/shared/lib/petRenderer.ts:600`, `615-621`). The uploader also only uploads `public/pets/<slug>/spritesheet.webp` as `pets/<slug>/spritesheet` (`scripts/upload-pets-cloudinary.mjs:27-28`, `79`). **Per-form art is therefore never on the CDN.** It ships inside the app bundle, so `pnpm pets:upload` is irrelevant to this redesign unless the uploader is extended.
- The "Tải Pet Về" (Download Pet) button only serialises the `PetArchetype` metadata object to JSON. It saves no images (`src/components/pet/PetGallery.svelte:115-138`, label at line 312). Its success toast, "10 hình thái & metadata" ("10 forms & metadata"), overstates what is in the file.
- Loaded sheets are cached by URL in `SHEET_CACHE` (`src/shared/lib/petRenderer.ts:605`). If art is replaced at the same path, a running app keeps the old image until reload. A versioned path or query string avoids this.

### 2.3 Spritesheet format

- The grid is fixed at 8 columns by 9 rows (`src/shared/lib/petRenderer.ts:7-8`), and `slice()` rejects any sheet whose size is not divisible by it (`petRenderer.ts:576-580`).
- Measured from `public/pets/super-saiyan-goku/spritesheet.webp`: 1536 x 1872 px, which gives **192 x 208 px cells**. The occupied frames per row are `[6, 8, 8, 4, 5, 8, 6, 6, 6]`, 57 frames in total (measured locally with PIL). This matches the third-party "Codex Pets" atlas description of 1536x1872 with 8 x 9 cells of 192x208 (secondary source: <https://mcpservers.org/agent-skills/runcomfy-com/codex-pet>). The pet manifest records `"source": "petdex"` and `"submittedBy": "alienallen"` (`public/pets/super-saiyan-goku/pet.json:20-21`), so the source art is a third-party Super Saiyan 1 sprite.
- Row semantics come from the comment at `src/shared/lib/petRenderer.ts:12`: 0 Idle, 1 Run right, 2 Run left, 3 Wave/Done, 4 Jump/Celebrate, 5 Sleepy, 6 Waiting, 7 Working, 8 Reading.
- The Goku mood-to-row map (`src/shared/lib/petRenderer.ts:87-96`) is:

| UI clip | Row | Frames | Notes |
|---|---|---|---|
| Idle | 0 | 6 | |
| Working | 7 | 6 | |
| Reading | 8 | 6 | |
| Waiting | 6 | 6 | Ping-pong playback (`petRenderer.ts:191-195`) |
| Done | 3 | 4 | |
| Celebrate | 4 | 5 | |
| Sleepy | 5 | 8 | Settles on rest frame 4 (`petRenderer.ts:161-166`, `189`) |
| Level up | 6 | 6 | The Goku map has no `levelup` key, so it falls back to `DEFAULT_STATE_ROW.levelup = 6` (`petRenderer.ts:22`). The picker hard-codes the same fallback (`src/components/pet/PetAnimationPicker.svelte:24`, `71-73`). **Level up is literally the Waiting clip.** |

- Rows 1 and 2 (run cycles) exist in the sheet but are not mapped to any mood.
- The source is not true indexed pixel art. The base sheet has **314,989 unique opaque colours** (measured). It is an antialiased or upscaled "pixel-look" image, rendered with `image-rendering: pixelated` (`src/components/AgentPetSprite.svelte:200`).

### 2.4 Where the "tint" comes from (root cause)

There are four stacked layers. Only the first is in the art itself.

1. **The per-form sheets are whole-image recolours of one Super Saiyan 1 sprite.**
   - Each per-form sheet has the same alpha mask as the root sheet, pixel for pixel: 0 differing mask pixels out of 890,793 for every form (measured). The 10 `avatar.png` files also have identical alpha masks (measured).
   - So no form has a different silhouette. The SSJ3 sheet has SSJ1 hair, base Goku has SSJ1 spiky-up hair, and UI and MUI have the SSJ1 hair shape.
   - Contact-sheet inspection of frame (0,0) and (7,2) for every form shows:
     - base is SSJ1 hair darkened to brown-black with gold streaks left in;
     - kaioken and blue-kaioken turn the gi trousers red;
     - ss1, ss2 and ss3 are near-duplicates (mean absolute RGB difference 6-11 per pixel);
     - teal SSJ irises remain in base, god, ui-sign and mui, where they should be black, red, silver and silver.
   - Hue-band recolouring cannot separate hair from gi because the hair (gold, around `#fde05a`/`#fba51b`) and the gi (orange, around `#f29919`/`#d47b12`) are adjacent hues in the dominant-colour palette (measured). That is why "the gi colour also changes wrongly".
   - These assets came in with 8146d26 and ec0f7ab and were regenerated in 39564e9 ("eliminate global hue shift ... for all 80 forms"). That commit changed 155 binary files and no code (`git show --stat 39564e9`). No generator script is committed anywhere in history (`git log --all --name-only`), so the transform cannot be reproduced or reviewed.
2. **A gold/cyan lighting wash is painted on top of every form.**
   - `ARCHETYPE_LIGHTING["super-saiyan-goku"]` is a yellow-to-cyan radial gradient (`src/shared/lib/petRenderer.ts:212-222`).
   - It is composited with `globalCompositeOperation = "source-atop"` directly onto the sprite pixels after `drawImage` (`petRenderer.ts:405`, `407-446`).
   - It is keyed by slug, not form. A God, Blue or Ultra Instinct sprite is therefore re-tinted gold and cyan, up to 1.35x alpha in celebrate (`petRenderer.ts:418`).
3. **Form-agnostic lightning strokes.** In working, reading, done and celebrate, every Goku form gets cyan or yellow zig-zag strokes on the head (`src/shared/lib/petRenderer.ts:450-475`), including base and Ultra Instinct, where they are wrong.
4. **CSS/DOM glow and filters.**
   - `.aura-goku-<form> canvas` applies stacked `drop-shadow` filters (`src/styles.css:659-689`), chosen by `auraFilterClass` (`src/components/AgentPetSprite.svelte:111-137`).
   - Blurred coloured discs and Lucide `Zap`/`Sparkles` icons are placed behind and around the canvas (`AgentPetSprite.svelte:152-194`).
   - The overlay adds another generic glow (`.pet-goku-aura canvas`, `src/views/PetOverlay.svelte:1179-1184`), a per-form backlight switch (`PetOverlay.svelte:491-535`, defaults at `55-62`) and a page-level backdrop gradient (`src/views/AgentPetView.svelte:747`).
   - These are coloured halos around an unchanged silhouette. They cannot change hair or face shape.

Net effect: the forms differ only by palette and halo. None of the defining shape traits (Section 3) exist anywhere in the asset pipeline.

### 2.5 Avatars and the Animations panel

- The forms grid in the Evolution panel renders `f.avatarUrl` thumbnails (`src/views/AgentPetView.svelte:943-1000`, img at `995-999`). Those avatars are recoloured crops of the same sprite (Section 2.4, item 1).
- `PetAnimationPicker` loads `formSpritesheetPath` (`src/views/AgentPetView.svelte:697-699`), slices it (`src/components/pet/PetAnimationPicker.svelte:99`) and draws clips with `drawPetFrame(..., slug)` (`PetAnimationPicker.svelte:139`). Every clip therefore inherits the same recolour and the same slug-wide lighting wash.

### 2.6 What the five recent commits did

- `72ba18a`: added the `aura-goku-*` class switch and form-coloured blurred discs to `AgentPetSprite.svelte`, CSS drop-shadows to `styles.css`, and a per-form page backdrop to `AgentPetView.svelte` (`git show 72ba18a`). These are glow only, with no sprite change.
- `b48a28d`: added `goku-ki-evolution-research.md` and tuned the same CSS filters.
- `7f66df6`: added the per-form backlight and sparkle colours to `PetOverlay.svelte` (`PetOverlay.svelte:491-535`).
- `09d2faf`: wired `formId`/`spritesheetPath` into the overlay split pets and popover, and added `tests/pet-forms.test.mjs` assertions (`tests/pet-forms.test.mjs:76-86`).
- `39564e9`: regenerated all 80 per-form sheets and avatars for 8 pets, binary only. As measured above, the Goku results still share one alpha mask.

### 2.7 What `goku-ki-evolution-research.md` got wrong or left out

- **Scope.** It specifies only auras (`docs/engineering/goku-ki-evolution-research.md:5`). It says nothing about hair shape, hair length, eyebrows, iris colour or gi, which are exactly the traits the user is missing. The one body note, that God is "slimmer and more youthful" (`:53`), was never implemented.
- **Colours are Tailwind defaults, not reference colours.** For example, `#facc15`/`#eab308` (`:29`), `#38bdf8`/`#0ea5e9` (`:60`) and `#ef4444` (`:22`, `:67`) are Tailwind `yellow-400/500`, `sky-400/500` and `red-500`. None were sampled from official art.
- **Naming errors.**
  - Tier 2 is titled "Kaio-ken (x20)" (`:18`), but the app form is plain "Kaio-ken Power" at Lv 3 (`src/components/pet/types.ts:557-559`).
  - Tier 3, "Super Saiyan 1 (Full Power / Grade 4)" (`:25`), mixes two fan terms. Full Power Super Saiyan is a mastered SSJ state, and "Grade 4" is not an established term.
- **Ultra Instinct -Sign-.** The official Dragon Ball site describes the Sign aura as "a blue and white aura that surrounds the user's entire body" (<https://en.dragon-ball-official.com/news/01_970.html>). The note's "indigo-silver mirage" with `#6366f1` (`:73-75`) drifts toward purple, which is what the user sees as a "purple tint". The note also never says that Sign keeps black hair.
- **Sources are not checkable.**
  - The citations are a site home page and generic "archives" with no URLs (`:88-91`). The "Toei Animation Production Archives" entry cannot be verified.
  - Every claim in this new note links a specific page or a repo line.

---

## 3. What Each Form Must Look Like

### 3.1 Source policy

- **Primary sources:** the official Dragon Ball site (en.dragon-ball-official.com, Shueisha/Bandai Namco), which publishes form descriptions and licensed-product notes, and Bandai Namco's own game/news pages.
- **Hair-colour gap.** Official text rarely states hair colours for God or Ultra Instinct, so those cells cite secondary sources: fan wikis and press, labelled **(secondary)**.
- **Palette hexes are proposals** for a small sprite: a 3-step ramp of shadow, mid and highlight per material. They are derived from these descriptions and from the existing sprite's skin and gi ramp (Section 2.4), **not official colour values**; no official hex specification exists. Validate them against official stills before committing art.

### 3.2 Shared body (all forms unless noted)

- **Gi:** orange gi with blue undershirt, wristbands, sash and boots. This is constant across all ten forms; the gi must **not** be recoloured per form. Keep the existing ramp: orange `#c15606` / `#f29919` / `#fba51b`, blue `#011532` / `#1d3f8f` / `#3a63c4`, skin `#c98a5a` / `#fddab2` / `#fff1dc`, outline `#010002`. The orange values and the skin mid `#fddab2` are measured dominants of the current sheet; the blues and skin highlights are proposals.
- **Exceptions:**
  - Kaio-ken and SSB Kaio-ken turn the **skin** reddish or pink. The official site says that in SSB Kaio-ken "his skin will also take on a shade of light pink" (<https://en.dragon-ball-official.com/news/01_970.html>).
  - In the Tournament of Power, Ultra Instinct Goku's gi top is torn. This is optional and comes from a secondary source (episode-level fan record: <https://dragonball.fandom.com/wiki/A_Transcendent_Limit_Break!_Autonomous_Ultra_Instinct_Mastered!>).
  - The Super Saiyan God body is drawn slimmer and younger (secondary: <https://dragonball.fandom.com/wiki/Super_Saiyan_God>).

### 3.3 Per-form table

| # | Form | Lv | Hair (shape / colour) | Eyebrows | Eyes (iris) | Aura | Outfit / body | Palette hexes (shadow / mid / highlight; proposals) | Sources |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Goku (Base) | 1 | Signature black "palm" spikes: 3-4 bangs fall onto the forehead, side and back spikes fan outward and **down/sideways**, not straight up | Black | Black (no visible iris colour) | None at rest; thin white flicker when powering up | Standard gi | Hair `#0d0d12` / `#23232c` / `#41414f`; eyes `#0b0b0b`; aura `#ffffff` at 25% | Golden-hair contrast implies a different base colour: "hair turns gold, stands straight up" is the SSJ change (<https://en.dragon-ball-official.com/news/01_1226.html>) |
| 2 | Kaio-ken | 3 | **Same as base: black** | Black | Black | Crimson flame envelope hugging the body | Gi unchanged; **skin and the whole figure washed red** (tint the skin ramp only, not the hair or gi hue) | Aura `#8f0e14` / `#e0232b` / `#ff6a5a`; skin `#d0645a` / `#f2a08e` / `#ffd0c2` | Red aura and pink skin under Kaio-ken (<https://en.dragon-ball-official.com/news/01_970.html>, SSB Kaio-ken entry) |
| 3 | Super Saiyan 1 | 5 | Gold, **stiff upward spikes**, a few forehead bangs (the current source art) | Gold | Teal-green | Steady gold flame | Standard gi | Hair `#c9951c` / `#fde05a` / `#fff3a6`; eyes `#1f8c7c` / `#2fae9c`; aura `#ffd23f` | "hair turns gold, stands straight up" (<https://en.dragon-ball-official.com/news/01_1226.html>) |
| 4 | Super Saiyan 2 | 10 | Gold, **spikier and more rigid than SSJ1, a single bang** hanging over the forehead | Gold | Teal-green | Spikier gold aura **plus constant blue-white bio-electric sparks** | Standard gi | Hair `#d19a12` / `#ffe14d` / `#fff6b8`; sparks `#9fe8ff` / `#ffffff`; aura `#ffd23f` | Lightning: "bolts of crackling, lightning-like energy to race around the user's body" (<https://en.dragon-ball-official.com/news/01_1166.html>); single bang **(secondary)** |
| 5 | Super Saiyan 3 | 15 | Gold, **waist-length mane** falling down the back, plus forehead bangs; **new silhouette** | **None** (bare, heavy brow ridge) | Teal-green | Large gold aura with dense lightning | Standard gi | Hair `#b8860b` / `#f5c842` / `#fff0a0`; brow ridge in skin shadow `#c98a5a`; sparks `#9fe8ff` | "the long hair, which goes down to his waist" and "the lack of eyebrows" (<https://en.dragon-ball-official.com/news/01_970.html>) |
| 6 | Super Saiyan God | 20 | **Base-like** spikes (not SSJ-upright), slightly lifted; **crimson/magenta-red** | Red | **Red** | Fire-like red-orange aura, soft and flowing, no spikes | Gi unchanged; **slimmer, more youthful build** | Hair `#8c0f2e` / `#d4204a` / `#ff6b85`; eyes `#a3122b` / `#e0304a`; aura `#ff4d2e` / `#ffb347` | Official figure notes a "shining red aura" (<https://en.dragon-ball-official.com/news/01_2196.html>); red hair, red irises, slimmer body **(secondary)**: <https://dragonball.fandom.com/wiki/Super_Saiyan_God>, <https://www.toy-people.com/jp/?p=84534> |
| 7 | Super Saiyan Blue | 25 | SSJ1 shape; **cyan-blue** | Blue | **Blue** | Calm blue flame with a soft edge | Standard gi | Hair `#1679b8` / `#34c6f0` / `#a8ecff`; eyes `#0f5f9e` / `#1f8fd6`; aura `#3ecbff` / `#bdf2ff` | "the blue hair and pupils that its users acquire" (<https://en.dragon-ball-official.com/news/01_970.html>) |
| 8 | SSB Kaio-ken x20 | 30 | SSB hair and eyes (cyan) | Blue | Blue | **Two layers: red Kaio-ken aura outside a blue SSB aura** | Gi unchanged; **skin light pink** | Hair as SSB; inner aura `#3ecbff`; outer aura `#e0232b` / `#ff6a5a`; skin `#e08f8a` / `#f6b6a6` / `#ffd8cf` | "a red aura on top of Super Saiyan God SS's blue aura" and "skin will also take on a shade of light pink" (<https://en.dragon-ball-official.com/news/01_970.html>) |
| 9 | Ultra Instinct -Sign- | 35 | **Black, base shape**, slightly lifted by ki | Black | **Silver/grey** | Blue-and-white aura around the whole body, with a silver shimmer | Gi often torn in the Tournament of Power (optional) | Hair `#0d0d12` / `#23232c` / `#3a3f55`; eyes `#7d8597` / `#c7ccd8`; aura `#5aa9ff` / `#e8f2ff` | Aura: "a blue and white aura that surrounds the user's entire body" (<https://en.dragon-ball-official.com/news/01_970.html>); black hair with silver eyes **(secondary)**: <https://otakumode.com/otapedia/anime/dragon_ball/ultra_instinct> |
| 10 | Mastered Ultra Instinct | 40 | **Silver**, base/God-like shape, swept upward | **Silver** | **Silver** | Silver-white aura with a pale blue edge, calm | Calm, closed-mouth expression; gi optionally torn | Hair `#9aa3b5` / `#d9dde6` / `#ffffff`; eyes `#9aa3b5` / `#e6e9f0`; aura `#f4f7ff` / `#bcd6ff` | "silver, wind-blown hair" (<https://en.dragon-ball-official.com/news/01_2071.html>); "hair and eyebrows ... painted using a pearlescent effect" (<https://en.dragon-ball-official.com/news/01_3608.html>); silver hair and eyes in Bandai Namco's FighterZ art (secondary press: <https://www.eventhubs.com/news/2020/jan/19/ultra-instinct-gokus-first-magazine-scan-appears-online-dragon-ball-fighterz>) |

### 3.4 Shape groups (what actually needs new drawing)

Grouping forms by hair silhouette shows how much new art is needed:

| Hair shape | Forms | Notes |
|---|---|---|
| H0 Base (falls down/sideways) | base, kaioken, ui-sign | Colour: black |
| H1 SSJ upright | ss1, ssblue, blue-kaioken | The current art |
| H2 SSJ2 rigid, single bang | ss2 | |
| H3 SSJ3 waist-length, no brows | ss3 | |
| H4 God/MUI lifted base | god, mui | Can start from H0 with lifted tips. Colour: red or silver |

**Five hair shapes cover ten forms.** Iris colour, brows, skin tint and aura are palette or overlay concerns.

---

## 4. Rebuild Options

| Option | What it is | Fidelity | Effort | Verdict |
|---|---|---|---|---|
| A. Runtime tint (current) | One sheet plus CSS/canvas colour | Low: no shape change, wrong eyes, wrong gi | None | Reject |
| B. Region-masked palette swap | Quantise the source to an indexed palette once. Paint per-material masks (hair, brows, iris, skin, gi orange, gi blue, outline). Generate each form by remapping only the relevant ramps | Medium: fixes base black hair, SSG red hair and eyes, SSB eyes, UI and MUI silver, Kaio-ken skin, and keeps the gi constant. Still no SSJ2 bang, SSJ3 mane or base hair shape | Low-medium: one mask set for 57 frames | Do first, as a quick win |
| C. Hybrid: palette swap + head-anchored hair parts + runtime aura | B, plus 5 hair-shape parts (Section 3.4) drawn per **head pose**. Parts are composited at a per-frame head anchor offline; the aura is drawn by the renderer behind the sprite per form | High: real silhouettes per form, consistent body animation | Medium. Head poses in the 57 frames cluster into about 6-8: front, front-down (sleepy), 3/4, profile right (row 1), profile left (row 2), bowed or lying (row 5). That is about 5 shapes x 8 poses = 40 hair parts, not 570 frames | **Recommended** |
| D. Full redraw per form | 10 hand-drawn sheets x 57 frames | Highest: can also slim the God body and tear the UI gi | Very high: 570 frames, and consistency is hard | Only if commissioning an artist |

Why C over D: the body animation (gi, limbs, timing) is identical across forms in the canon, and the current rows are already tuned (`src/shared/lib/petRenderer.ts:161-166`, `petFrameIndex` at `186-201`). Only head, hair, eyes, skin tint and aura change. C keeps the 8 x 9 / 192 x 208 contract, so `slice()`, the picker and the binding prefs keep working unchanged (`petRenderer.ts:559-598`).

### 4.1 Asset pipeline for option C (committed and reproducible)

1. **Source layers** go under `assets/pets/super-saiyan-goku/src/`. This is not `public/`, so the sources do not ship.
   - `body.png`: an 8 x 9 grid. The current sheet with hair removed and re-quantised to a 32-48 colour indexed palette.
   - `masks/*.png`: per-material masks (iris, brows, skin, hair).
   - `hair/<shape>/<pose>.png`: the hair parts.
   - `anchors.json`: per frame, `{row, col, pose, headX, headY, flip}`.
   - `forms.json`: per form, `{hairShape, ramps: {hair, brows, iris, skin}, browsVisible}`.
2. **Build script** `scripts/build-pet-forms.mjs`. Use `sharp`, which is not currently a dependency (`package.json` has no image library), or a Python/PIL script run with `python3 -I`. For each form it:
   - remaps ramps;
   - drops brows for ss3;
   - composites the hair part at each anchor, behind or in front of the head according to the pose;
   - writes `public/pets/super-saiyan-goku/forms/<id>/spritesheet.webp` (lossless) and a 128 x 128 `avatar.png` crop from frame (0,0);
   - writes `forms/manifest.json` with a per-form alpha-mask hash and the palette used, for the tests.
3. **No baked aura or lightning in the sheet.** The aura is a runtime layer, so it can animate, scale with mood and respect `prefers-reduced-motion`.

### 4.2 Code paths that must change

| Change | Where |
|---|---|
| Extend `PetFormMeta` with `hairShape`, `aura: { inner, outer?, sparks?: boolean, skinTint? }` and `assetVersion` | `src/components/pet/types.ts:74-88` |
| Fill the new fields for the 10 Goku forms. Fix the descriptions: base and ui-sign hair black, god red hair and eyes, mui silver hair, brows and eyes | `src/components/pet/types.ts:546-636` |
| Delete the duplicate `GOKU_FORMS` and `GokuFormId`, and make `resolveGokuForm` delegate to `INSTALLED_PETS` (or remove it) | `src/components/pet/types.ts:995-1135` |
| Make lighting per form: key `ARCHETYPE_LIGHTING` by `slug/formId`, or drop the `source-atop` wash for Goku. A sprite with correct colours must not be repainted gold/cyan | `src/shared/lib/petRenderer.ts:211-222`, `407-446` |
| Gate the lightning strokes to forms with `aura.sparks` (ss2, ss3), using the form's spark colour | `src/shared/lib/petRenderer.ts:450-475` |
| Pass `formId` (or the resolved form) into `PetRenderer` and `drawPetFrame`. Today they receive only `slug` | `src/shared/lib/petRenderer.ts:309-317`, `src/components/AgentPetSprite.svelte:53`, `src/components/pet/PetAnimationPicker.svelte:139` |
| Draw the aura on the canvas **before** `drawImage` (behind the sprite) from `form.aura`, double-layered for blue-kaioken. Replace the slug-wide `aura-goku-*` CSS drop-shadows and blurred divs, or reduce them to a subtle halo | `src/shared/lib/petRenderer.ts:405`, `src/styles.css:659-689`, `src/components/AgentPetSprite.svelte:111-194` |
| Remove or neutralise the generic overlay glow and make the backlight read `form.aura` instead of a `switch` | `src/views/PetOverlay.svelte:491-535`, `1179-1184`; `src/views/AgentPetView.svelte:747` |
| Fix `computeSpritesheetPath` so the fallback uses the real level, not `1`, and pass `formId` in the gallery mini preview | `src/components/AgentPetSprite.svelte:42`, `src/components/pet/PetGallery.svelte:253-257` |
| Cache-bust replaced art: append `?v=<assetVersion>` to form paths, because `SHEET_CACHE` is keyed by URL | `src/shared/lib/petRenderer.ts:605`, `692-715` |
| Level up: give it a real behaviour instead of aliasing Waiting. Play the Celebrate row (4) with an aura burst and a cross-fade from the previous form's sheet to the new one when `resolvePetActiveForm` changes after an XP gain. Add an explicit `levelup` key to the Goku map | `src/shared/lib/petRenderer.ts:22`, `87-96`; `src/components/pet/PetAnimationPicker.svelte:24`, `71-73` |
| (Optional) Extend the uploader to include `forms/*/spritesheet.webp` under the public id `pets/<slug>/forms/<id>/spritesheet`, and stop short-circuiting `/forms/` paths to local files, if CDN delivery is wanted | `scripts/upload-pets-cloudinary.mjs:27-28`, `79`; `src/shared/lib/petRenderer.ts:607-614` |
| (Optional) Make "Tải Pet Về" either embed the image data or change its toast to say it is a metadata export | `src/components/pet/PetGallery.svelte:115-138` |

### 4.3 State mapping (unchanged rows, new art)

All eight UI clips keep their rows (Section 2.3). Per-form differences come from the sheet (hair, eyes, brows, skin) and the runtime aura. The aura intensity is already modulated by mood in `drawPetFrame` (`stateAlpha`, `src/shared/lib/petRenderer.ts:418`). Suggested aura behaviour per mood:

| Clip | Aura behaviour |
|---|---|
| Idle | Low, breathing |
| Working | Medium; sparks only for ss2/ss3 |
| Reading | Low |
| Waiting | Low flicker |
| Done | Medium |
| Celebrate | High burst |
| Sleepy | Aura off (UI and MUI keep a faint shimmer) |
| Level up | Burst plus cross-fade to the new form |

---

## 5. IP and Licensing Note

- **Rights holders and terms.** Dragon Ball characters are © Bird Studio/Shueisha, and the anime is © Toei Animation. Licensed releases carry credits such as "© Bird Studio/ Shueisha" (<https://www.scifijapan.com/articles/dragon-ball-super-broly-image-gallery-from-toei-and-funimation>). Bandai Namco's site terms allow downloaded material only for "non-commercial, personal purposes" and prohibit "Reproducing, modifying, or editing downloaded Material, distributing or selling it" (<https://www.bandainamco.co.jp/en/terms/index.html>). The search found no published Bandai Namco or Toei fan-content licence that would cover redistributing Goku likenesses inside an app.
- **Current art.** The existing sheet is third-party fan art (`public/pets/super-saiyan-goku/pet.json:20-21`).
- **Practical consequences:**
  - Do not trace or rip official game sprites or anime frames. Draw original pixel art.
  - Keep the Goku pack out of any commercial or public distribution unless a licence is obtained, or ship it as an optional user-installed pack.
  - Avoid official logos and names in marketing copy.
  - Keep a generic fallback "martial artist" archetype so the feature does not depend on the character.

---

## 6. Verification

| Check | How |
|---|---|
| Existing structural tests | `node --test tests/pet-forms.test.mjs` checks that 10 forms and their asset files exist and that level resolution works, including Lv 30 to blue-kaioken (`tests/pet-forms.test.mjs:21-74`). Also run `tests/pet-mapping.test.mjs`, `tests/pet-animation-picker.test.mjs`, `tests/pet-spritesheet-cloudinary.test.mjs` and `tests/pet-overlay.test.mjs`. These must still pass after the rebuild |
| New asset tests | Add to `tests/pet-forms.test.mjs`, reading `forms/manifest.json` (Node cannot decode WebP without a dependency):<br>- alpha-mask hashes of `ss3`, `ss2`, `ss1` and `base` must all differ;<br>- `base`/`kaioken`/`ui-sign` hair ramp mid lightness below 20%;<br>- `god` iris hue in the red band;<br>- `ssblue` iris hue in the blue band;<br>- `ss3.browsVisible === false`;<br>- the gi ramp is identical across all 10 forms |
| Renderer tests | Assert that `drawPetFrame` no longer applies the slug-wide `source-atop` gold wash for Goku forms, and that sparks render only for `aura.sparks` forms |
| Browser | `node tests/pet-animation-identity-browser.mjs` and `node tests/pet-motion-browser.mjs` cover clip identity and motion across the 8 clips. Extend them to cycle the 10 forms and snapshot frame (0,0) |
| Rust | `cargo test -p sound-pet` covers levels and XP only (for example `crates/pet/src/care.rs:561-568`). Run it as a regression check; forms do not touch Rust |
| Full suite and desktop app | `cargo test --workspace`, `node --test tests/*.test.mjs` and `pnpm build`, then `pnpm rebuild:app` on macOS for a visual check of the overlay (CLAUDE.md post-work rule) |

---

## 7. Prioritised Implementation Plan

1. **Stop re-tinting correct art (small, code only).** Make `ARCHETYPE_LIGHTING` form-aware or drop the Goku `source-atop` wash. Gate the lightning strokes to ss2/ss3. Remove the generic `.pet-goku-aura` filter (`src/shared/lib/petRenderer.ts:211-222`, `407-475`; `src/views/PetOverlay.svelte:1179-1184`).
2. **Single source of truth for forms.** Delete `GOKU_FORMS` and extend `PetFormMeta` with `hairShape`, `aura` and `assetVersion`. Correct the descriptions per Section 3.3 (`src/components/pet/types.ts:74-88`, `546-636`, `995-1135`).
3. **Reproducible pipeline plus region-masked palette swap (option B).** Commit the source layers and `scripts/build-pet-forms.mjs`. Regenerate all 10 sheets and avatars with the gi constant and correct eyes, brows, skin and hair colour. Emit `manifest.json` and add the manifest tests.
4. **Hair silhouettes (option C).** Draw the 5 hair shapes x about 8 head poses, author `anchors.json` and rebuild:
   - ss3 first (waist-length mane, no brows);
   - then base/kaioken/ui-sign (H0);
   - then ss2 (single bang);
   - then god/mui (H4).
5. **Runtime aura layer.** Draw the per-form aura behind the sprite from `form.aura`: double layer for blue-kaioken, sparks for ss2/ss3, blue-white for ui-sign, silver-white for mui. Shrink the CSS drop-shadows to a subtle halo and drive the overlay backlight from the same data.
6. **Level-up clip.** Add the `levelup` mapping and a form-transition cross-fade with an aura burst. Stop aliasing it to Waiting.
7. **Small fixes.**
   - Use the real level in `computeSpritesheetPath`.
   - Pass `formId` to the gallery preview.
   - Add `?v=` cache-busting.
   - Fix the "Tải Pet Về" toast or bundle contents.
   - Optionally extend the Cloudinary uploader to the `forms/` sheets.
8. **Optional fidelity pass (option D, partial).** Slimmer God body frames and a torn-gi variant for ui-sign/mui, only if commissioning an artist.

---

## 8. Implementation Status (2026-10-27)

- Steps 1-7 are implemented. Step 8 (hand-drawn fidelity pass) is open.
- `scripts/build-goku-forms.py` (Pillow + numpy, run with `python3 -I`) generates the 10 sheets, avatars and `forms/manifest.json` from the root SSJ1 sheet. Instead of hand-drawn hair parts per head pose (Section 4, option C), hair is segmented per frame and reshaped procedurally: base and lifted shapes rescale the hair above the hairline, SSJ2 adds a forehead bang, SSJ3 adds an outlined waist-length mane behind the body and removes the eyebrows.
- The aura palette lives in `FORM_AURAS` in `src/shared/lib/petRenderer.ts` rather than on `PetFormMeta`, because `tests/theme-tokens.test.mjs` only allows colour literals in files that own a palette.
- Level up maps to row 4 (jump) for Goku and plays for 2.4 s when the resolved form moves up; there is no sheet cross-fade.
- Not done: `?v=` cache-busting (the form paths are bundled with the app, so a rebuild ships new art) and Cloudinary upload of form sheets.

## 9. Sources

### Primary / official
1. Dragon Ball Official Site, "The Many Forms of Super Saiyan! Dragon Ball Legends Saiyan Selection": SSJ3 waist-length hair and no eyebrows; SSB blue hair and pupils; SSB Kaio-ken red-over-blue aura and pink skin; UI -Sign- blue and white aura. <https://en.dragon-ball-official.com/news/01_970.html>
2. Dragon Ball Official Site, Weekly Character Showcase #58 (Gohan, Android/Cell arc): SSJ2 lightning. <https://en.dragon-ball-official.com/news/01_1166.html>
3. Dragon Ball Official Site, Weekly Character Showcase #61 (Goten): Super Saiyan hair "turns gold, stands straight up". <https://en.dragon-ball-official.com/news/01_1226.html>
4. Dragon Ball Official Site, S.H.Figuarts Super Saiyan God Goku: "shining red aura". <https://en.dragon-ball-official.com/news/01_2196.html>
5. Dragon Ball Official Site, S.H.Figuarts Goku: Ultra Instinct - Toyotarou Edition: "silver, wind-blown hair". <https://en.dragon-ball-official.com/news/01_2071.html>
6. Dragon Ball Official Site, SOLID EDGE WORKS Ultra Instinct Goku: pearlescent hair and eyebrows. <https://en.dragon-ball-official.com/news/01_3608.html>
7. Bandai Namco Holdings, Website Terms of Use. <https://www.bandainamco.co.jp/en/terms/index.html>
8. Bandai Namco Europe, Dragon Ball FighterZ product page (Goku Ultra Instinct DLC listing). <https://en.bandainamcoent.eu/dragon-ball/dragon-ball-fighterz>

### Secondary (pointers only; verify against official art)
9. Dragon Ball Wiki (fan), Super Saiyan God: crimson hair, red irises, slimmer build. <https://dragonball.fandom.com/wiki/Super_Saiyan_God>
10. Otakumode Otapedia, Ultra Instinct: Sign keeps black hair with silver eyes; mastered form has silver hair. <https://otakumode.com/otapedia/anime/dragon_ball/ultra_instinct>
11. EventHubs, V Jump scan of FighterZ Ultra Instinct Goku with silver hair and eyes. <https://www.eventhubs.com/news/2020/jan/19/ultra-instinct-gokus-first-magazine-scan-appears-online-dragon-ball-fighterz>
12. toy-people.com (JP), Super Saiyan God Goku figure article: red hair. <https://www.toy-people.com/jp/?p=84534>
13. Dragon Ball Wiki (fan), episode "A Transcendent Limit Break! Autonomous Ultra Instinct Mastered!". <https://dragonball.fandom.com/wiki/A_Transcendent_Limit_Break!_Autonomous_Ultra_Instinct_Mastered!>
14. mcpservers.org mirror of the "Codex Pets" skill: 1536x1872, 8x9 atlas of 192x208 cells. <https://mcpservers.org/agent-skills/runcomfy-com/codex-pet>
15. SciFi Japan, Toei/Funimation Broly image gallery: copyright credit line. <https://www.scifijapan.com/articles/dragon-ball-super-broly-image-gallery-from-toei-and-funimation>

### Repository measurements
Measured locally with Python PIL/numpy on `public/pets/super-saiyan-goku/spritesheet.webp` and `public/pets/super-saiyan-goku/forms/*/{spritesheet.webp,avatar.png}`:
- sheet size and cell size;
- per-row frame counts;
- alpha-mask equality across all forms;
- the unique-colour count;
- the dominant 16-colour palette;
- pairwise RGB differences.
