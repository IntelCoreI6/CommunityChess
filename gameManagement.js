// This file handles admin-level game management, like resetting the board.

// Import the necessary Firebase functions.
// Note: The Firebase app is already initialized by backend.js,
// so we just need to get the database instance.
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

// You must include your config here as well so this module can connect.
const firebaseConfig = {
  apiKey: "AIzaSyBN1-m8zZUaB_PzBTmqzCd-0Meq6pTVp00",
  authDomain: "community-chess-7de3a.firebaseapp.com",
  projectId: "community-chess-7de3a",
  storageBucket: "community-chess-7de3a.firebasestorage.app",
  messagingSenderId: "564950810071",
  appId: "1:564950810071:web:66337708547537dd701f92"
};

// Initialize Firebase within this module
const app = initializeApp(firebaseConfig);
const db = getDatabase();
const gameRef = ref(db, "gamestate");

// --- Define the Initial State of the Game ---
const initialGameState = {
    board: [
        ['br', 'bn', 'bb', 'bq', 'bk', 'bb', 'bn', 'br'],
        ['bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp'],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        ['wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp'],
        ['wr', 'wn', 'wb', 'wq', 'wk', 'wb', 'wn', 'wr']
    ],
    turn: 'w',
    castlingRights: { w: { kingSide: true, queenSide: true }, b: { kingSide: true, queenSide: true } },
    moveHistory: [],
    currentVotes: {},
    totalVotesInRound: 0,
};




// --- Get the button and add the event listener ---
const resetButton = document.getElementById('reset-game-btn');

resetButton.addEventListener('click', () => {
    // Add a confirmation dialog to prevent accidental resets
    const isConfirmed = confirm("Are you sure you want to reset the entire game? This cannot be undone.");

    if (isConfirmed) {
        console.log("Resetting game state in Firebase...");
        // Use set() to completely overwrite the data at gameRef with the initial state
        set(gameRef, initialGameState)
            .then(() => {
                console.log("Game reset successfully!");
                alert("Game has been reset.");
            })
            .catch((error) => {
                console.error("Error resetting game: ", error);
                alert("There was an error resetting the game.");
            });
    } else {
        console.log("Game reset cancelled.");
    }
});