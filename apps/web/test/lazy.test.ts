import { describe, expect, it, vi } from 'vitest';
import { lazyPort } from '../src/lazy';

interface Port {
  add(a: number, b: number): Promise<number>;
  watch(id: string, cb: (v: number) => void): () => void;
}

const impl = () => {
  const stop = vi.fn();
  const port: Port = {
    add: async (a, b) => a + b,
    watch: vi.fn((_id: string, cb: (v: number) => void) => {
      cb(7);
      return stop;
    }),
  };
  return { port, stop };
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};

describe('lazyPort', () => {
  it('loads when the first call needs it and forwards the arguments', async () => {
    const { port } = impl();
    const load = vi.fn().mockResolvedValue(port);
    const lazy = lazyPort<Port>(load, ['watch']);
    expect(load).not.toHaveBeenCalled();
    expect(await lazy.add(2, 3)).toBe(5);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('starts a watcher once loaded and unsubscribes it', async () => {
    const { port, stop } = impl();
    const cb = vi.fn();
    const off = lazyPort<Port>(() => Promise.resolve(port), ['watch']).watch('x', cb);
    await flush();
    expect(port.watch).toHaveBeenCalledWith('x', cb);
    expect(cb).toHaveBeenCalledWith(7);
    off();
    expect(stop).toHaveBeenCalled();
  });

  it('stops a watcher at once when the caller left before the load finished', async () => {
    const { port, stop } = impl();
    const off = lazyPort<Port>(() => Promise.resolve(port), ['watch']).watch('x', vi.fn());
    off();
    await flush();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
