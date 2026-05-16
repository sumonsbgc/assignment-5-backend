import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../prisma/generated/index.js";

async function check(url: string): Promise<{ status: number; contentType: string }> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    clearTimeout(t);
    return { status: res.status, contentType: res.headers.get("content-type") ?? "" };
  } catch (e) {
    return { status: 0, contentType: (e as Error).message };
  }
}

async function main() {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
  });

  const movies = await prisma.movie.findMany({
    where: { videoUrl: { not: null } },
    select: { id: true, slug: true, videoUrl: true },
  });
  const episodes = await prisma.episode.findMany({
    where: { videoUrl: { not: null } },
    select: { id: true, title: true, videoUrl: true },
  });

  console.log(`\nChecking ${movies.length} movies + ${episodes.length} episodes…\n`);

  let broken = 0;
  for (const m of movies) {
    const r = await check(m.videoUrl!);
    const ok = r.status === 200 && r.contentType.startsWith("video");
    if (!ok) {
      broken++;
      console.log(`  ✗ MOVIE id=${m.id} slug=${m.slug}  status=${r.status} type=${r.contentType}`);
      console.log(`     url=${m.videoUrl}`);
    }
  }
  for (const e of episodes) {
    const r = await check(e.videoUrl!);
    const ok = r.status === 200 && r.contentType.startsWith("video");
    if (!ok) {
      broken++;
      console.log(`  ✗ EPISODE id=${e.id} title="${e.title}"  status=${r.status} type=${r.contentType}`);
      console.log(`     url=${e.videoUrl}`);
    }
  }
  console.log(`\n${broken === 0 ? "✓ all videos play" : `✗ ${broken} broken videoUrl row(s)`}`);
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
