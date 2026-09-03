// The arcade catalog: every game the cabinet can boot. Lives on its own so the
// kiosk (client), the room renderer (server), the hall of fame page and the
// score API share one list.
// id = legacy/games/<id>.js, label = menu title, exe = the fake filename.
// cap = the biggest score the wall will accept (a sanity ceiling, not a goal).
// fmt = how a score reads on the wall: plain number or dollars.
export const GAME_CATALOG = [
  { id: "skate", label: "Ink or Die", exe: "ink_or_die.exe", hint: "SPACE ollie // arrows: tricks // hold DOWN to manual the line on", cap: 2000000, fmt: "plain", blurb: "Skate Denver to the mountains. Ollie the street, chain tricks for combos." },
  { id: "snake", label: "Ink Snake", exe: "inksnake.exe", hint: "Arrows or swipe to steer // feast fast for x5", cap: 200000, fmt: "plain", blurb: "Eat ink, grow long, chain feasts. The parlor floor gets messier every level." },
  { id: "bricks", label: "Flash Breaker", exe: "flashbreak.exe", hint: "Arrows, mouse or drag // SPACE launches", cap: 1000000, fmt: "plain", blurb: "Break every sheet of flash on the wall. Keep the ball alive, keep the combo alive." },
  { id: "shooter", label: "Sterile!", exe: "sterile.exe", hint: "Arrows move, SPACE fires // chain hits for x5", cap: 1000000, fmt: "plain", blurb: "Germs are coming for the station. Autoclave everything before it lands." },
  { id: "pong", label: "Needle Pong", exe: "needlepong.exe", hint: "W/S, mouse or drag // first to 5 // edge hits smash", statA: "You", statB: "CPU", livesInit: "0", cap: 200000, fmt: "plain", blurb: "Beat every artist in the shop at table tennis. Each one hits harder." },
  { id: "frogger", label: "Walk-In", exe: "walkin.exe", hint: "Arrows or tap to hop // chairs in a row stack the multiplier", cap: 500000, fmt: "plain", blurb: "Cross the parlor floor and land a chair before the walk-in loses patience." },
  { id: "steady", label: "Steady Hand", exe: "steadyhand.exe", hint: "Up/Down or drag // dead center pays triple", statB: "Trust", cap: 500000, fmt: "plain", blurb: "Trace the stencil clean. Flinches happen. Trust runs out when you wander." },
  { id: "shoprush", label: "Shop Rush", exe: "shoprush.exe", hint: "Arrows or tap to run // seat fast, keep the streak", statA: "Cash", statB: "Rep", cap: 500000, fmt: "dollars", blurb: "Run the front desk on a Saturday. Seat walk-ins fast, collect cash, ride the rep multiplier to x5." },
  { id: "flashmatch", label: "Flash Match", exe: "flashmatch.exe", hint: "Tap a card, or arrows + SPACE // find the pairs", cap: 500000, fmt: "plain", blurb: "Memory with the artist's own flash. The clock shrinks every session." },
] as const;

export type GameId = (typeof GAME_CATALOG)[number]["id"];

export function isGameId(id: string): id is GameId {
  return GAME_CATALOG.some((g) => g.id === id);
}

export function formatScore(game: string, score: number): string {
  const g = GAME_CATALOG.find((x) => x.id === game);
  if (g?.fmt === "dollars") return "$" + score.toLocaleString("en-US");
  return score.toLocaleString("en-US");
}
