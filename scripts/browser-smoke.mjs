import { existsSync } from 'node:fs';
import { chromium } from 'playwright-core';

const url = process.env.POKECATAN_URL ?? 'http://localhost:4173/';
const executablePath =
  process.env.BROWSER_PATH ??
  [
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'
  ].find((candidate) => existsSync(candidate));

if (!executablePath) throw new Error('No se encontró Edge ni Chrome para la prueba de navegador.');

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
const externalRequests = [];
page.on('request', (request) => {
  const requestUrl = request.url();
  if (/^(data|blob):/.test(requestUrl)) return;
  const hostname = new URL(requestUrl).hostname;
  if (hostname !== '127.0.0.1' && hostname !== 'localhost') externalRequests.push(requestUrl);
});
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

try {
  await page.goto(url, { waitUntil: 'networkidle' });
  if ((await page.locator('.menu-screen').count()) !== 1) throw new Error('No se mostró el menú principal.');

  await page.getByRole('radio', { name: /multijugador local/i }).click();
  await page.getByRole('button', { name: /comenzar partida/i }).click();
  await page.locator('.gate-screen').waitFor({ state: 'visible' });
  if (!(await page.locator('.gate-screen').innerText()).includes('Pasa el dispositivo')) {
    throw new Error('La pantalla de privacidad local no muestra el aviso esperado.');
  }
  if ((await page.locator('.player-card').count()) !== 4) {
    throw new Error('Una partida local de 2 humanos debe completar la mesa con 4 jugadores.');
  }

  await page.locator('.gate-card .pixel-button').click();
  await page.locator('.vertex-hit.candidate').first().waitFor({ state: 'visible' });
  const vertexCandidates = await page.locator('.vertex-hit.candidate').count();
  if (vertexCandidates === 0) throw new Error('No hay cruces legales durante la colocación inicial.');

  await page.locator('.vertex-hit.candidate').first().click({ force: true });
  await page.locator('.edge-candidate').first().waitFor({ state: 'visible' });
  const edgeCandidates = await page.locator('.edge-candidate').count();
  if (edgeCandidates === 0) throw new Error('No hay carreteras legales tras colocar el poblado.');

  await page.locator('.edge-candidate .edge-hit').first().click({ force: true });
  await page.locator('.gate-screen').waitFor({ state: 'visible', timeout: 5000 });

  const saved = await page.evaluate(() => localStorage.getItem('pokecatan.autosave.v1') !== null);
  if (!saved) throw new Error('El autoguardado no se escribió en localStorage.');

  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /reanudar/i }).click();
  await page.locator('.game-screen').waitFor({ state: 'visible' });
  await page.locator('.gate-screen').waitFor({ state: 'visible', timeout: 5000 });

  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('pokecatan.autosave.v1'));
    const state = raw.state;
    state.phase = 'action';
    state.turn = 1;
    state.currentPlayerIndex = 0;
    state.pendingTrade = {
      id: 'trade-smoke',
      fromPlayerId: 0,
      toPlayerId: 'all',
      give: { wood: 1, clay: 0, wool: 0, wheat: 0, ore: 0 },
      receive: { wood: 0, clay: 1, wool: 0, wheat: 0, ore: 0 },
      rejectedBy: []
    };
    state.players[0].resources = { wood: 2, clay: 0, wool: 0, wheat: 0, ore: 0 };
    state.players[1].resources = { wood: 0, clay: 2, wool: 0, wheat: 0, ore: 0 };
    localStorage.setItem('pokecatan.autosave.v1', JSON.stringify(raw));
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /reanudar/i }).click();
  await page.locator('.gate-screen').waitFor({ state: 'visible', timeout: 5000 });
  if (!(await page.locator('.gate-screen').innerText()).includes('oferta de intercambio')) {
    throw new Error('La pantalla de privacidad no anuncia la oferta pendiente.');
  }
  await page.locator('.gate-card .pixel-button').click();
  await page.getByRole('dialog').filter({ hasText: 'Oferta de intercambio' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /^aceptar$/i }).click();
  await page.waitForTimeout(800);
  const tradeResult = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('pokecatan.autosave.v1'));
    return {
      pending: raw.state.pendingTrade !== null,
      proposer: raw.state.players[0].resources,
      receiver: raw.state.players[1].resources
    };
  });
  if (tradeResult.pending || tradeResult.proposer.wood !== 1 || tradeResult.receiver.clay !== 1) {
    throw new Error('La oferta a todos no se resolvió correctamente con un humano y una IA pendientes.');
  }
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByRole('radio', { name: /individual/i }).click();
  await page.getByRole('button', { name: /comenzar partida/i }).click();
  await page.locator('.game-screen').waitFor({ state: 'visible' });

  async function placeSettlementAndRoad() {
    await page.locator('.vertex-hit.candidate').first().waitFor({ state: 'visible', timeout: 30000 });
    await page.locator('.vertex-hit.candidate').first().click({ force: true });
    await page.locator('.edge-candidate .edge-hit').first().waitFor({ state: 'visible', timeout: 10000 });
    await page.locator('.edge-candidate .edge-hit').first().click({ force: true });
  }

  await placeSettlementAndRoad();
  await placeSettlementAndRoad();
  await page.waitForFunction(
    () => document.querySelector('.phase-badge')?.textContent?.toLowerCase().includes('tirada'),
    undefined,
    { timeout: 30000 }
  );

  await page.getByRole('button', { name: /lanzar dados/i }).click();
  await page.waitForTimeout(1200);

  const discardModal = page.locator('.modal').filter({ hasText: 'Descarte de' });
  if ((await discardModal.count()) > 0) {
    const requiredText = (await discardModal.innerText()).match(/descartar exactamente\s+(\d+)/i);
    const required = Number(requiredText?.[1] ?? 0);
    const addButtons = page.getByRole('button', { name: /añadir/i });
    for (let i = 0; i < required; i++) {
      const total = await addButtons.count();
      for (let index = 0; index < total; index++) {
        if (await addButtons.nth(index).isEnabled()) {
          await addButtons.nth(index).click();
          break;
        }
      }
    }
    await page.getByRole('button', { name: /confirmar descarte/i }).click();
    await page.waitForTimeout(500);
  }

  if ((await page.locator('.hex-candidate').count()) > 0) {
    await page.locator('.hex-candidate').first().click({ force: true });
    await page.waitForTimeout(300);
    if ((await page.locator('.robber-target').count()) > 0) {
      await page.locator('.robber-target').first().click();
    }
    await page.waitForTimeout(500);
  }

  await page.waitForFunction(
    () => document.querySelector('.phase-badge')?.textContent?.toLowerCase().includes('acciones'),
    undefined,
    { timeout: 10000 }
  );

  await page.getByRole('button', { name: /^banco$/i }).click();
  await page.getByRole('heading', { name: /comercio con el banco/i }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /cancelar/i }).click();

  await page.locator('.hex').first().click({ force: true });
  await page.getByRole('dialog').filter({ hasText: 'Ficha' }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /cerrar/i }).click();

  await page.getByRole('button', { name: /menú/i }).click();
  await page.getByRole('heading', { name: /pausa y opciones/i }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /reglas y ayuda/i }).click();
  await page.getByRole('heading', { name: /cómo jugar/i }).waitFor({ state: 'visible' });
  await page.getByRole('button', { name: /cerrar/i }).click();
  await page.getByRole('button', { name: /terminar turno/i }).click();
  await page.waitForTimeout(1200);

  if (errors.length > 0) throw new Error(`Errores de navegador:\n${errors.join('\n')}`);
  if (externalRequests.length > 0) {
    throw new Error(`La partida solicitó recursos externos:\n${externalRequests.join('\n')}`);
  }
  console.log(`OK: menú, 4 jugadores locales, privacidad, ${vertexCandidates} cruces y ${edgeCandidates} carreteras legales, autoguardado, reanudación, oferta a todos con humano+IA, recursos locales, turno completo, banco, hexágono, pausa y tutorial.`);
} finally {
  await browser.close();
}

