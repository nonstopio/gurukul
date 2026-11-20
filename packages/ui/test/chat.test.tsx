import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ChatActivity, ChatAttachments, ChatLog, ChatMessage, ChatTurn } from '../src';
import { axeViolations } from './axe';

describe('Chat', () => {
  it('is a named log of messages, each saying who said it in words', async () => {
    const { container } = render(
      <>
        <ChatLog label="Chat with the agent" className="x">
          <ChatMessage from="you" author="You">
            Simplify the rebase chapter.
          </ChatMessage>
          <ChatMessage from="agent" author="Agent" id="reply">
            <p>I rewrote three lessons.</p>
          </ChatMessage>
          <ChatTurn className="t">
            Turn 1 · 3 changes <button type="button">Undo</button>
          </ChatTurn>
          <ChatMessage from="notice">Stopped. What this turn had changed is kept.</ChatMessage>
        </ChatLog>
        <ChatActivity>Rewriting a lesson</ChatActivity>
      </>,
    );
    const log = screen.getByRole('log', { name: 'Chat with the agent' });
    expect(log.className).toBe('g-chat-log x');
    expect(log.firstElementChild?.tagName).toBe('OL');
    const items = within(log).getAllByRole('listitem');
    expect(items.map((i) => i.className)).toEqual([
      'g-chat-msg g-chat-msg--you',
      'g-chat-msg g-chat-msg--agent',
      'g-chat-turn t',
      'g-chat-msg g-chat-msg--notice',
    ]);
    expect(items[0]?.textContent).toBe('YouSimplify the rebase chapter.');
    expect(items[1]?.id).toBe('reply');
    expect(items[1]?.querySelector('.g-chat-msg__who')?.textContent).toBe('Agent');
    // A notice leads with a decorative icon instead of an author.
    expect(items[3]?.querySelector('.g-chat-msg__who')).toBeNull();
    expect(items[3]?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    const status = screen.getByRole('status');
    expect(status.textContent).toBe('Rewriting a lesson');
    expect(status.querySelector('svg')).not.toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it.each([undefined, null, ''])('keeps the activity line, empty, between turns (%s)', (value) => {
    render(<ChatActivity className="a">{value}</ChatActivity>);
    const status = screen.getByRole('status');
    expect(status.className).toBe('g-chat-activity a');
    expect(status.childNodes).toHaveLength(0);
  });
});

function Attached({ onEmptied }: { onEmptied?: () => void }) {
  const [items, setItems] = useState([
    { id: 'a', label: 'Lesson 3.2 · Text block 2' },
    { id: 'b', label: 'Quiz 2.4 · Question 3' },
    { id: 'c', label: 'Chapter 2 · Rebase' },
  ]);
  return (
    <ChatAttachments
      label="Attached to your next message"
      items={items}
      onRemove={(id) => setItems((now) => now.filter((i) => i.id !== id))}
      {...(onEmptied ? { onEmptied } : {})}
      className="x"
    />
  );
}

describe('ChatAttachments', () => {
  it('names each attached part on a chip, and removes it with its button', async () => {
    const onEmptied = vi.fn();
    const { container } = render(<Attached onEmptied={onEmptied} />);
    const list = screen.getByRole('list', { name: 'Attached to your next message' });
    expect(list.className).toBe('g-chat-attachments x');
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((i) => i.textContent),
    ).toEqual(['Lesson 3.2 · Text block 2', 'Quiz 2.4 · Question 3', 'Chapter 2 · Rebase']);
    expect(await axeViolations(container)).toEqual([]);

    // Focus goes to the chip that takes the removed one's place.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Quiz 2.4 · Question 3' }));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Remove Chapter 2 · Rebase' }),
    );
    // The last one removed: focus goes to the one before it.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Chapter 2 · Rebase' }));
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Remove Lesson 3.2 · Text block 2' }),
    );
    expect(onEmptied).not.toHaveBeenCalled();
    // None left: the caller moves focus.
    fireEvent.click(screen.getByRole('button', { name: 'Remove Lesson 3.2 · Text block 2' }));
    expect(screen.queryByRole('list')).toBeNull();
    expect(onEmptied).toHaveBeenCalledOnce();
  });

  it('lets the last chip go without an onEmptied', () => {
    render(<Attached />);
    for (const name of ['Lesson 3.2 · Text block 2', 'Quiz 2.4 · Question 3', 'Chapter 2 · Rebase'])
      fireEvent.click(screen.getByRole('button', { name: `Remove ${name}` }));
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('only says what a sent message carried, without remove buttons', () => {
    render(<ChatAttachments label="Attached" items={[{ id: 'a', label: 'Landing page' }]} />);
    expect(screen.getByRole('list', { name: 'Attached' }).textContent).toBe('Landing page');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('draws nothing when nothing is attached', () => {
    const { container } = render(<ChatAttachments label="Attached" items={[]} />);
    expect(container.childNodes).toHaveLength(0);
  });
});
