// AppKit hides windows without Apple Events, quitting Spotify or changing playback.
ObjC.import("AppKit");
const apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier("com.spotify.client");
for (let i = 0; i < apps.count; i++) {
    const app = apps.objectAtIndex(i);
    if (!app.isHidden) app.hide;
}
