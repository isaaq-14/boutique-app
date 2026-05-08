import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
        import { getFirestore, collection, getDocs, query, onSnapshot } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

        const firebaseConfig = {
            apiKey: "AIzaSyDDAg0bLMj4hUsZ5PGGDqKyj5KwAQmMcNw",
            authDomain: "boutique-app-d2693.firebaseapp.com",
            projectId: "boutique-app-d2693",
            storageBucket: "boutique-app-d2693.firebasestorage.app",
            messagingSenderId: "762532423429",
            appId: "1:762532423429:web:0b849c205deb831f71796c"
        };
        const app = initializeApp(firebaseConfig);
        export const db = getFirestore(app);