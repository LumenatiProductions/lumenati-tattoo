import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

// Web-only HTML shell. Paints the page itself ink-black so the phone-width
// app column (capped in the app layout) floats on the app's own dark, not
// browser white.
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: "html, body { background: #0a0a11; }" }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
