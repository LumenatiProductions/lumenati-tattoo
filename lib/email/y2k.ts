// Y2K email shell — the front-of-house look, in email-safe HTML.
//
// Everything a CLIENT receives renders through this: a fake desktop window
// (title bar with _ [] X, an AIM-style menu row), black terminal body in
// monospace, neon pink/cyan/lime, ASCII dithering for dividers, gel button.
// Email clients strip web fonts and scripts, so the whole aesthetic is built
// from what survives Gmail/Outlook/Apple Mail: tables, inline styles,
// Courier New, and unicode (no emojis — Scott's rule; symbols only).
//
// Internal/money mail (morning brief, settlement receipts, rent invoices)
// stays on the clean parent-brand shell on purpose — same split as the site.

const PINK = "#FF1493";
const CYAN = "#00ffff";
const LIME = "#7fff00";
const BG = "#0a0a0d";
const PANEL = "#101016";
const MONO = "'Courier New', Courier, monospace";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export type Y2kEmail = {
  /** Window title-bar text, e.g. "consent_form.exe" */
  windowTitle: string;
  /** Big lime headline inside the window. */
  headline: string;
  /** Paragraphs of plain text (escaped + line-broken here). */
  paragraphs: string[];
  /** Optional gel button. */
  button?: { label: string; url: string };
  /** Optional small print under the button (e.g. the raw link). */
  finePrint?: string;
};

export function renderY2kEmail(opts: Y2kEmail): string {
  const paras = opts.paragraphs
    .map(
      (p) =>
        `<p style="font-family:${MONO};font-size:14px;line-height:1.7;color:#e4e4e7;margin:0 0 16px;">${esc(p).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");

  const button = opts.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0 18px;"><tr><td style="background:${PINK};border:2px solid #ffffff;outline:2px solid ${PINK};border-radius:8px;">
         <a href="${esc(opts.button.url)}" style="display:inline-block;padding:13px 26px;font-family:${MONO};font-size:14px;font-weight:bold;letter-spacing:1px;color:#ffffff;text-decoration:none;text-transform:uppercase;">&#9656; ${esc(opts.button.label)} &#9666;</a>
       </td></tr></table>`
    : "";

  const finePrint = opts.finePrint
    ? `<p style="font-family:${MONO};font-size:11px;line-height:1.6;color:#52525b;margin:0 0 4px;word-break:break-all;">${esc(opts.finePrint)}</p>`
    : "";

  // The window. Square corners on purpose — Y2K chrome wasn't rounded.
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${BG}" style="background:${BG};margin:0;padding:28px 0;">
  <tr><td align="center">

    <!-- dithered top edge -->
    <div style="font-family:${MONO};font-size:11px;color:#3f3f46;letter-spacing:2px;line-height:1;margin-bottom:10px;">&#9617;&#9618;&#9619;&#9618;&#9617;&#9617;&#9618;&#9619;&#9618;&#9617;&#9617;&#9618;&#9619;&#9618;&#9617;&#9617;&#9618;&#9619;&#9618;&#9617;</div>

    <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="width:520px;max-width:94%;border:2px solid ${PINK};background:${PANEL};">

      <!-- title bar -->
      <tr>
        <td style="background:${PINK};padding:7px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-family:${MONO};font-size:13px;font-weight:bold;color:#ffffff;letter-spacing:1px;">&#9670; ${esc(opts.windowTitle)}</td>
            <td align="right" style="font-family:${MONO};font-size:13px;font-weight:bold;color:#ffffff;letter-spacing:3px;">_ &#9633; &#10005;</td>
          </tr></table>
        </td>
      </tr>

      <!-- menu row -->
      <tr>
        <td style="background:#18181f;border-bottom:1px solid #2a2a33;padding:5px 12px;font-family:${MONO};font-size:11px;color:#71717a;letter-spacing:1px;">
          File&nbsp;&nbsp;Edit&nbsp;&nbsp;Ink&nbsp;&nbsp;Help
        </td>
      </tr>

      <!-- body -->
      <tr>
        <td style="padding:26px 26px 18px;">
          <div style="font-family:${MONO};font-size:11px;letter-spacing:4px;color:${CYAN};text-transform:uppercase;margin-bottom:10px;">LUMENATI TATTOO</div>
          <div style="font-family:${MONO};font-size:20px;font-weight:bold;line-height:1.35;color:${LIME};margin-bottom:16px;">&#10022; ${esc(opts.headline)}</div>
          ${paras}
          ${button}
          ${finePrint}
        </td>
      </tr>

      <!-- status bar -->
      <tr>
        <td style="background:#18181f;border-top:1px solid #2a2a33;padding:7px 12px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
            <td style="font-family:${MONO};font-size:10px;color:#52525b;letter-spacing:1px;">connected &#9642; 56.6kbps</td>
            <td align="right" style="font-family:${MONO};font-size:10px;color:${PINK};letter-spacing:1px;">denver, co</td>
          </tr></table>
        </td>
      </tr>
    </table>

    <!-- footer -->
    <div style="font-family:${MONO};font-size:10px;color:#52525b;letter-spacing:1px;margin-top:14px;line-height:1.8;">
      LUMENATI TATTOO &#10022; 3839 JACKSON ST &#10022; DENVER CO<br>
      you're getting this because you visited the shop // reply to opt out :-)
    </div>

    <!-- dithered bottom edge -->
    <div style="font-family:${MONO};font-size:11px;color:#3f3f46;letter-spacing:2px;line-height:1;margin-top:10px;">&#9617;&#9618;&#9619;&#9618;&#9617;&#9617;&#9618;&#9619;&#9618;&#9617;&#9617;&#9618;&#9619;&#9618;&#9617;&#9617;&#9618;&#9619;&#9618;&#9617;</div>

  </td></tr>
</table>`;
}
