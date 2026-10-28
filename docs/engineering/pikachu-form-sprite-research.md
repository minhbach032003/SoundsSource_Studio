# Pikachu ten-form sprite refinement

## Scope and provenance

The supplied `openspec/changes/fix-pikachu-electric-envelope-and-progression/reference/requested-forms.png` is the visual brief, not evidence for every historical claim in its labels. All ten existing IDs remain unchanged. These are original chibi illustrations, not extracted or traced official sprites.

| ID | Classification | Authored visual cues |
|---|---|---|
| `pichu` | Official Pokémon | Smaller baby body, oversized head, broad black-edged ears, pink cheeks, black collar and tiny black tail |
| `classic` | Official Pokémon; stylized Pikachu | Yellow pear body, black-tipped long ears, red cheeks, connected lightning tail |
| `raichu` | Official Pokémon | Orange athletic body, curved/scroll ears, cream oval belly, yellow cheeks, dark paws, long thin tail ending in a gold blade |
| `alolan-raichu` | Official regional form | Caramel fur, rounded curled ears, cream belly, blue eye accents, connected cord and golden surfing tail |
| `gigantamax` | Official Gigantamax form | Round oversized body, towering attached bolt tail, three rose-red curled Dynamax cloud wisps |
| `mega-raichu-x` | Official Mega Evolution | Supplied reference's black swept ears with gold tips/root curls, dark paws, white abdomen, two connected gold tail blades |
| `mega-raichu-y` | Official Mega Evolution | Orange body, lightning-shaped ear/temple tufts, blue eye accents, cream abdomen, large raised gold tail blade |
| `concept-white-belly` | Reference concept; provenance unverified | Shorter wide-set ears, plump body, continuous curved white throat/belly patch, short broad tail |
| `concept-long-tail` | Reference concept; provenance unverified | Longer ears, leaner proportions, extended multi-bend lightning tail |
| `gorochu` | Artist reconstruction of an unused evolution concept | Red shaggy fur, paired cream horns, little fangs, apricot chest, dark paws and a connected spiked tail |

### Verified Mega source

The official Japanese Pokémon site explicitly announces both Mega Raichu X and Mega Raichu Y, describes their two different Mega Stones, and shows their designs:

- <https://www.pokemon.co.jp/ex/legends_z-a_dlc/ja/pokemon/250912_01/> (retrieved successfully during this refinement).
- English official page supplied by the coordinator: <https://legends.pokemon.com/en-gb/news/mega-dimension-hoopa>. The loopback virtual host was not reachable from this writer session; the Japanese primary source independently establishes that these Megas exist.

The prior review's claim that Mega Raichu X/Y do not exist is outdated. They must **not** be relabeled as fan forms. Conversely, the reference's red Gorochu reconstruction is not treated as an officially published red design. White-belly and long-tail references do not establish a dated prototype or creator attribution.

Removed unsupported HZ138/anime assertions, voltage figures, claims tying the white-belly/long-tail art to specific 1996 prototypes or Nishida stages, and unsupported historical/artist attribution. No anime chronology, electrical measurements, or speculation about the history of these concept illustrations is needed for this asset pass.

## Authoring method

`scripts/build-pikachu-forms.py` replaces raster extraction and primitive overlays with fully authored cubic/quadratic Bézier paths painted by Pillow at 4× resolution, then downsampled once with Lanczos. A single warm outline/material style is shared by the ten designs; distinct body proportions, connected ear roots, tail geometry and fur patches establish the forms. Fur and cheeks use the existing four-stop palette metadata. Palette-controlled shadows follow flank contours and highlights follow the head dome; cream/white areas are curved silhouettes rather than rectangular masks.

No source pixels survive, so old ears, flat skull cuts, detached tails, capture lines, and ghosts cannot leak through. Tails begin inside the pelvis and are painted behind the body. The default front-three-quarter pose does not expose the dorsal stripes: they are deliberately omitted instead of painting back stripes on the face/chest. Dynamax clouds are opaque authored cloud motifs, not electrical aura. There is no baked electricity, cyan board glow, glow halo or ground rectangle.

