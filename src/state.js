export const state = {
  resources: [], 
  clips: [],
  tracks: [
    { id:'video', label:'Video', icon:'▶' },
    { id:'audio', label:'Audio', icon:'♪' },
    { id:'music', label:'Música', icon:'♫' },
    { id:'text', label:'Texto', icon:'T' }
  ],
  selectedClipId: null,
  currentTime: 0, 
  isPlaying: false,
  aspectRatio: '16:9',
  globalVolume: 0.8
};

export let PX_PER_SEC = 50;
export function setPxPerSec(val) {
    PX_PER_SEC = val;
}
