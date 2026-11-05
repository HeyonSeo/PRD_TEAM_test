/* 목업 자동 검사. 실행: node mockup/ralph/check.js
 * Node 내장 http로 mockup/을 서빙하고 Playwright로 검사합니다.
 * 각 반복은 검사를 "추가"만 합니다(기존 검사 삭제 금지).
 * 새 검사는 mockup/ralph/trace.js에서 docs/requirements.md의 요구사항 ID에 연결해야 합니다. */
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

// 요구사항 연결: 테스트 이름 → 요구사항 ID (docs/requirements.md, mockup/ralph/trace.js)
const TRACE = require('./trace.js');
const DOCS = path.resolve(ROOT, '..', 'docs');
function reqsOf(name) {
  const ids = new Set();
  for (const [re, list] of TRACE) if (re.test(name)) list.forEach((id) => ids.add(id));
  return [...ids].sort();
}

const results = [];
function check(name, ok, detail) {
  const reqs = reqsOf(name);
  results.push({ name, ok: !!ok, detail, reqs });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (reqs.length ? '  {' + reqs.join(', ') + '}' : '') +
    (detail && !ok ? '  -> ' + detail : ''));
}

// docs/requirements.md에서 요구사항 ID·제목·상태를 읽음
function loadRequirements() {
  const md = fs.readFileSync(path.join(DOCS, 'requirements.md'), 'utf8').split('\n');
  const reqs = [];
  let cur = null;
  for (const line of md) {
    const h = line.match(/^### ([A-Z]+(?:-[A-Z]+)?-\d{2}) (.+)$/);
    if (h) { cur = { id: h[1], title: h[2].trim(), status: '' }; reqs.push(cur); continue; }
    const st = line.match(/^- \*\*상태\*\*: (.+)$/);
    if (st && cur && !cur.status) cur.status = st[1].trim();
    const rec = line.match(/^- \*\*기록\*\*: (.+)$/);
    if (rec && cur) cur.record = rec[1].trim();
  }
  return reqs;
}

// GitHub 제목 앵커 규칙
function slug(t) { return t.toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, '').replace(/\s/g, '-'); }

