use sound_core::ring_buffer::RingBuffer;

/// Lock-free stereo PCM FIFO buffer between audio decoding thread and audio output thread.
pub struct PcmQueue {
    inner: RingBuffer,
}

impl PcmQueue {
    /// Capacity measured in stereo frames (1 frame = 2 samples).
    pub fn new(capacity_frames: usize) -> Self {
        // RingBuffer reserves 1 byte to distinguish full from empty.
        // We allocate capacity + 1 sample space to hold exactly capacity_frames.
        let byte_capacity = capacity_frames * 2 * std::mem::size_of::<f32>() + std::mem::size_of::<f32>();
        Self {
            inner: RingBuffer::new(byte_capacity),
        }
    }

    /// Push stereo interleaved f32 samples. Drops overflow without blocking or panicking.
    /// Returns number of samples accepted.
    pub fn push(&self, samples: &[f32]) -> usize {
        let mut written_samples = 0;
        // Process in stack chunks to avoid allocation
        let mut byte_chunk = [0u8; 1024];
        let chunk_sample_cap = byte_chunk.len() / std::mem::size_of::<f32>();

        for chunk in samples.chunks(chunk_sample_cap) {
            // Ring buffer cắt theo byte. Chỉ đưa cho nó trọn mẫu, nếu không một f32 bị
            // cắt đôi ở mép và mọi mẫu sau đều lệch byte — loa chỉ còn ra tiếng rè.
            let room = self.inner.bytes_available_for_write() / std::mem::size_of::<f32>();
            let take = chunk.len().min(room);
            if take == 0 {
                break;
            }
            for (i, &sample) in chunk[..take].iter().enumerate() {
                let bytes = sample.to_ne_bytes();
                byte_chunk[i * 4..(i + 1) * 4].copy_from_slice(&bytes);
            }

            let byte_len = take * std::mem::size_of::<f32>();
            let accepted_bytes = self.inner.write(&byte_chunk[..byte_len]);
            written_samples += accepted_bytes / std::mem::size_of::<f32>();

            if accepted_bytes < byte_len || take < chunk.len() {
                break;
            }
        }

        written_samples
    }

    /// Pop stereo interleaved f32 samples. If starved (underrun), remaining samples are filled with 0.0 (silence).
    /// Returns number of valid samples read.
    pub fn pop(&self, out: &mut [f32]) -> usize {
        let mut read_samples = 0;
        let mut byte_chunk = [0u8; 1024];
        let chunk_sample_cap = byte_chunk.len() / std::mem::size_of::<f32>();

        for chunk in out.chunks_mut(chunk_sample_cap) {
            // Cũng vậy khi đọc: lấy lẻ byte sẽ bỏ lại nửa mẫu cho lần sau.
            let have = self.inner.bytes_available_for_read() / std::mem::size_of::<f32>();
            let take = chunk.len().min(have);
            if take == 0 {
                break;
            }
            let byte_len = take * std::mem::size_of::<f32>();
            let bytes_read = self.inner.read(&mut byte_chunk[..byte_len]);
            let samples_read = bytes_read / std::mem::size_of::<f32>();

            for i in 0..samples_read {
                let mut b = [0u8; 4];
                b.copy_from_slice(&byte_chunk[i * 4..(i + 1) * 4]);
                chunk[i] = f32::from_ne_bytes(b);
            }

            read_samples += samples_read;
            if samples_read < chunk.len() {
                break;
            }
        }

        // If total read samples was less than out.len(), fill the remainder with 0.0
        if read_samples < out.len() {
            out[read_samples..].fill(0.0);
        }

        read_samples
    }

    pub fn clear(&self) {
        self.inner.clear();
    }

    /// Available samples to read.
    pub fn available(&self) -> usize {
        self.inner.bytes_available_for_read() / std::mem::size_of::<f32>()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn queue_drops_overflow_and_pads_underrun_with_silence() {
        let q = PcmQueue::new(4); // 4 frame = 8 sample
        assert_eq!(q.push(&[1.0; 16]), 8, "đầy thì bỏ phần dư, không panic");
        let mut out = [9.9f32; 12];
        assert_eq!(q.pop(&mut out), 8);
        assert_eq!(&out[..8], &[1.0; 8]);
        assert_eq!(&out[8..], &[0.0; 4], "underrun phải là im lặng, không phải rác");
        q.clear();
        assert_eq!(q.available(), 0);
    }

    #[test]
    fn filling_the_queue_never_splits_a_sample_across_the_boundary() {
        // Ring buffer đếm theo byte và giữ lại 1 byte để phân biệt đầy/rỗng, nên chỗ
        // trống không phải bội số của 4. Ghi tràn mà cắt giữa một f32 thì mọi mẫu sau
        // đều lệch byte và loa chỉ ra tiếng rè.
        let q = PcmQueue::new(4);
        let first: Vec<f32> = (1..=16).map(|v| v as f32).collect();
        let accepted = q.push(&first);
        assert_eq!(accepted % 2, 0, "phải nhận trọn khung stereo");

        let mut out = vec![0.0f32; accepted];
        assert_eq!(q.pop(&mut out), accepted);
        assert_eq!(out, first[..accepted], "vòng đầu phải ra đúng mẫu đã ghi");

        // Vòng hai là nơi lệch byte lộ ra: nó đọc tiếp từ chỗ mẫu bị cắt dở.
        let second: Vec<f32> = (101..=116).map(|v| v as f32).collect();
        let accepted = q.push(&second);
        let mut out = vec![0.0f32; accepted];
        assert_eq!(q.pop(&mut out), accepted);
        assert_eq!(out, second[..accepted], "vòng sau vẫn phải nguyên vẹn, không lệch byte");
    }
}
