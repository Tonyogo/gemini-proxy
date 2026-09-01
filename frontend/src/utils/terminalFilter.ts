/**
 * Detects whether an escape sequence produced by xterm.js onData is an
 * automated device response / report generated in response to historical query sequences.
 */
export function isSyntheticTerminalReport(data: string): boolean {
  if (!data || typeof data !== 'string') {
    return false;
  }

  // CPR: \x1b[<row>;<col>R
  if (/^\x1b\[\d+(?:;\d+)*R$/.test(data)) {
    return true;
  }

  // DA / DA2: \x1b[>...c or \x1b[?...c
  if (/^\x1b\[[>?]\d+(?:;\d+)*c$/.test(data)) {
    return true;
  }

  // OSC 10 / OSC 11 color reports: \x1b]10;rgb:... or \x1b]11;rgb:... terminated by ST (\x1b\) or BEL (\x07)
  if (/^\x1b\](?:10|11);rgb:[0-9a-fA-F/]+(?:\x1b\\|\x07)$/.test(data)) {
    return true;
  }

  // DECRPM: \x1b[<mode>;<status>$y or \x1b[?<mode>;<status>$y
  if (/^\x1b\[\??\d+(?:;\d+)*\$y$/.test(data)) {
    return true;
  }

  return false;
}
