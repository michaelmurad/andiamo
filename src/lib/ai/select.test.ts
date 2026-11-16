import { describe, expect, it } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { isTimeoutError, mentionsTiming, parseOutput } from "./select";

describe("mentionsTiming", () => {
  // The reasons from the first live run that contradicted where the scheduler put the stop.
  it.each([
    "Your Sunday falls on car-free day, ideal for cycling past ancient tombs.",
    "Atmospheric cobbled lanes for wandering at dusk before a relaxed dinner.",
    "A residential trattoria ideal for your long lunch, with Rome's best supplì.",
    "Your splurge dinner: exceptional carbonara and wine among hanging prosciutto and cheese.",
    "Go early morning before the crowds.",
    "Best on weekends.",
    "Arrive by 9:30 to beat the queue.",
    "Opens at 8am.",
    "Nightlife spot that stays busy for you.",
    "Tonight you eat here.",
    "Cocktails after dark for you.",
    "Your nighttime stroll.",
    "A sundowner spritz with a view.",
    "Open past midnight for you.",
    "A lunchtime favourite of yours.",
    "Long dinners suit you here.",
    "Quieter on weekdays for you.",
    "Doors open at 10 p.m. for you.",
    "An overnight stay you'll love.",
    "Classic aperitivi with you in mind.",
    "Golden hour views for you.",
    "A teatime treat for you.",
    "Best in the a.m. for you.",
    "Open until 10 p.m for you.",
    "The fish market draws chefs at first light.",
    "Arrive at daybreak for the mist over the lagoon.",
    "Catch the day-break glow on the domes.",
    "Day break over the lagoon.",
    "Come for the first-light views.",
    "Best at first-light.",
    "At twilight the canal glows.",
    "Today you eat here.",
    "Still open today, so make it your first stop.",
    "Even today you can catch the last tour if you hurry.",
  ])("flags %j", (reason) => {
    expect(mentionsTiming(reason)).toBe(true);
  });

  it("allows timing words that are part of the place's own name", () => {
    expect(mentionsTiming("Trevi Fountain by Night is calmer than by day.", "Trevi Fountain by Night")).toBe(false);
    expect(mentionsTiming("Navigli at Aperitivo Hour, with canal-side tables.", "Navigli Canals at Aperitivo Hour")).toBe(false);
    expect(mentionsTiming("Trevi Fountain by Night, then a late dinner.", "Trevi Fountain by Night")).toBe(true);
  });

  it.each([
    "The food market where locals actually shop; graze on legendary supplì.",
    "A free, little-known keyhole view framing St. Peter's dome.",
    "A splurge: exceptional carbonara and wine among hanging prosciutto and cheese.",
    "A slow, hidden wander through old maps, prints and vintage books.",
    "Michelangelo's David, worth the 15-minute queue.",
    "The first light-filled nave in Florence.",
    "Caravaggio's first light-and-shadow masterpiece.",
    "A gallery that first brought light into Gothic churches.",
    "Early Christian mosaics glitter in the apse.",
  ])("allows %j", (reason) => {
    expect(mentionsTiming(reason)).toBe(false);
  });
});

describe("parseOutput", () => {
  const schema = z.object({ hub: z.string() });
  const message = (text: string | null, stop: Anthropic.Message["stop_reason"] = "end_turn") =>
    ({ stop_reason: stop, content: text === null ? [] : [{ type: "text", text, citations: null }] }) as unknown as Anthropic.Message;

  it("reads valid output", () => {
    expect(parseOutput(message('{"hub":"Rome"}'), schema)).toEqual({ hub: "Rome" });
  });

  it("returns null instead of throwing on cut-off, invalid or missing output", () => {
    expect(parseOutput(message('{"hub":"Ro'), schema)).toBeNull();
    expect(parseOutput(message("I can't help with that."), schema)).toBeNull();
    expect(parseOutput(message('{"city":"Rome"}'), schema)).toBeNull();
    expect(parseOutput(message(null), schema)).toBeNull();
  });
});

describe("isTimeoutError", () => {
  it("recognises the SDK's timeout error by class and by name (a second SDK copy fails instanceof)", () => {
    expect(isTimeoutError(new Anthropic.APIConnectionTimeoutError())).toBe(true);
    expect(isTimeoutError(Object.assign(new Error("Request timed out."), { name: "APIConnectionTimeoutError" }))).toBe(true);
  });

  it("leaves other failures alone", () => {
    expect(isTimeoutError(new Anthropic.APIConnectionError({ message: "reset" }))).toBe(false);
    expect(isTimeoutError(new Error("boom"))).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
  });
});
