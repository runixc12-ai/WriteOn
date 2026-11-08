"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { ArrowRight, Camera, Check, CheckCircle2, ChevronDown, CircleHelp, Clipboard, Copy, ImagePlus, Link2, LoaderCircle, Monitor, RefreshCw, Settings2, ShieldCheck, Smartphone, Sparkles, Square, Volume2, Wifi, WifiOff, X, AlertCircle, LogOut } from "lucide-react";
import { api, ApiError, AppStatus, errorText, jpegFromFile, Logo, Modal, ProviderLink, Room, Session } from "./writeon-common";

type Keys = { gemini: string; eleven: string };
type Voice = { id: string; name: string };
const STORAGE_KEY = "writeon-session-v1";

export function LaptopStation() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [origin, setOrigin] = useState("");
  const [keys, setKeys] = useState<Keys>({ gemini: "", eleven: "" });
  const [draft, setDraft] = useState<Keys>({ gemini: "", eleven: "" });
  const [keyVersion, setKeyVersion] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [networkError, setNetworkError] = useState(false);
  const [notice, setNotice] = useState("");
  const [clock, setClock] = useState(Date.now());
  const [captureStartedAt, setCaptureStartedAt] = useState(0);
  const [voiceMode, setVoiceMode] = useState<"browser" | "eleven">("browser");
  const [voices, setVoices] = useState<Voice[]>([]);
  const [voiceId, setVoiceId] = useState("");
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [speech, setSpeech] = useState<"idle" | "preparing" | "speaking">("idle");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const uploadRef = useRef<HTMLInputElement>(null);
  const sessionRef = useRef<Session | null>(null);
  const roomRef = useRef<Room | null>(null);
  const createPromise = useRef<Promise<Session> | null>(null);
  const lastApplied = useRef("");
  const lastFrame = useRef("");
  const lastAttempt = useRef("");
  const mutationGeneration = useRef(0);
  const transcriptionAbort = useRef<AbortController | null>(null);
  const transcriptionGeneration = useRef(0);
  const speechGeneration = useRef(0);
  const speechAbort = useRef<AbortController | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioURL = useRef<string | null>(null);

  const hasGemini = !!keys.gemini || !!status?.geminiConfigured;
  const hasEleven = !!keys.eleven || !!status?.elevenConfigured;
  const hasPhoto = !!room?.hasFrame && room.frameSeq > 0;
  const phoneOnline = !!room?.phoneReady && !!room?.phoneSeenAt && clock - room.phoneSeenAt < 12000 && !networkError;
  const awaitingPhoto = !!room && room.captureSeq > room.frameSeq;
  const waitingFresh = awaitingPhoto && clock - captureStartedAt < 15000;
  const captureBusy = requesting || uploading || waitingFresh;
  const phoneURL = session && origin ? `${origin}/phone/${session.id}#${session.token}` : "";
  const captureLabel = uploading ? "Uploading photo…" : waitingFresh || requesting ? "Waiting for phone…" : room?.frameSeq ? "Capture again" : "Capture writing";

  const stopSpeech = useCallback(() => {
    speechGeneration.current++;
    speechAbort.current?.abort(); speechAbort.current = null;
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.currentTime = 0; audioRef.current = null; }
    if (audioURL.current) { URL.revokeObjectURL(audioURL.current); audioURL.current = null; }
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeech("idle");
  }, []);

  useEffect(() => {
    setOrigin(window.location.origin);
    try { const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "null"); if (saved?.id && saved?.token && saved.expiresAt > Date.now()) { sessionRef.current = saved; setSession(saved); } else sessionStorage.removeItem(STORAGE_KEY); } catch { sessionStorage.removeItem(STORAGE_KEY); }
    api<AppStatus>("/api/status").then(setStatus).catch((e) => setError(errorText(e, "Could not check the connection. Refresh to try again.")));
    const ticker = window.setInterval(() => setClock(Date.now()), 1500);
    return () => { window.clearInterval(ticker); transcriptionAbort.current?.abort(); stopSpeech(); };
  }, [stopSpeech]);

  useEffect(() => { roomRef.current = room; }, [room]);
  useEffect(() => {
    if (!phoneURL) { setQr(""); return; }
    let live = true;
    QRCode.toDataURL(phoneURL, { width: 252, margin: 2, color: { dark: "#133d3c", light: "#ffffff" }, errorCorrectionLevel: "M" }).then((result) => { if (live) setQr(result); }).catch(() => setQr(""));
    return () => { live = false; };
  }, [phoneURL]);

  useEffect(() => {
    if (!session) return;
    let live = true; let timer: ReturnType<typeof setTimeout>; let failures = 0;
    const poll = async () => {
      if (!live) return;
      if (document.hidden) { timer = setTimeout(poll, 1800); return; }
      try {
        const generation = mutationGeneration.current;
        const result = await api<Room>(`/api/rooms/${session.id}`);
        if (!live) return;
        if (generation === mutationGeneration.current) setRoom((current) => {
          if (current?.id === result.id && (result.captureSeq < current.captureSeq || result.frameSeq < current.frameSeq)) return current;
          if (current?.id === result.id && result.hasFrame && result.captureSeq === current.captureSeq && result.frameSeq === current.frameSeq && result.transcriptSeq < current.transcriptSeq) return current;
          return result;
        });
        setNetworkError(false); failures = 0;
      } catch (e) {
        if (!live) return;
        failures++; setNetworkError(true);
        if (e instanceof ApiError && (e.status === 404 || e.status === 410)) {
          sessionRef.current = null; setSession(null); setRoom(null); sessionStorage.removeItem(STORAGE_KEY); setError("This session has ended. Connect your phone to start a new one."); return;
        }
      }
      if (live) timer = setTimeout(poll, Math.min(6000, 1500 * Math.max(1, failures)));
    };
    void poll();
    return () => { live = false; clearTimeout(timer); };
  }, [session]);

  useEffect(() => {
    if (!room) return;
    const current = `${room.id}:${room.frameSeq}`;
    if (room.frameSeq && current !== lastFrame.current) {
      lastFrame.current = current; stopSpeech();
      if (room.transcriptSeq !== room.frameSeq) setText("");
    }
    const transcriptKey = `${room.id}:${room.transcriptSeq}`;
    if (room.transcriptSeq > 0 && transcriptKey !== lastApplied.current) {
      lastApplied.current = transcriptKey; setText(room.transcript || "");
    }
  }, [room, stopSpeech]);

  const ensureSession = useCallback(async (): Promise<Session> => {
    if (sessionRef.current && sessionRef.current.expiresAt > Date.now()) return sessionRef.current;
    if (createPromise.current) return createPromise.current;
    setCreating(true);
    createPromise.current = api<Session>("/api/rooms", { method: "POST", body: "{}" }).then((value) => {
      sessionRef.current = value; setSession(value); sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value)); return value;
    }).finally(() => { setCreating(false); createPromise.current = null; });
    return createPromise.current;
  }, []);

  const transcribe = useCallback(async (roomId: string, frameSeq: number) => {
    if (!hasGemini) { setDraft(keys); setSetupOpen(true); return; }
    transcriptionAbort.current?.abort(); const controller = new AbortController(); transcriptionAbort.current = controller;
    const generation = ++transcriptionGeneration.current;
    setTranscribing(true); setError(""); setNotice("");
    try {
      const result = await api<{ text: string; uncertain: boolean; notes: string; frameSeq: number }>(`/api/rooms/${roomId}/transcribe`, {
        method: "POST", headers: keys.gemini ? { "x-gemini-key": keys.gemini } : {}, body: JSON.stringify({ frameSeq }), signal: controller.signal,
      });
      if (generation !== transcriptionGeneration.current || sessionRef.current?.id !== roomId || (roomRef.current && (roomRef.current.frameSeq !== frameSeq || roomRef.current.captureSeq !== frameSeq))) return;
      mutationGeneration.current++; lastApplied.current = `${roomId}:${frameSeq}`; setText(result.text); setRoom((current) => current && current.id === roomId && current.frameSeq === frameSeq ? { ...current, transcript: result.text, transcriptSeq: frameSeq, uncertain: result.uncertain, notes: result.notes } : current);
      if (!result.text.trim()) setNotice("No readable message was found. Check the writing and capture again.");
    } catch (e) { if (generation === transcriptionGeneration.current && !(e instanceof Error && e.name === "AbortError")) setError(errorText(e)); }
    finally { if (generation === transcriptionGeneration.current) setTranscribing(false); }
  }, [hasGemini, keys]);

  useEffect(() => {
    if (!room?.hasFrame || !room.frameSeq || room.captureSeq !== room.frameSeq || room.transcriptSeq === room.frameSeq || !hasGemini) return;
    const attempt = `${room.id}:${room.frameSeq}:${keyVersion}`;
    if (lastAttempt.current === attempt) return;
    lastAttempt.current = attempt; void transcribe(room.id, room.frameSeq);
  }, [room?.id, room?.frameSeq, room?.captureSeq, room?.transcriptSeq, room?.hasFrame, hasGemini, keyVersion, transcribe]);

  const capture = useCallback(async () => {
    if (!sessionRef.current || !phoneOnline || captureBusy) return;
    mutationGeneration.current++; stopSpeech(); transcriptionAbort.current?.abort(); transcriptionGeneration.current++; setTranscribing(false);
    setError(""); setNotice(""); setRequesting(true); setCaptureStartedAt(Date.now());
    try {
      const { captureSeq } = await api<{ captureSeq: number }>(`/api/rooms/${sessionRef.current.id}/capture`, { method: "POST", body: "{}" });
      mutationGeneration.current++; setRoom((current) => current ? { ...current, captureSeq: Math.max(current.captureSeq, captureSeq) } : current); setText("");
    } catch (e) { setError(errorText(e)); }
    finally { setRequesting(false); }
  }, [phoneOnline, captureBusy, stopSpeech]);

  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.key === "Escape") { stopSpeech(); return; }
      if (e.code === "Space" && !e.repeat && !setupOpen && !pairOpen && !helpOpen && !confirmEnd && !target.closest("input, textarea, select, button, a, [contenteditable=true]")) { e.preventDefault(); void capture(); }
    };
    window.addEventListener("keydown", keyboard); return () => window.removeEventListener("keydown", keyboard);
  }, [capture, stopSpeech, setupOpen, pairOpen, helpOpen, confirmEnd]);

  const upload = async (file: File | undefined) => {
    if (!file || uploading) return;
    mutationGeneration.current++; setUploading(true); setError(""); setNotice(""); stopSpeech(); transcriptionAbort.current?.abort(); transcriptionGeneration.current++; setTranscribing(false);
    try {
      const image = await jpegFromFile(file); const active = await ensureSession();
      await api(`/api/rooms/${active.id}/upload`, { method: "POST", body: JSON.stringify({ image, mimeType: "image/jpeg" }) });
      const updated = await api<Room>(`/api/rooms/${active.id}`); mutationGeneration.current++; setRoom((current) => current?.id === updated.id && (current.captureSeq > updated.captureSeq || current.frameSeq > updated.frameSeq) ? current : updated);
    } catch (e) { setError(errorText(e)); }
    finally { setUploading(false); if (uploadRef.current) uploadRef.current.value = ""; }
  };

  const connectPhone = async () => {
    setError("");
    try { await ensureSession(); setPairOpen(true); } catch (e) { setError(errorText(e)); }
  };

  const loadVoices = useCallback(async () => {
    if (!hasEleven) return;
    setLoadingVoices(true);
    try { const result = await api<{ voices: Voice[] }>("/api/voices", { method: "POST", body: "{}", headers: keys.eleven ? { "x-elevenlabs-key": keys.eleven } : {} }); setVoices(result.voices); setVoiceId((id) => result.voices.some((v) => v.id === id) ? id : result.voices[0]?.id || ""); if (!result.voices.length) setError("No accessible ElevenLabs voices were returned for this key."); }
    catch (e) { setError(errorText(e)); }
    finally { setLoadingVoices(false); }
  }, [hasEleven, keys.eleven]);
  useEffect(() => { if (voiceMode === "eleven" && hasEleven) void loadVoices(); }, [voiceMode, loadVoices, hasEleven]);

  const speak = async () => {
    const approved = text.trim(); if (!approved || approved.length > 3000) return;
    stopSpeech(); setError(""); const generation = speechGeneration.current;
    if (voiceMode === "browser") {
      if (!("speechSynthesis" in window)) { setError("Browser voice is unavailable here. Use ElevenLabs in Setup."); return; }
      const utterance = new SpeechSynthesisUtterance(approved); utterance.rate = .95;
      utterance.onend = () => { if (generation === speechGeneration.current) setSpeech("idle"); };
      utterance.onerror = (event) => { if (generation === speechGeneration.current) { setSpeech("idle"); if (event.error !== "interrupted" && event.error !== "canceled") setError("The browser could not play speech. Try again or use ElevenLabs."); } };
      setSpeech("speaking"); window.speechSynthesis.speak(utterance); return;
    }
    if (!hasEleven) { setDraft(keys); setSetupOpen(true); return; }
    if (!voiceId) { setError("Choose an ElevenLabs voice before speaking."); return; }
    const controller = new AbortController(); speechAbort.current = controller; setSpeech("preparing");
    try {
      const response = await fetch("/api/speak", { method: "POST", headers: { "content-type": "application/json", ...(keys.eleven ? { "x-elevenlabs-key": keys.eleven } : {}) }, body: JSON.stringify({ text: approved, voiceId }), signal: controller.signal, cache: "no-store" });
      if (!response.ok) { const body = await response.json().catch(() => ({})) as { error?: string }; throw new Error(body.error || "Speech could not be generated. Try again."); }
      const blob = await response.blob(); if (generation !== speechGeneration.current) return;
      const url = URL.createObjectURL(blob); audioURL.current = url;
      const audio = new Audio(url); audioRef.current = audio;
      audio.onended = () => { if (generation === speechGeneration.current) stopSpeech(); };
      audio.onerror = () => { if (generation === speechGeneration.current) { stopSpeech(); setError("Audio could not play. Check your browser audio permissions."); } };
      await audio.play(); if (generation === speechGeneration.current) setSpeech("speaking"); else audio.pause();
    } catch (e) { if (generation === speechGeneration.current && !(e instanceof Error && e.name === "AbortError")) { stopSpeech(); setError(errorText(e)); } }
  };

  const endSession = async () => {
    mutationGeneration.current++; setConfirmEnd(false); stopSpeech(); transcriptionAbort.current?.abort(); transcriptionGeneration.current++; setTranscribing(false);
    try { if (sessionRef.current) await api(`/api/rooms/${sessionRef.current.id}`, { method: "DELETE" }); sessionStorage.removeItem(STORAGE_KEY); sessionRef.current = null; roomRef.current = null; setSession(null); setRoom(null); setText(""); setError(""); setNotice("Session ended. Its captured image and transcript were cleared."); setPairOpen(false); }
    catch (e) { setError(errorText(e)); }
  };

  const saveSetup = () => { setKeys({ gemini: draft.gemini.trim(), eleven: draft.eleven.trim() }); setKeyVersion((v) => v + 1); setSetupOpen(false); setError(""); if (draft.eleven.trim()) setVoiceMode("eleven"); };
  const openSetup = () => { setDraft(keys); setSetupOpen(true); };

  return <div className="app-shell">
    <header className="site-header"><Logo/><div className="header-middle"><span className="header-device"><Monitor size={15}/> Laptop workspace</span></div><div className="header-actions"><button className="help-button" onClick={() => setHelpOpen(true)} aria-label="How WriteOn works"><CircleHelp size={20}/></button><button className="button button-light button-small" onClick={openSetup}><Settings2 size={17}/> Setup{!hasGemini && <span className="setup-dot" aria-label="Gemini key needed"/>}</button></div></header>
    <main className="workspace">
      <div className="intro-row"><div><div className="eyebrow"><span className="small-line"/> HANDWRITING TO SPEECH</div><h1>Your words.<br className="mobile-break"/> <span>Your voice.</span></h1><p className="intro-copy">Write your message. Capture it. Choose when it’s heard.</p></div><div className={`connection-pill ${phoneOnline ? "connected" : ""}`}>{phoneOnline ? <Wifi size={16}/> : <Smartphone size={16}/>}<span>{phoneOnline ? "Phone connected" : session ? "Waiting for phone" : "Phone not connected"}</span><span className="status-dot"/></div></div>

      {status && !status.signedIn && <div className="message-banner warning"><ShieldCheck size={19}/><span>Sign in to use this private workspace. Use the same account on your phone.</span><a className="inline-action" href="/signin-with-chatgpt?return_to=%2F" target="_top">Sign in <ArrowRight size={15}/></a></div>}
      {error && <div className="message-banner error" role="alert"><AlertCircle size={19}/><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="Dismiss error"><X size={17}/></button></div>}
      {notice && <div className="message-banner" role="status"><CheckCircle2 size={19}/><span>{notice}</span><button className="icon-button" onClick={() => setNotice("")} aria-label="Dismiss notice"><X size={17}/></button></div>}
      {networkError && <div className="message-banner warning" role="status"><WifiOff size={18}/><span>Connection interrupted. Reconnecting automatically; keep both devices online.</span></div>}

      <div className="work-grid">
        <section className="panel capture-panel" aria-labelledby="capture-title">
          <div className="panel-header"><div className="panel-heading"><span className="step-number">01</span><div><h2 id="capture-title">Capture your writing</h2><p>Your phone becomes the camera.</p></div></div><span className={`mini-status ${hasPhoto ? "success" : ""}`}>{hasPhoto ? "PHOTO READY" : "GET CONNECTED"}</span></div>
          <div className={`capture-preview ${hasPhoto ? "has-photo" : ""}`} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files[0]); }}>
            {hasPhoto && room ? <><img src={`/api/rooms/${room.id}/frame?seq=${room.frameSeq}`} alt="Latest captured handwriting. Review the transcription alongside this image."/><div className="photo-tag"><span className="status-dot"/> Last captured image</div><button className="preview-upload" onClick={() => uploadRef.current?.click()} disabled={uploading} aria-label="Choose another photo"><ImagePlus size={17}/></button></> : <div className="capture-empty"><div className="camera-illustration"><span className="corner top-left"/><span className="corner top-right"/><span className="corner bottom-left"/><span className="corner bottom-right"/><Smartphone size={57} strokeWidth={1.15}/><span className="illustration-spark"><Sparkles size={19}/></span></div><h3>{session ? "Your camera is one scan away" : "Let’s connect your phone"}</h3><p>Scan a QR code, allow the camera,<br/>and place your phone in its stand.</p><button className="button button-dark" onClick={connectPhone} disabled={creating || status?.signedIn === false}>{creating ? <LoaderCircle className="spin" size={17}/> : <Link2 size={17}/>} {creating ? "Creating session…" : "Connect phone"}<ArrowRight size={17}/></button><span className="capture-empty-caption">No app download needed</span></div>}
            {(uploading || waitingFresh) && <div className="preview-overlay"><LoaderCircle className="spin" size={30}/><span>{uploading ? "Preparing your photo…" : "Taking a photo on your phone…"}</span></div>}
          </div>
          <div className="capture-actions"><button className="button button-primary capture-button" onClick={() => void capture()} disabled={!phoneOnline || captureBusy}>{captureBusy ? <LoaderCircle className="spin" size={21}/> : <Camera size={21}/>} {captureLabel}<kbd>SPACE</kbd></button><div className="capture-secondary"><button className="text-button" onClick={() => uploadRef.current?.click()} disabled={uploading || creating || status?.signedIn === false}><ImagePlus size={16}/> Choose a photo</button><button className="text-button" onClick={connectPhone} disabled={creating || status?.signedIn === false}><Smartphone size={16}/>{session ? "Pairing details" : "Pair phone"}</button></div><input ref={uploadRef} className="visually-hidden" type="file" accept="image/*" onChange={(e) => void upload(e.target.files?.[0])} aria-label="Upload a handwriting photo"/>
          {!phoneOnline && <p className="helper-line">{awaitingPhoto ? "No photo received yet. Keep the phone camera page open, then try again." : "You can also upload a photo to test transcription."}</p>}</div>
        </section>

        <section className="panel message-panel" aria-labelledby="message-title">
          <div className="panel-header"><div className="panel-heading"><span className="step-number">02</span><div><h2 id="message-title">Review your message</h2><p>Your words stay yours.</p></div></div><span className="gemini-label"><Sparkles size={14}/> Gemini</span></div>
          <div className="editor-area"><div className="editor-topline"><label htmlFor="message">MESSAGE TO SPEAK</label><span>{text.length}/3,000</span></div><textarea id="message" readOnly={transcribing} aria-busy={transcribing} value={text} onChange={(e) => setText(e.target.value)} maxLength={3000} placeholder={transcribing ? "Reading your handwriting…" : "Your writing will appear here.\n\nYou can also type a message."} aria-describedby="review-note" spellCheck={true}/>
          <div className="editor-status" aria-live="polite">{transcribing ? <><LoaderCircle size={16} className="spin"/> Gemini is reading your photo…</> : hasPhoto && !hasGemini ? <><Sparkles size={16}/><button className="inline-link" onClick={openSetup}>Add a Gemini key to transcribe this photo</button></> : room?.uncertain && room.transcriptSeq === room.frameSeq ? <span className="uncertain-note"><AlertCircle size={16}/> Check unclear words before speaking.{room.notes && <small>{room.notes}</small>}</span> : text.trim() ? <><CheckCircle2 size={16}/> Ready for your review</> : <><PenIcon/> Nothing is spoken automatically.</>}</div>
          {hasPhoto && room && hasGemini && <button className="text-button retry-button" onClick={() => void transcribe(room.id, room.frameSeq)} disabled={transcribing}><RefreshCw size={14}/>{room.transcriptSeq === room.frameSeq ? "Read photo again" : "Retry transcription"}</button>}</div>
          <div className="speech-area"><div className="voice-row"><label htmlFor="voice-mode"><Volume2 size={16}/> Voice</label><div className="select-wrap"><select id="voice-mode" value={voiceMode} onChange={(e) => setVoiceMode(e.target.value as "browser" | "eleven")}><option value="browser">Browser voice</option><option value="eleven">ElevenLabs voice</option></select><ChevronDown size={14}/></div></div>
          {voiceMode === "eleven" && <div className="eleven-row">{hasEleven ? <><div className="select-wrap voice-select"><select aria-label="ElevenLabs voice" value={voiceId} onChange={(e) => setVoiceId(e.target.value)} disabled={loadingVoices || !voices.length}><option value="">{loadingVoices ? "Loading voices…" : "Choose a voice"}</option>{voices.map((voice) => <option key={voice.id} value={voice.id}>{voice.name}</option>)}</select><ChevronDown size={14}/></div><button className="icon-button" onClick={() => void loadVoices()} disabled={loadingVoices} aria-label="Reload ElevenLabs voices"><RefreshCw size={17} className={loadingVoices ? "spin" : ""}/></button></> : <button className="text-button" onClick={openSetup}>Add your ElevenLabs key in Setup <ArrowRight size={15}/></button>}</div>}
          <div className="speech-buttons"><button className="button speak-button" onClick={() => void speak()} disabled={!text.trim() || text.length > 3000 || transcribing || speech !== "idle" || (voiceMode === "eleven" && (!hasEleven || !voiceId))}>{speech === "preparing" ? <LoaderCircle size={22} className="spin"/> : <Volume2 size={23}/>} {speech === "preparing" ? "Preparing…" : speech === "speaking" ? "Speaking…" : "Speak message"}</button><button className="button stop-button" onClick={stopSpeech} disabled={speech === "idle"}><Square size={17} fill="currentColor"/> Stop</button></div><p id="review-note" className="speech-helper">Review and edit first. Speak plays the text shown above.</p></div>
        </section>
      </div>

      <div className="workflow-strip"><div><span className="workflow-icon"><Camera size={18}/></span><span><strong>Capture</strong><small>Phone camera or a photo</small></span></div><ArrowRight className="workflow-arrow" size={17}/><div><span className="workflow-icon"><Sparkles size={18}/></span><span><strong>Review</strong><small>Gemini reads. You approve.</small></span></div><ArrowRight className="workflow-arrow" size={17}/><div><span className="workflow-icon"><Volume2 size={18}/></span><span><strong>Speak</strong><small>Your message, on your terms</small></span></div></div>
      <footer className="workspace-footer"><span><ShieldCheck size={14}/> A private communication workspace</span><div>{session && <button className="text-button" onClick={() => setConfirmEnd(true)}><LogOut size={14}/> End session</button>}<span className="footer-badge">BIOHACKS 2026 · PROTOTYPE</span></div></footer>
    </main>

    <Modal open={pairOpen} title="Connect your phone" onClose={() => setPairOpen(false)}><div className="pair-content"><div className="pair-qr">{qr ? <img src={qr} alt="QR code to connect this phone camera to the current WriteOn session"/> : <LoaderCircle size={28} className="spin"/>}</div><ol className="pair-steps"><li>Scan this code with your phone camera.</li><li>Sign in with the <strong>same ChatGPT account</strong> if asked.</li><li>Tap <strong>Start camera</strong>, allow access, and put the phone in its stand.</li></ol><div className={`pair-state ${phoneOnline ? "connected" : ""}`}><span className="status-dot"/>{phoneOnline ? "Camera connected. You’re ready to capture." : "Waiting for your phone camera…"}</div><div className="copy-row"><input readOnly value={phoneURL} aria-label="Phone pairing link" onFocus={(e) => e.target.select()}/><button className="button button-light" onClick={async () => { try { await navigator.clipboard.writeText(phoneURL); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setError("Could not copy automatically. Select and copy the pairing link."); } }}>{copied ? <Check size={17}/> : <Copy size={17}/>} {copied ? "Copied" : "Copy"}</button></div><p className="modal-note">Keep the camera page open and the phone awake. Both devices need internet. This pairing link is private to your session.</p><button className="button button-primary full-width" onClick={() => setPairOpen(false)}>{phoneOnline ? "Ready to write" : "Back to workspace"}<ArrowRight size={17}/></button></div></Modal>

    <Modal open={setupOpen} title="Set up your tools" onClose={() => setSetupOpen(false)}><div className="setup-content"><p className="modal-intro">Connect Gemini to read handwriting. Add ElevenLabs for its voice library, or use the built-in browser voice.</p><label className="field-label" htmlFor="gemini-key"><Sparkles size={17}/> Gemini API key <span>{status?.geminiConfigured ? "Server connected" : "Required for transcription"}</span></label><input id="gemini-key" type="password" className="key-input" value={draft.gemini} onChange={(e) => setDraft({ ...draft, gemini: e.target.value })} placeholder={status?.geminiConfigured ? "A server key is already configured" : "Paste your Gemini API key"} autoComplete="off" spellCheck={false}/><ProviderLink href="https://aistudio.google.com/api-keys">Get a Gemini API key</ProviderLink><label className="field-label second-field" htmlFor="eleven-key"><Volume2 size={17}/> ElevenLabs API key <span>Optional</span></label><input id="eleven-key" type="password" className="key-input" value={draft.eleven} onChange={(e) => setDraft({ ...draft, eleven: e.target.value })} placeholder={status?.elevenConfigured ? "A server key is already configured" : "Paste your ElevenLabs API key"} autoComplete="off" spellCheck={false}/><ProviderLink href="https://elevenlabs.io/app/api/api-keys">Get an ElevenLabs API key</ProviderLink><p className="modal-note">Enable Text to Speech and Voices read access for this key.</p><div className="privacy-note"><ShieldCheck size={19}/><p>Keys stay in this tab and are cleared on refresh. Requests pass securely through WriteOn to the selected provider. Your photos are sent to Google only when transcribed; approved text is sent to ElevenLabs only when you use its voice.</p></div><button className="button button-primary full-width" onClick={saveSetup}>Use these settings <ArrowRight size={17}/></button></div></Modal>

    <Modal open={helpOpen} title="A little setup, then your words" onClose={() => setHelpOpen(false)}><div className="help-content"><div className="help-step"><span>1</span><div><h3>Connect and position</h3><p>Open the pairing link on your phone. Start its rear camera and place it above your writing area. Keep the phone page open.</p></div></div><div className="help-step"><span>2</span><div><h3>Write, then capture</h3><p>Move your hand out of the writing area. Press Capture here, or use the space bar when you’re not typing. You can also choose an existing photo.</p></div></div><div className="help-step"><span>3</span><div><h3>Review before speaking</h3><p>Gemini can misread handwriting. Check and edit the message, then press Speak. Stop or the Escape key stops speech.</p></div></div><div className="privacy-note"><ShieldCheck size={18}/><p>This is an early hackathon prototype. Setting up the phone, mount and controls may require assistance. End the session to clear its captured image and transcript.</p></div></div></Modal>

    <Modal open={confirmEnd} title="End this session?" onClose={() => setConfirmEnd(false)}><div className="setup-content"><p className="modal-intro">The phone will disconnect, and this session’s captured photo and transcript will be cleared. Your API keys remain only in this open tab.</p><div className="dialog-actions"><button className="button button-light" onClick={() => setConfirmEnd(false)}>Keep session</button><button className="button button-dark" onClick={() => void endSession()}>End session</button></div></div></Modal>
  </div>;
}

function PenIcon() { return <Clipboard size={15}/>; }
