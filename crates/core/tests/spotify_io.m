// Runs the real native IOProc without devices, permissions, or Spotify playback.
#import "../src/spotify_tap.m"
#include <assert.h>
#include <math.h>
static void halve(void *context, float *samples, unsigned count, double rate) {
    assert(rate == 48000);
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
    free(s);
    return 0;
}
