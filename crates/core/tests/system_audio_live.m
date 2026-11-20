// Opt-in native routing probe: play quiet audio in another app before running.
// clang -fobjc-arc -framework Foundation -framework CoreAudio crates/core/tests/system_audio_live.m -o /tmp/system-audio-live
#import "../src/spotify_tap.m"
#include <assert.h>
#include <stdio.h>

static void keep_signal(void *context, float *samples, unsigned count, double rate) {
    unsigned long long *processed = context;
    *processed += count / 2;
}

static void discard_signal(void *context, float *samples, unsigned count, double rate) {
    memset(samples, 0, count * sizeof(float));
}

static unsigned object_count(AudioObjectPropertySelector selector) {
    AudioObjectPropertyAddress a = {selector, kAudioObjectPropertyScopeGlobal, 0};
    UInt32 size = 0;
    assert(AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &a, 0, NULL, &size) == noErr);
    return size / sizeof(AudioObjectID);
}

int main(void) {
    unsigned output = rs_default_output();
    unsigned taps = object_count(kAudioHardwarePropertyTapList);
    unsigned devices = object_count(kAudioHardwarePropertyDevices);
    for (unsigned cycle = 0; cycle < 3; cycle++) {
        int error = 0, stage = 0;
        unsigned long long processed = 0;
        RSSpotifyTap *tap = rs_system_tap_start(keep_signal, &processed, &error, &stage);
        if (!tap) {
            printf("cycle=%u startup_error=%d stage=%d default_unchanged=%d\n", cycle, error, stage, output == rs_default_output());
            return 1;
        }
        usleep(200000);
        AudioDeviceStop(tap->device, tap->io);
        printf("cycle=%u observed_signal=%d rendered_frames=%llu signal_frames=%llu dsp_frames=%llu default_unchanged=%d\n",
            cycle, atomic_load(&tap->observedSignal), rs_spotify_tap_frames(tap), atomic_load(&tap->signalFrames), processed, output == rs_default_output());
        assert(rs_spotify_tap_frames(tap) > 0 && atomic_load(&tap->signalFrames) > 0);
        assert(!atomic_load(&tap->monitoring));
        rs_spotify_tap_stop(tap);
        assert(output == rs_default_output());
    }

    int render_error = 0, render_stage = 0;
    RSSpotifyTap *failed_render = rs_system_tap_start(discard_signal, NULL, &render_error, &render_stage);
    assert(!failed_render && render_stage == RS_STAGE_NO_RENDER);
    assert(output == rs_default_output());

    AudioObjectPropertyAddress list = {kAudioHardwarePropertyProcessObjectList, kAudioObjectPropertyScopeGlobal, 0};
    UInt32 size = 0;
    assert(AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &list, 0, NULL, &size) == noErr);
    AudioObjectID *ids = malloc(size);
    assert(ids);
    assert(AudioObjectGetPropertyData(kAudioObjectSystemObject, &list, 0, NULL, &size, ids) == noErr);
    int error = 0, stage = 0;
    unsigned long long processed = 0;
    RSSpotifyTap *empty = rs_tap_start(ids, size / sizeof(*ids), true, keep_signal, &processed, &error, &stage);
    free(ids);
    assert(!empty && stage == RS_STAGE_NO_SIGNAL && processed == 0);
    assert(output == rs_default_output());
    for (unsigned attempt = 0; attempt < 50 && object_count(kAudioHardwarePropertyTapList) != taps; attempt++) usleep(10000);
    printf("no_signal_stage=%d post_mute_failure_stage=%d default_unchanged=1 taps_before=%u after=%u devices_before=%u after=%u\n",
        stage, render_stage, taps, object_count(kAudioHardwarePropertyTapList), devices, object_count(kAudioHardwarePropertyDevices));
    assert(object_count(kAudioHardwarePropertyTapList) == taps);
    assert(object_count(kAudioHardwarePropertyDevices) == devices);
    return 0;
}
