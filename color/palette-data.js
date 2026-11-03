// 24 curated five-role palettes. Neutral/foreground/state colors are derived separately.
// Palette roles, categories, and verification: PALETTE_STUDIO_CHECKLIST.md.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.PB_PALETTES=factory();})(typeof window!=='undefined'?window:this,function(){
  'use strict';
  const rows=[
    ['strawberry-milk','pastel','딸기 우유','Strawberry milk','#fff4ef','#fffdf9','#4a2838','#bb4163','#b7dbdf'],
    ['lavender-letter','pastel','라벤더 편지','Lavender letter','#f1edfa','#fffdfb','#413158','#7863a8','#f4c9a0'],
    ['peach-soda','pastel','살구 소다','Peach soda','#ffead3','#fff7ec','#4c3128','#b95333','#bfe7ea'],
    ['oat-paper','minimal','오트밀 페이퍼','Oat paper','#f1eee7','#fffdf8','#39372f','#686453','#d2bf9a'],
    ['cloud-ink','minimal','구름과 잉크','Cloud and ink','#f0f3f6','#ffffff','#263342','#4e627b','#bdccda'],
    ['sand-editorial','minimal','샌드 에디토리얼','Sand editorial','#ebe2cc','#f7f0df','#3c372d','#675c46','#b7b09e'],
    ['forest-linen','nature','숲과 리넨','Forest linen','#f5f0e6','#fffdf8','#1e3b2f','#7f8c6a','#c8b48a'],
    ['olive-cream','nature','올리브 크림','Olive cream','#fff2b4','#fffbea','#15370d','#47613b','#e5cd82'],
    ['sage-garden','nature','세이지 정원','Sage garden','#eff1e8','#fffef6','#343d2c','#6a795d','#b2bd7e'],
    ['rose-ceramic','warm','로즈 세라믹','Rose ceramic','#f2dace','#fff7f3','#43142d','#7c0e44','#aa5e7a'],
    ['honey-toast','warm','허니 토스트','Honey toast','#fff1da','#fffcf3','#513a26','#a66b2f','#e7af66'],
    ['tomato-picnic','warm','토마토 피크닉','Tomato picnic','#fff2e6','#fffdf6','#54342c','#ba493a','#aabc8c'],
    ['deep-ocean','cool','딥 오션','Deep ocean','#edf9fc','#ffffff','#1b365d','#005a9c','#60c1e5'],
    ['mint-postcard','cool','민트 엽서','Mint postcard','#eaf5f0','#fffdf7','#203e3e','#347d7b','#f0b69b'],
    ['coastal-cream','cool','코스탈 크림','Coastal cream','#ffefc4','#fff9e9','#173746','#086288','#97d7ff'],
    ['berry-pop','vivid','베리 팝','Berry pop','#fff4fb','#ffffff','#33265a','#705eff','#ff6082'],
    ['indigo-lime','vivid','인디고 라임','Indigo lime','#f1f4ff','#ffffff','#1f1462','#0f42c0','#e3ef4f'],
    ['cherry-fizz','vivid','체리 피즈','Cherry fizz','#fff7e8','#ffffff','#442533','#cc2858','#ffc64f'],
    ['plum-cream','classic','자주와 크림','Plum and cream','#eee3b0','#fff9e1','#290044','#500071','#8a2a78'],
    ['caramel-forest','classic','카라멜 포레스트','Caramel forest','#f8eadc','#fff9f2','#09251c','#a55704','#f3d2af'],
    ['navy-ribbon','classic','네이비 리본','Navy ribbon','#f6efdf','#fffaf0','#28364e','#3c5178','#b77b6b'],
    ['midnight-lime','dark','미드나이트 라임','Midnight lime','#202734','#36415a','#f3f8ed','#b7d894','#e0f8c7','dark'],
    ['moonberry','dark','문베리','Moonberry','#272035','#3b304a','#f7eef9','#d8a2c6','#e7c18c','dark'],
    ['deep-tea','dark','깊은 밤의 차','Midnight tea','#182e2c','#29403b','#edf4e8','#b9ca9c','#e2b992','dark']
  ];
  return rows.map(r=>({id:r[0],category:r[1],name:{ko:r[2],en:r[3]},mode:r[9]||'light',colors:Object.fromEntries(['background','surface','text','primary','accent'].map((k,i)=>[k,r[i+4]]))}));
});
