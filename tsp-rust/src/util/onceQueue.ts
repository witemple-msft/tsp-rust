export interface OnceQueue<T> {
  add(value: T): void;
  take(): T | undefined;
  isEmpty(): boolean;
}

export function createOnceQueue<T>(...initialValues: T[]): OnceQueue<T> {
  const visited: Set<T> = new Set(initialValues);
  const queue = [...initialValues];
  let idx = 0;

  return {
    add(value: T): void {
      if (!visited.has(value)) {
        visited.add(value);
        queue.push(value);
      }
    },
    take(): T | undefined {
      if (idx < queue.length) {
        return queue[idx++];
      } else {
        return undefined;
      }
    },
    isEmpty(): boolean {
      return idx >= queue.length;
    },
  };
}
