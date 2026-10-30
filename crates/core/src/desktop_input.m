#import <AppKit/AppKit.h>
#import <ApplicationServices/ApplicationServices.h>
#import <CoreGraphics/CoreGraphics.h>
#include <unistd.h>

int32_t rs_desktop_chrome_permission(bool prompt) {
    const char *bundle = "com.google.Chrome";
    AEAddressDesc target = {typeNull, NULL};
    OSStatus status = AECreateDesc(typeApplicationBundleID, bundle, strlen(bundle), &target);
    if (status == noErr) {
        status = AEDeterminePermissionToAutomateTarget(&target, typeWildCard, typeWildCard, prompt);
        AEDisposeDesc(&target);
    }
    return status;
}

// One immutable approval target. AX references remain retained across the modal.
@interface RSDesktopTarget : NSObject
@property(nonatomic) NSRunningApplication *app;
@property(nonatomic) NSString *label;
@property(nonatomic) AXUIElementRef window;
@property(nonatomic) AXUIElementRef element;
@property(nonatomic) CGRect display;
@property(nonatomic) CGRect bounds;
@end
@implementation RSDesktopTarget
- (void)dealloc {
    if (_window) CFRelease(_window);
    if (_element) CFRelease(_element);
}
@end

static void message(char *buffer, size_t size, NSString *text) {
    if (size) snprintf(buffer, size, "%s", text.UTF8String ?: "Desktop Control error");
}
static CFTypeRef attribute(AXUIElementRef element, CFStringRef name) {
    CFTypeRef value = NULL;
    if (element) AXUIElementCopyAttributeValue(element, name, &value);
    return value;
}
static AXUIElementRef axElement(AXUIElementRef element, CFStringRef name) {
    CFTypeRef value = attribute(element, name);
    if (value && CFGetTypeID(value) == AXUIElementGetTypeID()) return (AXUIElementRef)value;
    if (value) CFRelease(value);
    return NULL;
}
static bool same(AXUIElementRef a, AXUIElementRef b) { return a && b && CFEqual(a, b); }
static bool windowBounds(AXUIElementRef window, CGRect *bounds) {
    CFTypeRef position = attribute(window, kAXPositionAttribute);
    CFTypeRef size = attribute(window, kAXSizeAttribute);
    bool ok = position && size && CFGetTypeID(position) == AXValueGetTypeID() && CFGetTypeID(size) == AXValueGetTypeID()
        && AXValueGetValue(position, kAXValueCGPointType, &bounds->origin)
        && AXValueGetValue(size, kAXValueCGSizeType, &bounds->size);
    if (position) CFRelease(position);
    if (size) CFRelease(size);
    return ok;
}
static bool stillFocused(RSDesktopTarget *target, uint32_t kind) {
    AXUIElementRef app = AXUIElementCreateApplication(target.app.processIdentifier);
    AXUIElementSetMessagingTimeout(app, 1.0);
    AXUIElementRef window = axElement(app, kAXFocusedWindowAttribute);
    AXUIElementRef focused = axElement(app, kAXFocusedUIElementAttribute);
    CGRect bounds;
    bool ok = same(window, target.window) && windowBounds(window, &bounds) && CGRectEqualToRect(bounds, target.bounds)
        && (kind != 2 || same(focused, target.element));
    if (kind == 3 && target.element) ok = ok && same(focused, target.element);
    if (window) CFRelease(window);
    if (focused) CFRelease(focused);
    CFRelease(app);
    return ok;
}

