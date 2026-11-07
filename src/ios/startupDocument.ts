/** Vite adds crossorigin to module scripts. Capacitor's capacitor:// handler does not send CORS headers, so those scripts never run and the WebView stays blank. */
export function stripCrossOriginAttributes(html: string): string {
  return html.replace(/ crossorigin(?:="[^"]*")?/g, "");
}
