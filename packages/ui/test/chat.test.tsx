import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ChatActivity, ChatLog, ChatMessage, ChatTurn } from '../src';
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
