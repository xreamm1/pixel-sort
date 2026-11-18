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
