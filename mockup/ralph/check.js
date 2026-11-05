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

    // ---------- 항목 2: 현장 등록 흐름 ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const bag = { errors: [], external: [] };
      watch(page, base, bag);
      await page.goto(base + 'field.html');
      await page.evaluate(() => Store.reset());
      await page.reload();

      // 처음: 단지 고르기 화면
      check('[2] 처음 열면 단지 고르기 화면', await page.isVisible('#view-pick') && !(await page.isVisible('#view-register')));
      check('[2] 단지 12곳 버튼', (await page.locator('#complex-list button').count()) === 12);
      await page.screenshot({ path: path.join(SHOTS, '2-field-pick.png'), fullPage: true });
      const cid = 'c02';
      await page.click(`#complex-list button[data-complex="${cid}"]`);
      check('[2] 단지를 고르면 바로 등록 화면', await page.isVisible('#view-register'));

      // 다시 열면 단지를 기억(고르기 화면 없이 등록 화면)
      await page.reload();
      check('[2] 다시 열면 단지 기억(바로 등록 화면)', await page.isVisible('#view-register') && !(await page.isVisible('#view-pick')));
      const label = await page.textContent('#complex-label');
      check('[2] 상단에 우리 단지 이름 표시', label.includes('푸른숲 2단지'), label);

      // 입력 칸은 사진, 한 줄 두 개뿐(동·호수는 버튼)
      const fields = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('#reg-form input, #reg-form textarea, #reg-form select'));
        return els.map((e) => e.type || e.tagName.toLowerCase());
      });
      check('[2] 입력 칸은 사진·한 줄뿐(연락처 입력 칸 없음)', fields.length === 2 && fields.includes('file') && fields.includes('text'), JSON.stringify(fields));
      check('[2] 처음엔 등록 버튼 비활성', await page.isDisabled('#submit-btn'));

      // 큰 원본 사진 2장 만들기(1600x1200, 900x1400)
      const makePng = (w, h, color) => page.evaluate(([w, h, color]) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h);
        x.fillStyle = '#333'; x.fillRect(w / 4, h / 4, w / 2, h / 2);
        return c.toDataURL('image/png').split(',')[1];
      }, [w, h, color]);
      const p1 = Buffer.from(await makePng(1600, 1200, '#8bc34a'), 'base64');
      const p2 = Buffer.from(await makePng(900, 1400, '#03a9f4'), 'base64');
      await page.setInputFiles('#photo-input', [
        { name: 'a.png', mimeType: 'image/png', buffer: p1 },
        { name: 'b.png', mimeType: 'image/png', buffer: p2 }
      ]);
      await page.waitForFunction(() => document.querySelectorAll('#thumbs img').length === 2, null, { timeout: 5000 });
      check('[2] 사진 2장 한 번에 선택 → 미리보기 2장', (await page.locator('#thumbs img').count()) === 2);

      // 동 → 호 버튼
      const c = await page.evaluate((id) => LH_DATA.findComplex(id), cid);
      const dong = c.dongs[1].dong;
      const unit = c.dongs[1].units[5];
      await page.click(`#dong-list button[data-dong="${dong}"]`);
      check('[2] 동을 누르면 호 버튼 목록', (await page.locator('#ho-list button').count()) === c.dongs[1].units.length);
      await page.click(`#ho-list button[data-ho="${unit.ho}"]`);
      const resText = await page.textContent('#resident');
      const expectPhone = await page.evaluate((p) => LH_DATA.maskPhone(p), unit.resident.phone);
      check('[2] 동·호수 고르면 연락처 자동 표시(마스킹)', resText.includes(expectPhone) && !resText.includes(unit.resident.phone) && !resText.includes(unit.resident.name), resText);

      await page.click('#chips button:nth-child(1)');
      await page.fill('#text-input', '욕실 천장에서 물이 샘');
      check('[2] 세 가지를 채우면 등록 버튼 활성', !(await page.isDisabled('#submit-btn')));

      // 터치 영역 44px 이상, 가로 스크롤 없음
      const small = await page.evaluate(() => Array.from(document.querySelectorAll('#view-register button, #view-register label.btn'))
        .filter((b) => b.offsetParent !== null)
        .map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), w: r.width, h: r.height }; })
        .filter((r) => r.w < 44 || r.h < 44));
      check('[2] 등록 화면 버튼 모두 44px 이상', small.length === 0, JSON.stringify(small));
      const smallFont = await page.evaluate(() => Array.from(document.querySelectorAll('#view-register *'))
        .filter((e) => e.offsetParent !== null && e.childNodes.length && Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))
        .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.textContent.trim().slice(0, 20)));
      check('[2] 등록 화면 글씨 16px 이상', smallFont.length === 0, JSON.stringify(smallFont));
      check('[2] 등록 화면 가로 스크롤 없음(375px)', await noHScroll(page));
      await page.screenshot({ path: path.join(SHOTS, '2-field-register.png'), fullPage: true });

      const before = await page.evaluate(() => Store.list().length);
      await page.click('#submit-btn');
      await page.waitForSelector('#view-done', { state: 'visible' });
      const doneTitle = await page.textContent('#done-title');
      check('[2] 완료 화면 "등록 완료 · 00초" 표시', /^등록 완료 · (\d{2}초|\d+분 \d{2}초)$/.test(doneTitle.trim()), doneTitle);
      check('[2] 완료 화면 가로 스크롤 없음', await noHScroll(page));
      await page.screenshot({ path: path.join(SHOTS, '2-field-done.png'), fullPage: true });

      const saved = await page.evaluate(async () => {
        const stored = JSON.parse(localStorage.getItem(Store.KEY) || '[]');
        const top = Store.list()[0];
        const sizes = await Promise.all(top.photos.map((src) => new Promise((res) => {
          const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([0, 0]); i.src = src;
        })));
        return { count: stored.length, top, inStorage: stored.some((r) => r.id === top.id && r.photos.length === 2), sizes };
      });
      check('[2] 등록된 건이 store에 1건 추가', saved.count === before + 1, saved.count + ' vs ' + before);
      check('[2] 단지·동·호수·내용이 맞게 저장', saved.top.complexId === cid && saved.top.dong === dong && saved.top.ho === unit.ho && saved.top.text.includes('욕실 천장') && saved.top.status === '접수', JSON.stringify({ ...saved.top, photos: saved.top.photos.length }));
      check('[2] 사진 2장이 localStorage에 함께 저장', saved.inStorage);
      check('[2] 사진은 JPEG dataURL', saved.top.photos.every((p) => p.startsWith('data:image/jpeg')));
      check('[2] 사진 긴 변 480px 이하', saved.sizes.every(([w, h]) => w > 0 && Math.max(w, h) <= 480), JSON.stringify(saved.sizes));

      // 한 건 더 등록 → 빈 등록 화면
      await page.click('#again-btn');
      const fresh = await page.evaluate(() => ({ thumbs: document.querySelectorAll('#thumbs img').length, text: document.getElementById('text-input').value, disabled: document.getElementById('submit-btn').disabled }));
      check('[2] 한 건 더 등록 → 빈 등록 화면', fresh.thumbs === 0 && fresh.text === '' && fresh.disabled, JSON.stringify(fresh));

      check('[2] 현장 흐름 콘솔 에러 없음', bag.errors.length === 0, bag.errors.join(' | '));
      check('[2] 현장 흐름 외부 요청 없음', bag.external.length === 0, bag.external.join(' | '));
      await page.evaluate(() => Store.reset());
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
