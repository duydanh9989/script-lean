# Script Lean

**Rápido. Leve. Páginas limpas.** Bloqueador de anúncios ultraleve + injetor de JavaScript para navegadores Chromium — bloqueia a publicidade antes de carregar, deixa as páginas mais rápidas e não atrapalha você.

Idiomas: [English](README.md) · [Tiếng Việt](README.vi.md) · [Español](README.es.md) · [Português](README.pt.md) · [Deutsch](README.de.md) · [Français](README.fr.md)

## Por que o Script Lean

- **Carregamento de páginas mais rápido** — anúncios e rastreadores são bloqueados no nível de rede *antes* de serem baixados. Nada pesado roda na página.
- **Pegada mínima** — a extensão inteira tem ~80 KB. Sem processos em segundo plano pesados, varredura cosmética com desligamento automático e motor de regras nativo.
- **Notas máximas, verificáveis**

  | Teste | Resultado |
  |---|---|
  | AdBlockBench | **100%** — Network · Cosmetic · Scriptlet · API |
  | superadblocktest.com | **100%** — 482/482 bloqueados |
  | adblock.turtlecute.org | **100%** |

- **Os sites continuam funcionando** — o módulo **Ads** é seguro e nunca toca na função da página; os padrões amplos ficam no módulo **Aggressive** (desligado por padrão). Verificações anti-bot (Cloudflare/DataDome) e páginas de bancos/pagamentos passam intactas.
- **Difícil de detectar** — as APIs modificadas mantêm a impressão digital nativa; o tráfego do próprio site nunca é tocado, então tudo funciona normalmente.
- **8 módulos de um clique** — Ads · Analytics · Surrogates · Bypass · Anti-Fingerprint · Privacy · Video · Aggressive (desligado por padrão).
- **Listas de filtros personalizadas** — cole a URL de qualquer lista ou escreva suas próprias regras: `||ads.example.com^` para bloquear, `@@||mysite.com^` para permitir. Aplicadas na hora e funcionam offline.
- **Injeção de JavaScript personalizado** — injete seu próprio JS por site (domínio / padrão de URL / regex), com agendador opcional. Um pequeno badge mostra quantos scripts estão ativos; clique no ícone **#** no popup para ocultá-lo.
- **Privado por design** — tudo roda localmente. Sem contas, sem telemetria, sem coleta de dados.

## Instalação (Chrome / Edge / Brave / Chromium) — 1 minuto

1. Baixe `releases/script-lean-2.5.2.crx`.
2. Abra `chrome://extensions`.
3. Arraste o arquivo `.crx` para a página → confirme **Add extension**. Pronto.
4. Fixe o ícone → clique nele → ative o que precisar.

> Prefere o código-fonte? Baixe `releases/script-lean-2.5.2.zip` e descompacte (ou faça `git clone` deste repositório — o código-fonte *é* a extensão), ative o **Modo do desenvolvedor** → **Carregar sem compactação** → selecione a pasta `script-lean-2.5.2`. Este caminho sempre funciona, mesmo se o navegador recusar arquivos `.crx` externos.

Verifique o download (MD5):

```
61a00846af9f879462dc39109e09fd94  script-lean-2.5.2.zip
8d5cef567cae9c8e1a2f257c3753a767  script-lean-2.5.2.crx
```

## Primeiro uso

- O popup mostra o site atual, os 8 módulos, seus scripts e suas listas de filtros.
- **Custom JS** precisa da opção *Allow User Scripts* do navegador (`chrome://extensions` → Script Lean → Details) — o popup mostra um banner de um clique quando necessário. O bloqueio de anúncios funciona sem isso.
- Sobrou espaço de anúncio vazio? O módulo **Ads** já recolhe as caixas vazias; ative o **Aggressive** só se algum site ainda mostrar lixo.

## Capturas de tela

| AdBlockBench | TurtleCute | SuperAdBlockTest |
|---|---|---|
| ![AdBlockBench 100%](docs/screenshots/adblockbench-100.jpg) | ![TurtleCute 100%](docs/screenshots/turtlecute-100.jpg) | ![SuperAdBlockTest 482/482](docs/screenshots/superadblocktest-100.jpg) |

## Notas

- Licença: [MIT](LICENSE).

## Leitura

**[Where Ads Get Cut](https://duydanh9989.github.io/ad-blocking-intervention-points/)** — Como o bloqueio de anúncios na web realmente funciona — e a economia entre pares para a qual ele empurra a web.
