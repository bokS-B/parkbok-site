(function(){
  'use strict';
  var app = document.getElementById('game-app'), C = window.PBGames;
  if (!app || !C) return;
  var message = document.getElementById('game-message');
  function say(text, tone){ message.textContent = text; message.dataset.tone = tone || ''; }
  function $(id){ return document.getElementById(id); }

  if (app.dataset.game === 'rps') {
    var names = { scissors: '가위', rock: '바위', paper: '보' }, scores = { win: 0, draw: 0, loss: 0 };
    var buttons = [].slice.call(app.querySelectorAll('[data-choice]'));
    buttons.forEach(function(button){
      button.addEventListener('click', function(){
        var mine = button.dataset.choice, theirs = C.choices[C.randomInt(0, 2)], result = C.rps(mine, theirs);
        scores[result]++;
        buttons.forEach(function(b){ b.classList.toggle('picked', b === button); });
        $('my-choice').textContent = names[mine]; $('computer-choice').textContent = names[theirs];
        ['win', 'draw', 'loss'].forEach(function(k){ $('score-' + k).textContent = scores[k]; });
        say((result === 'win' ? '이겼어요!' : result === 'draw' ? '비겼어요.' : '졌어요.') + ' 나는 ' + names[mine] + ', 컴퓨터는 ' + names[theirs] + '.', result);
      });
    });
    $('score-reset').addEventListener('click', function(){
      ['win', 'draw', 'loss'].forEach(function(k){ scores[k] = 0; $('score-' + k).textContent = '0'; });
      buttons.forEach(function(b){ b.classList.remove('picked'); });
      $('my-choice').textContent = '선택 전'; $('computer-choice').textContent = '선택 전';
      say('가위, 바위, 보 중 하나를 고르세요.');
    });
  }

  if (app.dataset.game === 'guess') {
    var state, input = $('guess-number'), submit = $('guess-submit'), history = $('guess-history');
    function resetGuess(){
      state = C.newGuess(C.randomInt(1, 100));
      input.value = ''; input.disabled = false; submit.disabled = false; input.removeAttribute('aria-invalid');
      history.replaceChildren(); $('guess-count').textContent = '0';
      say('1부터 100 사이의 숫자를 입력하세요.');
    }
    $('guess-form').addEventListener('submit', function(e){
      e.preventDefault();
      var result = C.guess(state, input.value);
      if (result.kind === 'finished') return;
      if (result.kind === 'invalid') {
        input.setAttribute('aria-invalid', 'true'); say('1부터 100까지의 정수로 입력하세요.', 'error'); input.focus(); return;
      }
      input.removeAttribute('aria-invalid');
      if (result.kind === 'duplicate') { say('이미 고른 숫자예요. 다른 숫자를 골라 보세요.'); input.focus(); input.select(); return; }
      state = result.state; $('guess-count').textContent = state.guesses.length;
      var item = document.createElement('li'); item.textContent = result.value + (result.kind === 'higher' ? '보다 큼' : result.kind === 'lower' ? '보다 작음' : ' 정답');
      history.appendChild(item);
      if (state.solved) {
        say('맞혔어요! ' + state.guesses.length + '번 만에 ' + state.target + '을 찾았습니다.', 'win'); input.disabled = true; submit.disabled = true;
      } else {
        say(result.kind === 'higher' ? result.value + '보다 더 큰 숫자예요.' : result.value + '보다 더 작은 숫자예요.'); input.focus(); input.select();
      }
    });
    input.addEventListener('input', function(){ input.removeAttribute('aria-invalid'); });
    $('guess-reset').addEventListener('click', function(){ resetGuess(); input.focus(); });
    resetGuess();
  }

  if (app.dataset.game === 'reaction') {
    var target = $('reaction-target'), label = $('reaction-label'), hint = $('reaction-hint');
    var phase = 'idle', pending = null, frame = null, readyAt = 0, best = null, recordKey = 'pb_reaction_best_v1', canStore = true;
    try { best = C.validRecord(localStorage.getItem(recordKey)); } catch (_) { canStore = false; }
    function showBest(){ $('reaction-best').textContent = best === null ? '기록 없음' : best + ' ms'; }
    function showStorage(){ $('reaction-note').textContent = canStore ? '최고 기록은 이 브라우저에 저장돼요.' : '기록은 이 화면에서만 유지돼요.'; }
    function clearPending(){ clearTimeout(pending); pending = null; if (frame !== null) cancelAnimationFrame(frame); frame = null; }
    function visual(next, text, help){
      phase = next; target.dataset.state = next; label.textContent = text; hint.textContent = help;
      target.setAttribute('aria-label', text + '. ' + help);
    }
    function start(){
      clearPending(); visual('waiting', '기다리세요…', '‘지금!’이 나오면 누르세요.'); say('준비 중입니다. 아직 누르지 마세요.');
      pending = setTimeout(function(){
        if (phase !== 'waiting' || document.hidden) return;
        frame = requestAnimationFrame(function(){
          frame = null;
          if (phase !== 'waiting' || document.hidden) return;
          readyAt = performance.now(); visual('ready', '지금!', '눌러 주세요.'); say('지금 누르세요.');
        });
      }, C.randomInt(1500, 4000));
    }
    function activateReaction(){
      if (phase === 'waiting') {
        clearPending(); visual('early', '너무 빨랐어요', '다시 눌러 시작하세요.'); say('신호가 나오기 전에 눌렀어요. 다시 도전해 보세요.', 'error'); return;
      }
      if (phase === 'ready') {
        var elapsed = C.reactionTime(readyAt, performance.now());
        clearPending();
        if (elapsed === null) { visual('idle', '다시 시작하기', '‘지금!’이 나오면 누르세요.'); say('측정하지 못했어요. 다시 시작해 주세요.', 'error'); return; }
        best = C.nextBest(best, elapsed); try { localStorage.setItem(recordKey, String(best)); } catch (_) { canStore = false; }
        $('reaction-last').textContent = elapsed + ' ms'; showBest(); showStorage();
        visual('done', elapsed + ' ms', '다시 눌러 도전하세요.'); say('반응 시간은 ' + elapsed + '밀리초입니다.'); return;
      }
      start();
    }
    target.addEventListener('pointerdown', function(e){
      if (e.button !== 0 || e.isPrimary === false) return;
      e.preventDefault(); target.focus({ preventScroll: true }); activateReaction();
    });
    target.addEventListener('keydown', function(e){
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); if (!e.repeat) activateReaction();
    });
    target.addEventListener('keyup', function(e){ if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); });
    // Pointer clicks are already handled on press. detail=0 also supports assistive activation.
    target.addEventListener('click', function(e){ if (e.detail === 0) activateReaction(); });
    function pause(){
      if (phase !== 'waiting' && phase !== 'ready') return;
      clearPending(); visual('idle', '다시 시작하기', '‘지금!’이 나오면 누르세요.'); say('화면을 벗어나 중단됐어요. 다시 시작하세요.');
    }
    document.addEventListener('visibilitychange', function(){ if (document.hidden) pause(); });
    window.addEventListener('blur', pause);
    window.addEventListener('pagehide', clearPending);
    $('reaction-reset').addEventListener('click', function(){
      clearPending(); best = null; try { localStorage.removeItem(recordKey); } catch (_) { canStore = false; }
      $('reaction-last').textContent = '기록 없음'; showBest(); showStorage(); visual('idle', '시작하기', '‘지금!’이 나오면 누르세요.'); say('기록을 지웠어요. 준비되면 시작하세요.');
    });
    showBest(); showStorage();
  }
})();
