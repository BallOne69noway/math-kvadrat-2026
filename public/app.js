// ==========================================
// 1. КОНСТАНТЫ И ИНИЦИАЛИЗАЦИЯ ДАННЫХ
// ==========================================
const ROOMS = {
    1: {cl: 4, teams: ["4.1", "4.2", "4.3"]}, 2: {cl: 4, teams: ["4.4", "4.10"]}, 3: {cl: 4, teams: ["4.5", "4.11"]},
    4: {cl: 4, teams: ["4.6", "4.7"]}, 5: {cl: 4, teams: ["4.9", "4.8"]}, 6: {cl: 5, teams: ["5.1", "5.2"]},
    7: {cl: 5, teams: ["5.3", "5.9"]}, 8: {cl: 5, teams: ["5.4", "5.10"]}, 9: {cl: 5, teams: ["5.5", "5.6"]},
    10: {cl: 5, teams: ["5.7", "5.8"]}, 11: {cl: 5, teams: ["5.11", "5.12"]}, 12: {cl: 5, teams: ["5.13", "5.14"]},
    13: {cl: 6, teams: ["6.1", "6.3", "6.2"]}, 14: {cl: 6, teams: ["6.4", "6.5"]}, 15: {cl: 6, teams: ["6.6", "6.7"]},
    16: {cl: 6, teams: ["6.8", "6.9"]}, 17: {cl: 6, teams: ["6.10", "6.11"]}, 18: {cl: 6, teams: ["6.12", "6.13"]},
    19: {cl: 6, teams: ["6.14", "6.15"]}, 20: {cl: 7, teams: ["7.1", "7.2", "7.3"]}, 21: {cl: 7, teams: ["7.4", "7.5", "7.12"]},
    22: {cl: 7, teams: ["7.6", "7.7"]}, 23: {cl: 7, teams: ["7.8", "7.9"]}, 24: {cl: 7, teams: ["7.10", "7.11"]},
    25: {cl: 8, teams: ["8.1", "8.2"]}, 26: {cl: 8, teams: ["8.4", "8.7"]}, 27: {cl: 8, teams: ["8.5", "8.6"]}
};

let MASTER_LIST = [];
Object.values(ROOMS).forEach(r => r.teams.forEach(t => { if(!MASTER_LIST.includes(t)) MASTER_LIST.push(t); }));
MASTER_LIST.sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));

let appConfig = { teachersCount: 1 };
let scores = {}, penalties = {}, currentUserNum = null, lastSubs = {}, aiChecks = {};

// ==========================================
// 2. СЛУШАТЕЛИ FIREBASE (REALTIME DATABASE)
// ==========================================
db.ref('config').on('value', s => { if(s.val()) appConfig = s.val(); });

db.ref('scores').on('value', s => { 
    scores = s.val() || {}; 
    refreshStatusBanner(); 
    if(currentUserNum && document.getElementById('teacher-screen').style.display === 'block') updateQueue(); 
});

db.ref('penalties').on('value', s => { penalties = s.val() || {}; });

db.ref('ai_checks').on('value', s => { 
    aiChecks = s.val() || {}; 
    refreshStatusBanner(); 
});

// ==========================================
// 3. АВТОРИЗАЦИЯ И НАВИГАЦИЯ ПО ЭКРАНАМ
// ==========================================
function tryLogin() {
    const l = document.getElementById('login-field').value.trim().toLowerCase();
    const p = document.getElementById('pass-field').value.trim();
    const show = (id) => { 
        document.querySelectorAll('.screen').forEach(s => s.style.display = 'none'); 
        document.getElementById('auth-screen').style.display = 'none'; 
        document.getElementById(id).style.display = 'block'; 
    };
    
    if(l === 'admin' && p === 'admin2026') { show('admin-screen'); return; }
    if(l === 'hall') { show('room-screen'); document.getElementById('room-title').innerText = "ОБЩЕЕ ТАБЛО"; initHall(); return; }
    
    if(l.startsWith('vol') && p === 'VSF14you') {
        currentUserNum = parseInt(l.replace('vol',''));
        if(!ROOMS[currentUserNum]) return alert("Ошибка: комната не найдена");
        show('volunteer-screen'); setupVolunteerDropdowns(currentUserNum); return;
    }
    
    if(l.startsWith('teacher') && p === 'VSF14you') { 
        currentUserNum = parseInt(l.replace('teacher',''));
        show('teacher-screen'); setupTeacherDropdowns(); startQueueListener(); return; 
    }
    
    if(l.startsWith('room') && p === 'room2026') {
        const n = parseInt(l.replace('room',''));
        if(!ROOMS[n]) return alert("Ошибка: комната не найдена");
        show('room-screen'); document.getElementById('room-title').innerText = `КОМНАТА ${n}`; initRoom(n); return;
    }
    
    alert("Ошибка входа!");
}