### Runtime grid contract

Validated against `src/shared/lib/petRenderer.ts` (`DEFAULT_STATE_ROW` / `ARCHETYPE_STATE_ROW.pikachu`), not the inaccurate previous contact-sheet labels:

| Row | Authored behavior |
|---|---|
| 0 | Idle breathing and blink |
| 1 | Run right: forward lean, opposed foot/arm strides, bob and tail sway |
| 2 | Run left: exact alpha mirror of row 1 at every frame |
| 3 | Done/wave: raised waving arm and smile |
| 4 | Celebrate/levelup: both arms raised, happy eyes/open mouth and looping jump |
| 5 | Sleepy: tucked/squashed resting pose, folded ears, closed eyelids throughout, subtle breathing |
| 6 | Waiting: quiet breathing/look with blink |
| 7 | Working: hands reaching to a small muted laptop, typing motion and blink |
| 8 | Reading: open cream-page book and blink |

The grid stays 8×9 with 192×208 cells (1536×1872 sheets). Shipped sheets use WebP `quality=92`, `alpha_quality=100`, `method=6`; avatars are 128×128 RGBA. Aliases `white-belly` and `long-tail` receive identical corresponding assets. Existing legacy cap directories are preserved, never pruned or redrawn. Subset builds touch only requested forms, their aliases, manifest metadata and the temporary contact sheet.

## Reproduction and visual review

```sh
python3 -I scripts/build-pikachu-forms.py pichu raichu
python3 -I scripts/build-pikachu-forms.py
python3 -I scripts/build-pikachu-forms.py --check
node --test tests/pet-forms.test.mjs
node scripts/upload-pets-cloudinary.mjs --dry-run
```

The reproducible contact sheet is `/tmp/pikachu-refined-ten-forms.png` (idle 0/0, run-right 1/2, celebrate 4/3, sleep 5/0). Work/read/wave and frame-strip inspection is also useful: numerical checks alone cannot accept visual quality.

### RED and iteration evidence

- Visual RED: the rejected `/tmp/pikachu-ten-forms-contact-sheet.png` visibly has chopped skull domes, disconnected ears/tails, hard rectangular belly patches, back stripes on the chest and awake sleep frames. Those findings are real regardless of prior manifest test success.
- First redraw: inspected the all-ten sheet; geometry check caught run-frame margin overflow. Broadened Pichu ears into baby wedges, curled Raichu ears, widened the Mega blades, reddened/shagged Gorochu and reduced the framing scale rather than deleting edge pixels.
- Second redraw: inspected again; check caught Raichu's sleep-tail excursion. Reduced sleep shear rather than masking/cropping the tail; rounded the Alolan ears further and narrowed the adult Raichu skull smoothly.
- Third framing iteration: mirrored Mega Y run bounds exposed the asymmetric left/right alpha budget. Reduced the overall framing scale to 0.86 (without cropping); all 720 cells then passed. Inspected the final idle/run/celebrate/sleep and supplemental wave/work/read contact sheets.
- Final validation: `--check` passed all 720 cells and ten silhouettes; `node --test tests/pet-forms.test.mjs` passed 14/14; upload dry-run passed with 8 pets and 168 assets. A subset rebuild of Pichu/Raichu produced bit-identical asset and manifest hashes. All avatars were checked at 128×128 and both compatibility aliases were byte-equal to their targets.
- The runnable `--check` validates every cell's safety margin, sheet size, substantial-alpha anatomy connectivity in the idle sample (cloud components allowed for GMax), exact left/right run alpha mirroring, a genuinely different sleep silhouette and ten unique decoded sheet silhouettes. These checks catch detached overlays/margin cuts, but are not a substitute for reviewing all poses.

## Limits and acceptance

