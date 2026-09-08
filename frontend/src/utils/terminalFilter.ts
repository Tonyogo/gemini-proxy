/**
 * Detects whether an escape sequence produced by xterm.js onData is an
 * automated device response / report generated in response to historical query sequences.
 */
export function isSyntheticTerminalReport(data: string): boolean {
  if (!data || typeof data !== 'string') {
    return false;
  }

  // CPR: \x1b[<row>;<col>R or \x1b[<row>;<col>;<page>R or \x1b[?<row>;<col>R
  if (/^\x1b\[\??\d+(?:;\d+)*R$/.test(data)) {
    return true;
  }

  // DA / DA2 / DA3: \x1b[>...c, \x1b[?...c, \x1b[=...c
  if (/^\x1b\[[>?=]\d+(?:;\d+)*c$/.test(data)) {
    return true;
  }

  // OSC 10 / OSC 11 / OSC 4 color reports: \x1b]10;rgb:... or \x1b]11;rgb:... or \x1b]4;... terminated by ST (\x1b\) or BEL (\x07)
  if (/^\x1b\](?:4|10|11|12);(?:[^\x1b\x07]+)(?:\x1b\\|\x07)$/.test(data)) {
    return true;
  }

  // DECRPM / ANSI mode reports: \x1b[<mode>;<status>$y or \x1b[?<mode>;<status>$y
  if (/^\x1b\[\??\d+(?:;\d+)*\$y$/.test(data)) {
    return true;
  }

  // Window manipulation reports (e.g. \x1b[4;<height>;<width>t, \x1b[8;<rows>;<cols>t)
  if (/^\x1b\[\d+(?:;\d+)*t$/.test(data)) {
    return true;
  }

  return false;
}
