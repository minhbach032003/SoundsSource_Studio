use std::cell::UnsafeCell;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

/// Lock-free single-producer single-consumer circular buffer.
/// Safe for real-time audio I/O threads without dynamic allocation or locks.
pub struct RingBuffer {
    capacity: usize,
    buffer: Box<[UnsafeCell<u8>]>,
    write_offset: AtomicUsize,
    read_offset: AtomicUsize,
}

unsafe impl Sync for RingBuffer {}
unsafe impl Send for RingBuffer {}

impl RingBuffer {
    /// Creates a new RingBuffer with the specified byte capacity.
    pub fn new(capacity: usize) -> Self {
        assert!(capacity > 0, "Capacity must be greater than 0");
        let mut vec = Vec::with_capacity(capacity);
        for _ in 0..capacity {
            vec.push(UnsafeCell::new(0));
        }

        Self {
            capacity,
            buffer: vec.into_boxed_slice(),
            write_offset: AtomicUsize::new(0),
            read_offset: AtomicUsize::new(0),
        }
    }

    #[inline]
    pub fn capacity(&self) -> usize {
        self.capacity
    }

    /// Number of bytes available to read.
    #[inline]
    pub fn bytes_available_for_read(&self) -> usize {
        let w = self.write_offset.load(Ordering::Acquire);
        let r = self.read_offset.load(Ordering::Acquire);
        if w >= r {
            w - r
        } else {
            self.capacity - r + w
        }
    }

    /// Number of bytes free for writing.
    #[inline]
    pub fn bytes_available_for_write(&self) -> usize {
        // Keep 1 byte empty to disambiguate full from empty
        self.capacity.saturating_sub(1 + self.bytes_available_for_read())
    }

    /// Writes data from slice into ring buffer. Returns number of bytes written.
    pub fn write(&self, data: &[u8]) -> usize {
        let available = self.bytes_available_for_write();
        let to_write = data.len().min(available);
        if to_write == 0 {
            return 0;
        }

        let mut w = self.write_offset.load(Ordering::Relaxed);
        let buf_ptr = self.buffer.as_ptr();

        for &byte in &data[..to_write] {
            unsafe {
                *(*buf_ptr.add(w)).get() = byte;
            }
            w += 1;
            if w >= self.capacity {
                w = 0;
            }
        }

        self.write_offset.store(w, Ordering::Release);
        to_write
    }

    /// Reads data from ring buffer into out slice. Returns number of bytes read.
    pub fn read(&self, out: &mut [u8]) -> usize {
        let available = self.bytes_available_for_read();
        let to_read = out.len().min(available);
        if to_read == 0 {
            return 0;
        }

        let mut r = self.read_offset.load(Ordering::Relaxed);
        let buf_ptr = self.buffer.as_ptr();

        for slot in out.iter_mut().take(to_read) {
            unsafe {
                *slot = *(*buf_ptr.add(r)).get();
            }
            r += 1;
            if r >= self.capacity {
                r = 0;
            }
        }

        self.read_offset.store(r, Ordering::Release);
        to_read
    }

    /// Clears the ring buffer by resetting indices.
    pub fn clear(&self) {
        self.write_offset.store(0, Ordering::Release);
        self.read_offset.store(0, Ordering::Release);
    }
}

pub type SharedRingBuffer = Arc<RingBuffer>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ring_buffer_write_read() {
        let rb = RingBuffer::new(16);
        let input = [1u8, 2, 3, 4, 5];
        let written = rb.write(&input);
        assert_eq!(written, 5);
        assert_eq!(rb.bytes_available_for_read(), 5);

        let mut output = [0u8; 5];
        let read = rb.read(&mut output);
        assert_eq!(read, 5);
        assert_eq!(&output, &input);
        assert_eq!(rb.bytes_available_for_read(), 0);
    }

    #[test]
    fn test_ring_buffer_wraparound() {
        let rb = RingBuffer::new(8);
        // Write 6 bytes
        assert_eq!(rb.write(&[1, 2, 3, 4, 5, 6]), 6);

        // Read 4 bytes
        let mut out = [0u8; 4];
        assert_eq!(rb.read(&mut out), 4);
        assert_eq!(out, [1, 2, 3, 4]);

        // Write 4 more bytes (wrapping around)
        assert_eq!(rb.write(&[7, 8, 9, 10]), 4);

        // Read all remaining 6 bytes
        let mut final_out = [0u8; 6];
        assert_eq!(rb.read(&mut final_out), 6);
        assert_eq!(final_out, [5, 6, 7, 8, 9, 10]);
    }
}
