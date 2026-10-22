(function(){
  var L = window.HWPLib;
  var drop = document.getElementById('drop');
  var fileInput = document.getElementById('file');
  var status = document.getElementById('status');
  var viewerEl = document.getElementById('viewer');
  var textOut = document.getElementById('textout');
  var textWrap = document.getElementById('textwrap');
  var tools = document.getElementById('tools');
  var btnPdf = document.getElementById('btn-pdf');
  var btnTxt = document.getElementById('btn-txt');
  var btnCopy = document.getElementById('btn-copy');
  var btnHtml = document.getElementById('btn-html');
  var current = { name: '', text: '', html: '' };
  var viewer = null;

  function say(msg, err){ status.textContent = msg; status.className = 'status' + (err ? ' err' : ''); }
  function base(name){ return name.replace(/\.(hwpx?)$/i, ''); }
  function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }

  function reset(){
    if (viewer) { try { viewer.distory(); } catch(e){} viewer = null; }
    viewerEl.innerHTML = '';
    textOut.value = '';
    tools.style.display = 'none';
    textWrap.style.display = 'none';
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
    if (!names.length) throw new Error('HWPX 안에서 본문(section)을 찾지 못했습니다.');
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
    if (!file) return;
    reset();
    current.name = file.name;
    var isHwpx = /\.hwpx$/i.test(file.name);
    var isHwp = /\.hwp$/i.test(file.name);
    if (!isHwpx && !isHwp) { say('HWP 또는 HWPX 파일만 열 수 있습니다.', true); return; }
    say('변환 중… (' + file.name + ')');
    var reader = new FileReader();
    reader.onload = function(){
      try {
        var bytes = new Uint8Array(reader.result);
        if (isHwpx) renderHwpx(bytes); else renderHwp(bytes);
        textOut.value = current.text;
        tools.style.display = 'flex';
        textWrap.style.display = 'block';
        say('완료: ' + file.name + ' (파일은 이 브라우저 안에서만 처리됐고 어디에도 전송되지 않았습니다)');
      } catch (e) {
        console.error(e);
        say('이 파일은 열 수 없습니다. 암호가 걸렸거나 배포용(DRM) 문서, 또는 아주 오래된 HWP 3.0 형식일 수 있습니다. (' + (e && e.message ? e.message : e) + ')', true);
      }
    };
    reader.onerror = function(){ say('파일을 읽지 못했습니다.', true); };
    reader.readAsArrayBuffer(file);
  }

  function download(name, content, type){
    var blob = new Blob([content], { type: type });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  drop.addEventListener('click', function(){ fileInput.click(); });
  fileInput.addEventListener('change', function(){ handle(fileInput.files[0]); fileInput.value = ''; });
  ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.add('on'); }); });
  ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('on'); }); });
  drop.addEventListener('drop', function(e){ handle(e.dataTransfer.files[0]); });
  document.addEventListener('paste', function(e){ var f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0]; if (f) handle(f); });

  btnPdf.addEventListener('click', function(){ window.print(); });
  btnTxt.addEventListener('click', function(){ download(base(current.name) + '.txt', '﻿' + current.text, 'text/plain;charset=utf-8'); });
  btnHtml.addEventListener('click', function(){
    var doc = '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>' + esc(base(current.name)) + '</title></head><body style="font-family:sans-serif;max-width:800px;margin:40px auto">' + current.html + '</body></html>';
    download(base(current.name) + '.html', doc, 'text/html;charset=utf-8');
  });
  btnCopy.addEventListener('click', function(){
    navigator.clipboard.writeText(current.text).then(function(){ say('본문 텍스트를 복사했습니다.'); }, function(){ textOut.select(); document.execCommand('copy'); say('본문 텍스트를 복사했습니다.'); });
  });
})();
