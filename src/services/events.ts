import type { OrgId } from "./guild-settings.ts";

const ESPN_SCOREBOARD_URL =
  "https://site.api.espn.com/apis/site/v2/sports/mma/ufc/scoreboard?dates=";
const DEFAULT_EVENT_URL = "https://www.ufc.com/events";
const USER_AGENT =
  process.env.ESPN_USER_AGENT ??
  "serverless-fight-night-bot/1.0 (+https://github.com/zodakzach)";

interface ScoreboardRoot {
  leagues?: unknown[];
  events?: ScoreboardEvent[];
}

interface ScoreboardEvent {
  id?: string;
  uid?: string;
  date?: string;
  name?: string;
  shortName?: string;
  season?: { year?: number };
  competitions?: ScoreboardCompetition[];
  links?: ScoreboardLink[];
  venues?: ScoreboardVenue[];
  status?: {
    type?: {
      state?: string;
      description?: string;
      detail?: string;
    };
  };
  logos?: { href?: string }[];
}

interface ScoreboardVenue {
  fullName?: string;
  address?: {
    city?: string;
    state?: string;
    country?: string;
  };
}

interface ScoreboardLink {
  href?: string;
  text?: string;
  shortText?: string;
  isExternal?: boolean;
  rel?: string[];
}

interface ScoreboardCompetition {
  id?: string;
  uid?: string;
  order?: number;
  date?: string;
  startDate?: string;
  endDate?: string;
  cardSegment?: {
    title?: string;
    position?: number;
  };
  type?: {
    id?: string;
    abbreviation?: string;
    text?: string;
  };
  venue?: ScoreboardVenue;
  broadcasts?: { market?: string; names?: string[] }[];
  broadcast?: string;
  geoBroadcasts?: {
    type?: { shortName?: string };
    media?: { shortName?: string };
  }[];
  status?: {
    type?: {
      state?: string;
      description?: string;
    };
  };
  competitors?: ScoreboardCompetitor[];
}

interface ScoreboardCompetitor {
  order?: number;
  homeAway?: string;
  winner?: boolean;
  athlete?: {
    displayName?: string;
    shortName?: string;
    fullName?: string;
  };
  records?: { summary?: string }[];
}

export interface FightCardBout {
  weightClass: string;
  redName: string;
  redRecord?: string;
  blueName: string;
  blueRecord?: string;
  scheduled?: Date | null;
}

export interface FightEvent {
  id: string;
  org: OrgId;
  name: string;
  shortName: string;
  mainEvent: string;
  startTime: Date;
  endTime?: Date | null;
  venue: string;
  city: string;
  broadcast: string;
  url: string;
  logo?: string;
}

export interface FightEventWithCard {
  event: FightEvent;
  card: FightCardBout[];
}

interface CandidateEvent {
  event: ScoreboardEvent;
  start?: Date;
  end?: Date | null;
  state: string;
}

const IGNORED_EVENT_KEYWORDS = [
  "contender series",
  "dana white's contender",
  "dwcs",
];

export async function getNextEvent(
  org: OrgId,
  now = new Date(),
): Promise<FightEventWithCard | null> {
  switch (org) {
    case "ufc":
      return fetchNextUfcEvent(now);
    default:
      return null;
  }
}

async function fetchNextUfcEvent(
  now: Date,
): Promise<FightEventWithCard | null> {
  const years = [
    now.getUTCFullYear() - 1,
    now.getUTCFullYear(),
    now.getUTCFullYear() + 1,
  ];

  const roots = await Promise.all(
    years.map(async (year) => {
      try {
        return await fetchScoreboard(year);
      } catch (error) {
        console.error(`Failed to load ESPN scoreboard for ${year}:`, error);
        return null;
      }
    }),
  );

  const candidates: CandidateEvent[] = [];
  for (const root of roots) {
    if (!root?.events?.length) continue;
    for (const event of root.events) {
      if (isIgnoredEvent(event)) {
        continue;
      }
      const annotated = annotateEvent(event);
      if (annotated) {
        candidates.push(annotated);
      }
    }
  }

  if (!candidates.length) {
    return null;
  }

  const valid = candidates.filter((c) => c.state !== "post" && c.start);
  const nowMs = now.getTime();

  const ongoing = valid
    .filter((c) => {
      if (!c.start) return false;
      const startMs = c.start.getTime();
      const endMs = c.end?.getTime();
      if (startMs > nowMs) return false;
      if (endMs && nowMs > endMs) return false;
      return true;
    })
    .sort((a, b) => a.start!.getTime() - b.start!.getTime());

  const upcoming = valid
    .filter((c) => (c.start ? c.start.getTime() > nowMs : false))
    .sort((a, b) => a.start!.getTime() - b.start!.getTime());

  const chosen = ongoing[0] ?? upcoming[0];
  if (!chosen?.start) {
    return null;
  }

  const event = buildFightEvent(chosen.event, chosen.start, chosen.end);
  const card = buildFightCard(chosen.event);

  return { event, card };
}

