// Fixed program only. Model values arrive as JSON data in argv, never source.
function run(argv) {
    const expected = JSON.parse(argv[0]);
    const chrome = Application('com.google.Chrome');
    if (!chrome.running()) throw new Error('Chrome chưa chạy.');
    const windows = chrome.windows();
    if (!expected) {
        if (windows.length === 0) throw new Error('Chrome không có cửa sổ.');
        const win = windows[0];
        const tab = win.activeTab;
        return JSON.stringify({ window_id: win.id(), tab_id: tab.id(), title: tab.title(), url: tab.url() });
    }
    const win = windows.find(w => w.id() === expected.window_id);
    if (!win) throw new Error('Cửa sổ Chrome đã thay đổi. Hãy yêu cầu lại.');
    const tab = win.tabs().find(t => t.id() === expected.tab_id);
    if (!tab || tab.url() !== expected.url || tab.title() !== expected.title) {
        throw new Error('Tab Chrome đã thay đổi. Hãy yêu cầu lại.');
    }
    tab.close();
    for (let i = 0; i < 10; i++) {
        const remaining = chrome.windows().find(w => w.id() === expected.window_id);
        if (!remaining || !remaining.tabs().some(t => t.id() === expected.tab_id)) return 'closed';
        delay(0.1);
    }
    throw new Error('Tab chưa đóng; có thể Chrome đang chờ xác nhận dữ liệu chưa lưu.');
}
