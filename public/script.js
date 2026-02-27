let mediaRecorder;
let audioChunks = [];
let isRecording = false;
let timerInterval;
let secondsRemaining = 0;

const recordBtn = document.getElementById('recordBtn');
const durationSelect = document.getElementById('duration');
const timeDisplay = document.getElementById('timeDisplay');
const statusIndicator = document.getElementById('statusIndicator');
const loadingSection = document.getElementById('loading');
const resultsSection = document.getElementById('results');

async function setupAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                audioChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = processAudio;
    } catch (err) {
        console.error("Error accessing microphone:", err);
        alert("Please allow microphone access to use this app.");
    }
}

function updateTimeDisplay() {
    const mins = Math.floor(secondsRemaining / 60).toString().padStart(2, '0');
    const secs = (secondsRemaining % 60).toString().padStart(2, '0');
    timeDisplay.textContent = `${mins}:${secs}`;
}

function startRecording() {
    if (!mediaRecorder) {
        alert("Microphone not initialized.");
        return;
    }

    audioChunks = [];
    mediaRecorder.start();
    isRecording = true;

    recordBtn.textContent = '⏹ Stop Recording';
    recordBtn.classList.remove('primary-btn');
    recordBtn.classList.add('danger-btn');
    statusIndicator.classList.add('recording');
    resultsSection.classList.add('hidden');

    secondsRemaining = parseInt(durationSelect.value) * 60;
    updateTimeDisplay();

    timerInterval = setInterval(() => {
        secondsRemaining--;
        updateTimeDisplay();

        if (secondsRemaining <= 0) {
            stopRecording();
        }
    }, 1000);
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
        isRecording = false;

        clearInterval(timerInterval);

        recordBtn.textContent = '🎤 Start Recording';
        recordBtn.classList.remove('danger-btn');
        recordBtn.classList.add('primary-btn');
        statusIndicator.classList.remove('recording');

        loadingSection.classList.remove('hidden');
    }
}

async function processAudio() {
    const audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
    const formData = new FormData();
    formData.append('audio', audioBlob, 'speech.webm');
    formData.append('topic', document.getElementById('topic').value);

    try {
        const response = await fetch('/api/analyze-speech', {
            method: 'POST',
            body: formData
        });

        const data = await response.json();

        if (response.ok) {
            displayResults(data);
        } else {
            alert(data.error || "An error occurred");
        }
    } catch (err) {
        console.error(err);
        alert("Failed to connect to server.");
    } finally {
        loadingSection.classList.add('hidden');
    }
}

function displayResults(data) {
    resultsSection.classList.remove('hidden');

    let highlightedTranscript = data.transcript || "No speech detected.";
    const correctionsList = document.getElementById('correctionsList');
    correctionsList.innerHTML = '';

    // Topic feedback rendering
    const topicFeedbackDiv = document.getElementById('topicFeedback');
    if (data.topic_feedback) {
        topicFeedbackDiv.textContent = data.topic_feedback;
        topicFeedbackDiv.classList.remove('hidden');

        // Change color based on relevance
        if (data.is_relevant_to_topic === false) {
            topicFeedbackDiv.style.borderLeftColor = 'var(--danger-color)';
            topicFeedbackDiv.style.backgroundColor = 'rgba(239, 68, 68, 0.1)';
        } else {
            topicFeedbackDiv.style.borderLeftColor = '#86efac';
            topicFeedbackDiv.style.backgroundColor = 'rgba(134, 239, 172, 0.1)';
        }
    } else {
        topicFeedbackDiv.classList.add('hidden');
    }

    if (data.corrections && data.corrections.length > 0) {
        data.corrections.forEach((c, index) => {
            // Wrap the mistake in a custom styling span
            const mistakeNumber = index + 1;
            const replacementHTML = `<span class="highlighted-mistake">${c.original}<sup class="mistake-index">${mistakeNumber}</sup></span>`;

            // Try to replace the first occurrence of the exact original string
            highlightedTranscript = highlightedTranscript.replace(c.original, replacementHTML);

            const div = document.createElement('div');
            div.className = 'correction-item';
            div.innerHTML = `
                <div><span class="mistake-index-label">${mistakeNumber}.</span> Instead of: <span class="mistake">"${c.original}"</span></div>
                <div>Say: <span class="fix">"${c.correction}"</span></div>
                <div class="explanation">${c.explanation}</div>
            `;
            correctionsList.appendChild(div);
        });
    } else if (data.transcript) {
        correctionsList.innerHTML = '<p style="color: #86efac;">Great job! No major grammatical errors detected.</p>';
    }

    document.getElementById('originalText').innerHTML = highlightedTranscript;
    document.getElementById('correctedText').textContent = data.corrected_transcript || "";
}

recordBtn.addEventListener('click', () => {
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
});

setupAudio();
