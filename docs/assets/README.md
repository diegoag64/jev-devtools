# README media

- `jevtools-readme-hero.png`: the root README hero, captured at 2880 × 1640 (2× resolution) from the actual landing page heading, jade text painter, and simulated hierarchical-search diagram. It links to the website. The capture rearranges those elements without changing the landing page or using image generation.

Regenerate from the repository root after `npm ci` and `npx playwright install chromium --only-shell`:

```sh
node scripts/capture-readme-hero.mjs
```

The script starts and closes a loopback Vite server, selects the authored hierarchical flow, disables motion, and fixes the jade painter's time. It uses the root workspace's Vite and Playwright dependencies. Typography follows the landing's system font stack; matching the original macOS capture exactly requires the same fonts and browser version. Pass an output path such as `benchmarks/results/readme-hero/preview.png` for review iterations. The final README image is an intentional documentation asset requested for the README; verification screenshots and logs stay under ignored `benchmarks/results/`.

## Previous demo

- `jev-devtools-demo.mp4`: the complete 28-second recording supplied by the project owner, resized to 1280 × 716 at 30 fps with H.264/yuv420p, CRF 25, and fast-start enabled. About 530 KB, down from the original 8.9 MB. No audio or container metadata.
- `jev-devtools-preview.gif`: despite the retained filename, this is the **complete recording**, not an excerpt. It loops at 1000 × 560 and 8 fps with a 96-color palette; about 1.6 MB. The npm README still embeds it inline.

The MP4 is retained as a documentation asset. The npm README uses absolute URLs to the GIF on `main`; release changes must be merged before publication so those URLs resolve to the reviewed media. None of these media files are bundled in the npm package.

These assets show sample responses. The original recording remains available to the project owner; the documentation copies are optimized for viewing in a README.
