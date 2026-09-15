// Конфигурация Firebase и Gemini API
const firebaseConfig = {
    apiKey: "AIzaSyCAKP0Id8VBaQASZpj3SCI0TWFnbFJ9Ssc",
    authDomain: "math-kvadrat-2026.firebaseapp.com",
    databaseURL: "https://math-kvadrat-2026-default-rtdb.firebaseio.com",
    projectId: "math-kvadrat-2026",
    storageBucket: "math-kvadrat-2026.appspot.com",
    messagingSenderId: "123456789012",
    appId: "1:123456789012:web:abcdef1234567890"
};

// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// Ключ Gemini API
const GEMINI_API_KEY = "AIzaSyCAKP0Id8VBaQASZpj3SCI0TWFnbFJ9Ssc";