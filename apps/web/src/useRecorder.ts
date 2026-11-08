import { useCallback, useEffect, useRef, useState } from 'react';

export type RecorderStatus = 'idle' | 'requesting' | 'recording' | 'ready' | 'error';

function preferredMime() {
  if (typeof MediaRecorder === 'undefined') return '';
  const options = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  return options.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

export function useRecorder(maxSeconds: number) {
  const [status, setStatus] = useState<RecorderStatus>('idle');
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const tickRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);

  const cleanup = useCallback(() => {
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
      audioCtxRef.current.close().catch(() => undefined);
    }
    audioCtxRef.current = null;
    tickRef.current = null;
    rafRef.current = null;
  }, []);

  const stop = useCallback(() => {
    if (stoppedRef.current) return;
    stoppedRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    if (tickRef.current) window.clearInterval(tickRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setBlob(null);
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setSeconds(0);
    stoppedRef.current = false;
    setStatus('requesting');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });
      streamRef.current = stream;

      const mime = preferredMime();
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      recorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || 'audio/webm';
        const recorded = new Blob(chunksRef.current, { type });
        setBlob(recorded);
        setUrl((prev) => {
          if (prev) URL.revokeObjectURL(prev);
          return URL.createObjectURL(recorded);
        });
        setStatus('ready');
        cleanup();
      };

      // Live level meter
      try {
        const ctx = new AudioContext();
        audioCtxRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          setLevel(Math.min(1, rms * 4));
          rafRef.current = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        /* meter is optional */
      }

      recorder.start(250);
      startedAtRef.current = Date.now();
      setStatus('recording');

      tickRef.current = window.setInterval(() => {
        const elapsed = (Date.now() - startedAtRef.current) / 1000;
        setSeconds(Math.min(maxSeconds, elapsed));
        if (elapsed >= maxSeconds) stop();
      }, 200);
    } catch (err) {
      cleanup();
      setStatus('error');
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission was blocked. Allow the mic in the address bar, then try again.'
          : `Microphone error: ${(err as Error).message}`
      );
    }
  }, [cleanup, maxSeconds, stop]);

  const reset = useCallback(() => {
    cleanup();
    setStatus('idle');
    setSeconds(0);
    setBlob(null);
    setLevel(0);
    setUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, [cleanup]);

  useEffect(() => () => cleanup(), [cleanup]);

  return { status, seconds, level, blob, url, error, start, stop, reset };
}
