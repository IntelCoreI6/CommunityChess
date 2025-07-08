import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
import { getFunctions, connectFunctionsEmulator } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBN1-m8zZUaB_PzBTmqzCd-0Meq6pTVp00",
  authDomain: "community-chess-7de3a.firebaseapp.com",
  projectId: "community-chess-7de3a",
  storageBucket: "community-chess-7de3a.firebasestorage.app",
  messagingSenderId: "564950810071",
  appId: "1:564950810071:web:66337708547537dd701f92",
  databaseURL: "https://community-chess-7de3a-default-rtdb.europe-west1.firebasedatabase.app"
};

// Initialize Firebase ONCE
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const functions = getFunctions(app, 'europe-west1'); // <-- VOEG DIT TOE. De regio is belangrijk!


if (window.location.hostname === "localhost") {
  console.log("Localhost detected. Connecting to local functions api")
  connectFunctionsEmulator(functions, "localhost", 5001);
}

// Create and export the database reference so we don't have to repeat it
export const gameRef = ref(db, "gamestate");
export { db, functions}; // Export the database instance itself