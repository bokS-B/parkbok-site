// Compatibility for cached pages and bookmarks; the palette owns this feature.
(function(){var lang=(window.COLOR_TOOL||{}).lang||'en';var langs=['en','ko','zh','ja','es','pt','de','fr'];if(langs.indexOf(lang)<0)lang='en';location.replace('/color/palette/'+(lang==='en'?'':lang+'/')+location.search+location.hash);})();
