import type { AdsenseScore, ArticleInput, ArticlePurpose, ChecklistItem, PublishPackage } from "./types";

const purposeLabels: Record<ArticlePurpose, string> = {
  "product-review": "Produk Review",
  "korea-travel": "Info Jalan-jalan Korea",
  "place-review": "Review Tempat / Restoran",
  "k-beauty": "Rekomendasi K-Beauty",
  "k-news": "Penjelasan K-News",
};

const stiffTitleWords = ["review", "di indonesia", "terbaik", "wajib beli", "nomor 1"];
const policyRiskWords = ["menyembuhkan", "mengobati", "halal resmi", "bpom resmi", "pasti aman", "garansi sembuh"];
const adLikeWords = ["wajib beli", "termurah", "terbaik", "promo", "diskon besar", "klik link"];
const aiToneWords = ["secara keseluruhan", "dapat disimpulkan", "di era modern", "sangat penting untuk diketahui"];

export function purposeLabel(purpose: ArticlePurpose) {
  return purposeLabels[purpose];
}

export function generateTitleIdeas(topic: string, purpose: ArticlePurpose) {
  const cleanTopic = topic.trim() || "Pengalaman Korea";
  const base = cleanTopic.replace(/^review\s+/i, "");
  const ideas = [
    `Pengalaman Saya dengan ${base}: Jujur, Tidak Semulus Iklan`,
    `${base} yang Lagi Banyak Dibahas, Ini Kesan Pertama Saya`,
    `Saya Coba ${base} Selama Beberapa Hari, Begini Rasanya`,
    `${base}: Cocok untuk Siapa dan Apa yang Perlu Diperhatikan`,
    `Catatan Pribadi tentang ${base} dari Pengalaman Langsung`,
  ];

  if (purpose === "korea-travel") {
    return [
      `Catatan Jalan-jalan ke ${base}: Rute, Biaya, dan Hal Kecil yang Saya Perhatikan`,
      `${base} di Korea, Pengalaman Datang Langsung dan Tips Praktis`,
      `Sebelum ke ${base}, Ini yang Ingin Saya Tahu dari Awal`,
      `Pengalaman Saya Mengunjungi ${base} Tanpa Ekspektasi Berlebihan`,
      `${base}: Tempat, Waktu Datang, dan Kesan Setelah Pulang`,
    ];
  }

  return ideas;
}

export function warnStiffTitle(title: string) {
  const normalized = title.toLowerCase();
  const hits = stiffTitleWords.filter((word) => normalized.includes(word));
  return {
    isStiff: hits.length >= 2 || normalized.length > 78,
    reason: hits.length ? `Terdeteksi kata terlalu kaku/promosional: ${hits.join(", ")}` : "Judul cukup natural.",
  };
}

