# Script Lean

**Schnell. Leicht. Saubere Seiten.** Ultraleichter Werbeblocker + JavaScript-Injektor für Chromium-Browser — blockt Werbung, bevor sie lädt, macht Seiten schneller und steht dir nicht im Weg.

Sprachen: [English](README.md) · [Tiếng Việt](README.vi.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [Français](README.fr.md)

## Warum Script Lean

- **Schnellere Seiten** — Werbung und Tracker werden auf Netzwerkebene blockiert, *bevor* sie heruntergeladen werden. Nichts Schwerlastiges läuft auf der Seite.
- **Winzige Fußabdruck** — die gesamte Erweiterung ist nur ~80 KB groß. Kein Hintergrund-Ballast, Kosmetik-Sweeps mit Auto-Stopp, native Regel-Engine.
- **Top-Werte, überprüfbar**

  | Test | Ergebnis |
  |---|---|
  | AdBlockBench | **100%** — Network · Cosmetic · Scriptlet · API |
  | superadblocktest.com | **100%** — 482/482 blockiert |
  | adblock.turtlecute.org | **100%** |

- **Seiten funktionieren weiter** — das sichere **Ads**-Modellfasst nie die Seitenfunktion an; breitere Muster liegen im separaten **Aggressive**-Modul (standardmäßig aus). Bot-Checks (Cloudflare/DataDome) sowie Bank-/Zahlungsseiten bleiben unangetastet.
- **Schwer zu erkennen** — gepatchte APIs behalten ihren nativen Fingerabdruck; same-site-Traffic wird nie angetastet, Seiten verhalten sich normal.
- **8 Module, ein Klick** — Ads · Analytics · Surrogates · Bypass · Anti-Fingerprint · Privacy · Video · Aggressive (standardmäßig aus).
- **Eigene Filterlisten** — füge die URL einer beliebigen Liste ein oder schreibe eigene Regeln: `||ads.example.com^` zum Blockieren, `@@||mysite.com^` zum Erlauben. Sofort wirksam, offlinefähig.
- **Eigene JavaScript-Injektion** — füge pro Website dein eigenes JS ein (Domain / URL-Muster / Regex), optional mit Zeitplan. Ein kleines Badge zeigt, wie viele Skripte aktiv sind; über das **#**-Symbol im Popup ausblendbar.
- **Privat von Grund auf** — alles läuft lokal. Keine Konten, keine Telemetrie, keine Datensammlung.

## Installation (Chrome / Edge / Brave / Chromium) — 1 Minute

1. Lade `releases/script-lean-2.5.2.crx` herunter.
2. Öffne `chrome://extensions`.
3. Ziehe die `.crx`-Datei auf die Seite → bestätige **Add extension**. Fertig.
4. Icon anheften → anklicken → gewünschte Module einschalten.

> Lieber den Quellcode? Lade `releases/script-lean-2.5.2.zip` herunter und entpacke es (oder klone dieses Repo — der Quellcode *ist* die Erweiterung), aktiviere den **Entwicklermodus** → **Entpackte Erweiterung laden** → wähle den Ordner `script-lean-2.5.2`. Dieser Weg funktioniert immer, auch wenn der Browser externe `.crx`-Dateien ablehnt.

Download prüfen (MD5):

```
61a00846af9f879462dc39109e09fd94  script-lean-2.5.2.zip
8d5cef567cae9c8e1a2f257c3753a767  script-lean-2.5.2.crx
```

## Erste Schritte

- Das Popup zeigt die aktuelle Seite, die 8 Module, deine Skripte und Filterlisten.
- **Custom JS** benötigt die Browser-Einstellung *Allow User Scripts* (`chrome://extensions` → Script Lean → Details) — das Popup zeigt bei Bedarf einen Ein-Klick-Banner. Werbeblockierung funktioniert auch ohne.
- Leere Werbeboxen? Das **Ads**-Modul kollabiert die leeren Kästchen bereits; aktiviere **Aggressive** nur, wenn eine Seite noch Müll zeigt.

## Screenshots

| AdBlockBench | TurtleCute | SuperAdBlockTest |
|---|---|---|
| ![AdBlockBench 100%](docs/screenshots/adblockbench-100.jpg) | ![TurtleCute 100%](docs/screenshots/turtlecute-100.jpg) | ![SuperAdBlockTest 482/482](docs/screenshots/superadblocktest-100.jpg) |

## Hinweise

- Lizenz: [MIT](LICENSE).

## Lektüre

**[Where Ads Get Cut](https://duydanh9989.github.io/ad-blocking-intervention-points/)** — Wie Werbeblockung im Web wirklich funktioniert und die Peer-Ökonomie, in die sie das Web drängt.
