import React, { useState } from "react";
import { Download, FileText, Play } from "lucide-react";
import {
  PDF_ASSET_URL,
  PRESENTATION_SLIDES,
} from "../data/presentationData";

interface PdfDocumentViewProps {
  onSelectSlide: (slideIndex: number, autoPlay: boolean) => void;
}

export const PdfDocumentView: React.FC<PdfDocumentViewProps> = ({
  onSelectSlide,
}) => {
  const [showPdfEmbed, setShowPdfEmbed] = useState<boolean>(false);

  return (
    <section className="mx-auto w-full max-w-[1360px] px-5 py-8 md:px-8">
      <div className="mb-8 flex flex-col gap-4 border-b border-[#D4AF37]/20 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-[#D4AF37]">
            أرشيف الشرائح الـ ١٦ والوثيقة الأصلية
          </p>
          <h2 className="font-display text-2xl font-bold text-[#F7F3EA] md:text-3xl">
            جميع شرائح الدليل المصور وملف الـ PDF المرفق
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowPdfEmbed((v) => !v)}
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg border border-[#D4AF37]/40 bg-[#101E34] px-4 py-2 text-sm font-semibold text-[#F3D67B] transition-colors hover:bg-[#162742]"
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span>{showPdfEmbed ? "إخفاء عارض الـ PDF" : "استعراض ملف PDF المدمج"}</span>
          </button>

          <a
            href={PDF_ASSET_URL}
            download="SWOT_vs_TOWS_vs_SPACE_Matrix.pdf"
            className="inline-flex items-center gap-2 whitespace-nowrap rounded-lg bg-[#D4AF37] px-4 py-2 text-sm font-bold text-[#091221] transition-colors hover:bg-[#E5C158]"
          >
            <Download className="h-4 w-4 shrink-0" />
            <span>تحميل ملف PDF الأصلي</span>
          </a>
        </div>
      </div>

      {showPdfEmbed && (
        <div className="mb-10 overflow-hidden rounded-xl border border-[#D4AF37]/30 bg-[#0B1628]">
          <div className="flex items-center justify-between border-b border-slate-700/60 px-5 py-3 text-xs text-slate-300">
            <span>الوثيقة الأصلية · SWOT vs TOWS vs SPACE Matrix (١٦ صفحة)</span>
            <a
              href={PDF_ASSET_URL}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-[#E5C158] hover:underline"
            >
              فتح في نافذة مستقلة
            </a>
          </div>
          <iframe
            src={PDF_ASSET_URL}
            title="ملف PDF الأصلي — SWOT vs TOWS vs SPACE Matrix"
            className="h-[72vh] w-full bg-[#091221]"
          />
        </div>
      )}

      {/* 16-Slide Contact Sheet Gallery */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {PRESENTATION_SLIDES.map((slide, idx) => (
          <button
            key={slide.id}
            type="button"
            onClick={() => onSelectSlide(idx, true)}
            className="group flex flex-col overflow-hidden rounded-xl border border-slate-700/70 bg-[#101E34] text-right transition-all hover:border-[#D4AF37]/70"
          >
            <div className="relative aspect-video w-full overflow-hidden border-b border-slate-700/60 bg-[#08101E]">
              <img
                src={slide.imageUrl}
                alt={slide.title}
                referrerPolicy="no-referrer"
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              />
              <div className="absolute inset-0 flex items-center justify-center bg-[#091221]/0 transition-colors group-hover:bg-[#091221]/45">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#D4AF37] text-[#091221] opacity-0 transition-opacity group-hover:opacity-100">
                  <Play className="h-4 w-4 fill-current" />
                </span>
              </div>
            </div>

            <div className="flex flex-1 flex-col justify-between p-4">
              <div>
                <p className="text-xs font-medium text-[#D4AF37]">
                  شريحة {slide.slideNumber} · {slide.chapterTitle.split("·")[0].trim()}
                </p>
                <h3 className="mt-1.5 font-display text-sm font-bold leading-snug text-[#F7F3EA] group-hover:text-[#F3D67B]">
                  {slide.title}
                </h3>
              </div>
              <p className="mt-2.5 text-xs text-slate-400">
                اضغط للاستماع والشرح التفاعلي
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
};
