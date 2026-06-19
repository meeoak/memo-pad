import { NextResponse } from "next/server";
import { draftFromInput } from "@/lib/content";
import type { ArticleInput } from "@/lib/types";

export async function POST(request: Request) {
  const input = (await request.json()) as ArticleInput;

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({
      bodyHtml: draftFromInput(input),
      error: "OPENAI_API_KEY가 없어 로컬 템플릿 초안을 생성했습니다.",
    });
  }

  const prompt = buildPrompt(input);
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      temperature: 0.65,
      messages: [
        {
          role: "system",
          content:
            "You are an Indonesian blog editor for Ara Cinta Indonesia WordPress blog. Write natural, experience-based Indonesian articles. Never guarantee AdSense approval. Avoid medical claims, unsupported halal/BPOM claims, and salesy language.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    return NextResponse.json({
      bodyHtml: draftFromInput(input),
      error: "OpenAI 응답 오류로 로컬 템플릿 초안을 생성했습니다.",
    });
  }

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const bodyHtml = data.choices?.[0]?.message?.content?.trim() || draftFromInput(input);
  return NextResponse.json({ bodyHtml });
}

function buildPrompt(input: ArticleInput) {
  const images = input.images
    .map((image) => `${image.role}: ${image.name}, alt="${image.alt}", ${image.width}x${image.height}`)
    .join("\n");
  return `
Write a complete Indonesian WordPress article as HTML only for Ara Cinta Indonesia.

Purpose: ${input.purpose}
Topic: ${input.topic}
Place/product: ${input.placeOrProduct}
Experience date: ${input.experienceDate}
Publish date: ${input.publishDate}
Category: ${input.category}
Tags: ${input.tags}
Internal links: ${input.internalLinks}
Reference links: ${input.referenceLinks}
Images:
${images || "No images yet"}

Korean memo:
${input.koreanMemo}

Use personal experience tone, concrete dates/places/product names, no medical or BPOM claims, no overly promotional language.
Return HTML only.
`;
}
