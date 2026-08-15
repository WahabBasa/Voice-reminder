// Renders assets/splash-icon.png from the icon master: same mic glyph, background
// rect dropped so the splash's brand blue shows through the alpha.
// The glyph sits low in the icon master (optical center for a home-screen tile),
// so it is re-centered here — the splash frame has no corner mask to compensate for.
//
// Run: node scripts/render-splash-icon.js

const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const MASTER = path.join(ROOT, "assets", "branding", "icon-mic-face.svg");
const OUT = path.join(ROOT, "assets", "splash-icon.png");
const SIZE = 1024;

// The full-bleed background rect — the only element the splash drops.
const BACKGROUND_RECT = /<rect\s+width="1024"\s+height="1024"[^>]*\/>/;

const master = fs.readFileSync(MASTER, "utf8");
const openTag = master.slice(0, master.indexOf(">") + 1);
const body = master.slice(master.indexOf(">") + 1, master.lastIndexOf("</svg>"));

if (!BACKGROUND_RECT.test(body)) {
  throw new Error(`No 1024x1024 background rect found in ${MASTER}`);
}
const glyph = body.replace(BACKGROUND_RECT, "");

function svgWithOffset(dx, dy) {
  return `${openTag}<g transform="translate(${dx} ${dy})">${glyph}</g></svg>`;
}

function render(dx, dy) {
  return sharp(Buffer.from(svgWithOffset(dx, dy)))
    .resize(SIZE, SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

// Bounding box of everything with any opacity at all.
async function alphaBounds(png) {
  const { data, info } = await sharp(png)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * info.channels + 3] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("Rendered glyph is fully transparent");
  return { minX, minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

async function main() {
  const probe = await alphaBounds(await render(0, 0));
  const dx = Math.round((SIZE - probe.width) / 2 - probe.minX);
  const dy = Math.round((SIZE - probe.height) / 2 - probe.minY);

  const out = await render(dx, dy);
  fs.writeFileSync(OUT, out);

  const meta = await sharp(OUT).metadata();
  const bounds = await alphaBounds(out);
  console.log(`${path.relative(ROOT, OUT)}  ${meta.width}x${meta.height} alpha=${meta.hasAlpha}`);
  console.log(`glyph ${bounds.width}x${bounds.height} at (${bounds.minX}, ${bounds.minY})`);
  console.log(
    `padding  left=${bounds.minX} right=${SIZE - bounds.minX - bounds.width} ` +
      `top=${bounds.minY} bottom=${SIZE - bounds.minY - bounds.height}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
