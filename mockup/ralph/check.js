/* 목업 자동 검사. 실행: node mockup/ralph/check.js
 * Node 내장 http로 mockup/을 서빙하고 Playwright로 검사합니다.
 * 각 반복은 검사를 "추가"만 합니다(기존 검사 삭제 금지). */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.json': 'application/json', '.md': 'text/markdown; charset=utf-8'
};

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(ROOT, p);
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, buf) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
      res.end(buf);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail && !ok ? '  -> ' + detail : ''));
}

// 페이지마다 콘솔 에러·페이지 에러·외부 요청을 수집
function watch(page, base, bag) {
  page.on('console', (m) => { if (m.type() === 'error') bag.errors.push(m.text()); });
  page.on('pageerror', (e) => bag.errors.push(String(e)));
  page.on('request', (r) => {
    const u = r.url();
    if (!u.startsWith(base) && !u.startsWith('data:') && !u.startsWith('blob:')) bag.external.push(u);
  });
}

async function noHScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}

(async () => {
  const server = await serve();
  const base = 'http://127.0.0.1:' + server.address().port + '/';
  const browser = await chromium.launch();
  try {
    // ---------- 항목 1: 뼈대와 가짜 데이터 ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const pages = [['index.html', 1280], ['field.html', 375], ['hq.html', 1280]];
      for (const [name, width] of pages) {
        const page = await ctx.newPage();
        await page.setViewportSize({ width, height: 800 });
        const bag = { errors: [], external: [] };
        watch(page, base, bag);
        const resp = await page.goto(base + name, { waitUntil: 'load' });
        await page.waitForTimeout(200);
        check(`[1] ${name} 열림`, resp && resp.status() === 200, resp && resp.status());
        check(`[1] ${name} 콘솔 에러 없음`, bag.errors.length === 0, bag.errors.join(' | '));
        check(`[1] ${name} 외부 요청 없음`, bag.external.length === 0, bag.external.join(' | '));
        check(`[1] ${name} 가로 스크롤 없음(${width}px)`, await noHScroll(page));
        await page.screenshot({ path: path.join(SHOTS, `1-${name.replace('.html', '')}.png`), fullPage: true });
        await page.close();
      }

      const page = await ctx.newPage();
      await page.goto(base + 'index.html');
      const info = await page.evaluate(() => {
        const list = Store.list();
        const stored = JSON.parse(localStorage.getItem(Store.KEY) || '[]');
        const ids = new Set(LH_DATA.complexes.map((c) => c.id));
        const perComplex = {};
        list.forEach((r) => { perComplex[r.complexId] = (perComplex[r.complexId] || 0) + 1; });
        const statuses = {};
        list.forEach((r) => { statuses[r.status] = (statuses[r.status] || 0) + 1; });
        const validUnits = list.every((r) => !!LH_DATA.findResident(r.complexId, r.dong, r.ho));
        const allPhotosInline = list.every((r) => r.photos.length > 0 && r.photos.every((p) => p.startsWith('data:image/')));
        const names = LH_DATA.complexes.map((c) => c.name);
        const unitCounts = LH_DATA.complexes.map((c) => c.dongs.reduce((s, d) => s + d.units.length, 0));
        const res = LH_DATA.findResident(list[0].complexId, list[0].dong, list[0].ho);
        const spanDays = (Math.max(...list.map((r) => r.createdAt)) - Math.min(...list.map((r) => r.createdAt))) / LH_DATA.DAY;
        return {
          count: list.length, storedCount: stored.length, complexCount: LH_DATA.complexes.length,
          uniqueNames: new Set(names).size, allKnown: list.every((r) => ids.has(r.complexId)),
          perComplex, statuses, validUnits, allPhotosInline, minUnits: Math.min(...unitCounts),
          maskedName: LH_DATA.maskName(res.name), maskedPhone: LH_DATA.maskPhone(res.phone), spanDays
        };
      });
      check('[1] 단지 12곳, 이름 중복 없음', info.complexCount === 12 && info.uniqueNames === 12, JSON.stringify(info));
      check('[1] 단지마다 동·호수 목록 있음', info.minUnits >= 10, info.minUnits);
      check('[1] 시드 접수 40건 내외(35~45)', info.count >= 35 && info.count <= 45, info.count);
      check('[1] 시드가 localStorage에 저장됨', info.storedCount === info.count, info.storedCount);
      check('[1] 12곳 모두 시드 접수 있음', Object.keys(info.perComplex).length === 12 && info.allKnown, JSON.stringify(info.perComplex));
      check('[1] 세 가지 상태가 모두 섞여 있음', ['접수', '업체 배정', '보수 완료'].every((s) => info.statuses[s] > 0), JSON.stringify(info.statuses));
      check('[1] 날짜가 고르게 퍼짐(20일 이상 범위)', info.spanDays >= 20, info.spanDays);
      check('[1] 모든 접수가 실제 동·호수를 가리킴', info.validUnits);
      check('[1] 사진이 인라인 자리표시(외부 파일 없음)', info.allPhotosInline);
      check('[1] 이름 마스킹 형식(김○○)', /^.○+$/.test(info.maskedName), info.maskedName);
      check('[1] 연락처 마스킹 형식(010-****-1234)', /^010-\*{4}-\d{4}$/.test(info.maskedPhone), info.maskedPhone);

      // store 동작: 추가·상태 변경·초기화
      const ops = await page.evaluate(() => {
        const before = Store.list().length;
        const c = LH_DATA.complexes[0];
        const added = Store.add({ complexId: c.id, dong: c.dongs[0].dong, ho: c.dongs[0].units[0].ho, text: '검사용', photos: [] });
        const afterAdd = Store.list().length;
        const top = Store.list()[0].id === added.id;
        const changed = Store.setStatus(added.id, '업체 배정');
        const persisted = JSON.parse(localStorage.getItem(Store.KEY)).find((r) => r.id === added.id).status;
        const bad = Store.setStatus(added.id, '없는 상태');
        Store.reset();
        const afterReset = Store.list().length;
        const stillThere = Store.list().some((r) => r.id === added.id);
        return { before, afterAdd, top, changed: changed && changed.status, persisted, bad, afterReset, stillThere };
      });
      check('[1] store.add 후 1건 늘고 맨 위에 옴', ops.afterAdd === ops.before + 1 && ops.top, JSON.stringify(ops));
      check('[1] store.setStatus가 저장소에 반영', ops.changed === '업체 배정' && ops.persisted === '업체 배정', JSON.stringify(ops));
      check('[1] 잘못된 상태는 거부', ops.bad === null);
      check('[1] store.reset 후 시드 건수로 돌아감', ops.afterReset === ops.before && !ops.stillThere, JSON.stringify(ops));

      // localStorage가 막혀도 에러 없이 동작
      const blocked = await browser.newContext();
      await blocked.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
      });
      const bp = await blocked.newPage();
      const bbag = { errors: [], external: [] };
      watch(bp, base, bbag);
      await bp.goto(base + 'hq.html');
      const bcount = await bp.evaluate(() => Store.list().length);
      check('[1] localStorage 막혀도 에러 없이 시드 표시', bbag.errors.length === 0 && bcount >= 35, bbag.errors.join(' | ') + ' count=' + bcount);
      await blocked.close();
      await ctx.close();
    }
  } catch (e) {
    check('검사 실행 중 예외 없음', false, e && e.stack);
  } finally {
    await browser.close();
    server.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} 통과`);
  process.exit(failed.length ? 1 : 0);
})();
