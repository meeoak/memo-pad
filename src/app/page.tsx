"use client";

import { useEffect, useMemo, useState } from "react";
import {
  analyzeArticle,
  autoAlt,
  buildPublishPackage,
  draftFromInput,
  generateTitleIdeas,
  warnStiffTitle,
} from "@/lib/content";
import type { AdsenseScore, ArticleInput, ArticlePurpose, ImageAsset, PublishPackage } from "@/lib/types";

const purposeOptions: Array<{ value: ArticlePurpose; label: string; hint: string }> = [
  { value: "product-review", label: "제품 리뷰", hint: "사용감, 장단점, 주의점 중심" },
  { value: "korea-travel", label: "한국 여행 정보", hint: "날짜, 이동, 비용, 현장감 중심" },
  { value: "place-review", label: "식당/장소 후기", hint: "방문 시간, 분위기, 메뉴/동선 중심" },
  { value: "k-beauty", label: "K-Beauty 추천", hint: "피부 타입 단정 없이 개인 경험 중심" },
  { value: "k-news", label: "K-News 설명글", hint: "사실 설명과 개인 해석 분리" },
];

const today = new Date().toISOString().slice(0, 10);

const initialInput: ArticleInput = {
  topic: "TIRTIR Red Cushion",
  purpose: "product-review",
  koreanMemo:
    "6월 초 올리브영 매장에서 직접 색상을 봤다.\n21W Natural Ivory는 손등에서는 밝아 보였지만 얼굴에 올리면 노란기가 심하지 않았다.\n마스크에 조금 묻어났고, 오후에는 코 주변이 무너졌다.\n사진은 매장 조명 아래 제품 컷과 손등 테스트 컷을 넣을 예정.",
  referenceLinks: "https://aracintaindonesia.com/k-beauty/",
  experienceDate: today,
  placeOrProduct: "TIRTIR Mask Fit Red Cushion 21W Natural Ivory",
  category: "K-Beauty",
  tags: "TIRTIR, cushion Korea, K-Beauty, review jujur",
  internalLinks: "https://aracintaindonesia.com/k-beauty/\nhttps://aracintaindonesia.com/korea-travel/",
  publishDate: today,
  images: [],
};

