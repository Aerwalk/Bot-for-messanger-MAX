export interface MaxBridge {
  initData: string;
  initDataUnsafe?: {
    user?: { id: number; first_name?: string };
    start_param?: string;
  };
  platform: string;
  version: string;
  BackButton?: {
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  openLink?(url: string): void;
  enableClosingConfirmation?(): void;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const g = typeof window !== 'undefined' ? (window as any) : undefined;

/** Объект bridge из макси-приложения. В обычном браузере (dev) — null. */
export const maxBridge: MaxBridge | null = g && g.WebApp ? (g.WebApp as MaxBridge) : null;

export const isInMax = Boolean(maxBridge);

export function getInitData(): string {
  return maxBridge?.initData ?? '';
}

export function getBridgeUser(): { id?: string; name?: string } {
  const u = maxBridge?.initDataUnsafe?.user;
  return { id: u?.id ? String(u.id) : undefined, name: u?.first_name };
}

export function openLink(url: string) {
  if (maxBridge?.openLink) maxBridge.openLink(url);
  else window.open(url, '_blank');
}

export function attachBackButton(handler: () => void): () => void {
  const bb = maxBridge?.BackButton;
  if (!bb) return () => {};
  bb.show();
  bb.onClick(handler);
  return () => {
    bb.offClick(handler);
    bb.hide();
  };
}

/** Включить подтверждение закрытия мини-приложения (iOS/Android). */
export function enableClosingConfirmation() {
  if (maxBridge?.enableClosingConfirmation) {
    try { maxBridge.enableClosingConfirmation(); } catch { /* ignore */ }
  }
}