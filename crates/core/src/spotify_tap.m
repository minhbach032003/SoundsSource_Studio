#import <Foundation/Foundation.h>
#import <CoreAudio/CoreAudio.h>
#import <CoreAudio/CATapDescription.h>
#import <CoreAudio/AudioHardwareTapping.h>
#include <stdatomic.h>

// One private aggregate combines the Spotify-only tap and the current output.
// Never change the system default device. MutedWhenTapped restores direct audio
// when the IOProc stops, including if rust-sound crashes.
typedef void (*RSProcessor)(void *, float *, unsigned, double);
typedef struct {
    AudioObjectID tap;
    AudioDeviceID device;
    AudioDeviceIOProcID io;
    RSProcessor process;
    void *context;
    double rate;
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
    // The output must be stereo Float32, interleaved or two mono planes.
    bool outPlanar = output->mNumberBuffers == 2 && output->mBuffers[0].mNumberChannels == 1 && output->mBuffers[1].mNumberChannels == 1;
    if (!outPlanar && (output->mNumberBuffers != 1 || output->mBuffers[0].mNumberChannels != 2)) return noErr;
    for (unsigned b = 0; b < output->mNumberBuffers; b++)
        if (!output->mBuffers[b].mData || output->mBuffers[b].mDataByteSize < frames * sizeof(float) * (outPlanar ? 1 : 2)) return noErr;
    if (planar) {
        const float *l = first->mData, *r = input->mBuffers[1].mData;
        for (unsigned i = 0; i < frames; i++) { s->scratch[i*2] = l[i]; s->scratch[i*2+1] = r[i]; }
    } else memcpy(s->scratch, first->mData, frames * 2 * sizeof(float));
    s->process(s->context, s->scratch, frames * 2, s->rate);
    if (outPlanar) {
        float *l = output->mBuffers[0].mData, *r = output->mBuffers[1].mData;
        for (unsigned i = 0; i < frames; i++) { l[i] = s->scratch[i*2]; r[i] = s->scratch[i*2+1]; }
    } else memcpy(output->mBuffers[0].mData, s->scratch, frames * 2 * sizeof(float));
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

RSSpotifyTap *rs_spotify_tap_start(const unsigned *processes, unsigned count,
    RSProcessor process, void *context, int *error) {
    @autoreleasepool {
        *error = -1;
        if (@available(macOS 14.2, *)) {
            if (!count || !process) return NULL;
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
            OSStatus status = AudioHardwareCreateProcessTap(desc, &s->tap);
            if (status != noErr) goto fail;
            AudioStreamBasicDescription format = {0};
            UInt32 size = sizeof(format);
            AudioObjectPropertyAddress a = {kAudioTapPropertyFormat, kAudioObjectPropertyScopeGlobal, 0};
            status = AudioObjectGetPropertyData(s->tap, &a, 0, NULL, &size, &format);
            if (status != noErr) goto fail;
            if (format.mFormatID != kAudioFormatLinearPCM || !(format.mFormatFlags & kAudioFormatFlagIsFloat) || format.mBitsPerChannel != 32 || format.mChannelsPerFrame != 2) { status = kAudioDeviceUnsupportedFormatError; goto fail; }
            AudioDeviceID out = rs_default_output();
            CFStringRef uid = NULL;
            size = sizeof(uid);
            a.mSelector = kAudioDevicePropertyDeviceUID;
            status = AudioObjectGetPropertyData(out, &a, 0, NULL, &size, &uid);
            if (status != noErr || !uid) goto fail;
            outputUID = CFBridgingRelease(uid);
            config = @{
                @kAudioAggregateDeviceNameKey: @"rust-sound Spotify DSP",
                @kAudioAggregateDeviceUIDKey: NSUUID.UUID.UUIDString,
                @kAudioAggregateDeviceIsPrivateKey: @YES,
                @kAudioAggregateDeviceMainSubDeviceKey: outputUID,
                @kAudioAggregateDeviceSubDeviceListKey: @[@{
                    @kAudioSubDeviceUIDKey: outputUID,
                    @kAudioSubDeviceInputChannelsKey: @0,
                    @kAudioSubDeviceOutputChannelsKey: @2
                }],
                @kAudioAggregateDeviceTapListKey: @[@{
                    @kAudioSubTapUIDKey: desc.UUID.UUIDString,
                    @kAudioSubTapDriftCompensationKey: @YES
                }],
                @kAudioAggregateDeviceTapAutoStartKey: @YES
            };
            status = AudioHardwareCreateAggregateDevice((__bridge CFDictionaryRef)config, &s->device);
            if (status != noErr) goto fail;
            // Validate actual aggregate stream formats before muting the source.
            double inputRate = 0;
            for (unsigned scope = 0; scope < 2; scope++) {
                a = (AudioObjectPropertyAddress){kAudioDevicePropertyStreamFormat, scope ? kAudioObjectPropertyScopeOutput : kAudioObjectPropertyScopeInput, 0};
                size = sizeof(format);
                status = AudioObjectGetPropertyData(s->device, &a, 0, NULL, &size, &format);
                if (status != noErr) goto fail;
                if (format.mFormatID != kAudioFormatLinearPCM || !(format.mFormatFlags & kAudioFormatFlagIsFloat) || format.mBitsPerChannel != 32 || format.mChannelsPerFrame != 2) { status = kAudioDeviceUnsupportedFormatError; goto fail; }
                if (scope == 0) inputRate = format.mSampleRate;
                else if (inputRate != format.mSampleRate) { status = kAudioDeviceUnsupportedFormatError; goto fail; }
                s->rate = format.mSampleRate;
            }
            status = AudioDeviceCreateIOProcID(s->device, rs_io, s, &s->io);
            if (status != noErr) goto fail;
            status = AudioDeviceStart(s->device, s->io);
            if (status != noErr) goto fail;
            *error = 0;
            return s;
        fail:
            *error = status ? status : -1;
            rs_spotify_tap_stop(s);
        }
        return NULL;
    }
}