void *rs_desktop_prepare(const char *bundle, char *error, size_t size) {
    @autoreleasepool {
        if (!AXIsProcessTrusted()) { message(error, size, @"Cần quyền Accessibility trong System Settings → Privacy & Security."); return NULL; }
        if (!CGPreflightScreenCaptureAccess()) { message(error, size, @"Cần quyền Screen Recording để xác định cửa sổ đích."); return NULL; }
        NSArray<NSRunningApplication *> *apps = [NSRunningApplication runningApplicationsWithBundleIdentifier:[NSString stringWithUTF8String:bundle]];
        if (apps.count != 1 || apps.firstObject.processIdentifier == getpid()) {
            message(error, size, @"Ứng dụng đích phải đang chạy, duy nhất và không phải SoundsSource Studio."); return NULL;
        }
        AXUIElementRef app = AXUIElementCreateApplication(apps.firstObject.processIdentifier);
        AXUIElementSetMessagingTimeout(app, 1.0);
        AXUIElementRef window = axElement(app, kAXFocusedWindowAttribute);
        AXUIElementRef focused = axElement(app, kAXFocusedUIElementAttribute);
        CFRelease(app);
        if (!window) { if (focused) CFRelease(focused); message(error, size, @"Không xác định được cửa sổ đích. Mở cửa sổ ứng dụng rồi thử lại."); return NULL; }
        RSDesktopTarget *target = [RSDesktopTarget new];
        target.app = apps.firstObject;
        target.window = window;
        target.element = focused;
        target.display = CGDisplayBounds(CGMainDisplayID());
        CGRect bounds;
        if (!windowBounds(window, &bounds)) { message(error, size, @"Không xác định được vị trí cửa sổ đích."); return NULL; }
        target.bounds = bounds;
        CFTypeRef title = attribute(window, kAXTitleAttribute);
        NSString *name = title && CFGetTypeID(title) == CFStringGetTypeID() ? (__bridge NSString *)title : @"";
        target.label = [NSString stringWithFormat:@"%@ — %@ (%@)", target.app.localizedName, name, target.app.bundleIdentifier];
        if (title) CFRelease(title);
        return (void *)CFBridgingRetain(target);
    }
}
void rs_desktop_release(void *target) { if (target) CFRelease(target); }
void rs_desktop_label(void *target, char *output, size_t size) {
    @autoreleasepool { message(output, size, ((__bridge RSDesktopTarget *)target).label); }
}