// ==========================================
// 4. ЛОГИКА ВОЛОНТЕРА И ИИ-ПРОВЕРКА (GEMINI)
// ==========================================
function setupVolunteerDropdowns(roomIdx) {
    const ts = document.getElementById('vol-select-team'), qs = document.getElementById('vol-select-task');
    ts.innerHTML = ""; qs.innerHTML = "";
    ROOMS[roomIdx].teams.forEach(t => ts.innerHTML += `<option value="${t}">${t}</option>`);
    for(let i=1; i<=16; i++) qs.innerHTML += `<option value="${i}">Задача ${i}</option>`;
}

async function verifyWithAI(team, taskNum, volunteerAnswer) {
    const promptText = `
    Ты — эксперт олимпиады "MATH KVADRAT".
    Проверь ответ команды ${team} на задачу №${taskNum}.
    Введенный ответ: "${volunteerAnswer}"

    Верни СТРОГО JSON объект без Markdown:
    {
        "isCorrect": true/false,
        "confidence": 0.95,
        "reason": "Краткая причина вердикта на русском языке"
    }
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: promptText }] }]
            })
        });

        const data = await response.json();
        const rawText = data.candidates[0].content.parts[0].text.trim();
        const cleanJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    } catch (err) {
        console.error("AI Error:", err);
        return { isCorrect: false, confidence: 0, reason: "Ошибка соединения с ИИ-модулем" };
    }
}

async function sendSubmission() {
    const t = document.getElementById('vol-select-team').value;
    const q = document.getElementById('vol-select-task').value;
    const a = document.getElementById('vol-ans').value.trim();
    if(!a) return alert("Введите ответ!");

    const sendBtn = document.getElementById('send-btn');
    sendBtn.disabled = true;
    sendBtn.innerText = "АНАЛИЗ ИИ...";

    const subRef = db.ref('submissions').push();
    await subRef.set({ t, q, a, ts: Date.now() });

    const aiRes = await verifyWithAI(t, q, a);
    const safeId = t.replace('.', '-');

    await db.ref(`ai_checks/t${safeId}_q${q}`).set({
        aiVerdict: aiRes.isCorrect ? 'ok' : 'fail',
        confidence: aiRes.confidence || 0,
        reason: aiRes.reason || "",
        timestamp: Date.now()
    });

    document.getElementById('vol-ans').value = "";
    sendBtn.disabled = false;
    sendBtn.innerText = "ОТПРАВИТЬ ЖЮРИ";
    alert(`Отправлено! Точность ИИ: ${Math.round((aiRes.confidence || 0) * 100)}%`);
}

// ==========================================
// 5. ЛОГИКА УЧИТЕЛЯ / ЖЮРИ И ОЧЕРЕДИ
// ==========================================
function getTeacherAssignment(tNum) {
    const K = parseInt(appConfig.teachersCount) || 1;
    const N = MASTER_LIST.length;
    const base = Math.floor(N/K), extra = N%K;
    let start = 0;
    for(let i=1; i<tNum; i++) start += (i<=extra)?base+1:base;
    return MASTER_LIST.slice(start, start + ((tNum<=extra)?base+1:base));
}

function setupTeacherDropdowns() {
    const ts = document.getElementById('select-team'), qs = document.getElementById('select-task');
    ts.innerHTML = ""; qs.innerHTML = "";
    getTeacherAssignment(currentUserNum).forEach(id => ts.innerHTML += `<option value="${id}">${id}</option>`);
    for(let i=1; i<=16; i++) qs.innerHTML += `<option value="${i}">Задача ${i}</option>`;
}

function startQueueListener() { 
    db.ref('submissions').on('value', snap => { 
        lastSubs = snap.val() || {}; 
        updateQueue(); 
    }); 
}

function updateQueue() {
    const qBox = document.getElementById('answers-queue'); 
    if(!qBox) return;
    qBox.innerHTML = "";
    
    const mine = getTeacherAssignment(currentUserNum);
    const items = Object.entries(lastSubs).map(([id, d]) => ({id, ...d})).filter(item => mine.includes(String(item.t)));
    
    const pending = [], checked = [];
    items.forEach(item => {
        const s = scores[`t${item.t.replace('.','-')}_q${item.q}`];
        if(s) checked.unshift(item); else pending.unshift(item);
    });

    [...pending, ...checked].forEach(item => {
        const s = scores[`t${item.t.replace('.','-')}_q${item.q}`];
        let div = document.createElement('div');
        div.className = `notif-card ${s?'checked':''}`;
        div.innerHTML = `<div><b>${item.t} | Зад. ${item.q}</b><br><small>${s?'ПРОВЕРЕНО':'ЖДЕТ'}</small></div><b style="font-size:24px;">${item.a}</b>`;
        div.onclick = () => { 
            document.getElementById('select-team').value = item.t; 
            document.getElementById('select-task').value = item.q; 
            document.getElementById('view-ans').value = item.a; 
            refreshStatusBanner(); 
        };
        qBox.appendChild(div);
    });
}

function setResult(v) { 
    const t = document.getElementById('select-team').value;
    const q = document.getElementById('select-task').value;
    if(t && q) {
        db.ref(`scores/t${t.replace('.','-')}_q${q}`).set(v); 
    }
}

function refreshStatusBanner() {
    const t = document.getElementById('select-team')?.value;
    const q = document.getElementById('select-task')?.value;
    const b = document.getElementById('status-banner');
    const aiBox = document.getElementById('ai-suggestion-box');
    const aiVerdictText = document.getElementById('ai-verdict-text');
    const aiReasonText = document.getElementById('ai-reason-text');

    if(!t || !q) return;

    const safeId = t.replace('.','-');
    const s = scores[`t${safeId}_q${q}`];

    if(b) {
        if(s) { 
            b.style.display = "block"; 
            b.style.background = s === 'ok' ? 'var(--green)' : 'var(--red)'; 
            b.innerText = s === 'ok' ? "ВЕРНО ✅" : "ОШИБКА ❌"; 
        } else {
            b.style.display = "none";
        }
    }

    const aiData = aiChecks[`t${safeId}_q${q}`];
    if(aiBox && aiData) {
        aiBox.style.display = "block";
        const isOk = aiData.aiVerdict === 'ok';
        const confPercent = Math.round((aiData.confidence || 0) * 100);
        
        if(aiVerdictText) {
            aiVerdictText.style.color = isOk ? "var(--green)" : "var(--red)";
            aiVerdictText.innerText = `${isOk ? "ВЕРНО ✅" : "НЕВЕРНО ❌"} (${confPercent}% точности)`;
        }
        if(aiReasonText) {
            aiReasonText.innerText = aiData.reason || "";
        }
    } else if(aiBox) {
        aiBox.style.display = "none";
    }
}

// ==========================================
// 6. ПОДСЧЕТ БАЛЛОВ И ТАБЛИЦЫ
// ==========================================
function calcTotal(tid) {
    let base = 0, solved = [];
    const safeId = tid.replace('.','-');
    for(let q=1; q<=16; q++) if(scores[`t${safeId}_q${q}`] === 'ok') { base += ((((q-1)%4)+1)*10); solved[q]=true; }
    let bonus = 0;
    for(let r=0; r<4; r++) if(solved[r*4+1] && solved[r*4+2] && solved[r*4+3] && solved[r*4+4]) bonus += 40;
    for(let c=1; c<=4; c++) if(solved[c] && solved[c+4] && solved[c+8] && solved[c+12]) bonus += (c*10);
    return base + bonus - (penalties[`t${safeId}`] || 0);
}

function renderTbl(title, list) {
    let h = `<h3>${title}</h3><div class="table-holder"><table><tr><th>Команда</th>${Array.from({length:16},(_,i)=>`<th>${i+1}</th>`).join('')}<th>Σ</th></tr>`;
    list.forEach(tid => {
        let r = `<td><b>${tid}</b></td>`;
        const safeId = tid.replace('.','-');
        for(let q=1; q<=16; q++) { 
            let s = scores[`t${safeId}_q${q}`]; 
            r += `<td class="${s==='ok'?'bg-ok':(s==='fail'?'bg-fail':'')}"></td>`; 
        }
        h += `<tr>${r}<td><b>${calcTotal(tid)}</b></td></tr>`;
    });
    return h + `</table></div>`;
}

function initHall() {
    db.ref('scores').on('value', () => {
        const c = document.getElementById('tables-container'); if(!c) return;
        c.innerHTML = "";
        [4, 5, 6, 7, 8].forEach(g => {
            const l = MASTER_LIST.filter(t => t.startsWith(g+"."));
            if(l.length) c.innerHTML += renderTbl(`Класс ${g}`, l);
        });
    });
}

function initRoom(idx) {
    db.ref('scores').on('value', () => {
        const c = document.getElementById('tables-container'); if(!c) return;
        c.innerHTML = renderTbl(`Комната ${idx}`, ROOMS[idx].teams);
    });
}

function showWinners() {
    const c = document.getElementById('winners-container'); if(!c) return;
    c.innerHTML = "";
    document.getElementById('winners-screen').style.display = 'block';
    [4, 5, 6, 7, 8].forEach(g => {
        let l = MASTER_LIST.filter(t => t.startsWith(g+".")).map(tid => ({id: tid, s: calcTotal(tid)}));
        l.sort((a,b) => b.s - a.s);
        let h = `<div class="container"><h3>Класс ${g}</h3><div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">`;
        ["🥇","🥈","🥉"].forEach((m,i) => { if(l[i]) h += `<div>${m} ${l[i].id}<br><b>${l[i].s}</b></div>`; });
        c.innerHTML += h + "</div></div>";
    });
}

