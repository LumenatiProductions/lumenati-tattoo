// The arcade catalog: every game the cabinet can boot. Lives on its own so the
// kiosk (client) and the room renderer (server) share one list.
// id = legacy/games/<id>.js, label = menu title, exe = the fake filename.
export const GAME_CATALOG = [
  { id: "skate", label: "Ink or Die", exe: "ink_or_die.exe", hint: "SPACE ollie // arrows: tricks + manual" },
  { id: "snake", label: "Ink Snake", exe: "inksnake.exe", hint: "Arrows or swipe to steer // machine +50" },
  { id: "bricks", label: "Flash Breaker", exe: "flashbreak.exe", hint: "Arrows, mouse or drag // SPACE launches" },
  { id: "shooter", label: "Sterile!", exe: "sterile.exe", hint: "Arrows move, SPACE fires // drag on phones" },
  { id: "pong", label: "Needle Pong", exe: "needlepong.exe", hint: "W/S, mouse or drag // first to 5", statA: "You", statB: "CPU", livesInit: "0" },
  { id: "frogger", label: "Walk-In", exe: "walkin.exe", hint: "Arrows or tap to hop // fill all 3 chairs" },
  { id: "steady", label: "Steady Hand", exe: "steadyhand.exe", hint: "Up/Down or drag // stay on the stencil", statB: "Trust" },
  { id: "shoprush", label: "Shop Rush", exe: "shoprush.exe", hint: "Arrows or tap to run // seat, then collect", statA: "Cash", statB: "Rep" },
  { id: "flashmatch", label: "Flash Match", exe: "flashmatch.exe", hint: "Tap a card, or arrows + SPACE // find the pairs" },
] as const;
