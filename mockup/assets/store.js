/* 접수 저장소. 이 브라우저의 localStorage에만 저장하며 외부로 보내지 않습니다. */
(function () {
  'use strict';
  var KEY = 'lh-defect-reports-v1';
  var COMPLEX_KEY = 'lh-defect-my-complex-v1';
  var memory = null; // localStorage를 쓸 수 없을 때 대신 쓰는 임시 저장

  function readRaw(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeRaw(key, value) {
    try { window.localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }
  function removeRaw(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* 무시 */ }
  }

  function save(list) {
    memory = list;
    writeRaw(KEY, JSON.stringify(list));
  }

  function load() {
    var raw = readRaw(KEY);
    if (raw) {
      try {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) { memory = parsed; return parsed; }
      } catch (e) { /* 깨진 값이면 시드로 */ }
    }
    if (memory) return memory;
    var seed = window.LH_DATA.buildSeed(Date.now());
    save(seed);
    return seed;
  }

  function list() {
    return load().slice().sort(function (a, b) { return b.createdAt - a.createdAt; });
  }

  function newId() {
    return 'r-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
  }

  function add(report) {
    var all = load().slice();
    var now = Date.now();
    var item = {
      id: newId(),
      complexId: report.complexId,
      dong: report.dong,
      ho: report.ho,
      text: report.text,
      photos: report.photos || [],
      status: '접수',
      createdAt: now,
      statusAt: now,
      history: [{ status: '접수', at: now }]
    };
    all.unshift(item);
    save(all);
    return item;
  }

  function setStatus(id, status) {
    if (window.LH_DATA.statuses.indexOf(status) < 0) return null;
    var all = load().slice();
    var now = Date.now();
    var found = null;
    for (var i = 0; i < all.length; i++) {
      if (all[i].id === id) {
        found = Object.assign({}, all[i], { status: status, statusAt: now });
        found.history = (all[i].history || []).concat([{ status: status, at: now }]);
        all[i] = found;
        break;
      }
    }
    if (found) save(all);
    return found;
  }

  function reset() {
    memory = null;
    removeRaw(KEY);
    removeRaw(COMPLEX_KEY);
    return load();
  }

  function getMyComplex() { return readRaw(COMPLEX_KEY); }
  function setMyComplex(id) { writeRaw(COMPLEX_KEY, id); }

  // 다른 탭에서 바뀌면 알려줌(본부 화면 자동 갱신용)
  function onChange(fn) {
    window.addEventListener('storage', function (e) {
      if (e.key === KEY || e.key === null) { memory = null; fn(); }
    });
  }

  function daysSince(ts, now) {
    return Math.max(0, Math.floor(((now || Date.now()) - ts) / window.LH_DATA.DAY));
  }

  window.Store = {
    KEY: KEY,
    list: list,
    add: add,
    setStatus: setStatus,
    reset: reset,
    getMyComplex: getMyComplex,
    setMyComplex: setMyComplex,
    onChange: onChange,
    daysSince: daysSince
  };
})();
