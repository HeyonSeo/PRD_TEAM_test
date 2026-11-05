/* 시연용 가짜 데이터. 실제 단지·실존 인물과 무관합니다. */
(function () {
  'use strict';

  // 같은 결과가 매번 나오도록 고정 시드 난수
  function rng(seed) {
    var s = seed >>> 0;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      var t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var rand = rng(20261105);
  function pick(arr) { return arr[Math.floor(rand() * arr.length)]; }
  function int(min, max) { return min + Math.floor(rand() * (max - min + 1)); }

  // 가상의 단지 12곳
  var COMPLEX_DEFS = [
    ['c01', '햇살마을 1단지', 3],
    ['c02', '푸른숲 2단지', 4],
    ['c03', '새솔 행복주택', 2],
    ['c04', '은빛마을 3단지', 3],
    ['c05', '노을빛 국민임대', 4],
    ['c06', '맑은내 5단지', 3],
    ['c07', '하늘채 영구임대', 2],
    ['c08', '꽃메마을 2단지', 3],
    ['c09', '물푸레 행복주택', 2],
    ['c10', '솔바람 7단지', 4],
    ['c11', '다온마을 1단지', 3],
    ['c12', '들꽃 국민임대', 3]
  ];

  var SURNAMES = ['김', '이', '박', '최', '정', '강', '조', '윤', '장', '임', '한', '오', '서', '신', '권', '황'];
  var GIVEN = ['영자', '순자', '정숙', '명수', '철호', '상철', '미경', '경희', '종훈', '말순', '복순', '영수', '광수', '옥자', '재석', '민지', '수빈', '현우', '지훈', '은정'];

  function makePhone() {
    return '010-' + String(int(2000, 9999)) + '-' + String(int(1000, 9999));
  }

  var complexes = COMPLEX_DEFS.map(function (d) {
    var dongCount = d[2];
    var dongs = [];
    for (var i = 0; i < dongCount; i++) {
      var dongNo = String(101 + i);
      var floors = int(5, 12);
      var perFloor = int(2, 4);
      var units = [];
      for (var f = 1; f <= floors; f++) {
        for (var u = 1; u <= perFloor; u++) {
          var ho = String(f * 100 + u);
          units.push({
            ho: ho,
            resident: { name: pick(SURNAMES) + pick(GIVEN), phone: makePhone() }
          });
        }
      }
      dongs.push({ dong: dongNo, units: units });
    }
    return { id: d[0], name: d[1], dongs: dongs };
  });

  // 사진 자리표시(인라인 SVG). 외부 요청 없음
  var PHOTO_SCENES = [
    ['#cfd8dc', '#90a4ae', '벽 곰팡이'],
    ['#ffe0b2', '#ffb74d', '싱크대 누수'],
    ['#e1f5fe', '#4fc3f7', '욕실 타일'],
    ['#f1f8e9', '#9ccc65', '방충망'],
    ['#ede7f6', '#9575cd', '현관문'],
    ['#fff9c4', '#fdd835', '조명'],
    ['#fbe9e7', '#ff8a65', '보일러']
  ];
  function placeholderPhoto(idx) {
    var p = PHOTO_SCENES[idx % PHOTO_SCENES.length];
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="360" viewBox="0 0 480 360">' +
      '<rect width="480" height="360" fill="' + p[0] + '"/>' +
      '<rect x="60" y="60" width="360" height="200" rx="12" fill="' + p[1] + '" opacity="0.55"/>' +
      '<circle cx="150" cy="140" r="34" fill="#ffffff" opacity="0.7"/>' +
      '<text x="240" y="315" font-size="32" text-anchor="middle" fill="#37474f" font-family="sans-serif">' + p[2] + ' (예시 사진)</text>' +
      '</svg>';
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  var ISSUES = [
    [0, '작은방 벽에 곰팡이가 번짐'],
    [1, '싱크대 아래 배관에서 물이 샘'],
    [2, '욕실 바닥 타일이 들뜸'],
    [3, '거실 방충망이 찢어짐'],
    [4, '현관문이 잘 안 닫힘'],
    [5, '주방 등이 깜빡거림'],
    [6, '보일러 온수가 미지근함'],
    [1, '세면대 수도꼭지에서 물이 똑똑 떨어짐'],
    [0, '베란다 천장에 물 자국'],
    [4, '방문 손잡이가 헐거움'],
    [2, '변기 물이 계속 흐름'],
    [3, '창문 잠금장치 고장']
  ];

  var STATUSES = ['접수', '업체 배정', '보수 완료'];
  var DAY = 24 * 60 * 60 * 1000;

  // 기준일: 오늘 오전 9시. 시드 접수는 최근 40일 안에 고르게 분포
  function buildSeed(now) {
    var base = new Date(now);
    base.setHours(9, 0, 0, 0);
    var seedRand = rng(77);
    function sp(arr) { return arr[Math.floor(seedRand() * arr.length)]; }
    var reports = [];
    var n = 0;
    complexes.forEach(function (c, ci) {
      var count = 3 + (ci % 3 === 0 ? 1 : 0); // 12곳 x 3~4건 = 40건
      for (var k = 0; k < count; k++) {
        var dong = sp(c.dongs);
        var unit = sp(dong.units);
        var issue = ISSUES[(ci * 5 + k * 3) % ISSUES.length];
        var daysAgo = Math.floor(seedRand() * 40);
        var created = base.getTime() - daysAgo * DAY - Math.floor(seedRand() * 8) * 60 * 60 * 1000;
        // 오래된 건일수록 진행됐을 확률이 높음. 일부는 일부러 멈춰 있음(경고 시연용)
        var status;
        var r = seedRand();
        if (daysAgo <= 2) status = '접수';
        else if (daysAgo <= 10) status = r < 0.45 ? '접수' : (r < 0.85 ? '업체 배정' : '보수 완료');
        else status = r < 0.15 ? '접수' : (r < 0.4 ? '업체 배정' : '보수 완료');
        var statusAt = status === '접수' ? created : created + Math.max(1, Math.floor(daysAgo * (status === '보수 완료' ? 0.7 : 0.3))) * DAY;
        if (statusAt > now) statusAt = now;
        n++;
        reports.push({
          id: 'seed-' + String(n).padStart(3, '0'),
          complexId: c.id,
          dong: dong.dong,
          ho: unit.ho,
          text: issue[1],
          photos: [placeholderPhoto(issue[0]), placeholderPhoto(issue[0] + 3)].slice(0, 1 + (n % 2)),
          status: status,
          createdAt: created,
          statusAt: statusAt,
          history: [{ status: '접수', at: created }].concat(status === '접수' ? [] : [{ status: status, at: statusAt }])
        });
      }
    });
    reports.sort(function (a, b) { return b.createdAt - a.createdAt; });
    return reports;
  }

  function findComplex(id) {
    for (var i = 0; i < complexes.length; i++) if (complexes[i].id === id) return complexes[i];
    return null;
  }
  function findResident(complexId, dong, ho) {
    var c = findComplex(complexId);
    if (!c) return null;
    for (var i = 0; i < c.dongs.length; i++) {
      if (c.dongs[i].dong !== dong) continue;
      for (var j = 0; j < c.dongs[i].units.length; j++) {
        if (c.dongs[i].units[j].ho === ho) return c.dongs[i].units[j].resident;
      }
    }
    return null;
  }

  // 화면 표시용 마스킹: 김○○, 010-****-1234
  function maskName(name) {
    if (!name) return '';
    return name.charAt(0) + '○'.repeat(Math.max(1, name.length - 1));
  }
  function maskPhone(phone) {
    if (!phone) return '';
    var last = phone.replace(/\D/g, '').slice(-4);
    return '010-****-' + last;
  }

  window.LH_DATA = {
    complexes: complexes,
    statuses: STATUSES,
    DAY: DAY,
    buildSeed: buildSeed,
    findComplex: findComplex,
    findResident: findResident,
    maskName: maskName,
    maskPhone: maskPhone,
    placeholderPhoto: placeholderPhoto
  };
})();
