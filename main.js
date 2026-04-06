import './style.css';
import { renderTimeline, initTimelineEvents } from './src/timeline.js';
import { initPreviewLoop } from './src/preview.js';
import { initFFmpeg, exportVideo } from './src/ffmpeg-core.js';
import { state, PX_PER_SEC } from './src/state.js';
import { getInterpolatedValue } from './src/preview.js';

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
    
    wrap.addEventListener('click', () => {
        // Por defecto: Foto dura 5s, Audio dura 10s en la línea de tiempo.
        const durationSecs = res.type === 'image' ? 5 : 10; 
        const newClip = {
            id: Date.now(),
            resourceId: res.id,
            track: res.type === 'image' ? 'video' : 'audio',
            label: res.label,
            start: 0, 
            width: durationSecs * PX_PER_SEC,
            type: res.type,
            properties: { scale: 1.0, rotation: 0, posX: 0, posY: 0, opacity: 1.0, brightness: 100, speed: 1.0 },
            keyframes: { scale: [], rotation: [], posX: [], posY: [], opacity: [] }
        };
        state.clips.push(newClip);
        
        // Auto-Seleccionar clip recién insertado para activar las barras de inmediato
        state.selectedClipId = newClip.id;
        window.dispatchEvent(new CustomEvent('clip-selected'));
        
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
  fileInput.accept = 'image/png, image/jpeg, audio/mpeg, audio/wav';
  fileInput.multiple = true;
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);
  
  uploadBtn.addEventListener('click', () => fileInput.click());
  
  const processFiles = (files) => {
     Array.from(files).forEach(file => {
         const isImg = file.type.startsWith('image/');
         const isAudio = file.type.startsWith('audio/');
         if(!isImg && !isAudio) return;
         
         const blobUrl = URL.createObjectURL(file);
         
         // Precarga Visual
         const imgNode = new Image();
         if(isImg) imgNode.src = blobUrl;
         
         // Precarga Auditiva
         const audioNode = isAudio ? new Audio(blobUrl) : null;
         
         const res = {
             id: Date.now() + Math.random(),
             file: file,
             type: isImg ? 'image' : 'audio',
             label: file.name,
             blobUrl: blobUrl,
             imgElement: isImg ? imgNode : null,
             audioElement: audioNode 
         };
         state.resources.push(res);
     });
     renderMediaGrid();
  };
  
  fileInput.addEventListener('change', (e) => processFiles(e.target.files));
  
  // SISTEMA GLOBAL DE DRAG AND DROP
  document.body.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
  document.body.addEventListener('drop', (e) => {
      e.preventDefault(); e.stopPropagation();
      if(e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          processFiles(e.dataTransfer.files);
      }
  });
}

function initUIEvents() {
    document.querySelectorAll('.res-tab').forEach(t => {
      t.addEventListener('click', () => { 
          document.querySelectorAll('.res-tab').forEach(x=>x.classList.remove('active')); 
          t.classList.add('active'); 
      });
    });
    
    // ...
}

