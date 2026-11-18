import { shuffle, quickSort, mergeSort } from './sort.mjs';

const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(el => [el.id, el]));
const context = ui.pixels.getContext('2d');
const original = ui.reference.getContext('2d', { willReadFrequently: true });
const historyKey = 'pixel-sort-history-v1';
const themes = ['landscapes', 'animals', 'plants', 'architecture', 'astronomy'];
const samples = await fetch('./samples.json').then(response => response.json()).catch(() => []);
let animation;
let lastAlgorithm;

function history() {
  return JSON.parse(localStorage.getItem(historyKey) || '[]');
}

function reserve(id, fingerprint) {
  const record = () => {
    const seen = history();
    if (seen.some(item => item.id === id || item.fingerprint === fingerprint)) return false;
    seen.push({ id, fingerprint });
    localStorage.setItem(historyKey, JSON.stringify(seen));
    ui.count.textContent = seen.length;
    return true;
  };
  return navigator.locks ? navigator.locks.request(historyKey, record) : record();
}

async function json(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
  if (!response.ok) throw new Error('Источник недоступен');
  return response.json();
}

async function commons(theme) {
  const params = new URLSearchParams({
    action: 'query', generator: 'categorymembers',
    gcmtitle: 'Category:Featured pictures of ' + theme, gcmtype: 'file',
    gcmlimit: '50', prop: 'imageinfo', iiprop: 'url|mime',
    iiurlwidth: '500', format: 'json', origin: '*'
  });
  let data = await json('https://commons.wikimedia.org/w/api.php?' + params);
  const pages = Object.values(data.query?.pages ?? {});
  if (data.continue?.gcmcontinue && Math.random() < .65) {
    params.set('gcmcontinue', data.continue.gcmcontinue);
    data = await json('https://commons.wikimedia.org/w/api.php?' + params).catch(() => ({}));
    pages.push(...Object.values(data.query?.pages ?? {}));
  }
  return pages.flatMap(page => {
    const info = page.imageinfo?.[0];
    if (!info?.thumburl || !/^image\/(jpeg|png|webp)$/.test(info.mime)) return [];
    return [{ id: 'commons:' + page.pageid, image: info.thumburl, url: info.descriptionurl, source: 'Wikimedia Commons' }];
  });
}

async function loadImage(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(4000) });
  if (!response.ok) throw new Error('Изображение недоступно');
  const blob = await response.blob();
  return createImageBitmap(blob);
}

function fingerprintOf(canvas) {
  const sample = document.createElement('canvas');
  sample.width = 17;
  sample.height = 16;
  const small = sample.getContext('2d', { willReadFrequently: true });
  small.drawImage(canvas, 0, 0, 17, 16);
  const { data } = small.getImageData(0, 0, 17, 16);
  const luma = i => data[i] * 3 + data[i + 1] * 6 + data[i + 2];
  let hash = '';
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const i = (y * 17 + x) * 4;
      hash += luma(i) > luma(i + 4) ? '1' : '0';
    }
  }
  return hash;
}

