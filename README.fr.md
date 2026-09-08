# Script Lean

**Rapide. Léger. Pages propres.** Bloqueur de publicités ultra-léger + injecteur de JavaScript pour navigateurs Chromium — bloque les publicités avant leur chargement, accélère les pages et se fait oublier.

Langues : [English](README.md) · [Tiếng Việt](README.vi.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [Français](README.fr.md)

## Pourquoi Script Lean

- **Chargement plus rapide** — publicités et traceurs sont bloqués au niveau réseau *avant* leur téléchargement. Rien de lourd ne s'exécute sur la page.
- **Empreinte minuscule** — toute l'extension fait ~80 KB. Pas de bloat en arrière-plan, balayage cosmétique auto-arrêté, moteur de règles natif.
- **Scores maximaux, vérifiables**

  | Test | Résultat |
  |---|---|
  | AdBlockBench | **100%** — Network · Cosmetic · Scriptlet · API |
  | superadblocktest.com | **100%** — 482/482 bloqués |
  | adblock.turtlecute.org | **100%** |

- **Les sites continuent de fonctionner** — le module **Ads** sûr ne touche jamais au fonctionnement de la page ; les motifs larges vivent dans le module **Aggressive** (désactivé par défaut). Les vérifications anti-bot (Cloudflare/DataDome) et les pages bancaires/paiement passent intactes.
- **Difficile à détecter** — les API modifiées conservent leur empreinte native ; le trafic same-site n'est jamais touché, les sites se comportent normalement.
- **8 modules en un clic** — Ads · Analytics · Surrogates · Bypass · Anti-Fingerprint · Privacy · Video · Aggressive (désactivé par défaut).
- **Listes de filtres personnalisées** — collez l'URL de n'importe quelle liste ou écrivez vos propres règles : `||ads.example.com^` pour bloquer, `@@||mysite.com^` pour autoriser. Application instantanée, fonctionne hors ligne.
- **Injection de JavaScript personnalisé** — injectez votre propre JS par site (domaine / motif d'URL / regex), avec planificateur optionnel. Un petit badge affiche le nombre de scripts actifs ; cliquez sur l'icône **#** du popup pour le masquer.
- **Privé par conception** — tout tourne en local. Aucun compte, aucune télémétrie, aucune collecte de données.

## Installation (Chrome / Edge / Brave / Chromium) — 1 minute

1. Téléchargez `releases/script-lean-2.5.2.crx`.
2. Ouvrez `chrome://extensions`.
3. Glissez le fichier `.crx` sur la page → confirmez **Add extension**. Voilà.
4. Épinglez l'icône → cliquez dessus → activez ce qu'il vous faut.

> Plutôt le code source ? Téléchargez `releases/script-lean-2.5.2.zip` et décompressez-le (ou clonez ce dépôt — le code source *est* l'extension), activez le **Mode développeur** → **Charger l'extension non empaquetée** → sélectionnez le dossier `script-lean-2.5.2`. Cette voie fonctionne toujours, même si le navigateur refuse les fichiers `.crx` externes.

Vérifiez le téléchargement (MD5) :

```
61a00846af9f879462dc39109e09fd94  script-lean-2.5.2.zip
8d5cef567cae9c8e1a2f257c3753a767  script-lean-2.5.2.crx
```

## Première utilisation

- Le popup affiche le site actuel, les 8 modules, vos scripts et vos listes de filtres.
- **Custom JS** nécessite l'option *Allow User Scripts* du navigateur (`chrome://extensions` → Script Lean → Details) — le popup affiche une bannière en un clic si nécessaire. Le blocage des publicités fonctionne sans.
- Des emplacements publicitaires vides ? Le module **Ads** replie déjà les boîtes vides ; n'activez **Aggressive** que si un site montre encore des déchets.

## Captures d'écran

| AdBlockBench | TurtleCute | SuperAdBlockTest |
|---|---|---|
| ![AdBlockBench 100%](docs/screenshots/adblockbench-100.jpg) | ![TurtleCute 100%](docs/screenshots/turtlecute-100.jpg) | ![SuperAdBlockTest 482/482](docs/screenshots/superadblocktest-100.jpg) |

## Notes

- Licence : [MIT](LICENSE).

## Lecture

**[Where Ads Get Cut](https://duydanh9989.github.io/ad-blocking-intervention-points/)** — Comment fonctionne réellement le blocage des publicités sur le web, et l’économie de pair à pair vers laquelle il pousse.
