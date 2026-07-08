// "Today" for humans in the shop. new Date().toISOString() is UTC — from
// 5-6pm in Denver that's already TOMORROW, so date defaults, "due today"
// checks, and day filters must use the device's local calendar instead.
export const todayLocal = (now: Date = new Date()): string =>
  new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
