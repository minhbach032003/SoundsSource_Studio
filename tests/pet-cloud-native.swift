// Native WKWebView boundary: the real Svelte gallery + IDB blobs survive a new webview offline.
// Run through: node tests/pet-cloud-browser.mjs --live --native
import AppKit
import WebKit

final class PetSmoke: NSObject, WKNavigationDelegate {
    let url: URL
    let store = WKWebsiteDataStore(forIdentifier: UUID())
    var windows: [NSWindow] = []
    var phase = 0
    init(url: URL) { self.url = url }
    func open(_ address: URL) {
        let config = WKWebViewConfiguration()
        config.websiteDataStore = store
        let view = WKWebView(frame: NSRect(x: 0, y: 0, width: 700, height: 850), configuration: config)
        view.navigationDelegate = self
        let window = NSWindow(contentRect: view.frame, styleMask: [.titled, .closable], backing: .buffered, defer: false)
        window.contentView = view
        window.orderFront(nil)
        windows.append(window)
        view.load(URLRequest(url: address))
    }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let script: String
        if phase == 0 {
            script = """
            for(let i=0;i<300&&!window.ready;i++) await new Promise(r=>setTimeout(r,100));
            if(!window.ready)throw Error('Svelte startup failed');
            const pets=await window.fetchPetCatalog();
            if(pets.length!==8)throw Error('Expected 8 published companions');
            const pet=pets.find(p=>p.id==='pikachu');
            await window.installCloudPet(pet);
            if(Object.keys(window.__PET_ASSET_URLS__).length!==21)throw Error('Incomplete native install');
            return 'Native cloud Pikachu install committed';
            """
        } else {
            script = """
            for(let i=0;i<300&&!window.ready;i++) await new Promise(r=>setTimeout(r,100));
            if(!window.ready||!window.offline)throw Error('Offline startup failed');
            if(Object.keys(window.__PET_ASSET_URLS__).length!==21)throw Error('IDB restore failed');
            const base=window.resolveSheet('pikachu').cdnUrl;
            const form=window.resolveSheet('/pets/pikachu/forms/alolan-raichu/spritesheet.webp').cdnUrl;
            for(const src of [base,form]) {
              if(!src.startsWith('blob:'))throw Error('Offline resolver attempted network');
              await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>image.naturalWidth>0?resolve():reject(Error('Empty image'));image.onerror=()=>reject(Error('Native blob image decode failed'));image.src=src;});
            }
            return 'PASS native WKWebView: cloud install, persistent IDB in new webview, offline base/form blob decoding';
            """
        }
        webView.callAsyncJavaScript(script, arguments: [:], in: nil, in: .page, completionHandler: { result in
            switch result {
            case .success(let value):
                print(value)
                if self.phase == 0 {
                    self.phase = 1
                    self.open(URL(string: self.url.absoluteString + "/?offline=1")!)
                } else { exit(0) }
            case .failure(let error):
                fputs("Native pet verification failed: \(error)\n", stderr)
                exit(1)
            }
        })
    }
}
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let smoke = PetSmoke(url: URL(string: CommandLine.arguments[1])!)
DispatchQueue.main.async { smoke.open(smoke.url) }
DispatchQueue.main.asyncAfter(deadline: .now() + 170) { fputs("Native test timed out\n", stderr); exit(1) }
app.run()
