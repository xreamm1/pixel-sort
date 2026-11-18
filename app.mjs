import { shuffle, quickSort, mergeSort, heapSort, insertionSort, selectionSort, bubbleSort, bogoRunner } from './sort.mjs?v=9';
import { randomHuePalette } from './hue.mjs?v=6';

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
  { name: 'Quick Sort', size: 160, sort: quickSort },
  { name: 'Merge Sort', size: 160, sort: mergeSort },
  { name: 'Heap Sort', size: 124, sort: heapSort },
  { name: 'Insertion Sort', size: 32, sort: insertionSort },
  { name: 'Selection Sort', size: 42, sort: selectionSort },
  { name: 'Bubble Sort', size: 32, sort: bubbleSort }
];
const experimental = { name: 'Bogo Sort', size: 168 };
const hueAlgorithm = { name: 'Подбор по Hue', size: 160, sort: mergeSort };
const options = [...algorithms, experimental];
const samples = await fetch('./samples.json').then(response => response.json()).catch(() => []);
let animation;
let pendingImage;
let currentImage;
let choosingFile = false;
let experiment;
let page = 0;
const pageSize = 12;
const duelRate = 120000;
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
function speed() {
  const value = ui.bogoSpeed.valueAsNumber;
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 10000;
}
ui.bogoSpeed.addEventListener('change', () => {
  ui.bogoSpeed.value = speed();
  try { localStorage.setItem(speedKey, ui.bogoSpeed.value); } catch {}
});

