import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Compass,
  Loader2,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  X,
} from "lucide-react";
import { InteractiveLab } from "./components/InteractiveLab";
import { PdfDocumentView } from "./components/PdfDocumentView";
import {
  NARRATOR_VOICES,
  PRESENTATION_CHAPTERS,
  PRESENTATION_SLIDES,
} from "./data/presentationData";
import {
  speakWithBrowserFallback,
  stopBrowserFallback,
  synthesizeArabicNarration,
  TtsRateLimitError,
} from "./services/narrationService";

type AppView = "overview" | "presentation" | "lab" | "archive";

function getPresentationAudioEl(): HTMLAudioElement | null {
  if (typeof window === "undefined" || typeof Audio === "undefined") return null;
  const w = window as unknown as { __arabicPresentationAudio?: HTMLAudioElement };
  if (!w.__arabicPresentationAudio) {
    const el = new Audio();
    el.preload = "auto";
    w.__arabicPresentationAudio = el;
  }
  return w.__arabicPresentationAudio;
}

function computeSegmentRatios(segments: { text: string }[]): Array<{ start: number; end: number }> {
  const weights = segments.map((s) => Math.max(12, s.text.trim().length));
  const total = weights.reduce((acc, w) => acc + w, 0) || 1;
  let cursor = 0;
  return weights.map((w) => {
    const start = cursor / total;
    cursor += w;
    const end = cursor / total;
    return { start, end };
  });
}