// 추적성 검사 + docs/traceability.md 생성
function traceability() {
  const reqs = loadRequirements();
  const byId = new Map(reqs.map((r) => [r.id, r]));
  const problems = [];
  const STATUSES = ['충족', '미충족', '범위 확인', '수동', '수동 통과', '범위 밖'];
  reqs.forEach((r) => { if (!STATUSES.includes(r.status)) problems.push(`${r.id}: 상태 값이 없거나 잘못됨(${r.status || '없음'})`); });
  TRACE.forEach(([re, list]) => list.forEach((id) => { if (!byId.has(id)) problems.push(`trace.js ${re} → 문서에 없는 ID ${id}`); }));
  results.filter((t) => !t.reqs.length).forEach((t) => problems.push(`요구사항에 연결되지 않은 테스트: ${t.name}`));

  const tests = new Map(reqs.map((r) => [r.id, []]));
  results.forEach((t) => t.reqs.forEach((id) => tests.has(id) && tests.get(id).push(t)));
  reqs.forEach((r) => {
    const ts = tests.get(r.id);
    if (r.status === '충족' && !ts.length) problems.push(`${r.id}: 충족인데 연결된 테스트가 없음`);
    if (r.status === '충족' && ts.some((t) => !t.ok)) problems.push(`${r.id}: 충족인데 실패한 테스트가 있음`);
    if (r.status === '수동 통과' && !r.record) problems.push(`${r.id}: 수동 통과인데 기록 링크(- **기록**:)가 없음`);
  });

  const icon = (r, ts) => {
    if (r.status === '충족') return ts.length && ts.every((t) => t.ok) ? '✅' : '❌';
    return { '미충족': '⬜', '범위 확인': '⚠️', '수동': '👤', '수동 통과': '✅', '범위 밖': '➖' }[r.status] || '?';
  };
  const out = [];
  out.push('# 요구사항 추적표');
  out.push('');
  out.push('> 자동 생성 파일입니다. 직접 고치지 마세요. `node mockup/ralph/check.js`를 실행하면 다시 만들어집니다.');
  out.push('> 요구사항 정의: [requirements.md](requirements.md) · 연결 규칙: [trace.js](../mockup/ralph/trace.js) · 테스트: [check.js](../mockup/ralph/check.js)');
  out.push('');
  const passed = results.filter((t) => t.ok).length;
  out.push(`- 테스트 ${passed}/${results.length} 통과 · 요구사항 ${reqs.length}개 · 추적성 문제 ${problems.length}건`);
  out.push('- 표시: ✅ 충족·테스트 통과 또는 수동 검증 통과 · ❌ 테스트 없음 또는 실패 · ⚠️ 범위 확인 필요 · ⬜ 미충족 · 👤 수동 검증 대기 · ➖ 범위 밖');
  out.push('');
  out.push('## 요약');
  out.push('');
  out.push('| ID | 요구사항 | 상태 | 테스트 수 | 판정 |');
  out.push('|---|---|---|---|---|');
  reqs.forEach((r) => {
    const ts = tests.get(r.id);
    out.push(`| [${r.id}](requirements.md#${slug(r.id + ' ' + r.title)}) | ${r.title} | ${r.status} | ${ts.length} | ${icon(r, ts)} |`);
  });
  const open = reqs.filter((r) => ['미충족', '범위 확인', '수동'].includes(r.status));
  out.push('');
  out.push('## 남은 일');
  out.push('');
  if (!open.length) out.push('없음');
  open.forEach((r) => out.push(`- ${icon(r, tests.get(r.id))} **${r.id}** ${r.title} (${r.status})`));
  if (problems.length) {
    out.push('');
    out.push('## 추적성 문제');
    out.push('');
    problems.forEach((p) => out.push('- ' + p));
  }
  out.push('');
  out.push('## 요구사항별 테스트');
  reqs.filter((r) => tests.get(r.id).length).forEach((r) => {
    out.push('');
    out.push(`### ${r.id} ${r.title}`);
    out.push('');
    tests.get(r.id).forEach((t) => out.push(`- ${t.ok ? '✅' : '❌'} ${t.name}`));
  });
  out.push('');
  fs.writeFileSync(path.join(DOCS, 'traceability.md'), out.join('\n'));
  return problems;
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

    // ---------- 항목 3: 현장 접수 목록과 상태 변경 ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 812 }, hasTouch: true, isMobile: true });
      const page = await ctx.newPage();
      const bag = { errors: [], external: [] };
      watch(page, base, bag);
      await page.goto(base + 'field.html');
      await page.evaluate(() => { Store.reset(); Store.setMyComplex('c05'); });
      await page.reload();

      check('[3] 등록 화면에 접수 목록 탭 있음', await page.isVisible('#tab-list'));
      await page.click('#tab-list');
      check('[3] 탭 누르면 접수 목록 화면', await page.isVisible('#view-list') && !(await page.isVisible('#view-register')));

      const expected = await page.evaluate(() => Store.list().filter((r) => r.complexId === 'c05').map((r) => r.id));
      const shownIds = await page.$$eval('#report-list .report', (els) => els.map((e) => e.dataset.id));
      check('[3] 우리 단지 접수만 최근 순으로 표시', JSON.stringify(shownIds) === JSON.stringify(expected) && expected.length > 0, JSON.stringify({ shownIds, expected }));

      // 전화 온 세대: 우리 단지의 '접수' 상태 건 하나를 동·호수로 찾기
      const target = await page.evaluate(() => {
        const c = LH_DATA.findComplex('c05');
        const r = Store.add({ complexId: 'c05', dong: c.dongs[2].dong, ho: c.dongs[2].units[7].ho, text: '검사용 현관문 안 닫힘', photos: [] });
        return { id: r.id, dong: r.dong, ho: r.ho };
      });
      await page.click('#tab-register');
      await page.click('#tab-list');
      await page.fill('#search-input', `${target.dong} ${target.ho}`);
      let found = await page.$$eval('#report-list .report', (els) => els.map((e) => e.dataset.id));
      check('[3] "동 호" 검색으로 그 세대 건만 나옴', found.includes(target.id) && found.length >= 1 &&
        (await page.evaluate((ids) => ids.every((id) => { const r = Store.list().find((x) => x.id === id); return r.complexId === 'c05'; }), found)), JSON.stringify(found));
      const allMatch = await page.evaluate(([ids, t]) => ids.every((id) => { const r = Store.list().find((x) => x.id === id); return r.dong === t.dong && r.ho === t.ho; }), [found, target]);
      check('[3] 검색 결과가 모두 그 동·호수', allMatch);
      await page.fill('#search-input', `${target.dong}동 ${target.ho}호`);
      found = await page.$$eval('#report-list .report', (els) => els.map((e) => e.dataset.id));
      check('[3] "101동 1203호" 형태로도 찾음', found.includes(target.id));
      await page.fill('#search-input', `${target.ho}`);
      found = await page.$$eval('#report-list .report', (els) => els.map((e) => e.dataset.id));
      check('[3] 호수만 입력해도 찾음', found.includes(target.id));
      await page.fill('#search-input', '999 9999');
      check('[3] 없는 동·호수면 안내 문구', (await page.locator('#report-list .report').count()) === 0 && (await page.textContent('#report-list')).includes('없습니다'));
      await page.fill('#search-input', `${target.dong} ${target.ho}`);

      const card = page.locator(`#report-list .report[data-id="${target.id}"]`);
      const masked = await card.textContent();
      const raw = await page.evaluate((t) => LH_DATA.findResident('c05', t.dong, t.ho), target);
      check('[3] 목록에 입주민 연락처 마스킹 표시', masked.includes(await page.evaluate((p) => LH_DATA.maskPhone(p), raw.phone)) && !masked.includes(raw.phone) && !masked.includes(raw.name), masked);
      check('[3] 상태와 경과 일수 표시', /접수/.test(masked) && /(오늘|\d+일째)/.test(masked), masked);
      await page.screenshot({ path: path.join(SHOTS, '3-field-list-search.png'), fullPage: true });

      // 버튼 한 번으로 접수 → 업체 배정 → 보수 완료
      await card.locator('.next-btn').click();
      let st = await page.evaluate((id) => JSON.parse(localStorage.getItem(Store.KEY)).find((r) => r.id === id).status, target.id);
      check('[3] 버튼 한 번에 업체 배정으로 바뀌고 store 반영', st === '업체 배정', st);
      check('[3] 화면 배지도 업체 배정', (await card.locator('.badge').textContent()).trim() === '업체 배정');
      check('[3] 상태 바꾼 뒤에도 검색 유지', (await page.inputValue('#search-input')) === `${target.dong} ${target.ho}` && (await card.count()) === 1);
      await card.locator('.next-btn').click();
      st = await page.evaluate((id) => JSON.parse(localStorage.getItem(Store.KEY)).find((r) => r.id === id).status, target.id);
      check('[3] 한 번 더 누르면 보수 완료로 store 반영', st === '보수 완료', st);
      check('[3] 보수 완료 건은 더 누를 버튼 없음', (await card.locator('.next-btn').count()) === 0 && (await card.textContent()).includes('처리 끝'));
      const hist = await page.evaluate((id) => Store.list().find((r) => r.id === id).history.map((h) => h.status), target.id);
      check('[3] 상태 이력이 순서대로 남음', JSON.stringify(hist) === JSON.stringify(['접수', '업체 배정', '보수 완료']), JSON.stringify(hist));

      // 경과 일수: 상태 바뀐 날 기준 "n일째" (멈춤 경고는 #7에서 제거)
      await page.fill('#search-input', '');
      const ages = await page.evaluate(() => {
        const now = Date.now();
        return Array.from(document.querySelectorAll('#report-list .report')).map((el) => {
          const r = Store.list().find((x) => x.id === el.dataset.id);
          const meta = el.querySelector('.report-meta');
          return { status: r.status, days: Store.daysSince(r.statusAt, now), shown: +meta.dataset.days, text: meta.textContent };
        });
      });
      check('[3] 표시된 경과 일수가 상태 바뀐 날 기준', ages.every((a) => a.shown === a.days), JSON.stringify(ages));
      const longOpen = ages.filter((a) => a.status !== '보수 완료' && a.days >= 7);
      check('[9] 현장: 7일 넘은 진행 중 건에도 멈춤 경고 없이 경과 일수만 표시', longOpen.length > 0 && longOpen.every((a) => !/멈춤|⚠/.test(a.text) && a.text.includes(a.days + '일째')), JSON.stringify(longOpen));

      // 새로고침해도 바뀐 상태 유지
      await page.reload();
      await page.click('#tab-list');
      await page.fill('#search-input', `${target.dong} ${target.ho}`);
      check('[3] 새로고침 후에도 보수 완료 유지', (await page.locator(`#report-list .report[data-id="${target.id}"] .badge`).textContent()).trim() === '보수 완료');

      // 상태로 거르기
      await page.fill('#search-input', '');
      await page.click('#status-filter button[data-filter="접수"]');
      const onlyNew = await page.evaluate(() => Array.from(document.querySelectorAll('#report-list .report .badge')).every((b) => b.textContent.trim() === '접수'));
      check('[3] 상태 버튼으로 거르기', onlyNew);
      await page.click('#status-filter button[data-filter="전체"]');

      // 접근성: 버튼 44px, 글씨 16px, 가로 스크롤 없음
      const small = await page.evaluate(() => Array.from(document.querySelectorAll('#view-list button, #tabs button'))
        .filter((b) => b.offsetParent !== null)
        .map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim(), w: r.width, h: r.height }; })
        .filter((r) => r.w < 44 || r.h < 44));
      check('[3] 목록 화면 버튼 모두 44px 이상', small.length === 0, JSON.stringify(small));
      const smallFont = await page.evaluate(() => Array.from(document.querySelectorAll('#view-list *, #tabs *'))
        .filter((e) => e.offsetParent !== null && Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))
        .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.textContent.trim().slice(0, 20)));
      check('[3] 목록 화면 글씨 16px 이상', smallFont.length === 0, JSON.stringify(smallFont));
      check('[3] 목록 화면 가로 스크롤 없음(375px)', await noHScroll(page));
      await page.screenshot({ path: path.join(SHOTS, '3-field-list.png'), fullPage: true });

      // 등록 완료 화면에서 목록으로 바로 가기
      check('[3] 완료 화면에 접수 목록 보기 버튼', (await page.locator('#view-done #to-list-btn').count()) === 1);

      check('[3] 목록 흐름 콘솔 에러 없음', bag.errors.length === 0, bag.errors.join(' | '));
      check('[3] 목록 흐름 외부 요청 없음', bag.external.length === 0, bag.external.join(' | '));
      await page.evaluate(() => Store.reset());
      await ctx.close();
    }
    // ---------- 항목 4: 본부 대시보드 ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
      const hq = await ctx.newPage();
      const bag = { errors: [], external: [] };
      watch(hq, base, bag);
      await hq.goto(base + 'hq.html');
      await hq.evaluate(() => Store.reset());
      await hq.reload();

      check('[4] 단지 카드 12개', (await hq.locator('#complex-cards .cx-card').count()) === 12);
      const cardInfo = await hq.evaluate(() => {
        const now = Date.now();
        const all = Store.list();
        return LH_DATA.complexes.map((c) => {
          const mine = all.filter((r) => r.complexId === c.id);
          const exp = {
            total: mine.length,
            open: mine.filter((r) => r.status !== '보수 완료').length,
            done: mine.filter((r) => r.status === '보수 완료').length
          };
          const el = document.querySelector(`#complex-cards .cx-card[data-complex="${c.id}"]`);
          const got = {
            total: +el.querySelector('.n-total strong').textContent,
            open: +el.querySelector('.n-open strong').textContent,
            done: +el.querySelector('.n-done strong').textContent,
            text: el.textContent,
            name: el.querySelector('.cx-name').textContent
          };
          return { id: c.id, name: c.name, exp, got };
        });
      });
      check('[4] 카드마다 접수·진행 중·완료 건수가 맞음', cardInfo.every((x) => x.got.name === x.name && x.got.total === x.exp.total && x.got.open === x.exp.open && x.got.done === x.exp.done), JSON.stringify(cardInfo));
      check('[9] 본부: 단지 카드에 멈춤 경고 없음', cardInfo.every((x) => !/멈춤|멈춘|⚠/.test(x.got.text)), JSON.stringify(cardInfo.map((x) => x.got.text)));
      const hqText = await hq.textContent('body');
      check('[9] 본부: 화면 어디에도 "멈춤" 문구 없음(합계·필터·표)', !/멈춤|멈춘/.test(hqText) && (await hq.locator('#f-status button[data-status="멈춤"]').count()) === 0);
      check('[9] 본부: 진행 중 건은 경과 일수 표시 유지', await hq.evaluate(() => Array.from(document.querySelectorAll('#report-rows tr')).some((tr) => /\d+일째/.test(tr.textContent))));

      const summary = await hq.textContent('#auto-summary');
      check('[4] "이번 주 취합: 자동 완료" 한 줄 요약', summary.includes('이번 주 취합: 자동 완료'), summary);

      const total = await hq.evaluate(() => Store.list().length);
      check('[4] 표에 12곳 접수 전체가 모임', (await hq.locator('#report-rows tr[data-id]').count()) === total);
      const heads = await hq.$$eval('#report-table thead th', (ths) => ths.map((t) => t.textContent.trim()));
      check('[4] 표 양식: 단지·동·호수·내용·사진·상태·접수일·경과일', JSON.stringify(heads) === JSON.stringify(['단지', '동·호수', '내용', '사진', '상태', '접수일', '경과일']), JSON.stringify(heads));
      const rowOk = await hq.evaluate(() => {
        const r = Store.list()[0];
        const tr = document.querySelector(`#report-rows tr[data-id="${r.id}"]`);
        const c = LH_DATA.findComplex(r.complexId);
        const tds = tr.querySelectorAll('td');
        return tds[0].textContent.includes(c.name) && tds[1].textContent.includes(r.dong + '동') && tds[1].textContent.includes(r.ho + '호') &&
          tds[2].textContent === r.text && tds[3].querySelectorAll('img').length === r.photos.length && tds[4].textContent.trim() === r.status;
      });
      check('[4] 행 내용이 store와 일치', rowOk);
      await hq.screenshot({ path: path.join(SHOTS, '4-hq.png'), fullPage: true });

      // 단지·상태로 거르기
      await hq.selectOption('#f-complex', 'c03');
      let ids = await hq.$$eval('#report-rows tr[data-id]', (trs) => trs.map((t) => t.dataset.complex));
      check('[4] 단지로 거르기', ids.length > 0 && ids.every((x) => x === 'c03'), JSON.stringify(ids));
      await hq.selectOption('#f-complex', '');
      await hq.click('#f-status button[data-status="보수 완료"]');
      let sts = await hq.$$eval('#report-rows tr[data-id] .badge', (bs) => bs.map((b) => b.textContent.trim()));
      check('[4] 상태로 거르기', sts.length > 0 && sts.every((s) => s === '보수 완료'), JSON.stringify(sts));
      await hq.click('#f-status button[data-status="전체"]');
      await hq.click('#complex-cards .cx-card[data-complex="c07"]');
      ids = await hq.$$eval('#report-rows tr[data-id]', (trs) => trs.map((t) => t.dataset.complex));
      check('[4] 카드 누르면 그 단지만', ids.length > 0 && ids.every((x) => x === 'c07') && (await hq.inputValue('#f-complex')) === 'c07', JSON.stringify(ids));
      await hq.click('#complex-cards .cx-card[data-complex="c07"]');
      check('[4] 카드 한 번 더 누르면 전체로', (await hq.locator('#report-rows tr[data-id]').count()) === total);

      // 사진 크게 보기
      await hq.click('#report-rows tr[data-id] .pic-btn >> nth=0');
      check('[4] 사진 누르면 크게 보기', await hq.isVisible('#lightbox') && (await hq.getAttribute('#lightbox-img', 'src')).startsWith('data:image/'));
      const big = await hq.evaluate(() => document.getElementById('lightbox-img').getBoundingClientRect().width);
      check('[4] 크게 보기 사진 폭 300px 이상', big >= 300, big);
      await hq.screenshot({ path: path.join(SHOTS, '4-hq-lightbox.png') });
      await hq.click('#lightbox-close');
      check('[4] 닫기 누르면 닫힘', !(await hq.isVisible('#lightbox')));

      // 현장 탭에서 등록 → 열려 있던 본부 탭에 새로고침 없이 나타남
      await hq.evaluate(() => { window.__noReload = true; });
      const field = await ctx.newPage();
      const fbag = { errors: [], external: [] };
      watch(field, base, fbag);
      await field.setViewportSize({ width: 375, height: 812 });
      await field.goto(base + 'field.html');
      await field.evaluate(() => Store.setMyComplex('c09'));
      await field.reload();
      const png = await field.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 800; c.height = 600;
        const x = c.getContext('2d'); x.fillStyle = '#795548'; x.fillRect(0, 0, 800, 600);
        return c.toDataURL('image/png').split(',')[1];
      });
      await field.setInputFiles('#photo-input', [{ name: 'p.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') }]);
      await field.waitForFunction(() => document.querySelectorAll('#thumbs img').length === 1);
      const fc = await field.evaluate(() => LH_DATA.findComplex('c09'));
      const fdong = fc.dongs[0].dong, fho = fc.dongs[0].units[3].ho;
      await field.click(`#dong-list button[data-dong="${fdong}"]`);
      await field.click(`#ho-list button[data-ho="${fho}"]`);
      await field.fill('#text-input', '본부 반영 검사 베란다 결로');
      await field.click('#submit-btn');
      await field.waitForSelector('#view-done', { state: 'visible' });
      const newId = await field.evaluate(() => Store.list()[0].id);

      await hq.bringToFront();
      let appeared = true;
      try {
        await hq.waitForSelector(`#report-rows tr[data-id="${newId}"]`, { timeout: 3000 });
      } catch (e) { appeared = false; }
      check('[4] 현장 등록 건이 본부에 새로고침 없이 나타남', appeared && (await hq.evaluate(() => window.__noReload === true)));
      check('[4] 새 건은 표 맨 위', (await hq.$eval('#report-rows tr[data-id]', (t) => t.dataset.id)) === newId);
      check('[4] 새 건 강조 표시', await hq.evaluate((id) => document.querySelector(`#report-rows tr[data-id="${id}"]`).classList.contains('is-new'), newId) &&
        (await hq.textContent(`#report-rows tr[data-id="${newId}"]`)).includes('방금 들어옴'));
      check('[4] 새 건 알림 문구', await hq.isVisible('#new-toast') && (await hq.textContent('#new-toast')).includes('물푸레 행복주택'));
      const c09 = await hq.$eval('#complex-cards .cx-card[data-complex="c09"]', (e) => ({ total: +e.querySelector('.n-total strong').textContent, isNew: e.classList.contains('is-new') }));
      const c09exp = await hq.evaluate(() => Store.list().filter((r) => r.complexId === 'c09').length);
      check('[4] 단지 카드 건수도 바로 갱신', c09.total === c09exp && c09.isNew, JSON.stringify({ c09, c09exp }));
      await hq.screenshot({ path: path.join(SHOTS, '4-hq-new.png'), fullPage: true });

      // 현장에서 상태 변경도 본부에 반영
      await field.evaluate((id) => Store.setStatus(id, '업체 배정'), newId);
      await hq.waitForFunction((id) => { const b = document.querySelector(`#report-rows tr[data-id="${id}"] .badge`); return b && b.textContent.trim() === '업체 배정'; }, newId, { timeout: 3000 }).catch(() => {});
      check('[4] 현장 상태 변경이 본부에 반영', (await hq.textContent(`#report-rows tr[data-id="${newId}"] .badge`)).trim() === '업체 배정');

      // 1280px 가로 스크롤 없음, 버튼 44px, 글씨 16px
      check('[4] 본부 화면 가로 스크롤 없음(1280px)', await noHScroll(hq));
      const small = await hq.evaluate(() => Array.from(document.querySelectorAll('main button, main select'))
        .filter((b) => b.offsetParent !== null)
        .map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 20), w: r.width, h: r.height }; })
        .filter((r) => r.w < 44 || r.h < 44));
      check('[4] 본부 화면 누를 곳 모두 44px 이상', small.length === 0, JSON.stringify(small));
      const smallFont = await hq.evaluate(() => Array.from(document.querySelectorAll('body *'))
        .filter((e) => e.offsetParent !== null && Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))
        .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.textContent.trim().slice(0, 20)));
      check('[4] 본부 화면 글씨 16px 이상', smallFont.length === 0, JSON.stringify(smallFont));
      const leak = await hq.evaluate(() => {
        const txt = document.body.innerText;
        const raws = [];
        LH_DATA.complexes.forEach((c) => c.dongs.forEach((d) => d.units.forEach((u) => raws.push(u.resident.phone))));
        return raws.filter((p) => txt.includes(p));
      });
      check('[4] 본부 화면에 마스킹 안 된 연락처 없음', leak.length === 0, JSON.stringify(leak));

      check('[4] 본부 화면 콘솔 에러 없음', bag.errors.length === 0 && fbag.errors.length === 0, bag.errors.concat(fbag.errors).join(' | '));
      check('[4] 본부 화면 외부 요청 없음', bag.external.length === 0 && fbag.external.length === 0, bag.external.concat(fbag.external).join(' | '));
      await hq.evaluate(() => Store.reset());
      await ctx.close();
    }
    // ---------- 항목 5: 시연 시작 화면과 개인정보 표시 ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const bag = { errors: [], external: [] };
      const page = await ctx.newPage();
      watch(page, base, bag);
      await page.goto(base + 'index.html', { waitUntil: 'load' });
      await page.evaluate(() => Store.reset());
      await page.reload({ waitUntil: 'load' });
      const seedCount = await page.evaluate(() => LH_DATA.buildSeed(Date.now()).length);

      // 시작 화면 구성
      const intro = await page.evaluate(() => ({
        problem: (document.querySelector('#problem') || {}).innerText || '',
        steps: document.querySelectorAll('#demo-steps li').length,
        field: !!document.querySelector('a#open-field[href="field.html"]'),
        hq: !!document.querySelector('a#open-hq[href="hq.html"]'),
        compare: (document.querySelector('#compare') || {}).innerText || '',
        reset: !!document.querySelector('#reset-btn')
      }));
      check('[5] 문제 한 줄(엑셀·카톡·메일, 주 1일)', /엑셀/.test(intro.problem) && /카톡/.test(intro.problem) && /메일/.test(intro.problem) && /주 1일/.test(intro.problem), intro.problem);
      check('[5] 시연 순서 3단계', intro.steps === 3, intro.steps);
      check('[5] 현장·본부 화면 열기 버튼', intro.field && intro.hq);
      check('[5] 지금 방식 vs 이 도구 비교(주 1일→매일 30분, 재입력 없음, 카톡 사진 이동 없음)',
        /주 1일/.test(intro.compare) && /매일 아침 30분/.test(intro.compare) && /재입력 없음/.test(intro.compare) && /카톡 사진 이동 없음/.test(intro.compare), intro.compare);
      check('[5] 시연 데이터 초기화 버튼', intro.reset);

      // 열린 본부 탭이 있는 상태에서 데이터 바꾼 뒤 초기화
      const hq = await ctx.newPage();
      const hbag = { errors: [], external: [] };
      watch(hq, base, hbag);
      await hq.goto(base + 'hq.html', { waitUntil: 'load' });
      await page.evaluate(() => {
        const c = LH_DATA.complexes[2];
        const a = Store.add({ complexId: c.id, dong: c.dongs[0].dong, ho: c.dongs[0].units[0].ho, text: '초기화 검사', photos: [] });
        Store.add({ complexId: c.id, dong: c.dongs[0].dong, ho: c.dongs[0].units[1].ho, text: '초기화 검사2', photos: [] });
        Store.setStatus(Store.list()[5].id, '보수 완료');
        Store.setMyComplex(c.id);
        return a.id;
      });
      await page.reload({ waitUntil: 'load' });
      const before = await page.evaluate(() => Store.list().length);
      await page.click('#reset-btn');
      await page.waitForTimeout(200);
      const after = await page.evaluate(() => ({
        n: Store.list().length, txt: document.querySelector('#seed-count').textContent,
        msg: document.querySelector('#reset-msg').textContent, mine: Store.getMyComplex(),
        leftover: Store.list().some((r) => /초기화 검사/.test(r.text))
      }));
      check('[5] 초기화 전에는 건수가 늘어 있음', before === seedCount + 2, before + ' vs ' + seedCount);
      check('[5] 초기화 후 시드 건수로 돌아감', after.n === seedCount && !after.leftover, JSON.stringify(after));
      check('[5] 초기화 후 화면 건수 표시도 갱신', after.txt.includes(seedCount + '건') && after.msg.length > 0, after.txt + ' / ' + after.msg);
      await hq.waitForFunction((n) => document.querySelectorAll('#report-rows tr[data-id]').length === n, seedCount, { timeout: 3000 }).catch(() => {});
      const hqRows = await hq.evaluate(() => ({ rows: document.querySelectorAll('#report-rows tr[data-id]').length, fresh: document.querySelectorAll('#report-rows tr.is-new').length }));
      check('[5] 열린 본부 화면도 초기화가 바로 반영(강조 없음)', hqRows.rows === seedCount && hqRows.fresh === 0, JSON.stringify(hqRows));

      // 시작 화면 크기별: 가로 스크롤, 버튼 44px, 글씨 16px
      for (const w of [375, 1280]) {
        await page.setViewportSize({ width: w, height: 800 });
        await page.waitForTimeout(100);
        check(`[5] 시작 화면 가로 스크롤 없음(${w}px)`, await noHScroll(page));
        const small = await page.evaluate(() => Array.from(document.querySelectorAll('button, a.btn'))
          .filter((b) => b.offsetParent !== null)
          .map((b) => { const r = b.getBoundingClientRect(); return { t: b.textContent.trim().slice(0, 20), w: r.width, h: r.height }; })
          .filter((r) => r.w < 44 || r.h < 44));
        check(`[5] 시작 화면 누를 곳 44px 이상(${w}px)`, small.length === 0, JSON.stringify(small));
        const smallFont = await page.evaluate(() => Array.from(document.querySelectorAll('body *'))
          .filter((e) => e.offsetParent !== null && Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))
          .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.textContent.trim().slice(0, 20)));
        check(`[5] 시작 화면 글씨 16px 이상(${w}px)`, smallFont.length === 0, JSON.stringify(smallFont));
        await page.screenshot({ path: path.join(SHOTS, `5-index-${w}.png`), fullPage: true });
      }

      // 세 페이지 모두 개인정보 표시 + 마스킹 안 된 연락처 없음
      await page.evaluate(() => Store.setMyComplex(LH_DATA.complexes[0].id));
      const field = await ctx.newPage();
      const fbag = { errors: [], external: [] };
      watch(field, base, fbag);
      await field.setViewportSize({ width: 375, height: 800 });
      const leakScan = () => {
        const raws = [];
        LH_DATA.complexes.forEach((c) => c.dongs.forEach((d) => d.units.forEach((u) => raws.push(u.resident.phone))));
        const attrs = Array.from(document.querySelectorAll('body *')).map((e) =>
          Array.from(e.attributes).filter((a) => !/^(src|href)$/.test(a.name)).map((a) => a.value).join(' ')).join(' ');
        const inputs = Array.from(document.querySelectorAll('input, textarea')).map((e) => e.value).join(' ');
        const hay = document.body.innerText + ' ' + attrs + ' ' + inputs;
        const hits = raws.filter((p) => hay.includes(p));
        const pattern = (hay.match(/01[016789]-?\d{3,4}-?\d{4}/g) || []);
        const note = document.querySelector('#privacy-note');
        const noteOk = !!note && note.offsetParent !== null && /가짜 데이터/.test(note.innerText) && /외부로 전송되지 않음/.test(note.innerText);
        const noteTop = !!note && note.getBoundingClientRect().top <= 1;
        return { hits, pattern, noteOk, noteTop };
      };
      const scans = {};
      await page.setViewportSize({ width: 1280, height: 800 });
      scans.index = await page.evaluate(leakScan);
      await field.goto(base + 'field.html', { waitUntil: 'load' });
      scans.fieldRegister = await field.evaluate(leakScan);
      // 동·호수를 고르면 연락처가 자동으로 뜸 → 이때도 마스킹이어야 함
      const firstDong = await field.$('#view-register [data-dong]');
      if (firstDong) { await firstDong.click(); const ho = await field.$('#view-register [data-ho]'); if (ho) await ho.click(); }
      await field.waitForTimeout(100);
      scans.fieldPicked = await field.evaluate(leakScan);
      await field.click('#tab-list');
      await field.waitForTimeout(150);
      scans.fieldList = await field.evaluate(leakScan);
      await hq.reload({ waitUntil: 'load' });
      scans.hq = await hq.evaluate(leakScan);
      for (const [k, v] of Object.entries(scans)) {
        check(`[5] ${k}: "가짜 데이터 · 외부로 전송되지 않음" 표시가 맨 위에 있음`, v.noteOk && v.noteTop, JSON.stringify(v));
        check(`[5] ${k}: 마스킹 안 된 연락처 없음`, v.hits.length === 0 && v.pattern.length === 0, JSON.stringify(v.hits.concat(v.pattern)));
      }
      await field.screenshot({ path: path.join(SHOTS, '5-field-list.png'), fullPage: false });
      await hq.screenshot({ path: path.join(SHOTS, '5-hq.png'), fullPage: false });
      check('[5] 가로 스크롤 없음(현장 375px·본부 1280px)', (await noHScroll(field)) && (await noHScroll(hq)));

      const errs = bag.errors.concat(hbag.errors, fbag.errors);
      const ext = bag.external.concat(hbag.external, fbag.external);
      check('[5] 콘솔 에러 없음', errs.length === 0, errs.join(' | '));
      check('[5] 외부 요청 없음', ext.length === 0, ext.join(' | '));
      await page.evaluate(() => Store.reset());
      await ctx.close();
    }
    // ---------- 항목 6: 처음부터 끝까지 시연 시나리오 ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const bags = [];
      const track = (p) => { const b = { errors: [], external: [] }; watch(p, base, b); bags.push(b); return p; };
      // 넘친 요소(화면 밖으로 삐져나간 글자·버튼)와 작은 글씨 찾기
      const layoutScan = () => {
        const vw = document.documentElement.clientWidth;
        const vis = Array.from(document.querySelectorAll('body *')).filter((e) => e.offsetParent !== null || e.tagName === 'BODY');
        const outside = vis.filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.right > vw + 1 || r.left < -1); })
          .filter((e) => !e.closest('[hidden]')).map((e) => e.tagName + '.' + e.className + ':' + e.textContent.trim().slice(0, 15));
        const clipped = vis.filter((e) => { const cs = getComputedStyle(e); return /hidden|clip/.test(cs.overflowX) && e.scrollWidth > e.clientWidth + 2 && !/^(IMG|INPUT|SELECT)$/.test(e.tagName) && !e.classList.contains('visually-hidden'); })
          .map((e) => e.tagName + '.' + e.className + ':' + e.textContent.trim().slice(0, 15));
        const smallFont = vis.filter((e) => Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))
          .filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.textContent.trim().slice(0, 15));
        return { outside, clipped, smallFont, hscroll: document.documentElement.scrollWidth > window.innerWidth };
      };
      const shotAndScan = async (p, name, label) => {
        await p.screenshot({ path: path.join(SHOTS, `6-${name}.png`), fullPage: true });
        const s = await p.evaluate(layoutScan);
        check(`[6] ${label}: 넘침·잘림·가로 스크롤 없음`, !s.hscroll && s.outside.length === 0 && s.clipped.length === 0, JSON.stringify(s));
        check(`[6] ${label}: 글씨 16px 이상`, s.smallFont.length === 0, JSON.stringify(s.smallFont));
      };

      // 1) 시작 화면에서 초기화
      const index = track(await ctx.newPage());
      await index.goto(base + 'index.html', { waitUntil: 'load' });
      await index.evaluate(() => { Store.add({ complexId: 'c01', dong: LH_DATA.complexes[0].dongs[0].dong, ho: LH_DATA.complexes[0].dongs[0].units[0].ho, text: '지난 시연 찌꺼기', photos: [] }); Store.setMyComplex('c01'); });
      await index.reload({ waitUntil: 'load' });
      await index.click('#reset-btn');
      const seed = await index.evaluate(() => LH_DATA.buildSeed(Date.now()).length);
      const afterReset = await index.evaluate(() => ({ n: Store.list().length, mine: Store.getMyComplex() }));
      check('[6] 1단계 초기화: 시드 건수로, 내 단지 기억도 지워짐', afterReset.n === seed && !afterReset.mine, JSON.stringify(afterReset));
      await shotAndScan(index, 'index-1280', '시작 화면 1280px');

      // 2) 시작 화면 버튼으로 본부 화면을 새 탭에 열어 둠
      const [hq] = await Promise.all([ctx.waitForEvent('page'), index.click('#open-hq')]);
      track(hq);
      await hq.setViewportSize({ width: 1280, height: 900 });
      await hq.waitForLoadState('load');
      await hq.waitForSelector('#complex-cards .cx-card');
      await hq.evaluate(() => { window.__noReload = true; });
      check('[6] 본부 화면: 카드 12개, 표에 시드 전체', (await hq.locator('#complex-cards .cx-card').count()) === 12 && (await hq.locator('#report-rows tr[data-id]').count()) === seed);
      await shotAndScan(hq, 'hq-before', '본부 화면(등록 전) 1280px');

      // 3) 시작 화면 버튼으로 현장 화면을 열고, 폰 폭에서 단지 고르기 → 등록
      const [field] = await Promise.all([ctx.waitForEvent('page'), index.click('#open-field')]);
      track(field);
      await field.setViewportSize({ width: 375, height: 812 });
      await field.waitForLoadState('load');
      check('[6] 현장 화면: 처음엔 단지 고르기', await field.isVisible('#view-pick'));
      await shotAndScan(field, 'field-pick-375', '현장 단지 고르기 375px');
      const t0 = Date.now();
      await field.click('#complex-list button[data-complex="c04"]');
      const cx = await field.evaluate(() => LH_DATA.findComplex('c04'));
      const mk = (w, h, col) => field.evaluate(([w, h, col]) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = col; x.fillRect(0, 0, w, h); return c.toDataURL('image/png').split(',')[1]; }, [w, h, col]);
      await field.setInputFiles('#photo-input', [
        { name: '1.png', mimeType: 'image/png', buffer: Buffer.from(await mk(1200, 1600, '#90a4ae'), 'base64') },
        { name: '2.png', mimeType: 'image/png', buffer: Buffer.from(await mk(1600, 1200, '#a1887f'), 'base64') }
      ]);
      await field.waitForFunction(() => document.querySelectorAll('#thumbs img').length === 2);
      const dong = cx.dongs[0].dong, ho = cx.dongs[0].units[4].ho;
      await field.click(`#dong-list button[data-dong="${dong}"]`);
      await field.click(`#ho-list button[data-ho="${ho}"]`);
      await field.click('#chips button:nth-child(2)');
      await field.fill('#text-input', '작은방 벽지 곰팡이 (시연)');
      await shotAndScan(field, 'field-register-375', '현장 등록 화면 375px');
      await field.click('#submit-btn');
      await field.waitForSelector('#view-done', { state: 'visible' });
      const took = (Date.now() - t0) / 1000;
      const done = (await field.textContent('#done-title')).trim();
      const m = done.match(/(?:(\d+)분 )?(\d{2})초/);
      const shownSec = m ? (+(m[1] || 0)) * 60 + +m[2] : 999;
      check('[6] 현장 등록이 1분 안에 끝나고 완료 화면에 초 표시', took < 60 && shownSec < 60, done + ' / ' + took);
      await shotAndScan(field, 'field-done-375', '현장 완료 화면 375px');
      const newId = await field.evaluate(() => Store.list()[0].id);

      // 4) 본부 화면에 새로고침 없이 같은 양식으로 나타남
      let ok = true;
      try { await hq.waitForSelector(`#report-rows tr[data-id="${newId}"].is-new`, { timeout: 3000 }); } catch (e) { ok = false; }
      check('[6] 본부: 새 건이 새로고침 없이 맨 위에 강조되어 나타남', ok && (await hq.evaluate(() => window.__noReload === true)) &&
        (await hq.$eval('#report-rows tr[data-id]', (t) => t.dataset.id)) === newId);
      const row = await hq.evaluate((id) => {
        const tds = document.querySelectorAll(`#report-rows tr[data-id="${id}"] td`);
        return { cx: tds[0].textContent, unit: tds[1].textContent, text: tds[2].textContent, pics: tds[3].querySelectorAll('img').length, st: tds[4].textContent.trim() };
      }, newId);
      check('[6] 본부: 단지·동호수·내용·사진 2장·접수 상태가 같은 양식으로', row.cx.includes(cx.name) && row.unit.includes(dong + '동') && row.unit.includes(ho + '호') && row.text.includes('곰팡이') && row.pics === 2 && row.st === '접수', JSON.stringify(row));
      check('[6] 본부: 전체 접수 수가 시드+1', (await hq.locator('#report-rows tr[data-id]').count()) === seed + 1);
      await shotAndScan(hq, 'hq-new', '본부 화면(새 건) 1280px');

      // 5) 현장 목록에서 동·호수로 찾아 상태 변경 → 본부 반영
      await field.click('#to-list-btn');
      await field.fill('#search-input', `${dong} ${ho}`);
      const card = field.locator(`#report-list .report[data-id="${newId}"]`);
      check('[6] 현장 목록: 방금 등록한 건을 동·호수로 찾음', (await card.count()) === 1);
      await card.locator('.next-btn').click();
      await shotAndScan(field, 'field-list-375', '현장 접수 목록 375px');
      const stepsOk = await card.evaluate((el) => {
        const s = el.querySelector('.status-steps');
        if (!s) return false;
        const items = Array.from(s.querySelectorAll('.stp')).map((x) => x.getBoundingClientRect());
        return items.length === 3 && items.every((r) => Math.abs(r.top - items[0].top) < 2);
      });
      check('[6] 현장 목록: 처리 단계 표시가 한 줄(버튼처럼 쌓이지 않음)', stepsOk);
      let reflected = true;
      try {
        await hq.waitForFunction((id) => { const b = document.querySelector(`#report-rows tr[data-id="${id}"] .badge`); return b && b.textContent.trim() === '업체 배정'; }, newId, { timeout: 3000 });
      } catch (e) { reflected = false; }
      const cardCount = await hq.$eval('#complex-cards .cx-card[data-complex="c04"]', (e) => ({ open: +e.querySelector('.n-open strong').textContent }));
      const expOpen = await hq.evaluate(() => Store.list().filter((r) => r.complexId === 'c04' && r.status !== '보수 완료').length);
      check('[6] 현장 상태 변경이 본부 표·카드에 바로 반영', reflected && cardCount.open === expOpen, JSON.stringify({ reflected, cardCount, expOpen }));
      await shotAndScan(hq, 'hq-after', '본부 화면(상태 변경 후) 1280px');

      // 6) 사진 크게 보기도 시연 가능
      await hq.click(`#report-rows tr[data-id="${newId}"] .pic-btn >> nth=0`);
      check('[6] 본부: 방금 올라온 사진을 크게 봄', await hq.isVisible('#lightbox'));
      await hq.screenshot({ path: path.join(SHOTS, '6-hq-lightbox.png') });
      await hq.keyboard.press('Escape');

      // 시작 화면 375px도 확인
      await index.setViewportSize({ width: 375, height: 812 });
      await index.waitForTimeout(100);
      await shotAndScan(index, 'index-375', '시작 화면 375px');

      const errs = bags.flatMap((b) => b.errors), ext = bags.flatMap((b) => b.external);
      check('[6] 시나리오 전체 콘솔 에러 없음', errs.length === 0, errs.join(' | '));
      check('[6] 시나리오 전체 외부 요청 없음', ext.length === 0, ext.join(' | '));
      await index.evaluate(() => Store.reset());
      await ctx.close();

      // README: 여는 방법, 3분 대본, 대응표, 일부러 뺀 것
      const readmePath = path.join(ROOT, 'README.md');
      const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '';
      check('[6] README.md 있음', readme.length > 0);
      check('[6] README: 여는 방법', /여는 방법/.test(readme) && /index\.html/.test(readme));
      check('[6] README: 3분 시연 대본', /3분 시연 대본/.test(readme) && /field\.html|현장 화면/.test(readme) && /hq\.html|본부 화면/.test(readme));
      check('[6] README: PRD 기능과 화면 대응표', /대응표/.test(readme) && /\|.*현장 등록.*\|/.test(readme) && /\|.*본부 자동 취합.*\|/.test(readme) && /\|.*처리 상태.*\|/.test(readme));
      check('[6] README: 일부러 뺀 것(로그인·서버·사내망)', /일부러 뺀 것/.test(readme) && /로그인/.test(readme) && /서버/.test(readme) && /사내망/.test(readme));
    }

    // ---------- #2 [7]: 저장 실패 안내와 사진 10장 상한 ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
      const page = await ctx.newPage();
      const bag = { errors: [], external: [] };
      watch(page, base, bag);
      await page.goto(base + 'index.html');
      await page.evaluate(() => Store.reset());
      await page.goto(base + 'field.html');
      await page.click('#complex-list button >> nth=0');
      await page.waitForSelector('#view-register:not([hidden])');
      const mk = (w, h, color) => page.evaluate(([w, h, color]) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, w, h);
        return c.toDataURL('image/png').split(',')[1];
      }, [w, h, color]);
      const png = Buffer.from(await mk(300, 200, '#90a4ae'), 'base64');

      // 사진 11장 → 10장만
      await page.setInputFiles('#photo-input', Array.from({ length: 11 }, (_, i) => ({ name: i + '.png', mimeType: 'image/png', buffer: png })));
      await page.waitForFunction(() => document.querySelectorAll('#thumbs img').length > 0 && !/줄이는 중/.test(document.getElementById('photo-note').textContent), null, { timeout: 8000 });
      const note = await page.textContent('#photo-note');
      check('[7] 사진 11장 고르면 10장만 남고 안내', (await page.locator('#thumbs img').count()) === 10 && /10장까지/.test(note) && /1장은 빠졌습니다/.test(note), note);
      await page.setInputFiles('#photo-input', [{ name: 'x.png', mimeType: 'image/png', buffer: png }]);
      await page.waitForTimeout(300);
      check('[7] 10장 찬 뒤 더 고르면 늘지 않고 안내', (await page.locator('#thumbs img').count()) === 10 && /10장까지/.test(await page.textContent('#photo-note')));
      await page.click('#thumbs .thumb-del >> nth=0');
      check('[7] 한 장 빼면 안내가 사라지고 9장', (await page.locator('#thumbs img').count()) === 9 && !/10장까지/.test(await page.textContent('#photo-note')));

      // 저장 실패 흉내: setItem이 용량 초과 에러를 던지게 함
      await page.click('#dong-list button >> nth=0');
      await page.click('#ho-list button >> nth=0');
      await page.fill('#text-input', '저장 실패 시험');
      const before = await page.evaluate(() => Store.list().length);
      await page.evaluate(() => {
        window.__realSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function () { throw new DOMException('full', 'QuotaExceededError'); };
      });
      await page.click('#submit-btn');
      await page.waitForTimeout(200);
      const miss = await page.textContent('#missing');
      check('[7] 저장 실패하면 안내가 나오고 완료 화면이 뜨지 않음', /저장하지 못했습니다/.test(miss) && await page.isHidden('#view-done') && await page.isVisible('#view-register'), miss);
      check('[7] 저장 실패하면 접수 건수가 그대로', (await page.evaluate(() => Store.list().length)) === before);
      check('[7] 저장 실패해도 입력이 그대로 남음', (await page.locator('#thumbs img').count()) === 9 && (await page.inputValue('#text-input')) === '저장 실패 시험');

      // 다시 쓸 수 있게 되면 같은 입력으로 다시 눌러 저장됨
      await page.evaluate(() => { Storage.prototype.setItem = window.__realSetItem; });
      await page.click('#submit-btn');
      await page.waitForSelector('#view-done:not([hidden])', { timeout: 3000 });
      const saved = await page.evaluate(() => Store.list()[0]);
      check('[7] 다시 누르면 저장되고 완료 화면', saved.text === '저장 실패 시험' && saved.photos.length === 9 && (await page.evaluate(() => Store.list().length)) === before + 1);
      check('[7] 콘솔 에러 없음', bag.errors.length === 0, bag.errors.join(' | '));
      await ctx.close();
    }

    // ---------- #3 [8]: 명세 경계 조건 ----------
    {
      const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
      const page = await ctx.newPage();
      const bag = { errors: [], external: [] };
      watch(page, base, bag);
      await page.goto(base + 'index.html');
      await page.evaluate(() => Store.reset());
      await page.goto(base + 'field.html');
      await page.click('#complex-list button >> nth=0');
      await page.waitForSelector('#view-register:not([hidden])');
      const cid = await page.evaluate(() => Store.getMyComplex());
      const png = Buffer.from(await page.evaluate(() => {
        const c = document.createElement('canvas'); c.width = 200; c.height = 150;
        c.getContext('2d').fillRect(0, 0, 200, 150);
        return c.toDataURL('image/png').split(',')[1];
      }), 'base64');

      // FR-REG-01: 이미지가 아닌 파일은 무시
      await page.setInputFiles('#photo-input', [{ name: 'memo.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') }]);
      await page.waitForTimeout(300);
      check('[8] 이미지가 아닌 파일은 무시', (await page.locator('#thumbs img').count()) === 0 && /아직 고른 사진이 없습니다/.test(await page.textContent('#photo-note')));
      await page.setInputFiles('#photo-input', [{ name: 'a.png', mimeType: 'image/png', buffer: png }]);
      await page.waitForFunction(() => document.querySelectorAll('#thumbs img').length === 1, null, { timeout: 5000 });

      // FR-REG-03: 동을 바꾸면 고른 호가 풀림
      await page.click('#dong-list button >> nth=0');
      await page.click('#ho-list button >> nth=0');
      const dongCount = await page.locator('#dong-list button').count();
      if (dongCount > 1) {
        await page.click('#dong-list button >> nth=1');
        check('[8] 동을 바꾸면 고른 호가 풀리고 등록 버튼이 잠김', (await page.locator('#ho-list button.on').count()) === 0 && await page.isHidden('#resident') && await page.isDisabled('#submit-btn'));
      } else {
        check('[8] 동을 바꾸면 고른 호가 풀리고 등록 버튼이 잠김', false, '동이 하나뿐인 단지');
      }
      await page.click('#ho-list button >> nth=0');

      // FR-REG-05/06: 공백만이면 등록 불가, 60자 제한, 자주 쓰는 말 이어 붙이기
      await page.fill('#text-input', '    ');
      check('[8] 한 줄 내용이 공백뿐이면 등록 불가', await page.isDisabled('#submit-btn') && /한 줄 내용/.test(await page.textContent('#missing')));
      await page.fill('#text-input', '');
      await page.locator('#text-input').pressSequentially('a'.repeat(70));
      check('[8] 한 줄 내용은 60자까지만 입력됨', (await page.inputValue('#text-input')).length === 60);
      await page.fill('#text-input', '');
      await page.click('#chips button:nth-child(1)');
      await page.click('#chips button:nth-child(2)');
      const chipText = await page.inputValue('#text-input');
      const chips = await page.$$eval('#chips button', (bs) => bs.slice(0, 2).map((b) => b.textContent));
      check('[8] 자주 쓰는 말 두 번 누르면 쉼표로 이어 붙음', chipText === chips[0] + ', ' + chips[1] && !(await page.isDisabled('#submit-btn')), chipText);

      // FR-LIST-02: 검색 경계
      await page.click('#tab-list');
      await page.waitForSelector('#report-list');
      const mineCount = await page.evaluate((id) => Store.list().filter((r) => r.complexId === id).length, cid);
      const shown = () => page.locator('#report-list .report').count();
      await page.fill('#search-input', '동호');
      check('[8] 검색어에 숫자가 없으면 전체가 나옴', (await shown()) === mineCount);
      const target = await page.evaluate((id) => Store.list().find((r) => r.complexId === id), cid);
      await page.fill('#search-input', target.dong + target.ho);
      const glued = await page.$$eval('#report-list .report', (els) => els.map((e) => e.dataset.id));
      const gluedOk = await page.evaluate(([ids, q]) => ids.length > 0 && ids.every((id) => { const r = Store.list().find((x) => x.id === id); return (r.dong + r.ho).indexOf(q) >= 0; }), [glued, target.dong + target.ho]);
      check('[8] 동·호수를 붙여 써도(예: 1011203) 그 세대를 찾음', gluedOk && glued.includes(target.id), target.dong + target.ho);
      await page.fill('#search-input', '1');
      check('[8] 짧은 검색어("1")는 넓게 걸림(앞자리 일치 전체)', (await shown()) >= 1 && (await shown()) <= mineCount);
      check('[8] 콘솔 에러 없음', bag.errors.length === 0, bag.errors.join(' | '));

      // FR-HQ-05: 한 번에 5건까지는 강조, 6건 이상(초기화 등)은 강조 안 함
      const hqCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      const hq = await hqCtx.newPage();
      await hq.goto(base + 'hq.html');
      const writer = await hqCtx.newPage();
      await writer.goto(base + 'index.html');
      const bulk = (n, tag) => writer.evaluate(([n, tag]) => {
        const all = JSON.parse(localStorage.getItem(Store.KEY));
        const c = LH_DATA.complexes[0]; const now = Date.now();
        for (let i = 0; i < n; i++) {
          all.unshift({ id: tag + i, complexId: c.id, dong: c.dongs[0].dong, ho: c.dongs[0].units[0].ho, text: tag + ' ' + i, photos: [], status: '접수', createdAt: now, statusAt: now, history: [{ status: '접수', at: now }] });
        }
        localStorage.setItem(Store.KEY, JSON.stringify(all)); // 한 번에 써서 storage 이벤트 1번
      }, [n, tag]);
      await bulk(5, 'five');
      await hq.waitForTimeout(400);
      check('[8] 본부: 한 번에 5건 들어오면 5건 모두 강조', (await hq.locator('#report-rows tr.is-new').count()) === 5 && await hq.isVisible('#new-toast'));
      await hq.reload();
      await bulk(6, 'six');
      await hq.waitForTimeout(400);
      check('[8] 본부: 한 번에 6건 이상 바뀌면 강조하지 않음', (await hq.locator('#report-rows tr.is-new').count()) === 0 && await hq.isHidden('#new-toast'));
      await hqCtx.close();
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
  const problems = traceability();
  console.log(problems.length ? `추적성 문제 ${problems.length}건:\n  - ` + problems.join('\n  - ') : '추적성 문제 없음');
  console.log('추적표: docs/traceability.md');
  process.exit(failed.length || problems.length ? 1 : 0);
})();
