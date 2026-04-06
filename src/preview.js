import { state } from './state.js';
import { updatePlayheadVisual } from './timeline.js';

export function initPreviewLoop() {
  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');
  const area = document.getElementById('previewArea');
  const frame = document.getElementById('videoFrame');

  if(!canvas || !area) return;

  function resizeCanvas() {
      const aw = area.clientWidth - 20;
      const ah = area.clientHeight - 20;
      const aspect = 16/9;
      let w = Math.min(aw, ah * aspect);
      let h = w / aspect;
      frame.style.width = Math.round(w) + 'px';
      frame.style.height = Math.round(h) + 'px';
      canvas.width = Math.round(w);
      canvas.height = Math.round(h);
  }

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);

  let lastTime = performance.now();

  function renderFrame(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    // Avanzar la aguja en Modo Play
    if (state.isPlaying) {
        state.playheadX += dt * 7.8; // 7.8px por segundo estricto
        
        // Auto-pause si llegó al final de la composición (último clip)
        const allClips = state.clips;
        if(allClips.length > 0) {
            const maxPx = Math.max(...allClips.map(c => c.start + c.width));
            if(state.playheadX >= maxPx) {
                state.playheadX = maxPx;
                state.isPlaying = false;
                
                // Reponer botón visual
                const playBtnT = document.getElementById('playBtnTransport');
                const playBtnB = document.getElementById('playBtn');
                if(playBtnT) playBtnT.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 2.5l7 4.5-7 4.5V2.5z" fill="white"/></svg>`;
                if(playBtnB) playBtnB.style.display = 'flex';
            }
        }
        updatePlayheadVisual();
    }

    const currentTime = state.playheadX;

    // Limpiar Canvas
    ctx.clearRect(0,0, canvas.width, canvas.height);
    const g = ctx.createLinearGradient(0,0,parseInt(canvas.width),parseInt(canvas.height));
    g.addColorStop(0,'#0d1b2e'); g.addColorStop(1,'#1a3a5a');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    const clipsAtTime = state.clips.filter(c => 
        currentTime >= c.start && currentTime < (c.start + c.width)
    );
    
    const orderPriority = { 'music':0, 'audio': 1, 'image': 2, 'text': 3 };
    clipsAtTime.sort((a,b) => orderPriority[a.type] - orderPriority[b.type]);

    let hasMedia = false;

    clipsAtTime.forEach(clip => {
      if (clip.type === 'image') {
         hasMedia = true;
         // Buscar el Blob/File referenciado
         const res = state.resources.find(r => r.id === clip.resourceId);
         if (res && res.imgElement && res.imgElement.complete) {
             // Pintar imagen física subida!
             // Para MVP, lo estiramos (fill) o cover. 
             // Cover requiere algo de matemática. Usaremos DrawImage para llenar el canvas.
             ctx.drawImage(res.imgElement, 0, 0, canvas.width, canvas.height);
         }
      }
      
      if (clip.type === 'audio') {
         hasMedia = true;
         ctx.fillStyle = "rgba(239, 68, 68, 0.4)"; // Rojo translúcido para visualizar que el audio se reproduce
         ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
         ctx.fillStyle = "white";
         ctx.font = `bold 14px Inter`;
         ctx.textAlign = "center";
         ctx.fillText(`Reproduciendo Audio: ${clip.label}`, canvas.width/2, canvas.height - 20);
      }
    });

    if (!hasMedia && clipsAtTime.length === 0) {
      ctx.fillStyle = 'rgba(58,123,213,0.15)';
      ctx.beginPath(); ctx.ellipse(canvas.width/2,canvas.height/2,canvas.width/2.5,canvas.height/3,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${Math.max(14, canvas.width/20)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('Vista previa', canvas.width/2, canvas.height/2.2);
    }

    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
}
