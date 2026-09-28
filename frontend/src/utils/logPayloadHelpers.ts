export interface PayloadSizeInfo {
  reqBytes: number;
  resBytes: number;
  totalBytes: number;
  formattedReq: string;
  formattedRes: string;
  formattedTotal: string;
}

export function formatBytes(bytes: number): string {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function getObjectByteLength(obj: any): number {
  if (!obj) return 0;
  try {
    const jsonStr = typeof obj === 'string' ? obj : JSON.stringify(obj);
    if (!jsonStr) return 0;
    // Use TextEncoder to get accurate UTF-8 byte length
    return new TextEncoder().encode(jsonStr).length;
  } catch {
    return 0;
  }
}

export function calculatePayloadSize(log: any): PayloadSizeInfo {
  if (!log) {
    return {
      reqBytes: 0,
      resBytes: 0,
      totalBytes: 0,
      formattedReq: '0 B',
      formattedRes: '0 B',
      formattedTotal: '0 B',
    };
  }

  const reqBytes = getObjectByteLength(log.client_req || log.gem_req);
  const resBytes = getObjectByteLength(log.claude_res || log.gem_res);
  const totalBytes = reqBytes + resBytes;

  return {
    reqBytes,
    resBytes,
    totalBytes,
    formattedReq: formatBytes(reqBytes),
    formattedRes: formatBytes(resBytes),
    formattedTotal: formatBytes(totalBytes),
  };
}