// ==========================================
// 7. АДМИН-ПАНЕЛЬ И ПОЛНЫЙ СБРОС (MASTER RESET)
// ==========================================
function applyPenalty() {
    const t = document.getElementById('penalty-team').value;
    const v = document.getElementById('penalty-val').value;
    if(t && v) db.ref(`penalties/t${t.replace('.','-')}`).set(parseInt(v));
}

function saveAdminConfig() { 
    db.ref('config/teachersCount').set(document.getElementById('setup-teachers').value); 
    alert("Сохранено"); 
}

function fullReset() { 
    const masterPass = prompt("ВНИМАНИЕ! Введите мастер-пароль для обнуления всех результатов:");
    if(masterPass === "MASTER2026") {
        if(confirm("ВЫ УВЕРЕНЫ? ДАННЫЕ БУДУТ УДАЛЕНЫ БЕЗВОЗВРАТНО!")) { 
            db.ref('scores').remove(); 
            db.ref('submissions').remove(); 
            db.ref('penalties').remove(); 
            db.ref('ai_checks').remove();

            scores = {};
            penalties = {};
            aiChecks = {};
            lastSubs = {};

            if (typeof refreshStatusBanner === "function") refreshStatusBanner();
            if (typeof updateQueue === "function") updateQueue();

            alert("Все данные успешно обнулены!");
        } 
    } else {
        alert("Неверный пароль!");
    }
}