"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, CheckCircle2, ChevronRight, ImagePlus, LoaderCircle, Monitor, ShieldCheck, Smartphone, Sparkles, Wifi, WifiOff, AlertCircle } from "lucide-react";
import { api, ApiError, AppStatus, errorText, jpegFromFile, jpegFromSource, Logo } from "./writeon-common";

type Poll = { captureSeq: number; frameSeq: number };
type WakeSentinel = { release: () => Promise<void> };

export function PhoneStation({ roomId }: { roomId: string }) {
  const [token, setToken] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [active, setActive] = useState(false);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [ended, setEnded] = useState(false);
  const [error, setError] = useState("");
  const [lastSent, setLastSent] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [returnTo, setReturnTo] = useState(`/phone/${roomId}`);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadRef = useRef<HTMLInputElement>(null);
  const wakeRef = useRef<WakeSentinel | null>(null);
  const busyRef = useRef(false);
  const lastAttemptRef = useRef(0);
  const tokenRef = useRef("");
  const mountedRef = useRef(true);

  const releaseWake = useCallback(async () => { try { await wakeRef.current?.release(); } catch {} wakeRef.current = null; }, []);
  const acquireWake = useCallback(async () => {
    if (document.visibilityState !== "visible" || wakeRef.current) return;
    const supported = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<WakeSentinel> } };
    try { if (supported.wakeLock) wakeRef.current = await supported.wakeLock.request("screen"); } catch { /* Manual keep-awake notice remains visible. */ }
  }, []);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false); void releaseWake();
    if (tokenRef.current) void api(`/api/rooms/${roomId}/phone`, { method: "POST", headers: { "x-phone-token": tokenRef.current }, body: JSON.stringify({ ready: false }) }).catch(() => {});
  }, [releaseWake, roomId]);

  useEffect(() => {
    mountedRef.current = true;
    const fragment = window.location.hash.slice(1);
    let nextToken = fragment;
    try { if (fragment) sessionStorage.setItem(`writeon-phone-${roomId}`, fragment); else nextToken = sessionStorage.getItem(`writeon-phone-${roomId}`) || ""; } catch {}
    setToken(nextToken); tokenRef.current = nextToken; setLoaded(true);
    setReturnTo(`/phone/${roomId}${nextToken ? `#${nextToken}` : ""}`);
    api<AppStatus>("/api/status").then(setStatus).catch((e) => setError(errorText(e)));
    return () => { mountedRef.current = false; streamRef.current?.getTracks().forEach((track) => track.stop()); void releaseWake(); };
  }, [roomId, releaseWake]);

  const sendCurrentPhoto = useCallback(async (seq: number) => {
    if (busyRef.current || !videoRef.current || !streamRef.current?.active || !tokenRef.current) return;
    busyRef.current = true; setBusy(true); setError(""); lastAttemptRef.current = seq;
    try {
      const video = videoRef.current;
      const image = await jpegFromSource(video, video.videoWidth, video.videoHeight);
      await api(`/api/rooms/${roomId}/frame`, { method: "POST", headers: { "x-phone-token": tokenRef.current }, body: JSON.stringify({ seq, image, mimeType: "image/jpeg" }) });
      if (mountedRef.current) { setLastSent(Date.now()); setNotice("Photo sent to your laptop."); }
    } catch (e) {
      if (mountedRef.current && !(e instanceof ApiError && e.status === 409)) setError(errorText(e) + " Try Capture again on the laptop.");
    } finally { busyRef.current = false; if (mountedRef.current) setBusy(false); }
  }, [roomId]);

  useEffect(() => {
    if (!token || ended || status?.signedIn === false) return;
    let live = true; let timer: ReturnType<typeof setTimeout>; let failures = 0;
    const poll = async () => {
      if (!live) return;
      if (document.hidden) { timer = setTimeout(poll, 1800); return; }
      try {
        const ready = !!streamRef.current?.active && !!videoRef.current?.videoWidth;
        const result = await api<Poll>(`/api/rooms/${roomId}/phone`, { method: "POST", headers: { "x-phone-token": token }, body: JSON.stringify({ ready }) });
        if (!live) return;
        setConnected(true); failures = 0;
        if (ready && result.captureSeq > result.frameSeq && result.captureSeq > lastAttemptRef.current) await sendCurrentPhoto(result.captureSeq);
      } catch (e) {
        if (!live) return;
        setConnected(false); failures++;
        if (e instanceof ApiError && (e.status === 404 || e.status === 410)) { setEnded(true); stopCamera(); setError("This session has ended. Scan a new pairing code from the laptop."); return; }
        if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { setError("This phone could not join the session. Use the same account as the laptop and scan its complete pairing code."); }
      }
      if (live) timer = setTimeout(poll, Math.min(6000, 1500 * Math.max(1, failures)));
    };
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [token, ended, roomId, sendCurrentPhoto, status?.signedIn, stopCamera]);

  useEffect(() => {
    const visibility = () => {
      if (document.hidden) {
        void releaseWake();
        if (tokenRef.current) void api(`/api/rooms/${roomId}/phone`, { method: "POST", headers: { "x-phone-token": tokenRef.current }, body: JSON.stringify({ ready: false }) }).catch(() => {});
      } else if (streamRef.current?.active) void acquireWake();
    };
    document.addEventListener("visibilitychange", visibility);
    return () => document.removeEventListener("visibilitychange", visibility);
  }, [roomId, acquireWake, releaseWake]);

  const startCamera = async () => {
    if (starting || ended || !token) return;
    setStarting(true); setError(""); setNotice("");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is unavailable here. Open this secure link in Safari or Chrome, or choose a photo below.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } } });
      if (!mountedRef.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      stream.getVideoTracks()[0]?.addEventListener("ended", () => { setActive(false); setNotice("Camera stopped. Tap Start camera to reconnect."); void releaseWake(); }, { once: true });
      setActive(true); void acquireWake();
    } catch (e) {
      streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null; setActive(false);
      if (e instanceof DOMException && e.name === "NotAllowedError") setError("Camera permission was not granted. Allow camera access in your browser settings, then try again. You can also choose a photo below.");
      else setError(errorText(e, "The camera could not start. Close other camera apps and try again."));
    } finally { setStarting(false); }
  };

  const uploadPhoto = async (file: File | undefined) => {
    if (!file || busyRef.current || !token) return;
    busyRef.current = true; setBusy(true); setError("");
    try {
      const image = await jpegFromFile(file);
      await api(`/api/rooms/${roomId}/upload`, { method: "POST", headers: { "x-phone-token": token }, body: JSON.stringify({ image, mimeType: "image/jpeg" }) });
      setLastSent(Date.now()); setNotice("Photo sent to your laptop. Review the message there.");
    } catch (e) { setError(errorText(e)); }
    finally { busyRef.current = false; setBusy(false); if (uploadRef.current) uploadRef.current.value = ""; }
  };

  return <div className="app-shell phone-shell"><header className="site-header phone-header"><Logo phone/><span className={`connection-pill ${connected && active ? "connected" : ""}`}>{connected ? <Wifi size={15}/> : <WifiOff size={15}/>}<span>{connected && active ? "Connected" : connected ? "Paired" : "Connecting"}</span></span></header>
    <main className="phone-main"><div className="eyebrow"><span className="small-line"/> YOUR PHONE IS THE CAMERA</div><h1>{active ? "Ready when you are." : "Give your words a view."}</h1><p className="phone-intro">{active ? "Leave this page open. Capture your writing from the laptop." : "Start the rear camera, then position your phone above the writing area."}</p>
      {status && !status.signedIn && <div className="message-banner warning"><ShieldCheck size={19}/><span>Sign in with the same account as your laptop.</span><a className="inline-action" href={`/signin-with-chatgpt?return_to=${encodeURIComponent(returnTo)}`} target="_top">Sign in <ChevronRight size={16}/></a></div>}
      {loaded && !token && <div className="message-banner error" role="alert"><AlertCircle size={19}/><span>The pairing link is incomplete. Scan the QR code from your laptop again.</span></div>}
      {error && <div className="message-banner error" role="alert"><AlertCircle size={19}/><span>{error}</span></div>}
      <section className="phone-camera-card"><div className="phone-viewfinder"><video ref={videoRef} autoPlay playsInline muted className={active ? "active" : ""} aria-label="Live rear camera preview"/>{!active && <div className="phone-camera-empty"><div className="phone-camera-icon"><Camera size={48} strokeWidth={1.3}/></div><h2>{ended ? "Session ended" : "Camera is off"}</h2><p>Your camera starts only when you allow it.</p></div>}{active && <><div className="viewfinder-corners"><i/><i/><i/><i/></div><div className="phone-live"><span className="status-dot"/> LIVE CAMERA</div><div className="camera-guide">Keep the whole message in view</div></>}{busy && <div className="preview-overlay"><LoaderCircle size={30} className="spin"/><span>Sending your photo…</span></div>}</div>
        <div className="phone-camera-controls">{active ? <button className="button button-light full-width" onClick={stopCamera}><CameraOff size={20}/> Stop camera</button> : <button className="button button-primary full-width" onClick={() => void startCamera()} disabled={starting || ended || !token || status?.signedIn === false}>{starting ? <LoaderCircle size={21} className="spin"/> : <Camera size={21}/>} {starting ? "Starting camera…" : "Start camera"}</button>}<button className="text-button" onClick={() => uploadRef.current?.click()} disabled={busy || ended || !token || status?.signedIn === false}><ImagePlus size={17}/> Choose a photo instead</button><input ref={uploadRef} type="file" accept="image/*" className="visually-hidden" onChange={(e) => void uploadPhoto(e.target.files?.[0])} aria-label="Choose a handwriting photo"/></div></section>
      <div className="phone-send-status" aria-live="polite">{lastSent ? <><CheckCircle2 size={19}/><span>{notice || "Photo sent to your laptop."}</span></> : <><Monitor size={19}/><span>{active ? "Waiting for Capture on your laptop." : "Your laptop will receive each captured photo."}</span></>}</div>
      <div className="phone-tips"><div><span className="tip-number">1</span><p><strong>Position the phone</strong>Camera facing down, writing fully visible.</p></div><div><span className="tip-number">2</span><p><strong>Keep this page open</strong>Leave the screen awake and both devices online.</p></div><div><span className="tip-number">3</span><p><strong>Use the laptop</strong>Move your hand away, then press Capture there.</p></div></div><p className="phone-privacy"><ShieldCheck size={15}/> Photos are sent on capture, not as a continuous video stream.</p>
    </main></div>;
}
