import { DEFAULT_UPLOAD_LIMITS, uploadPolicy } from '@gurukul/schema';
import { renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { DataProvider } from '../src/data/DataProvider';
import { useUploadPolicy } from '../src/data/useUploadPolicy';
import { fakeData } from './fake-data';

const wrap = (data: ReturnType<typeof fakeData>['data']) =>
  function Wrapper({ children }: { children: ReactNode }) {
    return <DataProvider data={data}>{children}</DataProvider>;
  };

describe('useUploadPolicy', () => {
  it('starts on the defaults, then holds the lowered limits', async () => {
    const { data } = fakeData({ uploadLimits: { imageMaxKB: 300, pdfMaxKB: 800 } });
    const { result } = renderHook(() => useUploadPolicy(), { wrapper: wrap(data) });
    expect(result.current.status).toBe('loading');
    expect(result.current.policy).toEqual(uploadPolicy(DEFAULT_UPLOAD_LIMITS));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.policy.image.maxBytes).toBe(300 * 1024);
    expect(result.current.policy.pdf.maxBytes).toBe(800 * 1024);
  });

  it('is the defaults when nothing is saved', async () => {
    const { data } = fakeData();
    const { result } = renderHook(() => useUploadPolicy(), { wrapper: wrap(data) });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.policy).toEqual(uploadPolicy());
  });

  it('falls back to the defaults when the read fails, and reads again next time', async () => {
    const { data } = fakeData();
    vi.mocked(data.uploadLimits).mockRejectedValueOnce(new Error('offline'));
    const first = renderHook(() => useUploadPolicy(), { wrapper: wrap(data) });
    await waitFor(() => expect(first.result.current.status).toBe('error'));
    expect(first.result.current.policy).toEqual(uploadPolicy());
    first.unmount();
    const second = renderHook(() => useUploadPolicy(), { wrapper: wrap(data) });
    await waitFor(() => expect(second.result.current.status).toBe('ready'));
    expect(data.uploadLimits).toHaveBeenCalledTimes(2);
  });

  it('reads config/org once however many callers there are', async () => {
    const { data } = fakeData();
    const a = renderHook(() => useUploadPolicy(), { wrapper: wrap(data) });
    const b = renderHook(() => useUploadPolicy(), { wrapper: wrap(data) });
    await waitFor(() => expect(a.result.current.status).toBe('ready'));
    await waitFor(() => expect(b.result.current.status).toBe('ready'));
    expect(data.uploadLimits).toHaveBeenCalledTimes(1);
  });

  it('ignores a read that lands after unmount', async () => {
    const { data } = fakeData();
    const { unmount } = renderHook(() => useUploadPolicy(), { wrapper: wrap(data) });
    unmount();
    await Promise.resolve();
    expect(data.uploadLimits).toHaveBeenCalled();
  });
});
