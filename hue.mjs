const bands = 72;

function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const distance = max - Math.min(r, g, b);
  let hue = 0;
  if (distance) {
    if (max === r) hue = (g - b) / distance;
    else if (max === g) hue = 2 + (b - r) / distance;
    else hue = 4 + (r - g) / distance;
  }
  return { hue: (hue * 12 + bands) % bands, sat: max ? distance / max : 0, value: max / 255 };
}

export function randomHuePalette(target, random = Math.random) {
  const palette = Array.from({ length: bands }, () => []);
  for (let i = 0; i < 8192; i++) {
    const r = Math.floor(random() * 256);
    const g = Math.floor(random() * 256);
    const b = Math.floor(random() * 256);
    const color = hsv(r, g, b);
    palette[Math.floor(color.hue)].push({ ...color, r, g, b });
  }
  const gray = Array.from({ length: 32 }, () => Math.floor(random() * 256));
  const output = new Uint8ClampedArray(target.length);
  for (let i = 0; i < target.length; i += 4) {
    const color = hsv(target[i], target[i + 1], target[i + 2]);
    if (color.sat < .06) {
      const shade = gray.reduce((best, value) =>
        Math.abs(value / 255 - color.value) < Math.abs(best / 255 - color.value) ? value : best);
      output[i] = output[i + 1] = output[i + 2] = shade;
    } else {
      const band = Math.floor(color.hue);
      let best;
      let distance = Infinity;
      for (let offset = -1; offset <= 1; offset++) {
        for (const sample of palette[(band + offset + bands) % bands]) {
          const hue = Math.abs(sample.hue - color.hue);
          const score = (Math.min(hue, bands - hue) / 4) ** 2
            + (sample.sat - color.sat) ** 2 + 2 * (sample.value - color.value) ** 2;
          if (score < distance) {
            best = sample;
            distance = score;
          }
        }
      }
      output[i] = best?.r ?? target[i];
      output[i + 1] = best?.g ?? target[i + 1];
      output[i + 2] = best?.b ?? target[i + 2];
    }
    output[i + 3] = 255;
  }
  return output;
}
