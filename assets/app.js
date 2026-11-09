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
  var btnSelect = $('btn-select');
  var btnPdf = $('btn-primary');
  var btnTxt = $('btn-txt');
  var btnHtml = $('btn-html');
  var btnCopy = $('btn-copy');
  var btnReset = $('btn-reset');
  var btnViewSize = $('btn-view-size');
  var btnEdit = $('btn-edit-hwpx');
  var editPanel = $('hwpx-editor');
  var editTitle = $('hwpx-edit-title');
  var editHelp = $('hwpx-edit-help');
  var findForm = $('hwpx-find-form');
  var findInput = $('hwpx-find');
  var findButton = $('hwpx-find-button');
  var replaceForm = $('hwpx-replace-form');
  var matchInput = $('hwpx-match');
  var replaceInput = $('hwpx-replacement');
  var editStatus = $('hwpx-edit-status');
  var makeCopy = $('btn-make-hwpx');
  var copyLink = $('link-save-hwpx');
  var copyFeedback = $('hwp-copy-feedback');
  var feedbackOptions = $('hwp-feedback-options');
  var feedbackStatus = $('hwp-feedback-status');
  var feedbackShown = false;
  var feedbackSessionKey = 'pb_hwp_copy_feedback_seen';
  var editMatches = [];
  var copyUrl = '';
  var current = { name: '', text: '', html: '' };
  var viewer = null;
  var busy = false;

  // kind: '' | 'ok' | 'err' | 'busy' | 'empty'
  function say(msg, kind){ status.textContent = msg || ''; status.className = 'status' + (kind ? ' ' + kind : ''); }
  function setBusy(b){
    busy = b;
    btnReset.disabled = b;
    document.body.classList.toggle('busy', b);
  }
  function base(name){ return name.replace(/\.(hwpx?)$/i, ''); }
  function esc(s){ return String(s).replace(/[&<>]/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;'}[c]; }); }

  // 결과(뷰어·본문·버튼)만 비운다. 드롭존 상태는 유지
  function clearResult(){
    if (viewer) { try { viewer.distory(); } catch(e){} viewer = null; }
    viewerEl.innerHTML = '';
    viewerEl.style.height = '';
    viewerEl.classList.remove('hwp-fit', 'hwpx-tap-edit');
    btnViewSize.hidden = true;
    resetEditor();
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

  function renderHwp(bytes, target){
    var doc = L.parse(bytes, { type: 'array' });
    var text = extractHwpText(doc);
    target.style.height = '80vh';
    var hwpViewer = new L.Viewer(target, bytes, { type: 'array' });
    var page = target.querySelector('[data-page-number]:not(.hwpjs-observer)');
    if (page) {
      page.parentElement.classList.add('hwp-page-scroll');
      target.classList.add('hwp-fit');
    }
    return { text: text, html: '<pre style="white-space:pre-wrap;font-family:inherit">' + esc(text) + '</pre>', viewer: hwpViewer, charShapes: doc.info.charShapes };
  }

  function fitHwpPages(){
    var scroller = viewerEl.querySelector('.hwp-page-scroll');
    if (!scroller || !viewerEl.classList.contains('hwp-fit')) return;
    var style = window.getComputedStyle(scroller);
    var available = scroller.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (available <= 0) return;
    Array.prototype.forEach.call(scroller.children, function(page){
      if (page.hasAttribute('data-page-number') && page.offsetWidth) {
        page.style.setProperty('--hwp-page-fit', Math.min(1, available / page.offsetWidth));
      }
    });
  }

  function xmlChildren(element, name){
    return Array.prototype.filter.call(element.children, function(child){ return child.localName === name; });
  }

  function xmlNumber(element, attribute){
    var value = element && Number(element.getAttribute(attribute));
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function readHwpxTable(table, cells){
    var size = xmlChildren(table, 'sz')[0];
    var width = size && size.getAttribute('widthRelTo') === 'ABSOLUTE' ? xmlNumber(size, 'width') : 0;
    // HWP units are 1/7200 inch. Preserve column proportions on narrower screens.
    var style = 'border-collapse:collapse;margin:8px 0;max-width:100%;overflow-wrap:anywhere';
    if (width) style += ';width:' + (width / 75) + 'px';
    var html = '<table border="1" cellpadding="4" style="' + style + '">';
    var lines = [];
    xmlChildren(table, 'tr').forEach(function(row){
      html += '<tr>';
      var rowText = [];
      xmlChildren(row, 'tc').forEach(function(cell){
        cells.push(cell);
        var span = xmlChildren(cell, 'cellSpan')[0];
        var cols = xmlNumber(span, 'colSpan');
        var rows = xmlNumber(span, 'rowSpan');
        var cellWidth = xmlNumber(xmlChildren(cell, 'cellSz')[0], 'width');
        var attrs = '';
        if (Number.isInteger(cols) && cols > 1) attrs += ' colspan="' + cols + '"';
        if (Number.isInteger(rows) && rows > 1) attrs += ' rowspan="' + rows + '"';
        if (width && cellWidth) attrs += ' style="width:' + Math.min(100, 100 * cellWidth / width) + '%"';
        var cellHtml = [], cellText = [];
        xmlChildren(cell, 'subList').forEach(function(list){
          xmlChildren(list, 'p').forEach(function(p){ readHwpxParagraph(p, cellHtml, cellText, cells); });
        });
        html += '<td' + attrs + '>' + cellHtml.join('') + '</td>';
        rowText.push(cellText.join(' ').trim());
      });
      html += '</tr>';
      lines.push(rowText.join('\t'));
    });
    return { html: html + '</table>', text: lines.join('\n') };
  }

  function readHwpxParagraph(paragraph, html, text, cells){
    var line = '';
    var hasBlock = false;
    function flushLine(){
      html.push('<p>' + (esc(line) || '&nbsp;') + '</p>');
      text.push(line);
      line = '';
    }
    function readContent(element){
      Array.prototype.forEach.call(element.children, function(child){
        if (child.localName === 't') {
          line += child.textContent;
        } else if (child.localName === 'tbl') {
          if (line) flushLine();
          var table = readHwpxTable(child, cells);
          html.push(table.html);
          text.push(table.text);
          hasBlock = true;
        } else if (child.localName === 'p') {
          if (line) flushLine();
          readHwpxParagraph(child, html, text, cells);
          hasBlock = true;
        } else {
          // Footnotes and other controls can wrap paragraphs or tables.
          readContent(child);
        }
      });
    }
    readContent(paragraph);
    if (line || !hasBlock) flushLine();
  }

  function renderHwpx(bytes, target){
    var entries = [];
    var files = L.unzipSync(bytes, { filter: function(entry){
      if (entries.length <= 1024) entries.push(entry);
      return /^Contents\/section\d+\.xml$/i.test(entry.name);
    } });
    var names = Object.keys(files).filter(function(n){ return /^Contents\/section\d+\.xml$/i.test(n); })
      .sort(function(a,b){ return parseInt(a.match(/\d+/)[0], 10) - parseInt(b.match(/\d+/)[0], 10); });
    if (!names.length) throw new Error('no section');
    var parser = new DOMParser();
    var sections = names.map(function(n){
      var xml = parser.parseFromString(L.strFromU8(files[n]), 'application/xml');
      if (xml.documentElement.localName === 'parsererror') throw new Error('invalid section');
      return { name: n, xml: xml };
    });
    var result = renderHwpxSections(sections, target);
    if (window.PBHWPXEditor && window.PBHWPXEditor.canEdit(bytes, entries)) {
      result.edit = { format: 'HWPX', bytes: bytes, entries: entries, sections: sections, cells: result.cells };
    }
    return result;
  }

  function renderHwpxSections(sections, target){
    var html = [], text = [], cells = [];
    sections.forEach(function(section){
      xmlChildren(section.xml.documentElement, 'p').forEach(function(p){ readHwpxParagraph(p, html, text, cells); });
    });
    var result = { html: html.join('\n'), text: text.join('\n'), cells: new WeakMap() };
    target.innerHTML = '<div class="hwpx-paper">' + result.html + '</div>';
    // The renderer emits each <td> in source order, including nested cells.
    var rendered = target.querySelectorAll('td');
    if (rendered.length === cells.length) rendered.forEach(function(td, index){ result.cells.set(td, cells[index]); });
    return result;
  }

  function editMessage(message, kind){
    editStatus.textContent = message;
    editStatus.className = 'status' + (kind ? ' ' + kind : '');
  }

  function clearEditMatches(){
    editMatches = [];
    matchInput.replaceChildren();
    replaceInput.value = '';
    replaceForm.hidden = true;
  }

  function clearEditCopy(){
    if (copyUrl) URL.revokeObjectURL(copyUrl);
    copyUrl = '';
    copyLink.removeAttribute('href');
    copyLink.hidden = true;
  }

  function resetEditor(){
    btnEdit.hidden = true;
    btnEdit.setAttribute('aria-expanded', 'false');
    editPanel.hidden = true;
    findForm.reset();
    findInput.disabled = findButton.disabled = makeCopy.disabled = true;
    clearEditMatches();
    clearEditCopy();
    editMessage('');
  }

  async function toggleEditor(){
    var doc = current.edit;
    if (!doc || busy) return;
    var opening = editPanel.hidden;
    editPanel.hidden = !opening;
    btnEdit.setAttribute('aria-expanded', String(opening));
    viewerEl.classList.toggle('hwpx-tap-edit', opening && doc.format === 'HWPX' && !!doc.editor);
    if (!opening) return;
    if (doc.editor) { focusEditSearch(doc); return; }
    if (doc.loading) return;
    doc.loading = true;
    editMessage('편집 준비 중…', 'busy');
    try {
      doc.editor = doc.format === 'HWP'
        ? await window.PBHwpEditor.load(doc.bytes, doc.charShapes)
        : await window.PBHWPXEditor.load(doc.bytes, doc.entries, doc.sections);
      if (current.edit !== doc) return;
      findInput.disabled = findButton.disabled = false;
      viewerEl.classList.toggle('hwpx-tap-edit', !editPanel.hidden && doc.format === 'HWPX');
      editMessage('');
      if (!editPanel.hidden) focusEditSearch(doc);
    } catch (error) {
      if (current.edit === doc) editMessage(error.message || '이 문서는 편집할 수 없습니다.', 'err');
    } finally {
      doc.loading = false;
    }
  }

  function focusEditSearch(doc){
    if (doc.format !== 'HWPX' || !window.matchMedia('(max-width:767.98px)').matches) findInput.focus();
  }

  function findEditMatches(event){
    event.preventDefault();
    var doc = current.edit;
    if (!doc || !doc.editor || busy || doc.saving) return;
    clearEditMatches();
    var matches = doc.editor.find(findInput.value);
    if (!matches.length) {
      editMessage('편집할 수 있는 문구를 찾지 못했습니다. 짧게 나눠 찾아보세요.', 'empty');
      return;
    }
    showEditMatches(matches);
    editMessage(matches.length === 100 ? '처음 100곳을 표시했습니다.' : matches.length + '곳에서 찾았습니다.');
    (matches.length > 1 ? matchInput : replaceInput).focus();
  }

  function showEditMatches(matches){
    editMatches = matches;
    if (editMatches.length > 1) {
      var prompt = new Option('바꿀 위치를 선택하세요', '', true, true);
      prompt.disabled = true;
      matchInput.add(prompt);
    }
    editMatches.forEach(function(match, index){
      matchInput.add(new Option((index + 1) + '. ' + match.location + ' · ' + match.context, String(index)));
    });
    replaceForm.hidden = false;
  }

  function selectHwpxCell(event){
    var doc = current.edit;
    if (!doc || doc.format !== 'HWPX' || !doc.editor || editPanel.hidden || busy || doc.saving ||
        !viewerEl.contains(event.target) || !event.target.closest ||
        (window.getSelection() && !window.getSelection().isCollapsed)) return;
    var cell = doc.cells.get(event.target.closest('td'));
    if (!cell) return;
    clearEditMatches();
    var selected = doc.editor.findCell(cell);
    if (!selected) {
      editMessage('이 셀은 눌러서 바꿀 수 없습니다. 문구가 있으면 검색으로 찾아보세요.', 'empty');
      editStatus.scrollIntoView({ block: 'nearest' });
      return;
    }
    findInput.value = selected.query;
    showEditMatches([selected.match]);
    replaceInput.value = selected.query;
    editMessage('표 셀을 선택했습니다. 문구를 바꿔 주세요.');
    replaceInput.focus();
    replaceInput.select();
  }

  function applyEdit(event){
    event.preventDefault();
    var doc = current.edit;
    if (!doc || !doc.editor || busy || doc.saving || matchInput.value === '') return;
    var stagedHwp = null;
    var result;
    try {
      function prepareHwpCopy(bytes){
        var target = document.createElement('div');
        target.id = 'viewer';
        result = renderHwp(bytes, target);
        stagedHwp = target;
        return result.text;
      }
      if (!doc.editor.replace(editMatches[Number(matchInput.value)], findInput.value, replaceInput.value, prepareHwpCopy)) {
        editMessage('같은 문구입니다. 다른 문구를 입력하세요.', 'empty');
        return;
      }
      if (stagedHwp) {
        var previous = viewerEl.querySelector('.hwp-page-scroll');
        var top = previous ? previous.scrollTop : 0;
        var left = previous ? previous.scrollLeft : 0;
        stagedHwp.classList.toggle('hwp-fit', viewerEl.classList.contains('hwp-fit'));
        mountViewer(stagedHwp, result.viewer);
        stagedHwp = null;
        var scroller = viewerEl.querySelector('.hwp-page-scroll');
        if (scroller) { scroller.scrollTop = top; scroller.scrollLeft = left; }
      } else {
        result = renderHwpxSections(doc.sections, viewerEl);
        doc.cells = result.cells;
      }
      clearEditCopy();
      current.html = result.html;
      current.text = result.text;
      textOut.value = current.text;
      makeCopy.disabled = false;
      clearEditMatches();
      editMessage('문구를 바꿨습니다. 더 바꾸거나 ' + doc.format + ' 사본을 만드세요.', 'ok');
      findInput.focus();
    } catch (error) {
      if (stagedHwp) { try { result.viewer.distory(); } catch(e){} }
      editMessage(error.message || '이 문구는 바꿀 수 없습니다.', 'err');
    }
  }

  async function buildEditCopy(){
    var doc = current.edit;
    if (!doc || !doc.editor || busy || doc.saving) return;
    doc.saving = true;
    makeCopy.disabled = true;
    editMessage(doc.format + ' 사본 만드는 중…', 'busy');
    try {
      var bytes = await doc.editor.save(current.text);
      if (current.edit !== doc) return;
      var type = doc.format === 'HWP' ? 'application/x-hwp' : 'application/hwp+zip';
      var nextUrl = URL.createObjectURL(new Blob([bytes], { type: type }));
      clearEditCopy();
      copyUrl = nextUrl;
      copyLink.href = copyUrl;
      copyLink.download = base(current.name) + '-편집본.' + doc.format.toLowerCase();
      copyLink.hidden = false;
      editMessage('사본을 만들었습니다.', 'ok');
      if (!editPanel.hidden) copyLink.focus();
    } catch (error) {
      if (current.edit === doc) editMessage(error.message || '사본을 만들지 못했습니다.', 'err');
    } finally {
      doc.saving = false;
      if (current.edit === doc) makeCopy.disabled = false;
    }
  }

  function showCopyFeedback(event){
    if (event.defaultPrevented || !copyUrl || copyLink.hidden || feedbackShown) return;
    feedbackShown = true;
    try {
      if (sessionStorage.getItem(feedbackSessionKey)) return;
      sessionStorage.setItem(feedbackSessionKey, '1');
    } catch (_) {}
    copyFeedback.hidden = false;
  }

  function isInternalFeedback(){
    var flag = new URLSearchParams(window.location.search).get('pb_internal');
    if (flag === '1' || flag === '0') return flag === '1';
    try { return localStorage.getItem('pb_internal') === '1'; } catch (_) { return false; }
  }

  async function sendCopyFeedback(event){
    var button = event.target.closest('button');
    if (!button || feedbackOptions.hidden || copyFeedback.hidden) return;
    if (button.hasAttribute('data-feedback-close')) {
      copyFeedback.hidden = true;
      if (!copyLink.hidden && !editPanel.hidden) copyLink.focus();
      else if (!btnEdit.hidden) btnEdit.focus();
      return;
    }
    var answer = button.getAttribute('data-feedback-answer');
    if (!answer) return;
    feedbackOptions.hidden = true;
    feedbackStatus.textContent = '응답 보내는 중…';
    feedbackStatus.focus();
    if (isInternalFeedback()) {
      feedbackStatus.textContent = '검증용 응답은 집계에서 제외됩니다.';
      return;
    }
    try {
      var response = await fetch('/hwp/feedback', {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
        redirect: 'error',
        headers: { 'X-HWP-Feedback': answer }
      });
      if (response.status !== 204) throw new Error('Feedback not accepted');
      feedbackStatus.textContent = '응답해 주셔서 감사합니다.';
    } catch (_) {
      feedbackStatus.textContent = '응답 접수를 확인하지 못했어요.';
    }
  }

  function mountViewer(target, nextViewer){
    if (viewer) { try { viewer.distory(); } catch(e){} }
    viewerEl.replaceWith(target);
    viewerEl = target;
    viewer = nextViewer || null;
    btnViewSize.hidden = !viewerEl.querySelector('.hwp-page-scroll');
    btnViewSize.textContent = viewerEl.classList.contains('hwp-fit') ? '원래 크기로 보기' : '화면 폭에 맞추기';
    fitHwpPages();
  }

  function setupEdit(doc){
    if (!doc) return;
    btnEdit.hidden = false;
    btnEdit.textContent = editTitle.textContent = doc.format + ' 문구 편집';
    makeCopy.textContent = doc.format + ' 사본 만들기';
    copyLink.textContent = doc.format + ' 사본 다운로드';
    editHelp.textContent = doc.format === 'HWP'
      ? '한 줄·한 서식 안의 짧은 문구를 늘리거나 줄입니다. 표 셀의 길이를 바꿀 때는 폭이 제한됩니다.'
      : '표에서 기존 문구가 있는 셀을 누르거나, 본문·표 문구를 검색해 한 곳씩 바꿉니다.';
  }

  function handle(file){
    if (!file || busy) return;
    var isHwpx = /\.hwpx$/i.test(file.name);
    var isHwp = /\.hwp$/i.test(file.name);
    if (!isHwpx && !isHwp) { drop.classList.add('err'); say('HWP·HWPX 파일만 열 수 있음', 'err'); return; }
    drop.classList.remove('err');
    setBusy(true);
    say('변환 중…', 'busy');
    var reader = new FileReader();
    reader.onload = function(){
      try {
        var bytes = new Uint8Array(reader.result);
        // 새 문서를 다 그린 뒤 교체한다. 열기에 실패하면 현재 편집과 사본을 유지한다.
        var nextViewer = document.createElement('div');
        nextViewer.id = 'viewer';
        var next = isHwpx ? renderHwpx(bytes, nextViewer) : renderHwp(bytes, nextViewer);
        if (isHwp && window.PBHwpEditor && window.PBHwpEditor.canEdit(bytes)) {
          var charShapes = next.charShapes.map(function(shape){
            return { fontBaseSize: Math.round(shape.fontBaseSize * 100), fontScale: shape.fontScale,
              fontRatio: shape.fontRatio, fontSpacing: shape.fontSpacing };
          });
          next.edit = { format: 'HWP', bytes: bytes, charShapes: charShapes };
        }
        clearResult();
        mountViewer(nextViewer, next.viewer);
        current = { name: file.name, text: next.text, html: next.html, edit: next.edit };
        fileName.textContent = file.name;
        compact.hidden = false;
        document.body.classList.add('has-input');
        setupEdit(current.edit);
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
  drop.addEventListener('mouseenter', function(){ loadLib(); });
  drop.addEventListener('touchstart', function(){ loadLib(); }, { passive: true });
  fileInput.addEventListener('change', function(){ handle(fileInput.files[0]); fileInput.value = ''; });
  ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('err'); drop.classList.add('on'); loadLib(); }); });
  ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev, function(e){ e.preventDefault(); drop.classList.remove('on'); }); });
  drop.addEventListener('drop', function(e){ handle(e.dataTransfer.files[0]); });
  document.addEventListener('paste', function(e){ var f = e.clipboardData && e.clipboardData.files && e.clipboardData.files[0]; if (f) handle(f); });

  btnPdf.addEventListener('click', function(){ say('인쇄 창에서 PDF로 저장 선택', 'ok'); window.print(); });
  btnViewSize.addEventListener('click', function(){
    var fit = viewerEl.classList.toggle('hwp-fit');
    btnViewSize.textContent = fit ? '원래 크기로 보기' : '화면 폭에 맞추기';
    if (fit) {
      fitHwpPages();
      viewerEl.querySelector('.hwp-page-scroll').scrollLeft = 0;
    }
  });
  window.addEventListener('resize', fitHwpPages);
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
  btnReset.addEventListener('click', function(){ reset(); btnSelect.focus(); });
  btnEdit.addEventListener('click', toggleEditor);
  document.addEventListener('click', selectHwpxCell);
  findForm.addEventListener('submit', findEditMatches);
  findInput.addEventListener('input', function(){ clearEditMatches(); editMessage(''); });
  replaceForm.addEventListener('submit', applyEdit);
  makeCopy.addEventListener('click', buildEditCopy);
  copyLink.addEventListener('click', showCopyFeedback);
  feedbackOptions.addEventListener('click', sendCopyFeedback);
})();
