// 홈 분류별 카드: 선택한 카드와 그 카드가 들어 있는 그룹만 표시한다. 전체 = 가이드 제외.
(function(){
  var nav = document.querySelector('.chips.filters');
  var grid = document.getElementById('tools-grid');
  if (!nav || !grid) return;
  var chips = [].slice.call(nav.querySelectorAll('.chip'));
  var cards = [].slice.call(grid.querySelectorAll('.card'));
  var groups = [].slice.call(grid.querySelectorAll('.tool-group'));
  function cat(el){ return el.getAttribute('data-cat') || 'all'; }
  function has(c){ for (var i = 0; i < chips.length; i++) if (cat(chips[i]) === c) return true; return false; }
  function apply(f){
    chips.forEach(function(c){ if (cat(c) === f) c.classList.add('on'); else c.classList.remove('on'); });
    cards.forEach(function(a){
      var k = cat(a);
      var show = (f === 'all' && k !== 'guide') || k === f;
      if (show) a.classList.remove('hidden'); else a.classList.add('hidden');
    });
    groups.forEach(function(group){ group.hidden = !group.querySelector('.card:not(.hidden)'); });
  }
  function fromHash(){ var h = (location.hash || '').replace(/^#/, ''); return h && has(h) ? h : 'all'; }
  nav.addEventListener('click', function(e){
    var el = e.target;
    while (el && el !== nav && !(el.classList && el.classList.contains('chip'))) el = el.parentNode;
    if (!el || el === nav) return;
    e.preventDefault();
    var f = cat(el);
    apply(f);
    if (history.replaceState) history.replaceState(null, '', location.pathname + location.search + (f === 'all' ? '' : '#' + f));
  });
  window.addEventListener('hashchange', function(){ apply(fromHash()); });
  apply(fromHash());
})();
