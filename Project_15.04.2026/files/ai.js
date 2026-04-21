const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('ai-send');
const clearBtn = document.getElementById('ai-clear');
const chatMessages = document.getElementById('chatMessages');

// 1. Загрузка истории из LocalStorage при запуске
let history = JSON.parse(localStorage.getItem('chat_history')) || [];
renderHistory();

// Функция для отрисовки сообщений
function renderHistory() {
    chatMessages.innerHTML = '';
    history.forEach(msg => {
        const msgDiv = document.createElement('div');
        msgDiv.style.padding = '8px 12px';
        msgDiv.style.borderRadius = '8px';
        msgDiv.style.maxWidth = '80%';
        
        if (msg.role === 'user') {
            msgDiv.style.alignSelf = 'flex-end';
            msgDiv.style.backgroundColor = '#007bff';
            msgDiv.style.color = 'white';
        } else {
            msgDiv.style.alignSelf = 'flex-start';
            msgDiv.style.backgroundColor = '#f1f1f1';
            msgDiv.style.color = '#333';
        }
        msgDiv.innerText = msg.text;
        chatMessages.appendChild(msgDiv);
    });
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// 2. Отправка сообщения
async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text) return;

    // Добавляем сообщение пользователя в историю
    history.push({ role: 'user', text: text });
    chatInput.value = '';
    renderHistory();
    saveHistory();

    try {
        // Запрос к твоему FastAPI бэкенду
        const response = await fetch(`http://127.0.0.1:8000/ask?question=${encodeURIComponent(text)}`);
        const data = await response.json();

        if (data.answer) {
            history.push({ role: 'ai', text: data.answer });
        } else {
            history.push({ role: 'ai', text: 'Қате орын алды (Ошибка API).' });
        }
    } catch (error) {
        history.push({ role: 'ai', text: 'Серверге қосылу мүмкін емес.' });
    }

    renderHistory();
    saveHistory();
}

// 3. Сохранение в LocalStorage
function saveHistory() {
    localStorage.setItem('chat_history', JSON.stringify(history));
}

// 4. Очистка истории
clearBtn.addEventListener('click', () => {
    history = [];
    localStorage.removeItem('chat_history');
    renderHistory();
});

// Слушатели событий
sendBtn.addEventListener('click', sendMessage);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});