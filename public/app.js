let currentUser = null;
let currentRole = null;
let currentRoom = null;
let appState = {
    teams: {},
    correctAnswers: {},
    submissions: {},
    config: { teacherCount: 1 },
    penalties: {}
};

// Инициализация при загрузке
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

function initApp() {
    db.ref().on("value", (snapshot) => {
        const data = snapshot.val() || {};
        appState.teams = data.teams || generateDefaultTeams();
        appState.correctAnswers = data.correctAnswers || {};
        appState.submissions = data.submissions || {};
        appState.config = data.config || { teacherCount: 1 };
        appState.penalties = data.penalties || {};

        if (currentRole === "teacher") {
            updateTeacherUI();
        } else if (currentRole === "room" || currentRole === "hall") {
            renderTables();
        } else if (currentRole === "volunteer") {
            updateVolunteerOptions();
        }
    });
}

function showScreen(screenId) {
    document.querySelectorAll(".screen").forEach(s => s.style.display = "none");
    document.getElementById("winners-screen").style.display = "none";
    const target = document.getElementById(screenId);
    if (target) target.style.display = "block";
}

// Авторизация
function tryLogin() {
    const login = document.getElementById("login-field").value.trim().toLowerCase();
    const pass = document.getElementById("pass-field").value.trim();

    if (login === "admin" && pass === "admin123") {
        currentRole = "admin";
        showScreen("admin-screen");
    } else if (login.startsWith("vol") && pass === "vol123") {
        currentRole = "volunteer";
        currentUser = login;
        showScreen("volunteer-screen");
        updateVolunteerOptions();
    } else if (login.startsWith("teacher") && pass === "teacher123") {
        currentRole = "teacher";
        currentUser = login;
        showScreen("teacher-screen");
        updateTeacherUI();
    } else if (login.startsWith("room") && pass === "room123") {
        currentRole = "room";
        currentRoom = login.replace("room", "");
        document.getElementById("room-title").innerText = `ТАБЛО — КАБИНЕТ ${currentRoom}`;
        showScreen("room-screen");
        renderTables();
    } else if (login === "hall" && pass === "hall123") {
        currentRole = "hall";
        document.getElementById("room-title").innerText = "ОБЩЕЕ ТАБЛО ОЛИМПИАДЫ";
        showScreen("room-screen");
        renderTables();
    } else {
        alert("Неверный логин или пароль!");
    }
}

// Дефолтные команды (4 кабинета, по 8 команд)
function generateDefaultTeams() {
    const teams = {};
    for (let r = 1; r <= 4; r++) {
        for (let t = 1; t <= 8; t++) {
            const teamId = `${r}.${t}`;
            teams[teamId] = { room: r, name: `Команда ${teamId}` };
        }
    }
    return teams;
}

// Опции для волонтёра
function updateVolunteerOptions() {
    const teamSelect = document.getElementById("vol-select-team");
    const taskSelect = document.getElementById("vol-select-task");
    
    if (teamSelect.options.length === 0) {
        Object.keys(appState.teams).forEach(id => {
            const opt = document.createElement("option");
            opt.value = id;
            opt.innerText = `Команда ${id}`;
            teamSelect.appendChild(opt);
        });
    }

    if (taskSelect.options.length === 0) {
        for (let i = 1; i <= 16; i++) {
            const opt = document.createElement("option");
            opt.value = i;
            opt.innerText = `Задача ${i}`;
            taskSelect.appendChild(opt);
        }
    }
}

// Отправка ответа волонтёром
function sendSubmission() {
    const team = document.getElementById("vol-select-team").value;
    const task = document.getElementById("vol-select-task").value;
    const ans = document.getElementById("vol-ans").value.trim();

    if (!ans) return alert("Введите ответ!");

    const subKey = `${team}_${task}`;
    db.ref(`submissions/${subKey}`).set({
        team: team,
        task: task,
        answer: ans,
        status: "pending",
        timestamp: Date.now()
    }).then(() => {
        document.getElementById("vol-ans").value = "";
        alert("Ответ отправлен жюри!");
    });
}

// Интерфейс жюри
function updateTeacherUI() {
    const teamSelect = document.getElementById("select-team");
    const taskSelect = document.getElementById("select-task");

    if (teamSelect.options.length === 0) {
        Object.keys(appState.teams).forEach(id => {
            const opt = document.createElement("option");
            opt.value = id;
            opt.innerText = `Команда ${id}`;
            teamSelect.appendChild(opt);
        });
    }

    if (taskSelect.options.length === 0) {
        for (let i = 1; i <= 16; i++) {
            const opt = document.createElement("option");
            opt.value = i;
            opt.innerText = `Задача ${i}`;
            taskSelect.appendChild(opt);
        }
    }

    renderQueue();
    refreshStatusBanner();
}

// Очередь ответов
function renderQueue() {
    const container = document.getElementById("answers-queue");
    container.innerHTML = "";

    const list = Object.values(appState.submissions).sort((a, b) => b.timestamp - a.timestamp);

    list.forEach(sub => {
        const item = document.createElement("div");
        item.className = `notif-card ${sub.status !== 'pending' ? 'checked' : ''}`;
        item.innerHTML = `
            <div>
                <strong>Команда ${sub.team}</strong> (Зад. ${sub.task})
                <br><small>Ответ: ${sub.answer}</small>
            </div>
            <span>${sub.status === 'ok' ? '✅' : sub.status === 'fail' ? '❌' : '⏳'}</span>
        `;
        item.onclick = () => selectSubmissionForCheck(sub);
        container.appendChild(item);
    });
}

