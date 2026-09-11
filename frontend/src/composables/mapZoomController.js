export function createMapZoomController(options = {}) {
  const {
    getCurrentData,
    getVillageState,
    getSelectedTileCoord,
    getZoomPercent,
    setZoomPercentValue,
    normalizeZoomPercent,
    resolveMinZoomPercent,
    resolveZoomStepPercent,
    toSafeNumber,
    nonEmptyText,
    normalizeFocusPoint,
    hexCenter,
    setCenterMapOnNextZoom,
    setPendingFocus,
    renderMapWithPhaser
  } = options;

  function queueCameraFocusAtWorld(worldX, worldY, focusOptions = {}) {
    const normalized = normalizeFocusPoint({ x: worldX, y: worldY });
    if (!normalized) return;
    const mode = nonEmptyText(focusOptions?.mode) === "absolute" ? "absolute" : "near";
    setPendingFocus(normalized, mode);
  }

  function queueCameraFocusAtTile(x, y, focusOptions = {}) {
    const c = hexCenter(x, y);
    queueCameraFocusAtWorld(c.cx, c.cy, focusOptions);
  }

  function setZoomPercent(value, zoomOptions = {}) {
    const data = getCurrentData();
    setZoomPercentValue(normalizeZoomPercent(value, data));
    const focusWorld = normalizeFocusPoint(zoomOptions?.focusWorld);
    if (focusWorld) {
      setCenterMapOnNextZoom(false);
      setPendingFocus(focusWorld, "absolute");
      renderMapWithPhaser();
      return;
    }
    const centerMode = nonEmptyText(zoomOptions?.centerMode) || "world";
    if (centerMode === "selected-or-village" || centerMode === "selectedTileOrVillage") {
      const selected = typeof getSelectedTileCoord === "function" ? getSelectedTileCoord() : null;
      const sx = toSafeNumber(selected?.x, Number.NaN);
      const sy = toSafeNumber(selected?.y, Number.NaN);
      const canFocusSelected = Number.isFinite(sx) && Number.isFinite(sy) && sx >= 0 && sy >= 0;
      if (canFocusSelected) {
        setCenterMapOnNextZoom(false);
        queueCameraFocusAtTile(sx, sy, { mode: "absolute" });
      } else {
        const village = getVillageState();
        const vx = toSafeNumber(village?.x, Number.NaN);
        const vy = toSafeNumber(village?.y, Number.NaN);
        const canFocusVillage = !!village?.placed && Number.isFinite(vx) && Number.isFinite(vy) && vx >= 0 && vy >= 0;
        if (canFocusVillage) {
          setCenterMapOnNextZoom(false);
          queueCameraFocusAtTile(vx, vy, { mode: "absolute" });
        } else {
          setCenterMapOnNextZoom(true);
        }
      }
    } else if (centerMode === "village") {
      const village = getVillageState();
      const vx = toSafeNumber(village?.x, Number.NaN);
      const vy = toSafeNumber(village?.y, Number.NaN);
      const canFocusVillage = !!village?.placed && Number.isFinite(vx) && Number.isFinite(vy) && vx >= 0 && vy >= 0;
      if (canFocusVillage) {
        setCenterMapOnNextZoom(false);
        queueCameraFocusAtTile(vx, vy, { mode: "absolute" });
      } else {
        setCenterMapOnNextZoom(true);
      }
    } else if (centerMode === "none") {
      setCenterMapOnNextZoom(false);
    } else {
      setCenterMapOnNextZoom(true);
    }
    renderMapWithPhaser();
  }

  function isMinZoomActive(dataLike = getCurrentData()) {
    if (!dataLike) return false;
    const currentZoom = normalizeZoomPercent(getZoomPercent(), dataLike);
    return currentZoom <= resolveMinZoomPercent(dataLike);
  }

  function canDragMapAtCurrentZoom(dataLike = getCurrentData()) {
    return !!dataLike && !isMinZoomActive(dataLike);
  }

  function getZoomStepPercent(dataLike = getCurrentData()) {
    const fallback = 25;
    const raw = Number(resolveZoomStepPercent?.(dataLike));
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(5, Math.round(raw));
  }

  function zoomIn() {
    const step = getZoomStepPercent();
    setZoomPercent(getZoomPercent() + step, { centerMode: "selected-or-village" });
  }

  function zoomOut() {
    const step = getZoomStepPercent();
    setZoomPercent(getZoomPercent() - step, { centerMode: "selected-or-village" });
  }

  function zoomReset() {
    setZoomPercent(100, { centerMode: "selected-or-village" });
  }

  return {
    setZoomPercent,
    isMinZoomActive,
    canDragMapAtCurrentZoom,
    queueCameraFocusAtWorld,
    queueCameraFocusAtTile,
    zoomIn,
    zoomOut,
    zoomReset
  };
}
