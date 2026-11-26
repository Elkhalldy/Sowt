export interface SynthesizedNarration {
  audioUrl: string;
  model: string;
  cached: boolean;
}

export class TtsRateLimitError extends Error {
  retryAfterSec: number;
  constructor(message: string, retryAfterSec = 60) {
    super(message);
    this.name = "TtsRateLimitError";
    this.retryAfterSec = retryAfterSec;
  }
}

const clientAudioCache = new Map<string, SynthesizedNarration>();
const inflightRequests = new Map<string, Promise<SynthesizedNarration>>();

export async function synthesizeArabicNarration(
  text: string,
  voiceName: string,
  style: string,
  signal?: AbortSignal
): Promise<SynthesizedNarration> {
  const key = `${voiceName}::${style}::${text}`;
  const cached = clientAudioCache.get(key);
  if (cached) return cached;

  const existing = inflightRequests.get(key);
  if (existing) return existing;

  const promise = (async () => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceName, style }),
      signal,
    });

    if (res.status === 429) {
      const errData = await res.json().catch(() => ({}));
      throw new TtsRateLimitError(
        errData?.error || "Rate limit reached",
        Number(errData?.retryAfterSec) || 60
      );
    }

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData?.error || `TTS request failed (${res.status})`);
    }

    const data = await res.json();
    if (!data?.audioBase64) {
      throw new Error("Empty audio payload returned from /api/tts");
    }

    const result: SynthesizedNarration = {
      audioUrl: `data:${data.mimeType || "audio/wav"};base64,${data.audioBase64}`,
      model: data.model || "gemini-3.8-flash-lite-tts",
      cached: Boolean(data.cached),
    };
    clientAudioCache.set(key, result);
    return result;
  })();

  inflightRequests.set(key, promise);
  try {
    return await promise;
  } finally {
    inflightRequests.delete(key);
  }
}

export function speakWithBrowserFallback(
  text: string,
  rate: number,
  onEnd: () => void,
  onError: () => void
): boolean {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return false;
  }
  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const arabicVoice =
      voices.find((v) => v.lang.toLowerCase().startsWith("ar-eg")) ||
      voices.find((v) => v.lang.toLowerCase().startsWith("ar"));
    if (arabicVoice) {
      utterance.voice = arabicVoice;
      utterance.lang = arabicVoice.lang;
    } else {
      utterance.lang = "ar-SA";
    }
    utterance.rate = Math.max(0.75, Math.min(1.4, rate));
    utterance.onend = onEnd;
    utterance.onerror = onError;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    return false;
  }
}

export function stopBrowserFallback(): void {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }
}
