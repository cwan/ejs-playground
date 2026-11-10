(function () {
  'use strict';

  var STORAGE_KEY = 'ejs-playground:saves';   // 名前付き保存データ
  var DRAFT_KEY = 'ejs-playground:draft';     // 編集中の内容 (自動保存)

  var DEFAULT_PARAMS = JSON.stringify({
    title: 'EJS Playground',
    user: { name: '山田 太郎' },
    items: [
      { name: 'りんご', price: 120 },
      { name: 'バナナ', price: 98 },
      { name: 'みかん', price: 150 }
    ]
  }, null, 2);

  var DEFAULT_TEMPLATE = [
    '<!DOCTYPE html>',
    '<html lang="ja">',
    '<head>',
    '  <meta charset="UTF-8">',
    '  <title><%= title %></title>',
    '</head>',
    '<body>',
    '  <h1><%= title %></h1>',
    '  <p>こんにちは、<%= user.name %> さん。</p>',
    '  <ul>',
    '  <% items.forEach(function (item) { %>',
    '    <li><%= item.name %>: <%= item.price.toLocaleString() %> 円</li>',
    '  <% }) %>',
    '  </ul>',
    '  <p>合計: <%= items.reduce(function (s, i) { return s + i.price; }, 0).toLocaleString() %> 円</p>',
    '</body>',
    '</html>',
    ''
  ].join('\n');

  // ---------- DOM ----------
  var $ = function (id) { return document.getElementById(id); };
  var paramsEl = $('params');
  var templateEl = $('template');
  var rmwsEl = $('opt-rmws');
  var saveNameEl = $('save-name');
  var savedListEl = $('saved-list');
  var savedNamesEl = $('saved-names');
  var fileNameEl = $('file-name');
  var errorEl = $('error');
  var outHtmlEl = $('out-html');
  var outTextEl = $('out-text');
  var statusEl = $('status');

  var currentView = 'html';
  var lastOutput = '';

  // ---------- storage helpers ----------
  function readSaves() {
    try {
      var data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (e) {
      return {};
    }
  }

  function writeSaves(saves) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saves));
  }

  function currentState() {
    return {
      params: paramsEl.value,
      template: templateEl.value,
      fileName: fileNameEl.value,
      rmWhitespace: rmwsEl.checked
    };
  }

  function applyState(state) {
    paramsEl.value = state.params != null ? state.params : '';
    templateEl.value = state.template != null ? state.template : '';
    if (state.fileName) fileNameEl.value = state.fileName;
    rmwsEl.checked = !!state.rmWhitespace;
  }

  var draftTimer = null;
  function saveDraftSoon() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(function () {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(currentState()));
      } catch (e) { /* ignore quota errors for drafts */ }
    }, 400);
  }

  function refreshSavedList(selectName) {
    var saves = readSaves();
    var names = Object.keys(saves).sort(function (a, b) { return a.localeCompare(b, 'ja'); });

    savedListEl.innerHTML = '';
    savedNamesEl.innerHTML = '';

    var placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = names.length ? '— 保存済みを選択 (' + names.length + '件) —' : '— 保存データなし —';
    savedListEl.appendChild(placeholder);

    names.forEach(function (name) {
      var opt = document.createElement('option');
      opt.value = name;
      var updated = saves[name].updatedAt ? new Date(saves[name].updatedAt) : null;
      opt.textContent = name;
      if (updated) opt.title = '更新: ' + updated.toLocaleString();
      savedListEl.appendChild(opt);

      var dl = document.createElement('option');
      dl.value = name;
      savedNamesEl.appendChild(dl);
    });

    savedListEl.value = selectName && saves[selectName] ? selectName : '';
  }

  // ---------- status / error ----------
  var statusTimer = null;
  function setStatus(msg) {
    statusEl.textContent = msg;
    clearTimeout(statusTimer);
    statusTimer = setTimeout(function () { statusEl.textContent = ''; }, 4000);
  }

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.hidden = false;
  }

  function clearError() {
    errorEl.textContent = '';
    errorEl.hidden = true;
  }

  // ---------- rendering ----------
  function parseParams() {
    var src = paramsEl.value.trim();
    if (!src) return {};
    var data;
    try {
      data = JSON.parse(src);
    } catch (e) {
      throw new Error('パラメーターのJSONが不正です:\n' + e.message);
    }
    if (data === null || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('パラメーターはJSONオブジェクト ({ ... }) で指定してください。');
    }
    return data;
  }

  // include('保存名') で保存済みテンプレートを読み込めるようにする
  function includer(originalPath) {
    var saves = readSaves();
    var key = Object.prototype.hasOwnProperty.call(saves, originalPath) ? originalPath
      : Object.prototype.hasOwnProperty.call(saves, originalPath.replace(/\.ejs$/, '')) ? originalPath.replace(/\.ejs$/, '')
      : null;
    if (key === null) {
      throw new Error('include: 保存名 "' + originalPath + '" のテンプレートが見つかりません。');
    }
    // 空文字だと EJS がファイル読み込みにフォールバックするため、空白1文字にする
    return { template: saves[key].template || ' ', filename: key };
  }

  function render() {
    var data = parseParams();
    return ejs.render(templateEl.value, data, {
      includer: includer,
      rmWhitespace: rmwsEl.checked
    });
  }

  function updateOutputView() {
    outHtmlEl.hidden = currentView !== 'html';
    outTextEl.hidden = currentView !== 'text';
    document.querySelectorAll('.tab').forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.view === currentView);
    });
  }

  function preview() {
    try {
      lastOutput = render();
      clearError();
      outHtmlEl.srcdoc = lastOutput;
      outTextEl.textContent = lastOutput;
      setStatus('プレビューを更新しました (' + lastOutput.length.toLocaleString() + ' 文字)');
      return true;
    } catch (e) {
      showError(e && e.message ? e.message : String(e));
      setStatus('変換に失敗しました');
      return false;
    }
  }

  function mimeFor(fileName) {
    var ext = (fileName.split('.').pop() || '').toLowerCase();
    var map = {
      html: 'text/html', htm: 'text/html', xml: 'application/xml', svg: 'image/svg+xml',
      json: 'application/json', css: 'text/css', js: 'text/javascript',
      md: 'text/markdown', csv: 'text/csv', yaml: 'text/yaml', yml: 'text/yaml'
    };
    return (map[ext] || 'text/plain') + ';charset=utf-8';
  }

  function download() {
    if (!preview()) return; // 最新の入力で変換してからダウンロード
    var fileName = fileNameEl.value.trim() || 'output.html';
    var blob = new Blob([lastOutput], { type: mimeFor(fileName) });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    setStatus('"' + fileName + '" をダウンロードしました');
  }

  // ---------- save / load / delete ----------
  function save() {
    var name = saveNameEl.value.trim();
    if (!name) {
      alert('保存名を入力してください。');
      saveNameEl.focus();
      return;
    }
    var saves = readSaves();
    if (saves[name] && !confirm('"' + name + '" は既に存在します。上書きしますか？')) return;

    var state = currentState();
    state.updatedAt = new Date().toISOString();
    saves[name] = state;
    try {
      writeSaves(saves);
    } catch (e) {
      alert('保存に失敗しました: ' + e.message);
      return;
    }
    refreshSavedList(name);
    setStatus('"' + name + '" を保存しました');
  }

  function load() {
    var name = savedListEl.value;
    if (!name) {
      alert('読み込む保存データを選択してください。');
      return;
    }
    var saves = readSaves();
    if (!saves[name]) {
      alert('"' + name + '" が見つかりません。');
      refreshSavedList();
      return;
    }
    applyState(saves[name]);
    saveNameEl.value = name;
    saveDraftSoon();
    preview();
    setStatus('"' + name + '" を読み込みました');
  }

  function remove() {
    var name = savedListEl.value;
    if (!name) {
      alert('削除する保存データを選択してください。');
      return;
    }
    if (!confirm('"' + name + '" を削除しますか？')) return;
    var saves = readSaves();
    delete saves[name];
    writeSaves(saves);
    refreshSavedList();
    setStatus('"' + name + '" を削除しました');
  }

  function newDoc() {
    if (!confirm('パラメーターとテンプレートをクリアしますか？\n(保存済みデータは削除されません)')) return;
    applyState({ params: '{\n  \n}', template: '', fileName: 'output.html', rmWhitespace: false });
    saveNameEl.value = '';
    savedListEl.value = '';
    lastOutput = '';
    outHtmlEl.srcdoc = '';
    outTextEl.textContent = '';
    clearError();
    saveDraftSoon();
  }

  function formatParams() {
    try {
      var data = parseParams();
      paramsEl.value = JSON.stringify(data, null, 2);
      clearError();
      saveDraftSoon();
    } catch (e) {
      showError(e.message);
    }
  }

  // Tab キーでインデントを挿入
  function handleTabKey(e) {
    if (e.key !== 'Tab' || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    var el = e.target;
    var start = el.selectionStart;
    var end = el.selectionEnd;
    var value = el.value;
    var lineStart = value.lastIndexOf('\n', start - 1) + 1;

    if (start === end && !e.shiftKey) {
      el.setRangeText('  ', start, end, 'end');
    } else {
      var block = value.slice(lineStart, end);
      var replaced = e.shiftKey
        ? block.replace(/^ {1,2}/gm, '')
        : block.replace(/^/gm, '  ');
      el.setRangeText(replaced, lineStart, end, 'preserve');
      el.selectionStart = lineStart;
      el.selectionEnd = lineStart + replaced.length;
    }
    saveDraftSoon();
  }

  // ---------- events ----------
  $('btn-preview').addEventListener('click', preview);
  $('btn-download').addEventListener('click', download);
  $('btn-save').addEventListener('click', save);
  $('btn-load').addEventListener('click', load);
  $('btn-delete').addEventListener('click', remove);
  $('btn-new').addEventListener('click', newDoc);
  $('btn-format').addEventListener('click', formatParams);

  savedListEl.addEventListener('change', function () {
    if (savedListEl.value) saveNameEl.value = savedListEl.value;
  });
  savedListEl.addEventListener('dblclick', load);
  saveNameEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') save();
  });

  document.querySelectorAll('.tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      currentView = tab.dataset.view;
      updateOutputView();
    });
  });

  [paramsEl, templateEl].forEach(function (el) {
    el.addEventListener('input', saveDraftSoon);
    el.addEventListener('keydown', handleTabKey);
  });
  [fileNameEl, rmwsEl].forEach(function (el) {
    el.addEventListener('change', saveDraftSoon);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      preview();
    } else if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      save();
    }
  });

  // ---------- init ----------
  var draft = null;
  try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); } catch (e) { draft = null; }
  applyState(draft || { params: DEFAULT_PARAMS, template: DEFAULT_TEMPLATE });
  refreshSavedList();
  updateOutputView();
  preview();
})();
