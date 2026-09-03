import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import {
  Terminal as TerminalIcon,
  RefreshCw,
  Trash2,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  ArrowLeft,
  TerminalSquare,
  FileText
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { useTheme } from '../theme/ThemeContext';
import { TerminalAccessoryBar } from './terminal/TerminalAccessoryBar';
import { TerminalSnippetsDrawer } from './terminal/TerminalSnippetsDrawer';
import { isSyntheticTerminalReport } from '../utils/terminalFilter';
import { encodeModifierKey } from '../utils/terminalKeyEncoder';

const DARK_TERMINAL_THEME = {
  background: '#090A0F',
  foreground: '#F1F5F9',
  cursor: '#818CF8',
  cursorAccent: '#090A0F',
  selectionBackground: 'rgba(99, 102, 241, 0.4)',
  black: '#090A0F',
  red: '#F43F5E',
  green: '#10B981',
  yellow: '#F59E0B',
  blue: '#6366F1',
  magenta: '#D946EF',
  cyan: '#06B6D4',
  white: '#F8FAFC',
  brightBlack: '#475569',
  brightRed: '#FB7185',
  brightGreen: '#34D399',
  brightYellow: '#FBBF24',
  brightBlue: '#818CF8',
  brightMagenta: '#E879F9',
  brightCyan: '#22D3EE',
  brightWhite: '#FFFFFF',
};

const LIGHT_TERMINAL_THEME = {
  background: '#FFFFFF',
  foreground: '#0F172A',
  cursor: '#4F46E5',
  cursorAccent: '#FFFFFF',
  selectionBackground: 'rgba(79, 70, 229, 0.2)',
  black: '#0F172A',
  red: '#E11D48',
  green: '#059669',
  yellow: '#D97706',
  blue: '#2563EB',
  magenta: '#9333EA',
  cyan: '#0891B2',
  white: '#F1F5F9',
  brightBlack: '#64748B',
  brightRed: '#F43F5E',
  brightGreen: '#10B981',
  brightYellow: '#F59E0B',
  brightBlue: '#4F46E5',
  brightMagenta: '#A855F7',
  brightCyan: '#06B6D4',
  brightWhite: '#0F172A',
};

interface WebTerminalViewProps {
  adminKey: string;
  standalone?: boolean;
  onExitStandalone?: () => void;
  onToggleStandalone?: (val: boolean) => void;
  subTab?: 'interactive' | 'logs';
  onSubTabChange?: (tab: 'interactive' | 'logs') => void;
}

export default function WebTerminalView({
  adminKey,
  standalone = false,
  onExitStandalone,
  onToggleStandalone,
  subTab,
  onSubTabChange,
}: WebTerminalViewProps) {
  const { t } = useTranslation();
  const { resolvedTheme } = useTheme();
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [reconnectCountdown, setReconnectCountdown] = useState<number>(0);
  const [isSnippetsOpen, setIsSnippetsOpen] = useState<boolean>(false);
  const [isCtrlActive, setIsCtrlActive] = useState<boolean>(false);
  const [isAltActive, setIsAltActive] = useState<boolean>(false);
  const [isKeyboardOpen, setIsKeyboardOpen] = useState<boolean>(false);

  const isCtrlActiveRef = useRef<boolean>(isCtrlActive);
  isCtrlActiveRef.current = isCtrlActive;

  const isAltActiveRef = useRef<boolean>(isAltActive);
  isAltActiveRef.current = isAltActive;

  const reconnectAttemptRef = useRef<number>(0);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef<boolean>(true);
  const isProcessExitedRef = useRef<boolean>(false);
  const isReplayingRef = useRef<boolean>(true);
  const replayTimerRef = useRef<NodeJS.Timeout | null>(null);

  const lastSentColsRef = useRef<number>(0);
  const lastSentRowsRef = useRef<number>(0);
  const viewportDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('terminal_font_size');
    return saved ? parseInt(saved, 10) : 13;
  });

  // Mobile Visual Viewport tracking for virtual keyboard positioning
  const [viewportStyle, setViewportStyle] = useState<React.CSSProperties>({});
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    return typeof window !== 'undefined' ? window.innerWidth < 768 : false;
  });

  const fontSizeRef = useRef<number>(fontSize);
  fontSizeRef.current = fontSize;

  // Sync fullscreenchange event listener (for Esc key / native gesture exits)
  useEffect(() => {
    const handleFullscreenChange = () => {
      if (!document.fullscreenElement && standalone) {
        // Exited browser native fullscreen
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [standalone]);

  const sendResize = useCallback((cols: number, rows: number) => {
    if (cols <= 0 || rows <= 0) return;
    if (cols === lastSentColsRef.current && rows === lastSentRowsRef.current) {
      return;
    }
    lastSentColsRef.current = cols;
    lastSentRowsRef.current = rows;
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      console.debug(`[WebTerminal] Sending resize to backend: ${cols}x${rows}`);
      wsRef.current.send(`JSON:${JSON.stringify({ type: 'resize', cols, rows })}`);
    }
  }, []);

  const clearReconnectTimers = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setReconnectCountdown(0);
  }, []);

  const initWebSocket = useCallback(() => {
    clearReconnectTimers();
    isProcessExitedRef.current = false;
    isReplayingRef.current = true;

    if (wsRef.current) {
      wsRef.current.close();
    }

    setIsConnecting(true);
    setIsConnected(false);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/admin/terminal/ws?x-admin-key=${encodeURIComponent(adminKey)}`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      console.debug('[WebTerminal] WebSocket connection established successfully');
      setIsConnecting(false);
      setIsConnected(true);
      reconnectAttemptRef.current = 0;
      clearReconnectTimers();

      if (xtermRef.current && fitAddonRef.current) {
        fitAddonRef.current.fit();
        lastSentColsRef.current = 0;
        lastSentRowsRef.current = 0;
        sendResize(xtermRef.current.cols, xtermRef.current.rows);
      }
    };

    ws.onmessage = (event) => {
      const data = event.data;
      if (typeof data === 'string') {
        if (data.startsWith('JSON:')) {
          try {
            const parsed = JSON.parse(data.slice(5));
            console.debug('[WebTerminal] Received backend control message:', parsed);
            if (parsed.type === 'status' && parsed.event === 'exit') {
              xtermRef.current?.writeln('\r\n\x1b[33m[Process Completed]\x1b[0m\r\n');
              isProcessExitedRef.current = true;
              setIsConnected(false);
              clearReconnectTimers();
              return;
            }
          } catch {
            // Not json, print as raw text
          }
        }
        // Log preview in console for debugging
        if (data.length > 0) {
          console.debug('[WebTerminal] WS Recv Text:', JSON.stringify(data.slice(0, 50)), 'len:', data.length);
        }
        xtermRef.current?.write(data, () => {
          if (replayTimerRef.current) {
            clearTimeout(replayTimerRef.current);
          }
          replayTimerRef.current = setTimeout(() => {
            isReplayingRef.current = false;
          }, 100);
        });
      } else if (data instanceof ArrayBuffer) {
        console.debug('[WebTerminal] WS Recv Binary:', data.byteLength);
        xtermRef.current?.write(new Uint8Array(data), () => {
          if (replayTimerRef.current) {
            clearTimeout(replayTimerRef.current);
          }
          replayTimerRef.current = setTimeout(() => {
            isReplayingRef.current = false;
          }, 100);
        });
      }
    };

    const triggerReconnect = () => {
      setIsConnecting(false);
      setIsConnected(false);

      if (!isMountedRef.current || isProcessExitedRef.current) {
        return;
      }

      clearReconnectTimers();
      const delayMs = Math.min(15000, 1000 * Math.pow(2, reconnectAttemptRef.current));
      let remaining = Math.ceil(delayMs / 1000);
      setReconnectCountdown(remaining);
      reconnectAttemptRef.current += 1;

      countdownIntervalRef.current = setInterval(() => {
        remaining -= 1;
        setReconnectCountdown(remaining);
        if (remaining <= 0) {
          clearReconnectTimers();
          initWebSocket();
        }
      }, 1000);
    };

    ws.onclose = () => {
      triggerReconnect();
    };

    ws.onerror = () => {
      triggerReconnect();
    };
  }, [adminKey, clearReconnectTimers, sendResize]);

  // Lock body scroll and set overscroll-behavior when standalone is active
  useEffect(() => {
    if (standalone) {
      const originalOverflow = document.body.style.overflow;
      const originalOverscroll = document.body.style.overscrollBehavior;
      const originalTouchAction = document.body.style.touchAction;
      const originalPosition = document.body.style.position;
      const originalWidth = document.body.style.width;
      const originalHeight = document.body.style.height;

      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
      document.body.style.touchAction = 'pan-y';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.height = '100%';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.overscrollBehavior = 'none';

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.overscrollBehavior = originalOverscroll;
        document.body.style.touchAction = originalTouchAction;
        document.body.style.position = originalPosition;
        document.body.style.width = originalWidth;
        document.body.style.height = originalHeight;
        document.documentElement.style.overflow = '';
        document.documentElement.style.overscrollBehavior = '';
      };
    }
  }, [standalone]);

  // Initialize xterm instance
  useEffect(() => {
    if (!terminalContainerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      convertEol: false,
      scrollback: 5000,
      macOptionIsMeta: true,
      altClickMovesCursor: true,
      theme: resolvedTheme === 'dark' ? DARK_TERMINAL_THEME : LIGHT_TERMINAL_THEME,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalContainerRef.current);

    // Code-server mobile textarea optimization
    const helperTextarea = terminalContainerRef.current.querySelector('textarea');
    let handleFocus: (() => void) | null = null;
    let handleBlur: (() => void) | null = null;
    if (helperTextarea) {
      helperTextarea.setAttribute('autocapitalize', 'none');
      helperTextarea.setAttribute('autocomplete', 'off');
      helperTextarea.setAttribute('autocorrect', 'off');
      helperTextarea.setAttribute('spellcheck', 'false');
      helperTextarea.setAttribute('tabindex', '0');
      helperTextarea.setAttribute('aria-label', 'Terminal input');
      helperTextarea.setAttribute('enterkeyhint', 'done');

      handleFocus = () => setIsKeyboardOpen(true);
      handleBlur = () => setIsKeyboardOpen(false);
      helperTextarea.addEventListener('focus', handleFocus);
      helperTextarea.addEventListener('blur', handleBlur);
    }

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Virtual modifier keyboard event handler (CTRL/ALT key combination interception & auto-release)
    term.attachCustomKeyEventHandler((domEvent: KeyboardEvent) => {
      if (domEvent.type !== 'keydown') {
        return true;
      }

      const isCtrl = isCtrlActiveRef.current;
      const isAlt = isAltActiveRef.current;

      if (!isCtrl && !isAlt) {
        return true;
      }

      const encoded = encodeModifierKey(domEvent, isCtrl, isAlt);
      if (encoded !== null) {
        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(encoded);
        }
        term.focus();
        if (term.buffer.active.type !== 'alternate') {
          term.scrollToBottom();
        }

        setIsCtrlActive(false);
        setIsAltActive(false);
        isCtrlActiveRef.current = false;
        isAltActiveRef.current = false;

        domEvent.preventDefault();
        domEvent.stopPropagation();
        return false;
      }

      return true;
    });

    term.onResize(({ cols, rows }) => {
      sendResize(cols, rows);
    });

    // Observe container resize
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current && xtermRef.current && terminalContainerRef.current) {
        if (terminalContainerRef.current.clientWidth > 0 && terminalContainerRef.current.clientHeight > 0) {
          try {
            fitAddonRef.current.fit();
            const { cols, rows } = xtermRef.current;
            if (cols > 0 && rows > 0) {
              sendResize(cols, rows);
            }
          } catch {
            // Ignore
          }
        }
      }
    });

    if (terminalContainerRef.current) {
      resizeObserver.observe(terminalContainerRef.current);
    }

    // Mobile Touch Gesture & Vim Navigation Bridge (code-server / VS Code style)
    let touchStartY = 0;
    let touchStartX = 0;
    let touchStartTime = 0;
    let isDragging = false;
    let accumulatedDeltaY = 0;
    const container = terminalContainerRef.current;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        touchStartTime = Date.now();
        isDragging = false;
        accumulatedDeltaY = 0;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = touchStartY - currentY;
      const deltaX = touchStartX - currentX;

      if (!isDragging && (Math.abs(deltaY) > 8 || Math.abs(deltaX) > 8)) {
        isDragging = true;
      }

      if (!isDragging) return;

      if (e.cancelable) {
        e.preventDefault();
      }
      e.stopPropagation();

      touchStartY = currentY;
      touchStartX = currentX;
      accumulatedDeltaY += deltaY;

      // Approximate line height based on current font size (e.g. ~18px per line)
      const currentFontSize = fontSizeRef.current;
      const lineHeight = Math.max(12, currentFontSize * 1.3);

      if (Math.abs(accumulatedDeltaY) >= lineHeight) {
        const linesToScroll = Math.trunc(accumulatedDeltaY / lineHeight);
        accumulatedDeltaY -= linesToScroll * lineHeight;

        const isAlternate = term.buffer.active.type === 'alternate';
        if (isAlternate) {
          // In Vim / Nano / Htop, translate vertical swipe into Arrow Up/Down sequences
          const arrowSequence = linesToScroll > 0 ? '\x1b[B' : '\x1b[A';
          const count = Math.min(5, Math.abs(linesToScroll));
          if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
            wsRef.current.send(arrowSequence.repeat(count));
          }
        } else {
          // Standard command line scrollback buffer
          term.scrollLines(linesToScroll);
        }
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const elapsed = Date.now() - touchStartTime;
      if (!isDragging && elapsed < 350) {
        // Pure single tap -> Focus terminal & wake on-screen virtual keyboard synchronously
        term.focus();
        const textarea = container?.querySelector('textarea');
        if (textarea) {
          textarea.focus();
        }
      }
    };

    if (container) {
      container.addEventListener('touchstart', handleTouchStart, { passive: false });
      container.addEventListener('touchmove', handleTouchMove, { passive: false });
      container.addEventListener('touchend', handleTouchEnd, { passive: false });
    }

    term.onData((data) => {
      if (isReplayingRef.current && isSyntheticTerminalReport(data)) {
        console.debug('[WebTerminal] Suppressed synthetic replay report:', JSON.stringify(data));
        return;
      }

      console.debug('[WebTerminal] term.onData dispatched:', JSON.stringify(data), 'len:', data.length, 'hex:', Array.from(data).map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join(' '));
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
      if (term.buffer.active.type !== 'alternate') {
        term.scrollToBottom();
      }
    });

    term.onKey((e) => {
      console.debug('[WebTerminal] term.onKey event:', e.key, 'domEvent:', e.domEvent.key, 'code:', e.domEvent.code);
    });

    let isMounted = true;
    const fitTimer = setTimeout(() => {
      if (isMounted && fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        xtermRef.current.focus();
        if (xtermRef.current.buffer.active.type !== 'alternate') {
          xtermRef.current.scrollToBottom();
        }
      }
    }, 50);

    initWebSocket();

    // Resize observer & Visual Viewport updater
    const updateViewport = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);

      if (window.visualViewport) {
        const vv = window.visualViewport;
        if (vv.height < window.innerHeight * 0.82) {
          setIsKeyboardOpen(true);
        } else {
          const textarea = terminalContainerRef.current?.querySelector('textarea');
          if (document.activeElement !== textarea) {
            setIsKeyboardOpen(false);
          }
        }
      }

      if (mobile && standalone && window.visualViewport) {
        const vv = window.visualViewport;
        setViewportStyle({
          position: 'fixed',
          top: `${vv.offsetTop}px`,
          left: `${vv.offsetLeft}px`,
          width: `${vv.width}px`,
          height: `${vv.height}px`,
          maxHeight: `${vv.height}px`,
          zIndex: 50,
          borderRadius: 0,
          border: 'none',
          overflow: 'hidden',
        });
      } else {
        setViewportStyle({});
      }

      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        sendResize(xtermRef.current.cols, xtermRef.current.rows);
        if (xtermRef.current.buffer.active.type !== 'alternate') {
          xtermRef.current.scrollToBottom();
        }
      }
    };

    const handleViewportChange = () => {
      if (viewportDebounceTimerRef.current) {
        clearTimeout(viewportDebounceTimerRef.current);
      }
      viewportDebounceTimerRef.current = setTimeout(() => {
        updateViewport();
      }, 80);
    };

    window.addEventListener('resize', handleViewportChange);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleViewportChange);
      window.visualViewport.addEventListener('scroll', handleViewportChange);
    }

    updateViewport();

    return () => {
      isMounted = false;
      isMountedRef.current = false;
      clearReconnectTimers();
      clearTimeout(fitTimer);
      if (viewportDebounceTimerRef.current) {
        clearTimeout(viewportDebounceTimerRef.current);
      }
      if (replayTimerRef.current) {
        clearTimeout(replayTimerRef.current);
      }
      resizeObserver.disconnect();
      if (helperTextarea) {
        if (handleFocus) helperTextarea.removeEventListener('focus', handleFocus);
        if (handleBlur) helperTextarea.removeEventListener('blur', handleBlur);
      }
      if (container) {
        container.removeEventListener('touchstart', handleTouchStart);
        container.removeEventListener('touchmove', handleTouchMove);
        container.removeEventListener('touchend', handleTouchEnd);
      }
      window.removeEventListener('resize', handleViewportChange);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleViewportChange);
        window.visualViewport.removeEventListener('scroll', handleViewportChange);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();
    };
  }, [standalone, sendResize, clearReconnectTimers]);

  // Sync font size change
  useEffect(() => {
    if (xtermRef.current && fitAddonRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      localStorage.setItem('terminal_font_size', fontSize.toString());
      fitAddonRef.current.fit();
      sendResize(xtermRef.current.cols, xtermRef.current.rows);
      if (xtermRef.current.buffer.active.type !== 'alternate') {
        xtermRef.current.scrollToBottom();
      }
    }
  }, [fontSize, sendResize]);

  // Dynamically update terminal palette when resolvedTheme changes
  useEffect(() => {
    if (xtermRef.current) {
      xtermRef.current.options.theme = resolvedTheme === 'dark' ? DARK_TERMINAL_THEME : LIGHT_TERMINAL_THEME;
    }
  }, [resolvedTheme]);

  const handleSendInput = (data: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
    xtermRef.current?.focus();
    if (xtermRef.current?.buffer.active.type !== 'alternate') {
      xtermRef.current?.scrollToBottom();
    }
  };

  const handleRunCommand = (cmd: string, execute: boolean) => {
    const textToSend = execute ? `${cmd}\r` : cmd;
    handleSendInput(textToSend);
  };

  const handleHideKeyboard = () => {
    const textarea = terminalContainerRef.current?.querySelector('textarea');
    if (textarea) {
      textarea.blur();
    }
    (document.activeElement as HTMLElement)?.blur();
    setIsKeyboardOpen(false);
  };

  const handleToggleKeyboard = () => {
    const textarea = terminalContainerRef.current?.querySelector('textarea');
    if (isKeyboardOpen) {
      handleHideKeyboard();
    } else {
      if (xtermRef.current) {
        xtermRef.current.focus();
        textarea?.focus();
        xtermRef.current.scrollToBottom();
      }
      setIsKeyboardOpen(true);
    }
  };

  const handleManualReconnect = () => {
    reconnectAttemptRef.current = 0;
    initWebSocket();
  };

  const handleResetSession = () => {
    if (window.confirm(t('webTerminal.resetConfirm'))) {
      reconnectAttemptRef.current = 0;
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(`JSON:${JSON.stringify({ type: 'reset' })}`);
      }
      xtermRef.current?.clear();
    }
  };

  const handleFullscreenToggle = () => {
    if (standalone) {
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
      onExitStandalone?.();
    } else {
      if (onToggleStandalone) {
        onToggleStandalone(true);
      }
      if (document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      }
    }
  };

  return (
    <div
      style={isMobile && standalone ? viewportStyle : undefined}
      className={`mx-auto flex flex-col bg-[var(--bg-canvas)] border border-[var(--border-subtle)] overflow-hidden shadow-2xl font-mono text-xs transition-all ${
        standalone
          ? 'fixed inset-0 z-50 rounded-none h-screen w-screen overflow-hidden overscroll-none border-none'
          : 'w-full h-full md:max-w-7xl md:h-[calc(100vh-140px)] md:min-h-[500px] rounded-none md:rounded-2xl border-x-0 md:border-x border-t-0 md:border-t'
      }`}
    >
      {/* Top Window Bar */}
      <div className="bg-[var(--bg-surface-sub)] border-b border-[var(--border-subtle)] px-2 sm:px-4 py-1.5 sm:py-2 flex items-center justify-between select-none shrink-0 sticky top-0 z-10">
        <div className="flex items-center space-x-1.5 sm:space-x-2 min-w-0">
          {/* Back to Console (Standalone Mode) */}
          {standalone && onExitStandalone && (
            <button
              type="button"
              onClick={onExitStandalone}
              className="mr-1 px-1.5 sm:px-2 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-300 hover:text-white border border-white/[0.08] transition-all flex items-center space-x-1 text-xs active:scale-95"
              title={t('webTerminal.backToDashboard')}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span className="hidden sm:inline font-sans text-[11px]">{t('webTerminal.backToDashboard')}</span>
            </button>
          )}

          {/* macOS action dots */}
          <div className="flex items-center space-x-1.5 mr-0.5 sm:mr-1">
            <div
              onClick={standalone ? onExitStandalone : undefined}
              className={`w-2.5 h-2.5 rounded-full bg-[#EF4444]/90 border border-[#DC2626]/60 shadow-[0_0_6px_rgba(239,68,68,0.3)] ${
                standalone ? 'cursor-pointer hover:opacity-80' : ''
              }`}
              title={standalone ? t('webTerminal.exitStandalone') : undefined}
            />
            <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]/90 border border-[#D97706]/60 shadow-[0_0_6px_rgba(245,158,11,0.3)]" />
            <div
              onClick={handleFullscreenToggle}
              className="w-2.5 h-2.5 rounded-full bg-[#10B981]/90 border border-[#059669]/60 shadow-[0_0_6px_rgba(16,185,129,0.3)] cursor-pointer hover:opacity-80"
              title={standalone ? t('webTerminal.exitFullscreen') : t('webTerminal.fullscreen')}
            />
          </div>

          {onSubTabChange ? (
            <div className="ui-tab-container p-0.5 text-[11px] font-medium shrink-0">
              <button
                type="button"
                onClick={() => onSubTabChange('interactive')}
                className={`flex items-center space-x-1.5 px-2 sm:px-2.5 py-1 rounded-lg transition-all ${
                  (subTab || 'interactive') === 'interactive'
                    ? 'ui-tab-pill-active font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <TerminalSquare className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('terminal.interactiveTab')}</span>
              </button>
              <button
                type="button"
                onClick={() => onSubTabChange('logs')}
                className={`flex items-center space-x-1.5 px-2 sm:px-2.5 py-1 rounded-lg transition-all ${
                  subTab === 'logs'
                    ? 'ui-tab-pill-active font-semibold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{t('terminal.logsTab')}</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-1.5 text-slate-200">
              <TerminalIcon className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
              <span className="font-semibold text-slate-200 text-xs hidden sm:inline truncate">
                {t('webTerminal.title')}
              </span>
            </div>
          )}

          {/* Connection Status Badge */}
          <div
            className={`flex items-center space-x-1 sm:space-x-1.5 px-1.5 sm:px-2 py-0.5 rounded-full text-[10px] font-medium border shrink-0 ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : isConnecting
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                isConnected ? 'bg-emerald-400 animate-pulse' : isConnecting ? 'bg-amber-400 animate-ping' : 'bg-rose-400'
              }`}
            />
            <span className="hidden sm:inline text-[10px]">
              {isConnected
                ? t('webTerminal.connected')
                : isConnecting
                ? t('webTerminal.connecting')
                : t('webTerminal.disconnected')}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-0.5 sm:space-x-1.5 shrink-0">
          {/* Zoom Out */}
          <button
            type="button"
            onClick={() => setFontSize((prev) => Math.max(9, prev - 1))}
            className="hidden sm:inline-flex p-1 sm:p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* Zoom In */}
          <button
            type="button"
            onClick={() => setFontSize((prev) => Math.min(22, prev + 1))}
            className="hidden sm:inline-flex p-1 sm:p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Reconnect */}
          <button
            type="button"
            onClick={handleManualReconnect}
            className="p-1 sm:p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title={t('webTerminal.reconnect')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {/* Reset Terminal Session */}
          <button
            type="button"
            onClick={handleResetSession}
            className="p-1 sm:p-1.5 rounded-lg bg-white/[0.04] hover:bg-rose-500/20 text-slate-400 hover:text-rose-300 border border-white/[0.06] hover:border-rose-500/30 transition-all"
            title={t('webTerminal.resetSession')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen / Standalone Toggle */}
          <button
            type="button"
            onClick={handleFullscreenToggle}
            className={`p-1 sm:p-1.5 rounded-lg border transition-all ${
              standalone
                ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30'
                : 'bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06]'
            }`}
            title={standalone ? t('webTerminal.exitFullscreen') : t('webTerminal.fullscreen')}
          >
            {standalone ? <Minimize2 className="w-3.5 h-3.5 text-indigo-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* xterm.js Canvas Container */}
      <div
        onClick={() => xtermRef.current?.focus()}
        className="flex-1 p-2 bg-[var(--bg-canvas)] overflow-hidden min-h-0 relative cursor-text"
      >
        {/* Floating Disconnect & Auto-Reconnect Toast */}
        {!isConnected && !isConnecting && reconnectCountdown > 0 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 flex items-center space-x-2.5 px-3.5 py-1.5 rounded-xl bg-[#160E12]/95 border border-rose-500/40 text-rose-300 text-xs backdrop-blur-md shadow-2xl animate-in fade-in slide-in-from-top-2 select-none">
            <div className="relative flex items-center justify-center">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              <span className="absolute w-2 h-2 rounded-full bg-rose-500 animate-ping opacity-75" />
            </div>
            <span className="font-mono text-[11px]">
              {t('webTerminal.reconnectCountdown', { count: reconnectCountdown.toString() }).replace('{count}', reconnectCountdown.toString())}
            </span>
            <button
              type="button"
              onClick={handleManualReconnect}
              className="px-2 py-0.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 active:scale-95 text-white font-medium text-[11px] transition-all border border-rose-500/30 flex items-center space-x-1"
            >
              <RefreshCw className="w-3 h-3 text-rose-300" />
              <span>{t('webTerminal.reconnectNow')}</span>
            </button>
          </div>
        )}

        <div ref={terminalContainerRef} className="h-full w-full" />
      </div>

      {/* Mobile Touch Accessory Bar */}
      <TerminalAccessoryBar
        onSendInput={(data) => {
          handleSendInput(data);
          if (isCtrlActiveRef.current || isAltActiveRef.current) {
            setIsCtrlActive(false);
            setIsAltActive(false);
            isCtrlActiveRef.current = false;
            isAltActiveRef.current = false;
          }
        }}
        isCtrlActive={isCtrlActive}
        onToggleCtrl={() => setIsCtrlActive(!isCtrlActive)}
        isAltActive={isAltActive}
        onToggleAlt={() => setIsAltActive(!isAltActive)}
        onToggleKeyboard={handleToggleKeyboard}
        onHideKeyboard={handleHideKeyboard}
        isKeyboardOpen={isKeyboardOpen}
        onOpenSnippets={() => setIsSnippetsOpen(true)}
      />

      {/* Snippet Drawer */}
      <TerminalSnippetsDrawer
        isOpen={isSnippetsOpen}
        onClose={() => setIsSnippetsOpen(false)}
        onRunCommand={(cmd, execute) => {
          handleRunCommand(cmd, execute);
          if (isCtrlActiveRef.current || isAltActiveRef.current) {
            setIsCtrlActive(false);
            setIsAltActive(false);
            isCtrlActiveRef.current = false;
            isAltActiveRef.current = false;
          }
        }}
      />
    </div>
  );
}
