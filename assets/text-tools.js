(function(){
  var TT = window.TT = {};
  function $(id){ return document.getElementById(id); }
  TT.$ = $;

  TT.say = function(msg, err){
    var s = $('status'); if (!s) return;
    s.textContent = msg; s.className = 'status' + (err ? ' err' : '');
  };

  TT.count = function(s){ return Array.from(s).length; };
  TT.fmt = function(n){ return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  TT.val = function(name){ var el = document.querySelector('[name="' + name + '"]:checked'); return el ? el.value : ''; };

  TT.download = function(name, content){
    var blob = new Blob(['﻿' + content], { type: 'text/plain;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click();
    setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };

  TT.copy = function(text, done){
    function ok(){ TT.say(done || '결과를 복사했습니다. 원하는 곳에 Ctrl+V 로 붙여 넣으세요.'); }
    function fallback(){
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); }
      catch (e) { TT.say('복사하지 못했습니다. 결과 칸에서 직접 선택해 복사하세요.', true); }
      ta.remove();
    }
    if (!text) { TT.say('복사할 내용이 없습니다.', true); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback);
    else fallback();
  };

  // o: { input, output, convert(src) -> string, after(result, src), filename }
  TT.setup = function(o){
    var inp = $(o.input || 'in'), out = $(o.output || 'out');
    var timer = null;
    function run(){
      var r;
      try { r = o.convert(inp.value); }
      catch (e) { console.error(e); TT.say('처리 중 오류: ' + (e && e.message ? e.message : e), true); return; }
      if (out && typeof r === 'string') out.value = r;
      if (o.after) o.after(r, inp.value);
    }
    function sched(){ clearTimeout(timer); timer = setTimeout(run, 60); }
    inp.addEventListener('input', sched);
    Array.prototype.forEach.call(document.querySelectorAll('[data-opt]'), function(el){
      el.addEventListener('change', run);
      if (el.type === 'text' || el.type === 'number') el.addEventListener('input', sched);
    });
    var b;
    if ((b = $('btn-copy'))) b.addEventListener('click', function(){ TT.copy(out ? out.value : inp.value); });
    if ((b = $('btn-paste'))) b.addEventListener('click', function(){
      if (navigator.clipboard && navigator.clipboard.readText) {
        navigator.clipboard.readText().then(function(t){ inp.value = t; run(); inp.focus(); TT.say('붙여 넣었습니다.'); },
          function(){ inp.focus(); TT.say('브라우저가 붙여넣기 권한을 막았습니다. 원본 칸을 누르고 Ctrl+V 하세요.', true); });
      } else { inp.focus(); TT.say('원본 칸을 누르고 Ctrl+V 하세요.'); }
    });
    if ((b = $('btn-clear'))) b.addEventListener('click', function(){ inp.value = ''; run(); inp.focus(); TT.say('지웠습니다.'); });
    if ((b = $('btn-download'))) b.addEventListener('click', function(){
      var t = out ? out.value : inp.value;
      if (!t) { TT.say('저장할 내용이 없습니다.', true); return; }
      TT.download(o.filename || 'result.txt', t);
    });
    if ((b = $('btn-swap'))) b.addEventListener('click', function(){ inp.value = out.value; run(); TT.say('결과를 원본 칸으로 옮겼습니다. 이어서 다른 설정으로 처리할 수 있습니다.'); });
    run();
    return run;
  };
})();
