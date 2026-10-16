// Runs the real native IOProc without devices, permissions, or Spotify playback.
#import "../src/spotify_tap.m"
#include <assert.h>
#include <math.h>
// The EQ is handed the rate the buffers actually arrive at, which is the
// aggregate's rate, not the tap's read-only 48 kHz descriptor.
static double seenRate = 0;
static void halve(void *context, float *samples, unsigned count, double rate) {
    seenRate = rate;
    for (unsigned i = 0; i < count; i++) samples[i] *= 0.5f;
}
int main(void) {
    RSSpotifyTap *s = calloc(1, sizeof(*s));
    s->process = halve; s->rate = 48000;
    float stereo[] = {0.2, -0.4, 0.6, -0.8};
    float result[4] = {0};
    AudioBufferList input = {.mNumberBuffers=1, .mBuffers={{2, sizeof(stereo), stereo}}};
    AudioBufferList output = {.mNumberBuffers=1, .mBuffers={{2, sizeof(result), result}}};
    rs_io(0, NULL, &input, NULL, &output, NULL, s);
    assert(seenRate == 48000);
    for (unsigned i=0; i<4; i++) assert(fabsf(result[i] - stereo[i] * 0.5f) < 0.00001f);
    assert(rs_spotify_tap_frames(s) == 2);
    float l[] = {0.2, 0.6}, r[] = {-0.4, -0.8}, ol[2], or[2];
    struct { UInt32 mNumberBuffers; AudioBuffer mBuffers[2]; } planarIn = {2, {{1,sizeof(l),l},{1,sizeof(r),r}}},
        planarOut = {2, {{1,sizeof(ol),ol},{1,sizeof(or),or}}};
    rs_io(0, NULL, (AudioBufferList *)&planarIn, NULL, (AudioBufferList *)&planarOut, NULL, s);
    for (unsigned i=0; i<2; i++) { assert(fabsf(ol[i]-l[i]*0.5f)<0.00001f); assert(fabsf(or[i]-r[i]*0.5f)<0.00001f); }
    assert(rs_spotify_tap_frames(s) == 4);
    // Reject undersized buffers instead of overrunning memory or reporting success.
    planarIn.mBuffers[1].mDataByteSize = 0;
    rs_io(0, NULL, (AudioBufferList *)&planarIn, NULL, (AudioBufferList *)&planarOut, NULL, s);
    assert(rs_spotify_tap_frames(s) == 4);
    for (unsigned i=0; i<2; i++) { assert(ol[i]==0); assert(or[i]==0); }

    // Mono output downmixing
    float monoOut[2] = {0};
    AudioBufferList monoOutBuf = {.mNumberBuffers=1, .mBuffers={{1, sizeof(monoOut), monoOut}}};
    s->outChannels = 1;
    rs_io(0, NULL, &input, NULL, &monoOutBuf, NULL, s);
    assert(fabsf(monoOut[0] - (stereo[0]*0.5f + stereo[1]*0.5f)*0.5f) < 0.00001f);
    assert(fabsf(monoOut[1] - (stereo[2]*0.5f + stereo[3]*0.5f)*0.5f) < 0.00001f);
    assert(rs_spotify_tap_frames(s) == 6);
    s->outChannels = 2;

    // A 16 kHz mono HFP headset: the aggregate still delivers one input frame per
    // output frame, so only the channel layout changes. Measured in/out == 1.0000.
    RSSpotifyTap *hfp = calloc(1, sizeof(*hfp));
    hfp->process = halve; hfp->rate = 16000; hfp->outChannels = 1;
    static float flat[512*2], mono[512];
    for (unsigned i = 0; i < 512; i++) { flat[i*2] = 0.5f; flat[i*2+1] = -0.25f; }
    AudioBufferList flatIn = {.mNumberBuffers=1, .mBuffers={{2, sizeof(flat), flat}}};
    AudioBufferList monoDevice = {.mNumberBuffers=1, .mBuffers={{1, sizeof(mono), mono}}};
    rs_io(0, NULL, &flatIn, NULL, &monoDevice, NULL, hfp);
    assert(seenRate == 16000);
    assert(rs_spotify_tap_frames(hfp) == 512);
    for (unsigned i = 0; i < 512; i++) assert(fabsf(mono[i] - 0.0625f) < 0.00001f); // (0.25 + -0.125)/2
    free(hfp);

    // Surround or HDMI: the first pair carries audio, the rest of the frame is silent.
    RSSpotifyTap *surround = calloc(1, sizeof(*surround));
    surround->process = halve; surround->rate = 48000; surround->outChannels = 6;
    static float six[512*6];
    AudioBufferList surroundOut = {.mNumberBuffers=1, .mBuffers={{6, sizeof(six), six}}};
    rs_io(0, NULL, &flatIn, NULL, &surroundOut, NULL, surround);
    for (unsigned i = 0; i < 512; i++) {
        assert(fabsf(six[i*6] - 0.25f) < 0.00001f);
        assert(fabsf(six[i*6+1] + 0.125f) < 0.00001f);
        for (unsigned c = 2; c < 6; c++) assert(six[i*6+c] == 0.0f);
    }
    free(surround);

    // An output buffer too small for the input must stay silent, never overrun.
    RSSpotifyTap *tight = calloc(1, sizeof(*tight));
    tight->process = halve; tight->rate = 48000; tight->outChannels = 2;
    static float small[8];
    AudioBufferList smallOut = {.mNumberBuffers=1, .mBuffers={{2, sizeof(small), small}}};
    rs_io(0, NULL, &flatIn, NULL, &smallOut, NULL, tight);
    assert(rs_spotify_tap_frames(tight) == 0);
    for (unsigned i = 0; i < 8; i++) assert(small[i] == 0.0f);
    free(tight);

    free(s);
    return 0;
}