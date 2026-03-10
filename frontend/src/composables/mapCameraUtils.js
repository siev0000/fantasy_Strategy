export function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function getCameraCenter(camera, viewW, viewH) {
  const zoom = Number.isFinite(camera?.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  return {
    x: (camera?.scrollX || 0) + (viewW / zoom) / 2,
    y: (camera?.scrollY || 0) + (viewH / zoom) / 2
  };
}

export function clampCameraCenter(center, worldW, worldH, viewW, viewH, zoom) {
  const halfW = (viewW / Math.max(zoom, 0.01)) / 2;
  const halfH = (viewH / Math.max(zoom, 0.01)) / 2;
  const minX = halfW;
  const maxX = worldW - halfW;
  const minY = halfH;
  const maxY = worldH - halfH;
  return {
    x: minX > maxX ? worldW / 2 : clampNumber(center.x, minX, maxX),
    y: minY > maxY ? worldH / 2 : clampNumber(center.y, minY, maxY)
  };
}

export function createBoundsAccumulator() {
  return {
    minX: Infinity,
    minY: Infinity,
    maxX: -Infinity,
    maxY: -Infinity
  };
}

export function extendBoundsWithPoints(acc, points) {
  if (!acc || !Array.isArray(points)) return;
  for (const p of points) {
    const x = Number(p?.x);
    const y = Number(p?.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < acc.minX) acc.minX = x;
    if (x > acc.maxX) acc.maxX = x;
    if (y < acc.minY) acc.minY = y;
    if (y > acc.maxY) acc.maxY = y;
  }
}

export function finalizeBounds(acc, fallbackW = 0, fallbackH = 0) {
  if (
    !acc
    || !Number.isFinite(acc.minX)
    || !Number.isFinite(acc.maxX)
    || !Number.isFinite(acc.minY)
    || !Number.isFinite(acc.maxY)
    || acc.maxX <= acc.minX
    || acc.maxY <= acc.minY
  ) {
    return {
      minX: 0,
      minY: 0,
      maxX: Math.max(0, fallbackW),
      maxY: Math.max(0, fallbackH)
    };
  }
  return {
    minX: acc.minX,
    minY: acc.minY,
    maxX: acc.maxX,
    maxY: acc.maxY
  };
}

export function clampCameraScroll(camera, worldW, worldH, viewW, viewH, options = {}) {
  if (!camera) return;
  const forceCenter = !!options?.forceCenter;
  const wrapEnabled = !!options?.wrapEnabled;
  const renderedHexBounds = options?.renderedHexBounds || null;
  const wrapDragMultiplierX = Number(options?.wrapDragMultiplierX || 1);
  const wrapDragMultiplierY = Number(options?.wrapDragMultiplierY || 1);

  const zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
  const viewWorldW = viewW / zoom;
  const viewWorldH = viewH / zoom;
  const centerScrollX = (worldW / 2) - (viewWorldW / 2);
  const centerScrollY = (worldH / 2) - (viewWorldH / 2);
  if (forceCenter) {
    camera.scrollX = centerScrollX;
    camera.scrollY = centerScrollY;
    return;
  }

  if (wrapEnabled) {
    const bounds = renderedHexBounds || finalizeBounds(null, worldW, worldH);
    const drawnW = Math.max(1, bounds.maxX - bounds.minX);
    const drawnH = Math.max(1, bounds.maxY - bounds.minY);
    const allowedW = drawnW * wrapDragMultiplierX;
    const allowedH = drawnH * wrapDragMultiplierY;
    const centerX = (bounds.minX + bounds.maxX) / 2;
    const centerY = (bounds.minY + bounds.maxY) / 2;
    const minCenterX = centerX - (allowedW / 2);
    const maxCenterX = centerX + (allowedW / 2);
    const minCenterY = centerY - (allowedH / 2);
    const maxCenterY = centerY + (allowedH / 2);
    const minScrollX = minCenterX - (viewWorldW / 2);
    const maxScrollX = maxCenterX - (viewWorldW / 2);
    const minScrollY = minCenterY - (viewWorldH / 2);
    const maxScrollY = maxCenterY - (viewWorldH / 2);
    camera.scrollX = minScrollX > maxScrollX
      ? (minScrollX + maxScrollX) / 2
      : clampNumber(camera.scrollX, minScrollX, maxScrollX);
    camera.scrollY = minScrollY > maxScrollY
      ? (minScrollY + maxScrollY) / 2
      : clampNumber(camera.scrollY, minScrollY, maxScrollY);
    return;
  }

  const maxX = worldW - viewWorldW;
  const maxY = worldH - viewWorldH;
  camera.scrollX = maxX < 0 ? centerScrollX : clampNumber(camera.scrollX, 0, maxX);
  camera.scrollY = maxY < 0 ? centerScrollY : clampNumber(camera.scrollY, 0, maxY);
}

export function resolveMinZoomPercent(dataLike, options = {}) {
  const w = Number(dataLike?.w);
  const h = Number(dataLike?.h);
  const mapPixelSize = options?.mapPixelSize;
  const gameViewWidth = Number(options?.gameViewWidth || 0);
  const gameViewHeight = Number(options?.gameViewHeight || 0);
  const wrapDragMultiplierX = Number(options?.wrapDragMultiplierX || 1);
  const wrapDragMultiplierY = Number(options?.wrapDragMultiplierY || 1);
  const resolveMaxZoomPercent = options?.resolveMaxZoomPercent;
  const defaultPercent = Number(options?.defaultPercent || 100);
  const minZoomFloor = Number(options?.minZoomFloor || 10);

  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0 || typeof mapPixelSize !== "function") {
    return defaultPercent;
  }
  const { width: worldW, height: worldH } = mapPixelSize(w, h);
  const fitZoomWidth = gameViewWidth / Math.max(worldW, 1);
  const fitZoomHeight = gameViewHeight / Math.max(worldH, 1);
  const baseZoom = Math.min(fitZoomWidth, fitZoomHeight, 1) * 0.96;
  const maxViewW = worldW * wrapDragMultiplierX;
  const maxViewH = worldH * wrapDragMultiplierY;
  const minFinalZoom = Math.max(
    gameViewWidth / Math.max(maxViewW, 1),
    gameViewHeight / Math.max(maxViewH, 1)
  );
  const minPercent = Math.ceil((minFinalZoom / Math.max(baseZoom, 0.0001)) * 100);
  const maxZoom = typeof resolveMaxZoomPercent === "function" ? resolveMaxZoomPercent() : 400;
  return Math.max(minZoomFloor, Math.min(maxZoom, minPercent));
}

export function normalizeZoomPercent(value, dataLike, options = {}) {
  const raw = Number.isFinite(value) ? value : Number(value);
  const defaultPercent = Number(options?.defaultPercent || 100);
  const safe = Number.isFinite(raw) ? Math.round(raw) : defaultPercent;
  const resolveMinZoomPercentFn = options?.resolveMinZoomPercent;
  const resolveMaxZoomPercentFn = options?.resolveMaxZoomPercent;
  const minZoom = typeof resolveMinZoomPercentFn === "function"
    ? resolveMinZoomPercentFn(dataLike)
    : 10;
  const maxZoom = typeof resolveMaxZoomPercentFn === "function"
    ? resolveMaxZoomPercentFn()
    : 400;
  return Math.max(minZoom, Math.min(maxZoom, safe));
}
