import { ImageResponse } from 'next/og'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const alt = 'BSV Teranode Testnet Faucet'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

// Share-card image: the white BSV Blockchain lockup centered on the brand navy.
// Text-free on purpose (no font dependency); the descriptive copy comes from the
// og:title / og:description meta tags.
export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), 'public/brand/bsv-stacked-white.png'))
  const src = `data:image/png;base64,${logo.toString('base64')}`
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background:
            'radial-gradient(900px 520px at 12% -12%, #3a3ecf, transparent 60%), radial-gradient(900px 560px at 100% 0%, #003fff, transparent 55%), #1b1ea9',
        }}
      >
        {/* 2173x677 → keep aspect at width 560 */}
        <img src={src} width={560} height={174} alt="" />
      </div>
    ),
    size
  )
}