export default function Home() {
  const [input, setInput] = useState<ArticleInput>(initialInput);
  const [bodyHtml, setBodyHtml] = useState(() => draftFromInput(initialInput));
  const [isGenerating, setIsGenerating] = useState(false);
  const [publishStatus, setPublishStatus] = useState<string>("");

  useEffect(() => {
    const saved = window.localStorage.getItem("ara-content-desk-v1");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as { input?: ArticleInput; bodyHtml?: string };
      if (parsed.input) setInput(parsed.input);
      if (parsed.bodyHtml) setBodyHtml(parsed.bodyHtml);
    } catch {
      window.localStorage.removeItem("ara-content-desk-v1");
    }
  }, []);

  useEffect(() => {
    const storedInput = {
      ...input,
      images: input.images.map((image) => ({ ...image, previewUrl: undefined })),
    };
    window.localStorage.setItem("ara-content-desk-v1", JSON.stringify({ input: storedInput, bodyHtml }));
  }, [input, bodyHtml]);

  const score = useMemo(() => analyzeArticle(input, bodyHtml), [input, bodyHtml]);
  const publishPackage = useMemo(() => buildPublishPackage(input, bodyHtml), [input, bodyHtml]);
  const titles = useMemo(() => generateTitleIdeas(input.topic, input.purpose), [input.topic, input.purpose]);

  function update<K extends keyof ArticleInput>(key: K, value: ArticleInput[K]) {
    setInput((current) => ({ ...current, [key]: value }));
  }

  const isStaticHost = process.env.NEXT_PUBLIC_STATIC_HOST === "true";

  async function handleGenerate() {
    setIsGenerating(true);
    setPublishStatus("");
    try {
      setBodyHtml(draftFromInput(input));
      setPublishStatus(
        isStaticHost
          ? "배포본에서는 로컬 경험 중심 템플릿 초안을 생성합니다."
          : "로컬 경험 중심 템플릿 초안을 생성했습니다. OpenAI 서버 연동은 Vercel 배포 시 추가할 수 있습니다.",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleWordPressDraft() {
    try {
      await navigator.clipboard.writeText(JSON.stringify(publishPackage, null, 2));
      setPublishStatus("WordPress 발행 패키지 JSON을 클립보드에 복사했습니다.");
    } catch {
      setPublishStatus("클립보드 복사에 실패했습니다. 발행 패키지 영역에서 직접 복사하세요.");
    }
  }

  return (
    <main className="min-h-screen px-4 py-5 text-ink sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1680px]">
        <Header score={score} input={input} />

        <section className="mt-5 grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)_420px]">
          <WriterPanel input={input} update={update} onGenerate={handleGenerate} isGenerating={isGenerating} />

          <section className="space-y-4">
            <TitleLab titles={titles} />
            <article className="rounded-3xl border border-calm bg-white/90 p-5 shadow-soft">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-moss">Article Preview</p>
                  <h2 className="mt-1 text-xl font-semibold">사이트 패턴 미리보기</h2>
                </div>
                <span className="rounded-full bg-calm px-3 py-1 text-xs text-stone-700">H1 · 발행일 · 18px 본문 · 큰 이미지</span>
              </div>
              <div className="prose-preview rounded-2xl border border-stone-200 bg-paper p-5" dangerouslySetInnerHTML={{ __html: bodyHtml }} />
            </article>
            <EditorBox bodyHtml={bodyHtml} setBodyHtml={setBodyHtml} />
          </section>

          <aside className="space-y-4">
            <Checklist score={score} />
            <PublishPackageCard pack={publishPackage} onWordPressDraft={handleWordPressDraft} publishStatus={publishStatus} />
          </aside>
        </section>
      </div>
    </main>
  );
}

function Header({ score, input }: { score: AdsenseScore; input: ArticleInput }) {
  const published = 8;
  const draft = 3;
  const readiness = Math.round((score.originalExperience + (100 - score.thinContentRisk) + (100 - score.policyRisk)) / 3);
  const issues = [
    { label: "내부 링크 부족", value: input.internalLinks.trim() ? 0 : 1 },
    { label: "사진 없는 글", value: input.images.length ? 0 : 1 },
    { label: "메타 설명 없는 글", value: 0 },
    { label: "정책 위험 글", value: score.policyRisk >= 35 ? 1 : 0 },
  ];

  return (
    <header className="rounded-3xl border border-calm bg-white/85 p-5 shadow-soft">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-clay">Ara Cinta Indonesia</p>
          <h1 className="mt-2 max-w-4xl text-3xl font-bold tracking-[-0.04em] sm:text-5xl">
            AdSense 승인 가능성을 높이는 블로그 운영 작업대
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-600">
            고유 경험, 명확한 탐색, 이미지/메타데이터, 정책 리스크를 함께 점검합니다. 승인을 보장하지 않고, 발행 전 품질을 높이는 도구로 설계했습니다.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:min-w-[620px]">
          <Metric label="작성 중" value={draft} />
          <Metric label="발행 완료" value={published} />
          <Metric label="AdSense 준비도" value={`${readiness}%`} tone={readiness >= 75 ? "good" : "warn"} />
          <Metric label="카테고리 글 수" value="K-Beauty 4" />
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        {issues.map((issue) => (
          <div key={issue.label} className="rounded-2xl border border-stone-200 bg-paper px-3 py-2 text-sm">
            <span className="text-stone-500">{issue.label}</span>
            <strong className="float-right">{issue.value}</strong>
          </div>
        ))}
      </div>
    </header>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "good" | "warn" }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-paper p-4">
      <p className="text-xs text-stone-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tone === "good" ? "text-moss" : tone === "warn" ? "text-clay" : ""}`}>{value}</p>
    </div>
  );
}

function WriterPanel({
  input,
  update,
  onGenerate,
  isGenerating,
}: {
  input: ArticleInput;
  update: <K extends keyof ArticleInput>(key: K, value: ArticleInput[K]) => void;
  onGenerate: () => void;
  isGenerating: boolean;
}) {
  return (
    <section className="rounded-3xl border border-calm bg-white/90 p-5 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-moss">Writing Workflow</p>
      <h2 className="mt-1 text-xl font-semibold">글 작성 입력</h2>
      <div className="mt-4 space-y-4">
        <Field label="주제">
          <input className="input" value={input.topic} onChange={(e) => update("topic", e.target.value)} placeholder="예: TIRTIR Red Cushion" />
        </Field>
        <Field label="글 목적">
          <div className="grid gap-2">
            {purposeOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => update("purpose", option.value)}
                className={`rounded-2xl border p-3 text-left transition ${
                  input.purpose === option.value ? "border-moss bg-[#edf2ea]" : "border-stone-200 bg-paper hover:border-stone-300"
                }`}
              >
                <span className="block text-sm font-semibold">{option.label}</span>
                <span className="text-xs text-stone-500">{option.hint}</span>
              </button>
            ))}
          </div>
        </Field>
        <Field label="한국어 메모">
          <textarea className="input min-h-36" value={input.koreanMemo} onChange={(e) => update("koreanMemo", e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="경험 날짜">
            <input className="input" type="date" value={input.experienceDate} onChange={(e) => update("experienceDate", e.target.value)} />
          </Field>
          <Field label="발행일">
            <input className="input" type="date" value={input.publishDate} onChange={(e) => update("publishDate", e.target.value)} />
          </Field>
        </div>
        <Field label="장소 / 제품명">
          <input className="input" value={input.placeOrProduct} onChange={(e) => update("placeOrProduct", e.target.value)} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="카테고리">
            <input className="input" value={input.category} onChange={(e) => update("category", e.target.value)} />
          </Field>
          <Field label="태그">
            <input className="input" value={input.tags} onChange={(e) => update("tags", e.target.value)} />
          </Field>
        </div>
        <Field label="참고 링크">
          <textarea className="input min-h-20" value={input.referenceLinks} onChange={(e) => update("referenceLinks", e.target.value)} />
        </Field>
        <Field label="내부 링크">
          <textarea className="input min-h-20" value={input.internalLinks} onChange={(e) => update("internalLinks", e.target.value)} />
        </Field>
        <ImageManager input={input} update={update} />
        <button
          type="button"
          onClick={onGenerate}
          className="w-full rounded-2xl bg-ink px-4 py-3 text-sm font-semibold text-white transition hover:bg-stone-700"
        >
          {isGenerating ? "초안 생성 중..." : "인도네시아어 경험 중심 초안 생성"}
        </button>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-stone-700">{label}</span>
      {children}
    </label>
  );
}

