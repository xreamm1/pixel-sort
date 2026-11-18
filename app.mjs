import { shuffle, quickSort, mergeSort, heapSort, insertionSort, selectionSort, bubbleSort, bogoSort } from './sort.mjs?v=2';

const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(el => [el.id, el]));
const context = ui.pixels.getContext('2d');
const formatCount = new Intl.NumberFormat('ru');
const formatTime = new Intl.NumberFormat('ru', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const historyKey = 'pixel-sort-history-v1';
const results = globalThis.caches?.open('pixel-sort-results-v1').catch(() => null);
const filtersKey = 'pixel-sort-algorithms-v1';
const speedKey = 'pixel-sort-bogo-speed-v1';
const themes = ['landscapes', 'animals', 'plants', 'architecture', 'astronomy'];
const queries = ['mountains', 'coral reef', 'forest', 'waterfall', 'wildlife', 'city skyline', 'desert'];
const algorithms = [
  { name: 'Quick Sort', size: 160, sort: order => quickSort(order, Math.random() < .5 ? 'random' : 'middle') },
  { name: 'Merge Sort', size: 160, sort: order => mergeSort(order, Math.random() < .5) },
  { name: 'Heap Sort', size: 124, sort: heapSort },
  { name: 'Insertion Sort', size: 32, sort: insertionSort },
  { name: 'Selection Sort', size: 42, sort: selectionSort },
  { name: 'Bubble Sort', size: 32, sort: bubbleSort }
];
const experimental = { name: 'Bogo Sort', size: 168, sort: bogoSort };
const options = [...algorithms, experimental];
const samples = await fetch('./samples.json').then(response => response.json()).catch(() => []);
let animation;
let pendingImage;
let lastAlgorithm;
let upcoming = [];
let enabled = algorithms.map(item => item.name);
try {
  const saved = JSON.parse(localStorage.getItem(filtersKey) || 'null');
  const available = Array.isArray(saved) ? saved.filter(name => options.some(item => item.name === name)) : [];
  if (available.length) enabled = available;
} catch {}

try {
  const saved = localStorage.getItem(speedKey);
  if (saved !== null) ui.bogoSpeed.value = saved;
} catch {}
function showSpeed() {
  ui.speedValue.textContent = formatCount.format(ui.bogoSpeed.valueAsNumber);
}
showSpeed();
ui.bogoSpeed.addEventListener('input', () => {
  showSpeed();
  try { localStorage.setItem(speedKey, ui.bogoSpeed.value); } catch {}
});

const filters = options.map(item => {
  const label = document.createElement('label');
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.value = item.name;
  input.checked = enabled.includes(item.name);
  label.append(input, item === experimental ? item.name + ' (экспериментальный)' : item.name);
  ui.filters.append(label);
  return input;
});

function updateFilters() {
  for (const input of filters) input.disabled = input.checked && enabled.length === 1;
}
updateFilters();
ui.filters.addEventListener('change', () => {
  enabled = filters.filter(input => input.checked).map(input => input.value);
  upcoming = [];
  try { localStorage.setItem(filtersKey, JSON.stringify(enabled)); } catch {}
  updateFilters();
});

function chooseAlgorithm() {
  if (!upcoming.length) {
    upcoming = shuffle(options.filter(item => enabled.includes(item.name)));
    if (upcoming.length > 1 && upcoming.at(-1) === lastAlgorithm) upcoming.unshift(upcoming.pop());
  }
  lastAlgorithm = upcoming.pop();
  return lastAlgorithm;
}

function history() {
  return JSON.parse(localStorage.getItem(historyKey) || '[]');
}

function resultKey(id) {
  return new URL('./history-result/' + encodeURIComponent(id), location.href);
}

async function showResult(img, id) {
  img.dataset.resultId = id;
  const cache = await results;
  const response = await cache?.match(resultKey(id));
  const blob = await response?.blob();
  if (!blob || img.dataset.resultId !== id) return false;
  const url = URL.createObjectURL(blob);
  const release = () => {
    URL.revokeObjectURL(url);
    img.removeEventListener('load', release);
    img.removeEventListener('error', release);
  };
  img.addEventListener('load', release);
  img.addEventListener('error', release);
  img.src = url;
  return true;
}

function updateHistory(change) {
  const write = () => {
    const seen = history();
    if (!change(seen)) return false;
    localStorage.setItem(historyKey, JSON.stringify(seen));
    renderHistory();
    return true;
  };
  return navigator.locks ? navigator.locks.request(historyKey, write) : write();
}

async function saveResult(id, algorithm) {
  const blob = await new Promise(resolve => ui.pixels.toBlob(resolve));
  const cache = await results;
  if (!cache || !blob) return;
  await cache.put(resultKey(id), new Response(blob, { headers: { 'Content-Type': blob.type } }));
  await updateHistory(seen => {
    const entry = seen.find(item => item.id === id);
    if (!entry) return false;
    entry.algorithm = algorithm;
    return true;
  });
}

function renderHistory() {
  const seen = history();
  ui.count.textContent = seen.length;
  const entries = seen.filter(item => item.image && item.url).reverse();
  ui.empty.hidden = entries.length > 0;
  const cards = new Map([...ui.entries.children].map(card => [card.dataset.id, card]));
  ui.entries.replaceChildren(...entries.map(item => {
    const existing = cards.get(item.id);
    if (existing && existing.dataset.algorithm === (item.algorithm || '')) return existing;
    const li = document.createElement('li');
    li.dataset.id = item.id;
    li.dataset.algorithm = item.algorithm || '';
    const button = document.createElement('button');
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = '';
    img.loading = 'lazy';
    button.type = 'button';
    if (item.algorithm) {
      img.classList.add('pixelated');
      showResult(img, item.id).catch(() => {});
    }
    button.append(img, item.algorithm ? item.algorithm + ' · Собрано' : item.source);
    button.addEventListener('click', async () => {
      ui.previewImage.src = item.image;
      ui.previewSource.href = item.url;
      ui.resultCaption.textContent = item.algorithm ? 'Пиксельный результат · ' + item.algorithm : 'Пиксельный результат';
      ui.previewResult.hidden = true;
      ui.previewResult.dataset.resultId = item.id;
      ui.resultMissing.hidden = Boolean(item.algorithm);
      ui.preview.showModal();
      const shown = item.algorithm && await showResult(ui.previewResult, item.id).catch(() => false);
      if (ui.previewResult.dataset.resultId !== item.id) return;
      ui.previewResult.hidden = !shown;
      ui.resultMissing.hidden = Boolean(shown);
    });
    li.append(button);
    return li;
  }));
}

function reserve(item, fingerprint) {
  return updateHistory(seen => {
    if (seen.some(entry => entry.id === item.id || entry.fingerprint === fingerprint)) return false;
    seen.push({ ...item, fingerprint });
    return true;
  });
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

async function openverse() {
  const params = new URLSearchParams({
    q: shuffle([...queries])[0], page_size: '20', page: String(1 + Math.floor(Math.random() * 5)),
    mature: 'false', excluded_source: 'wikimedia'
  });
  const data = await json('https://api.openverse.org/v1/images/?' + params);
  return (data.results ?? []).flatMap(item => {
    if (!item.id || !item.thumbnail?.startsWith('https://') || !item.foreign_landing_url?.startsWith('https://')) return [];
    return [{ id: 'openverse:' + item.id, image: item.thumbnail, url: item.foreign_landing_url, source: 'Openverse · ' + item.provider }];
  });
}

async function naturalist() {
  const params = new URLSearchParams({
    iconic_taxa: shuffle(['Aves', 'Plantae', 'Insecta', 'Mammalia', 'Fungi'])[0],
    quality_grade: 'research', photos: 'true', photo_license: 'cc0,cc-by,cc-by-sa',
    per_page: '24', page: String(1 + Math.floor(Math.random() * 40))
  });
  const data = await json('https://api.inaturalist.org/v1/observations?' + params);
  return (data.results ?? []).flatMap(item => {
    const photo = item.photos?.[0];
    if (!photo?.url?.startsWith('https://') || !photo.license_code) return [];
    return [{
      id: 'inaturalist:' + photo.id, image: photo.url.replace('/square.', '/medium.'),
      url: 'https://www.inaturalist.org/observations/' + item.id, source: 'iNaturalist'
    }];
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
  const [first, second] = shuffle([...themes]);
  const batches = [...shuffle([openverse(), naturalist(), commons(first)]), commons(second), Promise.resolve(samples)];
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
          const scale = 352 / Math.max(bitmap.width, bitmap.height);
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(bitmap.width * scale));
          canvas.height = Math.max(1, Math.round(bitmap.height * scale));
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          ctx.fillStyle = '#101113';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const item = batch[i];
          const fingerprint = fingerprintOf(canvas);
          if (!history().some(entry => entry.fingerprint === fingerprint)) return { canvas, item, fingerprint };
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

function setMetrics(steps, ms) {
  ui.operations.textContent = formatCount.format(steps);
  ui.elapsed.textContent = formatTime.format(ms / 1000) + ' с';
}

function recordFrames(order, sort) {
  let frames = [{ values: order.slice(), steps: 0 }];
  let stride = 64;
  let steps = 0;
  for (const _ of sort(order)) {
    if (++steps % stride !== 0) continue;
    frames.push({ values: order.slice(), steps });
    if (frames.length === 97) {
      frames = frames.filter((_, index) => index % 2 === 0);
      stride *= 2;
    }
  }
  frames.push({ values: order.slice(), steps });
  return frames;
}

function animate({ canvas, item }) {
  const algorithm = chooseAlgorithm();
  const bogo = algorithm === experimental;
  const scale = 2 * algorithm.size / Math.max(canvas.width, canvas.height);
  const width = Math.max(1, Math.round(canvas.width * scale));
  const height = Math.max(1, Math.round(canvas.height * scale));
  ui.pixels.width = width;
  ui.pixels.height = height;
  context.drawImage(canvas, 0, 0, width, height);
  const sourcePixels = new Uint32Array(context.getImageData(0, 0, width, height).data.buffer);
  const frame = context.createImageData(width, height);
  const framePixels = new Uint32Array(frame.data.buffer);
  const order = shuffle(Uint32Array.from({ length: sourcePixels.length }, (_, index) => index));
  function paint(position, source) {
    framePixels[position] = sourcePixels[source];
  }
  order.forEach((index, position) => paint(position, index));
  context.putImageData(frame, 0, 0);
  ui.placeholder.hidden = true;
  ui.original.src = item.image;
  ui.original.hidden = false;
  ui.dimensions.textContent = width + ' × ' + height + ' PX';
  ui.source.href = item.url;
  ui.source.textContent = item.source + ' ↗';
  ui.source.hidden = false;

  ui.algorithm.textContent = algorithm.name;
  const frames = bogo ? null : recordFrames(order, algorithm.sort);
  const randomMoves = bogo ? algorithm.sort(order) : null;
  let budget = 0;
  let operations = 0;
  if (bogo) {
    ui.progress.removeAttribute('value');
    ui.percent.textContent = '—';
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const run = { paused: reducedMotion, elapsed: 0, lastFrame: null, position: 0 };
  animation = run;
  ui.pause.disabled = false;
  ui.pause.textContent = run.paused ? 'Продолжить' : 'Пауза';
  ui.status.textContent = run.paused ? 'На паузе' : 'Сортировка пикселей…';
  const duration = 4800 + Math.random() * 2600;

  function finish() {
    setProgress(1);
    ui.status.textContent = 'Картинка собрана';
    run.finished = true;
    run.hold = 2000;
    saveResult(item.id, algorithm.name).catch(() => {});
  }

  function draw(time) {
    if (animation !== run) return;
    if (!run.paused) {
      const delta = run.lastFrame === null ? 0 : time - run.lastFrame;
      run.lastFrame = time;
      if (run.finished) {
        run.hold -= delta;
        if (run.hold <= 0) {
          next();
          return;
        }
        requestAnimationFrame(draw);
        return;
      }
      if (bogo) {
        const activeDelta = Math.min(delta, 100);
        run.elapsed += activeDelta;
        budget += activeDelta * ui.bogoSpeed.valueAsNumber / 1000;
        let done = false;
        const count = Math.floor(budget);
        budget -= count;
        for (let step = 0; step < count; step++) {
          const move = randomMoves.next();
          if (move.done) {
            done = true;
            break;
          }
          const [i, j, left, right] = move.value;
          paint(i, left);
          paint(j, right);
          operations++;
        }
        if (count) context.putImageData(frame, 0, 0);
        setMetrics(operations, run.elapsed);
        if (done) finish();
        requestAnimationFrame(draw);
        return;
      }
      run.elapsed += delta;
      const progress = Math.min(1, run.elapsed / duration);
      const target = Math.floor(progress * (frames.length - 1));
      if (target !== run.position) {
        frames[target].values.forEach((value, position) => paint(position, value));
        context.putImageData(frame, 0, 0);
        run.position = target;
      }
      setProgress(progress);
      setMetrics(frames[target].steps, run.elapsed);
      if (progress === 1) finish();
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
  ui.original.hidden = true;
  ui.source.hidden = true;
  ui.dimensions.textContent = '— × — PX';
  ui.algorithm.textContent = '—';
  ui.status.textContent = 'Ищем изображение…';
  setProgress(0);
  setMetrics(0, 0);
  try {
    renderHistory();
    let image = await pendingImage;
    pendingImage = null;
    image ??= await pickImage();
    while (!(await reserve(image.item, image.fingerprint))) image = await pickImage();
    animate(image);
    pendingImage = pickImage().catch(() => null);
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
  ui.status.textContent = animation.paused ? 'На паузе' : animation.finished ? 'Картинка собрана' : 'Сортировка пикселей…';
});
window.addEventListener('storage', event => {
  if (event.key === historyKey) renderHistory();
});
next();