bool rs_desktop_execute(void *pointer, uint32_t kind, double x, double y, uint16_t key, uint64_t flags,
                       const char *text, int32_t vertical, int32_t horizontal, char *error, size_t size) {
    @autoreleasepool {
        RSDesktopTarget *target = (__bridge RSDesktopTarget *)pointer;
        if (!target || target.app.terminated || !AXIsProcessTrusted() || !CGPreflightScreenCaptureAccess()) {
            message(error, size, @"Ứng dụng đã thoát hoặc quyền Accessibility/Screen Recording không còn khả dụng."); return false;
        }
        if (!CGRectEqualToRect(target.display, CGDisplayBounds(CGMainDisplayID()))) {
            message(error, size, @"Màn hình đã thay đổi. Hãy yêu cầu lại."); return false;
        }
        if (!stillFocused(target, kind)) { message(error, size, @"Cửa sổ hoặc ô nhập đã thay đổi. Hãy yêu cầu lại."); return false; }
        if (kind == 2) {
            CFTypeRef role = attribute(target.element, kAXSubroleAttribute);
            bool secure = role && CFEqual(role, kAXSecureTextFieldSubrole);
            if (role) CFRelease(role);
            if (secure) { message(error, size, @"Không nhập vào ô mật khẩu."); return false; }
        }
        if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != target.app.processIdentifier) [target.app activateWithOptions:0];
        for (int i = 0; i < 50 && NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != target.app.processIdentifier; i++) usleep(20000);
        if (NSWorkspace.sharedWorkspace.frontmostApplication.processIdentifier != target.app.processIdentifier || !stillFocused(target, kind)) {
            message(error, size, @"Không đưa được ứng dụng đích lên trước."); return false;
        }
        CGPoint point = CGPointMake(target.display.origin.x + x / 1000.0 * (target.display.size.width - 1),
                                    target.display.origin.y + y / 1000.0 * (target.display.size.height - 1));
        if (kind == 1 || kind == 4) {
            // Fail closed if another window/menu/overlay owns the chosen pixel.
            if (!CGRectContainsPoint(target.bounds, point)) { message(error, size, @"Điểm thao tác nằm ngoài cửa sổ đã duyệt."); return false; }
            AXUIElementRef system = AXUIElementCreateSystemWide();
            AXUIElementSetMessagingTimeout(system, 1.0);
            AXUIElementRef element = NULL;
            pid_t pid = 0;
            bool hit = AXUIElementCopyElementAtPosition(system, point.x, point.y, &element) == kAXErrorSuccess;
            AXUIElementRef window = axElement(element, kAXWindowAttribute);
            hit = hit && AXUIElementGetPid(element, &pid) == kAXErrorSuccess && pid == target.app.processIdentifier
                && (same(window, target.window) || same(element, target.window));
            if (window) CFRelease(window);
            if (element) CFRelease(element);
            CFRelease(system);
            if (!hit) { message(error, size, @"Điểm thao tác không thuộc ứng dụng đã duyệt. Hãy chia sẻ khung hình mới và yêu cầu lại."); return false; }
        }
        CGEventSourceRef source = CGEventSourceCreate(kCGEventSourceStatePrivate);
        if (!source) { message(error, size, @"Không tạo được nguồn sự kiện macOS."); return false; }
        bool ok = true;
        if (kind == 1) {
            CGEventRef down = CGEventCreateMouseEvent(source, kCGEventLeftMouseDown, point, kCGMouseButtonLeft);
            CGEventRef up = CGEventCreateMouseEvent(source, kCGEventLeftMouseUp, point, kCGMouseButtonLeft);
            ok = down && up;
            if (ok) {
                CGEventSetIntegerValueField(down, kCGMouseEventClickState, 1);
                CGEventSetIntegerValueField(up, kCGMouseEventClickState, 1);
                // WindowServer must route pointer events; PostToPid yields windowNumber=0 in AppKit.
                CGEventPost(kCGHIDEventTap, down); CGEventPost(kCGHIDEventTap, up);
            }
            if (down) CFRelease(down);
            if (up) CFRelease(up);
        } else if (kind == 4) {
            CGEventRef event = CGEventCreateScrollWheelEvent(source, kCGScrollEventUnitLine, 2, vertical, horizontal);
            CGEventRef move = CGEventCreateMouseEvent(source, kCGEventMouseMoved, point, kCGMouseButtonLeft);
            ok = event && move;
            if (ok) {
                CGEventSetLocation(event, point);
                CGEventPost(kCGHIDEventTap, move);
                CGEventPost(kCGHIDEventTap, event);
            }
            if (move) CFRelease(move);
            if (event) CFRelease(event);
        } else if (kind == 2 || kind == 3) {
            NSString *value = [NSString stringWithUTF8String:text];
            NSUInteger length = kind == 2 ? value.length : 0;
            for (NSUInteger offset = 0; ok && (offset < length || (kind == 3 && offset == 0)); ) {
                NSUInteger count = MIN((NSUInteger)20, length - offset);
                if (count && offset + count < length && CFStringIsSurrogateHighCharacter([value characterAtIndex:offset + count - 1])) count--;
                CGEventRef down = CGEventCreateKeyboardEvent(source, key, true);
                CGEventRef up = CGEventCreateKeyboardEvent(source, key, false);
                ok = down && up;
                if (ok) {
                    CGEventSetFlags(down, flags); CGEventSetFlags(up, flags);
                    if (kind == 2) {
                        UniChar chars[20]; [value getCharacters:chars range:NSMakeRange(offset, count)];
                        CGEventKeyboardSetUnicodeString(down, count, chars);
                        CGEventKeyboardSetUnicodeString(up, count, chars);
                    }
                    CGEventPostToPid(target.app.processIdentifier, down);
                    CGEventPostToPid(target.app.processIdentifier, up);
                }
                if (down) CFRelease(down);
                if (up) CFRelease(up);
                if (kind == 3) break;
                offset += count;
            }
        } else { ok = false; }
        CFRelease(source);
        if (!ok) message(error, size, @"Không gửi được toàn bộ thao tác macOS; kiểm tra ứng dụng trước khi thử lại.");
        return ok;
    }
}
