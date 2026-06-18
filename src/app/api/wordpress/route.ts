import { NextResponse } from "next/server";
import { createWordPressPost } from "@/lib/wordpress";
import type { PublishPackage } from "@/lib/types";

type RequestBody = {
  action: "draft" | "publish" | "update";
  package: PublishPackage;
  postId?: number;
};

export async function POST(request: Request) {
  const body = (await request.json()) as RequestBody;

  try {
    if (body.action === "update" && !body.postId) {
      return NextResponse.json({ error: "기존 글 수정에는 postId가 필요합니다." }, { status: 400 });
    }

    const status = body.action === "publish" ? "publish" : "draft";
    const post = await createWordPressPost(body.package, status, body.postId);
    const label = body.action === "publish" ? "발행" : body.action === "update" ? "수정" : "초안 생성";
    return NextResponse.json({ message: `WordPress ${label}이 완료되었습니다. Post ID: ${post.id}${post.link ? `, ${post.link}` : ""}` });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown WordPress error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
