export function shuffle(values, random = Math.random) {
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [values[i], values[j]] = [values[j], values[i]];
  }
  return values;
}

export function* quickSort(values, pivotMode) {
  const ranges = [[0, values.length - 1]];
  while (ranges.length) {
    const [first, last] = ranges.pop();
    if (first >= last) continue;
    const pivot = pivotMode === 'random'
      ? Math.floor(first + Math.random() * (last - first + 1))
      : (first + last) >> 1;
    [values[pivot], values[last]] = [values[last], values[pivot]];
    yield [pivot, last, values[pivot], values[last]];
    let boundary = first;
    for (let i = first; i < last; i++) {
      if (values[i] >= values[last]) continue;
      if (i !== boundary) {
        [values[i], values[boundary]] = [values[boundary], values[i]];
        yield [i, boundary, values[i], values[boundary]];
      }
      boundary++;
    }
    [values[boundary], values[last]] = [values[last], values[boundary]];
    yield [boundary, last, values[boundary], values[last]];
    ranges.push([boundary + 1, last], [first, boundary - 1]);
  }
}

export function* mergeSort(values, descendingPass) {
  const buffer = new Uint32Array(values.length);
  for (let size = 1; size < values.length; size *= 2) {
    for (let offset = 0; offset < values.length; offset += 2 * size) {
      const start = descendingPass ? (Math.ceil(values.length / (2 * size)) - 1) * 2 * size - offset : offset;
      const middle = Math.min(start + size, values.length);
      const end = Math.min(start + 2 * size, values.length);
      if (middle === end) continue;
      buffer.set(values.subarray(start, end), start);
      let left = start;
      let right = middle;
      for (let i = start; i < end; i++) {
        const takeLeft = right === end || (left < middle && buffer[left] < buffer[right]);
        const value = buffer[takeLeft ? left++ : right++];
        if (value === values[i]) continue;
        values[i] = value;
        yield [i, i, value, value];
      }
    }
  }
}

function swap(values, i, j) {
  [values[i], values[j]] = [values[j], values[i]];
  return [i, j, values[i], values[j]];
}

export function* heapSort(values) {
  function* sift(start, end) {
    let parent = start;
    while (parent * 2 + 1 < end) {
      let child = parent * 2 + 1;
      if (child + 1 < end && values[child + 1] > values[child]) child++;
      if (values[parent] >= values[child]) break;
      yield swap(values, parent, child);
      parent = child;
    }
  }
  for (let i = Math.floor(values.length / 2) - 1; i >= 0; i--) yield* sift(i, values.length);
  for (let end = values.length - 1; end > 0; end--) {
    yield swap(values, 0, end);
    yield* sift(0, end);
  }
}

export function* insertionSort(values) {
  for (let i = 1; i < values.length; i++) {
    for (let j = i; j > 0 && values[j - 1] > values[j]; j--) {
      yield swap(values, j - 1, j);
    }
  }
}

export function* selectionSort(values) {
  for (let i = 0; i < values.length - 1; i++) {
    let minimum = i;
    for (let j = i + 1; j < values.length; j++) {
      if (values[j] < values[minimum]) minimum = j;
    }
    if (minimum !== i) yield swap(values, i, minimum);
  }
}

export function* bubbleSort(values) {
  for (let end = values.length - 1; end > 0; end--) {
    let changed = false;
    for (let i = 0; i < end; i++) {
      if (values[i] <= values[i + 1]) continue;
      yield swap(values, i, i + 1);
      changed = true;
    }
    if (!changed) break;
  }
}

export function bogoRunner(values, random = Math.random) {
  let i = 0;
  let done = false;
  return limit => {
    let swaps = 0;
    while (swaps < limit && !done) {
      if (i === 0) {
        done = !values.some((value, index) => value !== index);
        if (done) break;
        i = values.length - 1;
      }
      const j = Math.floor(random() * (i + 1));
      if (i !== j) {
        const value = values[i];
        values[i] = values[j];
        values[j] = value;
        swaps++;
      }
      i--;
    }
    return { swaps, done };
  };
}
