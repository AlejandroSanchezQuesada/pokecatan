import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dataFile = join(root, 'src', 'engine', 'data.ts');
const outputDir = join(root, 'public', 'assets', 'pokemon');
const licenseFile = join(root, 'public', 'assets', 'PMDCOLLAB-LICENSE.md');
const manifestFile = join(outputDir, 'manifest.json');
const force = process.argv.includes('--force');

const source = {
  repository: 'https://github.com/PMDCollab/SpriteCollab',
  portraits: 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/portrait',
  license: 'CC BY-NC 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by-nc/4.0/',
  licenseFile: 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/LICENSE.md'
};

const data = await readFile(dataFile, 'utf8');
const start = data.indexOf('export const POKEMON_CATALOG');
const end = data.indexOf('const SPECIES_BY_ID');
if (start < 0 || end < 0) throw new Error('No se pudo localizar el catálogo Pokémon en data.ts');
const catalog = data.slice(start, end);
const entries = [...catalog.matchAll(/\{\s*id:\s*(\d+),\s*name:\s*'([^']+)'/g)].map((match) => ({
  id: Number(match[1]),
  name: match[2]
}));
if (entries.length === 0) throw new Error('El catálogo Pokémon está vacío');
if (new Set(entries.map((entry) => entry.id)).size !== entries.length) {
  throw new Error('El catálogo contiene identificadores duplicados');
}

await mkdir(outputDir, { recursive: true });

async function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function isPng(buffer) {
  return buffer.length > 100 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
}

async function existingValid(file) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size < 100) return null;
    const buffer = await readFile(file);
    return isPng(buffer) ? buffer : null;
  } catch {
    return null;
  }
}

async function download(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'pokecatan-web-asset-fetcher/1.0 (fan project)' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} al descargar ${url}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (!isPng(buffer)) throw new Error(`El archivo descargado no es un PNG válido: ${url}`);
  return buffer;
}

const pokemon = [];
let downloaded = 0;
let reused = 0;
for (const entry of entries) {
  const fileName = `${entry.id}.png`;
  const file = join(outputDir, fileName);
  const url = `${source.portraits}/${String(entry.id).padStart(4, '0')}/Normal.png`;
  let buffer = force ? null : await existingValid(file);
  if (buffer) {
    reused += 1;
  } else {
    process.stdout.write(`Descargando ${entry.name} (${entry.id})... `);
    buffer = await download(url);
    await writeFile(file, buffer);
    downloaded += 1;
    process.stdout.write('ok\n');
  }
  pokemon.push({
    id: entry.id,
    name: entry.name,
    file: `assets/pokemon/${fileName}`,
    url,
    bytes: buffer.length,
    sha256: await sha256(buffer)
  });
}

const licensePath = licenseFile;
let licenseBuffer = force ? null : await existingValidLicense(licensePath);
if (!licenseBuffer) {
  process.stdout.write('Descargando licencia PMDCollab... ');
  const response = await fetch(source.licenseFile, {
    headers: { 'User-Agent': 'pokecatan-web-asset-fetcher/1.0 (fan project)' }
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} al descargar la licencia`);
  licenseBuffer = Buffer.from(await response.arrayBuffer());
  await writeFile(licensePath, licenseBuffer);
  process.stdout.write('ok\n');
}

async function existingValidLicense(file) {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size < 1000) return null;
    return await readFile(file);
  } catch {
    return null;
  }
}

const manifest = {
  format: 'pokecatan-assets',
  version: 1,
  generatedBy: 'scripts/fetch-assets.mjs',
  source,
  licenseSha256: await sha256(licenseBuffer),
  pokemon
};
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(
  `Assets listos: ${pokemon.length} retratos (${downloaded} descargados, ${reused} reutilizados), ` +
    `manifiesto ${manifestFile}`
);
