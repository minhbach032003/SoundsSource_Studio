pub struct ModelPricing;

impl ModelPricing {
    /// Computes estimated USD cost based on model tier and token usage.
    pub fn cost_usd(
        model: Option<&str>,
        input_tokens: u64,
        output_tokens: u64,
        cache_create_tokens: u64,
        cache_read_tokens: u64,
    ) -> f64 {
        let lowered = model.unwrap_or("").to_ascii_lowercase();
        let (input_rate, output_rate) = if lowered.contains("haiku") {
            (1.00, 5.00)
        } else if lowered.contains("opus") {
            (15.00, 75.00)
        } else {
            // Sonnet or default general models
            (3.00, 15.00)
        };

        let in_cost = (input_tokens as f64) * input_rate;
        let out_cost = (output_tokens as f64) * output_rate;
        let create_cost = (cache_create_tokens as f64) * input_rate * 1.25;
        let read_cost = (cache_read_tokens as f64) * input_rate * 0.10;

        (in_cost + out_cost + create_cost + read_cost) / 1_000_000.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pricing_calculation() {
        let cost_sonnet = ModelPricing::cost_usd(Some("claude-3-7-sonnet"), 1_000_000, 1_000_000, 0, 0);
        assert!((cost_sonnet - 18.0).abs() < 1e-4);

        let cost_opus = ModelPricing::cost_usd(Some("claude-3-opus"), 1_000_000, 0, 0, 0);
        assert!((cost_opus - 15.0).abs() < 1e-4);

        let cost_haiku = ModelPricing::cost_usd(Some("claude-3-haiku"), 1_000_000, 0, 0, 0);
        assert!((cost_haiku - 1.0).abs() < 1e-4);
    }
}
