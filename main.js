import './style.css';
import { renderTimeline, initTimelineEvents } from './src/timeline.js';
import { initPreviewLoop } from './src/preview.js';
import { initFFmpeg, exportVideo } from './src/ffmpeg-core.js';
import { state } from './src/state.js';

function renderMediaGrid() {
  const grid = document.getElementById('mediaGrid');
  if(!grid) return;
  grid.innerHTML = '';
  
  state.resources.forEach((res, i) => {
    const wrap = document.createElement('div');
    wrap.className = 'media-thumb';
    
    const typeLabel = document.createElement('div');
    typeLabel.className = `thumb-type tt-${res.type}`;
    typeLabel.textContent = res.type.toUpperCase();
    wrap.appendChild(typeLabel);
    
    // Thumbnail visual
    if(res.type === 'image') {
       const img = document.createElement('img');
       img.src = res.blobUrl;
       img.style.width = '100%'; img.style.height = '100%'; img.style.objectFit = 'cover';
       wrap.appendChild(img);
    } else if (res.type === 'audio') {
       const c = document.createElement('canvas');
       c.className = 'thumb-canvas';
       c.width = 96; c.height = 54;
       const ctx = c.getContext('2d');
       ctx.fillStyle = `#e2e8f0`; ctx.fillRect(0,0,96,54);
       ctx.fillStyle = `#ef4444`;
       for(let x=2; x<94; x+=4) { ctx.fillRect(x, 27-(Math.random()*20)/2, 2, Math.random()*20); }
       wrap.appendChild(c);
       const dur = document.createElement('div');
       dur.className = 'thumb-dur'; dur.textContent = "Audio";
       wrap.appendChild(dur);
    }
    
    // Al darle click se manda una copia instanciada a la pista
    wrap.addEventListener('click', () => {
        const defaultWidth = res.type === 'image' ? 78 : 156; // 10s o 20s
        state.clips.push({
            id: Date.now(),
            resourceId: res.id,
            track: res.type === 'image' ? 'video' : 'audio',  // Se mete un "image" en el track "video"
            label: res.label,
            start: 72, 
            width: defaultWidth,
            type: res.type
        });
        renderTimeline();
    });
    grid.appendChild(wrap);
  });
}

function setupFileUploader() {
  const uploadBtn = document.querySelector('.add-media');
  if(!uploadBtn) return;
  
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  // Solo permitimos PNG/JPG y Audio MP3/WAV temporalmente como MVP
  fileInput.accept = 'image/png, image/jpeg, audio/mpeg, audio/wav';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  
  uploadBtn.addEventListener('click', () => fileInput.click());
  
  fileInput.addEventListener('change', (e) => {
     Array.from(e.target.files).forEach(file => {
         const isImg = file.type.startsWith('image/');
         const isAudio = file.type.startsWith('audio/');
         if(!isImg && !isAudio) return;
         
         const imgNode = new Image();
         if(isImg) imgNode.src = URL.createObjectURL(file);
         
         const res = {
             id: Date.now() + Math.random(),
             file: file,
             type: isImg ? 'image' : 'audio',
             label: file.name,
             blobUrl: URL.createObjectURL(file),
             imgElement: isImg ? imgNode : null
         };
         state.resources.push(res);
     });
     renderMediaGrid();
  });
}

function initUIEvents() {
    document.querySelectorAll('.res-tab').forEach(t => {
      t.addEventListener('click', () => { 
          document.querySelectorAll('.res-tab').forEach(x=>x.classList.remove('active')); 
          t.classList.add('active'); 
      });
    });
    
    const valUpd = (id, elId, mapFn) => {
        const el = document.getElementById(elId);
        if(el) {
            const input = document.getElementById(id);
            if(input) input.addEventListener('input', e => el.textContent = mapFn(e.target.value));
        }
    };
    valUpd('volSlider', 'volVal', v => v + '%');
    valUpd('scaleSlider', 'scaleVal', v => v + '%');
    valUpd('rotSlider', 'rotVal', v => v + '°');
    valUpd('opacSlider', 'opacVal', v => v + '%');
}


document.addEventListener('DOMContentLoaded', async () => {
  setupFileUploader();
  initUIEvents();

  initTimelineEvents();
  renderTimeline();
  
  initPreviewLoop(); // Se deja encendido el visual con etiquetas genéricas por el momento
  
  await initFFmpeg();
  
  const btnExport = document.getElementById('btn-export');
  if(btnExport) {
    btnExport.addEventListener('click', () => exportVideo(btnExport));
  }
  
  const playBtnT = document.getElementById('playBtnTransport');
  const playBtnB = document.getElementById('playBtn');
  
  const togglePlay = () => {
     state.isPlaying = !state.isPlaying;
     const icon = state.isPlaying 
        ? '<rect x="3" y="3" width="3" height="8" fill="white"/><rect x="8" y="3" width="3" height="8" fill="white"/>' 
        : '<path d="M4 2.5l7 4.5-7 4.5V2.5z" fill="white"/>';
     if(playBtnT) playBtnT.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">${icon}</svg>`;
     if(playBtnB) playBtnB.style.display = state.isPlaying ? 'none' : 'flex';
  };
  
  if(playBtnT) playBtnT.addEventListener('click', togglePlay);
  if(playBtnB) playBtnB.addEventListener('click', togglePlay);
});
