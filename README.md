# Infinite Labs

Design write-ups for my projects, as a retro terminal-style site:
**<https://infinite-simplex.github.io/InfiniteLabs/>**

Each page covers what a project is, the tradeoffs behind its design, and the
measurements, with the machine and caveats written next to the numbers.

| Page | Project |
|---|---|
| [DisruptorExchange Core](https://infinite-simplex.github.io/InfiniteLabs/#DisruptorExchangeCore) | A Disruptor-style exchange core: sequenced ingress, replicated leader-elected matching, a measurement path. C++20. |
| [EventContractLOB](https://infinite-simplex.github.io/InfiniteLabs/#EventContractLOB) | A limit order book for binary-outcome event contracts, speaking NASDAQ OUCH 4.2. C++20. |
| [BatchGPU](https://infinite-simplex.github.io/InfiniteLabs/#BatchGPU) | An hourly batch auction for GPU compute, cleared by integer network simplex. C++20. |
| [PokeWatt](https://infinite-simplex.github.io/InfiniteLabs/#PokeWatt) | A Pokémon game controlled by a bike power meter. Python, pygame. |

The source for the first three is at [github.com/infinite-simplex](https://github.com/infinite-simplex).

## Running it locally

A static site with no framework. Project pages are fetched at runtime, so serve
it over HTTP rather than opening the file:

```bash
python3 -m http.server
# open http://localhost:8000/index.src.html
```

`index.html` is generated and committed: `build.mjs` minifies the CSS and JS and
inlines them, with the font, so the first paint is one request. After editing
`index.src.html`, `styles.css` or `script.js`, rebuild it:

```bash
npm ci
npm run build
```

To add a project, add an entry to `projectsData` in `script.js` and a page in
`projects/`.
