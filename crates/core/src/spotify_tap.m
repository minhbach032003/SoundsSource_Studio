#import <Foundation/Foundation.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreAudio/CATapDescription.h>
#import <CoreAudio/AudioHardwareTapping.h>
#include <stdatomic.h>
#include <math.h>

// One private aggregate combines the Spotify-only tap and the current output.
// Never change the system default device. MutedWhenTapped restores direct audio
// when the IOProc stops, including if rust-sound crashes.
typedef void (*RSProcessor)(void *, float *, unsigned, double);

// Which step of rs_spotify_tap_start failed, so an OSStatus is never ambiguous.
enum {
    RS_STAGE_OK = 0, RS_STAGE_UNSUPPORTED_OS = 1, RS_STAGE_NO_PROCESS = 2, RS_STAGE_ALLOC = 3,
    RS_STAGE_CREATE_TAP = 4, RS_STAGE_TAP_FORMAT = 5, RS_STAGE_TAP_FORMAT_INVALID = 6,
    RS_STAGE_OUTPUT_UID = 7, RS_STAGE_OUTPUT_FORMAT = 8, RS_STAGE_CREATE_AGGREGATE = 9,
    RS_STAGE_AGGREGATE_FORMAT = 10, RS_STAGE_AGGREGATE_FORMAT_INVALID = 11,
    RS_STAGE_CREATE_IOPROC = 12, RS_STAGE_START = 13,
};

// The tap is fixed at its own rate (read-only); the output device may run at any
// rate it supports, so the IOProc resamples between them. 8192 frames absorbs
// jitter between the two sides of one aggregate callback.
typedef struct {
    AudioObjectID tap;
    AudioDeviceID device;
    AudioDeviceIOProcID io;
    RSProcessor process;
    void *context;
    double rate;
    unsigned outChannels;
    _Atomic unsigned long long frames;
    float scratch[32768];
} RSSpotifyTap;

static OSStatus rs_io(AudioObjectID device, const AudioTimeStamp *now,
    const AudioBufferList *input, const AudioTimeStamp *inputTime,
    AudioBufferList *output, const AudioTimeStamp *outputTime, void *context) {
    (void)device; (void)now; (void)inputTime; (void)outputTime;
    RSSpotifyTap *s = context;
    if (!input || !output) return noErr;
    for (unsigned b = 0; b < output->mNumberBuffers; b++)
        if (output->mBuffers[b].mData)
            memset(output->mBuffers[b].mData, 0, output->mBuffers[b].mDataByteSize);
    if (!input->mNumberBuffers || !output->mNumberBuffers) return noErr;
    const AudioBuffer *first = &input->mBuffers[0];
    bool planar = first->mNumberChannels == 1 && input->mNumberBuffers == 2;
    if ((!planar && (input->mNumberBuffers != 1 || first->mNumberChannels != 2)) || !first->mData) return noErr;
    unsigned frames = first->mDataByteSize / (sizeof(float) * (planar ? 1 : 2));
    if (!frames || frames > 16384) return noErr;
    if (planar && (!input->mBuffers[1].mData || input->mBuffers[1].mDataByteSize < frames * sizeof(float))) return noErr;
    // The aggregate hands the tap over at its own rate, one input frame per output
    // frame, so this never rate-converts. Only the channel layout differs.
    bool outPlanar = output->mNumberBuffers == 2 && output->mBuffers[0].mNumberChannels == 1 && output->mBuffers[1].mNumberChannels == 1;
    unsigned outChannels = outPlanar ? 2 : output->mNumberBuffers == 1 ? output->mBuffers[0].mNumberChannels : 0;
    if (!outChannels) return noErr;
    for (unsigned b = 0; b < output->mNumberBuffers; b++) {
        unsigned ch = outPlanar ? 1 : outChannels;
        if (!output->mBuffers[b].mData || output->mBuffers[b].mDataByteSize < frames * sizeof(float) * ch) return noErr;
    }
    if (planar) {
        const float *l = first->mData, *r = input->mBuffers[1].mData;
        for (unsigned i = 0; i < frames; i++) { s->scratch[i*2] = l[i]; s->scratch[i*2+1] = r[i]; }
    } else memcpy(s->scratch, first->mData, frames * 2 * sizeof(float));
    s->process(s->context, s->scratch, frames * 2, s->rate);
    if (outPlanar) {
        float *l = output->mBuffers[0].mData, *r = output->mBuffers[1].mData;
        for (unsigned i = 0; i < frames; i++) { l[i] = s->scratch[i*2]; r[i] = s->scratch[i*2+1]; }
    } else if (outChannels == 1) {
        float *m = output->mBuffers[0].mData;
        for (unsigned i = 0; i < frames; i++) m[i] = (s->scratch[i*2] + s->scratch[i*2+1]) * 0.5f;
    } else if (outChannels == 2) {
        memcpy(output->mBuffers[0].mData, s->scratch, frames * 2 * sizeof(float));
    } else {
        // Surround or HDMI: feed the first pair, leave the rest of the frame silent.
        float *out = output->mBuffers[0].mData;
        for (unsigned i = 0; i < frames; i++) {
            out[i*outChannels] = s->scratch[i*2];
            out[i*outChannels+1] = s->scratch[i*2+1];
        }
    }
    atomic_fetch_add_explicit(&s->frames, frames, memory_order_relaxed);
    return noErr;
}