These are intentionally flat, outlined chibi/cel illustrations rather than the reference's rendered 3D models. They simplify fine fur detail and Mega blade size to fit companion cells, and they use a common pose rig rather than ten separate skeletal animation systems. Resting is a tucked seated pose, not fully horizontal lying. Waiting and idle are closely related. The run cycle is stylized and front-three-quarter rather than a fully rotated profile. Cloud motifs are stylized. The follow-up below changes Pikachu runtime effects, not progression logic.

The coordinator and independent reviewer inspected the refined contact sheets and the real 96/200px dark/light render grid, accepting the structural artistic repair. Final deployment/publication remains a separate gate; structural tests alone do not prove visual functionality.

### Integration corrections after independent review

The renderer activity VM fixture now strips every import and injects generated anchor data; the pre-fix test failed with `exports is not defined`. The full Node suite detects this integration regression.

Eye painting now consumes the declared form iris palette rather than unrelated hardcoded blue/brown. `--check` inspects decoded iris-region pixels and the pre-WebP illustration against the palette: the authored color tolerance is 15 RGB-distance units, while decoded q92 WebP allows 75 because chroma subsampling reduces tiny saturated iris detail. The pre-fix art failed the new check. This verifies a real painted accent, not just manifest values.

Bundled Pikachu form sheets and compiled generated landmarks must stay paired. `resolvePetSpritesheetUrls` selects bundled `/pets/pikachu/forms/` assets ahead of old installed blob overrides; stale downloaded geometry otherwise displays with new cheek/tail anchors. Other companions' installed blob resolution is unchanged. No cache is deleted and no cloud upload or global catalog migration is performed.

## Skill-led motion and landmark polish

Applied the discovered `character-design`, `pixel-art-sprites` and `appeal-mastery` skills after reading their bodies and the first two skills' patterns, sharp edges and validations. The relevant constraints are three-read hierarchy, silhouette/negative-space landmarks, cohesive family variation, stable sprite grids/key poses, distinctive secondary-motion rhythm and a clear face focal point. Hard-pixel/no-AA/PNG-only rules do not describe these smooth chibi illustrations; q92 WebP and transparent antialiasing remain intentional.

### Concrete application

- Kept the accepted anatomy, warm outlines, facial proportions and existing nine actions. No new frames, particles, timers, runtime pixel scans or animation framework.
- The generator's `MOTION` table varies idle amplitude and second-harmonic timing, ear fold amplitude/lag and tail sway amplitude/lag. Pichu has a quick double-accent bob and wide ear response; Alolan Raichu has a gentler flowing drift with delayed surfing-tail follow-through; Gigantamax is heavy/slow with a restrained giant tail; Mega X is taut and accented, Mega Y lighter/snappier; Gorochu has a compact weighted pulse. Classic, white-belly and long-tail retain family unity but differ in secondary-motion lag/amplitude. All curves remain periodic within eight cells and left-run mirrors the full authored pose.
- `forms/anchors.json` contains three cell-space points (left cheek, right cheek, tail tip) for each of 720 cells, generated through the exact `pose_transform` and `tail_point` functions used to paint the art. The row-2 points are mirrored with the artwork. `--check` rejects stale coordinates and requires each point to touch substantial alpha within a 5×5 neighborhood. This is generated data, not copied runtime geometry math.
- Runtime identifies the form from the loaded sheet path, with the existing aura identity as fallback for opaque installed/CDN URLs. It subtracts the slicer's shared cell crop, then maps to the same stage rectangle and canvas pose transform as the sprite. Aliases normalize only for anchor lookup; progression/resolution APIs remain unchanged. Unknown and legacy sheets retain approximate relative-anchor fallback instead of throwing. `drawPetFrame`'s signature is unchanged, so picker previews also receive precise anchors without a component API change.
- Replaced detached parallel bracket-like lines with broken cheek-to-flank branching arcs behind the body. Front cheek and tail-tip discharges always render for waking Pikachu, including with a non-null aura. Yellow strokes and narrower white cores dominate; form hue is only a faint wider fringe and existing floor accent. No Goku tongues or sprite tint. Eyes/mouth and ear/tail negative space stay clear.
- Sleep suppression uses both explicit `sleepy` state and actual sheet row 5, covering `PetAnimationPicker`'s empty-state caller and custom bindings. No Goku/non-Pikachu sleep or flame behavior changed. Existing animation preference/reduced-motion lifecycle already cancels RAFs; tested without adding a new scheduler.
- Runtime descriptions now call classic a stylized Pikachu, label unverified marking/tail concepts honestly and label red Gorochu as an artist reconstruction. Removed unsupported dates/creator attribution, HZ138 and voltage claims while preserving the officially documented Mega X/Y labels.

