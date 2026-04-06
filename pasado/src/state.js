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
  playheadX: 0, 
  isPlaying: false
};