void rs_spotify_tap_stop(RSSpotifyTap *s) {
    if (!s) return;
    if (s->io) { AudioDeviceStop(s->device, s->io); AudioDeviceDestroyIOProcID(s->device, s->io); }
    if (s->device) AudioHardwareDestroyAggregateDevice(s->device);
    if (s->tap) AudioHardwareDestroyProcessTap(s->tap);
    free(s);
}

unsigned long long rs_spotify_tap_frames(RSSpotifyTap *s) {
    return atomic_load_explicit(&s->frames, memory_order_relaxed);
}

unsigned rs_default_output(void) {
    AudioDeviceID device = 0;
    UInt32 size = sizeof(device);
    AudioObjectPropertyAddress a = {kAudioHardwarePropertyDefaultOutputDevice, kAudioObjectPropertyScopeGlobal, 0};
    AudioObjectGetPropertyData(kAudioObjectSystemObject, &a, 0, NULL, &size, &device);
    return device;
}

unsigned rs_spotify_processes(unsigned *result, unsigned capacity) {
    @autoreleasepool {
        AudioObjectPropertyAddress a = {kAudioHardwarePropertyProcessObjectList, kAudioObjectPropertyScopeGlobal, 0};
        UInt32 size = 0;
        if (AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &a, 0, NULL, &size) != noErr) return 0;
        AudioObjectID *ids = malloc(size);
        if (!ids) return 0;
        unsigned count = 0;
        if (AudioObjectGetPropertyData(kAudioObjectSystemObject, &a, 0, NULL, &size, ids) == noErr) {
            for (unsigned i = 0; i < size / sizeof(*ids) && count < capacity; i++) {
                AudioObjectPropertyAddress bundle = {kAudioProcessPropertyBundleID, kAudioObjectPropertyScopeGlobal, 0};
                CFStringRef value = NULL;
                UInt32 bytes = sizeof(value);
                if (AudioObjectGetPropertyData(ids[i], &bundle, 0, NULL, &bytes, &value) == noErr && value) {
                    NSString *name = CFBridgingRelease(value);
                    if ([name isEqualToString:@"com.spotify.client"] || [name hasPrefix:@"com.spotify.client."])
                        result[count++] = ids[i];
                }
            }
        }
        free(ids);
        return count;
    }
}

void rs_spotify_tap_output_format(RSSpotifyTap *s, double *rate, unsigned *channels) {
    if (!s) return;
    if (rate) *rate = s->rate;
    if (channels) *channels = s->outChannels;
}

