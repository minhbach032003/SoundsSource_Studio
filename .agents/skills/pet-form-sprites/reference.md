# Pet Form Sprites: Reference

## Sheet contract

- 8 columns x 9 rows (`COLS`/`ROWS` in `src/shared/lib/petRenderer.ts`). `slice()` rejects any
  sheet whose size is not divisible by the grid. Goku cells are 192 x 208.
- Rows: 0 idle, 1 run right, 2 run left, 3 wave (done), 4 jump (celebrate), 5 sleepy,
  6 waiting, 7 working, 8 reading. Per-pet overrides live in `ARCHETYPE_STATE_ROW`. Give each
  pet an explicit `levelup` row (Goku uses 4), otherwise it falls back to Waiting (6).
- Root sheet `public/pets/<slug>/spritesheet.webp` is the source art. Form sheets live under
  `forms/<id>/`, each with a 128 x 128 `avatar.png` (frame 0,0 fitted to the square).
- Form paths are bundled with the app, not uploaded to Cloudinary (`resolvePetSpritesheetUrls`
  short-circuits `/forms/`). `pnpm pets:upload` is irrelevant to forms.

## How build-goku-forms.py works (per cell)

1. **classify()**: materials from HLS bands.
   - Hair: hue 37.5-68, sat > 0.35, light > 0.28.
   - Iris: hue 140-205.
   - Skin: hue 8-36, light > 0.62.
   - Blue outfit: hue 200-250. Dark line art: light < 0.3.
2. **Hair clean-up**: drop components under 10 px, then keep only the largest component plus
   pieces chained within 10 px of it (`near_largest`). Hair is split by inner line art, so the
   chaining has to iterate, and it removes outfit specks that share the hair hue.
3. **Shadow growth**: hair shadows had exactly the outfit's orange hue (around 36), so they are
   added by growing from lit hair into `hue 25-37.5, light 0.3-0.56` pixels, 6 steps maximum.
   The dark outline between hair and outfit stops the growth.
4. **head_metrics()**: `cx` is the median hair x. `hairline` is the topmost skin pixel within
   22 px of `cx`. `face_x` (the skin centroid) gives the facing direction for trailing parts.
5. **reshape_top_hair()**: everything above the hairline within 8 px of hair moves together
   with it, including the antialiased outer outline, except skin and outfit (dilated 2 px). It
   is then resampled with nearest-neighbour about `(cx, hairline)` using `SHAPE_SCALE` (vertical,
   horizontal). Base hair is `(0.6, 1.14)`: squashed and widened, so it fans sideways.
6. **recolor()**: hair lightness 0.3-0.9 is mapped onto the form's 4-stop ramp. Hair outline
   becomes the form's outline colour, the iris is remapped, and the skin is blended toward the
   tint. The outfit is never touched.
7. **Shape parts**: outlined polygons are composited only into transparent pixels, so they sit
   behind the body. The SSJ3 mane follows the head-to-body vector, trails opposite the face
   when running, has down-pointing flank locks, 5 tips, a dark rim and strand highlights. The
   SSJ2 bang is drawn over the forehead.
8. **Outline gap fill**: after any rescale, a 1 px outline is added where hair now touches
   transparency. Skip this when the scale is `(1, 1)`, or unchanged forms grow a border.
9. **remove_brows()** (SSJ3): dark pixels in a band above the iris that do not touch the eye
   whites, the iris or hair are painted with the median nearby skin-shadow colour.

## Pitfalls hit on Goku (check each one on a new pet)

| Symptom on the contact sheet | Cause | Fix |
|---|---|---|
| Thin ghost outline of the old shape above the head | Only hair pixels moved; the antialiased outer outline (often green-black, low alpha) stayed | Move every opaque pixel near the hair above the hairline |
| Specks or diamonds floating above the head | A few outline pixels misclassified as outfit blue, so they were protected | Require light > 0.18 and size >= 12 px for protective masks |
| Black blob on the trousers | An outfit fold with a hair hue survived the size filter, and the growth spread it | `near_largest` chaining around the main hair mass |
| Orange streaks left in black hair | Hair shadow hue equals the outfit's | Bounded shadow growth from lit hair |
| Green or teal eyes left in a form that should be black or red | Iris band too narrow | Widen the hue band to 140-205, light 0.12-0.8 |
| New shape part looks like wings or a cape | Flank spikes pointed outward or up | Point locks down the body axis; widen gradually |
| Part only on one side in front-facing frames | Facing threshold too low | Trail only when abs(face_x - head_x) > 12 |
| Sheets about 2x larger | Lossless WebP | Lossy q92, alpha_quality 100 |

Lying and bowed frames (row 5) rotate the head, so vertical rescaling distorts them a little.
That is acceptable at pet size. Check them on the preview anyway.

## Code touchpoints

| What | Where |
|---|---|
| Form list (id, name, minLevel, descriptions, asset paths); single source of truth | `INSTALLED_PETS` in `src/components/pet/types.ts` |
| Aura palette, `petFormAura`, aura drawing, sparks, level-up row | `src/shared/lib/petRenderer.ts` (`FORM_AURAS`, `drawFormAura`, `drawAuraSparks`, `ARCHETYPE_STATE_ROW`) |
| Sprite resolves form by `formId` or `level`, sets aura, plays level up on form upgrade | `src/components/AgentPetSprite.svelte` |
| Clip thumbnails use the form aura | `src/components/pet/PetAnimationPicker.svelte` (`formAura` prop) |
| Overlay backlight and sparkles from the aura | `petFxFor()` in `src/views/PetOverlay.svelte` |
| Stage backdrop from the aura | `activeAura` in `src/views/AgentPetView.svelte` |

## Test-suite constraints

- `tests/pet-forms.test.mjs` loads `types.ts` in a `vm` after stripping only the lucide import.
  Any other value import in `types.ts` breaks the loader; `import type` is fine.
- Arrays coming back from a `vm` context are cross-realm: wrap them in `Array.from(...)` before
  `assert.deepEqual`.
- `tests/theme-tokens.test.mjs` forbids hex and rgb literals outside palette-owning files.
  `petRenderer.ts` is allowed; `types.ts` and the views are not.
- `tests/long-running-perf.test.mjs` asserts the exact line
  `const minDynamicsInterval = isIdle ? 33 : 0;` in `petRenderer.ts`. Add throttles beside it,
  never by editing it.
- A renderer test can wrap a `Proxy` 2D context that records calls and `globalCompositeOperation`.
  The Goku aura test uses it to check that the aura is drawn before `drawImage` and that
  `source-atop` is never used.

## Live preview without Tauri

Run `pnpm dev`. Then serve a small HTML page from a scratch directory (`python3 -I -m http.server`)
that imports `http://localhost:1420/src/shared/lib/petRenderer.ts`. For each form, create a
`PetRenderer`, call `setAura(petFormAura(slug, id))`, `load(<form sheet URL>)` and
`setState(mood)`. Screenshot it with agent-browser. Stop both servers afterwards.

## IP note

Licensed characters (Dragon Ball, Pokemon, Crayon Shin-chan) belong to their rights holders.
Generate or draw original pixel art; do not trace or rip official sprites.