export function draftFromInput(input: ArticleInput) {
  const title = generateTitleIdeas(input.topic, input.purpose)[0];
  const place = input.placeOrProduct.trim() || input.topic.trim() || "topik ini";
  const date = input.experienceDate || "tanggal pengalaman belum diisi";
  const links = parseLines(input.internalLinks);
  const memoPoints = input.koreanMemo
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 7);

  const intro = `Saya menulis catatan ini berdasarkan pengalaman pribadi saat mencoba atau melihat langsung ${place} pada ${date}. Tujuannya bukan untuk membuat klaim berlebihan, tetapi membantu pembaca Indonesia membayangkan detail kecil yang sering tidak muncul di ringkasan singkat.`;
  const memoHtml = memoPoints.length
    ? memoPoints.map((point) => `<li>${escapeHtml(point)}</li>`).join("")
    : `<li>Tambahkan detail pengalaman: tempat, tanggal, harga, tekstur, aroma, antrean, cuaca, atau reaksi setelah dipakai.</li>`;

  return [
    `<h1>${escapeHtml(title)}</h1>`,
    `<p class="post-date">${formatIndonesianDate(input.publishDate)}</p>`,
    featuredImageHtml(input),
    `<h2>Kenapa Saya Tertarik Mencoba Ini</h2>`,
    `<p>${intro}</p>`,
    `<h2>Informasi Dasar</h2>`,
    `<p>${escapeHtml(place)} masuk kategori ${purposeLabel(input.purpose)}. Detail yang saya catat berasal dari memo pribadi, foto yang diunggah, dan referensi yang saya simpan sebelum menulis.</p>`,
    `<h2>Catatan dari Pengalaman Langsung</h2>`,
    `<ul>${memoHtml}</ul>`,
    bodyImagesHtml(input),
    `<h2>Hal yang Saya Suka</h2>`,
    `<p>Bagian yang paling terasa membantu adalah adanya detail nyata dari pengalaman sendiri: kapan melihatnya, bagaimana kondisi saat itu, dan bagian mana yang sesuai atau tidak sesuai dengan ekspektasi.</p>`,
    `<h2>Hal yang Kurang Cocok</h2>`,
    `<p>Beberapa bagian tetap perlu dicek ulang oleh pembaca, terutama harga, ketersediaan produk, aturan tempat, atau kecocokan dengan kondisi kulit dan kebutuhan masing-masing.</p>`,
    `<h2>Cocok untuk Siapa?</h2>`,
    `<p>Menurut saya, tulisan ini paling cocok untuk pembaca yang ingin gambaran natural sebelum memutuskan mencoba, bukan untuk mencari janji hasil instan.</p>`,
    `<h2>Hal yang Perlu Diperhatikan</h2>`,
    `<p>Saya tidak menyimpulkan klaim medis, status halal, atau izin BPOM tanpa sumber resmi. Jika pembaca membutuhkan kepastian, sebaiknya cek label produk, situs resmi, atau sumber otoritatif terbaru.</p>`,
    `<h2>Kesimpulan</h2>`,
    `<p>Secara pribadi, ${escapeHtml(place)} menarik untuk dibahas karena ada pengalaman nyata yang bisa diceritakan dengan jujur. Saya akan memperbarui catatan ini jika ada foto tambahan, perubahan harga, atau pengalaman lanjutan.</p>`,
    `<h2>Baca Juga</h2>`,
    internalLinksHtml(links),
  ].join("\n\n");
}

export function analyzeArticle(input: ArticleInput, bodyHtml: string): AdsenseScore {
  const plain = stripHtml(bodyHtml).toLowerCase();
  const wordCount = plain.split(/\s+/).filter(Boolean).length;
  const hasExperience = /(saya|aku|pengalaman|mencoba|mengunjungi|melihat|memakai|datang)/i.test(plain);
  const hasSpecifics = Boolean(input.experienceDate || input.placeOrProduct || input.images.length >= 2);
  const duplicateSentenceRatio = getDuplicateSentenceRatio(stripHtml(bodyHtml));
  const policyHits = policyRiskWords.filter((word) => plain.includes(word));
  const aiHits = aiToneWords.filter((word) => plain.includes(word));
  const adHits = adLikeWords.filter((word) => plain.includes(word));

  const originalExperience = clamp((hasExperience ? 45 : 10) + (hasSpecifics ? 35 : 5) + Math.min(input.images.length * 5, 20));
  const thinContentRisk = clamp(100 - Math.min(wordCount / 9, 75) - (hasSpecifics ? 15 : 0));
  const aiToneRisk = clamp(aiHits.length * 22 + (hasExperience ? 0 : 25));
  const policyRisk = clamp(policyHits.length * 30);
  const adLikeRisk = clamp(adHits.length * 18);
  const mobileReadability = clamp(92 - Math.max(0, averageSentenceLength(stripHtml(bodyHtml)) - 24) * 2);

  const checklist: ChecklistItem[] = [
    item("Internal link", parseLines(input.internalLinks).length > 0, "Minimal satu link ke artikel terkait di Ara Cinta Indonesia."),
    item("Image alt", input.images.length > 0 && input.images.every((img) => img.alt.trim()), "Semua gambar perlu alt yang spesifik."),
    item("Judul / tanggal / kategori / tag", Boolean(input.topic && input.publishDate && input.category && input.tags), "Metadata utama wajib lengkap."),
    item("Featured image", input.images.some((img) => img.role === "featured"), "Pilih satu gambar utama untuk H1 area dan kartu arsip."),
    item("Pengalaman asli", originalExperience >= 70, "Tambahkan tanggal, lokasi, nama produk, foto sendiri, dan sensasi penggunaan."),
    item("Risiko kebijakan", policyRisk < 35, policyHits.length ? `Hindari klaim: ${policyHits.join(", ")}` : "Tidak ada klaim sensitif yang menonjol."),
    item("Tidak terlalu iklan", adLikeRisk < 35, adHits.length ? `Kurangi bahasa promosi: ${adHits.join(", ")}` : "Nada tulisan cukup editorial."),
  ];

  return {
    originalExperience,
    thinContentRisk,
    aiToneRisk,
    policyRisk,
    mobileReadability,
    duplicateSentenceRatio,
    adLikeRisk,
    wordCount,
    checklist,
  };
}

