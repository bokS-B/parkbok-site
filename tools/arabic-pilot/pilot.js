// Local-only helpers. The image/PDF processing engines remain the site's real engines.
(function(){
  var menu=document.querySelector('nav.menu');
  if(menu){
    function fades(){var max=Math.max(0,menu.scrollWidth-menu.clientWidth),pos=Math.min(max,Math.max(0,-menu.scrollLeft));menu.classList.toggle('start',pos>1);menu.classList.toggle('end',pos>=max-1);}
    function center(){var on=menu.querySelector('a.on');if(on&&menu.scrollWidth>menu.clientWidth){var a=menu.getBoundingClientRect(),b=on.getBoundingClientRect();menu.scrollLeft+=b.left-a.left-(menu.clientWidth-b.width)/2;}fades();}
    var timer;function resize(){fades();clearTimeout(timer);timer=setTimeout(center,120);}
    menu.addEventListener('scroll',fades,{passive:true});window.addEventListener('resize',resize);if(window.ResizeObserver)new ResizeObserver(resize).observe(menu);center();
  }
  // The actual engines use ASCII numeric values; the pilot accepts Arabic-Indic/Persian input as well.
  document.addEventListener('change',function(e){var t=e.target;if(t&&t.hasAttribute('data-pilot-number'))t.value=window.__pbArabicNumber(t.value);},true);
})();
