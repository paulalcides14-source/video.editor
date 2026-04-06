import { state, PX_PER_SEC } from './state.js';

let draggingClip = null;
let startX = 0;

const SNAP_THRESHOLD = 15;
const LEFT_OFFSET = 72; 

function initResize(clip, el) {
    const leftHandle = document.createElement('div');
    leftHandle.className = 'handle handle-left';
    
    const rightHandle = document.createElement('div');
    rightHandle.className = 'handle handle-right';

    el.appendChild(leftHandle);
    el.appendChild(rightHandle);

    leftHandle.onmousedown = (e) => startResize(e, clip, el, 'left');
    rightHandle.onmousedown = (e) => startResize(e, clip, el, 'right');
}

function startResize(e, clip, el, side) {
    e.stopPropagation();
    e.preventDefault();
    
    state.selectedClipId = clip.id;
    window.dispatchEvent(new CustomEvent('clip-selected'));
    let localStartX = e.clientX;
    let initialWidth = clip.width;
    let initialStart = clip.start;

    const onMouseMove = (moveE) => {
        let deltaX = moveE.clientX - localStartX;

        if (side === 'right') {
            let newWidth = initialWidth + deltaX;
            if (newWidth > 15) { 
                clip.width = newWidth;
                el.style.width = newWidth + 'px';
            }
        } 
        else if (side === 'left') {
            let newStart = initialStart + deltaX;
            let newWidth = initialWidth - deltaX;

            if (newWidth > 15 && newStart >= 0) { 
                clip.start = newStart;
                clip.width = newWidth;
                el.style.left = newStart + 'px';
                el.style.width = newWidth + 'px';
            }
        }
    };

    const onMouseUp = () => {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        renderTimeline(); 
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
}

export function renderTimeline() {
  const container = document.getElementById('tlTracks');
  if (!container) return;
  
  container.innerHTML = '';

  state.tracks.forEach(track => {
    const row = document.createElement('div');
    row.className = 'tl-track';

    const lbl = document.createElement('div');
    lbl.className = 'track-label';
    lbl.innerHTML = `<span class="t-ico">${track.icon}</span><span>${track.label}</span>`;
    row.appendChild(lbl);

    const area = document.createElement('div');
    area.className = 'track-area';
    area.dataset.track = track.id;

    state.clips.filter(c => c.track === track.id).forEach(clip => {
      const el = document.createElement('div');
      
      let tClass = 'clip-video';
      if(clip.type === 'text') tClass = 'clip-text-t';
      else if(clip.type === 'music') tClass = 'clip-music';
      else if(clip.type === 'audio') tClass = 'clip-audio';
      
      el.className = `clip ${tClass}`;
      if (state.selectedClipId === clip.id) el.classList.add('selected');
      
      el.style.left = clip.start + 'px';
      el.style.width = clip.width + 'px';
      el.dataset.id = clip.id;

      const inner = document.createElement('div');
      inner.className = 'clip-inner';
      inner.innerHTML = `<span class="clip-name">${clip.label}</span>`;
      el.appendChild(inner);

      if (clip.keyframes) {
          Object.values(clip.keyframes).forEach(kfArray => {
              kfArray.forEach(kf => {
                  const kEl = document.createElement('div');
                  kEl.className = 'clip-kf';
                  kEl.style.left = (kf.time * PX_PER_SEC) + 'px';
                  el.appendChild(kEl);
              });
          });
      }

      initResize(clip, el);

      el.addEventListener('mousedown', (e) => {
        if(e.target.classList.contains('handle')) return; 
        e.stopPropagation();
        state.selectedClipId = clip.id;
        window.dispatchEvent(new CustomEvent('clip-selected'));
        draggingClip = state.clips.find(c => c.id === clip.id);
        startX = e.clientX - draggingClip.start;
        renderTimeline(); 
      });

      area.appendChild(el);
    });

    row.appendChild(area);
    container.appendChild(row);
  });
  
  updatePlayheadVisual();
}

export function updatePlayheadVisual() {
  const innerEl = document.getElementById('tlInner');
  
  // 1. EL LÍMITE INFINITO DINÁMICO
  let maxPx = 0;
  if (state.clips.length > 0) {
      maxPx = Math.max(...state.clips.map(c => c.start + c.width));
  }
  
  // Ancho base del viewport + un margen visual al final de (15 segundos)
  const paddingPx = 15 * PX_PER_SEC;
  const parentW = document.getElementById('tlBody')?.offsetWidth || 1100;
  const dynamicInnerW = Math.max(parentW, Math.round(maxPx + paddingPx + LEFT_OFFSET));
  
  if (innerEl) innerEl.style.width = dynamicInnerW + 'px';
  drawRuler(dynamicInnerW); // Repintar regla basada en este nuevo infinito

  // Lógica de aguja
  const maxSecs = (dynamicInnerW - LEFT_OFFSET) / PX_PER_SEC;
  state.currentTime = Math.max(0, Math.min(state.currentTime, maxSecs));
  
  const playheadX = state.currentTime * PX_PER_SEC;
  const visualX = playheadX + LEFT_OFFSET;
  
  const phLine = document.getElementById('phLine');
  const phHead = document.getElementById('phHead');
  
  if (phLine) phLine.style.left = visualX + 'px';
  if (phHead) phHead.style.left = visualX + 'px';
  
  const timecode = document.getElementById('timecode');
  const scrubTime = document.getElementById('scrubTime');
  
  const m = Math.floor(state.currentTime / 60);
  const s = Math.floor(state.currentTime % 60);
  const ms = Math.floor((state.currentTime % 1) * 100);

  const tStr = `00:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(ms).padStart(2,'0')}`;
  if (timecode) timecode.textContent = tStr;

  // Calculo real del "Tiempo visual máximo usado"
  // Para el texto / 01:30 -> Será el maxPx usado o al menos 5 seg.
  const logicalMaxSecs = Math.max(maxPx / PX_PER_SEC, 5);
  const mMax = Math.floor(logicalMaxSecs / 60);
  const sMax = Math.floor(logicalMaxSecs % 60);
  const maxStr = `00:${String(mMax).padStart(2,'0')}:${String(sMax).padStart(2,'0')}`;
  
  if (scrubTime) scrubTime.textContent = `${tStr.substring(0,8)} / ${maxStr}`;
  
  // La barra de avance ahora calcula su % en relación al Clip más alejado, no al vacío
  let pct = 0;
  if(maxPx > 0) {
     pct = Math.round((playheadX / maxPx) * 100) || 0;
  }
  const scrubBar = document.getElementById('scrubBar');
  if(scrubBar) scrubBar.value = Math.min(pct, 100);
  
  window.dispatchEvent(new CustomEvent('time-update'));
}

export function drawRuler(overrideW = null) {
    const c = document.getElementById('rulerCanvas');
    if(!c) return;
    
    // Si la función le pasa el ancho correcto infinito, la usamos. Si no, leemos el DOM normal.
    const w = overrideW || document.getElementById('tlInner')?.offsetWidth || 1100;
    c.width = w; c.height = 24;
    const ctx = c.getContext('2d');
    
    ctx.fillStyle = '#9ca3af';
    ctx.textBaseline = 'top';
    ctx.font = '10px "JetBrains Mono", monospace';
    
    for(let i = 0; i <= (w / PX_PER_SEC); i += 1) { 
      const x = LEFT_OFFSET + i * PX_PER_SEC;
      if (x > w) break;
      
      const isBig = i % 5 === 0;
      ctx.fillStyle = isBig ? '#4b5563' : '#9ca3af';
      ctx.fillRect(x, isBig ? 12 : 18, 1, isBig ? 12 : 6);
      
      const xHalf = x + (PX_PER_SEC / 2);
      if (xHalf < w) {
         ctx.fillRect(xHalf, 20, 1, 4);
      }
      
      if(isBig) {
        ctx.fillStyle = '#4b5563';
        ctx.fillText(`0:${String(i).padStart(2,'0')}`, x+2, 2);
      }
    }
}

export function initTimelineEvents() {
  
  const tlBody = document.getElementById('tlBody');
  if(!tlBody) return;
  
  let draggingPlayhead = false;

  tlBody.addEventListener('mousedown', (e) => {
    if (e.target.closest('.clip') || e.target.closest('.handle')) return; 
    const rect = tlBody.getBoundingClientRect();
    const globalMouse = e.clientX - rect.left + tlBody.scrollLeft;
    if (globalMouse >= LEFT_OFFSET) {
       draggingPlayhead = true;
       state.currentTime = (globalMouse - LEFT_OFFSET) / PX_PER_SEC;
       updatePlayheadVisual();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (draggingPlayhead) {
        const rect = tlBody.getBoundingClientRect();
        const absolutePixel = (e.clientX - rect.left + tlBody.scrollLeft) - LEFT_OFFSET;
        state.currentTime = Math.max(0, absolutePixel / PX_PER_SEC);
        updatePlayheadVisual();
        return;
    }

    if (draggingClip) {
      let newX = e.clientX - startX;
      if (newX < 0) newX = 0; 
      
      state.clips.forEach(other => {
        if (other.id === draggingClip.id) return;
        if (Math.abs(newX - (other.start + other.width)) < SNAP_THRESHOLD) {
          newX = other.start + other.width;
        }
        if (Math.abs((newX + draggingClip.width) - other.start) < SNAP_THRESHOLD) {
          newX = other.start - draggingClip.width;
        }
      });

      draggingClip.start = newX;
      renderTimeline();
    }
  });

  document.addEventListener('mouseup', () => {
    if(draggingClip) draggingClip = null;
    if(draggingPlayhead) draggingPlayhead = false;
  });

  const scrubBar = document.getElementById('scrubBar');
  if(scrubBar) {
      scrubBar.addEventListener('input', e => {
        // Obtenemos el MaxPx usado para entender el 100% de la barra temporal
        let maxPx = Math.max(...state.clips.map(c => c.start + c.width), 1);
        const pct = parseFloat(e.target.value)/100;
        const playheadX = pct * maxPx;
        state.currentTime = playheadX / PX_PER_SEC;
        updatePlayheadVisual();
      });
  }

  const triggerSplit = () => {
    if (!state.selectedClipId) return alert("Selecciona un clip primero");
    const clip = state.clips.find(c => c.id === state.selectedClipId);
    if(!clip) return;
    
    // Pixel del marcador temporal
    const currentPx = state.currentTime * PX_PER_SEC;
    const localX = currentPx - clip.start;
    
    if (localX > 0 && localX < clip.width) {
      const originalW = clip.width;
      clip.width = localX;
      const newClip = { 
        ...clip, 
        id: Date.now(), 
        start: currentPx, 
        width: originalW - localX,
        label: clip.label + " (Split)",
        properties: clip.properties ? JSON.parse(JSON.stringify(clip.properties)) : { scale: 1.0, rotation: 0, posX: 0, posY: 0, opacity: 1.0, brightness: 100 }
      };
      state.clips.push(newClip);
      state.selectedClipId = newClip.id; 
      renderTimeline();
    } else {
        alert("El Playhead debe estar sobre el clip a cortar.");
    }
  };

  const btnSplit1 = document.getElementById('btn-split');
  if(btnSplit1) btnSplit1.addEventListener('click', triggerSplit);
  const btnSplit2 = document.getElementById('tl-split-btn');
  if(btnSplit2) btnSplit2.addEventListener('click', triggerSplit);
  
  const btnDelete = document.getElementById('btn-delete');
  if (btnDelete) {
    btnDelete.addEventListener('click', () => {
        if (!state.selectedClipId) return;
        state.clips = state.clips.filter(c => c.id !== state.selectedClipId);
        state.selectedClipId = null;
        renderTimeline();
    });
  }
}
