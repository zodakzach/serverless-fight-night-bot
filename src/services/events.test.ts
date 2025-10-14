import { afterEach, describe, expect, it } from "bun:test";

import { getNextEvent } from "./events.ts";

const ORIGINAL_FETCH = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

function createResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function setScoreboardResponses(responses: Record<number, unknown>) {
  const handler = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const request =
      input instanceof Request
        ? input
        : typeof input === "string" || input instanceof URL
          ? new Request(input.toString(), init)
          : new Request(input, init);

    const url = request.url;
    const yearMatch = /dates=(\d{4})/.exec(url);
    const yearString = yearMatch?.[1];
    const year = yearString ? Number.parseInt(yearString, 10) : undefined;
    const payload = (year !== undefined && responses[year]) ?? {
      leagues: [],
      events: [],
    };

    return createResponse(payload);
  };

  const mockedFetch = handler as typeof fetch;

  if (ORIGINAL_FETCH) {
    const descriptors = Object.getOwnPropertyDescriptors(ORIGINAL_FETCH);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      try {
        Object.defineProperty(mockedFetch, key, descriptor);
      } catch {
        // Ignore read-only properties such as length/name.
      }
    }
  }

  globalThis.fetch = mockedFetch;
}

describe("getNextEvent", () => {
  it("returns upcoming UFC event with card details", async () => {
    setScoreboardResponses({
      2023: { leagues: [], events: [] },
      2024: {
        leagues: [],
        events: [
          {
            id: "600000001",
            name: "UFC Fight Night: Test Card",
            shortName: "UFC FN Test",
            date: "2024-05-11T00:00:00Z",
            status: { type: { state: "pre" } },
            venues: [
              {
                fullName: "UFC Apex",
                address: {
                  city: "Las Vegas",
                  state: "NV",
                  country: "USA",
                },
              },
            ],
            competitions: [
              {
                id: "401000000",
                startDate: "2024-05-11T00:00:00Z",
                date: "2024-05-11T00:00:00Z",
                type: { id: "100", text: "Featherweight" },
                cardSegment: { title: "Prelims" },
                broadcast: "ESPN+",
                competitors: [
                  {
                    order: 1,
                    athlete: { fullName: "Alex Example" },
                    records: [{ summary: "10-1-0" }],
                  },
                  {
                    order: 2,
                    athlete: { fullName: "Blake Sample" },
                    records: [{ summary: "9-2-0" }],
                  },
                ],
              },
              {
                id: "401000001",
                startDate: "2024-05-11T02:00:00Z",
                endDate: "2024-05-11T04:00:00Z",
                date: "2024-05-11T02:00:00Z",
                type: { id: "101", text: "Lightweight" },
                cardSegment: { title: "Main Card" },
                broadcast: "ESPN+",
                competitors: [
                  {
                    order: 1,
                    athlete: { fullName: "Fighter Red" },
                    records: [{ summary: "15-0-0" }],
                  },
                  {
                    order: 2,
                    athlete: { fullName: "Fighter Blue" },
                    records: [{ summary: "13-1-0" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      2025: { leagues: [], events: [] },
    });

    const result = await getNextEvent("ufc", new Date("2024-05-01T00:00:00Z"));
    expect(result).not.toBeNull();

    const event = result?.event;
    expect(event).toBeDefined();
    expect(event?.id).toBe("600000001");
    expect(event?.name).toBe("UFC Fight Night: Test Card");
    expect(event?.mainEvent).toBe("Fighter Red vs Fighter Blue");
    expect(event?.broadcast).toBe("ESPN+");
    expect(event?.city).toBe("Las Vegas, NV, USA");
    expect(event?.url).toBe("https://www.ufc.com/events");

    const card = result?.card;
    expect(card).toBeDefined();
    expect(card?.length).toBe(2);
    expect(card?.[0]?.redName).toBe("Alex Example");
    expect(card?.[0]?.weightClass).toBe("Featherweight");
    expect(card?.[1]?.redName).toBe("Fighter Red");
    expect(card?.[1]?.blueName).toBe("Fighter Blue");
  });

  it("prefers ongoing events over upcoming ones", async () => {
    setScoreboardResponses({
      2023: { leagues: [], events: [] },
      2024: {
        leagues: [],
        events: [
          {
            id: "600000010",
            name: "UFC Fight Night: Ongoing",
            shortName: "UFC FN Ongoing",
            date: "2024-05-05T00:00:00Z",
            status: { type: { state: "in_progress" } },
            competitions: [
              {
                id: "401100000",
                startDate: "2024-05-05T20:00:00Z",
                endDate: "2024-05-05T23:30:00Z",
                date: "2024-05-05T20:00:00Z",
                type: { id: "110", text: "Welterweight" },
                cardSegment: { title: "Main Card" },
                broadcast: "ESPN+",
                competitors: [
                  {
                    order: 1,
                    athlete: { fullName: "Dana Active" },
                    records: [{ summary: "18-4-0" }],
                  },
                  {
                    order: 2,
                    athlete: { fullName: "Chris Live" },
                    records: [{ summary: "17-5-0" }],
                  },
                ],
              },
            ],
          },
          {
            id: "600000011",
            name: "UFC Fight Night: Upcoming",
            shortName: "UFC FN Upcoming",
            date: "2024-06-01T00:00:00Z",
            status: { type: { state: "pre" } },
            competitions: [
              {
                id: "401100001",
                startDate: "2024-06-01T20:00:00Z",
                type: { id: "120", text: "Middleweight" },
                cardSegment: { title: "Main Card" },
                broadcast: "ESPN+",
                competitors: [
                  {
                    order: 1,
                    athlete: { fullName: "Upcoming Red" },
                    records: [{ summary: "11-2-0" }],
                  },
                  {
                    order: 2,
                    athlete: { fullName: "Upcoming Blue" },
                    records: [{ summary: "10-3-0" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      2025: { leagues: [], events: [] },
    });

    const result = await getNextEvent("ufc", new Date("2024-05-05T21:00:00Z"));
    expect(result).not.toBeNull();
    expect(result?.event.id).toBe("600000010");
    expect(result?.event.mainEvent).toBe("Dana Active vs Chris Live");
  });

  it("returns null when no upcoming or ongoing events are found", async () => {
    setScoreboardResponses({
      2023: { leagues: [], events: [] },
      2024: {
        leagues: [],
        events: [
          {
            id: "600000020",
            name: "UFC Fight Night: Past Event",
            shortName: "UFC FN Past",
            date: "2024-02-01T00:00:00Z",
            status: { type: { state: "post" } },
            competitions: [
              {
                id: "401200000",
                startDate: "2024-02-01T20:00:00Z",
                endDate: "2024-02-01T23:00:00Z",
                date: "2024-02-01T20:00:00Z",
                type: { id: "130", text: "Lightweight" },
                cardSegment: { title: "Main Card" },
                broadcast: "ESPN+",
                competitors: [
                  {
                    order: 1,
                    athlete: { fullName: "Past Red" },
                    records: [{ summary: "9-3-0" }],
                  },
                  {
                    order: 2,
                    athlete: { fullName: "Past Blue" },
                    records: [{ summary: "8-4-0" }],
                  },
                ],
              },
            ],
          },
        ],
      },
      2025: { leagues: [], events: [] },
    });

    const result = await getNextEvent("ufc", new Date("2024-05-01T00:00:00Z"));
    expect(result).toBeNull();
  });
});
