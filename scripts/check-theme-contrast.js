// Run on Settings or Agent Pet: agent-browser --session <name> eval --stdin < scripts/check-theme-contrast.js
(() => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const rgb = color => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    return [...ctx.getImageData(0, 0, 1, 1).data];
  };
  const luminance = color => color.slice(0, 3).map(v => {
    v /= 255;
    return v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4;
  }).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const background = el => {
    const layers = [];
    for (let node = el; node; node = node.parentElement) layers.unshift(rgb(getComputedStyle(node).backgroundColor));
    return layers.reduce((base, layer) => base.map((v, i) => v * (1 - layer[3] / 255) + layer[i] * layer[3] / 255), [255, 255, 255]);
  };
  const errors = [];
  const targets = [...document.querySelectorAll('h3,h4,label,[class*="text-[var(--ink)]"],[class*="text-[var(--muted)]"]')].filter(el => el.getClientRects().length && el.textContent.trim() && !el.matches('svg,svg *') && [...el.childNodes].some(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim()));
  if (targets.length < 3) errors.push('Expected rendered Settings/Pet headings and labels');
  for (const el of targets) {
    const a = luminance(rgb(getComputedStyle(el).color));
    const b = luminance(background(el));
    const ratio = (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    if (ratio < 4.5) errors.push(`${el.tagName} ${el.textContent.trim().slice(0, 55)}: ${ratio.toFixed(2)}:1`);
  }
  if (document.documentElement.scrollWidth > innerWidth) errors.push('Horizontal document overflow');
  const bubble = document.querySelector('[title="Click to hear companion\'s next thought"]');
  if (bubble) {
    const stage = bubble.parentElement.parentElement;
    if (getComputedStyle(stage).backgroundImage !== 'none') errors.push('Pet stage still has fixed gradient');
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return { passed: targets.length, palette: document.documentElement.dataset.themePalette, width: innerWidth };
})();
