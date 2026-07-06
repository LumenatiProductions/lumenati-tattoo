// Web stand-in for @stripe/stripe-terminal-react-native (see metro.config.js).
// Never actually called — pos.tsx only renders the real POS on real iOS builds
// — it just has to exist so the web bundle resolves.
module.exports = {
  useStripeTerminal: () => ({}),
  StripeTerminalProvider: ({ children }) => children,
};
