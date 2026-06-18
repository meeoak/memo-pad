import type { PublishPackage } from "./types";

type WordPressPostResponse = {
  id: number;
  link?: string;
};

export async function createWordPressPost(pack: PublishPackage, status: "draft" | "publish" = "draft", postId?: number) {
  const baseUrl = getRequiredEnv("WORDPRESS_BASE_URL");
  const username = getRequiredEnv("WORDPRESS_USERNAME");
  const appPassword = getRequiredEnv("WORDPRESS_APP_PASSWORD");

  const auth = Buffer.from(`${username}:${appPassword}`).toString("base64");
  const categories = await resolveTaxonomy(baseUrl, auth, "categories", [pack.category]);
  const tags = await resolveTaxonomy(baseUrl, auth, "tags", pack.tags);

  const root = baseUrl.replace(/\/$/, "");
  const response = await fetch(`${root}/wp-json/wp/v2/posts${postId ? `/${postId}` : ""}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title: pack.wordpressTitle,
      slug: pack.slug,
      status,
      content: pack.bodyHtml,
      categories,
      tags,
      meta: buildMeta(pack),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`WordPress post sync failed: ${response.status} ${text}`);
  }

  const post = (await response.json()) as WordPressPostResponse;
  await updateArchiveCard(pack, post);
  return post;
}

async function resolveTaxonomy(baseUrl: string, auth: string, taxonomy: "categories" | "tags", names: string[]) {
  const ids: number[] = [];
  for (const rawName of names) {
    const name = rawName.trim();
    if (!name) continue;
    const root = baseUrl.replace(/\/$/, "");
    const search = await fetch(`${root}/wp-json/wp/v2/${taxonomy}?search=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const matches = search.ok ? ((await search.json()) as Array<{ id: number; name: string }>) : [];
    const exact = matches.find((match) => match.name.toLowerCase() === name.toLowerCase());
    if (exact) {
      ids.push(exact.id);
      continue;
    }

    const create = await fetch(`${root}/wp-json/wp/v2/${taxonomy}`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name }),
    });
    if (create.ok) {
      const created = (await create.json()) as { id: number };
      ids.push(created.id);
    }
  }
  return ids;
}

async function updateArchiveCard(pack: PublishPackage, post: WordPressPostResponse) {
  const endpoint = process.env.WORDPRESS_ARCHIVE_CARD_ENDPOINT;
  if (!endpoint) return;

  await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      imageAlt: pack.imageAlts[0]?.alt,
      title: pack.archiveCardTitle,
      description: pack.archiveCardDescription,
      date: new Date().toISOString(),
      link: post.link,
      removeComingSoonBadge: true,
    }),
  });
}

function buildMeta(pack: PublishPackage) {
  if (process.env.AIOSEO_ENABLED !== "true") return {};
  return {
    _aioseo_title: pack.seoTitle,
    _aioseo_description: pack.metaDescription,
  };
}

function getRequiredEnv(key: string) {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured`);
  return value;
}
