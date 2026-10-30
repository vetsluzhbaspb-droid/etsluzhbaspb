/* Админка «Ветслужба СПб».
   Работает без своего сервера: правки сохраняются коммитом в репозиторий GitHub,
   а GitHub Actions пересобирает сайт из _src (python3 _src/build.py) и публикует его.
   Ключ доступа к GitHub хранится зашифрованным (AES-GCM, ключ из пароля через PBKDF2)
   в admin/vault.json; без пароля он бесполезен. */
'use strict';
(function () {
  var DEFAULT_REPO = 'vetsluzhbaspb-droid/etsluzhbaspb';
  var DEFAULT_BRANCH = 'main';
  var SITE = 'https://vetsluzhbaspb.com/';
  var DEMO = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && /demo/.test(location.search);
  var DEMO_BASE = new URL('../', location.href).href;
  var WORKFLOW_PATH = '.github/workflows/build.yml';
  var WORKFLOW = [
    'name: Сборка сайта',
    'on:',
    '  push:',
    '    branches: [main]',
    '  workflow_dispatch:',
    'permissions:',
    '  contents: read',
    '  pages: write',
    '  id-token: write',
    'concurrency:',
    '  group: pages',
    '  cancel-in-progress: true',
    'jobs:',
    '  build:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/checkout@v4',
    '      - name: Сборка страниц из _src',
    '        run: |',
    '          for f in *.html; do [ -f "_src/pages/$f" ] || rm -f "$f"; done',
    '          SITE_OUT=. python3 _src/build.py',
    '      - name: Копия сайта без исходников',
    '        run: rsync -a --exclude ".git" --exclude ".github" --exclude "_src" ./ "${{ runner.temp }}/site/"',
    '      - uses: actions/configure-pages@v5',
    '      - uses: actions/upload-pages-artifact@v3',
    '        with:',
    '          path: ${{ runner.temp }}/site',
    '  deploy:',
    '    needs: build',
    '    runs-on: ubuntu-latest',
    '    environment:',
    '      name: github-pages',
    '      url: ${{ steps.d.outputs.page_url }}',
    '    steps:',
    '      - id: d',
    '        uses: actions/deploy-pages@v4',
    ''
  ].join('\n');
  var CATS = { pered: 'Перед визитом', kremaciya: 'Кремация', posle: 'После утраты' };
  var CAT_ICON = { pered: 'home', kremaciya: 'flame', posle: 'leaf' };
  var THEME_DEFAULT = { textScale: 100, headingScale: 100, radius: 22, primary: '#2866a0', primary2: '#1c78ad', accent: '#d87578', text: '#183b56', heading: '#143b5b', muted: '#4b6479', tint: '#f4faff', bg: '#ffffff' };
  var PROTECTED_IMG = ['favicon.svg', 'favicon-32.png', 'apple-touch-icon.png', 'logo-512.png', 'og-image.png', 'logo.svg'];

  var app = document.getElementById('app');
  var S = {
    token: null, repo: DEFAULT_REPO, branch: DEFAULT_BRANCH,
    files: {}, changes: new Map(), tab: 'main', page: null, pageEd: null,
    site: null, articles: null, theme: null, pages: [], images: [], status: null,
    stamp: Date.now(), newArticle: null, editCard: null
  };

  // ---------------------------------------------------------------- утилиты
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v == null || v === false) return;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked' || k === 'disabled' || k === 'selected') el[k] = !!v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { add(el, x); }); return; }
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
  function escA(s) { return esc(s).replace(/"/g, '&quot;'); }
  function unesc(s) { var t = document.createElement('textarea'); t.innerHTML = s; return t.value; }
  function textOf(html) { var d = document.createElement('div'); d.innerHTML = html; return d.textContent.replace(/\s+/g, ' ').trim(); }
  function toast(msg, ms) {
    var t = h('div', { class: 'toast' }, msg); document.body.append(t);
    setTimeout(function () { t.remove(); }, ms || 3500);
  }
  var TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
  function translit(s) {
    return s.toLowerCase().split('').map(function (c) { return TR[c] != null ? TR[c] : c; }).join('')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  }
  function stamp() { return String(Date.now()).slice(-7); }
  function pyjson(v) { // как json.dumps в Python: {"a": 1, "b": [1, 2]}
    if (Array.isArray(v)) return '[' + v.map(pyjson).join(', ') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).map(function (k) { return JSON.stringify(k) + ': ' + pyjson(v[k]); }).join(', ') + '}';
    return JSON.stringify(v);
  }
  function getPath(o, p) { return p.split('.').reduce(function (a, k) { return a == null ? undefined : a[k]; }, o); }
  function setPath(o, p, v) { var ks = p.split('.'), last = ks.pop(); ks.forEach(function (k) { if (o[k] == null || typeof o[k] !== 'object') o[k] = {}; o = o[k]; }); o[last] = v; }
  function today() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

  // ---------------------------------------------------------------- шифрование ключа
  var te = new TextEncoder(), td = new TextDecoder();
  function b64(bytes) { var s = ''; for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function keyFrom(pw, salt, iter) {
    return crypto.subtle.importKey('raw', te.encode(pw), 'PBKDF2', false, ['deriveKey']).then(function (base) {
      return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    });
  }
  async function seal(token, pw) {
    var salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12)), iter = 600000;
    var k = await keyFrom(pw, salt, iter);
    var ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, k, te.encode(token));
    return { v: 1, kdf: 'PBKDF2-SHA256', iter: iter, salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(ct)), repo: S.repo, branch: S.branch };
  }
  async function unseal(v, pw) {
    var k = await keyFrom(pw, unb64(v.salt), v.iter);
    var pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, k, unb64(v.data));
    return td.decode(pt);
  }

  // ---------------------------------------------------------------- GitHub
  function R() { return '/repos/' + S.repo; }
  async function gh(path, opt) {
    opt = opt || {};
    var r = await fetch('https://api.github.com' + path, {
      method: opt.method || 'GET', cache: 'no-store',
      headers: { Authorization: 'Bearer ' + S.token, Accept: opt.raw ? 'application/vnd.github.raw' : 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    });
    if (!r.ok) {
      var m = ''; try { m = (await r.json()).message; } catch (e) { /* пусто */ }
      var err = new Error('GitHub ' + r.status + (m ? ': ' + m : '')); err.status = r.status; throw err;
    }
    if (opt.raw) return r.text();
    return r.status === 204 ? null : r.json();
  }
  async function readText(path) {
    if (path in S.files) return S.files[path];
    var t = null;
    if (DEMO) { var r = await fetch(DEMO_BASE + path, { cache: 'no-store' }); t = r.ok ? await r.text() : null; }
    else {
      try { t = await gh(R() + '/contents/' + path + '?ref=' + S.branch, { raw: true }); }
      catch (e) { if (e.status !== 404) throw e; }
    }
    if (t != null) S.files[path] = t;
    return t;
  }
  async function listDir(path) {
    if (DEMO) { var idx = await (await fetch(DEMO_BASE + '__index.json', { cache: 'no-store' })).json(); return idx[path] || []; }
    var arr = await gh(R() + '/contents/' + path + '?ref=' + S.branch);
    return arr.filter(function (x) { return x.type === 'file'; }).map(function (x) { return { name: x.name, path: x.path, size: x.size }; });
  }
  async function commit(message, changes) {
    if (DEMO) { await new Promise(function (r) { setTimeout(r, 600); }); return 'demo' + stamp(); }
    var ref = await gh(R() + '/git/ref/heads/' + S.branch);
    var base = ref.object.sha;
    var cm = await gh(R() + '/git/commits/' + base);
    var tree = [];
    for (var entry of changes) {
      var path = entry[0], c = entry[1];
      if (c.del) tree.push({ path: path, mode: '100644', type: 'blob', sha: null });
      else if (c.b64 != null) {
        var blob = await gh(R() + '/git/blobs', { method: 'POST', body: { content: c.b64, encoding: 'base64' } });
        tree.push({ path: path, mode: '100644', type: 'blob', sha: blob.sha });
      } else tree.push({ path: path, mode: '100644', type: 'blob', content: c.text });
    }
    var nt = await gh(R() + '/git/trees', { method: 'POST', body: { base_tree: cm.tree.sha, tree: tree } });
    var nc = await gh(R() + '/git/commits', { method: 'POST', body: { message: message, tree: nt.sha, parents: [base] } });
    await gh(R() + '/git/refs/heads/' + S.branch, { method: 'PATCH', body: { sha: nc.sha } });
    return nc.sha;
  }
  function imgUrl(path) {
    if (!path) return '';
    var c = S.changes.get(path);
    if (c && c.url) return c.url;
    var im = S.images.find(function (x) { return x.path === path; });
    if (im && im.url) return im.url;
    if (DEMO) return DEMO_BASE + path;
    return 'https://raw.githubusercontent.com/' + S.repo + '/' + S.branch + '/' + path + '?t=' + S.stamp;
  }

  // ---------------------------------------------------------------- черновик изменений
  function cur(path) {
    var c = S.changes.get(path);
    if (c) { if (c.del) return null; if ('text' in c) return c.text; }
    return path in S.files ? S.files[path] : null;
  }
  function stageText(path, text) {
    if (S.files[path] === text) S.changes.delete(path); else S.changes.set(path, { text: text });
    badge();
  }
  function stageBin(path, data, url) { S.changes.set(path, { b64: data, url: url }); badge(); }
  function stageDel(path) {
    if (!(path in S.files)) S.changes.delete(path); else S.changes.set(path, { del: true });
    badge();
  }
  function saveJson(path, obj) { stageText(path, JSON.stringify(obj, null, 2) + '\n'); }
  function saveSite() { saveJson('_src/site.json', S.site); }
  function saveArticles() { saveJson('_src/articles.json', S.articles); }
  function saveTheme() { saveJson('_src/theme.json', S.theme); }
  function saveReviews() { saveJson('_src/reviews.json', S.reviews); }
  function reloadData() {
    S.site = JSON.parse(cur('_src/site.json'));
    S.articles = JSON.parse(cur('_src/articles.json') || '[]');
    S.theme = Object.assign({}, THEME_DEFAULT, JSON.parse(cur('_src/theme.json') || '{}'));
    S.reviews = JSON.parse(cur('_src/reviews.json') || '[]');
    S.pages = Object.keys(S.files).concat(Array.from(S.changes.keys()))
      .filter(function (p, i, a) { return /^_src\/pages\/[^/]+\.html$/.test(p) && a.indexOf(p) === i && cur(p) != null; })
      .map(function (p) { return p.slice('_src/pages/'.length); }).sort();
    S.pageEd = null;
  }
  function badge() {
    var b = document.getElementById('chg-count');
    if (b) { b.textContent = S.changes.size; b.hidden = !S.changes.size; }
    var p = document.getElementById('pub-btn');
    if (p) p.disabled = !S.changes.size;
  }
  window.addEventListener('beforeunload', function (e) { if (S.changes.size) { e.preventDefault(); e.returnValue = ''; } });

  // ---------------------------------------------------------------- картинки
  function loadImg(src) {
    return new Promise(function (ok, fail) {
      var i = new Image(); i.onload = function () { ok(i); }; i.onerror = function () { fail(new Error('Не удалось открыть картинку')); }; i.src = src;
    });
  }
  function toBlob(c, type, q) { return new Promise(function (r) { c.toBlob(r, type, q); }); }
  // Подгоняем фото под нужный размер: обрезаем по центру (как object-fit: cover) и сжимаем
  async function encode(img, w, h, keepType) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    var c = document.createElement('canvas'); c.width = w; c.height = h;
    var x = c.getContext('2d'); x.imageSmoothingQuality = 'high';
    var s = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / s, sh = h / s;
    x.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
    var blob, ext;
    if (keepType === 'png') { blob = await toBlob(c, 'image/png'); ext = 'png'; }
    else if (keepType === 'jpg' || keepType === 'jpeg') { blob = await toBlob(c, 'image/jpeg', 0.85); ext = 'jpg'; }
    else {
      blob = await toBlob(c, 'image/webp', 0.8); ext = 'webp';
      if (!blob || blob.type !== 'image/webp') {
        if (keepType === 'webp') throw new Error('Этот браузер не умеет сохранять WebP. Откройте админку в Chrome.');
        blob = await toBlob(c, 'image/jpeg', 0.85); ext = 'jpg';
      }
    }
    var data = b64(new Uint8Array(await blob.arrayBuffer()));
    return { b64: data, url: URL.createObjectURL(blob), ext: ext, size: blob.size, w: w, h: h };
  }
  function pickFile(multiple) {
    return new Promise(function (ok) {
      var i = h('input', { type: 'file', accept: 'image/*', multiple: multiple ? true : null });
      i.addEventListener('change', function () { ok(Array.from(i.files)); });
      i.click();
    });
  }
  function fileImg(f) { return loadImg(URL.createObjectURL(f)); }
  function baseName(path) { return path.split('/').pop().replace(/\.[a-z0-9]+$/i, '').replace(/(-\d{7})?(-\d{3,4})?$/, ''); }

  // ---------------------------------------------------------------- вход
  async function start() {
    if (DEMO) { S.token = 'demo'; return loadAll(); }
    var saved = sessionStorage.getItem('adm_t');
    var vault = null;
    try { var r = await fetch('vault.json?t=' + Date.now(), { cache: 'no-store' }); if (r.ok) vault = await r.json(); } catch (e) { /* нет файла */ }
    if (vault) { S.repo = vault.repo || DEFAULT_REPO; S.branch = vault.branch || DEFAULT_BRANCH; }
    if (saved) { S.token = saved; return loadAll(); }
    if (vault) loginView(vault); else setupView();
  }
  function loginView(vault) {
    var pw = h('input', { type: 'password', autocomplete: 'current-password', autofocus: true });
    var msg = h('p', { class: 'err' });
    var btn = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Войти');
    var form = h('form', {
      onsubmit: async function (e) {
        e.preventDefault(); msg.textContent = ''; btn.disabled = true; btn.textContent = 'Проверяю…';
        try { S.token = await unseal(vault, pw.value); sessionStorage.setItem('adm_t', S.token); loadAll(); }
        catch (err) { msg.textContent = 'Неверный пароль'; btn.disabled = false; btn.textContent = 'Войти'; }
      }
    }, h('label', { class: 'f' }, h('span', null, 'Пароль'), pw), msg, h('div', { class: 'row' }, btn, h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--sm', type: 'button', onclick: setupView }, 'Настроить заново')));
    app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' }, h('h1', null, 'Админка сайта'), h('p', { class: 'hint' }, 'Ветслужба СПб · ' + S.repo), form)));
    pw.focus();
  }
  function setupView() {
    var tok = h('input', { type: 'password', autocomplete: 'off', placeholder: 'github_pat_…' });
    var p1 = h('input', { type: 'password', autocomplete: 'new-password' });
    var p2 = h('input', { type: 'password', autocomplete: 'new-password' });
    var repo = h('input', { type: 'text', value: S.repo });
    var log = h('div', { class: 'stack' });
    var btn = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Сохранить и войти');
    function say(t, cls) { log.append(h('p', { class: cls || 'hint' }, t)); }
    var form = h('form', {
      onsubmit: async function (e) {
        e.preventDefault(); log.replaceChildren();
        if (p1.value.length < 10) return say('Пароль — минимум 10 символов.', 'err');
        if (p1.value !== p2.value) return say('Пароли не совпадают.', 'err');
        btn.disabled = true;
        try { await setup(tok.value.trim(), p1.value, repo.value.trim(), say); }
        catch (err) { say('Ошибка: ' + err.message, 'err'); btn.disabled = false; }
      }
    },
      h('label', { class: 'f' }, h('span', null, 'Ключ доступа GitHub'), tok),
      h('label', { class: 'f' }, h('span', null, 'Придумайте пароль для входа (от 10 символов)'), p1),
      h('label', { class: 'f' }, h('span', null, 'Пароль ещё раз'), p2),
      h('details', null, h('summary', { class: 'hint' }, 'Репозиторий'), h('label', { class: 'f' }, repo)),
      log, btn);
    app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' },
      h('h1', null, 'Первая настройка'),
      h('p', { class: 'hint' }, 'Делается один раз. Админке нужен ключ, чтобы сохранять изменения в ваш репозиторий на GitHub.'),
      h('ol', null,
        h('li', null, 'Откройте ', h('a', { href: 'https://github.com/settings/personal-access-tokens/new', target: '_blank', rel: 'noopener' }, 'github.com → новый ключ'), ' (аккаунт ', h('b', null, S.repo.split('/')[0]), ').'),
        h('li', null, 'Token name: «Админка сайта». Expiration: самый долгий срок.'),
        h('li', null, 'Repository access → Only select repositories → ', h('b', null, S.repo.split('/')[1]), '.'),
        h('li', null, 'Permissions → Repository permissions: ', h('b', null, 'Contents'), ', ', h('b', null, 'Workflows'), ', ', h('b', null, 'Pages'), ' — Read and write; ', h('b', null, 'Actions'), ' — Read-only.'),
        h('li', null, 'Generate token → скопируйте ключ и вставьте ниже.')),
      form)));
  }
  async function setup(token, pw, repo, say) {
    S.token = token; S.repo = repo;
    say('Проверяю ключ…');
    var info = await gh(R());
    if (!info.permissions || !info.permissions.push) throw new Error('ключ не даёт права записи в репозиторий (Contents: Read and write)');
    S.branch = info.default_branch || 'main';
    if (await readText('_src/site.json') == null) throw new Error('в репозитории нет папки _src. Сначала загрузите её на GitHub (см. инструкцию).');
    var hasWf = (await readText(WORKFLOW_PATH)) != null;
    var switched = false;
    try {
      say('Включаю автоматическую сборку сайта…');
      var pages = await gh(R() + '/pages');
      if (pages.build_type !== 'workflow') { await gh(R() + '/pages', { method: 'PUT', body: { build_type: 'workflow' } }); switched = true; }
    } catch (e) {
      say('Не получилось переключить публикацию автоматически (' + e.message + '). Сделайте вручную: Settings → Pages → Source → GitHub Actions.', 'err');
    }
    var vault = await seal(token, pw);
    var ch = new Map([['admin/vault.json', { text: JSON.stringify(vault, null, 2) + '\n' }]]);
    if (!hasWf) ch.set(WORKFLOW_PATH, { text: WORKFLOW });
    say('Сохраняю зашифрованный ключ' + (hasWf ? '' : ' и настройки сборки') + '…');
    try { S.status = { sha: await commit('Админка: первая настройка', ch), state: 'wait' }; }
    catch (e) {
      if (switched) { try { await gh(R() + '/pages', { method: 'PUT', body: { build_type: 'legacy', source: { branch: S.branch, path: '/' } } }); } catch (x) { /* пусто */ } }
      if (e.status === 403 || e.status === 404 || e.status === 422) throw new Error(e.message + '. Проверьте, что у ключа есть Contents и Workflows — Read and write.');
      throw e;
    }
    S.files[WORKFLOW_PATH] = WORKFLOW;
    sessionStorage.setItem('adm_t', token);
    say('Готово!', 'ok');
    pollStatus();
    loadAll();
  }
  function logout() {
    if (S.changes.size && !confirm('Есть неопубликованные изменения. Выйти и потерять их?')) return;
    S.changes.clear(); sessionStorage.removeItem('adm_t'); location.reload();
  }

  async function loadAll() {
    app.replaceChildren(h('p', { class: 'boot' }, 'Загружаю данные сайта…'));
    try {
      var lists = await Promise.all([listDir('_src/pages'), listDir('assets/img')]);
      S.images = lists[1].filter(function (x) { return /\.(webp|jpe?g|png|svg|gif|avif)$/i.test(x.name); });
      await Promise.all(['_src/site.json', '_src/articles.json', '_src/theme.json', '_src/reviews.json'].concat(lists[0].filter(function (x) { return /\.html$/.test(x.name); }).map(function (x) { return x.path; })).map(readText));
      if (S.files['_src/site.json'] == null) throw new Error('Не найден _src/site.json');
      reloadData();
      render();
    } catch (e) {
      if (e.status === 401) { sessionStorage.removeItem('adm_t'); app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' }, h('p', { class: 'err' }, 'Ключ GitHub больше не действует (истёк или отозван). Нажмите «Настроить заново» и создайте новый.'), h('button', { class: 'btn', onclick: setupView }, 'Настроить заново')))); return; }
      app.replaceChildren(h('div', { class: 'login' }, h('div', { class: 'card' }, h('p', { class: 'err' }, 'Ошибка загрузки: ' + e.message), h('button', { class: 'btn', onclick: function () { location.reload(); } }, 'Повторить'))));
    }
  }

  // ---------------------------------------------------------------- каркас
  var TABS = [
    ['main', 'Контакты и данные', mainTab], ['prices', 'Цены', pricesTab], ['pages', 'Страницы и тексты', pagesTab],
    ['articles', 'Статьи', articlesTab], ['reviews', 'Отзывы', reviewsTab], ['photos', 'Фото', photosTab], ['theme', 'Оформление', themeTab]
  ];
  function render() {
    var tab = TABS.find(function (t) { return t[0] === S.tab; }) || TABS[0];
    var y = window.scrollY;
    app.replaceChildren(topbar(), statusBar(), h('div', { class: 'wrap' }, tab[2]()));
    badge();
    return y;
  }
  function go(tab) { S.tab = tab; render(); window.scrollTo(0, 0); }
  function topbar() {
    return h('header', { class: 'top' }, h('div', { class: 'top__in' },
      h('span', { class: 'top__brand' }, 'Админка'),
      h('nav', { class: 'tabs' }, TABS.map(function (t) { return h('button', { class: 'tab', 'aria-current': String(S.tab === t[0]), onclick: function () { go(t[0]); } }, t[1]); })),
      h('div', { class: 'top__actions' },
        h('button', { class: 'btn', onclick: changesModal }, 'Изменения ', h('span', { class: 'badge', id: 'chg-count', hidden: true }, '0')),
        h('button', { class: 'btn btn--primary', id: 'pub-btn', onclick: publish, disabled: true }, 'Опубликовать'),
        h('a', { class: 'btn btn--sm', href: SITE, target: '_blank', rel: 'noopener' }, 'Сайт ↗'),
        h('button', { class: 'btn btn--sm', onclick: passwordModal }, 'Сменить пароль'),
        h('button', { class: 'btn btn--sm', onclick: logout }, 'Выйти'))));
  }
  function statusBar() {
    var st = S.status;
    if (!st) return h('div');
    var cls = st.state === 'ok' ? ' ok' : st.state === 'err' ? ' err' : '';
    var text = st.state === 'ok' ? 'Готово — сайт обновлён. Откройте его и обновите страницу (Cmd+Shift+R).'
      : st.state === 'err' ? 'Сборка сайта не удалась. Изменения сохранены, но на сайт не попали.'
        : 'Сохранено. Сайт обновляется — обычно 1–2 минуты…';
    return h('div', { class: 'status' }, h('div', { class: 'status__in' + cls }, h('span', null, text),
      st.url ? h('a', { href: st.url, target: '_blank', rel: 'noopener' }, 'Подробнее') : null,
      st.state === 'ok' ? h('a', { href: SITE, target: '_blank', rel: 'noopener' }, 'Открыть сайт ↗') : null,
      h('span', { class: 'spacer' }), h('button', { class: 'btn btn--sm', onclick: function () { S.status = null; render(); } }, 'Скрыть')));
  }
  function refreshStatus() { var el = document.querySelector('.status'); if (el) el.replaceWith(statusBar()); }

  function changesModal() {
    var close = function () { m.remove(); };
    var list = Array.from(S.changes.entries()).map(function (e) {
      var path = e[0], c = e[1];
      var kind = c.del ? 'удалён' : (path in S.files ? 'изменён' : 'новый');
      return h('div', { class: 'chg' }, h('code', null, path), h('span', { class: 'hint' }, kind),
        h('button', { class: 'btn btn--sm', onclick: function () { S.changes.delete(path); afterUndo(); close(); changesModal(); } }, 'Отменить'));
    });
    var m = h('div', { class: 'modal', onclick: function (e) { if (e.target === m) close(); } }, h('div', { class: 'card' },
      h('div', { class: 'row' }, h('h2', { class: 'sec' }, 'Неопубликованные изменения'), h('span', { class: 'spacer' }), h('button', { class: 'btn btn--sm', onclick: close }, 'Закрыть')),
      list.length ? list : h('p', { class: 'hint' }, 'Изменений нет.'),
      list.length ? h('div', { class: 'row', style: 'margin-top:14px' },
        h('button', { class: 'btn btn--danger', onclick: function () { if (confirm('Отменить все изменения?')) { S.changes.clear(); afterUndo(); close(); } } }, 'Отменить всё'),
        h('span', { class: 'spacer' }), h('button', { class: 'btn btn--primary', onclick: function () { close(); publish(); } }, 'Опубликовать')) : null));
    document.body.append(m);
  }
  // Смена пароля: тот же ключ GitHub шифруется новым паролем и сохраняется в admin/vault.json
  function passwordModal() {
    var p1 = h('input', { type: 'password', autocomplete: 'new-password' });
    var p2 = h('input', { type: 'password', autocomplete: 'new-password' });
    var msg = h('p', { class: 'err' });
    var btn = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Сохранить новый пароль');
    var close = function () { m.remove(); };
    var m = h('div', { class: 'modal', onclick: function (e) { if (e.target === m) close(); } }, h('div', { class: 'card' },
      h('div', { class: 'row' }, h('h2', { class: 'sec', style: 'margin:0' }, 'Смена пароля'), h('span', { class: 'spacer' }), h('button', { class: 'btn btn--sm', onclick: close }, 'Закрыть')),
      h('form', { style: 'margin-top:14px', onsubmit: async function (e) {
        e.preventDefault(); msg.textContent = '';
        if (p1.value.length < 10) { msg.textContent = 'Пароль — минимум 10 символов.'; return; }
        if (p1.value !== p2.value) { msg.textContent = 'Пароли не совпадают.'; return; }
        btn.disabled = true; btn.textContent = 'Сохраняю…';
        try {
          var vault = await seal(S.token, p1.value);
          await commit('Админка: новый пароль', new Map([['admin/vault.json', { text: JSON.stringify(vault, null, 2) + '\n' }]]));
          close(); toast('Пароль изменён. Через 1–2 минуты вход будет по новому паролю, старый перестанет работать.', 6000);
        } catch (err) { msg.textContent = 'Не удалось сохранить: ' + err.message; btn.disabled = false; btn.textContent = 'Сохранить новый пароль'; }
      } },
        h('label', { class: 'f' }, h('span', null, 'Новый пароль (от 10 символов)'), p1),
        h('label', { class: 'f' }, h('span', null, 'Новый пароль ещё раз'), p2),
        msg, btn)));
    document.body.append(m); p1.focus();
  }
  function afterUndo() {
    S.images = S.images.filter(function (x) { return !x.staged || S.changes.has(x.path); });
    reloadData(); S.newArticle = null; S.editCard = null; render();
  }

  async function publish() {
    if (!S.changes.size) return;
    var btn = document.getElementById('pub-btn'); btn.disabled = true; btn.textContent = 'Публикую…';
    var names = Array.from(S.changes.keys()).map(function (p) { return p.split('/').pop(); });
    var msg = 'Админка: ' + names.slice(0, 6).join(', ') + (names.length > 6 ? ' и ещё ' + (names.length - 6) : '');
    try {
      var sha = await commit(msg, S.changes);
      S.changes.forEach(function (c, path) {
        if (c.del) { delete S.files[path]; S.images = S.images.filter(function (x) { return x.path !== path; }); }
        else if ('text' in c) S.files[path] = c.text;
        else { var im = S.images.find(function (x) { return x.path === path; }); if (im) { im.staged = false; im.url = c.url; } }
      });
      S.changes.clear();
      S.status = { sha: sha, state: 'wait' };
      reloadData(); render(); pollStatus();
    } catch (e) {
      btn.disabled = false; btn.textContent = 'Опубликовать';
      alert('Не удалось сохранить: ' + e.message);
    }
  }
  async function pollStatus() {
    var st = S.status; if (!st) return;
    if (DEMO) { setTimeout(function () { st.state = 'ok'; refreshStatus(); }, 1500); return; }
    for (var i = 0; i < 120 && S.status === st; i++) {
      await new Promise(function (r) { setTimeout(r, 6000); });
      try {
        var runs = (await gh(R() + '/actions/runs?head_sha=' + st.sha + '&per_page=10')).workflow_runs || [];
        var run = runs.find(function (x) { return x.path === WORKFLOW_PATH || x.name === 'Сборка сайта'; }) || runs[0];
        if (!run) continue;
        st.url = run.html_url;
        if (run.status === 'completed') { st.state = run.conclusion === 'success' ? 'ok' : 'err'; refreshStatus(); return; }
        refreshStatus();
      } catch (e) { if (e.status === 403) { st.state = 'ok'; st.url = 'https://github.com/' + S.repo + '/actions'; refreshStatus(); return; } }
    }
  }

  // ---------------------------------------------------------------- вкладка «Контакты и данные»
  var FIELDS = [
    ['Контакты', [['phone', 'Телефон (как показывать на сайте)'], ['whatsapp', 'WhatsApp (номер)'], ['telegram', 'Telegram (@ник)'], ['email', 'E-mail'],
      ['hours', 'Режим работы (текст на сайте)'], ['openingHoursSchema', 'Режим работы для поисковиков', 'Формат: Mo-Su 06:00-23:59', 'list']]],
    ['О компании', [['brand', 'Название'], ['tagline', 'Слоган'], ['city', 'Город'], ['cityIn', 'Город в предложном падеже', 'например: в Санкт-Петербурге'],
      ['serviceArea', 'Где работаем (полностью)'], ['serviceAreaShort', 'Где работаем (коротко)'], ['experience', 'Опыт работы'], ['foundingYear', 'Год основания'],
      ['visitDuration', 'Сколько длится визит'], ['address.street', 'Адрес: улица, дом'], ['address.locality', 'Адрес: населённый пункт'], ['address.postalCode', 'Индекс'], ['mapUrl', 'Ссылка на карту']]],
    ['Юридическая информация', [['legal.name', 'Юр. лицо или ИП'], ['legal.inn', 'ИНН'], ['legal.ogrn', 'ОГРН / ОГРНИП'], ['legal.license', 'Лицензия']]],
    ['Районы выезда', [['districts.city', 'Районы города', 'через запятую', 'csv'], ['districts.suburbs', 'Пригороды', 'через запятую', 'csv']]],
    ['Заявки в Telegram', [['telegramBot.chatId', 'Кому приходят заявки', 'ID чатов через запятую'], ['telegramBot.token', 'Токен бота']]],
    ['Отзывы и поисковики', [['reviewLinks.yandex', 'Отзывы на Яндекс Картах (ссылка)'], ['reviewLinks.google', 'Отзывы в Google (ссылка)'], ['reviewLinks.twogis', 'Отзывы в 2ГИС (ссылка)'],
      ['analytics.metrika', 'Номер счётчика Яндекс Метрики'], ['verification.yandex', 'Код Яндекс Вебмастера', 'только код из content="…"'], ['verification.google', 'Код Google Search Console', 'только код из content="…"']]]
  ];
  function mainTab() {
    var out = [];
    FIELDS.forEach(function (sec) {
      var fields = sec[1].filter(function (f) { return getPath(S.site, f[0].split('.')[0]) !== undefined; }).map(function (f) {
        var key = f[0], type = f[3], v = getPath(S.site, key);
        var shown = Array.isArray(v) ? v.join(', ') : (v == null ? '' : v);
        var input = type === 'csv' ? h('textarea', { value: shown, rows: 3 }) : h('input', { type: 'text', value: shown });
        input.addEventListener('input', function () {
          var val = input.value;
          if (type === 'csv' || type === 'list') val = val.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
          setPath(S.site, key, val); saveSite();
        });
        return h('label', { class: 'f' }, h('span', null, f[1]), input, f[2] ? h('small', { class: 'hint' }, f[2]) : null);
      });
      out.push(h('h2', { class: 'sec' }, sec[0]), h('div', { class: 'card' }, h('div', { class: 'grid2' }, fields)));
    });
    var ta = h('textarea', { class: 'code', value: JSON.stringify(S.site, null, 2), style: 'min-height:50vh' });
    var err = h('p', { class: 'err' });
    ta.addEventListener('input', function () {
      try { S.site = JSON.parse(ta.value); err.textContent = ''; saveSite(); } catch (e) { err.textContent = 'Ошибка в данных: ' + e.message; }
    });
    out.push(h('h2', { class: 'sec' }, 'Для опытных'), h('details', { class: 'card' }, h('summary', null, 'Все данные сайта (site.json)'), h('p', { class: 'hint' }, 'Изменения здесь применяются сразу. Пустое значение — данных нет.'), err, ta));
    return out;
  }

  // ---------------------------------------------------------------- вкладка «Цены»
  function numInput(get, set) {
    var v = get();
    var i = h('input', { type: 'number', min: '0', step: '50', value: v == null ? '' : v, placeholder: 'нет' });
    i.addEventListener('input', function () { set(i.value === '' ? null : Number(i.value)); saveSite(); });
    return i;
  }
  function txtInput(get, set) {
    var i = h('input', { type: 'text', value: get() || '' });
    i.addEventListener('input', function () { set(i.value); saveSite(); });
    return i;
  }
  function pricesTab() {
    var W = S.site.weights || [], SV = S.site.services || {}, EX = S.site.extras || {}, Z = S.site.zones || [];
    var svc = h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, 'Услуга'), h('th', null, 'Пояснение'), W.map(function (w) { return h('th', null, w.label); }))),
      h('tbody', null, Object.keys(SV).map(function (k) {
        var s = SV[k]; s.prices = s.prices || {};
        return h('tr', null, h('td', null, txtInput(function () { return s.label; }, function (v) { s.label = v; })),
          h('td', null, txtInput(function () { return s.note; }, function (v) { s.note = v; })),
          W.map(function (w) { return h('td', null, numInput(function () { return s.prices[w.id]; }, function (v) { s.prices[w.id] = v; })); }));
      })));
    var wts = h('table', { class: 'tbl' }, h('tbody', null, h('tr', null, W.map(function (w) { return h('td', null, txtInput(function () { return w.label; }, function (v) { w.label = v; })); }))));
    var ex = h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, 'Услуга'), h('th', null, 'Пояснение'), h('th', null, 'Цена, ₽'))),
      h('tbody', null, Object.keys(EX).map(function (k) {
        var s = EX[k];
        return h('tr', null, h('td', null, txtInput(function () { return s.label; }, function (v) { s.label = v; })),
          h('td', null, txtInput(function () { return s.note; }, function (v) { s.note = v; })),
          h('td', null, numInput(function () { return s.price; }, function (v) { s.price = v; })));
      })));
    var zn = h('table', { class: 'tbl' },
      h('thead', null, h('tr', null, h('th', null, 'Зона'), h('th', null, 'Пояснение'), h('th', null, 'Доплата, ₽'))),
      h('tbody', null, Z.map(function (z) {
        return h('tr', null, h('td', null, txtInput(function () { return z.label; }, function (v) { z.label = v; })),
          h('td', null, txtInput(function () { return z.note; }, function (v) { z.note = v; })),
          h('td', null, numInput(function () { return z.price; }, function (v) { z.price = v; })));
      })));
    return [
      h('p', { class: 'hint' }, 'На сайте все цены показываются со словом «от». 0 — «бесплатно». Пустое поле — цены нет.'),
      h('h2', { class: 'sec' }, 'Основные услуги по весу питомца'), h('div', { class: 'card scroll-x' }, svc),
      h('h2', { class: 'sec' }, 'Названия весовых категорий'), h('div', { class: 'card scroll-x' }, wts),
      h('h2', { class: 'sec' }, 'Дополнительные услуги'), h('div', { class: 'card scroll-x' }, ex),
      h('h2', { class: 'sec' }, 'Выезд за город'), h('div', { class: 'card scroll-x' }, zn)
    ];
  }

  // ---------------------------------------------------------------- разбор страницы
  var BLOCK_TAGS = 'h1|h2|h3|h4|h5|h6|p|li|dt|dd|figcaption|blockquote|summary|td|th|span|a|strong';
  var INNER_BLOCKERS = /<(p|h[1-6]|li|ul|ol|div|section|article|aside|table|tr|img|picture|svg|form|input|select|textarea|button|details|dl|nav|header|footer|blockquote|figure|label|iframe)\b/i;
  var LABELS = { h1: 'Главный заголовок', h2: 'Заголовок', h3: 'Подзаголовок', h4: 'Подзаголовок', h5: 'Подзаголовок', h6: 'Подзаголовок', p: 'Абзац', li: 'Пункт списка', dt: 'Термин', dd: 'Описание', figcaption: 'Подпись', blockquote: 'Цитата', summary: 'Вопрос', td: 'Ячейка', th: 'Ячейка', span: 'Надпись', a: 'Кнопка / ссылка', strong: 'Надпись' };
  function findClose(text, tag, from) {
    var re = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'gi'); re.lastIndex = from; var depth = 1, m;
    while ((m = re.exec(text))) { if (m[1]) { if (--depth === 0) return m.index; } else if (!/\/>$/.test(m[0])) depth++; }
    return -1;
  }
  function attr(tagStr, name) { var m = tagStr.match(new RegExp('\\s' + name + '="([^"]*)"', 'i')); return m ? unesc(m[1]) : null; }
  function setAttr(tagStr, name, val) {
    var re = new RegExp('(\\s' + name + '=")[^"]*(")', 'i');
    if (re.test(tagStr)) return tagStr.replace(re, function (_, a, b) { return a + escA(val) + b; });
    return tagStr.replace(/\s*\/?>$/, function (end) { return ' ' + name + '="' + escA(val) + '"' + end; });
  }
  function parsePage(name) {
    var path = '_src/pages/' + name, text = cur(path) || '';
    var nl = text.indexOf('\n'), bodyStart = nl + 1;
    var meta = {}; try { meta = JSON.parse(text.slice(0, nl)); } catch (e) { /* пусто */ }
    var cands = [], re = new RegExp('<(' + BLOCK_TAGS + ')\\b[^>]*>', 'gi'), m;
    re.lastIndex = bodyStart;
    while ((m = re.exec(text))) {
      var tag = m[1].toLowerCase(), open = m[0];
      if ((tag === 'span' || tag === 'a' || tag === 'strong') && !/class="[^"]*(eyebrow|title|link-arrow|btn|lead|label)[^"]*"/.test(open)) continue;
      var openEnd = m.index + open.length, ci = findClose(text, tag, openEnd);
      if (ci < 0) continue;
      var inner = text.slice(openEnd, ci);
      if (INNER_BLOCKERS.test(inner) || /\{\{(part|prices|faq|crumbs|contactline)/.test(inner)) continue;
      if (!/[A-Za-zА-Яа-яЁё]/.test(inner.replace(/\{\{[^}]*\}\}/g, '').replace(/<[^>]*>/g, ''))) continue;
      var ls = text.lastIndexOf('\n', m.index) + 1, ind = text.slice(ls, m.index);
      cands.push({ kind: 'text', start: m.index, end: ci + tag.length + 3, open: open, tag: tag, inner: inner, cur: inner, del: false, added: [], indent: /^\s*$/.test(ind) ? ind : '' });
    }
    cands.sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    var blocks = [], lastEnd = -1;
    cands.forEach(function (c) { if (c.start >= lastEnd) { blocks.push(c); lastEnd = c.end; } });
    var imgs = [], ri = /<img\b[^>]*>/gi;
    ri.lastIndex = bodyStart;
    while ((m = ri.exec(text))) {
      var src = attr(m[0], 'src') || '';
      if (!/^assets\//.test(src)) continue;
      var im = { kind: 'img', start: m.index, end: m.index + m[0].length, tagStr: m[0], src: src, alt: attr(m[0], 'alt') || '', w: +attr(m[0], 'width') || 0, h: +attr(m[0], 'height') || 0, newSrc: null, newAlt: null, sources: [] };
      var ps = text.lastIndexOf('<picture', m.index);
      if (ps > -1 && ps > text.lastIndexOf('</picture>', m.index)) {
        var rs = /<source\b[^>]*>/gi, sm; rs.lastIndex = ps;
        while ((sm = rs.exec(text)) && sm.index < m.index) {
          var set = (attr(sm[0], 'srcset') || '').split(',').map(function (x) { var p = x.trim().split(/\s+/); return { url: p[0], w: parseInt(p[1], 10) || 0 }; }).filter(function (x) { return x.url && x.w; });
          if (set.length) im.sources.push({ start: sm.index, end: sm.index + sm[0].length, tagStr: sm[0], srcset: set, newTag: null });
        }
      }
      imgs.push(im);
    }
    return { name: name, path: path, text: text, bodyStart: bodyStart, meta: meta, metaChanged: false, blocks: blocks, imgs: imgs, raw: false };
  }
  function composePage(P) {
    var patches = [];
    P.blocks.forEach(function (b) {
      var live = b.added.filter(function (a) { return !a.del; });
      if (!b.del && b.cur === b.inner && !live.length) return;
      var s = b.del ? '' : b.open + b.cur + '</' + b.tag + '>';
      live.forEach(function (a) { s += '\n' + b.indent + a.open + a.cur + '</' + a.tag + '>'; });
      if (b.del && live.length) s = s.replace(/^\n\s*/, '');
      var st = b.start, en = b.end;
      if (!s && b.indent && P.text[en] === '\n') { st -= b.indent.length; en += 1; } // убираем и пустую строку
      patches.push({ start: st, end: en, text: s });
    });
    P.imgs.forEach(function (im) {
      if (im.newSrc || im.newAlt != null) {
        var t = im.tagStr;
        if (im.newSrc) t = setAttr(t, 'src', im.newSrc);
        if (im.newAlt != null) t = setAttr(t, 'alt', im.newAlt);
        patches.push({ start: im.start, end: im.end, text: t });
      }
      im.sources.forEach(function (so) { if (so.newTag) patches.push({ start: so.start, end: so.end, text: so.newTag }); });
    });
    patches.sort(function (a, b) { return b.start - a.start; });
    var t = P.text;
    patches.forEach(function (p) { t = t.slice(0, p.start) + p.text + t.slice(p.end); });
    if (P.metaChanged) t = pyjson(P.meta) + '\n' + t.slice(P.bodyStart);
    return t;
  }
  function savePage(P) { stageText(P.path, composePage(P)); }
  function cleanInline(html) {
    return html.replace(/<b>/g, '<strong>').replace(/<\/b>/g, '</strong>').replace(/<i>/g, '<em>').replace(/<\/i>/g, '</em>')
      .replace(/\sstyle="[^"]*"/g, '').replace(/<span>([\s\S]*?)<\/span>/g, '$1').replace(/(<br>)+$/, '').replace(/&nbsp;/g, ' ');
  }

  // ---------------------------------------------------------------- вкладка «Страницы и тексты»
  var tool = null, toolTarget = null;
  function inlineTool() {
    if (tool) return tool;
    function b(label, title, fn) { return h('button', { type: 'button', title: title, onmousedown: function (e) { e.preventDefault(); fn(); if (toolTarget) toolTarget.dispatchEvent(new Event('input')); } }, label); }
    tool = h('div', { class: 'tool' },
      b('Ж', 'Жирный', function () { document.execCommand('bold'); }),
      b('К', 'Курсив', function () { document.execCommand('italic'); }),
      b('Ссылка', 'Сделать ссылкой', function () { var u = prompt('Адрес ссылки (например, kontakty.html или https://…)'); if (u) document.execCommand('createLink', false, u); }),
      b('Убрать ссылку', 'Убрать ссылку', function () { document.execCommand('unlink'); }));
    document.body.append(tool);
    return tool;
  }
  function showTool(el) {
    var t = inlineTool(); toolTarget = el; var r = el.getBoundingClientRect();
    t.style.display = 'flex'; t.style.left = Math.max(8, r.left) + 'px'; t.style.top = Math.max(8, r.top - 40) + 'px';
  }
  function hideTool() { if (tool) tool.style.display = 'none'; toolTarget = null; }
  window.addEventListener('scroll', function () { if (toolTarget) showTool(toolTarget); }, { passive: true });

  // {{…}} в тексте показываем плашками, которые нельзя случайно испортить
  function tokLabel(t) {
    if (/^i:/.test(t)) return '◆';
    if (/^price:/.test(t)) return 'цена';
    var m = { cityIn: 'в городе', 'd:phone': 'телефон', 'd:hours': 'часы работы', 'd:city': 'город', 'd:email': 'e-mail', 'd:area': 'зона выезда', 'd:area-short': 'зона выезда', 'd:experience': 'опыт', 'd:duration': 'длительность', 'd:address': 'адрес', 'd:legal': 'реквизиты' };
    return m[t] || t;
  }
  function toDisplay(html) {
    return html.replace(/\{\{([^}]+)\}\}/g, function (_, t) { return '<span class="tok" contenteditable="false" data-t="' + escA(t) + '">' + esc(tokLabel(t)) + '</span>'; })
      .replace(/<!--([\s\S]*?)-->/g, function (_, c) { return '<span class="tok tok--c" contenteditable="false" data-c="' + escA(c) + '"></span>'; });
  }
  function fromDisplay(html) {
    return html.replace(/<span class="tok" contenteditable="false" data-t="([^"]*)">[\s\S]*?<\/span>/g, function (_, t) { return '{{' + unesc(t) + '}}'; })
      .replace(/<span class="tok tok--c" contenteditable="false" data-c="([^"]*)"><\/span>/g, function (_, c) { return '<!--' + unesc(c) + '-->'; });
  }
  function editable(cls, html, onChange) {
    var el = h('div', { class: 'blk__ed ' + cls, contenteditable: 'true', spellcheck: 'true' });
    el.innerHTML = toDisplay(html);
    var init = el.innerHTML;
    el.addEventListener('focus', function () { showTool(el); });
    el.addEventListener('blur', function () { setTimeout(function () { if (document.activeElement !== el) hideTool(); }, 150); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); document.execCommand('insertLineBreak'); } });
    el.addEventListener('paste', function (e) { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s*\n\s*/g, ' ')); });
    el.addEventListener('input', function () {
      var changed = el.innerHTML !== init;
      el.classList.toggle('changed', changed);
      onChange(changed ? fromDisplay(cleanInline(el.innerHTML)) : null);
    });
    return el;
  }
  function pagesTab() {
    if (!S.page || S.pages.indexOf(S.page) < 0) S.page = S.pages.indexOf('index.html') >= 0 ? 'index.html' : S.pages[0];
    var list = h('div', { class: 'list' }, S.pages.map(function (n) {
      var meta = {}; try { meta = JSON.parse((cur('_src/pages/' + n) || '').split('\n')[0]); } catch (e) { /* пусто */ }
      var t = (meta.title || n).split(' — ')[0];
      return h('button', { 'aria-current': String(S.page === n), onclick: function () { S.page = n; S.pageEd = null; render(); window.scrollTo(0, 0); } }, t, h('small', null, n));
    }));
    return h('div', { class: 'split' }, list, h('div', { id: 'page-ed' }, pageEditor()));
  }
  function rerenderPage() { var el = document.getElementById('page-ed'); var y = window.scrollY; if (el) { el.replaceChildren(); add(el, pageEditor()); } window.scrollTo(0, y); }
  function pageEditor() {
    if (!S.pageEd || S.pageEd.name !== S.page) S.pageEd = parsePage(S.page);
    var P = S.pageEd;
    var live = SITE + (P.name === 'index.html' ? '' : P.name);
    var head = h('div', { class: 'row' }, h('h2', { class: 'sec', style: 'margin:0' }, (P.meta.title || P.name).split(' — ')[0]), h('span', { class: 'spacer' }),
      h('a', { class: 'btn btn--sm', href: live, target: '_blank', rel: 'noopener' }, 'Открыть на сайте ↗'),
      h('button', { class: 'btn btn--sm', onclick: function () {
        if (P.raw) { S.pageEd = parsePage(P.name); } else { P.raw = true; }
        rerenderPage();
      } }, P.raw ? 'Вернуться к простому режиму' : 'Код страницы'));
    if (P.raw) {
      var ta = h('textarea', { class: 'code', value: composePage(P) });
      ta.addEventListener('input', function () { stageText(P.path, ta.value); });
      return [head, h('p', { class: 'hint' }, 'Для опытных: HTML-код страницы. Первая строка — заголовок и описание в формате JSON. {{…}} — автоматические вставки (телефон, цены, блоки).'), ta];
    }
    function metaField(label, key, max) {
      var i = h('input', { type: 'text', value: P.meta[key] || '' });
      var cnt = h('span', { class: 'count' });
      function upd() { cnt.textContent = i.value.length + ' / ' + max; cnt.classList.toggle('bad', i.value.length > max); }
      i.addEventListener('input', function () { P.meta[key] = i.value; P.metaChanged = true; upd(); savePage(P); });
      upd();
      return h('label', { class: 'f' }, h('span', null, label, cnt), i);
    }
    var items = P.blocks.concat(P.imgs).sort(function (a, b) { return a.start - b.start; });
    var rows = [];
    items.forEach(function (it) {
      if (it.kind === 'img') { rows.push(imgRow(P, it)); return; }
      rows.push(blockRow(P, it, null));
      it.added.forEach(function (a) { rows.push(blockRow(P, a, it)); });
    });
    return [head,
      h('div', { class: 'card' },
        metaField('Заголовок в поиске и на вкладке браузера', 'title', 65),
        metaField('Описание для поисковиков', 'description', 160)),
      h('h2', { class: 'sec' }, 'Тексты и фото'),
      h('p', { class: 'hint' }, 'Кликните по тексту и правьте. Жёлтым подсвечены изменённые места. Серые плашки — автоматические вставки (телефон, иконки, цены): они подставляются сами, их значения меняются во вкладках «Цены» и «Контакты и данные».'),
      h('div', { class: 'card' }, rows.length ? rows : h('p', { class: 'hint' }, 'На этой странице нет простых текстов — используйте «Код страницы».'))];
  }
  function blockRow(P, b, parent) {
    var ed = editable(b.tag, b.cur, function (v) {
      b.cur = v == null ? b.inner : v;
      if (b.tag === 'h1' && P.meta.article) { P.meta.article.headline = textOf(b.cur); P.metaChanged = true; }
      savePage(P);
    });
    if (b.isNew) { ed.classList.add('changed'); }
    var menu = h('div', { class: 'row', hidden: true, style: 'grid-column:1/-1;padding-left:4px' }, h('span', { class: 'hint' }, 'Добавить ниже:'),
      (b.tag === 'li' ? [['li', 'Пункт списка']] : [['p', 'Абзац'], ['h2', 'Заголовок'], ['h3', 'Подзаголовок']]).map(function (o) {
        return h('button', { class: 'btn btn--sm', onclick: function () {
          var host = parent || b;
          var nb = { kind: 'text', tag: o[0], open: o[0] === b.tag ? b.open : '<' + o[0] + '>', inner: '', cur: 'Новый текст', del: false, isNew: true, added: [] };
          var idx = parent ? host.added.indexOf(b) + 1 : 0;
          host.added.splice(idx, 0, nb);
          savePage(P); rerenderPage();
        } }, o[1]);
      }));
    var row = h('div', { class: 'blk' + (b.del ? ' del' : '') + (b.isNew ? ' new' : '') },
      h('div', { class: 'blk__tag' }, h('b', null, LABELS[b.tag] || b.tag), b.isNew ? 'новый' : null),
      ed,
      h('div', { class: 'blk__act' },
        h('button', { class: 'btn', title: 'Добавить ниже', onclick: function () { menu.hidden = !menu.hidden; } }, '+'),
        h('button', { class: 'btn btn--danger', title: b.del ? 'Вернуть' : 'Удалить', onclick: function () { b.del = !b.del; savePage(P); rerenderPage(); } }, b.del ? '↺' : '✕')),
      menu);
    return row;
  }
  function imgRow(P, im) {
    var src = im.newSrc || im.src;
    var alt = h('input', { type: 'text', value: im.newAlt != null ? im.newAlt : im.alt });
    alt.addEventListener('input', function () { im.newAlt = alt.value === im.alt ? null : alt.value; savePage(P); });
    var note = h('p', { class: 'hint' }, 'Размер на сайте: ' + (im.w && im.h ? im.w + '×' + im.h : 'авто') + '. Новое фото само обрежется под этот размер и сожмётся.' + (im.sources.length ? ' Будут созданы версии для телефона и компьютера.' : ''));
    var btn = h('button', { class: 'btn', onclick: async function () {
      var f = (await pickFile())[0]; if (!f) return;
      btn.disabled = true; btn.textContent = 'Обрабатываю…';
      try { await replacePageImage(im, f); savePage(P); rerenderPage(); }
      catch (e) { alert(e.message); btn.disabled = false; btn.textContent = 'Заменить фото'; }
    } }, 'Заменить фото');
    return h('div', { class: 'img-blk' }, h('img', { src: imgUrl(src), alt: '' }),
      h('div', null, h('label', { class: 'f' }, h('span', null, 'Описание фото (alt) — для поисковиков и незрячих'), alt), note,
        h('div', { class: 'row' }, btn, im.newSrc ? h('span', { class: 'ok' }, 'Фото заменено') : null)));
  }
  async function replacePageImage(im, f) {
    var img = await fileImg(f);
    var W = im.w || img.naturalWidth, H = im.h || img.naturalHeight;
    var base = 'assets/img/' + baseName(im.src) + '-' + stamp();
    if (im.newSrc && S.changes.has(im.newSrc)) S.changes.delete(im.newSrc);
    if (im.sources.length) {
      var widths = [];
      im.sources.forEach(function (so) { so.srcset.forEach(function (x) { if (widths.indexOf(x.w) < 0) widths.push(x.w); }); });
      widths.sort(function (a, b) { return a - b; });
      var map = {}, ext = 'webp';
      for (var i = 0; i < widths.length; i++) {
        var r = await encode(img, widths[i], widths[i] * H / W);
        var p = base + '-' + widths[i] + '.' + r.ext; ext = r.ext;
        stageBin(p, r.b64, r.url); map[widths[i]] = p;
      }
      im.sources.forEach(function (so) {
        var t = setAttr(so.tagStr, 'srcset', so.srcset.map(function (x) { return map[x.w] + ' ' + x.w + 'w'; }).join(', '));
        if (ext !== 'webp' && /type="/.test(t)) t = setAttr(t, 'type', 'image/jpeg');
        so.newTag = t;
      });
      im.newSrc = map[widths[widths.length - 1]];
    } else {
      var w = Math.min(W, 1600), r2 = await encode(img, w, w * H / W);
      im.newSrc = base + '.' + r2.ext;
      stageBin(im.newSrc, r2.b64, r2.url);
    }
  }

  // ---------------------------------------------------------------- вкладка «Статьи»
  function articlesTab() {
    if (S.newArticle) return newArticleForm();
    var rows = S.articles.map(function (a, i) {
      var open = S.editCard === a.file;
      return h('div', { class: 'card' },
        h('div', { class: 'art' },
          a.img ? h('img', { src: imgUrl(a.img), alt: '' }) : h('div', { class: 'noimg' }),
          h('div', null, h('b', null, a.title), h('div', { class: 'hint' }, (CATS[a.cat] || a.label) + ' · ' + a.file)),
          h('div', { class: 'row' },
            h('button', { class: 'btn btn--sm', disabled: i === 0, title: 'Выше', onclick: function () { move(i, -1); } }, '↑'),
            h('button', { class: 'btn btn--sm', disabled: i === S.articles.length - 1, title: 'Ниже', onclick: function () { move(i, 1); } }, '↓'),
            h('button', { class: 'btn btn--sm', onclick: function () { S.page = a.file; S.pageEd = null; go('pages'); } }, 'Текст статьи'),
            h('button', { class: 'btn btn--sm', onclick: function () { S.editCard = open ? null : a.file; render(); } }, open ? 'Свернуть' : 'Карточка'),
            h('button', { class: 'btn btn--sm btn--danger', onclick: function () { deleteArticle(a); } }, 'Удалить'))),
        open ? cardForm(a) : null);
    });
    return [h('div', { class: 'row' }, h('h2', { class: 'sec', style: 'margin:0' }, 'Статьи'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', onclick: function () { S.newArticle = { title: '', desc: '', cat: 'posle', minutes: 3, body: '', img: null }; render(); } }, '+ Новая статья')),
    h('p', { class: 'hint' }, 'Порядок здесь = порядок на сайте. Первые три статьи показываются на главной, первые шесть — в меню «Полезное».'),
    h('div', { class: 'stack' }, rows)];
  }
  function move(i, d) { var a = S.articles.splice(i, 1)[0]; S.articles.splice(i + d, 0, a); saveArticles(); render(); }
  function catSelect(val, onChange) {
    var s = h('select', null, Object.keys(CATS).map(function (k) { return h('option', { value: k, selected: k === val }, CATS[k]); }));
    s.addEventListener('change', function () { onChange(s.value); });
    return s;
  }
  function cardForm(a) {
    function f(label, key, max, area) {
      var i = h(area ? 'textarea' : 'input', { type: 'text', value: a[key] || '', rows: area ? 3 : null });
      var cnt = max ? h('span', { class: 'count' }) : null;
      function upd() { if (cnt) { cnt.textContent = i.value.length + ' / ' + max; cnt.classList.toggle('bad', i.value.length > max); } }
      i.addEventListener('input', function () { a[key] = i.value; upd(); saveArticles(); });
      upd();
      return h('label', { class: 'f' }, h('span', null, label, cnt), i);
    }
    var btn = h('button', { class: 'btn', onclick: async function () {
      var file = (await pickFile())[0]; if (!file) return;
      var r = await encode(await fileImg(file), 640, 480);
      var p = 'assets/img/art-' + translit(a.title).split('-').slice(0, 4).join('-') + '-' + stamp() + '.' + r.ext;
      if (a.img && S.changes.has(a.img) && !(a.img in S.files)) S.changes.delete(a.img);
      stageBin(p, r.b64, r.url); S.images.push({ name: p.split('/').pop(), path: p, size: r.size, staged: true, url: r.url });
      a.img = p; saveArticles(); render();
    } }, a.img ? 'Заменить картинку' : 'Добавить картинку');
    return h('div', { style: 'margin-top:14px' }, h('div', { class: 'grid2' },
      f('Заголовок на карточке', 'title', 90), f('Короткое название для меню', 'navTitle', 45),
      h('label', { class: 'f' }, h('span', null, 'Рубрика'), catSelect(a.cat, function (v) { a.cat = v; a.label = CATS[v]; a.icon = CAT_ICON[v]; saveArticles(); })),
      f('Подпись к картинке (alt)', 'alt', 120)),
    f('Описание на карточке', 'desc', 160, true), btn,
    h('p', { class: 'hint' }, 'Картинка карточки сама обрежется до 4:3 и сожмётся. Заголовок и текст самой статьи — кнопка «Текст статьи».'));
  }
  function deleteArticle(a) {
    if (!confirm('Удалить статью «' + a.title + '»? Ссылки на неё с других страниц тоже уберутся.')) return;
    var path = '_src/pages/' + a.file;
    stageDel(path);
    S.articles = S.articles.filter(function (x) { return x !== a; }); saveArticles();
    var re = new RegExp('<a class="link-arrow" href="' + a.file.replace(/\./g, '\\.') + '[^"]*"[^>]*>[\\s\\S]*?</a>\\s*', 'g');
    S.pages.forEach(function (n) {
      var p = '_src/pages/' + n; if (p === path) return;
      var t = cur(p); if (t && re.test(t)) { re.lastIndex = 0; stageText(p, t.replace(re, '')); }
    });
    var keepArticles = S.articles; reloadData(); S.articles = keepArticles;
    render(); toast('Статья удалена из черновика. Нажмите «Опубликовать», чтобы убрать её с сайта.');
  }
  function rteToHtml(root) {
    var BLOCK = { H2: 'h2', H3: 'h3', P: 'p', DIV: 'p', UL: 'ul', OL: 'ol', BLOCKQUOTE: 'blockquote', H1: 'h2', H4: 'h3' };
    var INL = { STRONG: 'strong', B: 'strong', EM: 'em', I: 'em', A: 'a', BR: 'br' };
    function inline(n) {
      var out = '';
      n.childNodes.forEach(function (c) {
        if (c.nodeType === 3) { out += esc(c.textContent); return; }
        if (c.nodeType !== 1) return;
        var t = INL[c.tagName], inner = inline(c);
        if (t === 'br') out += '<br>';
        else if (t === 'a') { var href = c.getAttribute('href') || ''; out += /^(https?:|mailto:|tel:|[a-z0-9-]+\.html|#)/i.test(href) ? '<a href="' + escA(href) + '">' + inner + '</a>' : inner; }
        else if (t) out += '<' + t + '>' + inner + '</' + t + '>';
        else out += inner;
      });
      return out;
    }
    var lines = [], loose = '';
    function flush() { if (loose.trim()) lines.push('<p>' + loose.trim() + '</p>'); loose = ''; }
    root.childNodes.forEach(function (c) {
      var t = c.nodeType === 1 ? BLOCK[c.tagName] : null;
      if (!t) { loose += c.nodeType === 3 ? esc(c.textContent) : (c.nodeType === 1 ? inline({ childNodes: [c] }) : ''); return; }
      flush();
      if (t === 'ul' || t === 'ol') {
        var lis = Array.from(c.children).filter(function (x) { return x.tagName === 'LI'; }).map(function (li) { return '        <li>' + inline(li).replace(/(<br>)+$/, '') + '</li>'; });
        if (lis.length) lines.push('<' + t + '>\n' + lis.join('\n') + '\n      </' + t + '>');
      } else {
        var inner = inline(c).replace(/(<br>)+$/, '').trim();
        if (inner) lines.push('<' + t + '>' + inner + '</' + t + '>');
      }
    });
    flush();
    return lines.map(function (l) { return '      ' + l; }).join('\n\n').replace(/&nbsp;/g, ' ');
  }
  function newArticleForm() {
    var A = S.newArticle;
    function f(label, key, max, area) {
      var i = h(area ? 'textarea' : 'input', { type: 'text', value: A[key] || '', rows: area ? 3 : null });
      var cnt = h('span', { class: 'count' });
      function upd() { cnt.textContent = i.value.length + ' / ' + max; cnt.classList.toggle('bad', i.value.length > max); }
      i.addEventListener('input', function () { A[key] = i.value; upd(); });
      upd();
      return h('label', { class: 'f' }, h('span', null, label, cnt), i);
    }
    var rte = h('div', { class: 'rte', contenteditable: 'true', spellcheck: 'true' });
    rte.innerHTML = A.body || '<p><br></p>';
    rte.addEventListener('input', function () { A.body = rte.innerHTML; });
    rte.addEventListener('focus', function () { document.execCommand('defaultParagraphSeparator', false, 'p'); });
    rte.addEventListener('paste', function (e) {
      e.preventDefault();
      var t = e.clipboardData.getData('text/plain') || '';
      var html = t.split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');
      document.execCommand('insertHTML', false, html);
    });
    function cmd(label, fn) { return h('button', { class: 'btn btn--sm', type: 'button', onmousedown: function (e) { e.preventDefault(); fn(); A.body = rte.innerHTML; } }, label); }
    var bar = h('div', { class: 'rte-bar' },
      cmd('Заголовок', function () { document.execCommand('formatBlock', false, 'h2'); }),
      cmd('Подзаголовок', function () { document.execCommand('formatBlock', false, 'h3'); }),
      cmd('Абзац', function () { document.execCommand('formatBlock', false, 'p'); }),
      cmd('• Список', function () { document.execCommand('insertUnorderedList'); }),
      cmd('1. Список', function () { document.execCommand('insertOrderedList'); }),
      cmd('Цитата', function () { document.execCommand('formatBlock', false, 'blockquote'); }),
      cmd('Ж', function () { document.execCommand('bold'); }),
      cmd('К', function () { document.execCommand('italic'); }),
      cmd('Ссылка', function () { var u = prompt('Адрес ссылки (например, kremaciya.html или https://…)'); if (u) document.execCommand('createLink', false, u); }));
    var imgBox = h('div', { class: 'row' });
    function drawImg() {
      imgBox.replaceChildren(A.img ? h('img', { src: A.img.url, style: 'width:160px;height:120px;object-fit:cover;border-radius:10px' }) : h('span', { class: 'hint' }, 'Без картинки будет показана иконка.'),
        h('button', { class: 'btn', onclick: async function () {
          var file = (await pickFile())[0]; if (!file) return;
          A.img = await encode(await fileImg(file), 640, 480); drawImg();
        } }, A.img ? 'Другая картинка' : 'Выбрать картинку'));
    }
    drawImg();
    var minutes = h('input', { type: 'number', min: '1', max: '30', value: A.minutes });
    minutes.addEventListener('input', function () { A.minutes = +minutes.value || 3; });
    var err = h('p', { class: 'err' });
    return [h('div', { class: 'row' }, h('h2', { class: 'sec', style: 'margin:0' }, 'Новая статья'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn', onclick: function () { if (!A.title && !textOf(A.body) || confirm('Закрыть без сохранения?')) { S.newArticle = null; render(); } } }, 'Отмена')),
    h('div', { class: 'card' },
      f('Заголовок статьи', 'title', 90),
      f('Короткое описание (для карточки и поисковиков)', 'desc', 160, true),
      h('div', { class: 'grid2' },
        h('label', { class: 'f' }, h('span', null, 'Рубрика'), catSelect(A.cat, function (v) { A.cat = v; })),
        h('label', { class: 'f' }, h('span', null, 'Время чтения, минут'), minutes)),
      h('div', { class: 'f' }, h('span', { style: 'display:block;font-weight:600;font-size:.9rem;margin-bottom:4px' }, 'Картинка (обрежется до 4:3)'), imgBox)),
    h('h2', { class: 'sec' }, 'Текст'),
    h('div', { class: 'card' }, bar, rte, h('p', { class: 'hint' }, 'Можно вставить готовый текст — каждая строка станет абзацем. Выделите строку и нажмите «Заголовок», чтобы сделать раздел.')),
    err,
    h('div', { class: 'row', style: 'margin-top:14px' }, h('span', { class: 'spacer' }), h('button', { class: 'btn btn--primary', onclick: function () {
      err.textContent = '';
      if (A.title.trim().length < 5) { err.textContent = 'Напишите заголовок.'; return; }
      if (!A.desc.trim()) { err.textContent = 'Напишите короткое описание.'; return; }
      var body = rteToHtml(rte);
      if (body.length < 40) { err.textContent = 'Добавьте текст статьи.'; return; }
      createArticle(A, body);
    } }, 'Добавить статью'))];
  }
  function createArticle(A, body) {
    var slug = translit(A.title).split('-').slice(0, 5).join('-');
    var file = 'stati-' + slug + '.html', n = 2;
    while (cur('_src/pages/' + file) != null) file = 'stati-' + slug + '-' + (n++) + '.html';
    var label = CATS[A.cat], title = A.title.trim(), desc = A.desc.trim().replace(/\s+/g, ' ');
    var brand = S.site.brand || 'Ветслужба СПб';
    var meta = { title: title + ' — ' + brand, description: desc, nav: 'stati', crumbs: [['Полезное', 'stati.html'], [label, '']], article: { headline: title, datePublished: today() } };
    var others = S.articles.slice(0, 2).map(function (o) { return '        <a class="link-arrow" href="' + o.file + '">' + esc(o.navTitle || o.title) + '{{i:arrow-right}}</a>'; }).join('\n');
    var tpl = pyjson(meta) + '\n' +
      '<section class="page-hero">\n  <div class="container">\n    {{crumbs}}\n    <div class="page-hero__text article-head">\n' +
      '      <span class="eyebrow">' + esc(label) + '</span>\n      <h1>' + esc(title) + '</h1>\n' +
      '      <div class="article-meta"><span>{{i:clock}}' + (A.minutes || 3) + ' ' + minutesWord(A.minutes || 3) + ' чтения</span><span>{{i:book}}Памятка владельцу</span></div>\n' +
      '    </div>\n  </div>\n</section>\n\n<section class="section section--tight">\n  <div class="container article-layout">\n    <article class="prose">\n' +
      body + '\n    </article>\n    <aside class="article-aside">\n      <div class="side-card">\n        <span class="side-card__title">Мы рядом</span>\n' +
      '        <p class="small muted">Если остались вопросы, позвоните — ответим спокойно и подробно.</p>\n        <!--if:phone-->{{d:phone}}<!--/if:phone-->\n      </div>\n' +
      (others ? '      <div class="side-card">\n        <span class="side-card__title">Читайте также</span>\n' + others + '\n      </div>\n' : '') +
      '    </aside>\n  </div>\n</section>\n';
    stageText('_src/pages/' + file, tpl);
    var img = '';
    if (A.img) {
      img = 'assets/img/art-' + slug.split('-').slice(0, 4).join('-') + '-' + stamp() + '.' + A.img.ext;
      stageBin(img, A.img.b64, A.img.url);
      S.images.push({ name: img.split('/').pop(), path: img, size: A.img.size, staged: true, url: A.img.url });
    }
    S.articles.unshift({ file: file, icon: CAT_ICON[A.cat], cat: A.cat, label: label, title: title, desc: desc, img: img, alt: img ? 'Иллюстрация к статье: ' + title : '', navTitle: '' });
    saveArticles();
    var keep = S.articles; reloadData(); S.articles = keep;
    S.newArticle = null; render();
    toast('Статья добавлена в черновик. Нажмите «Опубликовать».', 5000);
  }
  function minutesWord(n) { n = Math.abs(n) % 100; var n1 = n % 10; if (n > 10 && n < 20) return 'минут'; if (n1 > 1 && n1 < 5) return 'минуты'; if (n1 === 1) return 'минута'; return 'минут'; }

  // ---------------------------------------------------------------- вкладка «Отзывы»
  var REVIEW_SOURCES = [['site', 'Прислали нам напрямую'], ['yandex', 'Яндекс Карты'], ['twogis', '2ГИС'], ['google', 'Google Карты'], ['avito', 'Авито'], ['whatsapp', 'WhatsApp'], ['telegram', 'Telegram'], ['vk', 'ВКонтакте']];
  function reviewsTab() {
    var cards = S.reviews.map(function (r, i) {
      function fld(label, key, opts) {
        opts = opts || {};
        var el;
        if (opts.select) {
          el = h('select', null, opts.select.map(function (o) { return h('option', { value: o[0], selected: String(r[key] == null ? '' : r[key]) === String(o[0]) }, o[1]); }));
          el.addEventListener('change', function () { r[key] = opts.num ? +el.value : el.value; saveReviews(); refreshHead(); });
        } else {
          el = h(opts.area ? 'textarea' : 'input', { type: opts.type || 'text', value: r[key] || '', rows: opts.area ? 6 : null, placeholder: opts.ph || null });
          el.addEventListener('input', function () { r[key] = el.value; saveReviews(); refreshHead(); });
        }
        return h('label', { class: 'f' }, h('span', null, label), el, opts.hint ? h('small', { class: 'hint' }, opts.hint) : null);
      }
      var head = h('div', { class: 'row' });
      function refreshHead() {
        var ok = r.consent && (r.name || '').trim() && (r.text || '').trim();
        head.replaceChildren(h('b', null, (r.name || '').trim() || 'Новый отзыв'),
          h('span', { class: ok ? 'ok' : 'err', style: 'font-size:.85rem' }, ok ? '● будет на сайте' : '● не показывается: ' + (!r.consent ? 'нет согласия клиента' : 'заполните имя и текст')),
          h('span', { class: 'spacer' }),
          h('button', { class: 'btn btn--sm', disabled: i === 0, title: 'Выше', onclick: function () { var x = S.reviews.splice(i, 1)[0]; S.reviews.splice(i - 1, 0, x); saveReviews(); render(); } }, '↑'),
          h('button', { class: 'btn btn--sm', disabled: i === S.reviews.length - 1, title: 'Ниже', onclick: function () { var x = S.reviews.splice(i, 1)[0]; S.reviews.splice(i + 1, 0, x); saveReviews(); render(); } }, '↓'),
          h('button', { class: 'btn btn--sm btn--danger', onclick: function () { if (confirm('Удалить отзыв' + (r.name ? ' от ' + r.name : '') + '?')) { S.reviews.splice(i, 1); saveReviews(); render(); } } }, 'Удалить'));
      }
      refreshHead();
      var consent = h('input', { type: 'checkbox', checked: !!r.consent });
      consent.addEventListener('change', function () { r.consent = consent.checked; saveReviews(); refreshHead(); });
      return h('div', { class: 'card' }, head,
        h('div', { class: 'grid2', style: 'margin-top:12px' },
          fld('Имя клиента (как подписать)', 'name', { ph: 'Например: Ольга К.' }),
          fld('Питомец', 'pet', { ph: 'Например: кот Барсик', hint: 'необязательно' }),
          fld('Когда оставлен отзыв', 'date', { type: 'month' }),
          fld('Откуда отзыв', 'source', { select: REVIEW_SOURCES }),
          fld('Оценка', 'rating', { select: [[0, 'Без звёзд'], [5, '★★★★★'], [4, '★★★★'], [3, '★★★'], [2, '★★'], [1, '★']], num: true }),
          fld('Ссылка на оригинал', 'link', { ph: 'https://…', hint: 'необязательно: ссылка на отзыв на картах' })),
        fld('Текст отзыва', 'text', { area: true, hint: 'Копируйте как есть, без изменений смысла. Новая строка — новый абзац.' }),
        h('label', { class: 'row', style: 'gap:10px;cursor:pointer' }, consent, h('span', null, 'Клиент разрешил опубликовать этот отзыв на сайте')));
    });
    return [h('div', { class: 'row' }, h('h2', { class: 'sec', style: 'margin:0' }, 'Отзывы клиентов'), h('span', { class: 'spacer' }),
      h('button', { class: 'btn btn--primary', onclick: function () { S.reviews.unshift({ name: '', pet: '', date: today().slice(0, 7), source: 'site', rating: 5, link: '', text: '', consent: false }); saveReviews(); render(); } }, '+ Добавить отзыв')),
    h('p', { class: 'hint' }, 'Только настоящие отзывы и только с согласия клиента — без отметки о согласии отзыв на сайте не появится. Порядок здесь = порядок на сайте; на главной показываются первые шесть. Когда есть хотя бы один отзыв, на главной появляется блок «Что о нас говорят».'),
    S.reviews.length ? h('div', { class: 'stack' }, cards) : h('div', { class: 'card' }, h('p', { class: 'hint', style: 'margin:0' }, 'Отзывов пока нет. Нажмите «+ Добавить отзыв».'))];
  }

  // ---------------------------------------------------------------- вкладка «Фото»
  function usage(path) {
    var files = S.pages.map(function (n) { return '_src/pages/' + n; }).concat(['_src/articles.json']);
    return files.filter(function (p) { var t = cur(p); return t && t.indexOf(path) >= 0; });
  }
  function photosTab() {
    var up = h('button', { class: 'btn btn--primary', onclick: async function () {
      var fs = await pickFile(true); if (!fs.length) return;
      up.disabled = true; up.textContent = 'Обрабатываю…';
      try {
        for (var i = 0; i < fs.length; i++) {
          var img = await fileImg(fs[i]);
          var w = Math.min(1600, img.naturalWidth), r = await encode(img, w, w * img.naturalHeight / img.naturalWidth);
          var p = 'assets/img/' + translit(fs[i].name.replace(/\.[^.]+$/, '')).slice(0, 40) + '-' + stamp() + '.' + r.ext;
          stageBin(p, r.b64, r.url);
          S.images.unshift({ name: p.split('/').pop(), path: p, size: r.size, staged: true, url: r.url });
        }
      } catch (e) { alert(e.message); }
      render();
    } }, '+ Загрузить фото');
    var cards = S.images.map(function (im) {
      var del = S.changes.has(im.path) && S.changes.get(im.path).del;
      var used = usage(im.path), prot = PROTECTED_IMG.indexOf(im.name) >= 0;
      var rep = h('button', { class: 'btn btn--sm', disabled: del || /\.svg$/i.test(im.name), onclick: async function () {
        var f = (await pickFile())[0]; if (!f) return;
        rep.disabled = true; rep.textContent = 'Обрабатываю…';
        try { await replaceEverywhere(im, f, prot); render(); } catch (e) { alert(e.message); rep.disabled = false; rep.textContent = 'Заменить везде'; }
      } }, 'Заменить везде');
      return h('div', { class: 'ph' + (im.staged || S.changes.has(im.path) ? ' staged' : '') },
        h('img', { src: imgUrl(im.path), alt: '', loading: 'lazy' }),
        h('div', { class: 'ph__b' },
          h('code', null, im.name), h('span', { class: 'hint' }, (im.size ? Math.round(im.size / 1024) + ' КБ · ' : '') + (prot ? 'значок/логотип сайта' : used.length ? 'используется: ' + used.map(function (p) { return p.split('/').pop(); }).join(', ') : 'нигде не используется')),
          del ? h('span', { class: 'err' }, 'Будет удалено') : null,
          h('div', { class: 'row' }, rep,
            h('button', { class: 'btn btn--sm', title: 'Скопировать путь для кода страницы', onclick: function () { navigator.clipboard.writeText(im.path).then(function () { toast('Скопировано: ' + im.path); }); } }, 'Путь'),
            !used.length && !prot ? h('button', { class: 'btn btn--sm btn--danger', onclick: function () { if (del) S.changes.delete(im.path); else if (im.staged) { S.changes.delete(im.path); S.images = S.images.filter(function (x) { return x !== im; }); } else stageDel(im.path); render(); } }, del ? 'Вернуть' : 'Удалить') : null)));
    });
    return [h('div', { class: 'row' }, h('h2', { class: 'sec', style: 'margin:0' }, 'Фото'), h('span', { class: 'spacer' }), up),
      h('p', { class: 'hint' }, 'Фото автоматически уменьшаются (до 1600 px) и сжимаются в лёгкий формат. «Заменить везде» — новое фото встанет на все страницы, где было старое, в том же размере. Чтобы поставить фото в конкретное место, используйте «Страницы и тексты» → «Заменить фото».'),
      h('div', { class: 'gal' }, cards)];
  }
  async function replaceEverywhere(im, f, prot) {
    var old = await loadImg(imgUrl(im.path));
    var img = await fileImg(f);
    var ext = im.name.split('.').pop().toLowerCase();
    if (prot) { // имя менять нельзя — на него ссылается шаблон сайта
      var r = await encode(img, old.naturalWidth, old.naturalHeight, ext);
      stageBin(im.path, r.b64, r.url); im.url = r.url; im.size = r.size; return;
    }
    var r2 = await encode(img, old.naturalWidth, old.naturalHeight);
    var p = 'assets/img/' + baseName(im.path) + '-' + stamp() + '.' + r2.ext;
    stageBin(p, r2.b64, r2.url);
    S.images.unshift({ name: p.split('/').pop(), path: p, size: r2.size, staged: true, url: r2.url });
    usage(im.path).forEach(function (fp) { stageText(fp, cur(fp).split(im.path).join(p)); });
    S.articles = JSON.parse(cur('_src/articles.json') || '[]');
    S.pageEd = null;
    toast('Фото заменено на всех страницах. Старый файл можно удалить.');
  }

  // ---------------------------------------------------------------- вкладка «Оформление»
  function themeTab() {
    var T = S.theme;
    var prev = h('div', { class: 'prev' },
      h('span', { class: 'pa' }, 'Акцент'),
      h('h3', null, 'Так будет выглядеть заголовок'),
      h('p', { class: 'pm' }, 'Второстепенный текст: подписи и пояснения.'),
      h('div', { class: 'pc' }, h('p', { style: 'margin:0 0 12px' }, 'Основной текст на сайте. Цвет, размер и скругление карточек меняются слева.'), h('span', { class: 'pb' }, 'Кнопка')));
    function paint() {
      var st = prev.style;
      st.setProperty('--p-primary', T.primary); st.setProperty('--p-accent', T.accent); st.setProperty('--p-text', T.text);
      st.setProperty('--p-heading', T.heading); st.setProperty('--p-muted', T.muted); st.setProperty('--p-tint', T.tint); st.setProperty('--p-bg', T.bg);
      st.setProperty('--p-radius', T.radius + 'px'); st.setProperty('--p-fs', (16 * T.textScale / 100) + 'px'); st.setProperty('--p-hs', T.headingScale / 100);
    }
    function range(label, key, min, max, unit) {
      var out = h('b', null, T[key] + unit);
      var i = h('input', { type: 'range', min: min, max: max, value: T[key], style: 'width:100%' });
      i.addEventListener('input', function () { T[key] = +i.value; out.textContent = i.value + unit; paint(); saveTheme(); });
      return h('label', { class: 'f' }, h('span', null, label + ' ', out), i);
    }
    function color(label, key) {
      var i = h('input', { type: 'color', value: T[key] });
      i.addEventListener('input', function () { T[key] = i.value; paint(); saveTheme(); });
      return h('label', { class: 'clr' }, i, h('span', null, label));
    }
    paint();
    return [h('h2', { class: 'sec' }, 'Оформление сайта'),
      h('div', { class: 'theme' },
        h('div', { class: 'card' },
          range('Размер текста', 'textScale', 85, 125, '%'),
          range('Размер заголовков', 'headingScale', 75, 130, '%'),
          range('Скругление углов', 'radius', 0, 36, ' px'),
          h('h2', { class: 'sec' }, 'Цвета'),
          color('Основной (кнопки, ссылки)', 'primary'), color('Основной при наведении', 'primary2'), color('Акцент', 'accent'),
          color('Текст', 'text'), color('Заголовки', 'heading'), color('Второстепенный текст', 'muted'),
          color('Фон цветных блоков', 'tint'), color('Фон страницы', 'bg'),
          h('button', { class: 'btn', style: 'margin-top:10px', onclick: function () { S.theme = Object.assign({}, THEME_DEFAULT); saveTheme(); render(); } }, 'Вернуть как было')),
        prev)];
  }

  if (DEMO) window.__adm = { S: S, seal: seal, unseal: unseal, encode: encode, replacePageImage: replacePageImage, replaceEverywhere: replaceEverywhere, render: render, composePage: composePage };
  start();
})();