RSSpotifyTap *rs_spotify_tap_start(const unsigned *processes, unsigned count,
    RSProcessor process, void *context, int *error, int *stage) {
    @autoreleasepool {
        *error = -1;
        *stage = RS_STAGE_UNSUPPORTED_OS;
        if (@available(macOS 14.2, *)) {
            *stage = RS_STAGE_NO_PROCESS;
            if (!count || !process) return NULL;
            *stage = RS_STAGE_ALLOC;
            RSSpotifyTap *s = calloc(1, sizeof(*s));
            if (!s) return NULL;
            s->process = process; s->context = context;
            NSMutableArray *ids = [NSMutableArray array];
            for (unsigned i = 0; i < count; i++) [ids addObject:@(processes[i])];
            CATapDescription *desc = [[CATapDescription alloc] initStereoMixdownOfProcesses:ids];
            desc.name = @"rust-sound Spotify";
            desc.private = YES;
            desc.muteBehavior = CATapMutedWhenTapped;
            NSString *outputUID = nil;
            NSDictionary *config = nil;
            *stage = RS_STAGE_CREATE_TAP;
            OSStatus status = AudioHardwareCreateProcessTap(desc, &s->tap);
            if (status != noErr) goto fail;
            AudioStreamBasicDescription format = {0};
            UInt32 size = sizeof(format);
            AudioObjectPropertyAddress a = {kAudioTapPropertyFormat, kAudioObjectPropertyScopeGlobal, 0};
            *stage = RS_STAGE_TAP_FORMAT;
            status = AudioObjectGetPropertyData(s->tap, &a, 0, NULL, &size, &format);
            if (status != noErr) goto fail;
            // The tap format is read-only, so this is the one format we cannot adapt to.
            *stage = RS_STAGE_TAP_FORMAT_INVALID;
            if (format.mFormatID != kAudioFormatLinearPCM || !(format.mFormatFlags & kAudioFormatFlagIsFloat) || format.mBitsPerChannel != 32 || format.mChannelsPerFrame != 2) { status = kAudioDeviceUnsupportedFormatError; goto fail; }
            AudioDeviceID out = rs_default_output();
            CFStringRef uid = NULL;
            size = sizeof(uid);
            a.mSelector = kAudioDevicePropertyDeviceUID;
            *stage = RS_STAGE_OUTPUT_UID;
            status = AudioObjectGetPropertyData(out, &a, 0, NULL, &size, &uid);
            if (status != noErr || !uid) goto fail;
            outputUID = CFBridgingRelease(uid);

            AudioStreamBasicDescription outDevFormat = {0};
            size = sizeof(outDevFormat);
            a = (AudioObjectPropertyAddress){kAudioDevicePropertyStreamFormat, kAudioObjectPropertyScopeOutput, 0};
            *stage = RS_STAGE_OUTPUT_FORMAT;
            status = AudioObjectGetPropertyData(out, &a, 0, NULL, &size, &outDevFormat);
            if (status != noErr) goto fail;
            unsigned outChannels = outDevFormat.mChannelsPerFrame > 0 ? outDevFormat.mChannelsPerFrame : 2;

            config = @{
                @kAudioAggregateDeviceNameKey: @"rust-sound Spotify DSP",
                @kAudioAggregateDeviceUIDKey: NSUUID.UUID.UUIDString,
                @kAudioAggregateDeviceIsPrivateKey: @YES,
                @kAudioAggregateDeviceMainSubDeviceKey: outputUID,
                @kAudioAggregateDeviceSubDeviceListKey: @[@{
                    @kAudioSubDeviceUIDKey: outputUID,
                    @kAudioSubDeviceInputChannelsKey: @0,
                    @kAudioSubDeviceOutputChannelsKey: @(outChannels)
                }],
                @kAudioAggregateDeviceTapListKey: @[@{
                    @kAudioSubTapUIDKey: desc.UUID.UUIDString,
                    @kAudioSubTapDriftCompensationKey: @YES
                }],
                @kAudioAggregateDeviceTapAutoStartKey: @YES
            };
            *stage = RS_STAGE_CREATE_AGGREGATE;
            status = AudioHardwareCreateAggregateDevice((__bridge CFDictionaryRef)config, &s->device);
            if (status != noErr) goto fail;
            // CoreAudio never rate-converts the tap into the aggregate, and a device
            // may not support the tap's rate at all, so rs_io resamples instead.
            a = (AudioObjectPropertyAddress){kAudioDevicePropertyStreamFormat, kAudioObjectPropertyScopeOutput, 0};
            size = sizeof(format);
            *stage = RS_STAGE_AGGREGATE_FORMAT;
            status = AudioObjectGetPropertyData(s->device, &a, 0, NULL, &size, &format);
            if (status != noErr) goto fail;
            *stage = RS_STAGE_AGGREGATE_FORMAT_INVALID;
            if (format.mFormatID != kAudioFormatLinearPCM || !(format.mFormatFlags & kAudioFormatFlagIsFloat) || format.mBitsPerChannel != 32 || format.mChannelsPerFrame < 1) { status = kAudioDeviceUnsupportedFormatError; goto fail; }
            s->rate = format.mSampleRate > 0 ? format.mSampleRate : outDevFormat.mSampleRate;
            s->outChannels = format.mChannelsPerFrame;
            *stage = RS_STAGE_CREATE_IOPROC;
            status = AudioDeviceCreateIOProcID(s->device, rs_io, s, &s->io);
            if (status != noErr) goto fail;
            *stage = RS_STAGE_START;
            status = AudioDeviceStart(s->device, s->io);
            if (status != noErr) goto fail;
            *error = 0;
            *stage = RS_STAGE_OK;
            return s;
        fail:
            *error = status ? status : -1;
            rs_spotify_tap_stop(s);
        }
        return NULL;
    }
}
