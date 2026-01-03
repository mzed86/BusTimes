# Kiosk Mode & Fullscreen on iPhone (Safari)

## Limitations
- Safari iOS does not allow true fullscreen in browser; the URL bar may persist.
- The scroll trick (`window.scrollTo(0, 1)`) helps minimize the URL bar, but does not fully hide it.
- For true fullscreen, use "Add to Home Screen" (PWA/standalone mode) and enable Guided Access for kiosk.

## Recommendations
1. Open the app in Safari on iPhone.
2. Tap the Share button and select "Add to Home Screen".
3. Launch the app from the Home Screen for a fullscreen experience (no URL bar).
4. Optionally, enable Guided Access for kiosk mode.

## PWA & Offline Support
- This app now includes a manifest.json and service worker for full PWA support.
- When installed to the Home Screen, it runs in standalone mode and works offline for cached assets.
- For best results, add icons named icon-192.png and icon-512.png to the project root.

## Advanced: Convert to PWA
- Already implemented: manifest.json and service-worker.js.
- You can further customize caching and offline behavior in service-worker.js.

## References
- [Apple docs: Web apps on iOS](https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/ConfiguringWebApplications/ConfiguringWebApplications.html)
- [MDN: Fullscreen web apps](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Installable_PWAs)