export function buildPublishPackage(input: ArticleInput, bodyHtml: string): PublishPackage {
  const title = generateTitleIdeas(input.topic, input.purpose)[0];
  const description = buildMetaDescription(input);
  const checklist = analyzeArticle(input, bodyHtml).checklist;

  return {
    wordpressTitle: title,
    seoTitle: `${title} | Ara Cinta Indonesia`,
    metaDescription: description,
    slug: slugify(title),
    category: input.category || purposeLabel(input.purpose),
    tags: input.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
    bodyHtml,
    imageAlts: input.images.map((image) => ({ name: image.name, alt: image.alt })),
    archiveCardTitle: title.replace(/^Pengalaman Saya dengan /, ""),
    archiveCardDescription: description,
    prePublishChecklist: checklist,
  };
}

export function autoAlt(name: string, input: Pick<ArticleInput, "topic" | "placeOrProduct">) {
  const subject = input.placeOrProduct.trim() || input.topic.trim() || "pengalaman Korea";
  const readableName = name.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
  return `Foto pribadi ${subject} - ${readableName}`;
}

function featuredImageHtml(input: ArticleInput) {
  const image = input.images.find((img) => img.role === "featured") || input.images[0];
  if (!image) return `<figure><div class="image-placeholder">Tambahkan featured image pribadi</div></figure>`;
  return `<figure><img src="${escapeHtml(image.previewUrl || `/uploads/${image.name}`)}" alt="${escapeHtml(image.alt)}" /><figcaption>Foto pribadi untuk artikel ini.</figcaption></figure>`;
}

function bodyImagesHtml(input: ArticleInput) {
  const images = input.images.filter((img) => img.role === "body").slice(0, 4);
  if (!images.length) return "";
  return images
    .map((image) => `<figure><img src="${escapeHtml(image.previewUrl || `/uploads/${image.name}`)}" alt="${escapeHtml(image.alt)}" /><figcaption>${escapeHtml(image.placement || "Dokumentasi tambahan")}</figcaption></figure>`)
    .join("\n");
}

function internalLinksHtml(links: string[]) {
  if (!links.length) return "<p>Tambahkan 1-3 tautan internal sebelum publikasi.</p>";
  return `<ul>${links.map((link) => `<li><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></li>`).join("")}</ul>`;
}

function buildMetaDescription(input: ArticleInput) {
  const subject = input.placeOrProduct.trim() || input.topic.trim() || "pengalaman Korea";
  return `Catatan pengalaman pribadi tentang ${subject}, berisi detail foto, kesan langsung, hal yang disukai, kekurangan, dan perhatian sebelum mencoba.`;
}

function item(label: string, pass: boolean, detail: string): ChecklistItem {
  return { label, status: pass ? "good" : "warning", detail };
}

function parseLines(value: string) {
  return value.split(/[\n,]+/).map((line) => line.trim()).filter(Boolean);
}

function getDuplicateSentenceRatio(text: string) {
  const sentences = text.split(/[.!?。]+/).map((sentence) => sentence.trim().toLowerCase()).filter((sentence) => sentence.length > 20);
  if (!sentences.length) return 0;
  const duplicates = sentences.length - new Set(sentences).size;
  return Math.round((duplicates / sentences.length) * 100);
}

function averageSentenceLength(text: string) {
  const sentences = text.split(/[.!?。]+/).map((sentence) => sentence.trim()).filter(Boolean);
  if (!sentences.length) return 0;
  return sentences.reduce((sum, sentence) => sum + sentence.split(/\s+/).length, 0) / sentences.length;
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

function formatIndonesianDate(date: string) {
  if (!date) return "Tanggal publikasi belum diisi";
  return new Intl.DateTimeFormat("id-ID", { day: "numeric", month: "long", year: "numeric" }).format(new Date(date));
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function clamp(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}