function selectSubmissionForCheck(sub) {
    document.getElementById("select-team").value = sub.team;
    document.getElementById("select-task").value = sub.task;
    document.getElementById("view-ans").value = sub.answer;
    refreshStatusBanner();
    checkWithAI(sub.task, sub.answer);
}

function refreshStatusBanner() {
    const team = document.getElementById("select-team").value;
    const task = document.getElementById("select-task").value;
    const banner = document.getElementById("status-banner");
    
    const subKey = `${team}_${task}`;
    const sub = appState.submissions[subKey];

    if (sub && sub.status !== "pending") {
        banner.style.display = "block";
        if (sub.status === "ok") {
            banner.style.background = "var(--green)";
            banner.innerText = "СТАТУС: ВЕРНО ✅";
        } else {
            banner.style.background = "var(--red)";
            banner.innerText = "СТАТУС: ОШИБКА ❌";
        }
    } else {
        banner.style.display = "none";
    }
}

// Вердикт жюри
function setResult(status) {
    const team = document.getElementById("select-team").value;
    const task = document.getElementById("select-task").value;
    const ans = document.getElementById("view-ans").value;

    const subKey = `${team}_${task}`;
    db.ref(`submissions/${subKey}`).set({
        team: team,
        task: task,
        answer: ans || "—",
        status: status,
        timestamp: Date.now()
    });
}

// Интеграция с Gemini API
async function checkWithAI(taskNum, userAns) {
    const box = document.getElementById("ai-suggestion-box");
    const verdictEl = document.getElementById("ai-verdict-text");
    const reasonEl = document.getElementById("ai-reason-text");

    box.style.display = "block";
    verdictEl.innerText = "Анализируем ответ с Gemini AI...";
    reasonEl.innerText = "";

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Ты помощник жюри на математической олимпиаде. Задача №${taskNum}. Ответ команды: "${userAns}". Дай краткую оценку: верный ли формат ответа и похож ли он на математический результат. Отвечай кратко в 2 предложения.`
                    }]
                }]
            })
        });

        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        
        verdictEl.innerText = "Анализ завершён";
        reasonEl.innerText = text;
    } catch (e) {
        verdictEl.innerText = "Ошибка ИИ";
        reasonEl.innerText = "Не удалось связаться с сервисом проверки.";
    }
}

// Отрисовка таблиц (Табло)
function renderTables() {
    const container = document.getElementById("tables-container");
    container.innerHTML = "";

    const roomsToRender = currentRole === "room" ? [parseInt(currentRoom)] : [1, 2, 3, 4];

    roomsToRender.forEach(r => {
        const holder = document.createElement("div");
        holder.className = "table-holder";

        let html = `<h3>Кабинет ${r}</h3><table><thead><tr><th>Команда</th>`;
        for (let i = 1; i <= 16; i++) html += `<th>З${i}</th>`;
        html += `<th>Штраф</th><th>Итого</th></tr></thead><tbody>`;

        Object.keys(appState.teams).filter(t => appState.teams[t].room === r).forEach(tId => {
            html += `<tr><td><strong>${tId}</strong></td>`;
            let score = 0;

            for (let task = 1; task <= 16; task++) {
                const subKey = `${tId}_${task}`;
                const sub = appState.submissions[subKey];
                
                if (sub && sub.status === "ok") {
                    html += `<td class="bg-ok">10</td>`;
                    score += 10;
                } else if (sub && sub.status === "fail") {
                    html += `<td class="bg-fail">0</td>`;
                } else {
                    html += `<td>-</td>`;
                }
            }

            const penalty = appState.penalties[tId] || 0;
            const total = score - penalty;

            html += `<td>${penalty}</td><td><strong>${total}</strong></td></tr>`;
        });

        html += `</tbody></table>`;
        holder.innerHTML = html;
        container.appendChild(holder);
    });
}

// Админка
function saveAdminConfig() {
    const val = parseInt(document.getElementById("setup-teachers").value);
    db.ref("config/teacherCount").set(val).then(() => alert("Настройки сохранены!"));
}

function applyPenalty() {
    const team = document.getElementById("penalty-team").value.trim();
    const val = parseInt(document.getElementById("penalty-val").value) || 0;

    if (!team) return alert("Укажите команду!");

    db.ref(`penalties/${team}`).set(val).then(() => {
        alert(`Штраф ${val} для команды ${team} применён!`);
        document.getElementById("penalty-team").value = "";
        document.getElementById("penalty-val").value = "";
    });
}

function showWinners() {
    const screen = document.getElementById("winners-screen");
    const container = document.getElementById("winners-container");
    screen.style.display = "block";

    const scores = [];

    Object.keys(appState.teams).forEach(tId => {
        let total = 0;
        for (let task = 1; task <= 16; task++) {
            const sub = appState.submissions[`${tId}_${task}`];
            if (sub && sub.status === "ok") total += 10;
        }
        total -= (appState.penalties[tId] || 0);
        scores.push({ id: tId, score: total });
    });

    scores.sort((a, b) => b.score - a.score);

    let html = "<ol style='text-align: left; max-width: 400px; margin: 0 auto; font-size: 20px;'>";
    scores.slice(0, 5).forEach(s => {
        html += `<li style="margin-bottom: 10px;"><strong>Команда ${s.id}</strong>: ${s.score} баллов</li>`;
    });
    html += "</ol><button onclick='document.getElementById(\"winners-screen\").style.display=\"none\"' style='margin-top:30px;'>Закрыть</button>";

    container.innerHTML = html;
}

function fullReset() {
    if (confirm("Вы уверены? Это сбросит ВСЕ отправленные ответы и штрафы!")) {
        db.ref("submissions").remove();
        db.ref("penalties").remove().then(() => alert("База данных сброшена!"));
    }
}