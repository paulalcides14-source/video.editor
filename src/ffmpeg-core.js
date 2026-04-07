const { createFFmpeg, fetchFile } = FFmpeg;
import { state } from './state.js';

let ffmpeg = null;

function generateFFmpegExpression(keyframes, baseValue) {
    if (!keyframes || keyframes.length === 0) return baseValue.toString();
    
    const kfs = [...keyframes].sort((a, b) => a.time - b.time);
    let expression = "";
    
    for (let i = 0; i < kfs.length - 1; i++) {
        const k1 = kfs[i];
        const k2 = kfs[i + 1];
        
        let segment = "";
        if (Math.abs(k2.time - k1.time) < 0.001) {
           segment = `${k1.value}`;
        } else {
           segment = `${k1.value}+(${k2.value}-${k1.value})*(t-${k1.time})/(${k2.time}-${k1.time})`;
        }
        
        if (i === 0) {
            expression = `if(lt(t,${k1.time}),${k1.value},if(lt(t,${k2.time}),${segment}`;
        } else {
            expression += `,if(lt(t,${k2.time}),${segment}`;
        }
    }
    
    if (expression === "") return baseValue.toString();
    
    const lastValue = kfs[kfs.length - 1].value;
    const closingParenthesis = ")".repeat(kfs.length - 1);
    expression += `,${lastValue}${closingParenthesis}`;
    return expression;
}

export async function initFFmpeg() {
  try {
    ffmpeg = createFFmpeg({
      log: true,
      corePath: 'https://unpkg.com/@ffmpeg/core@0.11.0/dist/ffmpeg-core.js'
    });
    
    console.log("Iniciando motor WebAssembly...");
    await ffmpeg.load();
    console.log("✅ Motor FFmpeg listo para la acción.");
  } catch (error) {
    console.error("❌ FFmpeg Falló:", error);
  }
}

export function getFFmpegInstance() {
    return ffmpeg;
}

