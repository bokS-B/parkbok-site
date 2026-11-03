(function(root, factory){
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PBGames = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  var choices = ['scissors', 'rock', 'paper'];
  function rps(player, computer){
    if (choices.indexOf(player) < 0 || choices.indexOf(computer) < 0) throw new RangeError('Unknown choice');
    if (player === computer) return 'draw';
    return (player === 'scissors' && computer === 'paper') || (player === 'rock' && computer === 'scissors') || (player === 'paper' && computer === 'rock') ? 'win' : 'loss';
  }
  function randomInt(min, max, random){
    var n = (random || Math.random)();
    if (!Number.isInteger(min) || !Number.isInteger(max) || min > max || !Number.isFinite(n) || n < 0 || n >= 1) throw new RangeError('Invalid random range');
    return min + Math.floor(n * (max - min + 1));
  }
  function newGuess(target){
    if (!Number.isInteger(target) || target < 1 || target > 100) throw new RangeError('Target must be 1..100');
    return { target: target, guesses: [], solved: false };
  }
  function guess(state, raw){
    if (state.solved) return { kind: 'finished', state: state };
    var value = typeof raw === 'string' && !raw.trim() ? NaN : Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 100) return { kind: 'invalid', state: state };
    if (state.guesses.some(function(g){ return g.value === value; })) return { kind: 'duplicate', state: state };
    var kind = value === state.target ? 'correct' : value < state.target ? 'higher' : 'lower';
    return { kind: kind, value: value, state: { target: state.target, guesses: state.guesses.concat([{ value: value, kind: kind }]), solved: kind === 'correct' } };
  }
  function validRecord(value){
    var n = Number(value);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  function nextBest(previous, elapsed){
    var a = validRecord(previous), b = validRecord(elapsed);
    return b === null ? a : a === null ? b : Math.min(a, b);
  }
  function reactionTime(start, end){
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
    return Math.max(1, Math.round(end - start));
  }
  return { choices: choices, rps: rps, randomInt: randomInt, newGuess: newGuess, guess: guess, validRecord: validRecord, nextBest: nextBest, reactionTime: reactionTime };
});
