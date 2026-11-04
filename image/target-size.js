// Shared browser-only quality search. Always return the real encoded Blob;
// callers validate its byte length and decide whether dimensions may change.
(function(){
  async function fitQuality(ctx, canvas, mime, initial, quality, budget){
    if (budget === null || initial.size <= budget || !/^image\/(jpeg|webp)$/.test(mime)) return initial;
    var lo = Math.min(0.3, quality), hi = quality;
    var low = await ctx.toBlob(canvas, mime, lo);
    if (low.size > budget) return low.size < initial.size ? low : initial;
    var fit = low;
    for (var i = 0; i < 7 && hi - lo > 0.01; i++) {
      var q = (lo + hi) / 2, blob = await ctx.toBlob(canvas, mime, q);
      if (blob.size <= budget) { fit = blob; lo = q; } else hi = q;
    }
    return fit;
  }
  var api = { fitQuality: fitQuality };
  if (typeof window !== 'undefined') window.PBImageTarget = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
