pub const WHEEL_INNER_RADIUS: f64 = 86.0;

pub const DIRECTIONS: [&str; 8] = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

pub const DIRECTION_LABELS: [&str; 8] = [
    "North",
    "North-East",
    "East",
    "South-East",
    "South",
    "South-West",
    "West",
    "North-West",
];

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PointF {
    pub x: f64,
    pub y: f64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Point {
    pub x: i32,
    pub y: i32,
}

/// Clockwise wheel slice index from north (0..8: N, NE, E, SE, S, SW, W, NW),
/// or None inside the dead zone or for invalid floating point inputs.
pub fn pick_slice(dx: f64, dy: f64, dead_zone: f64) -> Option<usize> {
    if !dx.is_finite() || !dy.is_finite() || !dead_zone.is_finite() || dead_zone < 0.0 {
        return None;
    }
    if dx.hypot(dy) < dead_zone {
        return None;
    }
    let degrees = ((dy.atan2(dx).to_degrees() + 90.0 + 22.5 + 360.0) % 360.0).floor();
    Some((degrees / 45.0) as usize % 8)
}

pub fn select_slot(origin: Point, current: Point, dead_zone: f64) -> Option<usize> {
    let dx = current.x as f64 - origin.x as f64;
    let dy = current.y as f64 - origin.y as f64;
    pick_slice(dx, dy, dead_zone)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_dead_zone_returns_none() {
        assert_eq!(pick_slice(0.0, 0.0, 50.0), None);
        assert_eq!(pick_slice(10.0, 10.0, 50.0), None);
        assert_eq!(pick_slice(30.0, 30.0, 50.0), None); // hypot(30, 30) = ~42.4 < 50
    }

    #[test]
    fn test_cardinal_directions() {
        let r = 100.0;
        let dead = 50.0;
        // North is screen-up (dy < 0)
        assert_eq!(pick_slice(0.0, -r, dead), Some(0)); // N
        assert_eq!(pick_slice(r, 0.0, dead), Some(2));  // E
        assert_eq!(pick_slice(0.0, r, dead), Some(4));  // S
        assert_eq!(pick_slice(-r, 0.0, dead), Some(6)); // W
    }

    #[test]
    fn test_diagonal_directions() {
        let r = 100.0;
        let dead = 50.0;
        assert_eq!(pick_slice(r, -r, dead), Some(1));  // NE
        assert_eq!(pick_slice(r, r, dead), Some(3));   // SE
        assert_eq!(pick_slice(-r, r, dead), Some(5));  // SW
        assert_eq!(pick_slice(-r, -r, dead), Some(7)); // NW
    }

    #[test]
    fn test_nan_or_infinite_returns_none() {
        assert_eq!(pick_slice(f64::NAN, 100.0, 50.0), None);
        assert_eq!(pick_slice(100.0, f64::INFINITY, 50.0), None);
        assert_eq!(pick_slice(100.0, 100.0, -10.0), None);
    }
}
