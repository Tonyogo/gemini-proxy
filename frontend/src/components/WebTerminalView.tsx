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
  Sparkles,
  Wifi,
  WifiOff
} from 'lucide-react';
import { useTranslation } from '../i18n/LanguageContext';
import { TerminalAccessoryBar } from './terminal/TerminalAccessoryBar';
import { TerminalSnippetsDrawer } from './terminal/TerminalSnippetsDrawer';

interface WebTerminalViewProps {
  adminKey: string;
}

export default function WebTerminalView({ adminKey }: WebTerminalViewProps) {
  const { t } = useTranslation();
  const terminalContainerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [isConnecting, setIsConnecting] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isSnippetsOpen, setIsSnippetsOpen] = useState<boolean>(false);
  const [isCtrlActive, setIsCtrlActive] = useState<boolean>(false);
  const [isAltActive, setIsAltActive] = useState<boolean>(false);

  const [fontSize, setFontSize] = useState<number>(() => {
    const saved = localStorage.getItem('terminal_font_size');
    return saved ? parseInt(saved, 10) : 13;
  });

  const sendResize = useCallback((cols: number, rows: number) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
    }
  }, []);

  const initWebSocket = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
    }

    setIsConnecting(true);
    setIsConnected(false);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/api/admin/terminal/ws?x-admin-key=${encodeURIComponent(adminKey)}`;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnecting(false);
      setIsConnected(true);
      if (xtermRef.current && fitAddonRef.current) {
        fitAddonRef.current.fit();
        sendResize(xtermRef.current.cols, xtermRef.current.rows);
      }
    };

    ws.onmessage = (event) => {
      const data = event.data;
      if (typeof data === 'string') {
        if (data.startsWith('{') && data.endsWith('}')) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'status' && parsed.event === 'exit') {
              xtermRef.current?.writeln('\r\n\x1b[33m[Process Completed]\x1b[0m\r\n');
              setIsConnected(false);
              return;
            }
          } catch {
            // Not json, print as raw text
          }
        }
        xtermRef.current?.write(data);
      }
    };

    ws.onclose = () => {
      setIsConnecting(false);
      setIsConnected(false);
    };

    ws.onerror = () => {
      setIsConnecting(false);
      setIsConnected(false);
    };
  }, [adminKey, sendResize]);

  // Initialize xterm instance
  useEffect(() => {
    if (!terminalContainerRef.current) return;

    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
      theme: {
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
      },
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);
    term.open(terminalContainerRef.current);

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(data);
      }
    });

    let isMounted = true;
    const fitTimer = setTimeout(() => {
      if (isMounted && fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
      }
    }, 50);

    initWebSocket();

    // Resize observer
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit();
        sendResize(xtermRef.current.cols, xtermRef.current.rows);
      }
    };

    window.addEventListener('resize', handleResize);

    // visualViewport support for mobile soft keyboards
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', handleResize);
    }

    return () => {
      isMounted = false;
      clearTimeout(fitTimer);
      window.removeEventListener('resize', handleResize);
      if (window.visualViewport) {
        window.visualViewport.removeEventListener('resize', handleResize);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();
    };
  }, []);

  // Sync font size change
  useEffect(() => {
    if (xtermRef.current && fitAddonRef.current) {
      xtermRef.current.options.fontSize = fontSize;
      localStorage.setItem('terminal_font_size', fontSize.toString());
      fitAddonRef.current.fit();
      sendResize(xtermRef.current.cols, xtermRef.current.rows);
    }
  }, [fontSize, sendResize]);

  const handleSendInput = (data: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
    xtermRef.current?.focus();
  };

  const handleRunCommand = (cmd: string, execute: boolean) => {
    const textToSend = execute ? `${cmd}\r` : cmd;
    handleSendInput(textToSend);
  };

  const handleToggleKeyboard = () => {
    if (xtermRef.current) {
      xtermRef.current.focus();
    }
  };

  return (
    <div
      className={`mx-auto flex flex-col bg-[#07090E] border border-white/[0.08] overflow-hidden shadow-2xl font-mono text-xs transition-all ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none h-screen w-screen'
          : 'max-w-7xl h-[calc(100vh-140px)] min-h-[500px] rounded-2xl'
      }`}
    >
      {/* Top Window Bar */}
      <div className="bg-[#0C0E14] border-b border-white/[0.08] px-3 sm:px-4 py-2 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2">
          {/* macOS action dots */}
          <div className="flex items-center space-x-1.5 mr-1">
            <div className="w-2.5 h-2.5 rounded-full bg-[#EF4444]/90 border border-[#DC2626]/60 shadow-[0_0_6px_rgba(239,68,68,0.3)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#F59E0B]/90 border border-[#D97706]/60 shadow-[0_0_6px_rgba(245,158,11,0.3)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[#10B981]/90 border border-[#059669]/60 shadow-[0_0_6px_rgba(16,185,129,0.3)]" />
          </div>

          <div className="flex items-center space-x-1.5 text-slate-200">
            <TerminalIcon className="w-3.5 h-3.5 text-indigo-400" />
            <span className="font-semibold text-slate-200 text-xs hidden sm:inline">
              {t('webTerminal.title')}
            </span>
          </div>

          {/* Connection Status Badge */}
          <div
            className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium border ${
              isConnected
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                : isConnecting
                ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isConnected ? 'bg-emerald-400 animate-pulse' : isConnecting ? 'bg-amber-400 animate-ping' : 'bg-rose-400'
              }`}
            />
            <span>
              {isConnected
                ? t('webTerminal.connected')
                : isConnecting
                ? t('webTerminal.connecting')
                : t('webTerminal.disconnected')}
            </span>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-1 sm:space-x-1.5">
          {/* Zoom Out */}
          <button
            type="button"
            onClick={() => setFontSize((prev) => Math.max(9, prev - 1))}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>

          {/* Zoom In */}
          <button
            type="button"
            onClick={() => setFontSize((prev) => Math.min(22, prev + 1))}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>

          {/* Reconnect */}
          <button
            type="button"
            onClick={initWebSocket}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title={t('webTerminal.reconnect')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isConnecting ? 'animate-spin text-indigo-400' : ''}`} />
          </button>

          {/* Clear screen */}
          <button
            type="button"
            onClick={() => xtermRef.current?.clear()}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title={t('webTerminal.clear')}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>

          {/* Fullscreen */}
          <button
            type="button"
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white border border-white/[0.06] transition-all"
            title={isFullscreen ? t('webTerminal.exitFullscreen') : t('webTerminal.fullscreen')}
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-indigo-400" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* xterm.js Canvas Container */}
      <div className="flex-1 p-2 bg-[#090A0F] overflow-hidden min-h-0 relative">
        <div ref={terminalContainerRef} className="h-full w-full" />
      </div>

      {/* Mobile Touch Accessory Bar */}
      <TerminalAccessoryBar
        onSendInput={handleSendInput}
        isCtrlActive={isCtrlActive}
        onToggleCtrl={() => setIsCtrlActive(!isCtrlActive)}
        isAltActive={isAltActive}
        onToggleAlt={() => setIsAltActive(!isAltActive)}
        onToggleKeyboard={handleToggleKeyboard}
        onOpenSnippets={() => setIsSnippetsOpen(true)}
      />

      {/* Snippet Drawer */}
      <TerminalSnippetsDrawer
        isOpen={isSnippetsOpen}
        onClose={() => setIsSnippetsOpen(false)}
        onRunCommand={handleRunCommand}
      />
    </div>
  );
}
