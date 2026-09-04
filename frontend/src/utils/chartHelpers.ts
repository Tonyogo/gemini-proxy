/**
 * Formats uptime seconds into a human-readable duration string (e.g. "3d 14h 22m" or "42m 10s").
 */
export function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const sec = Math.floor(seconds);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;

  if (days > 0) {
    return `${days}d ${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${remSec}s`;
  }
  return `${remSec}s`;
}

/**
 * Calculates and formats throughput in requests per second.
 */
export function formatThroughput(totalRequests: number, range: number | 'today'): string {
  if (!totalRequests || totalRequests <= 0) return '0.00 req/s';
  // If range is 'today', estimate based on elapsed hours today (minimum 1 hour, max 24)
  let hours = typeof range === 'number' ? range : 24;
  if (range === 'today') {
    const now = new Date();
    hours = Math.max(1, now.getHours() + now.getMinutes() / 60);
  }
  const totalSeconds = hours * 3600;
  const qps = totalRequests / totalSeconds;
  return `${qps.toFixed(2)} req/s`;
}

export interface Point {
  x: number;
  y: number;
}

const fmt = (n: number): string => {
  const rounded = Number(n.toFixed(1));
  return rounded.toString();
};

/**
 * Generates a smooth cubic Bezier curve SVG path through a series of 2D points.
 */
export function getBezierSplinePath(points: Point[]): string {
  if (!points || points.length === 0) return '';
  if (points.length === 1) return `M ${fmt(points[0].x)},${fmt(points[0].y)}`;

  let d = `M ${fmt(points[0].x)},${fmt(points[0].y)}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1];

    // Smooth control points using Catmull-Rom to Cubic Bezier conversion factor (1/6)
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;

    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;

    d += ` C ${fmt(cp1x)},${fmt(cp1y)} ${fmt(cp2x)},${fmt(cp2y)} ${fmt(p2.x)},${fmt(p2.y)}`;
  }

  return d;
}

/**
 * Generates a closed area SVG path below the smooth Bezier curve anchored at yBase.
 */
export function getBezierAreaPath(points: Point[], yBase: number): string {
  if (!points || points.length === 0) return '';
  const curvePath = getBezierSplinePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  return `${curvePath} L ${fmt(last.x)},${fmt(yBase)} L ${fmt(first.x)},${fmt(yBase)} Z`;
}