### Three-read evidence and limits

Temporary `/tmp/pikachu-three-read-32-64-light-dark.png` shows actual 32px black silhouettes and 64px color renders on light/dark plates. Baby wedge ears, the Alolan low surf tail, GMax cloud/tail mass, paired Mega X blades and Gorochu horns/shag remain the strongest large-scale landmarks. At 32px the classic, white-belly and long-tail group can be confused; **white-belly is intentionally the same species silhouette, primarily a marking variation**, not a separate species identifiable from shadow alone. At 64px the white abdomen and dark paws/cream abdomen separate color groups; tiny ear curls/eye accents are not promised at this size. Black silhouette-on-dark is deliberately low contrast, a shape diagnostic rather than a shipped palette. Actual colored outlines remain readable on both backgrounds.

Inspected `/tmp/pikachu-ten-forms-browser-preview.png` (1720×1486, full grid, all ten at 200px and 96px on dark/light) and `/tmp/pikachu-ten-forms-sleep-preview.png`. The last column is no longer cropped. Faces remain unobscured, tail sparks start at their different actual landmarks, no rectangular belly masks or detached cages, no clipped stage-edge FX. The same screenshot includes the unchanged Goku SS2 flame path as a control. Contact sheet `/tmp/pikachu-refined-ten-forms.png` was regenerated and inspected after the timing pass. This is a restrained motion/electricity polish, not a second anatomy redraw or a claim of exact official-model fidelity.

### Focused validation

- Meaningful RED before runtime changes: picker row 5 emitted six electrical strokes without a state; authored cheek/tail landmark assertion missed the old relative anchors. Both tests exited 1 in `/tmp/pikachu-polish-red.log`.
- GREEN: `python3 -I scripts/build-pikachu-forms.py --check` passed all 720 cells, anchor-to-art checks, connected sampled anatomy, exact run mirroring, margins and distinct sleep.
- GREEN: `node --test tests/pet-forms.test.mjs tests/pet-render-stage.test.mjs` passed 24/24. Added crop/cell/facing/alias/unknown fallback landmark checks and runtime provenance regression. The stage test's only change is a one-line generated-JSON injection in its import-stripping VM fixture, approved by the coordinator.
- GREEN: `pnpm build` completed (`tsc` and Vite); existing >500kB chunk-size warning remains.
- GREEN: `node tests/pikachu-ten-forms-browser.mjs` uses `agent-browser` against a temporary Vite fixture. Audits 1,440 real sliced canvas frames (720 cells × two sizes), exact discharge start positions, both facings, picker-row and explicit-state sleep, transparent outer canvas edges; preserves alias expectations. Animation-on positive control changes pixels/draw count. Preference-off and reduced-motion each freeze pixel data across 450ms and produce no draws/null RAFs. Destroy leaves no renderer RAF; browser always closes in `finally`. Error/rejection listeners are registered, checked, and complemented by the CLI error buffer.
- Host caveat: Chrome 156's native `getImageData` returned randomly different RGB values by exactly one channel unit even on two immediate reads with no drawing. The fixture therefore compares raw pixels with a measured ±1 readback tolerance **and independently requires zero production draw calls**. It does not claim bit-identical browser readbacks. Real animation must exceed that floor in the positive control.

Full-suite review, desktop integration, production rebuild/deployment/publication and coordinator acceptance remain outside this worker's scope. Pre-existing untracked `scripts/__pycache__` is preserved and must not be staged.