async function fetchScoreboard(year: number): Promise<ScoreboardRoot> {
  const response = await fetch(`${ESPN_SCOREBOARD_URL}${year}`, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`ESPN responded with ${response.status} for year ${year}`);
  }

  const json = (await response.json()) as ScoreboardRoot;
  return json;
}

function annotateEvent(event: ScoreboardEvent): CandidateEvent | null {
  const start = findEarliestDate(event);
  if (!start) return null;

  const end = findLatestDate(event);

  const state =
    event.status?.type?.state ??
    event.competitions?.[0]?.status?.type?.state ??
    "pre";

  return {
    event,
    start,
    end,
    state,
  };
}

function findEarliestDate(event: ScoreboardEvent): Date | undefined {
  const times: Date[] = [];

  if (event.date) {
    const parsed = parseUtcDate(event.date);
    if (parsed) times.push(parsed);
  }

  for (const competition of event.competitions ?? []) {
    for (const value of [competition.startDate, competition.date]) {
      const parsed = parseUtcDate(value);
      if (parsed) times.push(parsed);
    }
  }

  if (!times.length) return undefined;
  times.sort((a, b) => a.getTime() - b.getTime());
  return times[0];
}

function findLatestDate(event: ScoreboardEvent): Date | undefined {
  const times: Date[] = [];

  for (const competition of event.competitions ?? []) {
    for (const value of [competition.endDate, competition.date]) {
      const parsed = parseUtcDate(value);
      if (parsed) times.push(parsed);
    }
  }

  if (!times.length) return undefined;
  times.sort((a, b) => b.getTime() - a.getTime());
  return times[0];
}

function buildFightEvent(
  event: ScoreboardEvent,
  start: Date,
  end: Date | null | undefined,
): FightEvent {
  const mainCompetition = chooseMainCompetition(event);

  const mainEvent = mainCompetition
    ? formatCompetitors(mainCompetition)
    : "TBA";

  const venue = event.venues?.[0] ?? mainCompetition?.venue;
  const venueName = venue?.fullName ?? "TBA";
  const city = formatCity(venue);

  const broadcast = extractBroadcast(mainCompetition);

  const url = selectEventUrl(event.links) ?? DEFAULT_EVENT_URL;
  const mainStart =
    parseUtcDate(mainCompetition?.startDate) ??
    parseUtcDate(mainCompetition?.date) ??
    start;
  const mainEnd =
    parseUtcDate(mainCompetition?.endDate) ??
    parseUtcDate(mainCompetition?.date) ??
    end ??
    null;

  return {
    id: event.id ?? event.uid ?? "unknown",
    org: "ufc",
    name: event.name ?? "UFC Fight Night",
    shortName: event.shortName ?? event.name ?? "UFC Event",
    mainEvent,
    startTime: mainStart ?? start,
    endTime: mainEnd,
    venue: venueName,
    city,
    broadcast,
    url,
    logo: event.logos?.[0]?.href,
  };
}

function buildFightCard(event: ScoreboardEvent): FightCardBout[] {
  const card: FightCardBout[] = [];
  for (const competition of event.competitions ?? []) {
    const [redName, blueName] = extractNames(competition);
    const [redRecord, blueRecord] = extractRecords(competition);
    const scheduled =
      parseUtcDate(competition.startDate) ?? parseUtcDate(competition.date);

    card.push({
      weightClass:
        competition.type?.text ?? competition.type?.abbreviation ?? "Bout",
      redName,
      redRecord,
      blueName,
      blueRecord,
      scheduled,
    });
  }
  return card;
}

