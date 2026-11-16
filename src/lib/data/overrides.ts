import type { Hub, OverrideRule } from "./types";

/**
 * Towns outside the five hubs, with the hub you'd visit them from and the excursion they belong to.
 * Places that share a zone can share a day trip (Bellagio, Lenno and Como are one Lake Como day).
 */
export const SATELLITES: Record<string, { hub: Hub; zone: string }> = {
  Siena: { hub: "Florence", zone: "Siena" },
  Pienza: { hub: "Florence", zone: "Pienza" },
  Modena: { hub: "Bologna", zone: "Modena" },
  Maranello: { hub: "Bologna", zone: "Modena" },
  Parma: { hub: "Bologna", zone: "Parma" },
  Bellagio: { hub: "Milan", zone: "Lake Como" },
  Lenno: { hub: "Milan", zone: "Lake Como" },
  Como: { hub: "Milan", zone: "Lake Como" },
  Burano: { hub: "Venice", zone: "Burano" },
  Padua: { hub: "Venice", zone: "Padua" },
  "Isola della Scala": { hub: "Venice", zone: "Isola della Scala" },
};

/**
 * Records that describe the same visit, so a plan never includes both. Same coordinates are linked
 * automatically (Trevi by day and by night); these are the ones only the text reveals.
 */
export const SAME_VISIT: { ids: string[]; source: string }[] = [
  { ids: ["place_044", "place_083"], source: "place_044's description recommends Acetaia Giusti, which is place_083" },
];

/**
 * Rules hidden in free text: seasonal_notes, descriptions and names. There are few enough (about 20)
 * that a reviewed table is more reliable than a parser. Each rule quotes its source.
 * A first draft of this table came from an LLM reading the notes; every row was then checked by hand.
 */
export const OVERRIDES: Record<string, OverrideRule[]> = {
  // Vatican Museums
  place_010: [
    {
      kind: "hours",
      hours: "Mon-Sat 9:00-18:00, Sun 9:00-14:00",
      approximate: false,
      source: "Note: \"Closed Sundays except last Sunday of the month (free entry, massive crowds)\". Mon-Sat are as listed; Sunday hours are not in the data, 9:00-14:00 is assumed.",
    },
    { kind: "onlyOnOccurrence", weekday: 0, occurrence: "last", source: "Note: \"Closed Sundays except last Sunday of the month\"" },
  ],
  // Appian Way Bike Ride
  place_021: [
    { kind: "months", fromMonth: 4, toMonth: 10, strength: "soft", source: "Note: \"Best April-October\"" },
    // An earlier LLM reading said "only works on Sundays". The note says the road is car-free on Sundays: a preference.
    { kind: "preferWeekdays", weekdays: [0], source: "Note: \"Road closed to cars on Sundays only\"" },
  ],
  // Piazza del Popolo at Dawn
  place_023: [{ kind: "hours", hours: "6:00-8:30", approximate: true, source: "Name: \"at Dawn\"" }],
  // Uffizi Gallery
  place_026: [
    { kind: "bookAhead", days: 21, source: "Note: \"Booking essential April-October\"; description: \"Book weeks in advance in high season\"" },
  ],
  // Accademia Gallery
  place_032: [{ kind: "bookAhead", days: 14, source: "Description: \"Book before you come to Florence\"" }],
  // Borghese Gallery
  place_007: [{ kind: "bookAhead", days: 60, source: "Description: \"Booking months ahead is real\"" }],
  // Boboli Gardens
  place_034: [
    {
      kind: "seasonalHours",
      fromMonth: 6,
      toMonth: 9,
      hours: "8:15-19:30",
      source: "Note: \"Summer hours extend to 19:30\". Which months count as summer is not stated; June–September is assumed.",
    },
    { kind: "warning", text: "Very hot in July and August", fromMonth: 7, toMonth: 8, source: "Note: \"Can be brutally hot July-August\"" },
  ],
  // Chianti Day Trip by Bike
  place_035: [{ kind: "months", fromMonth: 4, toMonth: 10, strength: "hard", source: "Note: \"Open April-October only\"" }],
  // Osteria Francescana
  place_043: [{ kind: "bookAhead", days: 60, source: "Description: \"Book 2+ months in advance\"" }],
  // Trattoria Anna Maria
  place_047: [{ kind: "bookAhead", days: 7, source: "Description: \"Book a week ahead minimum\"" }],
  // Piazza Maggiore at Night
  place_052: [{ kind: "hours", hours: "20:00-24:00", approximate: true, source: "Name: \"at Night\"" }],
  // Cheese and Prosciutto Tour, Parma
  place_053: [
    {
      kind: "hours",
      hours: "Mon-Fri 8:30-15:00",
      approximate: true,
      source: "Note: \"Tours run weekday mornings only\". A 6-hour tour that starts by 9:00 ends about 15:00; times are assumed.",
    },
  ],
  // The Last Supper
  place_056: [{ kind: "bookAhead", days: 60, source: "Note: \"Tickets frequently sell out 2 months in advance\"" }],
  // Navigli Canals at Aperitivo Hour
  place_057: [
    { kind: "hours", hours: "18:00-21:00", approximate: true, source: "Name: \"at Aperitivo Hour\"" },
    { kind: "months", fromMonth: 5, toMonth: 9, strength: "soft", source: "Note: \"Best May-September\"" },
  ],
  // Brera Antique Market. The note says "third weekend"; the description is more precise, so it wins.
  place_059: [
    { kind: "onlyOnOccurrence", weekday: 6, occurrence: 3, source: "Description: \"Third Saturday and Sunday of every month\"" },
    { kind: "onlyOnOccurrence", weekday: 0, occurrence: 3, source: "Description: \"Third Saturday and Sunday of every month\"" },
  ],
  // Bellagio, Villa del Balbianello, Como Town Lakefront
  place_063: [{ kind: "months", fromMonth: 4, toMonth: 10, strength: "hard", source: "Note: \"Open April-October only\"" }],
  place_064: [{ kind: "months", fromMonth: 4, toMonth: 10, strength: "hard", source: "Note: \"Open April-October only\"" }],
  place_085: [{ kind: "months", fromMonth: 4, toMonth: 10, strength: "hard", source: "Note: \"Open April-October only\"" }],
  // Aperitivo at Ceresio 7: the rooftop is the point of the visit, so its season is a hard rule.
  place_065: [{ kind: "months", fromMonth: 5, toMonth: 9, strength: "hard", source: "Note: \"Rooftop open May-September only\"" }],
  // Early Morning in Cannaregio
  place_075: [{ kind: "hours", hours: "7:00-9:30", approximate: true, source: "Name: \"Early Morning\"" }],
  // Trevi Fountain by Night
  place_077: [{ kind: "hours", hours: "20:00-24:00", approximate: true, source: "Name: \"by Night\"" }],
  // Isola della Scala Risotto Festival
  place_090: [
    { kind: "months", fromMonth: 10, toMonth: 10, strength: "hard", source: "Note: \"October only\"" },
    { kind: "warning", text: "Festival dates change yearly; confirm them", source: "Note: \"check exact festival dates before planning\"" },
  ],
  // Orto Botanico di Padova
  place_095: [{ kind: "months", fromMonth: 4, toMonth: 10, strength: "soft", source: "Note: \"Best April-October\"" }],
};