function seconds(input) {
  return Math.min(120, Math.max(0, Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : Number(input.defaultValue)));
}
for (const input of [ui.nextDelay, ui.sortDuration]) {
  const key = 'pixel-sort-' + input.id;
  try { input.value = localStorage.getItem(key) ?? input.defaultValue; } catch {}
  input.addEventListener('change', () => {
    input.value = seconds(input);
    try { localStorage.setItem(key, input.value); } catch {}
  });
}
const untilKey = 'pixel-sort-until-done';
try { ui.untilDone.checked = localStorage.getItem(untilKey) === 'true'; } catch {}
ui.sortDuration.disabled = ui.untilDone.checked;
ui.untilDone.addEventListener('change', () => {
  ui.sortDuration.disabled = ui.untilDone.checked;
  try { localStorage.setItem(untilKey, String(ui.untilDone.checked)); } catch {}
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
  const entries = seen.filter(item => item.image || item.local).reverse();
  ui.empty.hidden = entries.length > 0;
  const pages = Math.max(1, Math.ceil(entries.length / pageSize));
  page = Math.min(page, pages - 1);
  ui.pagination.hidden = pages < 2;
  ui.previousPage.disabled = page === 0;
  ui.nextPage.disabled = page === pages - 1;
  ui.pageNumber.textContent = 'Страница ' + (page + 1) + ' из ' + pages;
  const cards = new Map([...ui.entries.children].map(card => [card.dataset.id, card]));
  ui.entries.replaceChildren(...entries.slice(page * pageSize, (page + 1) * pageSize).map(item => {
    const existing = cards.get(item.id);
    if (existing && existing.dataset.algorithm === (item.algorithm || '')) return existing;
    const li = document.createElement('li');
    li.dataset.id = item.id;
    li.dataset.algorithm = item.algorithm || '';
    const button = document.createElement('button');
    const img = document.createElement('img');
    if (item.image) img.src = item.image;
    else if (!item.algorithm) showResult(img, item.id + ':original').catch(() => {});
    img.alt = '';
    img.loading = 'lazy';
    button.type = 'button';
    if (item.algorithm) {
      img.classList.add('pixelated');
      showResult(img, item.id).catch(() => {});
    }
    button.append(img, item.algorithm ? item.algorithm + ' · Собрано' : item.source);
    button.addEventListener('click', async () => {
      ui.previewImage.removeAttribute('src');
      ui.previewImage.dataset.resultId = item.id + ':original';
      if (item.image) ui.previewImage.src = item.image;
      else showResult(ui.previewImage, item.id + ':original').catch(() => {});
      ui.previewSource.hidden = !item.url;
      if (item.url) ui.previewSource.href = item.url;
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

ui.previousPage.addEventListener('click', () => { page--; renderHistory(); });
ui.nextPage.addEventListener('click', () => { page++; renderHistory(); });

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

function imageCanvas(bitmap) {
  const scale = 352 / Math.max(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#101113';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas;
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
          const canvas = imageCanvas(bitmap);
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

function makeRunner(algorithm, order) {
  if (algorithm === experimental) return bogoRunner(order);
  const moves = algorithm.sort(order);
  return limit => {
    const deadline = performance.now() + 5;
    let steps = 0;
    while (steps < limit) {
      if (moves.next().done) return { swaps: steps, done: true };
      steps++;
      if (steps % 128 === 0 && performance.now() >= deadline) break;
    }
    return { swaps: steps, done: false };
  };
}

function animate(image, { hue = false, replay, selected, auto = !hue } = {}) {
  const { canvas, item } = image;
  const algorithm = selected || (hue ? hueAlgorithm : chooseAlgorithm());
  const bogo = algorithm === experimental;
  const scale = 2 * algorithm.size / Math.max(canvas.width, canvas.height);
  const width = replay?.width ?? Math.max(1, Math.round(canvas.width * scale));
  const height = replay?.height ?? Math.max(1, Math.round(canvas.height * scale));
  ui.pixels.width = width;
  ui.pixels.height = height;
  let sourcePixels = replay?.sourcePixels;
  if (!sourcePixels) {
    context.drawImage(canvas, 0, 0, width, height);
    const target = context.getImageData(0, 0, width, height).data;
    const colors = hue ? randomHuePalette(target) : target;
    sourcePixels = new Uint32Array(colors.buffer);
  }
  const frame = context.createImageData(width, height);
  const framePixels = new Uint32Array(frame.data.buffer);
  const initial = replay?.initial ?? shuffle(Uint32Array.from({ length: sourcePixels.length }, (_, index) => index));
  const order = initial.slice();
  experiment = { image, hue, width, height, sourcePixels, initial, algorithm };
  ui.experimentControls.hidden = false;
  if (options.includes(algorithm)) ui.manualAlgorithm.value = algorithm.name;
  function paint(position, source) {
    framePixels[position] = sourcePixels[source];
  }
  order.forEach((index, position) => paint(position, index));
  context.putImageData(frame, 0, 0);
  ui.placeholder.hidden = true;
  ui.original.src = item.image || canvas.toDataURL();
  ui.original.hidden = false;
  ui.dimensions.textContent = width + ' × ' + height + ' PX';
  ui.source.hidden = !item.url;
  if (item.url) {
    ui.source.href = item.url;
    ui.source.textContent = item.source + ' ↗';
  }

  ui.algorithm.textContent = algorithm.name;
  const stream = bogo || Boolean(replay) || ui.untilDone.checked;
  const frames = stream ? null : recordFrames(order, algorithm.sort);
  const runner = stream ? makeRunner(algorithm, order) : null;
  let budget = 0;
  let operations = 0;
  if (stream) {
    ui.progress.removeAttribute('value');
    ui.percent.textContent = '—';
  }
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const run = { paused: reducedMotion, elapsed: 0, lastFrame: null, position: 0, hue };
  animation = run;
  ui.pause.disabled = false;
  ui.pause.textContent = run.paused ? 'Продолжить' : 'Пауза';
  ui.status.textContent = run.paused ? 'На паузе' : hue ? 'Собираем копию из случайных цветов…' : 'Сортировка пикселей…';
  const duration = seconds(ui.sortDuration) * 1000;

  function finish() {
    setProgress(1);
    ui.status.textContent = hue ? 'Копия собрана' : 'Картинка собрана';
    run.finished = true;
    run.hold = seconds(ui.nextDelay) * 1000;
    saveResult(item.id, algorithm.name).catch(() => {});
    if (!auto) {
      animation = null;
      ui.pause.disabled = true;
    }
  }

  function draw(time) {
    if (animation !== run) return;
    if (choosingFile) {
      run.lastFrame = null;
      requestAnimationFrame(draw);
      return;
    }
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
      if (stream) {
        const activeDelta = Math.min(delta, 100);
        run.elapsed += activeDelta;
        const rate = bogo ? speed() : duelRate;
        let count = Infinity;
        if (rate > 0) {
          budget += activeDelta / 1000 * rate;
          count = Math.floor(budget);
          budget -= count;
        } else {
          budget = 0;
          if (!activeDelta) count = 0;
        }
        const { swaps, done } = runner(count, bogo ? performance.now() + 8 : undefined);
        operations += swaps;
        if (swaps) {
          order.forEach((value, position) => paint(position, value));
          context.putImageData(frame, 0, 0);
        }
        setMetrics(operations, run.elapsed);
        if (done) finish();
        requestAnimationFrame(draw);
        return;
      }
      run.elapsed += delta;
      const progress = duration === 0 ? 1 : Math.min(1, run.elapsed / duration);
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

function reset(status) {
  animation = null;
  ui.single.hidden = false;
  ui.duel.hidden = true;
  ui.experimentControls.hidden = true;
  ui.next.disabled = true;
  ui.random.disabled = true;
  ui.upload.disabled = true;
  ui.pause.disabled = true;
  ui.pause.textContent = 'Пауза';
  ui.placeholder.hidden = false;
  ui.original.hidden = true;
  ui.source.hidden = true;
  ui.dimensions.textContent = '— × — PX';
  ui.algorithm.textContent = '—';
  ui.status.textContent = status;
  setProgress(0);
  setMetrics(0, 0);
}

function enableControls() {
  ui.next.disabled = false;
  ui.random.disabled = !currentImage;
  ui.upload.disabled = false;
}

function fillAlgorithms(select, selected) {
  for (const algorithm of options) select.add(new Option(algorithm.name, algorithm.name));
  select.value = selected;
}
fillAlgorithms(ui.manualAlgorithm, 'Quick Sort');

function replay(selected) {
  if (!experiment) return;
  const saved = experiment;
  reset('Готовим повтор…');
  animate(saved.image, { replay: saved, hue: saved.hue, selected: selected || saved.algorithm, auto: false });
  enableControls();
}
ui.repeat.addEventListener('click', () => replay());
ui.runSelected.addEventListener('click', () => replay(options.find(item => item.name === ui.manualAlgorithm.value)));

const duelPanels = ['Quick Sort', 'Merge Sort'].map((initial, index) => {
  const panel = document.createElement('section');
  panel.innerHTML = '<select></select><div class="viewport"><canvas></canvas></div><div class="run-stats"><span>Операции <b>0</b></span><span>Время <b>0,0 с</b></span><span></span></div>';
  const select = panel.querySelector('select');
  select.setAttribute('aria-label', index ? 'Правый алгоритм' : 'Левый алгоритм');
  fillAlgorithms(select, initial);
  const canvas = panel.querySelector('canvas');
  canvas.setAttribute('role', 'img');
  canvas.setAttribute('aria-label', index ? 'Правая анимация' : 'Левая анимация');
  const [count, time] = panel.querySelectorAll('b');
  const status = panel.querySelector('.run-stats').lastElementChild;
  ui.duelPanels.append(panel);
  return { select, canvas, count, time, status };
});

function duelTrial(panel, fixture) {
  const algorithm = options.find(item => item.name === panel.select.value);
  const order = fixture.initial.slice();
  panel.canvas.width = fixture.width;
  panel.canvas.height = fixture.height;
  const ctx = panel.canvas.getContext('2d');
  const frame = ctx.createImageData(fixture.width, fixture.height);
  const pixels = new Uint32Array(frame.data.buffer);
  const paint = () => {
    order.forEach((value, index) => { pixels[index] = fixture.sourcePixels[value]; });
    ctx.putImageData(frame, 0, 0);
  };
  paint();
  panel.count.textContent = '0';
  panel.time.textContent = formatTime.format(0) + ' с';
  panel.status.textContent = '';
  return { panel, paint, runner: makeRunner(algorithm, order), operations: 0, elapsed: 0, budget: 0, done: false };
}

function startDuel() {
  if (!experiment) return;
  const run = { paused: matchMedia('(prefers-reduced-motion: reduce)').matches, lastFrame: null };
  const trials = duelPanels.map(panel => duelTrial(panel, experiment));
  animation = run;
  ui.duelPause.disabled = false;
  ui.duelPause.textContent = run.paused ? 'Продолжить' : 'Пауза';
  function draw(time) {
    if (animation !== run) return;
    if (!run.paused && !choosingFile) {
      const delta = run.lastFrame === null ? 0 : Math.min(100, time - run.lastFrame);
      run.lastFrame = time;
      for (const trial of trials) {
        if (trial.done) continue;
        trial.budget += delta * duelRate / 1000;
        const count = Math.floor(trial.budget);
        trial.budget -= count;
        const { swaps, done } = trial.runner(count);
        trial.operations += swaps;
        trial.elapsed += done && count ? delta * swaps / count : delta;
        trial.done = done;
        if (swaps) trial.paint();
        trial.panel.count.textContent = formatCount.format(trial.operations);
        trial.panel.time.textContent = formatTime.format(trial.elapsed / 1000) + ' с';
        if (done) trial.panel.status.textContent = 'Готово';
      }
      if (trials.every(trial => trial.done)) {
        animation = null;
        ui.duelPause.disabled = true;
        return;
      }
    } else {
      run.lastFrame = null;
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

ui.duelOpen.addEventListener('click', () => {
  ui.single.hidden = true;
  ui.duel.hidden = false;
  ui.experimentControls.hidden = true;
  ui.pause.disabled = true;
  ui.duelSize.textContent = experiment.width + ' × ' + experiment.height + ' PX';
  startDuel();
});
ui.duelStart.addEventListener('click', startDuel);
for (const panel of duelPanels) panel.select.addEventListener('change', () => {
  if (!experiment || ui.duel.hidden) return;
  animation = null;
  ui.duelPause.disabled = true;
  for (const contender of duelPanels) {
    duelTrial(contender, experiment);
    contender.status.textContent = 'Ожидает запуска';
  }
});
ui.duelClose.addEventListener('click', () => replay());
ui.duelPause.addEventListener('click', () => {
  if (!animation) return;
  animation.paused = !animation.paused;
  animation.lastFrame = null;
  ui.duelPause.textContent = animation.paused ? 'Продолжить' : 'Пауза';
});

async function next() {
  reset('Ищем изображение…');
  try {
    renderHistory();
    let image = await pendingImage;
    pendingImage = null;
    image ??= await pickImage();
    while (!(await reserve(image.item, image.fingerprint))) image = await pickImage();
    currentImage = image;
    animate(image);
    pendingImage = pickImage().catch(() => null);
  } catch (error) {
    ui.status.textContent = error.name === 'QuotaExceededError' || error.name === 'SecurityError'
      ? 'Браузер не может сохранить историю показов.'
      : error.message;
  } finally {
    enableControls();
  }
}

async function makeHue(file) {
  reset(file ? 'Открываем картинку…' : 'Создаём случайные цвета…');
  try {
    if (file) {
      const bitmap = await createImageBitmap(file);
      let canvas;
      try { canvas = imageCanvas(bitmap); } finally { bitmap.close(); }
      currentImage = { canvas, item: { local: true, source: 'Своя картинка' } };
    }
    const { canvas, item } = currentImage;
    const entry = { ...item, id: 'hue:' + crypto.randomUUID() };
    if (entry.local) {
      const original = await new Promise(resolve => canvas.toBlob(resolve));
      const cache = await results;
      if (cache && original) await cache.put(resultKey(entry.id + ':original'), new Response(original, { headers: { 'Content-Type': original.type } }));
    }
    await updateHistory(seen => {
      seen.push(entry);
      return true;
    });
    animate({ canvas, item: entry }, { hue: true });
  } catch {
    ui.status.textContent = 'Не удалось открыть картинку или подготовить копию.';
  } finally {
    enableControls();
  }
}

ui.next.addEventListener('click', next);
ui.random.addEventListener('click', () => makeHue());
ui.upload.addEventListener('click', () => {
  choosingFile = true;
});
ui.upload.addEventListener('cancel', () => { choosingFile = false; });
ui.upload.addEventListener('change', () => {
  choosingFile = false;
  const file = ui.upload.files[0];
  ui.upload.value = '';
  if (file && !ui.upload.disabled) makeHue(file);
});
ui.pause.addEventListener('click', () => {
  if (!animation) return;
  animation.paused = !animation.paused;
  animation.lastFrame = null;
  ui.pause.textContent = animation.paused ? 'Продолжить' : 'Пауза';
  ui.status.textContent = animation.paused ? 'На паузе' : animation.finished ? 'Картинка собрана'
    : animation.hue ? 'Собираем копию из случайных цветов…' : 'Сортировка пикселей…';
});
window.addEventListener('storage', event => {
  if (event.key === historyKey) renderHistory();
});

const exampleTitles = new Map([
  ['cma:1960.81', 'Кувшинки'],
  ['cma:1972.47', 'Мадонна с младенцем'],
  ['cma:2014.12', 'Долина Кашмира']
]);
for (const item of samples.filter(item => exampleTitles.has(item.id))) {
  const li = document.createElement('li');
  const button = document.createElement('button');
  const img = document.createElement('img');
  img.src = item.image;
  img.alt = '';
  button.append(img, exampleTitles.get(item.id));
  button.addEventListener('click', async () => {
    if (ui.upload.disabled) return;
    reset('Загружаем пример…');
    ui.single.scrollIntoView({ block: 'start' });
    try {
      const bitmap = await loadImage(item.image);
      let canvas;
      try { canvas = imageCanvas(bitmap); } finally { bitmap.close(); }
      await reserve(item, fingerprintOf(canvas));
      currentImage = { canvas, item };
      animate(currentImage, { selected: algorithms[0], auto: false });
    } catch {
      ui.status.textContent = 'Не удалось открыть пример.';
    } finally {
      enableControls();
    }
  });
  li.append(button);
  ui.examples.append(li);
}
renderHistory();
if (location.hash === '#gallery' && !ui.empty.hidden) {
  ui.status.textContent = 'Выбери пример в истории или загрузи картинку.';
  enableControls();
} else {
  next();
}