function parseUtcDate(value?: string | null): Date | undefined {
  if (!value?.trim()) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function chooseMainCompetition(
  event: ScoreboardEvent,
): ScoreboardCompetition | undefined {
  const competitions = event.competitions ?? [];
  if (!competitions.length) return undefined;

  const explicitMain = competitions.find((competition) => {
    const title = competition.cardSegment?.title?.toLowerCase() ?? "";
    return title.includes("main") || title.includes("title");
  });
  if (explicitMain) {
    return explicitMain;
  }

  // ESPN lists bouts with prelims first, so pick the last one.
  return competitions[competitions.length - 1];
}

function formatCompetitors(competition: ScoreboardCompetition): string {
  const [red, blue] = extractNames(competition);
  if (red && blue) {
    return `${red} vs ${blue}`;
  }
  return red || blue || "TBA";
}

function isIgnoredEvent(event: ScoreboardEvent): boolean {
  const name = event.name?.toLowerCase() ?? "";
  const short = event.shortName?.toLowerCase() ?? "";
  return IGNORED_EVENT_KEYWORDS.some(
    (keyword) => name.includes(keyword) || short.includes(keyword),
  );
}

function extractNames(competition: ScoreboardCompetition): [string, string] {
  const competitors = competition.competitors ?? [];
  if (!competitors.length) {
    return ["TBA", "TBA"];
  }

  const sorted = [...competitors].sort((a, b) => {
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    return orderA - orderB;
  });

  const red = formatCompetitorName(sorted[0]);
  const blue = formatCompetitorName(sorted[1] ?? sorted[0]);

  return [red, blue];
}

function extractRecords(
  competition: ScoreboardCompetition,
): [string | undefined, string | undefined] {
  const competitors = competition.competitors ?? [];

  const sorted = [...competitors].sort((a, b) => {
    const orderA = a.order ?? 0;
    const orderB = b.order ?? 0;
    return orderA - orderB;
  });

  const red = sorted[0]?.records?.[0]?.summary;
  const blue = sorted[1]?.records?.[0]?.summary;

  return [red, blue];
}

function formatCompetitorName(competitor?: ScoreboardCompetitor): string {
  if (!competitor) return "TBA";

  const athlete = competitor.athlete;
  return (
    firstNonEmpty(
      athlete?.fullName,
      athlete?.displayName,
      athlete?.shortName,
    ) ?? "TBA"
  );
}

function firstNonEmpty(...values: (string | undefined)[]): string | undefined {
  for (const value of values) {
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function formatCity(venue?: ScoreboardVenue): string {
  if (!venue?.address) return "TBA";
  const parts = [
    venue.address.city,
    venue.address.state,
    venue.address.country,
  ].filter((part) => part && part.trim());
  return parts.join(", ") || "TBA";
}

function extractBroadcast(competition?: ScoreboardCompetition): string {
  if (!competition) return "TBA";

  if (typeof competition.broadcast === "string" && competition.broadcast) {
    return competition.broadcast;
  }

  const names = new Set<string>();
  for (const item of competition.broadcasts ?? []) {
    for (const name of item.names ?? []) {
      if (name.trim()) {
        names.add(name.trim());
      }
    }
  }
  for (const item of competition.geoBroadcasts ?? []) {
    const mediaName = item.media?.shortName;
    if (mediaName?.trim()) {
      names.add(mediaName.trim());
    }
    const typeName = item.type?.shortName;
    if (typeName?.trim()) {
      names.add(typeName.trim());
    }
  }

  if (names.size > 0) {
    return Array.from(names).join(", ");
  }

  return "TBA";
}

function selectEventUrl(links?: ScoreboardLink[]): string | undefined {
  if (!links?.length) return undefined;

  const preferredRel = ["preview", "gamecast", "hub", "info"];

  for (const rel of preferredRel) {
    const link = links.find((l) =>
      l.rel?.some((value) => value.toLowerCase() === rel),
    );
    if (link?.href) return link.href;
  }

  return links.find((link) => link.href)?.href;
}
