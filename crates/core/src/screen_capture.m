// One JPEG of the main display, captured in-process and scaled down while encoding.
//
// The video call used to shell out to /usr/sbin/screencapture once a second: a process
// spawn, a full-resolution capture, a JPEG written to /tmp, read back, then base64'd
// across IPC — several megabytes a second to produce a frame the webview immediately
// scales to 1280px and re-encodes.
//
// ImageIO scales during encode via kCGImageDestinationImageMaxPixelSize, so the bytes
// that cross the IPC boundary are already the size the uplink wants. Nothing touches the
// disk, and the TCC check lands on this app rather than on a child process.

#import <CoreFoundation/CoreFoundation.h>
#import <CoreGraphics/CoreGraphics.h>
#import <ImageIO/ImageIO.h>
#include <dlfcn.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>

typedef CGImageRef (*rs_CGDisplayCreateImageFunc)(CGDirectDisplayID);

static CGImageRef rs_create_display_image(CGDirectDisplayID display_id) {
    static rs_CGDisplayCreateImageFunc func = NULL;
    static dispatch_once_t once;
    dispatch_once(&once, ^{
        func = (rs_CGDisplayCreateImageFunc)dlsym(RTLD_DEFAULT, "CGDisplayCreateImage");
    });
    return func ? func(display_id) : NULL;
}

// Returns malloc'd JPEG bytes and writes the length to out_len, or NULL on failure.
// The caller owns the buffer and must pass it to rs_screen_free.
unsigned char *rs_capture_main_display_jpeg(size_t max_pixel_size,
                                            double quality,
                                            size_t *out_len) {
    if (out_len == NULL) {
        return NULL;
    }
    *out_len = 0;

    // Returns NULL when Screen Recording has not been granted, which is the same signal
    // as any other failure here; the Rust side turns it into an error the UI explains.
    CGImageRef image = rs_create_display_image(CGMainDisplayID());
    if (image == NULL) {
        return NULL;
    }

    CFMutableDataRef data = CFDataCreateMutable(kCFAllocatorDefault, 0);
    if (data == NULL) {
        CGImageRelease(image);
        return NULL;
    }

    // The UTI by name, so this does not pull in CoreServices for a deprecated constant.
    CGImageDestinationRef destination =
        CGImageDestinationCreateWithData(data, CFSTR("public.jpeg"), 1, NULL);
    if (destination == NULL) {
        CFRelease(data);
        CGImageRelease(image);
        return NULL;
    }

    CFMutableDictionaryRef options = CFDictionaryCreateMutable(
        kCFAllocatorDefault, 2, &kCFTypeDictionaryKeyCallBacks, &kCFTypeDictionaryValueCallBacks);
    if (options != NULL) {
        double clamped_quality = quality;
        if (clamped_quality < 0.1) clamped_quality = 0.1;
        if (clamped_quality > 1.0) clamped_quality = 1.0;
        CFNumberRef quality_value =
            CFNumberCreate(kCFAllocatorDefault, kCFNumberDoubleType, &clamped_quality);
        if (quality_value != NULL) {
            CFDictionarySetValue(options, kCGImageDestinationLossyCompressionQuality, quality_value);
            CFRelease(quality_value);
        }
        if (max_pixel_size > 0) {
            // The longest edge of the result. A Retina display captures at thousands of
            // pixels wide; the uplink never sends more than ~1280.
            int max_edge = (int)max_pixel_size;
            CFNumberRef size_value =
                CFNumberCreate(kCFAllocatorDefault, kCFNumberIntType, &max_edge);
            if (size_value != NULL) {
                CFDictionarySetValue(options, kCGImageDestinationImageMaxPixelSize, size_value);
                CFRelease(size_value);
            }
        }
    }

    CGImageDestinationAddImage(destination, image, options);
    bool finalized = CGImageDestinationFinalize(destination);

    if (options != NULL) {
        CFRelease(options);
    }
    CFRelease(destination);
    CGImageRelease(image);

    if (!finalized) {
        CFRelease(data);
        return NULL;
    }

    CFIndex length = CFDataGetLength(data);
    if (length <= 0) {
        CFRelease(data);
        return NULL;
    }

    unsigned char *buffer = (unsigned char *)malloc((size_t)length);
    if (buffer == NULL) {
        CFRelease(data);
        return NULL;
    }
    memcpy(buffer, CFDataGetBytePtr(data), (size_t)length);
    CFRelease(data);

    *out_len = (size_t)length;
    return buffer;
}

void rs_screen_free(unsigned char *ptr) {
    if (ptr != NULL) {
        free(ptr);
    }
}
