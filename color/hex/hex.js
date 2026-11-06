(function(){
  var b=document.getElementById('theme-btn'),r=document.documentElement,m=window.matchMedia?window.matchMedia('(prefers-color-scheme: dark)'):null;
  if(!b)return;
  function dark(){var c=r.getAttribute('data-theme');return c==='dark'||c!=='light'&&!!(m&&m.matches)}
  function sync(){var d=dark(),label=b.getAttribute(d?'data-label-to-light':'data-label-to-dark');b.setAttribute('aria-pressed',String(d));b.setAttribute('aria-label',label);b.setAttribute('title',label)}
  b.addEventListener('click',function(){var n=dark()?'light':'dark';r.setAttribute('data-theme',n);try{localStorage.setItem('pb_theme',n)}catch(e){}sync();window.dispatchEvent(new Event('resize'))});
  if(m){if(m.addEventListener)m.addEventListener('change',sync);else if(m.addListener)m.addListener(sync)}
  if(window.MutationObserver)new window.MutationObserver(sync).observe(r,{attributes:true,attributeFilter:['data-theme']});
  sync();
})();
(function(){var n=document.querySelector('nav.menu');if(!n)return;var f=function(){var l=n.scrollLeft;n.classList.toggle('start',l>0);n.classList.toggle('end',l+n.clientWidth>=n.scrollWidth-1)};var c=function(){var o=n.querySelector('a.on');if(o&&n.scrollWidth>n.clientWidth){var r=n.getBoundingClientRect(),b=o.getBoundingClientRect();n.scrollLeft+=b.left-r.left-(n.clientWidth-b.width)/2}f()};var t,d=function(){f();clearTimeout(t);t=setTimeout(c,120)};n.addEventListener('scroll',f,{passive:true});window.addEventListener('resize',d);if(window.ResizeObserver)new ResizeObserver(d).observe(n);c()})();
