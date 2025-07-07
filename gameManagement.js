import { db, gameRef } from "./firebase-init.js";
import { set } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";

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
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
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