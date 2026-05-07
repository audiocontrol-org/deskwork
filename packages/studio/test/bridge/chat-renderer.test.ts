/**
 * @vitest-environment jsdom
 *
 * Renderer-only tests for chat-renderer. Scope: pure HTML output for
 * each ChatLogRow discriminant, the four BridgeState combinations,
 * and an XSS regression that ensures operator/agent text is escaped.
 *
 * The chat-panel orchestrator (EventSource subscription, scroll
 * stickiness, draft persistence, mobile breakpoint) is covered by
 * the local end-to-end smoke in Phase 8. jsdom is unsuitable for
 * EventSource + timer behavior.
 */

import { describe, it, expect } from 'vitest';
import {
  renderRow,
  renderBridgeState,
  type AgentToolUseEvent,
  type AgentProseEvent,
  type CorruptionMarker,
  type OperatorMessage,
  type BridgeState,
} from '../../../../plugins/deskwork-studio/public/src/chat-renderer';

function operator(over: Partial<OperatorMessage> = {}): OperatorMessage {
  return { seq: 1, ts: Date.now(), role: 'operator', text: 'hello', ...over };
}

function prose(over: Partial<AgentProseEvent> = {}): AgentProseEvent {
  return { kind: 'prose', seq: 2, ts: Date.now(), text: 'hi back', ...over };
}

function tool(over: Partial<AgentToolUseEvent> = {}): AgentToolUseEvent {
  return {
    kind: 'tool-use',
    seq: 3,
    ts: Date.now(),
    tool: 'Read',
    args: { path: '/x' },
    ...over,
  };
}

describe('renderRow — operator', () => {
  it('produces a right-aligned bubble with HTML-escaped text', () => {
    const html = renderRow(operator({ text: 'Hello & welcome' }));
    expect(html).toContain('chat-row--operator');
    expect(html).toContain('Hello &amp; welcome');
  });

  it('shows contextRef as a subtitle when present', () => {
    const html = renderRow(operator({ contextRef: 'entry/abc' }));
    expect(html).toContain('chat-row-context');
    expect(html).toContain('entry/abc');
  });

  it('omits contextRef block when absent', () => {
    const html = renderRow(operator());
    expect(html).not.toContain('chat-row-context');
  });
});

describe('renderRow — prose', () => {
  it('renders markdown for agent prose', () => {
    const html = renderRow(prose({ text: '**bold** and `code`' }));
    expect(html).toContain('chat-row--prose');
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<code>code</code>');
  });

  it('renders headings via markdown', () => {
    const html = renderRow(prose({ text: '## Section' }));
    expect(html).toContain('<h2>Section</h2>');
  });
});

describe('renderRow — tool-use', () => {
  it('renders compact card with tool name and pill', () => {
    const html = renderRow(tool({ status: 'starting' }));
    expect(html).toContain('chat-row--tool');
    expect(html).toContain('chat-tool-card');
    expect(html).toContain('chat-tool-pill--starting');
    expect(html).toContain('<code class="chat-tool-name">Read</code>');
  });

  it('expands by default when status is starting', () => {
    const html = renderRow(tool({ status: 'starting' }));
    expect(html).toMatch(/<details[^>]*open/);
  });

  it('collapses by default when status is done', () => {
    const html = renderRow(tool({ status: 'done', result: { ok: true } }));
    expect(html).toContain('chat-tool-pill--done');
    expect(html).not.toMatch(/<details[^>]*open/);
  });

  it('expands and applies error styling when status is error', () => {
    const html = renderRow(tool({ status: 'error', result: 'boom' }));
    expect(html).toContain('chat-tool-pill--error');
    expect(html).toContain('chat-tool-card--error');
    expect(html).toMatch(/<details[^>]*open/);
  });

  it('renders the result section when result is present', () => {
    const html = renderRow(tool({ status: 'done', result: { value: 1 } }));
    expect(html).toContain('result');
    // JSON keys are HTML-escaped (quotes become &quot;) since the JSON is
    // emitted into a <pre> in the document tree.
    expect(html).toContain('&quot;value&quot;: 1');
  });

  it('omits result section when result is undefined', () => {
    const html = renderRow(tool({ status: 'starting' }));
    expect(html).toContain('args');
    // No result label inside this output.
    expect(html.match(/chat-tool-label">result/)).toBeNull();
  });
});

describe('renderRow — corruption-marker', () => {
  it('produces the warning row with from/to seq', () => {
    const marker: CorruptionMarker = {
      kind: 'corruption-marker',
      from: 5,
      to: 9,
      ts: Date.now(),
    };
    const html = renderRow(marker);
    expect(html).toContain('chat-row--marker');
    expect(html).toContain('chat-corruption');
    expect(html).toContain('5');
    expect(html).toContain('9');
  });
});

describe('renderRow — XSS regression', () => {
  it('escapes <script> in operator text', () => {
    const html = renderRow(operator({ text: '<script>alert(1)</script>' }));
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes html in contextRef', () => {
    const html = renderRow(operator({ contextRef: '<img src=x onerror=alert(1)>' }));
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('escapes html in tool name and args', () => {
    const html = renderRow(
      tool({
        tool: '<svg/onload=alert(1)>',
        args: { '<x>': '<y>' },
        status: 'starting',
      }),
    );
    expect(html).not.toContain('<svg/onload');
    expect(html).toContain('&lt;svg');
    expect(html).toContain('&lt;x&gt;');
  });
});

describe('renderBridgeState', () => {
  function state(over: Partial<BridgeState> = {}): BridgeState {
    return {
      mcpConnected: false,
      listenModeOn: false,
      awaitingMessage: false,
      ...over,
    };
  }

  it('renders offline chip when not connected', () => {
    const html = renderBridgeState(state());
    expect(html).toContain('chat-state-chip--offline');
    expect(html).toContain('Bridge offline');
  });

  it('renders connected chip when connected but not listening', () => {
    const html = renderBridgeState(state({ mcpConnected: true }));
    expect(html).toContain('chat-state-chip--connected');
    expect(html).toContain('Agent connected, not listening');
  });

  it('renders listening chip when listening with no awaiting message', () => {
    const html = renderBridgeState(state({ mcpConnected: true, listenModeOn: true }));
    expect(html).toContain('chat-state-chip--listening');
    expect(html).toContain('Listening');
    expect(html).not.toContain('chat-state-chip--listening-active');
  });

  it('renders pulse chip when listening and awaiting message', () => {
    const html = renderBridgeState(
      state({ mcpConnected: true, listenModeOn: true, awaitingMessage: true }),
    );
    expect(html).toContain('chat-state-chip--listening-active');
    expect(html).toContain('chat-state-chip--pulse');
    expect(html).toContain('awaiting');
  });
});
