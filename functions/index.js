const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { GoogleGenAI } = require("@google/genai");

admin.initializeApp();
const db = admin.database();

// Инициализируем Gemini API (ключ берется из окружения)
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

/**
 * 1. Проверка ответа команды с помощью ИИ
 */
exports.verifyAnswerWithAI = functions.https.onCall(async (data, context) => {
    const { team, taskNum, volunteerAnswer, correctAnswer, taskCondition } = data;

    if (!volunteerAnswer) {
        throw new functions.https.HttpsError('invalid-argument', 'Ответ не может быть пустым');
    }

    const prompt = `
    Ты — эксперт математической олимпиады "Math Kvadrat".
    Условие задачи: "${taskCondition || 'Не указано'}"
    Эталонный ответ: "${correctAnswer}"
    Ответ команды: "${volunteerAnswer}"

    Сравни ответ команды с эталонным. Учитывай возможные синонимы, опечатки, единицы измерения и эквивалентные дроби/записи (например: 0.5 и 1/2, "10 см" и "10").
    Верни строго JSON в формате:
    {
      "isCorrect": true/false,
      "confidence": 0.0-1.0,
      "reason": "краткое объяснение решения"
    }
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: { responseMimeType: 'application/json' }
        });

        const aiResult = JSON.parse(response.text);
        const safeTeamId = String(team).replace('.', '-');

        // Сохраняем вердикт ИИ в БД
        await db.ref(`ai_checks/t${safeTeamId}_q${taskNum}`).set({
            aiVerdict: aiResult.isCorrect ? 'ok' : 'fail',
            confidence: aiResult.confidence,
            reason: aiResult.reason,
            timestamp: Date.now()
        });

        return { success: true, aiResult };
    } catch (error) {
        console.error("Ошибка ИИ:", error);
        throw new functions.https.HttpsError('internal', 'Ошибка работы ИИ');
    }
});

/**
 * 2. Безопасный расчёт баллов на бэкенде
 */
exports.updateScore = functions.https.onCall(async (data, context) => {
    const { team, taskNum, status } = data; // status: 'ok' или 'fail'
    const safeTeamId = String(team).replace('.', '-');

    // Записываем результат задачи в БД
    await db.ref(`scores/t${safeTeamId}_q${taskNum}`).set(status);

    // Подтягиваем данные из базы для пересчета
    const scoresSnap = await db.ref('scores').once('value');
    const penaltiesSnap = await db.ref(`penalties/t${safeTeamId}`).once('value');
    
    const scores = scoresSnap.val() || {};
    const penalty = penaltiesSnap.val() || 0;

    let base = 0;
    const solved = {};

    for (let q = 1; q <= 16; q++) {
        if (scores[`t${safeTeamId}_q${q}`] === 'ok') {
            base += (((q - 1) % 4) + 1) * 10;
            solved[q] = true;
        }
    }

    let bonus = 0;
    // Бонус за строки
    for (let r = 0; r < 4; r++) {
        if (solved[r * 4 + 1] && solved[r * 4 + 2] && solved[r * 4 + 3] && solved[r * 4 + 4]) {
            bonus += 40;
        }
    }
    // Бонус за столбцы
    for (let c = 1; c <= 4; c++) {
        if (solved[c] && solved[c + 4] && solved[c + 8] && solved[c + 12]) {
            bonus += (c * 10);
        }
    }

    const totalScore = base + bonus - penalty;
    await db.ref(`totals/t${safeTeamId}`).set(totalScore);

    return { success: true, totalScore };
});