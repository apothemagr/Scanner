import { pool } from '../src/db'
import * as zlib from 'zlib'
import * as https from 'https'
import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env') })

const SITEMAPS = [
  'https://www.apothema.gr/g/skus1_sitemap.xml.gz',
  'https://www.apothema.gr/g/skus2_sitemap.xml.gz',
  'https://www.apothema.gr/g/skus3_sitemap.xml.gz',
]

function fetchGzipped(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, res => {
      const chunks: Buffer[] = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        zlib.gunzip(buf, (err, result) => {
          if (err) reject(err)
          else resolve(result.toString('utf-8'))
        })
      })
      res.on('error', reject)
    }).on('error', reject)
  })
}

function extractUrls(xml: string): { code: string; url: string }[] {
  const results: { code: string; url: string }[] = []
  const regex = /<loc>(https:\/\/www\.apothema\.gr\/[^<]+?-(\d+)-?p)<\/loc>/g
  let match
  while ((match = regex.exec(xml)) !== null) {
    results.push({ url: match[1], code: match[2] })
  }
  return results
}

export async function syncUrls() {
  console.log(`[sync-urls] Έναρξη ${new Date().toISOString()}`)
  let total = 0
  let updated = 0

  for (const sitemapUrl of SITEMAPS) {
    try {
      console.log(`  Κατέβασμα: ${sitemapUrl}`)
      const xml = await fetchGzipped(sitemapUrl)
      const entries = extractUrls(xml)
      total += entries.length
      console.log(`  Βρέθηκαν ${entries.length} URLs`)

      for (const { code, url } of entries) {
        const res = await pool.query(
          `UPDATE products SET site_url = $1 WHERE sku = $2`,
          [url, code]
        )
        if (res.rowCount && res.rowCount > 0) updated++
      }
    } catch (e) {
      console.error(`  Σφάλμα στο ${sitemapUrl}:`, e)
    }
  }

  console.log(`[sync-urls] Ολοκλήρωση — ${updated}/${total} ενημερώθηκαν`)
}

// Εκτέλεση αν τρέχει απευθείας
if (require.main === module) {
  syncUrls().then(() => pool.end()).catch(console.error)
}
