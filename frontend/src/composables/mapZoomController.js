export function createMapZoomController(options = {}) {
  const {
    getCurrentData,
    getVillageState,
    getZoomPercent,
    setZoomPercentValue,
    normalizeZoomPercent,
    resolveMinZoomPercent,
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
    const centerMode = nonEmptyText(zoomOptions?.centerMode) || "world";
    if (centerMode === "village") {
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

  function zoomIn() {
    setZoomPercent(getZoomPercent() + 10, { centerMode: "village" });
  }

  function zoomOut() {
    setZoomPercent(getZoomPercent() - 10, { centerMode: "village" });
  }

  function zoomReset() {
    setZoomPercent(100, { centerMode: "village" });
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
