# Script Lean

**Rápido. Ligero. Páginas limpias.** Bloqueador de anuncios ultraligero + inyector de JavaScript para navegadores Chromium — bloquea la publicidad antes de que se cargue, acelera las páginas y no te estorba.

Idiomas: [English](README.md) · [Tiếng Việt](README.vi.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [Français](README.fr.md)

## Por qué Script Lean

- **Carga de páginas más rápida** — los anuncios y rastreadores se bloquean a nivel de red *antes* de descargarse. Nada pesado se ejecuta en la página.
- **Huella mínima** — toda la extensión pesa ~80 KB. Sin procesos de fondo pesados, barrido cosmético con auto-apagado y motor de reglas nativo.
- **Puntuaciones máximas, verificables**

  | Prueba | Resultado |
  |---|---|
  | AdBlockBench | **100%** — Network · Cosmetic · Scriptlet · API |
  | superadblocktest.com | **100%** — 482/482 bloqueados |
  | adblock.turtlecute.org | **100%** |

- **Las páginas siguen funcionando** — el módulo **Ads** es seguro y nunca toca la función de la página; los patrones amplios viven en el módulo **Aggressive** (apagado por defecto). Los chequeos anti-bot (Cloudflare/DataDome) y las páginas de bancos/pagos pasan intactos.
- **Difícil de detectar** — las APIs parcheadas conservan su huella nativa; el tráfico del propio sitio nunca se toca, así que las webs se comportan con normalidad.
- **8 módulos de un clic** — Ads · Analytics · Surrogates · Bypass · Anti-Fingerprint · Privacy · Video · Aggressive (apagado por defecto).
- **Listas de filtros personalizadas** — pega la URL de cualquier lista o escribe tus propias reglas: `||ads.example.com^` para bloquear, `@@||mysite.com^` para permitir. Se aplican al instante y funcionan sin conexión.
- **Inyección de JavaScript personalizado** — inyecta tu propio JS por sitio (dominio / patrón de URL / regex) con programador opcional. Una insignia pequeña muestra cuántos scripts están activos; pulsa el icono **#** del popup para ocultarla.
- **Privado por diseño** — todo funciona localmente. Sin cuentas, sin telemetría, sin recogida de datos.

## Instalación (Chrome / Edge / Brave / Chromium) — 1 minuto

1. Descarga `releases/script-lean-2.5.2.crx`.
2. Abre `chrome://extensions`.
3. Arrastra el archivo `.crx` a la página → confirma **Add extension**. Listo.
4. Fija el icono → púlsalo → activa lo que necesites.

> ¿Prefieres el código fuente? Descarga `releases/script-lean-2.5.2.zip` y descomprímelo (o clona este repo: el código fuente *es* la extensión), activa el **Modo de desarrollador** → **Cargar descomprimida** → selecciona la carpeta `script-lean-2.5.2`. Esta vía funciona siempre, incluso si el navegador bloquea archivos `.crx` externos.

Verifica la descarga (MD5):

```
61a00846af9f879462dc39109e09fd94  script-lean-2.5.2.zip
8d5cef567cae9c8e1a2f257c3753a767  script-lean-2.5.2.crx
```

## Primer uso

- El popup muestra el sitio actual, los 8 módulos, tus scripts y tus listas de filtros.
- **Custom JS** necesita la opción *Allow User Scripts* del navegador (`chrome://extensions` → Script Lean → Details) — el popup muestra un banner de un clic cuando hace falta. El bloqueo de anuncios funciona sin ello.
- ¿Quedan huecos de anuncios? El módulo **Ads** ya colapsa las cajas vacías; activa **Aggressive** solo si alguna web sigue mostrando basura.

## Capturas de pantalla

| AdBlockBench | TurtleCute | SuperAdBlockTest |
|---|---|---|
| ![AdBlockBench 100%](docs/screenshots/adblockbench-100.jpg) | ![TurtleCute 100%](docs/screenshots/turtlecute-100.jpg) | ![SuperAdBlockTest 482/482](docs/screenshots/superadblocktest-100.jpg) |

## Notas

- Licencia: [MIT](LICENSE).

## Lectura

**[Where Ads Get Cut](https://duydanh9989.github.io/ad-blocking-intervention-points/)** — Cómo funciona realmente el bloqueo de anuncios en la web, y la economía entre pares hacia la que empuja.
