// Ключ для Gemini API
const GEMINI_API_KEY = "AIzaSyCAKP0Id8VBaQASZpj3SCI0TWFnbFJ9Ssc";

// Конфигурация Firebase
const firebaseConfig = {
    apiKey: "AIzaSyBXpwbVJMm8oPTxNIrci8VDaMju7QfBByw",
    authDomain: "matholymp-b5c35.firebaseapp.com",
    databaseURL: "https://matholymp-b5c35-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "matholymp-b5c35",
    storageBucket: "matholymp-b5c35.firebasestorage.app",
    messagingSenderId: "14249624634",
    appId: "1:14249624634:web:2164cb56f3e11fd785a103",
};

// Инициализация
firebase.initializeApp(firebaseConfig);
const db = firebase.database();