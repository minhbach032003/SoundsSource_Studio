import AppKit

// Disposable, isolated app: native tests never type into the user's documents.
let app = NSApplication.shared
app.setActivationPolicy(.regular)
let window = NSWindow(contentRect: NSRect(x: 100, y: 100, width: 600, height: 600), styleMask: [.titled, .closable], backing: .buffered, defer: false)
window.title = "SoundsSource Desktop Fixture"
let input = NSTextField(frame: NSRect(x: 30, y: 510, width: 500, height: 40))
let second = NSTextField(frame: NSRect(x: 30, y: 460, width: 500, height: 40))
let button = NSButton(title: "Fixture button", target: nil, action: nil)
button.frame = NSRect(x: 30, y: 390, width: 300, height: 50)
let scroll = NSScrollView(frame: NSRect(x: 30, y: 30, width: 500, height: 330))
scroll.hasVerticalScroller = true
let document = NSTextView(frame: NSRect(x: 0, y: 0, width: 480, height: 2400))
document.string = (0..<150).map { "Disposable line \($0)" }.joined(separator: "\n")
scroll.documentView = document
for view in [input, second, button, scroll] { window.contentView!.addSubview(view) }
input.nextKeyView = second
var clicks = 0
var keys: [UInt16] = []
var mouse: [String] = []
class Receiver: NSObject { @objc func clicked() { clicks += 1 } }
let receiver = Receiver()
button.target = receiver
button.action = #selector(Receiver.clicked)
let monitor = NSEvent.addLocalMonitorForEvents(matching: [.keyDown, .leftMouseDown, .leftMouseUp, .scrollWheel]) { event in
    if event.type == .keyDown { keys.append(event.keyCode) }
    else { mouse.append("type=\(event.type.rawValue),window=\(event.windowNumber),point=\(event.locationInWindow)") }
    return event
}
window.makeKeyAndOrderFront(nil)
window.makeFirstResponder(input)
app.activate(ignoringOtherApps: true)
let output = CommandLine.arguments[1]
func point(_ view: NSView) -> [String: Double] {
    let rect = window.convertToScreen(view.convert(view.bounds, to: nil))
    let screen = NSScreen.screens[0].frame
    return ["x": rect.midX / screen.width * 1000, "y": (screen.height - rect.midY) / screen.height * 1000]
}
let timer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { _ in
    let state: [String: Any] = ["active": app.isActive && window.isKeyWindow, "text": input.stringValue, "mouse": mouse, "clicks": clicks, "keys": keys, "scrollY": scroll.contentView.bounds.minY, "button": point(button), "scroll": point(scroll)]
    if let data = try? JSONSerialization.data(withJSONObject: state) { try? data.write(to: URL(fileURLWithPath: output), options: .atomic) }
}
app.run()
