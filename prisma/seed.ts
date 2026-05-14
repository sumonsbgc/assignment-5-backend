/**
 * Seed script — populates the catalog with real public-domain / CC-BY content.
 *
 * Video sources:
 *  - Archive.org (public-domain films, 1920s-1960s) — direct MP4 URLs
 *  - Blender Foundation open movies (CC-BY, modern animation) — used for the
 *    "Blender Open Movies" series so the demo has at least one HD source
 *
 * All sources are legal, free, and pull from third-party servers — zero
 * storage cost on our side. The `videoUrl` field accepts absolute URLs and
 * the stream controller serves them directly without R2 signing.
 *
 * Run with: pnpm db:seed
 */
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/index.js";
import { hashPassword } from "../src/utils/hash.js";

// Prisma 7 requires a driver adapter.
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter, log: ["warn", "error"] });

const ARCHIVE_THUMB = (id: string) => `https://archive.org/services/img/${id}`;
const ARCHIVE_VIDEO = (id: string, file: string) =>
  encodeURI(`https://archive.org/download/${id}/${file}`);

async function main() {
  console.log("🌱 Seeding database...");

  // ----- Genres ----------------------------------------------------------
  const genreData = [
    { name: "Action", slug: "action" },
    { name: "Drama", slug: "drama" },
    { name: "Comedy", slug: "comedy" },
    { name: "Thriller", slug: "thriller" },
    { name: "Sci-Fi", slug: "sci-fi" },
    { name: "Horror", slug: "horror" },
    { name: "Romance", slug: "romance" },
    { name: "Documentary", slug: "documentary" },
    { name: "Animation", slug: "animation" },
    { name: "Noir", slug: "noir" },
  ];
  const genres = await Promise.all(
    genreData.map((g) => prisma.genre.upsert({ where: { slug: g.slug }, update: {}, create: g })),
  );
  const G = Object.fromEntries(genres.map((g) => [g.slug, g.id])) as Record<string, number>;
  console.log(`✓ Created ${genres.length} genres`);

  // ----- Users -----------------------------------------------------------
  const adminPwd = await hashPassword("Admin@123456");
  const userPwd = await hashPassword("User@123456");

  const admin = await prisma.user.upsert({
    where: { email: "admin@movieportal.com" },
    update: {},
    create: {
      name: "Admin User",
      email: "admin@movieportal.com",
      password: adminPwd,
      role: "ADMIN",
      emailVerified: true,
    },
  });
  const moderator = await prisma.user.upsert({
    where: { email: "moderator@movieportal.com" },
    update: {},
    create: {
      name: "Moderator",
      email: "moderator@movieportal.com",
      password: userPwd,
      role: "MODERATOR",
      emailVerified: true,
    },
  });
  const subscriber = await prisma.user.upsert({
    where: { email: "subscriber@movieportal.com" },
    update: {},
    create: {
      name: "Sarah Subscriber",
      email: "subscriber@movieportal.com",
      password: userPwd,
      role: "USER",
      emailVerified: true,
    },
  });
  const freeUser = await prisma.user.upsert({
    where: { email: "free@movieportal.com" },
    update: {},
    create: {
      name: "Frank Free",
      email: "free@movieportal.com",
      password: userPwd,
      role: "USER",
      emailVerified: true,
    },
  });
  console.log(`✓ Created 4 users (admin / moderator / subscriber / free)`);

  // ----- Movies ----------------------------------------------------------
  // All `videoUrl` values are direct MP4 links to public-domain films on
  // archive.org. Posters use archive.org's image service.
  const movies = [
    {
      title: "Night of the Living Dead",
      slug: "night-of-the-living-dead",
      description:
        "A ragtag group of Pennsylvanians barricade themselves in an old farmhouse to remain safe from a horde of flesh-eating ghouls that are ravaging the East Coast of the United States.",
      year: 1968,
      director: "George A. Romero",
      cast: ["Duane Jones", "Judith O'Dea", "Karl Hardman"],
      duration: 96,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("night-of-the-living-dead_202309", "Night Of The Living Dead.mp4"),
      posterUrl: ARCHIVE_THUMB("night-of-the-living-dead_202309"),
      genres: ["horror", "thriller"],
    },
    {
      title: "Nosferatu",
      slug: "nosferatu-1922",
      description:
        "Vampire Count Orlok expresses interest in a new residence and real estate agent Hutter's wife. An unauthorized adaptation of Bram Stoker's Dracula.",
      year: 1922,
      director: "F. W. Murnau",
      cast: ["Max Schreck", "Gustav von Wangenheim", "Greta Schröder"],
      duration: 94,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("nosferatu_202501", "Nosferatu.mp4"),
      posterUrl: ARCHIVE_THUMB("nosferatu_202501"),
      genres: ["horror"],
    },
    {
      title: "Plan 9 from Outer Space",
      slug: "plan-9-from-outer-space",
      description:
        "Aliens resurrect dead humans as zombies and vampires to stop humanity from creating the Solaranite (a sort of sun-driven bomb).",
      year: 1959,
      director: "Ed Wood",
      cast: ["Gregory Walcott", "Mona McKinnon", "Duke Moore"],
      duration: 79,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("plan-9-from-outer-space", "plan-9-from-outer-space.mp4"),
      posterUrl: ARCHIVE_THUMB("plan-9-from-outer-space"),
      genres: ["sci-fi", "horror"],
    },
    {
      title: "His Girl Friday",
      slug: "his-girl-friday",
      description:
        "A newspaper editor uses every trick in the book to keep his ace reporter ex-wife from remarrying.",
      year: 1940,
      director: "Howard Hawks",
      cast: ["Cary Grant", "Rosalind Russell", "Ralph Bellamy"],
      duration: 92,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("his-girl-friday-1940_202507", "His Girl Friday (1940).mp4"),
      posterUrl: ARCHIVE_THUMB("his-girl-friday-1940_202507"),
      genres: ["comedy", "romance"],
    },
    {
      title: "Carnival of Souls",
      slug: "carnival-of-souls",
      description:
        "After a traumatic accident, a woman becomes drawn to a mysterious abandoned carnival.",
      year: 1962,
      director: "Herk Harvey",
      cast: ["Candace Hilligoss", "Frances Feist", "Sidney Berger"],
      duration: 78,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("CarnivalOfSouls1962", "Carnival_of_Souls_512kb.mp4"),
      posterUrl: ARCHIVE_THUMB("CarnivalOfSouls1962"),
      genres: ["horror", "drama"],
    },
    {
      title: "House on Haunted Hill",
      slug: "house-on-haunted-hill",
      description:
        "A millionaire offers $10,000 to five people who agree to be locked in a large, spooky, rented house overnight with him and his wife.",
      year: 1959,
      director: "William Castle",
      cast: ["Vincent Price", "Carol Ohmart", "Richard Long"],
      duration: 75,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("house-on-haunted-hill-1959_202512", "House on Haunted Hill  1959.mp4"),
      posterUrl: ARCHIVE_THUMB("house-on-haunted-hill-1959_202512"),
      genres: ["horror", "thriller"],
    },
    {
      title: "The Cabinet of Dr. Caligari",
      slug: "cabinet-of-dr-caligari",
      description:
        "Hypnotist Dr. Caligari uses a somnambulist, Cesare, to commit murders. A landmark of German Expressionist cinema.",
      year: 1920,
      director: "Robert Wiene",
      cast: ["Werner Krauss", "Conrad Veidt", "Friedrich Fehér"],
      duration: 67,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("silent-the-cabinet-of-dr-caligari", "The Cabinet of Dr. Caligari.mp4"),
      posterUrl: ARCHIVE_THUMB("silent-the-cabinet-of-dr-caligari"),
      genres: ["horror", "drama"],
    },
    {
      title: "The Phantom of the Opera",
      slug: "phantom-of-the-opera-1925",
      description:
        "A mad, disfigured composer seeks love with a lovely young opera singer.",
      year: 1925,
      director: "Rupert Julian",
      cast: ["Lon Chaney", "Mary Philbin", "Norman Kerry"],
      duration: 93,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("ThePhantomOfTheOpera_201612", "The Phantom of the Opera.mp4"),
      posterUrl: ARCHIVE_THUMB("ThePhantomOfTheOpera_201612"),
      genres: ["horror", "drama", "romance"],
    },
    {
      title: "Detour",
      slug: "detour-1945",
      description:
        "A piano player hitchhiking from New York to Hollywood is dragged into a web of fate after picking up the wrong ride.",
      year: 1945,
      director: "Edgar G. Ulmer",
      cast: ["Tom Neal", "Ann Savage", "Claudia Drake"],
      duration: 68,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("detour1945HD", "Detour.1945.1080p.BluRay.x264-[YTS.AM].mp4"),
      posterUrl: ARCHIVE_THUMB("detour1945HD"),
      genres: ["noir", "drama", "thriller"],
    },
    {
      title: "D.O.A.",
      slug: "doa-1949",
      description:
        "Frank Bigelow, told he's been poisoned and has only a few days to live, tries to find out who killed him and why.",
      year: 1949,
      director: "Rudolph Maté",
      cast: ["Edmond O'Brien", "Pamela Britton", "Luther Adler"],
      duration: 83,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("doa-1949", "DOA 1950.mp4"),
      posterUrl: ARCHIVE_THUMB("doa-1949"),
      genres: ["noir", "thriller"],
    },
    {
      title: "White Zombie",
      slug: "white-zombie",
      description:
        "A young man turns to a witch doctor to lure the woman he loves away from her fiancé, but instead turns her into a zombie slave.",
      year: 1932,
      director: "Victor Halperin",
      cast: ["Bela Lugosi", "Madge Bellamy", "Joseph Cawthorn"],
      duration: 69,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("WhiteZombie1932_201901", "White Zombie(1932).mp4"),
      posterUrl: ARCHIVE_THUMB("WhiteZombie1932_201901"),
      genres: ["horror"],
    },
    {
      title: "The Brain That Wouldn't Die",
      slug: "the-brain-that-wouldnt-die",
      description:
        "A mad scientist keeps the head of his beheaded fiancée alive while looking for a body to attach it to.",
      year: 1962,
      director: "Joseph Green",
      cast: ["Jason Evers", "Virginia Leith", "Anthony La Penna"],
      duration: 82,
      price: 0,
      isPremium: false,
      videoUrl:
        "https://archive.org/download/the_brain_that_wouldnt_die/the_brain_that_wouldnt_die.mp4",
      posterUrl: ARCHIVE_THUMB("the_brain_that_wouldnt_die"),
      genres: ["horror", "sci-fi"],
    },
    {
      title: "The Last Man on Earth",
      slug: "the-last-man-on-earth",
      description:
        "When a disease turns all of humanity into the living dead, the last man on earth becomes a reluctant vampire hunter.",
      year: 1964,
      director: "Ubaldo Ragona",
      cast: ["Vincent Price", "Franca Bettoia", "Emma Danieli"],
      duration: 86,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("the-last-man-on-earth-1964_202312", "The Last Man on Earth (1964).mp4"),
      posterUrl: ARCHIVE_THUMB("the-last-man-on-earth-1964_202312"),
      genres: ["horror", "sci-fi"],
    },
    {
      title: "Dementia 13",
      slug: "dementia-13",
      description:
        "Coppola's directorial debut: a deceitful young woman finds herself in the middle of a brutal axe-murderer's rampage.",
      year: 1963,
      director: "Francis Ford Coppola",
      cast: ["William Campbell", "Luana Anders", "Bart Patton"],
      duration: 75,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("turner_video_108521", "108521.mp4"),
      posterUrl: ARCHIVE_THUMB("turner_video_108521"),
      genres: ["horror", "thriller"],
    },
    {
      title: "The General",
      slug: "the-general",
      description:
        "After being rejected by the Confederate military, a Southern locomotive engineer must single-handedly rescue his train (and his girlfriend) from the Union Army.",
      year: 1926,
      director: "Buster Keaton",
      cast: ["Buster Keaton", "Marion Mack", "Glen Cavender"],
      duration: 78,
      price: 0,
      isPremium: false,
      videoUrl: ARCHIVE_VIDEO("TheGeneral", "The_General_512kb.mp4"),
      posterUrl: ARCHIVE_THUMB("TheGeneral"),
      genres: ["comedy", "action"],
    },
    // ----- Premium / paid catalog (uses high-quality Blender CC-BY film) -----
    {
      title: "Big Buck Bunny",
      slug: "big-buck-bunny",
      description:
        "A giant rabbit takes revenge on three rodents who have been bullying him. Blender Foundation's open animated short.",
      year: 2008,
      director: "Sacha Goedegebure",
      cast: ["Open Source Animation"],
      duration: 10,
      price: 0,
      isPremium: true, // requires subscription or purchase
      videoUrl: "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
      posterUrl: ARCHIVE_THUMB("BigBuckBunny_124"),
      genres: ["animation", "comedy"],
    },
    {
      title: "Sintel",
      slug: "sintel",
      description:
        "A young woman searches for the baby dragon she befriended in her past. Blender Foundation's third open movie.",
      year: 2010,
      director: "Colin Levy",
      cast: ["Halina Reijn"],
      duration: 14,
      price: 2.99, // one-time purchase
      isPremium: true,
      videoUrl: "https://archive.org/download/Sintel/sintel-2048-surround.mp4",
      posterUrl: ARCHIVE_THUMB("Sintel"),
      genres: ["animation", "drama"],
    },
    {
      title: "Tears of Steel",
      slug: "tears-of-steel",
      description:
        "In an apocalyptic future, a group of warriors and scientists gather at the Oude Kerk in Amsterdam to stage a crucial event from the past. Blender Foundation's fourth open movie.",
      year: 2012,
      director: "Ian Hubert",
      cast: ["Derek de Lint", "Sergio Hasselbaink"],
      duration: 12,
      price: 2.99,
      isPremium: true,
      videoUrl: ARCHIVE_VIDEO("tears-of-steel_202604", "Tears of Steel.mp4"),
      posterUrl: ARCHIVE_THUMB("tears-of-steel_202604"),
      genres: ["sci-fi", "drama", "animation"],
    },
  ] as const;

  let movieCount = 0;
  for (const m of movies) {
    const { genres: genreSlugs, ...rest } = m;
    await prisma.movie.upsert({
      where: { slug: m.slug },
      update: {
        ...rest,
        platforms: ["Web", "Mobile"],
        status: "PUBLISHED",
        genres: { set: genreSlugs.map((slug) => ({ id: G[slug]! })) },
      },
      create: {
        ...rest,
        platforms: ["Web", "Mobile"],
        status: "PUBLISHED",
        genres: { connect: genreSlugs.map((slug) => ({ id: G[slug]! })) },
      },
    });
    movieCount++;
  }
  console.log(`✓ Created ${movieCount} movies`);

  // ----- Series: Blender Open Movies (CC-BY animated shorts as episodes) -----
  const blenderSeries = await prisma.series.upsert({
    where: { slug: "blender-open-movies" },
    update: { posterUrl: ARCHIVE_THUMB("BigBuckBunny_124") },
    create: {
      title: "Blender Open Movies",
      slug: "blender-open-movies",
      description:
        "A showcase of the Blender Foundation's open movie project — each short film was made by an international team using only open-source tools, and all are licensed Creative Commons.",
      startYear: 2006,
      endYear: 2019,
      creator: "Blender Foundation",
      cast: ["Open Source Community"],
      platforms: ["Web", "Mobile"],
      isPremium: true,
      price: 9.99,
      posterUrl: ARCHIVE_THUMB("BigBuckBunny_124"),
      status: "PUBLISHED",
      genres: { connect: [{ id: G["animation"]! }, { id: G["drama"]! }] },
    },
  });
  const blenderSeason = await prisma.season.upsert({
    where: { seriesId_number: { seriesId: blenderSeries.id, number: 1 } },
    update: {},
    create: { seriesId: blenderSeries.id, number: 1, title: "Open Movies", year: 2010 },
  });
  const blenderEpisodes = [
    {
      number: 1,
      title: "Elephants Dream",
      description: "The first Blender Open Movie. Two strangers explore a strange, technological world.",
      duration: 11,
      videoUrl: "https://archive.org/download/ElephantsDream/ed_1024.mp4",
      thumbnailUrl: ARCHIVE_THUMB("ElephantsDream"),
    },
    {
      number: 2,
      title: "Big Buck Bunny",
      description: "A giant rabbit takes revenge on bullying rodents.",
      duration: 10,
      videoUrl:
        "https://archive.org/download/BigBuckBunny_124/Content/big_buck_bunny_720p_surround.mp4",
      thumbnailUrl: ARCHIVE_THUMB("BigBuckBunny_124"),
    },
    {
      number: 3,
      title: "Sintel",
      description: "A young woman searches for the baby dragon she befriended in her past.",
      duration: 14,
      videoUrl: "https://archive.org/download/Sintel/sintel-2048-surround.mp4",
      thumbnailUrl: ARCHIVE_THUMB("Sintel"),
    },
    {
      number: 4,
      title: "Tears of Steel",
      description: "Live-action sci-fi short blending VFX with practical filmmaking.",
      duration: 12,
      videoUrl: ARCHIVE_VIDEO("tears-of-steel_202604", "Tears of Steel.mp4"),
      thumbnailUrl: ARCHIVE_THUMB("tears-of-steel_202604"),
    },
  ];
  for (const ep of blenderEpisodes) {
    await prisma.episode.upsert({
      where: { seasonId_number: { seasonId: blenderSeason.id, number: ep.number } },
      update: ep,
      create: { ...ep, seasonId: blenderSeason.id },
    });
  }
  console.log(`✓ Created series "Blender Open Movies" with ${blenderEpisodes.length} episodes`);

  // ----- Series: Public Domain Horror Classics (PD horror anthology) -----
  const horrorSeries = await prisma.series.upsert({
    where: { slug: "public-domain-horror-classics" },
    update: { posterUrl: ARCHIVE_THUMB("night-of-the-living-dead_202309") },
    create: {
      title: "Public Domain Horror Classics",
      slug: "public-domain-horror-classics",
      description:
        "A curated anthology of classic horror films now in the public domain — from German Expressionism to 1960s drive-in chillers.",
      startYear: 1920,
      endYear: 1968,
      creator: "Various",
      cast: ["Various"],
      platforms: ["Web", "Mobile"],
      isPremium: false,
      price: 0,
      posterUrl: ARCHIVE_THUMB("night-of-the-living-dead_202309"),
      status: "PUBLISHED",
      genres: { connect: [{ id: G["horror"]! }, { id: G["drama"]! }] },
    },
  });
  const horrorSeason = await prisma.season.upsert({
    where: { seriesId_number: { seriesId: horrorSeries.id, number: 1 } },
    update: {},
    create: { seriesId: horrorSeries.id, number: 1, title: "Volume 1", year: 1962 },
  });
  const horrorEpisodes = [
    {
      number: 1,
      title: "The Cabinet of Dr. Caligari (1920)",
      description: "Hypnotist Dr. Caligari uses a somnambulist to commit murders.",
      duration: 67,
      videoUrl: ARCHIVE_VIDEO("silent-the-cabinet-of-dr-caligari", "The Cabinet of Dr. Caligari.mp4"),
      thumbnailUrl: ARCHIVE_THUMB("silent-the-cabinet-of-dr-caligari"),
    },
    {
      number: 2,
      title: "Nosferatu (1922)",
      description: "Vampire Count Orlok stalks a real estate agent's wife.",
      duration: 94,
      videoUrl: ARCHIVE_VIDEO("nosferatu_202501", "Nosferatu.mp4"),
      thumbnailUrl: ARCHIVE_THUMB("nosferatu_202501"),
    },
    {
      number: 3,
      title: "House on Haunted Hill (1959)",
      description: "A millionaire dares five guests to survive a night in a haunted mansion.",
      duration: 75,
      videoUrl: ARCHIVE_VIDEO("house-on-haunted-hill-1959_202512", "House on Haunted Hill  1959.mp4"),
      thumbnailUrl: ARCHIVE_THUMB("house-on-haunted-hill-1959_202512"),
    },
    {
      number: 4,
      title: "Carnival of Souls (1962)",
      description: "A woman becomes drawn to a mysterious abandoned carnival.",
      duration: 78,
      videoUrl: ARCHIVE_VIDEO("CarnivalOfSouls1962", "Carnival_of_Souls_512kb.mp4"),
      thumbnailUrl: ARCHIVE_THUMB("CarnivalOfSouls1962"),
    },
    {
      number: 5,
      title: "Night of the Living Dead (1968)",
      description: "Survivors barricade themselves against flesh-eating ghouls.",
      duration: 96,
      videoUrl: ARCHIVE_VIDEO("night-of-the-living-dead_202309", "Night Of The Living Dead.mp4"),
      thumbnailUrl: ARCHIVE_THUMB("night-of-the-living-dead_202309"),
    },
  ];
  for (const ep of horrorEpisodes) {
    await prisma.episode.upsert({
      where: { seasonId_number: { seasonId: horrorSeason.id, number: ep.number } },
      update: ep,
      create: { ...ep, seasonId: horrorSeason.id },
    });
  }
  console.log(`✓ Created series "Public Domain Horror Classics" with ${horrorEpisodes.length} episodes`);

  // ----- Reviews (give the catalog social proof) -------------------------
  const movieRecords = await prisma.movie.findMany({ select: { id: true, slug: true } });
  const find = (slug: string) => movieRecords.find((m) => m.slug === slug)!.id;

  const reviews = [
    { userId: subscriber.id, movieId: find("night-of-the-living-dead"), rating: 5, text: "A genre-defining masterpiece. The handheld camera and grainy stock makes everything feel like documentary footage.", title: "Still terrifying after all these years" },
    { userId: subscriber.id, movieId: find("nosferatu-1922"), rating: 5, text: "Max Schreck's performance is one of the most iconic in horror history. Shadows have never been used better.", title: "Shadows of a shadow" },
    { userId: freeUser.id, movieId: find("plan-9-from-outer-space"), rating: 3, text: "So bad it's good. A delightful mess.", title: "Ed Wood at his finest" },
    { userId: subscriber.id, movieId: find("his-girl-friday"), rating: 5, text: "Howard Hawks at peak form. Cary Grant and Rosalind Russell trade dialogue at machine-gun speed.", title: "Fastest screwball ever" },
    { userId: freeUser.id, movieId: find("the-general"), rating: 5, text: "Buster Keaton's stunts hold up better than most modern action films. Real trains, real risks.", title: "Pure cinema" },
    { userId: subscriber.id, movieId: find("sintel"), rating: 4, text: "Beautiful animation and emotional gut-punch ending. Hard to believe this was made with free tools.", title: "Open source heart" },
  ];
  for (const r of reviews) {
    await prisma.review.upsert({
      where: { userId_movieId: { userId: r.userId, movieId: r.movieId } },
      update: { rating: r.rating, text: r.text, title: r.title, status: "APPROVED" },
      create: {
        userId: r.userId,
        movieId: r.movieId,
        rating: r.rating,
        text: r.text,
        title: r.title,
        spoiler: false,
        status: "APPROVED",
      },
    });
  }
  console.log(`✓ Created ${reviews.length} reviews`);

  // ----- Watchlist (give the subscriber a list to play with) -------------
  const watchlistMovies = ["sintel", "tears-of-steel", "the-general", "his-girl-friday"];
  for (const slug of watchlistMovies) {
    await prisma.watchlist.upsert({
      where: { userId_movieId: { userId: subscriber.id, movieId: find(slug) } },
      update: {},
      create: { userId: subscriber.id, movieId: find(slug) },
    });
  }
  console.log(`✓ Added ${watchlistMovies.length} items to subscriber watchlist`);

  console.log("\n🎬 Seed complete!");
  console.log("\nLogin credentials:");
  console.log("  Admin:       admin@movieportal.com      / Admin@123456");
  console.log("  Moderator:   moderator@movieportal.com  / User@123456");
  console.log("  Subscriber:  subscriber@movieportal.com / User@123456");
  console.log("  Free user:   free@movieportal.com       / User@123456");
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
