import { state, PX_PER_SEC } from './state.js';
import { updatePlayheadVisual } from './timeline.js';

export function getInterpolatedValue(keyframesArr, currentTime, baseValue) {
    if (!keyframesArr || keyframesArr.length === 0) return baseValue;
    
    let kfs = keyframesArr; 
    
    if (currentTime <= kfs[0].time) return kfs[0].value;
    if (currentTime >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;

    for (let i = 0; i < kfs.length - 1; i++) {
        const startK = kfs[i];
        const endK = kfs[i + 1];

        if (currentTime >= startK.time && currentTime <= endK.time) {
            const progress = (currentTime - startK.time) / (endK.time - startK.time);
            return startK.value + (endK.value - startK.value) * progress;
        }
    }
    return baseValue;
}

export function initPreviewLoop() {
  const canvas = document.getElementById('previewCanvas');
  const ctx = canvas.getContext('2d');
  const area = document.getElementById('previewArea');
  const frame = document.getElementById('videoFrame');

  if(!canvas || !area) return;

  function updateCanvasResolution() {
      if (state.aspectRatio === '16:9') { canvas.width = 854; canvas.height = 480; }
      else if (state.aspectRatio === '9:16') { canvas.width = 480; canvas.height = 854; }
      else if (state.aspectRatio === '1:1') { canvas.width = 640; canvas.height = 640; }
  }

  updateCanvasResolution();
  window.addEventListener('aspect-changed', updateCanvasResolution);

  let lastTime = performance.now();

  function renderFrame(now) {
    const dt = (now - lastTime) / 1000;
    lastTime = now;

    if (state.isPlaying) {
        state.currentTime += dt;
        
        const allClips = state.clips;
        if(allClips.length > 0) {
            const maxPx = Math.max(...allClips.map(c => c.start + c.width));
            const maxSecs = maxPx / PX_PER_SEC;
            if(state.currentTime >= maxSecs) {
                state.currentTime = maxSecs;
                state.isPlaying = false;
                
                // Detener todo audio activo
                state.resources.filter(r => r.type==='audio' && r.audioElement).forEach(r => r.audioElement.pause());
                
                const pt = document.getElementById('playBtnTransport');
                const pb = document.getElementById('playBtn');
                if(pt) pt.innerHTML = `<svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M4 2.5l7 4.5-7 4.5V2.5z" fill="white"/></svg>`;
                if(pb) pb.style.display = 'flex';
            }
        }
        updatePlayheadVisual();
    }

    const currentPx = state.currentTime * PX_PER_SEC;

    // Limpiar fondo
    ctx.clearRect(0,0, canvas.width, canvas.height);
    const g = ctx.createLinearGradient(0,0,canvas.width,canvas.height);
    g.addColorStop(0,'#0d1b2e'); g.addColorStop(1,'#1a3a5a');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    const clipsAtTime = state.clips.filter(c => 
        currentPx >= c.start && currentPx < (c.start + c.width)
    );
    
    // GESTIÓN ACTIVA DE AUDIOS (APAGAR LOS FUERA DE RANGO)
    const activeAudioIds = new Set(clipsAtTime.filter(c=>c.type==='audio').map(c=>c.id));
    state.clips.filter(c=>c.type==='audio').forEach(clip => {
         const res = state.resources.find(r=>r.id===clip.resourceId);
         if(res && res.audioElement) {
             if (!activeAudioIds.has(clip.id) || !state.isPlaying) {
                 res.audioElement.pause();
             }
         }
    });

    const orderPriority = { 'music':0, 'audio': 1, 'image': 2, 'text': 3 };
    clipsAtTime.sort((a,b) => orderPriority[a.type] - orderPriority[b.type]);

    let hasMedia = false;



    clipsAtTime.forEach(clip => {
      const res = state.resources.find(r => r.id === clip.resourceId);
      const clipLocalTimeSecs = (currentPx - clip.start) / PX_PER_SEC;
      
      if (clip.type === 'image') {
         hasMedia = true;
         if (res && res.imgElement && res.imgElement.complete) {
             ctx.save();
             if (clip.properties) {
                 const tOpac = getInterpolatedValue(clip.keyframes?.opacity, clipLocalTimeSecs, clip.properties.opacity);
                 const tScale = getInterpolatedValue(clip.keyframes?.scale, clipLocalTimeSecs, clip.properties.scale);
                 const tRot = getInterpolatedValue(clip.keyframes?.rotation, clipLocalTimeSecs, clip.properties.rotation);
                 const tPosX = getInterpolatedValue(clip.keyframes?.posX, clipLocalTimeSecs, clip.properties.posX);
                 const tPosY = getInterpolatedValue(clip.keyframes?.posY, clipLocalTimeSecs, clip.properties.posY);

                 ctx.globalAlpha = tOpac;
                 ctx.translate(canvas.width/2 + tPosX, canvas.height/2 + tPosY);
                 ctx.rotate(tRot * Math.PI / 180);
                 ctx.scale(tScale, tScale);
                 ctx.drawImage(res.imgElement, -canvas.width/2, -canvas.height/2, canvas.width, canvas.height);
             } else {
                 ctx.drawImage(res.imgElement, 0, 0, canvas.width, canvas.height);
             }
             ctx.restore();
         }
      }
      
      if (clip.type === 'audio') {
         hasMedia = true;
         ctx.fillStyle = "rgba(239, 68, 68, 0.5)"; 
         ctx.fillRect(0, canvas.height - 40, canvas.width, 40);
         ctx.fillStyle = "white";
         ctx.font = `bold 14px Inter`;
         ctx.textAlign = "center";
         ctx.fillText(`♪ Escuchando: ${res?.label?.substring(0,20) || 'Audio'}`, canvas.width/2, canvas.height - 15);
         
         // MOTOR DE SINCRONIZACIÓN DE AUDIO SUGERIDO POR EL USUARIO
         if(res && res.audioElement && state.isPlaying) {
             res.audioElement.volume = (clip.properties.opacity ?? 1.0) * (state.globalVolume ?? 0.8);
             const clipLocalTimeSecs = (currentPx - clip.start) / PX_PER_SEC;
             
             // Corrección ruda si el desface supera 150ms 
             if (Math.abs(res.audioElement.currentTime - clipLocalTimeSecs) > 0.15) {
                 res.audioElement.currentTime = Math.max(0, clipLocalTimeSecs);
             }
             
             if (res.audioElement.paused) {
                 res.audioElement.play().catch(e => console.warn("Auto-play de audio bloqueado", e));
             }
         }
      }

      if (clip.type === 'text') {
         hasMedia = true;
         ctx.save();
         const tOpac = getInterpolatedValue(clip.keyframes?.opacity, clipLocalTimeSecs, clip.properties.opacity ?? 1.0);
         const tScale = getInterpolatedValue(clip.keyframes?.scale, clipLocalTimeSecs, clip.properties.scale ?? 1.0);
         const tRot = getInterpolatedValue(clip.keyframes?.rotation, clipLocalTimeSecs, clip.properties.rotation ?? 0);
         const tPosX = getInterpolatedValue(clip.keyframes?.posX, clipLocalTimeSecs, clip.properties.posX ?? 0);
         const tPosY = getInterpolatedValue(clip.keyframes?.posY, clipLocalTimeSecs, clip.properties.posY ?? 200);

         ctx.globalAlpha = tOpac;
         ctx.translate(canvas.width/2 + tPosX, canvas.height/2 + tPosY);
         ctx.rotate(tRot * Math.PI / 180);
         ctx.scale(tScale, tScale);
         
         // Setup Montserrat Font 
         const fontSize = (clip.properties.fontSize ?? 16) * 3; // Upscale logic
         ctx.font = `900 ${fontSize}px "Montserrat", sans-serif`;
         ctx.fillStyle = clip.properties.color || '#ffffff';
         ctx.textAlign = 'center';
         ctx.textBaseline = 'middle';
         
         // TikTok aesthetic stroke & shadow
         ctx.shadowColor = 'rgba(0,0,0,0.8)';
         ctx.shadowBlur = 4;
         ctx.shadowOffsetX = 2;
         ctx.shadowOffsetY = 2;
         
         ctx.lineWidth = clip.properties.strokeWidth || 6;
         ctx.strokeStyle = clip.properties.stroke || '#000000';
         
         // Extraemos el texto asignado por HF
         const txt = clip.textStr || clip.label;
         ctx.strokeText(txt, 0, 0);
         ctx.fillText(txt, 0, 0);

         ctx.restore();
      }
    });

    if (!hasMedia && clipsAtTime.length === 0) {
      ctx.fillStyle = 'rgba(58,123,213,0.15)';
      ctx.beginPath(); ctx.ellipse(canvas.width/2,canvas.height/2,canvas.width/2.5,canvas.height/3,0,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = `bold ${Math.max(14, canvas.width/20)}px sans-serif`; ctx.textAlign = 'center';
      ctx.fillText('Media Canvas', canvas.width/2, canvas.height/2.2);
    }

    requestAnimationFrame(renderFrame);
  }

  requestAnimationFrame(renderFrame);
}
