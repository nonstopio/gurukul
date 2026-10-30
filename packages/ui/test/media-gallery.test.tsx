import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MediaGallery, MediaPreview, mediaKindName } from '../src';
import type { MediaGalleryItem, MediaKind } from '../src';
import { axeViolations } from './axe';

const items: MediaGalleryItem[] = [
  { id: 'a', name: 'banner.png', meta: 'Image · 2 courses', kind: 'image', url: 'https://x/a.png' },
  { id: 'b', name: 'intro.mp4', meta: 'Video', kind: 'video' },
  { id: 'c', name: 'guide.pdf', meta: 'PDF', kind: 'pdf' },
];

describe('MediaGallery', () => {
  it('lists a tile per item: a thumbnail for an image, a typed tile for the rest', async () => {
    const { container } = render(
      <MediaGallery label="Media" items={items} selectedId="b" onSelect={() => {}} />,
    );
    expect(screen.getAllByRole('button')).toHaveLength(3);
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://x/a.png');
    expect(screen.getByRole('button', { name: /intro\.mp4/ }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('button', { name: /banner/ }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(await axeViolations(container)).toEqual([]);
  });

  it('reports the chosen item', () => {
    const onSelect = vi.fn();
    render(<MediaGallery label="Media" items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: /guide\.pdf/ }));
    expect(onSelect).toHaveBeenCalledWith(items[2]);
  });
});

describe('MediaPreview', () => {
  it('falls back to the typed tile when the image does not load', () => {
    const { container } = render(
      <MediaPreview kind="image" url="https://x/broken.png" size="large" />,
    );
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('Image')).toBeTruthy();
    expect(container.firstElementChild?.className).toContain('g-media__preview--large');
  });

  it('shows a typed tile without an address, and names every kind', () => {
    render(<MediaPreview kind="audio" />);
    expect(screen.getByText('Audio')).toBeTruthy();
    const kinds: MediaKind[] = ['image', 'video', 'embed', 'pdf', 'audio', 'file'];
    expect(kinds.map(mediaKindName)).toEqual(['Image', 'Video', 'Embed', 'PDF', 'Audio', 'File']);
  });
});