document.addEventListener('DOMContentLoaded', async () => {
  setupFileUploader();
  initUIEvents();

  initTimelineEvents();
  renderTimeline();
  
  initPreviewLoop(); 
  
  await initFFmpeg();
  
  const btnExport = document.getElementById('btn-export');
  if(btnExport) {
    btnExport.addEventListener('click', () => exportVideo(btnExport));
  }

  // EVENTO DE LUPA (ZOOM)
  const zoomSlider = document.getElementById('tlZoom');
  if (zoomSlider) {
      zoomSlider.addEventListener('input', (e) => {
          const newPx = parseInt(e.target.value);
          const ratio = newPx / PX_PER_SEC;
          setPxPerSec(newPx);
          
          state.clips.forEach(c => {
             c.start = c.start * ratio;
             c.width = c.width * ratio;
          });
          
          renderTimeline();
      });
      
      // ATAJO PROFESIONAL ZOOOM (Ctrl + MouseWheel)
      const tlBody = document.getElementById('tlBody');
      if(tlBody) {
          tlBody.addEventListener('wheel', (e) => {
              if(e.ctrlKey || e.metaKey) {
                  e.preventDefault();
                  let val = parseInt(zoomSlider.value);
                  val -= e.deltaY * 0.2; // Sensibilidad
                  val = Math.max(10, Math.min(val, 300));
                  zoomSlider.value = val;
                  zoomSlider.dispatchEvent(new Event('input'));
              }
          }, { passive: false });
      }
  }

  // EVENTO DE VOLUMEN FÍSICO
  const volSlider = document.getElementById('volSlider');
  const volVal = document.getElementById('volVal');
  if (volSlider && volVal) {
      volSlider.addEventListener('input', (e) => {
          const val = e.target.value;
          volVal.textContent = val + '%';
          
          if (state.selectedClipId) {
             const clip = state.clips.find(c => c.id === state.selectedClipId);
             if (clip && clip.type === 'audio') {
                 const res = state.resources.find(r => r.id === clip.resourceId);
                 if (res && res.audioElement) {
                     res.audioElement.volume = parseInt(val) / 100;
                 }
             }
          }
      });
  }

  // EVENTOS DE PROPIEDADES (TRANSFORM. Y APARIENCIA)
  // Función Maestra sugerida por el Usuario
  const setPropertyValue = (clip, propName, newValue, currentTime) => {
      const relativeTime = (currentTime * PX_PER_SEC - clip.start) / PX_PER_SEC; 
      
      // Siempre reflejar el mando en la propiedad base como punto de fallback
      clip.properties[propName] = newValue;

      if (clip.keyframes && clip.keyframes[propName] && clip.keyframes[propName].length > 0) {
          let existingKF = clip.keyframes[propName].find(kf => Math.abs(kf.time - relativeTime) < 0.1);
          if (existingKF) {
              existingKF.value = newValue;
          } else {
              clip.keyframes[propName].push({ time: relativeTime, value: newValue });
              clip.keyframes[propName].sort((a, b) => a.time - b.time);
              syncKeyframesUI();
              renderTimeline();
          }
      }
      
      // En nuestro sistema, el requestAnimationFrame ya está dibujando permanentemente a 60fps
  };

  const bindProp = (id, propName, isSlider, scaleFactor, suffixEl, suffixStr) => {
      const el = document.getElementById(id);
      const sEl = suffixEl ? document.getElementById(suffixEl) : null;
      if(!el) return;
      el.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          const finalVal = val * scaleFactor;
          if (sEl) sEl.textContent = Math.round(val) + suffixStr;
          if (state.selectedClipId) {
              const clip = state.clips.find(c => c.id === state.selectedClipId);
              if (clip && clip.properties) {
                  setPropertyValue(clip, propName, finalVal, state.currentTime);
              }
          }
      });
  };

  bindProp('scaleSlider', 'scale', true, 0.01, 'scaleVal', '%');
  bindProp('rotSlider', 'rotation', true, 1, 'rotVal', '°');
  bindProp('opacSlider', 'opacity', true, 0.01, 'opacVal', '%');
  
  // DESPACHADOR REACTIVO (Sincroniza UI al clickar Clip)
  
  const ensureKeyframes = (clip) => {
      if (!clip.keyframes) clip.keyframes = { scale: [], rotation: [], posX: [], posY: [], opacity: [] };
  };

  const syncPropertiesPanel = () => {
      if (!state.selectedClipId) return;
      const clip = state.clips.find(c => c.id === state.selectedClipId);
      if (!clip) return;
      
      if (!clip.properties) {
          clip.properties = { scale: 1.0, rotation: 0, posX: 0, posY: 0, opacity: 1.0, brightness: 100, speed: 1.0 };
      }
      ensureKeyframes(clip);
      
      const safeSet = (id, val, sEl, suffix) => {
          const e = document.getElementById(id);
          if(e) e.value = val;
          if(sEl) { const el = document.getElementById(sEl); if(el) el.textContent = val + suffix; }
      }
      
      safeSet('scaleSlider', Math.round(clip.properties.scale * 100), 'scaleVal', '%');
      safeSet('rotSlider', clip.properties.rotation, 'rotVal', '°');
      safeSet('opacSlider', Math.round(clip.properties.opacity * 100), 'opacVal', '%');
      
      // Sync Special Speed
      if(clip.properties.speed === undefined) clip.properties.speed = 1.0;
      updateSpeedVisualOnly(clip.properties.speed);
      
      syncKeyframesUI();
  };
  
  // KEYFRAMES MANAGER
  const syncKeyframesUI = () => {
      if(!state.selectedClipId) return;
      const clip = state.clips.find(c => c.id === state.selectedClipId);
      if(!clip || !clip.keyframes) return;
      
      const localTimeSecs = (state.currentTime * PX_PER_SEC - clip.start) / PX_PER_SEC;
      const tolerance = 0.1; 
      
      const kfMapDisplay = {
          'scale': { slider: 'scaleSlider', text: 'scaleVal', suffix: '%', mult: 100 },
          'rotation': { slider: 'rotSlider', text: 'rotVal', suffix: '°', mult: 1 },
          'opacity': { slider: 'opacSlider', text: 'opacVal', suffix: '%', mult: 100 }
      };

      ['scale', 'rotation', 'opacity'].forEach(prop => {
          // Activar/Desactivar rumbos
          const btn = document.getElementById(`kf-${prop}`);
          if(btn) {
              const hasKf = clip.keyframes[prop].some(kf => Math.abs(kf.time - localTimeSecs) < tolerance);
              if(hasKf) btn.classList.add('active');
              else btn.classList.remove('active');
          }
          
          // Sincronizar físicamente las barras interpoladas
          const map = kfMapDisplay[prop];
          const sliderEl = document.getElementById(map.slider);
          const txtEl = document.getElementById(map.text);
          
          if (sliderEl && document.activeElement !== sliderEl) {
              const val = getInterpolatedValue(clip.keyframes[prop], localTimeSecs, clip.properties[prop]);
              const visualVal = Math.round(val * map.mult);
              sliderEl.value = visualVal;
              if(txtEl) txtEl.textContent = visualVal + map.suffix;
          }
      });
      
      const btnPos = document.getElementById('kf-pos');
      if (btnPos) {
          const hasX = clip.keyframes.posX.some(kf => Math.abs(kf.time - localTimeSecs) < tolerance);
          const hasY = clip.keyframes.posY.some(kf => Math.abs(kf.time - localTimeSecs) < tolerance);
          if (hasX || hasY) btnPos.classList.add('active');
          else btnPos.classList.remove('active');
      }
  };

  window.addEventListener('time-update', syncKeyframesUI);

  const setupKfButtons = () => {
      const kfMap = {
          'kf-scale': { prop: 'scale', mult: 1/100, slider: 'scaleSlider' },
          'kf-rotation': { prop: 'rotation', mult: 1, slider: 'rotSlider' },
          'kf-opacity': { prop: 'opacity', mult: 1/100, slider: 'opacSlider' },
      };
      

      
      Object.keys(kfMap).forEach(btnId => {
         const btn = document.getElementById(btnId);
         if(!btn) return;
         btn.addEventListener('click', () => {
             if(!state.selectedClipId) return;
             const clip = state.clips.find(c => c.id === state.selectedClipId);
             if(!clip) return;
             ensureKeyframes(clip);
             
             const localTimeSecs = (state.currentTime * PX_PER_SEC - clip.start) / PX_PER_SEC;
             const tolerance = 0.1;
             const slider = document.getElementById(kfMap[btnId].slider);
             if(!slider) return;
             
             const rawValue = parseFloat(slider.value);
             const finalValue = rawValue * kfMap[btnId].mult;
             const propKey = kfMap[btnId].prop;
             
             const existingIdx = clip.keyframes[propKey].findIndex(k => Math.abs(k.time - localTimeSecs) < tolerance);
             
             if(existingIdx !== -1) {
                 clip.keyframes[propKey].splice(existingIdx, 1);
             } else {
                 clip.keyframes[propKey].push({ time: localTimeSecs, value: finalValue });
                 clip.keyframes[propKey].sort((a,b) => a.time - b.time);
             }
             
             renderTimeline();
             syncKeyframesUI();
         });
      });
      
      // Controladores DPAD para Position
      const movePos = (dx, dy) => {
          if(!state.selectedClipId) return;
          const clip = state.clips.find(c => c.id === state.selectedClipId);
          if(!clip) return;
          
          const localTimeSecs = (state.currentTime * PX_PER_SEC - clip.start) / PX_PER_SEC;
          const currentX = getInterpolatedValue(clip.keyframes?.posX, localTimeSecs, clip.properties.posX);
          const currentY = getInterpolatedValue(clip.keyframes?.posY, localTimeSecs, clip.properties.posY);
          
          let newX = currentX + dx;
          let newY = currentY + dy;
          setPropertyValue(clip, 'posX', newX, state.currentTime);
          setPropertyValue(clip, 'posY', newY, state.currentTime);
      };
      
      const bLeft = document.getElementById('btn-posX-minus');
      const bRight = document.getElementById('btn-posX-plus');
      const bUp = document.getElementById('btn-posY-minus');
      const bDown = document.getElementById('btn-posY-plus');
      
      const amt = 10;
      if(bLeft) bLeft.addEventListener('click', () => movePos(-amt, 0));
      if(bRight) bRight.addEventListener('click', () => movePos(amt, 0));
      if(bUp) bUp.addEventListener('click', () => movePos(0, -amt));
      if(bDown) bDown.addEventListener('click', () => movePos(0, amt));
      
      // Rombo Maestro de XY (kf-pos)
      const kfPos = document.getElementById('kf-pos');
      if (kfPos) kfPos.addEventListener('click', () => {
             if(!state.selectedClipId) return;
             const clip = state.clips.find(c => c.id === state.selectedClipId);
             if(!clip) return;
             
             const localTimeSecs = (state.currentTime * PX_PER_SEC - clip.start) / PX_PER_SEC;
             const tolerance = 0.1;

             ['posX', 'posY'].forEach(propKey => {
                 const existingIdx = clip.keyframes[propKey].findIndex(k => Math.abs(k.time - localTimeSecs) < tolerance);
                 if(existingIdx !== -1) {
                     clip.keyframes[propKey].splice(existingIdx, 1);
                 } else {
                     clip.keyframes[propKey].push({ time: localTimeSecs, value: clip.properties[propKey] });
                     clip.keyframes[propKey].sort((a,b) => a.time - b.time);
                 }
             });
             renderTimeline();
             syncKeyframesUI();
      });
  }
  setupKfButtons();
  
  const btnKfMaster = document.getElementById('kf-master');
  if (btnKfMaster) {
      btnKfMaster.addEventListener('click', () => {
          if(!state.selectedClipId) return;
          const clip = state.clips.find(c => c.id === state.selectedClipId);
          if(!clip) return;
          ensureKeyframes(clip);
          
          const localTimeSecs = (state.currentTime * PX_PER_SEC - clip.start) / PX_PER_SEC;
          const tolerance = 0.1;
          
          ['scale', 'rotation', 'posX', 'posY', 'opacity'].forEach(propKey => {
               const existingIdx = clip.keyframes[propKey].findIndex(k => Math.abs(k.time - localTimeSecs) < tolerance);
               if(existingIdx !== -1) {
                   clip.keyframes[propKey].splice(existingIdx, 1);
               } else {
                   clip.keyframes[propKey].push({ time: localTimeSecs, value: clip.properties[propKey] });
               }
          });
          
          renderTimeline();
          syncKeyframesUI();
      });
  }
  
  const btnResetProps = document.getElementById('btn-reset-props');
  if (btnResetProps) {
      btnResetProps.addEventListener('click', () => {
          if(!state.selectedClipId) return;
          const clip = state.clips.find(c => c.id === state.selectedClipId);
          if(!clip) return;
          
          clip.properties = { scale: 1.0, rotation: 0, posX: 0, posY: 0, opacity: 1.0, brightness: 100, speed: 1.0 };
          clip.keyframes = { scale: [], rotation: [], posX: [], posY: [], opacity: [] };
          if (clip.type === 'audio') {
              const res = state.resources.find(r => r.id === clip.resourceId);
              if (res && res.audioElement) { res.audioElement.playbackRate = 1.0; }
          }
          syncPropertiesPanel();
          renderTimeline();
      });
  }
  
  const updateSpeedVisualOnly = (val) => {
      const sS = document.getElementById('speedSlider');
      const sV = document.getElementById('speedVal');
      const sB = document.getElementById('speedBtns');
      if(sS) sS.value = val;
      if(sV) sV.textContent = val + 'x';
      if(sB) {
          sB.querySelectorAll('.btn-speed').forEach(b => {
              b.classList.remove('active');
              if(parseFloat(b.dataset.speed) === val) b.classList.add('active');
          });
      }
  };

  const notifySpeedChange = (val) => {
      updateSpeedVisualOnly(val);
      if (state.selectedClipId) {
          const clip = state.clips.find(c => c.id === state.selectedClipId);
          if (clip && clip.properties) {
              clip.properties.speed = val;
              if (clip.type === 'audio') {
                 const res = state.resources.find(r => r.id === clip.resourceId);
                 if (res && res.audioElement) { res.audioElement.playbackRate = val; }
              }
          }
      }
  };

  const speedSlider = document.getElementById('speedSlider');
  if (speedSlider) speedSlider.addEventListener('input', (e) => notifySpeedChange(parseFloat(e.target.value)));
  
  const speedBtns = document.getElementById('speedBtns');
  if (speedBtns) {
      speedBtns.addEventListener('click', (e) => {
          if (e.target.classList.contains('btn-speed')) notifySpeedChange(parseFloat(e.target.dataset.speed));
      });
  }

  window.addEventListener('clip-selected', syncPropertiesPanel);
  
  // Script original de botones play
  const playBtnT = document.getElementById('playBtnTransport');
  const playBtnB = document.getElementById('playBtn');
  
  const togglePlay = () => {
     state.isPlaying = !state.isPlaying;
     
     // Si pones en pausa, detener todos los audios inmediatamente
     if (!state.isPlaying) {
         state.resources.filter(r => r.type === 'audio' && r.audioElement).forEach(r => {
             r.audioElement.pause();
         });
     }

     const icon = state.isPlaying 
        ? '<rect x="3" y="3" width="3" height="8" fill="white"/><rect x="8" y="3" width="3" height="8" fill="white"/>' 
        : '<path d="M4 2.5l7 4.5-7 4.5V2.5z" fill="white"/>';
     if(playBtnT) playBtnT.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none">${icon}</svg>`;
     if(playBtnB) playBtnB.style.display = state.isPlaying ? 'none' : 'flex';
  };
  
  if(playBtnT) playBtnT.addEventListener('click', togglePlay);
  if(playBtnB) playBtnB.addEventListener('click', togglePlay);
});