async function pickImage() {
  const seen = new Set(history().map(item => item.id));
  const batches = [...shuffle([...themes]).slice(0, 2).map(commons), Promise.resolve(samples)];
  // Attach handlers immediately while another source is being read.
  const lists = batches.map(batch => batch.catch(() => []));
  for (const list of lists) {
    const candidates = shuffle((await list).filter(item => !seen.has(item.id)));
    for (let offset = 0; offset < Math.min(candidates.length, 12); offset += 4) {
      const batch = candidates.slice(offset, offset + 4);
      const loaded = await Promise.allSettled(batch.map(item => loadImage(item.image)));
      try {
        for (let i = 0; i < loaded.length; i++) {
          if (loaded[i].status !== 'fulfilled') continue;
          const bitmap = loaded[i].value;
          const scale = 176 / Math.max(bitmap.width, bitmap.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.fillStyle = '#101113';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const item = batch[i];
          if (await reserve(item.id, fingerprintOf(canvas))) return { canvas, item };
        }
      } finally {
        for (const result of loaded) if (result.status === 'fulfilled') result.value.close();
      }
    }
  }
  throw new Error('Новых картинок пока нет. Попробуй ещё раз.');
}

function setProgress(value) {
  const percent = Math.floor(value * 100);
  ui.progress.value = percent;
  ui.percent.textContent = percent + '%';
}

function animate({ canvas, item }) {
  const { width, height } = canvas;
  ui.pixels.width = ui.reference.width = width;
  ui.pixels.height = ui.reference.height = height;
  original.drawImage(canvas, 0, 0);
  const sourcePixels = new Uint32Array(original.getImageData(0, 0, width, height).data.buffer);
  const frame = context.createImageData(width, height);
  const framePixels = new Uint32Array(frame.data.buffer);
  const order = shuffle(Uint32Array.from(sourcePixels, (_, index) => index));
  order.forEach((index, position) => { framePixels[position] = sourcePixels[index]; });
  context.putImageData(frame, 0, 0);
  ui.placeholder.hidden = true;
  ui.dimensions.textContent = width + ' × ' + height + ' PX';
  ui.source.href = item.url;
  ui.source.textContent = item.source + ' ↗';
  ui.source.hidden = false;

  const algorithm = lastAlgorithm === undefined ? (Math.random() < .5 ? 'quick' : 'merge') : (lastAlgorithm === 'quick' ? 'merge' : 'quick');
  lastAlgorithm = algorithm;
  const alternate = Math.random() < .5;
  ui.algorithm.textContent = algorithm === 'quick' ? 'Quick Sort' : 'Merge Sort';
  ui.explanation.textContent = algorithm === 'quick'
    ? 'Разделяет пиксели по опорному индексу и сортирует каждую часть.'
    : 'Объединяет соседние отсортированные группы пикселей.';
  const moves = Array.from(algorithm === 'quick' ? quickSort(order, alternate ? 'random' : 'middle') : mergeSort(order, alternate));
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const run = { paused: reducedMotion, elapsed: 0, lastFrame: null, position: 0 };
  animation = run;
  ui.pause.disabled = false;
  ui.pause.textContent = run.paused ? 'Продолжить' : 'Пауза';
  ui.status.textContent = run.paused ? 'На паузе' : 'Сортировка пикселей…';
  const duration = 4800 + Math.random() * 2600;

  function draw(time) {
    if (animation !== run) return;
    if (!run.paused) {
      if (run.lastFrame !== null) run.elapsed += Math.min(time - run.lastFrame, 80);
      run.lastFrame = time;
      const progress = Math.min(1, run.elapsed / duration);
      const target = Math.floor(progress * moves.length);
      while (run.position < target) {
        const [i, j, left, right] = moves[run.position++];
        framePixels[i] = sourcePixels[left];
        framePixels[j] = sourcePixels[right];
      }
      context.putImageData(frame, 0, 0);
      setProgress(progress);
      if (progress === 1) {
        ui.status.textContent = 'Картинка собрана';
        ui.pause.disabled = true;
        animation = null;
        return;
      }
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

async function next() {
  animation = null;
  ui.next.disabled = true;
  ui.pause.disabled = true;
  ui.pause.textContent = 'Пауза';
  ui.placeholder.hidden = false;
  ui.source.hidden = true;
  original.clearRect(0, 0, ui.reference.width, ui.reference.height);
  ui.dimensions.textContent = '— × — PX';
  ui.algorithm.textContent = '—';
  ui.explanation.textContent = 'Алгоритм выбирается автоматически для каждой картинки.';
  ui.status.textContent = 'Ищем изображение…';
  setProgress(0);
  try {
    ui.count.textContent = history().length;
    animate(await pickImage());
  } catch (error) {
    ui.status.textContent = error.name === 'QuotaExceededError' || error.name === 'SecurityError'
      ? 'Браузер не может сохранить историю показов.'
      : error.message;
  } finally {
    ui.next.disabled = false;
  }
}

ui.next.addEventListener('click', next);
ui.pause.addEventListener('click', () => {
  if (!animation) return;
  animation.paused = !animation.paused;
  animation.lastFrame = null;
  ui.pause.textContent = animation.paused ? 'Продолжить' : 'Пауза';
  ui.status.textContent = animation.paused ? 'На паузе' : 'Сортировка пикселей…';
});
window.addEventListener('storage', event => {
  if (event.key === historyKey) ui.count.textContent = history().length;
});
next();
