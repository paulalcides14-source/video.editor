import { state } from './state.js';

let draggingClip = null;
let resizingClip = null;
let startX = 0;
let initialWidth = 0;
let initialStart = 0;

const SNAP_THRESHOLD = 15;
const LEFT_OFFSET = 72; // Ancho del track-label

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
      
      // La base matemática directa
      el.style.left = clip.start + 'px';
      el.style.width = clip.width + 'px';
      el.dataset.id = clip.id;

      const inner = document.createElement('div');
      inner.className = 'clip-inner';
      inner.innerHTML = `<span class="clip-name">${clip.label}</span>`;
      el.appendChild(inner);

      const rR = document.createElement('div');
      rR.className = 'clip-resize';
      el.appendChild(rR);
      
      // Evento Resize
      rR.addEventListener('mousedown', (e) => {
         e.stopPropagation();
         state.selectedClipId = clip.id;
         resizingClip = state.clips.find(c => c.id === clip.id);
         startX = e.clientX;
         initialWidth = clip.width;
         renderTimeline();
      });

      // Evento Mover
      el.addEventListener('mousedown', (e) => {
        if(e.target.className === 'clip-resize') return; 
        e.stopPropagation();
        
        state.selectedClipId = clip.id;
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
  const innerW = document.getElementById('tlInner')?.offsetWidth || 1100;
  // Limitar al rango de 0 al tamaño total visual
  state.playheadX = Math.max(0, Math.min(state.playheadX, innerW - LEFT_OFFSET)); 
  
  const phLine = document.getElementById('phLine');
  const phHead = document.getElementById('phHead');
  
  // Visualmente suma 72px porque phHead se calcula absoluto al contenedor padre
  const visualX = state.playheadX + LEFT_OFFSET;
  
  if (phLine) phLine.style.left = visualX + 'px';
  if (phHead) phHead.style.left = visualX + 'px';
  
  const timecode = document.getElementById('timecode');
  const scrubTime = document.getElementById('scrubTime');
  
  const pxPerSec = 7.8;
  const secs = Math.max(0, state.playheadX / pxPerSec); 
  const m = Math.floor(secs/60), s = Math.floor(secs%60), ms = Math.floor((secs%1)*100);

  const tStr = `00:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}:${String(ms).padStart(2,'0')}`;
  if (timecode) timecode.textContent = tStr;
  if (scrubTime) scrubTime.textContent = tStr;
  
  const pct = Math.round((state.playheadX / (innerW - LEFT_OFFSET)) * 100) || 0;
  const scrubBar = document.getElementById('scrubBar');
  if(scrubBar) scrubBar.value = pct;
}

export function drawRuler() {
    const c = document.getElementById('rulerCanvas');
    if(!c) return;
    const w = document.getElementById('tlInner')?.offsetWidth || 1100;
    c.width = w; c.height = 24;
    const ctx = c.getContext('2d');
    
    ctx.fillStyle = '#9ca3af';
    ctx.textBaseline = 'top';
    ctx.font = '10px "JetBrains Mono", monospace';
    
    for(let i = 0; i <= 150; i += 5) {
      const x = LEFT_OFFSET + i * 7.8;
      const isBig = i % 15 === 0;
      
      ctx.fillStyle = isBig ? '#4b5563' : '#9ca3af';
      ctx.fillRect(x, isBig ? 12 : 16, 1, isBig ? 12 : 8);
      
      if(isBig) {
        ctx.fillStyle = '#4b5563';
        ctx.fillText(`0:${String(i).padStart(2,'0')}`, x+2, 2);
      }
    }
}

export function initTimelineEvents() {
  drawRuler();
  
  const tlBody = document.getElementById('tlBody');
  if(!tlBody) return;
  
  let draggingPlayhead = false;

  tlBody.addEventListener('mousedown', (e) => {
    if (e.target.closest('.clip') || e.target.closest('.clip-resize')) return; 
    const rect = tlBody.getBoundingClientRect();
    const globalMouse = e.clientX - rect.left + tlBody.scrollLeft;
    if (globalMouse >= LEFT_OFFSET) {
       draggingPlayhead = true;
       state.playheadX = globalMouse - LEFT_OFFSET;
       updatePlayheadVisual();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (draggingPlayhead) {
        const rect = tlBody.getBoundingClientRect();
        state.playheadX = (e.clientX - rect.left + tlBody.scrollLeft) - LEFT_OFFSET;
        updatePlayheadVisual();
        return;
    }

    if (resizingClip) {
        const diff = e.clientX - startX;
        let newWidth = initialWidth + diff;
        if (newWidth < 10) newWidth = 10; // límite mínimo tamaño
        resizingClip.width = newWidth;
        renderTimeline();
        return;
    }

    if (draggingClip) {
      let newX = e.clientX - startX;
      if (newX < 0) newX = 0; // LIMITE ABSOLUTO EN 0 DE VERDAD MATE

      // Imán
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
    if(resizingClip) resizingClip = null;
    if(draggingPlayhead) draggingPlayhead = false;
  });

  const scrubBar = document.getElementById('scrubBar');
  if(scrubBar) {
      scrubBar.addEventListener('input', e => {
        const innerW = document.getElementById('tlInner')?.offsetWidth || 1100;
        const pct = parseInt(e.target.value)/100;
        state.playheadX = pct * (innerW - LEFT_OFFSET);
        updatePlayheadVisual();
      });
  }

  const triggerSplit = () => {
    if (!state.selectedClipId) return alert("Selecciona un clip primero");
    const clip = state.clips.find(c => c.id === state.selectedClipId);
    if(!clip) return;
    
    const localX = state.playheadX - clip.start;
    if (localX > 0 && localX < clip.width) {
      const originalW = clip.width;
      clip.width = localX;
      const newClip = { 
        ...clip, 
        id: Date.now(), 
        start: state.playheadX, 
        width: originalW - localX,
        label: clip.label + " (Split)"
      };
      state.clips.push(newClip);
      state.selectedClipId = newClip.id; 
      renderTimeline();
    } else {
        alert("El Playhead debe estar sobre el clip a cortar.");
    }
  };

  const btnSplit1 = document.getElementById('btn-split');
  const btnSplit2 = document.getElementById('tl-split-btn');
  if(btnSplit1) btnSplit1.addEventListener('click', triggerSplit);
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
