export const handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        const payload = JSON.parse(event.body);
        const { token, audioBase64 } = payload;

        if (!token || !audioBase64) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing token or audio payload' }) };
        }

        // Convertir el base64 limpio (sin prefijos URI) de vuelta a un Buffer
        const audioBuffer = Buffer.from(audioBase64, 'base64');

        // Hacer el puente nativo y seguro con el servidor de Hugging Face
        const response = await fetch("https://api-inference.huggingface.co/models/openai/whisper-large-v3", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${token}`,
                "Content-Type": "audio/mp3"
            },
            body: audioBuffer
        });

        const resultText = await response.text();

        return {
            statusCode: response.status,
            body: resultText
        };

    } catch (e) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: e.message || "Internal Server Error" }) 
        };
    }
};
