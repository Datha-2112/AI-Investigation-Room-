import {describe,it,expect} from 'vitest';
import {playerSafeCase} from './playerSafe.js';

describe('player-safe serialization',()=>{
  it('never returns the solution or clue references before accusation',()=>{
    const result=playerSafeCase({_id:'case-1',public:{title:'The Gallery',setting:'A museum',brief:'A painting vanished.',suspects:[],hints:3},solution:{culpritId:'s-2',motive:'Greed'}},[{_id:'e-1',type:'chat',clueRefs:['clue-1'],content:{messages:[]}}]);
    expect(result.case).not.toHaveProperty('solution');
    expect(JSON.stringify(result)).not.toContain('culpritId');
    expect(result.evidence[0]).not.toHaveProperty('clueRefs');
  });
});
