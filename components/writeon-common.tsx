"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { X, ArrowUpRight, PenLine } from "lucide-react";

export type AppStatus = { signedIn: boolean; geminiConfigured: boolean; elevenConfigured: boolean; geminiModel: string };
export type Room = { id: string; hasFrame: boolean; captureSeq: number; frameSeq: number; capturedAt: number | null; phoneSeenAt: number | null; phoneReady: boolean; transcript: string; notes: string; uncertain: boolean; transcriptSeq: number; expiresAt: number };
export type Session = { id: string; token: string; expiresAt: number };

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(path, { ...options, headers, cache: "no-store", credentials: "same-origin" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({})) as { error?: unknown };
    throw new ApiError(typeof data.error === "string" ? data.error : `Request failed (${response.status}). Please try again.`, response.status);
  }
  return response.json() as Promise<T>;
}
export function Logo({ phone = false }: { phone?: boolean }) {
  return <a className="brand" href="/" aria-label="WriteOn home"><span className="brand-mark"><PenLine size={23} strokeWidth={2.5}/></span><span>Write<span className="brand-on">On</span></span>{phone && <span className="brand-device">CAMERA</span>}</a>;
}
export function Modal({ open, title, children, onClose, wide = false }: { open: boolean; title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const node = ref.current; if (!node) return; if (open && !node.open) node.showModal(); else if (!open && node.open) node.close(); }, [open]);
  return <dialog ref={ref} className={`modal ${wide ? "modal-wide" : ""}`} onCancel={(e) => { e.preventDefault(); onClose(); }} aria-label={title} onClick={(e) => { if (e.target === ref.current) onClose(); }}><div className="modal-head"><h2>{title}</h2><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={21}/></button></div>{children}</dialog>;
}
export function ProviderLink({ href, children }: { href: string; children: ReactNode }) {
  return <a href={href} target="_blank" rel="noreferrer" className="provider-link">{children}<ArrowUpRight size={13}/></a>;
}
export async function jpegFromSource(source: CanvasImageSource, width: number, height: number): Promise<string> {
  if (!width || !height) throw new Error("The camera is still starting. Try again in a moment.");
  const canvas = document.createElement("canvas");
  let factor = Math.min(1, 1600 / Math.max(width, height));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot capture an image. Try choosing a photo instead.");
  for (let pass = 0; pass < 4; pass++) {
    canvas.width = Math.round(width * factor); canvas.height = Math.round(height * factor);
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    for (const quality of [.85, .72, .58, .44]) {
      const image = canvas.toDataURL("image/jpeg", quality).split(",")[1];
      if (image.length <= 930000) return image;
    }
    factor *= .75;
  }
  throw new Error("That image is too large. Try a smaller photo of just the writing.");
}
export async function jpegFromFile(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file, such as a JPEG or PNG.");
  if (file.size > 25000000) throw new Error("Choose a photo smaller than 25 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await image.decode().catch(() => { throw new Error("This photo format could not be opened. Try JPEG or PNG."); });
    return await jpegFromSource(image, image.naturalWidth, image.naturalHeight);
  } finally { URL.revokeObjectURL(url); }
}
export function errorText(error: unknown, fallback = "Something went wrong. Please try again.") { return error instanceof Error ? error.message : fallback; }