export async function extraerAudioParaIA(file) {
    try {
        // Asegúrate de que ffmpeg esté cargado antes de usarlo
        if (!ffmpeg.isLoaded()) await ffmpeg.load();

        // 1. Escribir el archivo en el sistema virtual de FFmpeg
        // Usamos fetchFile para convertir el archivo de JS a algo que FFmpeg entienda
        ffmpeg.FS('writeFile', 'input_file', await fetchFile(file));

        // 2. Ejecutar comando (Extraer audio ligero para que Hugging Face no lo rechace)
        // Usamos -ar 16000 (frecuencia que prefiere Whisper) y -ac 1 (mono para pesar menos)
        await ffmpeg.run(
            '-i', 'input_file',
            '-vn', 
            '-ar', '16000', 
            '-ac', '1', 
            '-b:a', '64k', 
            'output_audio.mp3'
        );

        // 3. Leer el archivo resultante
        const data = ffmpeg.FS('readFile', 'output_audio.mp3');
        
        // 4. Limpiar archivos para no saturar la memoria del navegador
        ffmpeg.FS('unlink', 'input_file');
        ffmpeg.FS('unlink', 'output_audio.mp3');

        return new Blob([data.buffer], { type: 'audio/mp3' });
    } catch (err) {
        console.error("Error detallado en FFmpeg:", err);
        return null;
    }
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

  // 1. INGESTA A LA MEMORIA (Carga de tus archivos)
  const uniqueResIds = new Set([...vClips, ...aClips].map(c => c.resourceId));
  const inputsMap = {}; 
  
  try { ffmpeg.FS('unlink', 'proyecto_finalizado.mp4'); } catch(e){}

  // Ingestar Fuente Montserrat para los subtítulos
  try { ffmpeg.FS('writeFile', 'montserrat.ttf', await fetchFile('./Montserrat-ExtraBold.ttf')); } catch(e) { console.warn("Fuente falló", e); }

  for (const id of uniqueResIds) {
     const res = state.resources.find(r => r.id === id);
     if (res && res.file) {
         // Escribimos tu PNG o MP3 en el espacio temporal simulando un path nativo de computadora
         ffmpeg.FS('writeFile', res.file.name, await fetchFile(res.file));
         inputsMap[res.id] = { fileName: res.file.name, type: res.type };
     }
  }

  // Dimensiones matemáticas
  const pxPerSec = 50; // Sincronizado globalmente (antes 7.8)
  const leftOffset = 0; // Desfasaje inicial corregido a 0 matemático
  
  const allClips = [...vClips, ...aClips];
  const maxEndPx = Math.max(...allClips.map(c => c.start + c.width));
  let maxEndSecs = Math.max(1, (maxEndPx - leftOffset) / pxPerSec); 
  if (maxEndSecs > 120) maxEndSecs = 120; // Límite por sanidad mental browser
  
  btnElement.innerHTML = `⏳ Compilando FFmpeg...`;

  const args = [];
  
  let renderW = 854; let renderH = 480;
  if (state.aspectRatio === '9:16') { renderW = 480; renderH = 854; }
  else if (state.aspectRatio === '1:1') { renderW = 640; renderH = 640; }
  
  // Input [0] -> Canvas Fondo Negro 
  args.push('-f', 'lavfi', '-i', `color=c=black:s=${renderW}x${renderH}:d=${maxEndSecs.toFixed(2)}`);
  
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
    
    const scaleExpr = generateFFmpegExpression(clip.keyframes?.scale, clip.properties.scale);
    const opacityExpr = generateFFmpegExpression(clip.keyframes?.opacity, clip.properties.opacity);
    const xExpr = generateFFmpegExpression(clip.keyframes?.posX, clip.properties.posX);
    const yExpr = generateFFmpegExpression(clip.keyframes?.posY, clip.properties.posY);
    const rotExpr = generateFFmpegExpression(clip.keyframes?.rotation, clip.properties.rotation);
    
    let clipFilter = `[${inputIdx}:v]format=rgba,`;
    clipFilter += `rotate=a='(${rotExpr})*PI/180':ow='rotw(a)':oh='roth(a)':c=none,`;
    clipFilter += `scale=w='iw*(${scaleExpr})':h='ih*(${scaleExpr})':eval=frame,`;
    
    const hasOpacityKf = clip.keyframes && clip.keyframes.opacity && clip.keyframes.opacity.length > 0;
    if (hasOpacityKf) {
        clipFilter += `geq=r='p(X,Y)':g='p(X,Y)':b='p(X,Y)':a='p(X,Y)*(${opacityExpr})',`;
    } else if (clip.properties.opacity < 1.0) {
        clipFilter += `colorchannelmixer=aa=${clip.properties.opacity},`;
    }
    
    clipFilter += `trim=duration=${durSecs.toFixed(3)},setpts=PTS-STARTPTS+${startSecs.toFixed(3)}/TB[${delayID}]`;
    
    filterParts.push(clipFilter);
    filterParts.push(`[${currentBaseVideo}][${delayID}]overlay=x='(W-w)/2+(${xExpr})':y='(H-h)/2+(${yExpr})':eof_action=pass[${outBaseID}]`);
    
    currentBaseVideo = outBaseID;
  });

  // A.2) CONSTRUIR PIPELINE DE TEXTOS (Subtítulos IA)
  const tClips = state.clips.filter(c => c.type === 'text');
  for (let i = 0; i < tClips.length; i++) {
     const clip = tClips[i];
     let durSecs = (clip.width / pxPerSec);
     let startSecs = Math.max(0, (clip.start - leftOffset) / pxPerSec);
     if (startSecs > maxEndSecs) continue; 
     if (startSecs + durSecs > maxEndSecs) durSecs = maxEndSecs - startSecs;
     
     const outBaseID = `mergedT${i}`;
     
     // Archivo temporal de texto para escapar caracteres extraños sin romper ffmpeg cmd
     const txtName = `txt_${i}.txt`;
     ffmpeg.FS('writeFile', txtName, new TextEncoder().encode(clip.textStr || clip.label));
     
     const fontSize = (clip.properties.fontSize || 16) * 3; 
     const yPos = `(h/2) + ${clip.properties.posY ?? 200}`;
     
     // Borde grueso TikTok-style simulado usando borderw=3
     const drawtextFilter = `drawtext=fontfile='montserrat.ttf':textfile='${txtName}':fontcolor=white:fontsize=${fontSize}:x=(w-text_w)/2:y=${yPos}:borderw=4:bordercolor=black:shadowcolor=black@0.8:shadowx=2:shadowy=2:enable='between(t,${startSecs.toFixed(3)},${(startSecs+durSecs).toFixed(3)})'`;
     
     filterParts.push(`[${currentBaseVideo}]${drawtextFilter}[${outBaseID}]`);
     currentBaseVideo = outBaseID;
  }

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
      await ffmpeg.run(...args);
      
      const data = ffmpeg.FS('readFile', 'proyecto_finalizado.mp4');
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
