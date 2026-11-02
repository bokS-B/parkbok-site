(function(){
  var TT = window.TT = {};
  function $(id){ return document.getElementById(id); }
  TT.$ = $;

  // 상태 줄. kind: 'err' | 'ok' | 'busy' | 'empty' (true 는 'err' 와 같음, 예전 호출 호환)
  TT.say = function(msg, kind){
    var s = $('status'); if (!s) return;
    if (kind === true) kind = 'err';
    s.textContent = msg || ''; s.className = 'status' + (kind ? ' ' + kind : '');
  };
  // 복사·저장 중 body.busy
  TT.busy = function(on){
    var c = document.body.classList;
    if (on) c.add('busy'); else c.remove('busy');
  };

  TT.count = function(s){ return Array.from(s).length; };
  TT.fmt = function(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  TT.val = function(name){ var el = document.querySelector('[name="' + name + '"]:checked'); return el ? el.value : ''; };

  TT.download = function(name, content, done){
    TT.busy(true); TT.say('저장 중', 'busy');
    try {
      var blob = new Blob(['﻿' + content], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
      TT.say(done || '저장 완료', 'ok');
    } catch (e) {
      TT.say('저장하지 못했습니다', 'err');
    }
    TT.busy(false);
  };

  TT.copy = function(text, done){
    function ok(){ TT.busy(false); TT.say(done || '복사 완료', 'ok'); }
    function fallback(){
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); }
      catch (e) { TT.busy(false); TT.say('복사하지 못했습니다. 결과 칸에서 직접 선택해 복사하세요.', 'err'); }
      ta.remove();
    }
    if (!text) { TT.say('결과 없음', 'empty'); return; }
    TT.busy(true); TT.say('복사 중', 'busy');
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  };

  // o: { input, output(null 이면 결과칸 없음), convert(src) -> string, after(result, src), result() -> 복사할 글, filename }
  // 페이지 뼈대: #in(원본) · #opts(옵션, 입력 전 hidden) · #out(결과 단계, 입력 전 hidden) · #stats(글자수 타일)
  //              #btn-primary(결과 복사) · #btn-download(.txt 저장) · #btn-restart(다시 시작) · #btn-swap · #btn-paste · #status
  TT.setup = function(o){
    var inp = $(o.input || 'in');
    var out = o.output === null ? null : $(o.output || 'out-text');
    var opts = $('opts'), stage = $('out'), stats = $('stats'), primary = $('btn-primary');
    var timer = null;

    function resultText(){
      if (o.result) return o.result() || '';
      return out ? out.value : inp.value;
    }
    function hide(el, yes){ if (!el) return; if (yes) el.setAttribute('hidden', ''); else el.removeAttribute('hidden'); }
    function show(has){
      var c = document.body.classList;
      if (has) c.add('has-input'); else c.remove('has-input');
      hide(opts, !has); hide(stage, !has); hide(stats, !has);
    }
    function run(){
      var src = inp.value, has = src.length > 0, r;
      show(has);
      try { r = o.convert(src); }
      catch (e) { console.error(e); if (primary) primary.disabled = true; TT.say('처리 중 오류: ' + (e && e.message ? e.message : e), 'err'); return; }
      if (out && typeof r === 'string') out.value = r;
      if (!has) { if (primary) primary.disabled = true; TT.say(''); return; }
      if (typeof r === 'string' && r.length === 0) { if (primary) primary.disabled = true; TT.say('결과 없음', 'empty'); return; }
      if (primary) primary.disabled = false;
      if (o.after) o.after(r, src);
    }
    function sched(){ clearTimeout(timer); timer = setTimeout(run, 60); }
    inp.addEventListener('input', sched);
    Array.prototype.forEach.call(document.querySelectorAll('[data-opt]'), function(el){
      el.addEventListener('change', run);
      if (el.type === 'text' || el.type === 'number') el.addEventListener('input', sched);
    });
    function copyResult(){
      if (!inp.value) { TT.say('결과 없음', 'empty'); return; }
      TT.copy(resultText());
    }
    var b;
    if ((b = primary)) b.addEventListener('click', copyResult);
    if ((b = $('btn-copy'))) b.addEventListener('click', copyResult);
    if ((b = $('btn-download'))) b.addEventListener('click', function(){
      var t = out ? out.value : inp.value;
      if (!t) { TT.say('결과 없음', 'empty'); return; }
      TT.download(o.filename || 'result.txt', t);
    });
    function restart(){ inp.value = ''; run(); inp.focus(); }
    if ((b = $('btn-restart'))) b.addEventListener('click', restart);
    if ((b = $('btn-clear'))) b.addEventListener('click', restart);
    if ((b = $('btn-swap'))) b.addEventListener('click', function(){
      if (!out || !out.value) { TT.say('결과 없음', 'empty'); return; }
      inp.value = out.value; run(); TT.say('결과를 원본으로 옮김', 'ok');
    });
    if ((b = $('btn-paste'))) b.addEventListener('click', function(){
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function(t){ inp.value = t; run(); inp.focus(); },
          function(){ inp.focus(); TT.say('원본 칸을 누르고 Ctrl+V 하세요', 'err'); });
      } else { inp.focus(); TT.say('원본 칸을 누르고 Ctrl+V 하세요'); }
    });
    // Ctrl+Enter(맥은 ⌘+Enter)로 결과 복사
    document.addEventListener('keydown', function(e){
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); copyResult(); }
    });
    // PC에서는 열리자마자 입력칸에 커서 (휴대폰은 키보드가 화면을 가리므로 제외)
    if (window.innerWidth > 700 && !inp.value) inp.focus();
    run();
    return run;
  };
})();
