import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { state } from './state.js';

let ffmpeg = null;

export async function initFFmpeg() {
  try {
    ffmpeg = new FFmpeg();
    
    ffmpeg.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });
    
    const baseURL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
    const coreURL = await toBlobURL(`${baseURL}/ffmpeg-core.js`, 'text/javascript');
    const wasmURL = await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, 'application/wasm');
    
    console.log("Iniciando motor WebAssembly...");
    await ffmpeg.load({ coreURL, wasmURL });
    console.log("✅ Motor FFmpeg listo para la acción.");
  } catch (error) {
    console.error("❌ FFmpeg Falló:", error);
  }
}

export function getFFmpegInstance() {
    return ffmpeg;
}

export async function exportVideo(btnElement) {
  if(!ffmpeg) return alert("FFmpeg no terminó de cargar.");
  
  const vClips = state.clips.filter(c => c.type === 'image');
  const aClips = state.clips.filter(c => c.type === 'audio');
  
  if (vClips.length === 0 && aClips.length === 0) return alert("¡Añade recursos gráficos o audios a la línea primero!");

  const oldHtml = btnElement.innerHTML;
  btnElement.innerHTML = `⏳ Preparando Archivos Reales...`;
  btnElement.style.pointerEvents = 'none';
  btnElement.style.opacity = '0.7';

  // 1. INGESTA A LA MEMORIA (Carga de tus archivos al explorador físico virtual)
  const uniqueResIds = new Set([...vClips, ...aClips].map(c => c.resourceId));
  const inputsMap = {}; 
  
  // Limpiamos la virtualización posible previa
  try { await ffmpeg.deleteFile('proyecto_finalizado.mp4'); } catch(e){}

  for (const id of uniqueResIds) {
     const res = state.resources.find(r => r.id === id);
     if (res && res.file) {
         // Escribimos tu PNG o MP3 en el espacio temporal simulando un path nativo de computadora
         await ffmpeg.writeFile(res.file.name, await fetchFile(res.file));
         inputsMap[res.id] = { fileName: res.file.name, type: res.type };
     }
  }

  // Dimensiones matemáticas como antes
  const pxPerSec = 7.8;
  const leftOffset = 72;
  
  const allClips = [...vClips, ...aClips];
  const maxEndPx = Math.max(...allClips.map(c => c.start + c.width));
  let maxEndSecs = Math.max(1, (maxEndPx - leftOffset) / pxPerSec); 
  if (maxEndSecs > 120) maxEndSecs = 120; // Límite por sanidad mental browser
  
  btnElement.innerHTML = `⏳ Compilando FFmpeg...`;

  const args = [];
  
  // Input [0] -> Canvas Fondo Negro 
  args.push('-f', 'lavfi', '-i', `color=c=black:s=854x480:d=${maxEndSecs.toFixed(2)}`);
  
  // Asignar variables de Entrada
  const resourceToInputIdxMap = {};
  let inputCount = 1; // Ya que [0] es black
  
  for (const resId of uniqueResIds) {
      const p = inputsMap[resId];
      if (p.type === 'image') {
          // El secreto para hacer de un PNG un clip escalable: Forzar bucle y frame rate 30.
          args.push('-loop', '1', '-framerate', '30', '-i', p.fileName);
      } else {
          args.push('-i', p.fileName);
      }
      resourceToInputIdxMap[resId] = inputCount++;
  }

  let filterParts = [];
  let currentBaseVideo = '0:v';
  
  // A) CONSTRUIR PIPELINE DE IMAGENES ("Video")
  vClips.sort((a,b) => a.start - b.start).forEach((clip, i) => {
    let durSecs = (clip.width / pxPerSec);
    let startSecs = Math.max(0, (clip.start - leftOffset) / pxPerSec);
    
    if (startSecs > maxEndSecs) return; 
    if (startSecs + durSecs > maxEndSecs) durSecs = maxEndSecs - startSecs;

    const inputIdx = resourceToInputIdxMap[clip.resourceId]; 
    const delayID = `delayV${i}`;
    const outBaseID = `mergedV${i}`;
    
    // Escala -> Recorta a Segundos de duración -> Retrasa (Push Forward) -> Salida
    filterParts.push(`[${inputIdx}:v]scale=854:480,trim=duration=${durSecs.toFixed(3)},setpts=PTS-STARTPTS+${startSecs.toFixed(3)}/TB[${delayID}]`);
    // Pegarlo en el mainboard
    filterParts.push(`[${currentBaseVideo}][${delayID}]overlay=x=0:y=0:eof_action=pass[${outBaseID}]`);
    
    currentBaseVideo = outBaseID;
  });

  // B) CONSTRUIR PIPELINE DE AUDIO (Mezcla de todos)
  let aDelayFilters = [];
  let hasAudio = false;
  let finalAudio = '';
  
  if (aClips.length > 0) {
      hasAudio = true;
      aClips.sort((a,b) => a.start - b.start).forEach((clip, i) => {
          let durSecs = (clip.width / pxPerSec);
          let startSecs = Math.max(0, (clip.start - leftOffset) / pxPerSec);
          if (startSecs > maxEndSecs) return; 
          
          const inputIdx = resourceToInputIdxMap[clip.resourceId]; 
          const adelayMs = Math.round(startSecs * 1000);
          
          filterParts.push(`[${inputIdx}:a]atrim=duration=${durSecs.toFixed(3)},adelay=${adelayMs}|${adelayMs}[aud${i}]`);
          aDelayFilters.push(`[aud${i}]`);
      });
      finalAudio = `audioMixOut`;
      filterParts.push(`${aDelayFilters.join('')}amix=inputs=${aClips.length}:duration=first[${finalAudio}]`);
  }

  if (filterParts.length > 0) {
      args.push('-filter_complex', filterParts.join(';'));
  }
  
  args.push('-map', `[${currentBaseVideo}]`);
  if (hasAudio) {
      args.push('-map', `[${finalAudio}]`);
  }
  
  // Ultrafast para evitar que el navegador vuele
  args.push('-c:v', 'libx264', '-preset', 'ultrafast');
  if (hasAudio) args.push('-c:a', 'aac');
  args.push('proyecto_finalizado.mp4');

  console.log("Comando Ensamblado:", args.join(' '));

  try {
      await ffmpeg.exec(args);
      
      const data = await ffmpeg.readFile('proyecto_finalizado.mp4');
      const url = URL.createObjectURL(new Blob([data.buffer], { type: 'video/mp4' }));
      
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = 'video_con_archivos_reales.mp4';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      
      setTimeout(() => URL.revokeObjectURL(url), 5000);
  } catch(e) {
      console.error(e);
      alert("Hubo un error pesado intentando compilar los archivos. Revisa la consola.");
  }
  
  btnElement.innerHTML = oldHtml;
  btnElement.style.pointerEvents = 'all';
  btnElement.style.opacity = '1';
}