export default function App() {
  const [activeView, setActiveView] = useState<AppView>("overview");
  const [currentSlideIdx, setCurrentSlideIdx] = useState<number>(0);
  const [activeSegmentIdx, setActiveSegmentIdx] = useState<number>(0);

  // Audio playback states
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isLoadingAudio, setIsLoadingAudio] = useState<boolean>(false);
  const [audioNotice, setAudioNotice] = useState<string | null>(null);
  const [selectedVoice, setSelectedVoice] = useState<string>("Charon");
  const [playbackRate, setPlaybackRate] = useState<number>(1.0);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);
  const [isSlideZoomed, setIsSlideZoomed] = useState<boolean>(false);
  const [imageErrorMap, setImageErrorMap] = useState<Record<string, boolean>>({});

  // Refs to guarantee race-free playback & instant click-to-seek
  const playTokenRef = useRef<number>(0);
  const abortRef = useRef<AbortController | null>(null);
  const loadedSlideKeyRef = useRef<string>("");
  const autoAdvanceRef = useRef<boolean>(autoAdvance);
  const voiceRef = useRef<string>(selectedVoice);
  const speedRef = useRef<number>(playbackRate);
  const filmstripActiveRef = useRef<HTMLButtonElement | null>(null);

  autoAdvanceRef.current = autoAdvance;
  voiceRef.current = selectedVoice;
  speedRef.current = playbackRate;

  const currentSlide = PRESENTATION_SLIDES[currentSlideIdx] || PRESENTATION_SLIDES[0];
  const progressPercent = ((currentSlideIdx + 1) / PRESENTATION_SLIDES.length) * 100;

  // Clean stop of all audio sources
  const stopNarration = useCallback((clearNotice = false) => {
    playTokenRef.current += 1;
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    const audioEl = getPresentationAudioEl();
    if (audioEl) {
      audioEl.onended = null;
      audioEl.onerror = null;
      audioEl.ontimeupdate = null;
      audioEl.pause();
    }
    stopBrowserFallback();
    setIsPlaying(false);
    setIsLoadingAudio(false);
    if (clearNotice) setAudioNotice(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopNarration(true);
    };
  }, [stopNarration]);

  // Apply playbackRate live to active HTMLAudioElement
  useEffect(() => {
    const audioEl = getPresentationAudioEl();
    if (audioEl) {
      audioEl.playbackRate = playbackRate;
    }
  }, [playbackRate]);

  // Scroll active filmstrip thumbnail into view smoothly
  useEffect(() => {
    if (activeView === "presentation" && filmstripActiveRef.current) {
      filmstripActiveRef.current.scrollIntoView({
        behavior: "smooth",
        inline: "center",
        block: "nearest",
      });
    }
  }, [currentSlideIdx, activeView]);

  // Browser Web Speech sequential fallback (used seamlessly if TTS API hits quota)
  const speakFallbackSegments = useCallback(
    (slideIdx: number, startSegIdx: number, token: number, onSlideFinished: () => void) => {
      const slide = PRESENTATION_SLIDES[slideIdx];
      if (!slide || playTokenRef.current !== token) return;

      const runNext = (segIdx: number) => {
        if (playTokenRef.current !== token) return;
        const seg = slide.narrationSegments[segIdx];
        if (!seg) {
          onSlideFinished();
          return;
        }
        setActiveSegmentIdx(segIdx);
        const started = speakWithBrowserFallback(
          seg.text,
          speedRef.current,
          () => runNext(segIdx + 1),
          () => {
            if (playTokenRef.current === token) {
              setIsPlaying(false);
            }
          }
        );
        if (!started && playTokenRef.current === token) {
          setIsPlaying(false);
          setAudioNotice("المتصفح الحالي لا يدعم تشغيل الصوت العربي.");
        }
      };

      runNext(startSegIdx);
    },
    []
  );

  // Synthesize & play ONE full slide per API request, syncing all paragraphs automatically
  const playSegment = useCallback(
    async (slideIdx: number, startSegIdx: number) => {
      const slide = PRESENTATION_SLIDES[slideIdx];
      if (!slide) {
        stopNarration();
        return;
      }
      const safeSegIdx = Math.max(
        0,
        Math.min(slide.narrationSegments.length - 1, startSegIdx)
      );
      const ratios = computeSegmentRatios(slide.narrationSegments);
      const slideAudioKey = `${slide.id}::${voiceRef.current}`;

      const audioEl = getPresentationAudioEl();

      // Fast path: if this exact slide+voice is already loaded in audioEl, seek instantly with ZERO API calls!
      if (
        audioEl &&
        loadedSlideKeyRef.current === slideAudioKey &&
        audioEl.src &&
        Number.isFinite(audioEl.duration) &&
        audioEl.duration > 0
      ) {
        playTokenRef.current += 1;
        const myToken = playTokenRef.current;
        stopBrowserFallback();

        setCurrentSlideIdx(slideIdx);
        setActiveSegmentIdx(safeSegIdx);
        setIsPlaying(true);
        setIsLoadingAudio(false);

        const targetTime = Math.max(0, ratios[safeSegIdx].start * audioEl.duration);
        try {
          audioEl.currentTime = targetTime;
        } catch {
          // ignore seek failure
        }
        audioEl.playbackRate = speedRef.current;
        audioEl.ontimeupdate = () => {
          if (playTokenRef.current !== myToken || !audioEl.duration) return;
          const frac = audioEl.currentTime / audioEl.duration;
          const idx = ratios.findIndex((r) => frac >= r.start && frac < r.end);
          if (idx >= 0) setActiveSegmentIdx(idx);
        };
        audioEl.onended = () => {
          if (playTokenRef.current !== myToken) return;
          if (autoAdvanceRef.current && slideIdx + 1 < PRESENTATION_SLIDES.length) {
            void playSegment(slideIdx + 1, 0);
          } else {
            setIsPlaying(false);
          }
        };
        try {
          await audioEl.play();
          return;
        } catch {
          // Fall through to fresh play if autoplay rejected
        }
      }

      // Fresh slide playback (single API request for the entire slide!)
      playTokenRef.current += 1;
      const myToken = playTokenRef.current;

      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      if (audioEl) {
        audioEl.onended = null;
        audioEl.onerror = null;
        audioEl.ontimeupdate = null;
        audioEl.pause();
      }
      stopBrowserFallback();

      setCurrentSlideIdx(slideIdx);
      setActiveSegmentIdx(safeSegIdx);
      setIsPlaying(true);
      setIsLoadingAudio(true);
      setAudioNotice(null);

      const handleSlideFinished = () => {
        if (playTokenRef.current !== myToken) return;
        if (autoAdvanceRef.current && slideIdx + 1 < PRESENTATION_SLIDES.length) {
          void playSegment(slideIdx + 1, 0);
        } else {
          setIsPlaying(false);
          setIsLoadingAudio(false);
        }
      };

      const fullSlideNarration = slide.narrationSegments.map((s) => s.text).join("\n\n");
      const slideStyle =
        slide.narrationSegments[0]?.ttsStyle ||
        "Clear, warm, authoritative Arabic executive presenter";

      try {
        const synthesized = await synthesizeArabicNarration(
          fullSlideNarration,
          voiceRef.current,
          slideStyle,
          controller.signal
        );

        if (playTokenRef.current !== myToken) return;
        setIsLoadingAudio(false);

        if (!audioEl) {
          throw new Error("Audio playback unavailable in this environment");
        }

        audioEl.src = synthesized.audioUrl;
        loadedSlideKeyRef.current = slideAudioKey;
        audioEl.playbackRate = speedRef.current;

        const seekToRequestedSegment = () => {
          if (safeSegIdx > 0 && Number.isFinite(audioEl.duration) && audioEl.duration > 0) {
            try {
              audioEl.currentTime = ratios[safeSegIdx].start * audioEl.duration;
            } catch {
              // ignore seek timing edge cases
            }
          }
        };

        audioEl.onloadedmetadata = seekToRequestedSegment;
        audioEl.ontimeupdate = () => {
          if (playTokenRef.current !== myToken || !audioEl.duration) return;
          const frac = audioEl.currentTime / audioEl.duration;
          const idx = ratios.findIndex((r) => frac >= r.start && frac < r.end);
          if (idx >= 0) setActiveSegmentIdx(idx);
        };
        audioEl.onended = handleSlideFinished;
        audioEl.onerror = () => {
          if (playTokenRef.current !== myToken) return;
          loadedSlideKeyRef.current = "";
          setAudioNotice("يتم السرد الآن عبر الصوت العربي المدمج في المتصفح.");
          speakFallbackSegments(slideIdx, safeSegIdx, myToken, handleSlideFinished);
        };

        await audioEl.play();
        seekToRequestedSegment();
      } catch (err: unknown) {
        if (
          playTokenRef.current !== myToken ||
          (err instanceof DOMException && err.name === "AbortError")
        ) {
          return;
        }
        loadedSlideKeyRef.current = "";
        setIsLoadingAudio(false);

        if (err instanceof TtsRateLimitError) {
          setAudioNotice(
            "تم بلوغ حد الطلبات المجاني مؤقتاً؛ يتم الشرح الآن بصوت المتصفح العربي (يمكن رفع الحد باختيار مفتاح API مدفوع من Settings > Secrets)."
          );
        } else {
          setAudioNotice("يتم السرد الآن عبر الصوت العربي المدمج في المتصفح.");
        }
        speakFallbackSegments(slideIdx, safeSegIdx, myToken, handleSlideFinished);
      }
    },
    [stopNarration, speakFallbackSegments]
  );

  // Open a specific slide (from Overview chapters, Archive thumbnails, or CTA)
  const openPresentationAt = useCallback(
    (slideIndex: number, startAudio: boolean) => {
      const clamped = Math.max(
        0,
        Math.min(PRESENTATION_SLIDES.length - 1, slideIndex)
      );
      setActiveView("presentation");
      setIsSlideZoomed(false);
      if (startAudio) {
        void playSegment(clamped, 0);
      } else {
        stopNarration(true);
        setCurrentSlideIdx(clamped);
        setActiveSegmentIdx(0);
      }
    },
    [playSegment, stopNarration]
  );

  const handleTogglePlay = useCallback(() => {
    if (isPlaying || isLoadingAudio) {
      stopNarration(false);
    } else {
      void playSegment(currentSlideIdx, activeSegmentIdx);
    }
  }, [isPlaying, isLoadingAudio, stopNarration, playSegment, currentSlideIdx, activeSegmentIdx]);

  const handleNavigateSlide = useCallback(
    (targetIdx: number) => {
      const clamped = Math.max(
        0,
        Math.min(PRESENTATION_SLIDES.length - 1, targetIdx)
      );
      if (clamped === currentSlideIdx) return;
      const shouldContinueAudio = isPlaying || isLoadingAudio;
      if (shouldContinueAudio) {
        void playSegment(clamped, 0);
      } else {
        stopNarration(true);
        setCurrentSlideIdx(clamped);
        setActiveSegmentIdx(0);
      }
    },
    [currentSlideIdx, isPlaying, isLoadingAudio, playSegment, stopNarration]
  );

  const handleVoiceChange = (newVoice: string) => {
    setSelectedVoice(newVoice);
    voiceRef.current = newVoice;
    if (isPlaying || isLoadingAudio) {
      void playSegment(currentSlideIdx, activeSegmentIdx);
    }
  };

  // Keyboard shortcuts in presentation mode (RTL-aware: ArrowLeft = Next, ArrowRight = Prev, Space = Play/Pause)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (activeView !== "presentation") return;
      const tag = document.activeElement?.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;

      if (e.key === "Escape" && isSlideZoomed) {
        e.preventDefault();
        setIsSlideZoomed(false);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (currentSlideIdx < PRESENTATION_SLIDES.length - 1) {
          handleNavigateSlide(currentSlideIdx + 1);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (currentSlideIdx > 0) {
          handleNavigateSlide(currentSlideIdx - 1);
        }
      } else if (e.key === " ") {
        e.preventDefault();
        handleTogglePlay();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeView, isSlideZoomed, currentSlideIdx, handleNavigateSlide, handleTogglePlay]);

  return (
    <div className="min-h-screen bg-[#091221] text-[#F7F3EA] flex flex-col">
      {/* ====================================================================
          TOP NAVIGATION BAR (Strict 3-Zone Contract: Wordmark · 4 Links · 1 CTA)
          ==================================================================== */}
      <header className="sticky top-0 z-30 border-b border-[#D4AF37]/20 bg-[#091221]/95 backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-[1360px] items-center justify-between gap-8 px-5 py-3.5 md:px-8">
          {/* Zone 1: Single Text Wordmark */}
          <button
            type="button"
            onClick={() => {
              stopNarration(true);
              setActiveView("overview");
            }}
            className="font-display text-lg font-bold tracking-tight text-[#F3D67B] whitespace-nowrap shrink-0 cursor-pointer hover:text-[#F7F3EA] transition-colors"
          >
            أحمد الخالدي · الدليل الاستراتيجي
          </button>

          {/* Zone 2: 4 Clean Single-Line Nav Links */}
          <nav
            aria-label="التنقل الرئيسي"
            className="hidden md:flex items-center gap-7 text-sm font-medium"
          >
            <button
              type="button"
              onClick={() => {
                stopNarration(true);
                setActiveView("overview");
              }}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer ${
                activeView === "overview"
                  ? "text-[#F3D67B] underline decoration-[#D4AF37] underline-offset-8"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              نظرة عامة
            </button>
            <button
              type="button"
              onClick={() => setActiveView("presentation")}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer ${
                activeView === "presentation"
                  ? "text-[#F3D67B] underline decoration-[#D4AF37] underline-offset-8"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              العرض التفاعلي
            </button>
            <button
              type="button"
              onClick={() => {
                stopNarration(true);
                setActiveView("lab");
              }}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer ${
                activeView === "lab"
                  ? "text-[#F3D67B] underline decoration-[#D4AF37] underline-offset-8"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              المختبر التطبيقي
            </button>
            <button
              type="button"
              onClick={() => {
                stopNarration(true);
                setActiveView("archive");
              }}
              className={`whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer ${
                activeView === "archive"
                  ? "text-[#F3D67B] underline decoration-[#D4AF37] underline-offset-8"
                  : "text-slate-300 hover:text-white"
              }`}
            >
              الشرائح والملف
            </button>
          </nav>

          {/* Zone 3: Single Primary Action */}
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => openPresentationAt(currentSlideIdx, true)}
              className="inline-flex items-center gap-2 whitespace-nowrap shrink-0 rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-bold text-[#091221] transition-colors hover:bg-[#E8C864] cursor-pointer"
            >
              <Volume2 className="h-4 w-4 shrink-0" />
              <span>ابدأ العرض الصوتي</span>
            </button>
          </div>
        </div>

        {/* Compact Mobile Nav Strip */}
        <div className="flex md:hidden items-center justify-around border-t border-slate-800 px-3 py-2 text-xs font-medium">
          <button
            type="button"
            onClick={() => {
              stopNarration(true);
              setActiveView("overview");
            }}
            className={activeView === "overview" ? "text-[#F3D67B] font-bold" : "text-slate-300"}
          >
            نظرة عامة
          </button>
          <button
            type="button"
            onClick={() => setActiveView("presentation")}
            className={activeView === "presentation" ? "text-[#F3D67B] font-bold" : "text-slate-300"}
          >
            العرض التفاعلي
          </button>
          <button
            type="button"
            onClick={() => {
              stopNarration(true);
              setActiveView("lab");
            }}
            className={activeView === "lab" ? "text-[#F3D67B] font-bold" : "text-slate-300"}
          >
            المختبر التطبيقي
          </button>
          <button
            type="button"
            onClick={() => {
              stopNarration(true);
              setActiveView("archive");
            }}
            className={activeView === "archive" ? "text-[#F3D67B] font-bold" : "text-slate-300"}
          >
            الشرائح والملف
          </button>
        </div>
      </header>

      {/* ====================================================================
          MAIN VIEWPORT
          ==================================================================== */}
      <main className="flex-1">
        {/* ------------------------------------------------------------------
            VIEW 1: EXECUTIVE OVERVIEW & CHAPTER TABLE OF CONTENTS
            ------------------------------------------------------------------ */}
        {activeView === "overview" && (
          <div className="mx-auto w-full max-w-[1360px] px-5 py-10 md:px-8 md:py-12">
            {/* Hero 2-Column Split */}
            <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
              <div className="flex flex-col justify-between lg:col-span-6">
                <div>
                  <p className="text-sm font-medium text-[#D4AF37]">
                    عرض تفاعلي مصور ومسموع باللغة العربية · ١٦ شريحة · ٤ فصول
                  </p>
                  <h1 className="mt-4 font-display text-3xl font-extrabold leading-tight text-[#F7F3EA] sm:text-4xl lg:text-[42px]">
                    من الفهم والتشخيص إلى صناعة القرار وتحقيق النتائج
                  </h1>
                  <p className="mt-5 max-w-2xl text-base leading-8 text-slate-300">
                    مش كل اللي بيحط خطة بينجح، لكن مفيش حد نجح واستمر من غير ما يفهم
                    واقعه صح. يجمع هذا العرض التفاعلي المسموع كامل محتوى دليل{" "}
                    <span className="font-semibold text-[#F3D67B]">
                      SWOT و TOWS و SPACE Matrix
                    </span>{" "}
                    مع شرح صوتي متزامن ومختبر تطبيقي حي للأرقام والقرارات.
                  </p>
                </div>

                <div className="mt-8 flex flex-wrap items-center gap-5">
                  <button
                    type="button"
                    onClick={() => openPresentationAt(0, true)}
                    className="inline-flex items-center gap-2.5 whitespace-nowrap rounded-lg bg-[#D4AF37] px-6 py-3 text-base font-bold text-[#091221] transition-colors hover:bg-[#E8C864] cursor-pointer"
                  >
                    <Play className="h-4 w-4 fill-current shrink-0" />
                    <span>تشغيل العرض من الشريحة الأولى</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView("lab")}
                    className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-[#F3D67B] underline decoration-[#D4AF37]/50 underline-offset-8 transition-colors hover:text-white cursor-pointer"
                  >
                    <Compass className="h-4 w-4 shrink-0" />
                    <span>افتح المختبر التطبيقي التفاعلي</span>
                  </button>
                </div>
              </div>

              {/* Hero Visual Anchor: Authentic Slide 1 Plate */}
              <div className="lg:col-span-6">
                <button
                  type="button"
                  onClick={() => openPresentationAt(0, true)}
                  className="group block h-full w-full overflow-hidden rounded-xl border border-[#D4AF37]/35 bg-[#101E34] text-right transition-colors hover:border-[#D4AF37] cursor-pointer"
                >
                  <div className="relative aspect-video w-full overflow-hidden bg-[#08101E]">
                    <img
                      src={PRESENTATION_SLIDES[0].imageUrl}
                      alt={PRESENTATION_SLIDES[0].title}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#091221]/75 via-transparent to-transparent" />
                    <div className="absolute bottom-4 right-4 left-4 flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-[#F7F3EA]">
                        الشريحة ١ من ١٦ · انقر للبدء بالشرح الصوتي
                      </span>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#D4AF37] text-[#091221]">
                        <Play className="h-4 w-4 fill-current" />
                      </span>
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* Three Strategic Pillars Strip (Slide 2 Core Trio) */}
            <div className="mt-12 grid grid-cols-1 gap-6 border-y border-[#D4AF37]/20 py-8 md:grid-cols-3">
              <div>
                <p className="font-mono text-xs font-semibold text-[#D4AF37]" dir="ltr">
                  01 · SWOT
                </p>
                <h2 className="mt-2 font-display text-xl font-bold text-[#F7F3EA]">
                  المراية اللي بتكشف واقعك بنزاهة
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  فصل دقيق بين ما تملكه داخل إدارتك وتقدر تغيره بقرار مباشر، وبين
                  الظروف المفروضة عليك من السوق الخارجي.
                </p>
              </div>

              <div className="border-t border-slate-800 pt-6 md:border-t-0 md:border-r md:pr-6 md:pt-0">
                <p className="font-mono text-xs font-semibold text-[#D4AF37]" dir="ltr">
                  02 · TOWS
                </p>
                <h2 className="mt-2 font-display text-xl font-bold text-[#F7F3EA]">
                  عقلية المناورة وصناعة البدائل
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  تحويل نتائج التشخيص إلى أربع حركات ذكية واضحة: الهجوم والتوسع،
                  الإصلاح، درع الحماية، أو التحوط وتقليل الخسائر.
                </p>
              </div>

              <div className="border-t border-slate-800 pt-6 md:border-t-0 md:border-r md:pr-6 md:pt-0">
                <p className="font-mono text-xs font-semibold text-[#D4AF37]" dir="ltr">
                  03 · SPACE Matrix
                </p>
                <h2 className="mt-2 font-display text-xl font-bold text-[#F7F3EA]">
                  بوصلة الأرقام وحسم الاتجاه
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-300">
                  أوزان ونقاط رقمية واضحة ترسم متجهاً بيانياً يحسم قرار الإدارة:
                  متى تدوس بنزين وتندفع، ومتى تفرمل وتتحفظ.
                </p>
              </div>
            </div>

            {/* Structured 4-Chapter Interactive Table of Contents */}
            <div className="mt-12">
              <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-[#D4AF37]">
                    فهرس الفصول الأربعة
                  </p>
                  <h2 className="mt-1 font-display text-2xl font-bold text-[#F7F3EA]">
                    اختر أي فصل لفتح العرض المصور والشرح الصوتي مباشرة
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setActiveView("archive")}
                  className="text-sm font-medium text-slate-300 hover:text-[#F3D67B] cursor-pointer"
                >
                  استعراض جميع الشرائح الـ ١٦ والـ PDF &larr;
                </button>
              </div>

              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {PRESENTATION_CHAPTERS.map((chapter) => {
                  const firstSlide = PRESENTATION_SLIDES[chapter.startSlideIndex];
                  return (
                    <button
                      key={chapter.id}
                      type="button"
                      onClick={() =>
                        openPresentationAt(chapter.startSlideIndex, true)
                      }
                      className="group flex flex-col justify-between rounded-xl border border-slate-700/70 bg-[#101E34] p-6 text-right transition-colors hover:border-[#D4AF37]/70 hover:bg-[#14253F] cursor-pointer"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-4 text-xs text-slate-400">
                          <span className="font-display text-sm font-bold text-[#D4AF37]">
                            الفصل {chapter.numberArabic} · {chapter.slideRange}
                          </span>
                          <span className="text-slate-300 group-hover:text-[#F3D67B]">
                            فتح والاستماع &larr;
                          </span>
                        </div>
                        <h3 className="mt-2.5 font-display text-xl font-bold text-[#F7F3EA]">
                          {chapter.title}
                        </h3>
                        <p className="mt-1 text-sm font-medium text-[#E5C158]/90">
                          {chapter.subtitle}
                        </p>
                        <p className="mt-3 text-sm leading-relaxed text-slate-300">
                          {chapter.summary}
                        </p>
                      </div>

                      <div className="mt-5 flex items-center gap-3 border-t border-slate-700/60 pt-4">
                        <img
                          src={firstSlide.imageUrl}
                          alt={firstSlide.title}
                          referrerPolicy="no-referrer"
                          className="h-12 w-20 shrink-0 rounded border border-slate-700 object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-semibold text-slate-200">
                            يبدأ بـ: {firstSlide.title}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-400">
                            شرح عربي مصور ومتزامن بالصوت
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------
            VIEW 2: INTERACTIVE ILLUSTRATED & NARRATED PRESENTATION STAGE
            ------------------------------------------------------------------ */}
        {activeView === "presentation" && (
          <div className="mx-auto w-full max-w-[1360px] px-5 py-6 md:px-8">
            {/* Chapter Stepper Strip */}
            <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {PRESENTATION_CHAPTERS.map((ch) => {
                  const isCurrentChapter = currentSlide.chapterId === ch.id;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() =>
                        handleNavigateSlide(ch.startSlideIndex)
                      }
                      className={`rounded-md px-3 py-1.5 font-semibold transition-colors cursor-pointer ${
                        isCurrentChapter
                          ? "bg-[#D4AF37]/15 text-[#F3D67B] border border-[#D4AF37]/50"
                          : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200 border border-transparent"
                      }`}
                    >
                      {ch.numberArabic}. {ch.title}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-3 text-xs tabular-nums text-slate-300">
                <span>
                  الشريحة <strong className="text-[#F3D67B]">{currentSlide.slideNumber}</strong> من{" "}
                  {PRESENTATION_SLIDES.length}
                </span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => {
                    stopNarration(true);
                    setActiveView("lab");
                  }}
                  className="font-semibold text-[#E5C158] hover:underline cursor-pointer"
                >
                  تطبيق عملي في المختبر
                </button>
              </div>
            </div>

            {/* Two-Zone Presentation Spread: 60% Visual Slide + 40% Narrated Script */}
            <div className="grid grid-cols-1 items-start gap-7 lg:grid-cols-12">
              {/* VISUAL STAGE (7 columns) */}
              <div className="space-y-4 lg:col-span-7">
                {/* 16:9 Framed Slide Canvas */}
                <div className="overflow-hidden rounded-xl border border-[#D4AF37]/30 bg-[#0B1628]">
                  <div
                    key={currentSlide.id}
                    className="slide-stage-reveal relative aspect-video w-full bg-[#08101E]"
                  >
                    {!imageErrorMap[currentSlide.id] ? (
                      <img
                        src={currentSlide.imageUrl}
                        alt={currentSlide.title}
                        referrerPolicy="no-referrer"
                        onError={() =>
                          setImageErrorMap((prev) => ({
                            ...prev,
                            [currentSlide.id]: true,
                          }))
                        }
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center p-8 text-center">
                        <BookOpen className="h-10 w-10 text-[#D4AF37]" />
                        <p className="mt-3 font-display text-xl font-bold text-[#F7F3EA]">
                          {currentSlide.title}
                        </p>
                        <p className="mt-2 text-sm text-slate-300">
                          {currentSlide.subtitle}
                        </p>
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => setIsSlideZoomed(true)}
                      aria-label="تكبير الشريحة بملء الشاشة"
                      className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-md border border-slate-600/80 bg-[#091221]/85 px-2.5 py-1.5 text-xs font-medium text-slate-200 backdrop-blur-sm transition-colors hover:border-[#D4AF37] hover:text-[#F3D67B] cursor-pointer"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                      <span>تكبير الشريحة</span>
                    </button>
                  </div>

                  {/* Thin Gold Progress Filament */}
                  <div className="h-1 w-full bg-slate-800">
                    <div
                      className="h-full bg-[#D4AF37] transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  {/* Unified Audio & Slide Transport Bar */}
                  <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleTogglePlay}
                        className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-bold text-[#091221] transition-colors hover:bg-[#E8C864] cursor-pointer"
                      >
                        {isLoadingAudio ? (
                          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                        ) : isPlaying ? (
                          <Pause className="h-4 w-4 fill-current shrink-0" />
                        ) : (
                          <Play className="h-4 w-4 fill-current shrink-0" />
                        )}
                        <span>
                          {isLoadingAudio
                            ? "جاري تجهيز الصوت..."
                            : isPlaying
                            ? "إيقاف مؤقت"
                            : "تشغيل الشرح الصوتي"}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => void playSegment(currentSlideIdx, 0)}
                        title="إعادة شرح الشريحة من البداية"
                        aria-label="إعادة شرح الشريحة"
                        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-700 bg-[#101E34] text-slate-200 transition-colors hover:border-[#D4AF37] hover:text-[#F3D67B] cursor-pointer"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    </div>

                    {/* Slide Previous / Next Controls (RTL intuitive) */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleNavigateSlide(currentSlideIdx - 1)}
                        disabled={currentSlideIdx === 0}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#101E34] px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-[#D4AF37] disabled:opacity-35 cursor-pointer disabled:cursor-default"
                      >
                        <ChevronRight className="h-4 w-4" />
                        <span>السابقة</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleNavigateSlide(currentSlideIdx + 1)}
                        disabled={currentSlideIdx >= PRESENTATION_SLIDES.length - 1}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-[#101E34] px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors hover:border-[#D4AF37] disabled:opacity-35 cursor-pointer disabled:cursor-default"
                      >
                        <span>التالية</span>
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Audio Preferences Row */}
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-[#101E34] px-4 py-3 text-xs text-slate-300">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2">
                      <span className="text-slate-400">الصوت:</span>
                      <select
                        aria-label="اختيار صوت المعلق"
                        value={selectedVoice}
                        onChange={(e) => handleVoiceChange(e.target.value)}
                        className="rounded border border-slate-700 bg-[#091221] px-2.5 py-1 text-xs text-[#F7F3EA] outline-none focus:border-[#D4AF37]"
                      >
                        {NARRATOR_VOICES.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.label}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-2">
                      <span className="text-slate-400">السرعة:</span>
                      <select
                        aria-label="سرعة الشرح الصوتي"
                        value={playbackRate}
                        onChange={(e) => setPlaybackRate(Number(e.target.value))}
                        className="rounded border border-slate-700 bg-[#091221] px-2 py-1 font-mono text-xs text-[#F7F3EA] outline-none focus:border-[#D4AF37]"
                        dir="ltr"
                      >
                        <option value={0.85}>0.85x</option>
                        <option value={1}>1.0x</option>
                        <option value={1.15}>1.15x</option>
                        <option value={1.25}>1.25x</option>
                      </select>
                    </label>
                  </div>

                  <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={autoAdvance}
                      onChange={(e) => setAutoAdvance(e.target.checked)}
                      className="h-3.5 w-3.5 accent-[#D4AF37]"
                    />
                    <span>انتقال تلقائي للشريحة التالية</span>
                  </label>
                </div>

                {/* 16-Slide Horizontal Filmstrip */}
                <div className="thin-scrollbar flex items-center gap-2.5 overflow-x-auto pb-2 pt-1">
                  {PRESENTATION_SLIDES.map((s, idx) => {
                    const isActive = idx === currentSlideIdx;
                    return (
                      <button
                        key={s.id}
                        ref={isActive ? filmstripActiveRef : null}
                        type="button"
                        onClick={() => handleNavigateSlide(idx)}
                        className={`relative w-28 shrink-0 overflow-hidden rounded-lg border text-right transition-all cursor-pointer ${
                          isActive
                            ? "border-[#D4AF37] ring-1 ring-[#D4AF37]/60"
                            : "border-slate-700/70 opacity-65 hover:opacity-100"
                        }`}
                      >
                        <div className="aspect-video w-full bg-[#08101E]">
                          <img
                            src={s.imageUrl}
                            alt={`شريحة ${s.slideNumber}`}
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        </div>
                        <div className="flex items-center justify-between bg-[#0E1A2E] px-2 py-1 text-[11px]">
                          <span
                            className={`font-mono font-semibold tabular-nums ${
                              isActive ? "text-[#F3D67B]" : "text-slate-400"
                            }`}
                          >
                            {s.slideNumber}
                          </span>
                          <span className="truncate text-[10px] text-slate-300">
                            {s.title.slice(0, 14)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* SYNCHRONIZED NARRATION & TAKEAWAYS DECK (5 columns) */}
              <div className="flex flex-col rounded-xl border border-slate-700/70 bg-[#101E34] p-5 md:p-6 lg:col-span-5">
                <div className="border-b border-slate-700/60 pb-4">
                  <p className="text-xs font-semibold text-[#D4AF37]">
                    {currentSlide.chapterTitle}
                  </p>
                  <h1 className="mt-1.5 font-display text-xl font-bold leading-snug text-[#F7F3EA] md:text-2xl">
                    {currentSlide.title}
                  </h1>
                  <p className="mt-1 text-sm text-slate-300">
                    {currentSlide.subtitle}
                  </p>
                </div>

                {audioNotice && (
                  <div className="mt-3 rounded-lg border border-[#D4AF37]/30 bg-[#0B1628] px-3.5 py-2 text-xs text-[#F3D67B]">
                    {audioNotice}
                  </div>
                )}

                {/* Synchronized Arabic Narration Segments */}
                <div className="mt-4">
                  <div className="mb-3 flex items-center justify-between text-xs text-slate-400">
                    <span className="font-semibold text-slate-300">
                      النص الصوتي المتزامن (انقر على أي فقرة للاستماع إليها)
                    </span>
                    <span className="font-mono tabular-nums">
                      {activeSegmentIdx + 1} / {currentSlide.narrationSegments.length}
                    </span>
                  </div>

                  <div className="space-y-3">
                    {currentSlide.narrationSegments.map((seg, segIdx) => {
                      const stateClass =
                        segIdx === activeSegmentIdx
                          ? "narration-turn-active"
                          : segIdx < activeSegmentIdx
                          ? "narration-turn-past"
                          : "narration-turn-future";

                      return (
                        <button
                          key={seg.id}
                          type="button"
                          onClick={() => void playSegment(currentSlideIdx, segIdx)}
                          className={`narration-turn w-full rounded-lg border p-3.5 text-right cursor-pointer ${stateClass}`}
                        >
                          <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                            <span className="font-bold text-[#E5C158]">
                              {seg.speakerLabel}
                              <span className="font-normal text-slate-400">
                                {" "}
                                · {seg.roleLabel}
                              </span>
                            </span>
                            {segIdx === activeSegmentIdx && isPlaying && (
                              <span className="text-[11px] font-semibold text-[#F3D67B]">
                                {isLoadingAudio ? "جاري التجهيز..." : "يتحدث الآن"}
                              </span>
                            )}
                          </div>
                          <p className="text-[15px] leading-7 text-[#F7F3EA]">
                            {seg.text}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Key Practical Takeaways */}
                <div className="mt-6 border-t border-slate-700/60 pt-4">
                  <p className="text-xs font-semibold text-[#D4AF37]">
                    الخلاصة التطبيقية للشريحة
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-200">
                    {currentSlide.keyTakeaway}
                  </p>

                  <ul className="mt-3 space-y-2 text-xs leading-relaxed text-slate-300">
                    {currentSlide.keyPoints.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D4AF37]" />
                        <span>{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Quick Transition to Lab on Last Slide */}
                {currentSlideIdx === PRESENTATION_SLIDES.length - 1 && (
                  <div className="mt-5 border-t border-slate-700/60 pt-4">
                    <button
                      type="button"
                      onClick={() => {
                        stopNarration(true);
                        setActiveView("lab");
                      }}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#D4AF37] px-4 py-2.5 text-sm font-bold text-[#091221] transition-colors hover:bg-[#E8C864] cursor-pointer"
                    >
                      <Compass className="h-4 w-4" />
                      <span>انتقل الآن إلى المختبر التطبيقي التفاعلي</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ------------------------------------------------------------------
            VIEW 3: INTERACTIVE STRATEGIC LAB
            ------------------------------------------------------------------ */}
        {activeView === "lab" && <InteractiveLab />}

        {/* ------------------------------------------------------------------
            VIEW 4: ALL 16 SLIDES ARCHIVE & ORIGINAL PDF DOCUMENT
            ------------------------------------------------------------------ */}
        {activeView === "archive" && (
          <PdfDocumentView
            onSelectSlide={(idx, autoPlay) => openPresentationAt(idx, autoPlay)}
          />
        )}
      </main>

      {/* ====================================================================
          LIGHTBOX FULLSCREEN SLIDE ZOOM MODAL
          ==================================================================== */}
      {isSlideZoomed && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 md:p-8"
          onClick={() => setIsSlideZoomed(false)}
        >
          <div
            className="relative w-full max-w-6xl overflow-hidden rounded-xl border border-[#D4AF37]/40 bg-[#091221]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
              <p className="text-sm font-semibold text-[#F7F3EA]">
                الشريحة {currentSlide.slideNumber} من {PRESENTATION_SLIDES.length} ·{" "}
                {currentSlide.title}
              </p>
              <button
                type="button"
                onClick={() => setIsSlideZoomed(false)}
                className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-800 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
                <span>إغلاق</span>
              </button>
            </div>
            <div className="aspect-video w-full bg-[#050B14]">
              <img
                src={currentSlide.imageUrl}
                alt={currentSlide.title}
                referrerPolicy="no-referrer"
                className="h-full w-full object-contain"
              />
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          QUIET FOOTER
          ==================================================================== */}
      <footer className="mt-auto border-t border-slate-800/80 py-5">
        <div className="mx-auto flex w-full max-w-[1360px] flex-wrap items-center justify-between gap-4 px-5 text-xs text-slate-400 md:px-8">
          <span>
            أحمد الخالدي · Business Trick — دليل SWOT و TOWS و SPACE Matrix
          </span>
          <span>
            استخدم الأسهم للتنقل بين الشرائح ومفتاح المسافة لتشغيل أو إيقاف الشرح الصوتي
          </span>
        </div>
      </footer>
    </div>
  );
}
