import React, { useMemo, useState } from "react";
import {
  CheckCircle2,
  Compass,
  Grid2x2,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import {
  GOLDEN_RULE_SCENARIOS,
  TOWS_QUADRANTS,
  type TowsQuadrant,
} from "../data/presentationData";

type LabTab = "space" | "tows" | "golden-rule";

interface SpacePreset {
  id: string;
  label: string;
  fs: number;
  is: number;
  ca: number;
  es: number;
}

const SPACE_PRESETS: SpacePreset[] = [
  { id: "growth", label: "توسع قوي وسيولة عالية", fs: 5.2, is: 4.8, ca: -2.0, es: -2.2 },
  { id: "competitive", label: "سوق واعد ومنافسة شرسة", fs: 2.6, is: 5.2, ca: -2.2, es: -4.4 },
  { id: "conservative", label: "سيولة متينة وسوق بطيء", fs: 4.8, is: 2.2, ca: -4.4, es: -2.4 },
  { id: "defensive", label: "ضغط سيولة وتضخم مرتفع", fs: 1.8, is: 2.4, ca: -4.8, es: -5.0 },
];

export const InteractiveLab: React.FC = () => {
  const [activeTab, setActiveTab] = useState<LabTab>("space");

  // SPACE Matrix state
  const [fs, setFs] = useState<number>(5.0);
  const [isScore, setIsScore] = useState<number>(4.6);
  const [ca, setCa] = useState<number>(-2.2);
  const [es, setEs] = useState<number>(-2.4);

  // TOWS active quadrant state
  const [selectedTows, setSelectedTows] = useState<TowsQuadrant["id"]>("SO");

  // Golden Rule quiz state
  const [answers, setAnswers] = useState<Record<string, "internal" | "external">>({});

  const spaceCalc = useMemo(() => {
    const x = Number((isScore + ca).toFixed(1));
    const y = Number((fs + es).toFixed(1));

    let quadrant: {
      code: string;
      arabicName: string;
      englishName: string;
      directive: string;
      actions: string[];
    };

    if (x >= 0 && y >= 0) {
      quadrant = {
        code: "AGGRESSIVE",
        arabicName: "وضع الهجوم والتوسع",
        englishName: "Aggressive Posture",
        directive: "دُس بنزين بحساب: وضعك المالي وموقعك في الصناعة يسمحان بالتوسع وزيادة الحصة السوقية.",
        actions: [
          "التوسع في فروع أو شرائح عملاء جديدة بخطة ٩٠ يوماً ومؤشرات مبيعات واضحة.",
          "الاستثمار في تطوير المنتجات والقدرة التخزينية لاقتناص الطلب المتنامي.",
          "تعزيز الميزة التنافسية قبل استجابة المنافسين.",
        ],
      };
    } else if (x >= 0 && y < 0) {
      quadrant = {
        code: "COMPETITIVE",
        arabicName: "وضع المنافسة والتميّز",
        englishName: "Competitive Posture",
        directive: "الصناعة جذابة لكن الضغط المالي أو البيئي يتطلب تفوقاً تشغيلياً ومرونة عالية.",
        actions: [
          "حماية الحصة السوقية عبر رفع كفاءة خدمة العملاء وجودة التسليم.",
          "تقوية السيولة وتقليل الهدر قبل ضخ استثمارات جديدة.",
          "البحث عن تحالفات أو قنوات بيع تقلل تكلفة الاستحواذ.",
        ],
      };
    } else if (x < 0 && y >= 0) {
      quadrant = {
        code: "CONSERVATIVE",
        arabicName: "وضع التحفظ والانضباط",
        englishName: "Conservative Posture",
        directive: "حافظ على مكاسبك وتجنّب المغامرة غير المحسوبة؛ استثمر قوتك المالية في تحسين الكفاءة.",
        actions: [
          "التركيز على العملاء والمنتجات الأكثر ربحية وحماية الهوامش.",
          "معالجة نقاط الضعف الداخلية مثل دورة المستندات وأنظمة ERP.",
          "تطوير عروض متخصصة ترفع قدرتك التنافسية تدريجياً.",
        ],
      };
    } else {
      quadrant = {
        code: "DEFENSIVE",
        arabicName: "وضع الدفاع والتحوط",
        englishName: "Defensive Posture",
        directive: "فرمل فوراً واحمِ السيولة: الأولوية لتقليل الخسائر وسد الفجوات الداخلية وتفادي الأزمة.",
        actions: [
          "تخفيض التكاليف التشغيلية غير الضرورية وتصريف المخزون الراكد.",
          "إعادة هيكلة الإجراءات المعطّلة وتجميد التوسعات عالية المخاطرة.",
          "حماية التدفق النقدي والتركيز على العقود الأكثر أماناً واستقراراً.",
        ],
      };
    }

    return { x, y, quadrant };
  }, [fs, isScore, ca, es]);

  const activeTowsObj =
    TOWS_QUADRANTS.find((q) => q.id === selectedTows) || TOWS_QUADRANTS[0];

  const answeredCount = Object.keys(answers).length;
  const correctCount = GOLDEN_RULE_SCENARIOS.filter(
    (s) => answers[s.id] && answers[s.id] === s.correctEnvironment
  ).length;

  // Map SPACE coordinates [-5..+5] onto SVG 320x320 grid centered at (160, 160)
  const clampCoord = (v: number) => Math.max(-5, Math.min(5, v));
  const svgX = 160 + (clampCoord(spaceCalc.x) / 5) * 116;
  const svgY = 160 - (clampCoord(spaceCalc.y) / 5) * 116;

  return (
    <section className="mx-auto w-full max-w-[1360px] px-5 py-8 md:px-8">
      <div className="mb-8 flex flex-col gap-5 border-b border-[#D4AF37]/20 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="mb-2 text-sm font-medium text-[#D4AF37]">
            المختبر التطبيقي التفاعلي · من الشرح إلى التطبيق العملي
          </p>
          <h2 className="font-display text-2xl font-bold text-[#F7F3EA] md:text-3xl">
            جرّب أدوات الدليل بنفسك بالأرقام والسيناريوهات
          </h2>
        </div>

        <div
          role="tablist"
          aria-label="أدوات المختبر التطبيقي"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-700/60 bg-[#0D1A2E] p-1"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "space"}
            onClick={() => setActiveTab("space")}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "space"
                ? "bg-[#D4AF37] text-[#091221]"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            <Compass className="h-4 w-4 shrink-0" />
            <span>بوصلة SPACE Matrix</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "tows"}
            onClick={() => setActiveTab("tows")}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "tows"
                ? "bg-[#D4AF37] text-[#091221]"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            <Grid2x2 className="h-4 w-4 shrink-0" />
            <span>مصفوفة TOWS</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "golden-rule"}
            onClick={() => setActiveTab("golden-rule")}
            className={`inline-flex items-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === "golden-rule"
                ? "bg-[#D4AF37] text-[#091221]"
                : "text-slate-300 hover:bg-slate-800/70 hover:text-white"
            }`}
          >
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>اختبار القاعدة الذهبية</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SPACE MATRIX INTERACTIVE COMPASS */}
      {activeTab === "space" && (
        <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          {/* Interactive Visual Stage (60%) */}
          <div className="flex flex-col justify-between rounded-xl border border-[#D4AF37]/25 bg-[#101E34] p-6 lg:col-span-7">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700/60 pb-4">
              <div>
                <h3 className="font-display text-xl font-bold text-[#F7F3EA]">
                  بوصلة الأرقام الحية — SPACE Matrix
                </h3>
                <p className="mt-1 text-sm text-slate-300">
                  حرّك مؤشرات المحاور الأربعة لترى اتجاه القرار الاستراتيجي لحظياً
                </p>
              </div>
              <div className="flex items-center gap-4 font-mono text-sm tabular-nums text-[#E8C864]" dir="ltr">
                <span>X = {spaceCalc.x > 0 ? `+${spaceCalc.x}` : spaceCalc.x}</span>
                <span className="text-slate-500">·</span>
                <span>Y = {spaceCalc.y > 0 ? `+${spaceCalc.y}` : spaceCalc.y}</span>
              </div>
            </div>

            <div className="my-2 flex flex-col items-center justify-center gap-6 md:flex-row">
              {/* Live SVG 4-Quadrant Vector Compass */}
              <div className="w-full max-w-[330px] shrink-0">
                <svg
                  viewBox="0 0 320 320"
                  className="h-auto w-full rounded-lg border border-slate-700/70 bg-[#08101E]"
                  role="img"
                  aria-label={`مخطط بوصلة SPACE Matrix عند الإحداثيات X=${spaceCalc.x}, Y=${spaceCalc.y}`}
                >
                  <defs>
                    <marker
                      id="gold-arrow"
                      viewBox="0 0 10 10"
                      refX="7"
                      refY="5"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 1 L 10 5 L 0 9 z" fill="#E5C158" />
                    </marker>
                  </defs>

                  {/* Active Quadrant Highlight */}
                  {spaceCalc.x >= 0 && spaceCalc.y >= 0 && (
                    <rect x="160" y="34" width="126" height="126" fill="rgba(212,175,55,0.12)" />
                  )}
                  {spaceCalc.x < 0 && spaceCalc.y >= 0 && (
                    <rect x="34" y="34" width="126" height="126" fill="rgba(56,189,248,0.11)" />
                  )}
                  {spaceCalc.x >= 0 && spaceCalc.y < 0 && (
                    <rect x="160" y="160" width="126" height="126" fill="rgba(245,158,11,0.11)" />
                  )}
                  {spaceCalc.x < 0 && spaceCalc.y < 0 && (
                    <rect x="34" y="160" width="126" height="126" fill="rgba(248,113,113,0.11)" />
                  )}

                  {/* Concentric Rings */}
                  <circle cx="160" cy="160" r="38" fill="none" stroke="rgba(148,163,184,0.14)" strokeDasharray="3 4" />
                  <circle cx="160" cy="160" r="78" fill="none" stroke="rgba(148,163,184,0.14)" strokeDasharray="3 4" />
                  <circle cx="160" cy="160" r="116" fill="none" stroke="rgba(212,175,55,0.2)" />

                  {/* Axes */}
                  <line x1="34" y1="160" x2="286" y2="160" stroke="rgba(212,175,55,0.45)" strokeWidth="1.2" />
                  <line x1="160" y1="34" x2="160" y2="286" stroke="rgba(212,175,55,0.45)" strokeWidth="1.2" />

                  {/* Quadrant Labels */}
                  <text x="223" y="64" textAnchor="middle" fill="#F3D67B" fontSize="12" fontWeight="700">
                    هجوم (Aggressive)
                  </text>
                  <text x="97" y="64" textAnchor="middle" fill="#93C5FD" fontSize="12" fontWeight="700">
                    تحفظ (Conservative)
                  </text>
                  <text x="223" y="266" textAnchor="middle" fill="#FCD34D" fontSize="12" fontWeight="700">
                    منافسة (Competitive)
                  </text>
                  <text x="97" y="266" textAnchor="middle" fill="#FCA5A5" fontSize="12" fontWeight="700">
                    دفاع (Defensive)
                  </text>

                  {/* Axis Titles */}
                  <text x="160" y="22" textAnchor="middle" fill="#CBD5E1" fontSize="10.5">
                    القوة المالية (FS +)
                  </text>
                  <text x="160" y="308" textAnchor="middle" fill="#CBD5E1" fontSize="10.5">
                    استقرار البيئة (ES −)
                  </text>
                  <text x="295" y="154" textAnchor="end" fill="#CBD5E1" fontSize="10">
                    IS +
                  </text>
                  <text x="25" y="154" textAnchor="start" fill="#CBD5E1" fontSize="10">
                    CA −
                  </text>

                  {/* Origin point */}
                  <circle cx="160" cy="160" r="4" fill="#94A3B8" />

                  {/* Strategic Vector */}
                  <line
                    x1="160"
                    y1="160"
                    x2={svgX}
                    y2={svgY}
                    stroke="#E5C158"
                    strokeWidth="3"
                    strokeLinecap="round"
                    markerEnd="url(#gold-arrow)"
                  />
                  <circle cx={svgX} cy={svgY} r="5.5" fill="#091221" stroke="#E5C158" strokeWidth="2.5" />
                </svg>
              </div>

              {/* Decision Interpretation */}
              <div className="flex-1 space-y-4">
                <div className="border-b border-slate-700/60 pb-3">
                  <p className="text-xs font-medium text-[#D4AF37]">
                    التوجيه الرقمي للبوصلة · {spaceCalc.quadrant.englishName}
                  </p>
                  <h4 className="mt-1 font-display text-2xl font-bold text-[#F7F3EA]">
                    {spaceCalc.quadrant.arabicName}
                  </h4>
                  <p className="mt-2 text-sm leading-relaxed text-slate-200">
                    {spaceCalc.quadrant.directive}
                  </p>
                </div>

                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-400">
                    توصيات تنفيذية مقترحة لخطة الـ ٩٠ يوماً:
                  </p>
                  <ul className="space-y-2 text-sm leading-relaxed text-slate-200">
                    {spaceCalc.quadrant.actions.map((act, i) => (
                      <li key={i} className="flex items-start gap-2.5">
                        <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#D4AF37]" />
                        <span>{act}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Scenario Presets */}
            <div className="mt-6 border-t border-slate-700/60 pt-4">
              <p className="mb-2.5 text-xs text-slate-400">جرّب سيناريوهات جاهزة من واقع السوق:</p>
              <div className="flex flex-wrap gap-2">
                {SPACE_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      setFs(preset.fs);
                      setIsScore(preset.is);
                      setCa(preset.ca);
                      setEs(preset.es);
                    }}
                    className="rounded-md border border-slate-700 bg-[#0B1628] px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-[#D4AF37]/60 hover:text-[#F3D67B]"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Sliders Control Deck (40%) */}
          <div className="flex flex-col justify-between rounded-xl border border-slate-700/70 bg-[#101E34] p-6 lg:col-span-5">
            <div>
              <h3 className="font-display text-lg font-bold text-[#F7F3EA]">
                أوزان المحاور الأربعة
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                اضبط تقييم شركتك أو إدارتك في كل محور لحساب المتجه الاستراتيجي.
              </p>

              <div className="mt-6 space-y-6">
                {/* FS */}
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <label htmlFor="slider-fs" className="font-semibold text-[#F4EFE6]">
                      القوة المالية (FS · داخلي)
                    </label>
                    <span className="font-mono text-sm font-semibold tabular-nums text-[#E5C158]" dir="ltr">
                      +{fs.toFixed(1)} / +6.0
                    </span>
                  </div>
                  <input
                    id="slider-fs"
                    type="range"
                    min={1}
                    max={6}
                    step={0.2}
                    value={fs}
                    onChange={(e) => setFs(Number(e.target.value))}
                    className="executive-slider w-full"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    السيولة المتاحة، التدفق النقدي، العائد على الاستثمار، ومستوى المديونية.
                  </p>
                </div>

                {/* IS */}
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <label htmlFor="slider-is" className="font-semibold text-[#F4EFE6]">
                      قوة الصناعة وجاذبية السوق (IS · خارجي)
                    </label>
                    <span className="font-mono text-sm font-semibold tabular-nums text-[#E5C158]" dir="ltr">
                      +{isScore.toFixed(1)} / +6.0
                    </span>
                  </div>
                  <input
                    id="slider-is"
                    type="range"
                    min={1}
                    max={6}
                    step={0.2}
                    value={isScore}
                    onChange={(e) => setIsScore(Number(e.target.value))}
                    className="executive-slider w-full"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    نمو الطلب في القطاع، إمكانيات التوسع، واستقرار الهوامش في الصناعة.
                  </p>
                </div>

                {/* CA */}
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <label htmlFor="slider-ca" className="font-semibold text-[#F4EFE6]">
                      الميزة التنافسية (CA · داخلي)
                    </label>
                    <span className="font-mono text-sm font-semibold tabular-nums text-sky-300" dir="ltr">
                      {ca.toFixed(1)} (الأفضل -1)
                    </span>
                  </div>
                  <input
                    id="slider-ca"
                    type="range"
                    min={-6}
                    max={-1}
                    step={0.2}
                    value={ca}
                    onChange={(e) => setCa(Number(e.target.value))}
                    className="executive-slider w-full"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    الحصة السوقية، جودة المنتج، ولاء العملاء، وكفاءة فريق العمل والـ ERP.
                  </p>
                </div>

                {/* ES */}
                <div>
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <label htmlFor="slider-es" className="font-semibold text-[#F4EFE6]">
                      استقرار البيئة الخارجية (ES · خارجي)
                    </label>
                    <span className="font-mono text-sm font-semibold tabular-nums text-sky-300" dir="ltr">
                      {es.toFixed(1)} (الأكثر استقراراً -1)
                    </span>
                  </div>
                  <input
                    id="slider-es"
                    type="range"
                    min={-6}
                    max={-1}
                    step={0.2}
                    value={es}
                    onChange={(e) => setEs(Number(e.target.value))}
                    className="executive-slider w-full"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    التضخم، تقلبات أسعار المواد الخام، الشحن، والتشريعات الحكومية.
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 border-t border-slate-700/60 pt-4 text-xs leading-relaxed text-slate-400">
              معادلة البوصلة: المحور الأفقي{" "}
              <span className="font-mono text-slate-200" dir="ltr">X = IS + CA</span>{" "}
              والمحور الرأسي{" "}
              <span className="font-mono text-slate-200" dir="ltr">Y = FS + ES</span>.
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: TOWS STRATEGIC MANEUVER MATRIX */}
      {activeTab === "tows" && (
        <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-12">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-7">
            {TOWS_QUADRANTS.map((q) => {
              const isSelected = q.id === selectedTows;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setSelectedTows(q.id)}
                  className={`flex flex-col justify-between rounded-xl border p-5 text-right transition-all ${
                    isSelected
                      ? "border-[#D4AF37] bg-[#162742]"
                      : "border-slate-700/70 bg-[#101E34] hover:border-slate-500"
                  }`}
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <span className="font-mono text-sm font-bold text-[#D4AF37]" dir="ltr">
                        {q.code}
                      </span>
                      <span className="text-xs text-slate-400">{q.formula}</span>
                    </div>
                    <h3 className="font-display text-lg font-bold text-[#F7F3EA]">
                      {q.title}
                    </h3>
                    <p className="mt-2 text-sm font-medium text-[#E5C158]">{q.question}</p>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-slate-300">
                    {q.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex flex-col justify-between rounded-xl border border-[#D4AF37]/30 bg-[#101E34] p-6 lg:col-span-5">
            <div>
              <div className="mb-3 flex items-center gap-3 text-sm text-[#D4AF37]">
                <span className="font-mono font-bold" dir="ltr">
                  {activeTowsObj.code}
                </span>
                <span aria-hidden="true">·</span>
                <span>{activeTowsObj.formula}</span>
              </div>
              <h3 className="font-display text-2xl font-bold text-[#F7F3EA]">
                {activeTowsObj.title}
              </h3>
              <p className="mt-2 text-base font-medium text-[#E5C158]">
                {activeTowsObj.question}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-200">
                {activeTowsObj.description}
              </p>

              <div className="mt-6 space-y-4 border-t border-slate-700/60 pt-5">
                <p className="text-xs font-semibold text-slate-400">
                  أمثلة تطبيقية مباشرة من واقع الإدارة والميدان:
                </p>
                {activeTowsObj.examples.map((ex, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-700/60 bg-[#0B1628] p-4"
                  >
                    <p className="text-xs font-bold text-[#D4AF37]">{ex.context}</p>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-200">
                      {ex.action}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <p className="mt-6 border-t border-slate-700/60 pt-4 text-xs text-slate-400">
              المرجع: الشريحة ٦ من الدليل — «سوات بتشخص بس، تاوز بتعشق المربعات وتطلع قرارات».
            </p>
          </div>
        </div>
      )}

      {/* TAB 3: GOLDEN RULE DIAGNOSTIC DRILL */}
      {activeTab === "golden-rule" && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#D4AF37]/25 bg-[#101E34] px-6 py-4">
            <div>
              <h3 className="font-display text-lg font-bold text-[#F7F3EA]">
                اختبار القاعدة الذهبية: «لو الإدارة تقدر بكرة الصبح تاخد قرار يغير الوضع»
              </h3>
              <p className="mt-1 text-sm text-slate-300">
                صنّف كل موقف من أرض الواقع هل ينتمي للبيئة الداخلية (قوة/ضعف) أم البيئة الخارجية (فرصة/تهديد).
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-sm font-semibold tabular-nums text-[#E5C158]">
                النتيجة: {correctCount} / {answeredCount} صحيحة (من {GOLDEN_RULE_SCENARIOS.length})
              </div>
              {answeredCount > 0 && (
                <button
                  type="button"
                  onClick={() => setAnswers({})}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 transition-colors hover:border-[#D4AF37] hover:text-[#F3D67B]"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>إعادة الاختبار</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {GOLDEN_RULE_SCENARIOS.map((sc, idx) => {
              const userChoice = answers[sc.id];
              const isCorrect = userChoice === sc.correctEnvironment;

              return (
                <div
                  key={sc.id}
                  className="flex flex-col justify-between rounded-xl border border-slate-700/70 bg-[#101E34] p-5"
                >
                  <div>
                    <div className="mb-2 flex items-center justify-between text-xs text-slate-400">
                      <span>موقف {idx + 1} · {sc.department}</span>
                      {userChoice && (
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            isCorrect ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          {isCorrect ? (
                            <>
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              <span>تصنيف دقيق · {sc.swotCategory}</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="h-3.5 w-3.5" />
                              <span>الصحيح: {sc.swotCategory}</span>
                            </>
                          )}
                        </span>
                      )}
                    </div>

                    <p className="text-base font-semibold leading-relaxed text-[#F7F3EA]">
                      {sc.statement}
                    </p>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [sc.id]: "internal" }))
                        }
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                          userChoice === "internal"
                            ? sc.correctEnvironment === "internal"
                              ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
                              : "border-rose-400 bg-rose-500/15 text-rose-200"
                            : "border-slate-700 bg-[#0B1628] text-slate-200 hover:border-[#D4AF37]/60"
                        }`}
                      >
                        بيئة داخلية (قوة / ضعف)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setAnswers((prev) => ({ ...prev, [sc.id]: "external" }))
                        }
                        className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                          userChoice === "external"
                            ? sc.correctEnvironment === "external"
                              ? "border-emerald-400 bg-emerald-500/15 text-emerald-200"
                              : "border-rose-400 bg-rose-500/15 text-rose-200"
                            : "border-slate-700 bg-[#0B1628] text-slate-200 hover:border-[#D4AF37]/60"
                        }`}
                      >
                        بيئة خارجية (فرصة / تهديد)
                      </button>
                    </div>

                    {userChoice && (
                      <p className="rounded-lg border border-slate-700/60 bg-[#0B1628] px-3.5 py-2.5 text-xs leading-relaxed text-slate-200">
                        {sc.explanation}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
};
