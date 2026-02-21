import { useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { activeSessionId, activeSection } from '../state/store';
import { sendTerminalInput, getTerminalBuffer, scrollToBottom, fitTerminal, repaintTerminal, onTerminalWrite } from '../terminal';

// Escape sequences for special keys
const SPECIAL_KEYS: Record<string, string> = {
  ArrowUp: '\x1b[A',
  ArrowDown: '\x1b[B',
  ArrowRight: '\x1b[C',
  ArrowLeft: '\x1b[D',
  Enter: '\r',
  Tab: '\t',
  Escape: '\x1b',
  Backspace: '\x7f',
  Delete: '\x1b[3~',
};

// Direct shortcuts — no modifier combos, just tap and send
const SHORTCUTS = [
  { id: 'ctrl-c', seq: '\x03', label: '^C', desc: 'Cancel' },
  { id: 'ctrl-u', seq: '\x15', label: '^U', desc: 'Kill line' },
  { id: 'ctrl-d', seq: '\x04', label: '^D', desc: 'EOF' },
  { id: 'ctrl-l', seq: '\x0c', label: '^L', desc: 'Clear' },
  { id: 'ctrl-a', seq: '\x01', label: '^A', desc: 'Home' },
  { id: 'ctrl-e', seq: '\x05', label: '^E', desc: 'End' },
  { id: 'ctrl-r', seq: '\x12', label: '^R', desc: 'Search' },
  { id: 'ctrl-w', seq: '\x17', label: '^W', desc: 'Del word' },
  { id: 'paste', seq: 'CLIPBOARD_PASTE', label: '^V', desc: 'Paste' },
] as const;

// Sentinel character kept in hidden input so backspace always fires an event.
// Without this, pressing backspace on an empty input does nothing on mobile.
const SENTINEL = '\u200B'; // Zero-width space

/**
 * Unified tap handler using Pointer Events. Handles mouse, touch, and stylus
 * in a single code path. preventDefault stops the browser from opening the
 * keyboard or firing redundant events.
 *
 * IMPORTANT: do NOT blur mobile-hidden-input here. Any blur without an
 * immediate re-focus disconnects keyboard events — the user can see the
 * keyboard but keystrokes reach no handler (freeze). Re-focus after fn()
 * to keep the hidden input connected even after toolbar button taps.
 */
function tap(fn: () => void) {
  return {
    onPointerUp: (e: PointerEvent) => {
      e.preventDefault();
      fn();
      // Re-focus hidden input so keyboard events keep flowing after toolbar tap.
      // Without this, the input stays blurred and the user must tap the terminal
      // area to recover — which looks like an input freeze.
      const input = document.getElementById('mobile-hidden-input') as HTMLInputElement | null;
      input?.focus();
    },
  };
}

// Debounced fitTerminal: collapses overlapping calls into one, firing 350ms after
// the last recalcLayout. Prevents reflow thrashing when multiple layout events
// (visualViewport resize, onFocus, etc.) fire in rapid succession during typing.
let fitDebounceTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedFitTerminal(sessionId: string): void {
  if (fitDebounceTimer) clearTimeout(fitDebounceTimer);
  fitDebounceTimer = setTimeout(() => {
    fitDebounceTimer = null;
    fitTerminal(sessionId);
  }, 350);
}

/** Calculate and set terminal height to fill space between tabs and toolbar. */
function recalcLayout(sessionId: string | undefined) {
  const vh = window.visualViewport?.height ?? window.innerHeight;
  const tabs = document.querySelector('.terminal-tabs');
  const toolbar = document.querySelector('.mobile-toolbar');
  const instances = document.querySelector('.terminal-instances') as HTMLElement | null;
  if (!instances) return;

  const tabsH = tabs?.getBoundingClientRect().height ?? 0;

  // getBoundingClientRect() returns coordinates relative to the visual viewport.
  // When the keyboard is open, the toolbar (position:fixed; bottom:0) may be below
  // the visual viewport on Android (fixed to layout viewport, not visual viewport).
  // On iOS Safari it stays above the keyboard. Only subtract toolbar height if it's
  // actually visible in the current visual viewport.
  const toolbarRect = toolbar?.getBoundingClientRect();
  const toolbarInView = toolbarRect ? toolbarRect.top < vh - 10 : false;
  const toolbarH = toolbarInView ? (toolbarRect?.height ?? 0) : 0;

  // If .terminal-tabs has zero height the Claude section is hidden (display:none
  // parent). In that case tabsH=0 so we'd compute an oversized available height,
  // causing fitTerminal to resize the terminal to too many rows. Use an estimated
  // tab bar height instead so the height stored in CSS is close to correct, and
  // skip fitTerminal (wrong dims would be sent as SIGWINCH to the PTY).
  const tabsVisible = tabsH > 0;
  const effectiveTabsH = tabsVisible ? tabsH : 44; // 44px typical mobile tab bar
  const available = Math.max(50, vh - effectiveTabsH - toolbarH - 2);

  console.debug(`[recalcLayout] vh=${vh} tabsH=${tabsH} (visible=${tabsVisible}) toolbarH=${toolbarH} available=${available} sessionId=${sessionId?.slice(0,6)}`);
  instances.style.height = `${available}px`;
  instances.style.maxHeight = `${available}px`;

  // Only call fitTerminal when the section is actually visible — otherwise the
  // container dimensions are estimated and would produce incorrect cols/rows.
  if (sessionId && tabsVisible) {
    requestAnimationFrame(() => scrollToBottom(sessionId));
    debouncedFitTerminal(sessionId);
  }
}

export function MobileTerminalToolbar() {
  const [expanded, setExpanded] = useState(() => {
    try { return localStorage.getItem('codeck-mobile-keys') !== 'hidden'; }
    catch { return true; }
  });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [adaptiveMode, setAdaptiveMode] = useState<'default' | 'yesno'>('default');
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout>>();

  const sessionId = activeSessionId.value;

  // --- Sentinel management ---

  const resetInput = useCallback(() => {
    const el = hiddenInputRef.current;
    if (el) {
      el.value = SENTINEL;
      el.setSelectionRange(1, 1);
    }
  }, []);

  // --- Core helpers ---

  const send = useCallback((data: string) => {
    if (sessionId) {
      sendTerminalInput(sessionId, data);
      scrollToBottom(sessionId);
    }
  }, [sessionId]);

  const showFeedback = useCallback((text: string) => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback(text);
    feedbackTimer.current = setTimeout(() => setFeedback(null), 800);
  }, []);

  // --- Toggle show/hide (persisted) ---

  const toggleExpanded = useCallback(() => {
    setExpanded(prev => {
      const next = !prev;
      try { localStorage.setItem('codeck-mobile-keys', next ? 'visible' : 'hidden'); } catch {}
      return next;
    });
  }, []);

  // --- Hidden input handlers ---

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.isComposing) return;
    if (e.key in SPECIAL_KEYS) {
      e.preventDefault();
      send(SPECIAL_KEYS[e.key]);
      resetInput();
      return;
    }
  }, [send, resetInput]);

  const handleInput = useCallback((e: Event) => {
    const target = e.target as HTMLInputElement;
    const inputEvent = e as InputEvent;
    if (inputEvent.inputType === 'deleteContentBackward') {
      send('\x7f');
      resetInput();
      return;
    }
    // Extract only new text (after sentinel)
    const raw = target.value;
    const text = raw.startsWith(SENTINEL) ? raw.slice(SENTINEL.length) : raw;
    if (text) send(text);
    resetInput();
  }, [send, resetInput]);

  // --- Button handlers ---

  const handleNavKey = useCallback((key: string) => {
    if (key in SPECIAL_KEYS) send(SPECIAL_KEYS[key]);
  }, [send]);

  const handlePaste = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        send(text);
        showFeedback('Pasted');
      }
    } catch {
      hiddenInputRef.current?.focus();
      showFeedback('Long-press to paste');
    }
  }, [send, showFeedback]);

  const handleShortcut = useCallback((seq: string, label: string) => {
    if (seq === 'CLIPBOARD_PASTE') {
      handlePaste();
      return;
    }
    send(seq);
    showFeedback(label);
  }, [send, showFeedback, handlePaste]);

  const handleQuickResponse = useCallback((char: string) => {
    send(char + '\r');
    showFeedback(char.toUpperCase());
  }, [send, showFeedback]);

  // --- Layout: calculate terminal height to fill space above fixed toolbar ---

  useEffect(() => {
    // Call immediately so .terminal-instances gets its explicit height BEFORE any
    // rAF callbacks run (fitTerminal bails if container height is 0). The 50ms
    // delay that was here caused fitTerminal to bail in ClaudeSection's useEffect
    // rAF (~16ms), leaving the terminal at xterm's default 80×24 dims → black screen.
    recalcLayout(sessionId);
    // Schedule a settle recalc for after fonts/layout finish loading.
    const timer = setTimeout(() => recalcLayout(sessionId), 150);
    return () => clearTimeout(timer);
  }, [expanded, sessionId]);

  useEffect(() => {
    let settleTimer: ReturnType<typeof setTimeout>;
    const handler = () => {
      // Fire immediately for a responsive feel during keyboard animation,
      // then schedule a final recalc after events settle (keyboard fully open/closed).
      recalcLayout(sessionId);
      clearTimeout(settleTimer);
      settleTimer = setTimeout(() => recalcLayout(sessionId), 150);
    };
    window.visualViewport?.addEventListener('resize', handler);
    window.addEventListener('resize', handler);
    return () => {
      clearTimeout(settleTimer);
      window.visualViewport?.removeEventListener('resize', handler);
      window.removeEventListener('resize', handler);
    };
  }, [sessionId]);

  // --- Recalc when section switches to 'claude' ---
  // When the user navigates to the Claude section, .terminal-tabs becomes visible
  // and getBoundingClientRect() returns its real height. Recalc so the terminal
  // gets its correct explicit height and fitTerminal sends the right SIGWINCH.
  // Also call repaintTerminal to ensure scroll position is correct (without it,
  // the terminal may show ydisp=0 / top of scrollback instead of the current output).
  const currentSection = activeSection.value;
  useEffect(() => {
    if (currentSection === 'claude') {
      recalcLayout(sessionId);
      // After recalcLayout sets correct height and its 250ms fitTerminal runs,
      // call repaintTerminal to force xterm to scroll to the current output position.
      const t = setTimeout(() => {
        recalcLayout(sessionId);
        if (sessionId) repaintTerminal(sessionId);
      }, 350);
      return () => clearTimeout(t);
    }
  }, [currentSection, sessionId]);

  // --- Adaptive prompt detection (event-driven, not polling) ---

  useEffect(() => {
    if (!sessionId) return;
    const YN_PATTERN = /\(y\/n\)|\[y\/n\]|\[Y\/n\]|\[y\/N\]/i;

    // Check on mount for current buffer state
    const lines = getTerminalBuffer(sessionId);
    setAdaptiveMode(YN_PATTERN.test(lines.join('\n')) ? 'yesno' : 'default');

    // Throttle buffer reads: getTerminalBuffer() iterates xterm's line buffer and
    // runs synchronously in the WS onmessage handler. During heavy streaming output,
    // calling it on every newline saturates the main thread and causes input freezes.
    let bufferCheckTimer: ReturnType<typeof setTimeout> | null = null;

    return onTerminalWrite((sid, data) => {
      if (sid !== sessionId) return;
      // Check incoming data chunk first (fast path — no buffer read needed)
      if (YN_PATTERN.test(data)) {
        if (bufferCheckTimer) { clearTimeout(bufferCheckTimer); bufferCheckTimer = null; }
        setAdaptiveMode('yesno');
        return;
      }
      // On newline/enter, re-check buffer — but throttle to avoid main-thread pressure.
      if (data.includes('\r') || data.includes('\n')) {
        if (bufferCheckTimer) return; // already scheduled
        bufferCheckTimer = setTimeout(() => {
          bufferCheckTimer = null;
          const current = getTerminalBuffer(sessionId);
          setAdaptiveMode(YN_PATTERN.test(current.join('\n')) ? 'yesno' : 'default');
        }, 300);
      }
    });
  }, [sessionId]);

  return (
    <>
      {/* Offscreen hidden input — captures native keyboard */}
      <input
        ref={hiddenInputRef}
        id="mobile-hidden-input"
        type="text"
        class="mobile-hidden-input"
        autocomplete="off"
        autocorrect="off"
        autocapitalize="off"
        spellcheck={false}
        enterkeyhint="send"
        aria-label="Terminal keyboard input"
        role="textbox"
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        onFocus={() => {
          resetInput();
          if (sessionId) scrollToBottom(sessionId);
          // visualViewport.resize already handles keyboard-open layout updates
          // with its own debounce — no extra timers needed here. They were the
          // primary source of reflow thrashing during active typing.
        }}
        onBlur={() => {
          // Keyboard closing — recalc at multiple points to catch slow animations.
          setTimeout(() => recalcLayout(sessionId), 300);
          setTimeout(() => recalcLayout(sessionId), 500);
        }}
      />

      {/* Visual feedback popup */}
      {feedback && (
        <div class="mobile-key-feedback" key={feedback + Date.now()}>
          {feedback}
        </div>
      )}

      {/* Fixed toolbar */}
      <div class={`mobile-toolbar${expanded ? '' : ' collapsed'}`} role="toolbar" aria-label="Terminal controls">
        {expanded ? (
          <>
            {/* Row 1: Navigation + collapse toggle */}
            <div class="mobile-toolbar-row">
              {([
                ['ArrowUp', '↑'],
                ['ArrowDown', '↓'],
                ['ArrowLeft', '←'],
                ['ArrowRight', '→'],
              ] as const).map(([key, symbol]) => (
                <button key={key} class="mobile-nav-key" {...tap(() => handleNavKey(key))} aria-label={key}>
                  {symbol}
                </button>
              ))}
              <button class="mobile-nav-key primary" {...tap(() => handleNavKey('Enter'))} aria-label="Enter">
                ↵
              </button>
              <button class="mobile-nav-key" {...tap(() => handleNavKey('Tab'))} aria-label="Tab">
                ⇥
              </button>
              <button class="mobile-nav-key esc" {...tap(() => handleNavKey('Escape'))} aria-label="Escape">
                ESC
              </button>
              <button class="mobile-toggle-btn" {...tap(toggleExpanded)} aria-label="Hide keys">
                ▾
              </button>
            </div>

            {/* Row 2: Shortcuts (or adaptive Y/N) */}
            <div class="mobile-toolbar-row">
              {adaptiveMode === 'yesno' ? (
                <>
                  <button class="mobile-shortcut-key yes" {...tap(() => handleQuickResponse('y'))} aria-label="Yes">
                    <span class="mobile-shortcut-label">Y</span>
                    <span class="mobile-shortcut-desc">Yes</span>
                  </button>
                  <button class="mobile-shortcut-key no" {...tap(() => handleQuickResponse('n'))} aria-label="No">
                    <span class="mobile-shortcut-label">N</span>
                    <span class="mobile-shortcut-desc">No</span>
                  </button>
                </>
              ) : (
                SHORTCUTS.map(({ id, seq, label, desc }) => (
                  <button key={id} class="mobile-shortcut-key" {...tap(() => handleShortcut(seq, label))} aria-label={desc}>
                    <span class="mobile-shortcut-label">{label}</span>
                    <span class="mobile-shortcut-desc">{desc}</span>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <button class="mobile-collapsed-bar" {...tap(toggleExpanded)} aria-label="Show special keys">
            <span>Special Keys</span>
            <span class="mobile-collapsed-chevron">▴</span>
          </button>
        )}
      </div>
    </>
  );
}
