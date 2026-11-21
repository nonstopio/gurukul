import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  ArrowUpIcon,
  ChatActivity,
  ChatAttachments,
  ChatChanges,
  ChatCheck,
  ChatComposer,
  ChatLog,
  ChatMessage,
  ChatRoundButton,
  ChatSteps,
  ChatTurn,
  ChatTurnFooter,
  chatRoundClass,
} from '../src';
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

describe('a turn', () => {
  it('folds its steps away behind a button that says whether it is open', async () => {
    const { container } = render(
      <ChatSteps label="How it got there" steps={['Reading', 'Writing']} />,
    );
    const button = screen.getByRole('button', { name: 'How it got there' });
    expect(button.getAttribute('aria-expanded')).toBe('false');
    expect(container.querySelector('ol')?.hasAttribute('hidden')).toBe(true);
    fireEvent.click(button);
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(container.querySelector('ol')?.hasAttribute('hidden')).toBe(false);
    expect(button.getAttribute('aria-controls')).toBe(container.querySelector('ol')?.id);
    expect(screen.getAllByRole('listitem').map((i) => i.textContent)).toEqual([
      'Reading',
      'Writing',
    ]);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('lists what changed, the first rows and a pill for the rest', async () => {
    const items = Array.from({ length: 4 }, (_, i) => ({
      id: `${i}`,
      icon: <span />,
      label: `Edited part ${i}`,
      detail: '2 min ago',
    }));
    const { container } = render(
      <ChatChanges label="What this turn changed" items={items} limit={2} className="c" />,
    );
    const list = screen.getByRole('list', { name: 'What this turn changed' });
    expect(list.className).toBe('g-chat-changes c');
    expect(within(list).getAllByText(/^Edited part/)).toHaveLength(2);
    const more = screen.getByRole('button', { name: '+2 more' });
    expect(more.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(more);
    expect(within(list).getAllByText(/^Edited part/)).toHaveLength(4);
    expect(more.textContent).toBe('Show fewer');
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(more);
    expect(within(list).getAllByText(/^Edited part/)).toHaveLength(2);
  });

  it('shows six rows by default with no pill when they all fit, and nothing when empty', () => {
    const items = Array.from({ length: 6 }, (_, i) => ({
      id: `${i}`,
      icon: null,
      label: `L${i}`,
      detail: '',
    }));
    const { rerender, container } = render(<ChatChanges label="Changed" items={items} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getAllByRole('listitem')).toHaveLength(6);
    rerender(<ChatChanges label="Changed" items={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('has a muted footer with actions at its end, and a check in words', async () => {
    const { container } = render(
      <ol>
        <ChatTurn>
          <ChatTurnFooter end={<button type="button">Go back</button>} className="f">
            Worked for 1m, 2 changes
          </ChatTurnFooter>
          <ChatTurnFooter>No end</ChatTurnFooter>
          <ChatCheck ok>Checked: no new problems</ChatCheck>
          <ChatCheck ok={false} className="x">
            Checked: problems to fix
          </ChatCheck>
        </ChatTurn>
      </ol>,
    );
    expect(container.querySelector('.g-chat-turn__foot.f .g-chat-turn__end')?.textContent).toBe(
      'Go back',
    );
    expect(container.querySelectorAll('.g-chat-turn__end')).toHaveLength(1);
    expect(container.querySelectorAll('.g-chat-check')).toHaveLength(2);
    expect(container.querySelector('.g-chat-check--problem.x')).not.toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });
});

describe('ChatComposer', () => {
  function Box({ onSend, onSubmit }: { onSend: () => void; onSubmit?: () => void }) {
    const [text, setText] = useState('');
    return (
      <ChatComposer
        label="Ask for a change"
        placeholder="Ask…"
        hint="Enter sends."
        value={text}
        onChange={setText}
        onSend={onSend}
        {...(onSubmit ? { onSubmit } : {})}
        maxLength={50}
        start={<ChatRoundButton label="Add">+</ChatRoundButton>}
        end={
          <ChatRoundButton label="Send" tone="primary" type="submit" className="s">
            <ArrowUpIcon />
          </ChatRoundButton>
        }
      >
        <p>Attached</p>
      </ChatComposer>
    );
  }

  it('is a labelled box with a hint read out, the start and end slots, and the children above', async () => {
    const { container } = render(<Box onSend={() => {}} />);
    const text = screen.getByRole('textbox', { name: 'Ask for a change' });
    expect(text.getAttribute('aria-describedby')).toBe(screen.getByText('Enter sends.').id);
    expect(text.getAttribute('placeholder')).toBe('Ask…');
    expect(text.getAttribute('maxlength')).toBe('50');
    expect(screen.getByRole('button', { name: 'Add' }).className).toBe(
      'g-chat-round g-chat-round--plain',
    );
    expect(screen.getByRole('button', { name: 'Send' }).className).toBe(
      'g-chat-round g-chat-round--primary s',
    );
    expect(screen.getByRole('button', { name: 'Send' }).getAttribute('data-tip')).toBe('Send');
    expect(chatRoundClass()).toBe('g-chat-round g-chat-round--plain');
    expect(container.querySelector('form > p')?.textContent).toBe('Attached');
    expect(await axeViolations(container)).toEqual([]);
  });

  it('sends on Enter, not on Shift and Enter, and not while composing', () => {
    const onSend = vi.fn();
    render(<Box onSend={onSend} />);
    const text = screen.getByRole('textbox');
    fireEvent.change(text, { target: { value: 'hi' } });
    expect((text as HTMLTextAreaElement).value).toBe('hi');
    fireEvent.keyDown(text, { key: 'a' });
    fireEvent.keyDown(text, { key: 'Enter', shiftKey: true });
    fireEvent.keyDown(text, { key: 'Enter', isComposing: true });
    expect(onSend).not.toHaveBeenCalled();
    fireEvent.keyDown(text, { key: 'Enter' });
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('hands the form’s submit to its caller', () => {
    const onSubmit = vi.fn();
    render(<Box onSend={() => {}} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