function ImageManager({
  input,
  update,
}: {
  input: ArticleInput;
  update: <K extends keyof ArticleInput>(key: K, value: ArticleInput[K]) => void;
}) {
  async function addImages(files: FileList | null) {
    if (!files) return;
    const newImages = await Promise.all(
      Array.from(files).map(
        (file) =>
          new Promise<ImageAsset>((resolve) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
              resolve({
                id: crypto.randomUUID(),
                name: file.name,
                role: input.images.length === 0 ? "featured" : "body",
                width: img.width,
                height: img.height,
                alt: autoAlt(file.name, input),
                placement: "본문 중간",
                previewUrl: url,
              });
            };
            img.src = url;
          }),
      ),
    );
    update("images", [...input.images, ...newImages]);
  }

  function patchImage(id: string, patch: Partial<ImageAsset>) {
    update(
      "images",
      input.images.map((image) => (image.id === id ? { ...image, ...patch } : image)),
    );
  }

  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-stone-700">사진 관리</span>
      <input
        className="block w-full rounded-2xl border border-dashed border-stone-300 bg-paper p-3 text-sm"
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => addImages(e.target.files)}
      />
      <div className="mt-3 space-y-3">
        {input.images.map((image) => {
          const sizeWarning = image.width < 900 || image.height < 600 ? "이미지가 작습니다" : image.width > 3200 ? "너무 큰 이미지입니다" : "";
          return (
            <div key={image.id} className="rounded-2xl border border-stone-200 bg-paper p-3">
              <div className="flex gap-3">
                {image.previewUrl ? <img src={image.previewUrl} alt="" className="h-20 w-24 rounded-xl object-cover" /> : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{image.name}</p>
                  <p className="text-xs text-stone-500">
                    {image.width}x{image.height} {sizeWarning ? `· ${sizeWarning}` : "· 크기 적정"}
                  </p>
                  <select className="input mt-2 py-2 text-xs" value={image.role} onChange={(e) => patchImage(image.id, { role: e.target.value as ImageAsset["role"] })}>
                    <option value="featured">대표 이미지</option>
                    <option value="body">본문 이미지</option>
                    <option value="thumbnail">앨범 썸네일</option>
                  </select>
                </div>
              </div>
              <input className="input mt-2 text-xs" value={image.alt} onChange={(e) => patchImage(image.id, { alt: e.target.value })} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TitleLab({ titles }: { titles: string[] }) {
  return (
    <section className="rounded-3xl border border-calm bg-white/90 p-5 shadow-soft">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-moss">Title Lab</p>
          <h2 className="mt-1 text-xl font-semibold">자연스러운 검색형 제목 후보</h2>
        </div>
        <span className="text-sm text-stone-500">딱딱한 제목 자동 경고</span>
      </div>
      <div className="mt-4 grid gap-2 md:grid-cols-5">
        {titles.map((title) => {
          const warning = warnStiffTitle(title);
          return (
            <div key={title} className="rounded-2xl border border-stone-200 bg-paper p-3">
              <p className="text-sm font-semibold leading-5">{title}</p>
              <p className={`mt-2 text-xs ${warning.isStiff ? "text-clay" : "text-moss"}`}>{warning.isStiff ? warning.reason : "자연스러운 제목"}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function EditorBox({ bodyHtml, setBodyHtml }: { bodyHtml: string; setBodyHtml: (value: string) => void }) {
  return (
    <section className="rounded-3xl border border-calm bg-white/90 p-5 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-moss">HTML Editor</p>
      <textarea className="input mt-3 min-h-80 font-mono text-xs" value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} />
    </section>
  );
}

function Checklist({ score }: { score: AdsenseScore }) {
  const bars = [
    { label: "원본 경험 점수", value: score.originalExperience, inverse: false },
    { label: "얇은 콘텐츠 위험도", value: score.thinContentRisk, inverse: true },
    { label: "AI 티 나는 표현 위험도", value: score.aiToneRisk, inverse: true },
    { label: "정책 위험도", value: score.policyRisk, inverse: true },
    { label: "모바일 가독성", value: score.mobileReadability, inverse: false },
    { label: "중복 문장 비율", value: score.duplicateSentenceRatio, inverse: true },
    { label: "광고성 과다 여부", value: score.adLikeRisk, inverse: true },
  ];

  return (
    <section className="rounded-3xl border border-calm bg-white/90 p-5 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-moss">AdSense Review</p>
      <h2 className="mt-1 text-xl font-semibold">발행 전 검수</h2>
      <p className="mt-2 text-sm text-stone-600">글자 수: {score.wordCount} words</p>
      <div className="mt-4 space-y-3">
        {bars.map((bar) => (
          <ScoreBar key={bar.label} {...bar} />
        ))}
      </div>
      <div className="mt-5 space-y-2">
        {score.checklist.map((item) => (
          <div key={item.label} className="rounded-2xl border border-stone-200 bg-paper p-3">
            <div className="flex items-center justify-between gap-3">
              <strong className="text-sm">{item.label}</strong>
              <span className={`rounded-full px-2 py-1 text-xs ${item.status === "good" ? "bg-[#e7efe3] text-moss" : "bg-[#f5e4dc] text-clay"}`}>
                {item.status === "good" ? "OK" : "확인"}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-stone-500">{item.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ScoreBar({ label, value, inverse }: { label: string; value: number; inverse: boolean }) {
  const good = inverse ? value < 35 : value >= 70;
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-stone-600">{label}</span>
        <strong>{value}%</strong>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-200">
        <div className={`h-full rounded-full ${good ? "bg-moss" : "bg-clay"}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function PublishPackageCard({
  pack,
  onWordPressDraft,
  publishStatus,
}: {
  pack: PublishPackage;
  onWordPressDraft: () => void;
  publishStatus: string;
}) {
  return (
    <section className="rounded-3xl border border-calm bg-white/90 p-5 shadow-soft">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-moss">WordPress Package</p>
      <h2 className="mt-1 text-xl font-semibold">발행 패키지</h2>
      <dl className="mt-4 space-y-3 text-sm">
        <PackageRow label="WordPress 제목" value={pack.wordpressTitle} />
        <PackageRow label="SEO 제목" value={pack.seoTitle} />
        <PackageRow label="메타 설명" value={pack.metaDescription} />
        <PackageRow label="slug" value={pack.slug} />
        <PackageRow label="카테고리" value={pack.category} />
        <PackageRow label="태그" value={pack.tags.join(", ")} />
        <PackageRow label="아카이브 카드 제목" value={pack.archiveCardTitle} />
        <PackageRow label="아카이브 카드 설명" value={pack.archiveCardDescription} />
      </dl>
      <div className="mt-4 rounded-2xl bg-paper p-3">
        <p className="text-sm font-semibold">이미지 alt 목록</p>
        <ul className="mt-2 space-y-1 text-xs text-stone-600">
          {pack.imageAlts.length ? pack.imageAlts.map((image) => <li key={image.name}>{image.name}: {image.alt}</li>) : <li>이미지를 추가하세요.</li>}
        </ul>
      </div>
      <button type="button" onClick={onWordPressDraft} className="mt-4 w-full rounded-2xl bg-moss px-4 py-3 text-sm font-semibold text-white hover:bg-[#53634d]">
        발행 패키지 JSON 복사
      </button>
      {publishStatus ? <p className="mt-3 rounded-2xl bg-paper p-3 text-sm text-stone-600">{publishStatus}</p> : null}
      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-semibold">본문 HTML 보기</summary>
        <pre className="mt-2 max-h-80 overflow-auto rounded-2xl bg-stone-950 p-3 text-xs text-stone-100">{pack.bodyHtml}</pre>
      </details>
    </section>
  );
}

function PackageRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-paper p-3">
      <dt className="text-xs text-stone-500">{label}</dt>
      <dd className="mt-1 break-words font-medium">{value || "미입력"}</dd>
    </div>
  );
}
