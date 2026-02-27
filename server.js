require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@deepgram/sdk');
const { OpenAI } = require('openai');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const upload = multer({ storage: multer.memoryStorage() });

let deepgram;
if (process.env.DEEPGRAM_API_KEY) {
    deepgram = createClient(process.env.DEEPGRAM_API_KEY);
}

let openai;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

app.post('/api/analyze-speech', upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file uploaded' });
        }

        if (!deepgram || !openai) {
            return res.status(500).json({ error: 'API keys are missing in .env configuration.' });
        }

        // 1. Transcribe with Deepgram
        const { result, error: dgError } = await deepgram.listen.prerecorded.transcribeFile(
            req.file.buffer,
            {
                model: 'nova-3',
                language: 'en-IN',
                smart_format: true
            }
        );

        if (dgError) {
            console.error('Deepgram Error:', dgError);
            return res.status(500).json({ error: 'Transcription failed' });
        }

        const transcript = result?.results?.channels[0]?.alternatives[0]?.transcript;

        if (!transcript || transcript.trim().length === 0) {
            return res.status(200).json({
                transcript: '',
                feedback: 'No speech detected.',
                corrections: []
            });
        }

        // 2. Analyze with OpenAI
        const topic = req.body.topic;
        const topicInstruction = topic && topic.trim() !== ''
            ? `\nThe user selected the following topic: "${topic}". Please analyze if the speech is relevant to this topic. Provide an encouraging note about their choice of topic and how well they stuck to it or if they drifted, but DO NOT penalize them for drifting. Still analyze their grammar regardless.`
            : ``;

        const prompt = `You are a friendly English language tutor. 
The following transcript was spoken by a user with an Indian English accent.${topicInstruction}
Analyze the following speech transcript for genuine spoken English mistakes such as incorrect grammar, wrong word choices, and awkward sentence structures.
Account for common conversational Indian English idioms if they are broadly accepted, but do correct clear grammatical errors or poor phrasing.

CRITICAL INSTRUCTION: Your job is ONLY to correct SPOKEN errors. 
- Isolate the EXACT word or short phrase that is incorrect. Do NOT return the entire surrounding sentence or clause as the "original". For example, Today II woke up 1 at 6 AM and then I ate breakfast. After that, I went to office 2 and get my work 3. In the afternoon, I had my lunch and then go to my routine work 4. In the evening at 5 PM, my work is completed 5, my office was closed. And then I went to my room and do my daily routine 6.
1 I I woke up
 I woke up

2 went to office
 went to the office

3 get my work
 did my work

4 go to my routine work
 went to my routine work

5 my work is completed
 my work was completed

6 do my daily routine
 did my daily routine
- Do NOT correct capitalization (e.g., changing "computer science" to "Computer Science").
- Do NOT correct punctuation or acronym formatting (e.g., changing "b tech" to "B.Tech").
- If the ONLY difference between the original phrase and your correction is capitalization or punctuation, DO NOT include it in the corrections! Focus only on how the English sounds out loud.
Provide your feedback in JSON format with the following keys:
- "corrected_transcript": The entire text corrected for grammar and flow.
- "is_relevant_to_topic": A boolean indicating if it was relevant (true if no topic was provided or if it's somewhat relevant).
- "topic_feedback": A brief string giving them nice feedback about their ideas based on their topic (e.g. "Great job talking about your vacation!"). If no topic was given, leave it empty.
- "corrections": An array of objects, each containing:
  - "original": ONLY the exact isolated mistaken words.
  - "correction": The precise correction for those exact isolated words.
  - "explanation": Why it was corrected in simple terms.
  
Transcript: "${transcript}"`;

        const response = await openai.chat.completions.create({
            model: "gpt-5-mini",
            messages: [{ role: "system", content: prompt }],
            response_format: { type: "json_object" }
        });

        const analysis = JSON.parse(response.choices[0].message.content);

        res.json({
            transcript,
            corrected_transcript: analysis.corrected_transcript,
            corrections: analysis.corrections,
            topic_feedback: analysis.topic_feedback,
            is_relevant_to_topic: analysis.is_relevant_to_topic
        });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'An error occurred during processing.' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port http://localhost:${port}`);
});
