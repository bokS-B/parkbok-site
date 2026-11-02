(function(){
  var L = null;
  // 130KB 해석 모듈은 첫 화면에서 받지 않고, 파일을 고르려 할 때 불러온다.
  function loadLib(){
    if (window.HWPLib) return Promise.resolve(window.HWPLib);
    if (loadLib.p) return loadLib.p;
    loadLib.p = new Promise(function(resolve, reject){
      var s = document.createElement('script');
      s.src = '/assets/hwp-bundle.js';
      s.onload = function(){ resolve(window.HWPLib); };
      s.onerror = function(){ loadLib.p = null; reject(new Error('변환 모듈을 불러오지 못함')); };
      document.head.appendChild(s);
    });
    return loadLib.p;
  }
  function $(id){ return document.getElementById(id); }
  var drop = $('drop');
  var fileInput = $('file');
  var status = $('status');
  var viewerEl = $('viewer');
  var textOut = $('textout');
  var textWrap = $('textwrap');
  var tools = $('tools');
  var compact = $('drop-compact');
  var fileName = $('file-name');
  var btnPdf = $('btn-primary');
  var btnTxt = $('btn-txt');
  var btnHtml = $('btn-html');
  var btnCopy = $('btn-copy');
  var btnReset = $('btn-reset');
  var current = { name: '', text: '', html: '' };
  var viewer = null;
  var busy = false;

  // kind: '' | 'ok' | 'err' | 'busy' | 'empty'
  function say(msg, kind){ status.textContent = msg || ''; status.className = 'status' + (kind ? ' ' + kind : ''); }
  function setBusy(b){ busy = b; if (b) document.body.classList.add('busy'); else document.body.classList.remove('busy'); }
  function base(name){ return name.replace(/\.(hwpx?)$/i, ''); }
  function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }

  // 결과(뷰어·본문·버튼)만 비운다. 드롭존 상태는 유지
  function clearResult(){
    if (viewer) { try { viewer.distory(); } catch(e){} viewer = null; }
    viewerEl.innerHTML = '';
    viewerEl.style.height = '';
    textOut.value = '';
    tools.hidden = true;
    textWrap.hidden = true;
    current = { name: '', text: '', html: '' };
  }
  // 다시 시작: 첫 화면으로
  function reset(){
    clearResult();
    setBusy(false);
    document.body.classList.remove('has-input');
    compact.hidden = true;
    fileName.textContent = '';
    drop.classList.remove('err', 'on');
    fileInput.value = '';
    say('');
  }

  function extractHwpText(doc){
    var out = [];
    function paragraphText(p){
      var line = '';
      (p.content || []).forEach(function(ch){
        if (ch.type === 0 && typeof ch.value === 'string') line += ch.value;
        else if (ch.type === 0 && ch.value === 10) line += '\n';
      });
      return line;
    }
    function walkParagraph(p){
      out.push(paragraphText(p));
      (p.controls || []).forEach(walkControl);
    }
    function walkControl(ctrl){
      if (!ctrl) return;
      // 표: content = 행 배열, 행 = 셀(paragraphList) 배열, 셀.items = 문단 배열
      if (Array.isArray(ctrl.content) && ctrl.rowCount) {
        ctrl.content.forEach(function(row){
          var cells = [];
          (row || []).forEach(function(cell){
            var buf = [];
            ((cell && cell.items) || []).forEach(function(p){
              buf.push(paragraphText(p));
              (p.controls || []).forEach(walkControl);
            });
            cells.push(buf.join(' ').trim());
          });
          out.push(cells.join('\t'));
        });
        return;
      }
      // 글상자 등: content.items 또는 content 가 문단 배열
      var items = ctrl.content && ctrl.content.items ? ctrl.content.items : (Array.isArray(ctrl.content) ? ctrl.content : null);
      if (items) items.forEach(function(p){ if (p && p.content) walkParagraph(p); });
    }
    doc.sections.forEach(function(sec){ sec.content.forEach(walkParagraph); });
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
  }

  function renderHwp(bytes){
    var doc = L.parse(bytes, { type: 'array' });
    current.text = extractHwpText(doc);
    current.html = '<pre style="white-space:pre-wrap;font-family:inherit">' + esc(current.text) + '</pre>';
    viewerEl.style.height = '80vh';
    viewer = new L.Viewer(viewerEl, bytes, { type: 'array' });
  }

  function directText(p){
    // 문단 바로 아래 run 의 t 요소만 모은다 (표 안 문단은 표에서 따로 처리)
    var s = '';
    var rs = p.getElementsByTagNameNS('*', 'run');
    for (var j = 0; j < rs.length; j++) {
      if (rs[j].parentNode !== p) continue;
      var ts = rs[j].getElementsByTagNameNS('*', 't');
      for (var m = 0; m < ts.length; m++) if (ts[m].parentNode === rs[j]) s += ts[m].textContent;
    }
    return s;
  }

  function renderHwpx(bytes){
    var files = L.unzipSync(bytes);
    var names = Object.keys(files).filter(function(n){ return /^Contents\/section\d+\.xml$/i.test(n); })
      .sort(function(a,b){ return parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10); });
    if (!names.length) throw new Error('no section');
    var parser = new DOMParser();
    var html = [], text = [];
    names.forEach(function(n){
      var xml = parser.parseFromString(L.strFromU8(files[n]), 'application/xml');
      var paras = xml.getElementsByTagNameNS('*', 'p');
      for (var i = 0; i < paras.length; i++) {
        var p = paras[i];
        var parentTag = p.parentNode && p.parentNode.localName;
        if (parentTag === 'tc' || parentTag === 'subList') continue;
        var tbls = p.getElementsByTagNameNS('*', 'tbl');
        for (var ti = 0; ti < tbls.length; ti++) {
          var rows = tbls[ti].getElementsByTagNameNS('*', 'tr');
          var th = '<table border="1" cellpadding="4" style="border-collapse:collapse;margin:8px 0">';
          var tt = [];
          for (var r = 0; r < rows.length; r++) {
            th += '<tr>';
            var cells = rows[r].getElementsByTagNameNS('*', 'tc');
            var rowText = [];
            for (var c = 0; c < cells.length; c++) {
              var cps = cells[c].getElementsByTagNameNS('*', 'p');
              var cellTxt = [];
              for (var k = 0; k < cps.length; k++) cellTxt.push(directText(cps[k]));
              th += '<td>' + cellTxt.map(esc).join('<br>') + '</td>';
              rowText.push(cellTxt.join(' '));
            }
            th += '</tr>';
            tt.push(rowText.join('\t'));
          }
          th += '</table>';
          html.push(th); text.push(tt.join('\n'));
        }
        var line = directText(p);
        html.push('<p>' + (esc(line) || '&nbsp;') + '</p>');
        text.push(line);
      }
    });
    current.html = html.join('\n');
    current.text = text.join('\n');
    viewerEl.style.height = '';
    viewerEl.innerHTML = '<div style="background:#fff;max-width:800px;margin:0 auto;padding:40px 48px;font-size:14px">' + current.html + '</div>';
  }

  function handle(file){
    if (!file || busy) return;
    var isHwpx = /\.hwpx$/i.test(file.name);
    var isHwp = /\.hwp$/i.test(file.name);
    if (!isHwpx && !isHwp) { drop.classList.add('err'); say('HWP·HWPX 파일만 열 수 있음', 'err'); return; }
    drop.classList.remove('err');
    clearResult();
    current.name = file.name;
    // 파일을 열면 드롭존을 한 줄(파일명 + 다른 파일 선택)로 줄인다
    fileName.textContent = file.name;
    compact.hidden = false;
    document.body.classList.add('has-input');
    setBusy(true);
    say('변환 중…', 'busy');
    var reader = new FileReader();
    reader.onload = function(){
      try {
        var bytes = new Uint8Array(reader.result);
        if (isHwpx) renderHwpx(bytes); else renderHwp(bytes);
        textOut.value = current.text;
        tools.hidden = false;
        textWrap.hidden = false;
        if (!current.text.replace(/\s/g, '')) say('결과 없음', 'empty'); else say('완료', 'ok');
        if (drop.scrollIntoView) drop.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } catch (e) {
        console.error(e);
        say('암호가 걸렸거나 손상된 문서', 'err');
      }
      setBusy(false);
    };
    reader.onerror = function(){ setBusy(false); say('파일을 읽지 못함', 'err'); };
    loadLib().then(function(lib){ L = lib; reader.readAsArrayBuffer(file); }, function(e){ setBusy(false); say(e.message, 'err'); });
  }

  function download(name, content, type){
    var blob = new Blob([content], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function openPicker(){ if (busy) return; loadLib(); fileInput.value = ''; fileInput.click(); }
  function closestButton(el){ while (el && el !== drop) { if (el.tagName === 'BUTTON') return el; el = el.parentNode; } return null; }

  // 드롭존: 첫 화면은 어디를 눌러도, 파일을 연 뒤에는 '다른 파일 선택' 버튼만
  drop.addEventListener('click', function(e){
    if (e.target === fileInput) return;
    var b = closestButton(e.target);
    if (document.body.classList.contains('has-input') && !b) return;
    openPicker();
  });
  drop.addEventListener('keydown', function(e){ if ((e.key === 'Enter' || e.key === ' ') && e.target === drop) { e.preventDefault(); openPicker(); } });
  drop.addEventListener('mouseenter', function(){ loadLib(); });
  drop.addEventListener('touchstart', function(){ loadLib(); }, { passive: true });
  fileInput.addEventListener('change', function(){ handle(fileInput.files[0]); fileInput.value = ''; });
  ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('err'); drop.classList.add('on'); loadLib(); }); });
  ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('on'); }); });
  drop.addEventListener('drop', function(e){ handle(e.dataTransfer.files[0]); });
  document.addEventListener('paste', function(e){ var f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0]; if (f) handle(f); });

  btnPdf.addEventListener('click', function(){ say('인쇄 창에서 PDF로 저장 선택', 'ok'); window.print(); });
  btnTxt.addEventListener('click', function(){ download(base(current.name) + '.txt', '﻿' + current.text, 'text/plain;charset=utf-8'); });
  btnHtml.addEventListener('click', function(){
    var doc = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(base(current.name)) + '</title></head><body style="font-family:sans-serif;max-width:800px;margin:40px auto">' + current.html + '</body></html>';
    download(base(current.name) + '.html', doc, 'text/html;charset=utf-8');
  });
  btnCopy.addEventListener('click', function(){
    function done(){ say('본문 복사 완료', 'ok'); }
    function fallback(){ textOut.select(); try { document.execCommand('copy'); } catch(e){} done(); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(current.text).then(done, fallback); else fallback();
  });
  btnReset.addEventListener('click', function(){ reset(); try { drop.focus(); } catch(e){} });
})();
