//! Theme-aware native V7 wheel geometry and procedural surface math.
use crate::geometry::WHEEL_INNER_RADIUS;
use serde::{Deserialize, Serialize};
use std::f64::consts::{FRAC_PI_4, FRAC_PI_8, TAU};

pub const EXTENT: f64 = 230.0;
pub const ICON_RADIUS: f64 = 153.0;

#[derive(Clone, Copy, Debug, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
#[repr(u8)]
pub enum Theme {
    DefaultLight,
    #[default]
    DefaultDark,
    Latte,
    Frappe,
    Macchiato,
    Mocha,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Palette {
    pub hub: [u8; 3],
    pub line: [u8; 3],
    pub inner: [u8; 3],
    pub outer: [u8; 3],
    pub ink: [u8; 3],
    pub accent: [u8; 3],
}

impl Theme {
    pub fn palette(self) -> Palette {
        match self {
            Self::DefaultLight => Palette {
                hub: [255, 255, 255],
                line: [233, 223, 224],
                inner: [255, 255, 255],
                outer: [247, 232, 233],
                ink: [107, 96, 100],
                accent: [226, 180, 189],
            },
            Self::DefaultDark => Palette {
                hub: [26, 23, 27],
                line: [61, 52, 60],
                inner: [27, 23, 28],
                outer: [40, 35, 42],
                ink: [189, 177, 180],
                accent: [226, 180, 189],
            },
            Self::Latte => Palette {
                hub: [230, 233, 239],
                line: [204, 208, 218],
                inner: [230, 233, 239],
                outer: [239, 241, 245],
                ink: [92, 95, 119],
                accent: [32, 159, 181],
            },
            Self::Frappe => Palette {
                hub: [41, 44, 60],
                line: [65, 69, 89],
                inner: [41, 44, 60],
                outer: [48, 52, 70],
                ink: [181, 191, 226],
                accent: [133, 193, 220],
            },
            Self::Macchiato => Palette {
                hub: [30, 32, 48],
                line: [54, 58, 79],
                inner: [30, 32, 48],
                outer: [36, 39, 58],
                ink: [184, 192, 224],
                accent: [125, 196, 228],
            },
            Self::Mocha => Palette {
                hub: [24, 24, 37],
                line: [49, 50, 68],
                inner: [24, 24, 37],
                outer: [30, 30, 46],
                ink: [186, 194, 222],
                accent: [116, 199, 236],
            },
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Texel {
    pub idle: [u8; 4],
    pub selected: [u8; 4],
    pub slot: u8,
}

impl Texel {
    pub fn fixed(rgba: [u8; 4]) -> Self {
        Self {
            idle: rgba,
            selected: rgba,
            slot: 0,
        }
    }

    pub fn rgba(self, selection: &[f64; 8]) -> [u8; 4] {
        if self.idle == self.selected {
            return self.idle;
        }
        let amount = selection[usize::from(self.slot)].clamp(0.0, 1.0);
        if amount == 0.0 {
            return self.idle;
        }
        if amount == 1.0 {
            return self.selected;
        }
        std::array::from_fn(|i| {
            (f64::from(self.idle[i])
                + (f64::from(self.selected[i]) - f64::from(self.idle[i])) * amount)
                .round() as u8
        })
    }
}

pub struct Surface {
    pub extent: i32,
    pub pixels: Vec<Texel>,
    pub theme: Theme,
}

impl Surface {
    pub fn new(scale: f64) -> Self {
        Self::with_theme(scale, Theme::DefaultDark)
    }

    pub fn with_theme(scale: f64, theme: Theme) -> Self {
        let extent = (EXTENT * scale).ceil() as i32;
        let palette = theme.palette();
        let pixels = (-extent..=extent)
            .flat_map(|y| {
                (-extent..=extent)
                    .map(move |x| texel(f64::from(x) / scale, f64::from(y) / scale, scale, palette))
            })
            .collect();
        Self {
            extent,
            pixels,
            theme,
        }
    }

    pub fn refresh_to(&mut self, scale: f64, theme: Theme) {
        if self.theme != theme {
            *self = Self::with_theme(scale, theme);
        }
    }

    /// Straight RGBA for canvas rendering or raster callbacks.
    pub fn paint(&self, selection: &[f64; 8], mut point: impl FnMut(i32, i32, [u8; 4])) {
        let width = (self.extent * 2 + 1) as usize;
        for (i, texel) in self.pixels.iter().enumerate() {
            let rgba = texel.rgba(selection);
            if rgba[3] != 0 {
                point(
                    (i % width) as i32 - self.extent,
                    (i / width) as i32 - self.extent,
                    rgba,
                );
            }
        }
    }
}

pub fn color(rgb: [u8; 3], coverage: f64, alpha: f64) -> [u8; 4] {
    [
        rgb[0],
        rgb[1],
        rgb[2],
        (coverage.clamp(0.0, 1.0) * alpha).round() as u8,
    ]
}

pub fn texel(x: f64, y: f64, scale: f64, palette: Palette) -> Texel {
    let radius = x.hypot(y);
    let aa = 0.5 / scale;
    let edge = |distance: f64| (distance + aa) * scale;
    if radius > EXTENT + aa {
        return Texel::fixed([0; 4]);
    }
    // Separate circular hub and spaced wedges, rather than a solid disk.
    if radius <= WHEEL_INNER_RADIUS + aa {
        let rgb = if radius > WHEEL_INNER_RADIUS - 1.0 - aa {
            palette.line
        } else {
            palette.hub
        };
        return Texel::fixed(color(rgb, edge(WHEEL_INNER_RADIUS - radius), 250.0));
    }
    let angle = x.atan2(-y).rem_euclid(TAU);
    let slot = ((angle / FRAC_PI_4).round() as usize) % 8;
    let delta = ((angle - slot as f64 * FRAC_PI_4 + std::f64::consts::PI).rem_euclid(TAU)
        - std::f64::consts::PI)
        .abs();
    if radius < 93.0 && delta < FRAC_PI_8 - 0.08 {
        return Texel {
            idle: color(palette.accent, 0.0, 0.0),
            selected: color(palette.accent, edge(1.2 - (radius - 90.0).abs()), 210.0),
            slot: slot as u8,
        };
    }
    let gap = (FRAC_PI_8 - delta).sin() * radius - 2.5;
    let wedge = edge((radius - 98.0).min(220.0 - radius).min(gap));
    if wedge > 0.0 {
        let radial = ((radius - 98.0) / 122.0).clamp(0.0, 1.0);
        let base: [f64; 3] = std::array::from_fn(|i| {
            f64::from(palette.inner[i]) * (1.0 - radial) + f64::from(palette.outer[i]) * radial
        });
        let border = edge(1.0 - (radius - 98.0).min(220.0 - radius).min(gap)).clamp(0.0, 1.0);
        let tint = |amount: f64| {
            std::array::from_fn(|i| {
                (base[i] * (1.0 - amount) + f64::from(palette.accent[i]) * amount).round() as u8
            })
        };
        let idle = color(tint(0.08 * border), wedge, 250.0);
        let mut selected = tint(0.08 * border + 0.14);
        if radius > 212.0 && delta < FRAC_PI_8 - 0.025 {
            let arc = edge(1.5 - (radius - 216.5).abs()).clamp(0.0, 1.0);
            selected = std::array::from_fn(|i| {
                (f64::from(selected[i]) * (1.0 - arc) + f64::from(palette.accent[i]) * arc).round()
                    as u8
            });
        }
        return Texel {
            idle,
            selected: color(selected, wedge, 250.0),
            slot: slot as u8,
        };
    }
    // Broken outer bezel with fine ticks and eight longer compass ticks.
    let major = edge(0.9 - delta * 228.0).min(edge(3.5 - (radius - 227.0).abs()));
    if major > 0.0 {
        return Texel::fixed(color(palette.accent, major, 155.0));
    }
    let tick = ((angle * 228.0 + 5.0).rem_euclid(10.0) - 5.0).abs();
    Texel::fixed(color(
        palette.ink,
        edge(0.6 - tick).min(edge(1.4 - (radius - 227.0).abs())),
        65.0,
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::geometry::pick_slice;
    use std::collections::HashMap;

    #[test]
    fn v7_wheel_has_spaced_wedges_blush_highlights_and_unchanged_dead_zone() {
        for scale in [1.0, 1.5, 2.0] {
            let palette = Theme::DefaultDark.palette();
            let sample = |x, y, selection: &[f64; 8]| texel(x, y, scale, palette).rgba(selection);
            let idle = [0.0; 8];
            assert_eq!(sample(0.0, 0.0, &idle), [26, 23, 27, 250]);
            assert_eq!(sample(0.0, -94.0, &idle)[3], 0, "hub/wedge gap");
            let boundary = FRAC_PI_8;
            assert_eq!(
                sample(153.0 * boundary.sin(), -153.0 * boundary.cos(), &idle)[3],
                0,
                "slice gap"
            );
            assert_eq!(sample(240.0, 0.0, &idle)[3], 0);
            let mut selected = idle;
            selected[0] = 1.0;
            assert_eq!(&sample(0.0, -216.5, &selected)[..3], &palette.accent);
            assert_ne!(sample(0.0, -153.0, &selected), sample(0.0, -153.0, &idle));
            assert_eq!(sample(153.0, 0.0, &selected), sample(153.0, 0.0, &idle));
            assert_eq!(
                pick_slice(0.0, -85.0 * scale, WHEEL_INNER_RADIUS * scale),
                None
            );
            assert_eq!(
                pick_slice(0.0, -86.0 * scale, WHEEL_INNER_RADIUS * scale),
                Some(0)
            );
            // Rendering uses the same clockwise compass slots as actual input.
            for i in 0..360 {
                let a = f64::from(i).to_radians();
                let (x, y) = (153.0 * a.sin(), -153.0 * a.cos());
                let pixel = texel(x, y, scale, palette);
                if pixel.idle[3] != 0 {
                    assert_eq!(usize::from(pixel.slot), pick_slice(x, y, 0.0).unwrap());
                }
            }
        }
    }

    #[test]
    fn open_native_wheel_recolors_surface_for_every_theme() {
        let mut surface = Surface::with_theme(1.0, Theme::DefaultDark);
        let mut selection = [0.0; 8];
        selection[0] = 1.0;

        for theme in [
            Theme::DefaultLight,
            Theme::DefaultDark,
            Theme::Latte,
            Theme::Frappe,
            Theme::Macchiato,
            Theme::Mocha,
        ] {
            surface.refresh_to(1.0, theme);
            assert_eq!(surface.theme, theme);

            let mut pixels: HashMap<(i32, i32), [u8; 4]> = HashMap::new();
            surface.paint(&selection, |x, y, rgba| {
                pixels.insert((x, y), rgba);
            });

            let palette = theme.palette();
            // Hub center pixel should match theme palette hub
            let hub_pixel = pixels.get(&(0, 0)).expect("hub pixel at 0,0");
            assert_eq!(&hub_pixel[..3], &palette.hub);

            // Selected arc point at north
            let arc_pixel = pixels.get(&(0, -217)).expect("arc pixel at 0,-217");
            assert_eq!(&arc_pixel[..3], &palette.accent);
        }
    }
}
