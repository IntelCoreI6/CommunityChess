import { functions } from "./firebase-init.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";




// --- Get the button and add the event listener ---
const resetButton = document.getElementById('reset-game-btn');

const startGame = httpsCallable(functions, 'startGame');

resetButton.addEventListener('click', () => {
    // Add a confirmation dialog to prevent accidental resets
    const isConfirmed = confirm("Are you sure you want to reset the entire game? This cannot be undone.");

    if (isConfirmed) {
        console.log("Resetting game state in Firebase...");
        // Use set() to completely overwrite the data at gameRef with the initial state
        startGame()
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