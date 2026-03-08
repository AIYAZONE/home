import { PNG } from 'pngjs'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const PUBLIC_DIR = join(ROOT, 'public')

function clamp01(n) {
  return Math.max(0, Math.min(1, n))
}

function lerp(a, b, t) {
  return Math.round(a + (b - a) * clamp01(t))
}

function setPixel(png, x, y, r, g, b, a = 255) {
  const idx = (png.width * y + x) << 2
  png.data[idx] = r
  png.data[idx + 1] = g
  png.data[idx + 2] = b
  png.data[idx + 3] = a
}

function fillRect(png, x0, y0, w, h, color) {
  const x1 = Math.min(png.width, x0 + w)
  const y1 = Math.min(png.height, y0 + h)
  const startX = Math.max(0, x0)
  const startY = Math.max(0, y0)

  for (let y = startY; y < y1; y++) {
    for (let x = startX; x < x1; x++) {
      setPixel(png, x, y, color.r, color.g, color.b, 255)
    }
  }
}

function drawMark(png, size, color) {
  const x = Math.round(size * 0.29)
  const y = Math.round(size * 0.3)
  const h = Math.round(size * 0.4)
  const stroke = Math.max(6, Math.round(size * 0.075))
  const w = Math.round(size * 0.42)

  const fStemW = stroke
  const fArmH = stroke
  const fArmW = Math.round(w * 0.55)
  const midY = y + Math.round(h * 0.44)

  fillRect(png, x, y, fStemW, h, color)
  fillRect(png, x, y, fArmW, fArmH, color)
  fillRect(png, x, midY, Math.round(fArmW * 0.82), fArmH, color)

  const iX = x + Math.round(w * 0.72)
  fillRect(png, iX, y, fStemW, h, color)
}

function generateIcon(size) {
  const png = new PNG({ width: size, height: size })

  const bg1 = { r: 11, g: 18, b: 32 }
  const bg2 = { r: 25, g: 39, b: 65 }
  const accent = { r: 38, g: 178, b: 242 }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * (size - 1))
      const r = lerp(bg1.r, bg2.r, t)
      const g = lerp(bg1.g, bg2.g, t)
      const b = lerp(bg1.b, bg2.b, t)
      setPixel(png, x, y, r, g, b, 255)
    }
  }

  const pad = Math.round(size * 0.14)
  const stroke = Math.max(2, Math.round(size * 0.06))

  for (let y = pad; y < size - pad; y++) {
    for (let x = pad; x < size - pad; x++) {
      const isBorder =
        x < pad + stroke ||
        x >= size - pad - stroke ||
        y < pad + stroke ||
        y >= size - pad - stroke

      if (isBorder) {
        setPixel(png, x, y, accent.r, accent.g, accent.b, 255)
      }
    }
  }

  drawMark(png, size, accent)

  return PNG.sync.write(png)
}

async function main() {
  await mkdir(PUBLIC_DIR, { recursive: true })

  const out192 = join(PUBLIC_DIR, 'pwa-192.png')
  const out512 = join(PUBLIC_DIR, 'pwa-512.png')

  await writeFile(out192, generateIcon(192))
  await writeFile(out512, generateIcon(512))

  process.stdout.write(`Generated:\n- ${out192}\n- ${out512}\n`)
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
