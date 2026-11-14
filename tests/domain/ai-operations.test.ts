import { applyEditOperations, operationSchema, type EditOperation } from '../../src/ai/operations';
import { sampleShow } from '../../src/domain';
const base: EditOperation = {kind:'setNumber',cueIds:['opening'],field:'fadeOutMs',numberValue:2000,boolValue:null,textValue:null,destinationIndex:null,phrase:null,action:null,scopeCueId:null,targetCueId:null,delayMs:null};
describe('finite assistant operations', () => {
  let sequence = 0; const nextId = () => `ai-${++sequence}`;
  it('applies bulk edits without mutating the source and maps percent volume', () => {
    const updated = applyEditOperations(sampleShow,'set-main',[base,{...base,field:'volumePercent',numberValue:50}],'he',nextId);
    expect(updated.cues.opening?.type === 'audio' && updated.cues.opening.fadeOutMs).toBe(2000);
    expect(updated.cues.opening?.type === 'audio' && updated.cues.opening.gainDb).toBeCloseTo(-6.0206);
    expect(sampleShow.cues.opening?.type === 'audio' && sampleShow.cues.opening.fadeOutMs).toBe(1800);
  });
  it('rejects unknown targets, executable extras and invalid speed atomically', () => {
    expect(() => applyEditOperations(sampleShow,'set-main',[base,{...base,cueIds:['missing']}],'en',nextId)).toThrow();
    expect(() => applyEditOperations(sampleShow,'set-main',[{...base,field:'playbackRate',numberValue:4}],'en',nextId)).toThrow();
    expect(operationSchema.safeParse({...base,code:'delete everything'}).success).toBe(false);
  });
  it('copies independent song tuning into a new playlist while sharing media', () => {
    const updated = applyEditOperations(sampleShow,'set-main',[{...base,kind:'copyToPlaylist',textValue:'Kids show'}],'en',nextId);
    const set = updated.sets.at(-1)!; const copied = updated.cues[set.cueOrder[0]!]!;
    expect(copied.id).not.toBe('opening');
    expect(copied.type === 'audio' && copied.mediaAssetId).toBe('media-open');
    expect(set.transportMode).toBe('oms');
  });
  it('creates empty playlists and delayed scoped rules using validated song IDs', () => {
    const updated = applyEditOperations(sampleShow,'set-main',[
      {...base,kind:'createPlaylist',cueIds:[],textValue:'New act'},
      {...base,kind:'voiceRule',cueIds:[],phrase:'Bring it back',action:'PLAY',targetCueId:'opening',scopeCueId:'opening',delayMs:4000},
    ],'en',nextId);
    expect(updated.sets.at(-1)?.cueOrder).toEqual([]);
    expect(updated.voiceRules?.[0]).toMatchObject({cueId:'opening',action:{type:'PLAY',cueId:'opening'},delayMs:4000});
    expect(() => applyEditOperations(sampleShow,'set-main',[{...base,kind:'voiceRule',phrase:'Start',action:'PLAY',targetCueId:'missing'}],'en',nextId)).toThrow();
  });
});
