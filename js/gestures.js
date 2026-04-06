/**
 * gestures.js - タッチ・スワイプジェスチャー（Pointer Events API）
 */

export function attachGestures(element, handlers) {
  let startX = null;
  let startY = null;
  let currentX = null;
  let currentY = null;
  let startTime = null;
  let isDragging = false;

  const SWIPE_THRESHOLD = 70;
  const SWIPE_SPEED = 0.4;
  const TAP_THRESHOLD = 15;

  function onPointerDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    if (e.target.closest('button')) return;
    startX = e.clientX;
    startY = e.clientY;
    currentX = e.clientX;
    currentY = e.clientY;
    startTime = Date.now();
    isDragging = false;

    try {
      element.setPointerCapture(e.pointerId);
    } catch (_) {}
  }

  function onPointerMove(e) {
    if (startX === null) return;
    currentX = e.clientX;
    currentY = e.clientY;

    const dx = currentX - startX;
    const dy = currentY - startY;

    if (!isDragging && (Math.abs(dx) > 8 || Math.abs(dy) > 8)) {
      isDragging = true;
    }

    if (isDragging) {
      if (Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
      }
      handlers.onDrag?.(dx, dy);
    }
  }

  function onPointerUp(e) {
    if (startX === null) return;

    const dx = (currentX ?? e.clientX) - startX;
    const dy = (currentY ?? e.clientY) - startY;
    const dt = Date.now() - startTime;
    const speedX = Math.abs(dx) / Math.max(dt, 1);

    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);

    if (absDx < TAP_THRESHOLD && absDy < TAP_THRESHOLD) {
      handlers.onTap?.();
    }
    else if (absDx > absDy && (absDx > SWIPE_THRESHOLD || speedX > SWIPE_SPEED)) {
      if (dx > 0) {
        handlers.onRemembered?.();
      } else {
        handlers.onNotYet?.();
      }
    }
    else if (dy < -SWIPE_THRESHOLD && absDy > absDx) {
      handlers.onFlip?.();
    }

    startX = null;
    startY = null;
    currentX = null;
    currentY = null;
    isDragging = false;
    handlers.onDrag?.(0, 0);
  }

  function onPointerCancel() {
    startX = null;
    startY = null;
    currentX = null;
    currentY = null;
    isDragging = false;
    handlers.onDrag?.(0, 0);
  }

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove, { passive: false });
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);

  return {
    detach() {
      element.removeEventListener('pointerdown', onPointerDown);
      element.removeEventListener('pointermove', onPointerMove);
      element.removeEventListener('pointerup', onPointerUp);
      element.removeEventListener('pointercancel', onPointerCancel);
    }
  };
}

export function attachKeyboard(handlers) {
  function onKeyDown(e) {
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        handlers.onFlip?.();
        break;
      case '1':
        handlers.onNotYet?.();
        break;
      case '2':
        handlers.onRemembered?.();
        break;
      case 'z':
      case 'Z':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          handlers.onUndo?.();
        }
        break;
    }
  }

  document.addEventListener('keydown', onKeyDown);
  return {
    detach() {
      document.removeEventListener('keydown', onKeyDown);
    }
  };
}
