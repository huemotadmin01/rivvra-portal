// ============================================================================
// signaturePadResize.js — keep the drawing box the right size without ever
// wiping it mid-stroke (2026-11-26)
// ============================================================================
//
// react-signature-canvas, by default (`clearOnResize`), wipes the pad on EVERY
// window `resize` event — even when the pad itself did not change size.
// Chrome on iPhone fires `resize` whenever its address bar slides in or out,
// which happens while the signer's finger is on the screen. The pad was wiped
// mid-stroke: the signature vanished, and the next finger movement crashed
// inside signature_pad 2.3.2 (Sentry RIVVRA-PORTAL-9 / -A on the public
// signing page, 26 Nov: "this._data[this._data.length-1].push" and
// "t.length").
//
// So: the page passes `clearOnResize={false}` and uses this hook instead. It
// re-fits the bitmap only when the canvas's OWN displayed size changed
// (rotation, the modal finishing its layout), waits until the finger lifts if
// a stroke is in progress, and redraws what was already signed, scaled to the
// new size, instead of erasing it.
//
// Usage:
//   const sigPad = useSignaturePadFit(sigCanvasRef, isOpenAndDrawTab);
//   <SignatureCanvas ref={sigCanvasRef} clearOnResize={false}
//     onBegin={() => { sigPad.onBegin(); … }} onEnd={sigPad.onEnd} … />
// ============================================================================

import { useCallback, useEffect, useRef } from 'react';

export function useSignaturePadFit(sigRef, active) {
  const drawing = useRef(false);
  const pending = useRef(false);

  const fit = useCallback(() => {
    const api = sigRef.current;
    if (!api) return;
    if (drawing.current) { pending.current = true; return; }   // never mid-stroke
    let canvas;
    try { canvas = api.getCanvas(); } catch { return; }
    if (!canvas) return;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const w = Math.round(canvas.offsetWidth * ratio);
    const h = Math.round(canvas.offsetHeight * ratio);
    if (!w || !h) return;                                        // hidden / not laid out
    if (canvas.width === w && canvas.height === h) return;      // same size: leave it alone

    // Points are stored in CSS pixels, so scale them by the change in size.
    const sx = canvas.width ? w / canvas.width : 1;
    const sy = canvas.height ? h / canvas.height : 1;
    const data = api.isEmpty() ? null : api.toData();
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').scale(ratio, ratio);
    api.clear();
    if (data && data.length) {
      api.fromData(data.map((group) => group.map((p) => ({ ...p, x: p.x * sx, y: p.y * sy }))));
    }
  }, [sigRef]);

  useEffect(() => {
    if (!active) return undefined;
    let ro = null;
    let timer = 0;
    let tries = 0;
    // A short timer, not requestAnimationFrame: rAF is paused in a background
    // tab, which left a needed re-fit waiting until the tab came back.
    const schedule = () => { clearTimeout(timer); timer = setTimeout(fit, 60); };
    // The canvas mounts with the modal; wait for it to exist.
    const attach = () => {
      let canvas = null;
      try { canvas = sigRef.current?.getCanvas(); } catch { canvas = null; }
      if (!canvas) { if (tries++ < 50) timer = setTimeout(attach, 50); return; }
      if (typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(schedule);
        ro.observe(canvas);
      }
      schedule();
    };
    attach();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    return () => {
      clearTimeout(timer);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
    };
  }, [active, fit, sigRef]);

  const onBegin = useCallback(() => { drawing.current = true; }, []);
  const onEnd = useCallback(() => {
    drawing.current = false;
    if (pending.current) { pending.current = false; fit(); }
  }, [fit]);

  return { onBegin, onEnd };
}
