// Import the functions you need from the SDKs you need
import { db, gameRef, functions } from "./firebase-init.js";
import { ref, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
// In public/backend.js, bij je andere imports
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";


let localGameState = {};
let countdownInterval = null;
let locallastMessage = null
const letters = ["a", "b", "c", "d", "e", "f", "g", "h"];

onValue(gameRef, (snapshot) => {
    const serverState = snapshot.val();
    if (serverState) {
        if (localGameState.board != serverState.board){
            renderBoard(serverState.board); 
        }
        localGameState = serverState;
        
        display_voting(serverState.currentVotes, serverState.totalVotesInRound);

        // --- CORRECT TIMER LOGIC ---

        // Always stop any old timer before starting a new one.

        const turnElement = document.getElementById('game-turn')
        turnElement.innerText = serverState.turn

        const statusDisplay = document.getElementById('game-status')
        statusDisplay.innerHTML = serverState.status
        if (locallastMessage != serverState.lastMessage) {
            console.log(serverState.lastMessage)
            locallastMessage = serverState.lastMessage
        }
        
        
        if (countdownInterval) {
            clearInterval(countdownInterval);
        }
        const timerElement = document.getElementById('timer');
        const deadline = serverState.roundEndsAt;


        // Only start a timer if the server has set a future deadline.
        if (deadline && deadline > Date.now()) {
            
            // This is the "continuous loop" that runs every second.
            countdownInterval = setInterval(() => {
                // Calculate the difference between the deadline and right now.
                const timeLeft = deadline - Date.now();

                // If time is up, stop the loop and show 00:00.
                if (timeLeft <= 0) {
                    clearInterval(countdownInterval);
                    timerElement.textContent = "00:00";
                    return;
                }

                // Convert milliseconds to minutes and seconds for display.
                const minutes = Math.floor(timeLeft / 60000);
                const seconds = Math.floor((timeLeft % 60000) / 1000);

                // Update the HTML with a nice "MM:SS" format.
                timerElement.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }, 1000); // Run every 1 second.

        } else {
            // If there's no active round, show a default display.
            timerElement.textContent = "--:--";
        }

    }
});



//board creation
let board = document.getElementById("board")

console.log(board)

for (let y = 0; y < 9; y++) { // Changed to 10 to accommodate numbers
    let horo = document.createElement('div');
    horo.className = "row";

    for (let x = 0; x < 9; x++) { // Changed to 10 to accommodate letters
        let square = document.createElement('div');
        square.dataset.x = letters[x]
        square.dataset.y = y+1

        if (y === 8) { // Top and bottom rows: letters
            if (x > 0 && x < 9) {
                square.textContent = letters[x - 1];
                square.className = "label"; // You'll need to style this class
            }
        } else if (x === 8) { // Right side: numbers
            square.textContent = y+1;
            square.className = "label"; // You'll need to style this class
        }
        else { // The actual chessboard squares
            if ((x + y) % 2 === 0) {
                square.className = "block black";
            } else {
                square.className = "block white";
            }
        }
        horo.appendChild(square);
    }
    board.appendChild(horo);
}


//voting system

let selectedSquare = null
board.addEventListener('click', function(event){
    const clickedElement = event.target
    if (clickedElement.classList.contains('piece')){
        const square = clickedElement.parentElement;
        selectedSquare = {
            x: letters.indexOf(square.dataset.x),
            y: parseInt(square.dataset.y) - 1
        };
    } else if (clickedElement.classList.contains('block') && selectedSquare) {
        const destSquare = {
            x: letters.indexOf(clickedElement.dataset.x),
            y: parseInt(clickedElement.dataset.y) - 1
        };

        // Check if the move is valid using the NEW function
        if (isMoveValid(selectedSquare.x, selectedSquare.y, destSquare.x, destSquare.y, localGameState.board)) {
            // This is a valid move, so let's VOTE for it.
            const fromAlg = letters[selectedSquare.x] + (selectedSquare.y + 1); // "e2"
            const toAlg = letters[destSquare.x] + (destSquare.y + 1); // "e4"
            const moveKey = fromAlg + toAlg; // "e2e4"

            console.log(`User wants to vote for move: ${moveKey}`);
            
            // **NEW**: Instead of moving the piece, you update Firebase.
            // This uses a transaction to safely increment the vote count.
            const castVote = httpsCallable(functions, 'castVote');
            castVote({ fromX: selectedSquare.x, fromY: selectedSquare.y, toX: destSquare.x, toY: destSquare.y })
            .then((result) => {
                // Dit wordt uitgevoerd als de functie succesvol was
                console.log("Server response:", result.data);
                // Je zou hier een kleine pop-up of bevestiging aan de gebruiker kunnen tonen
            })
            .catch((error) => {
                // Dit wordt uitgevoerd als de functie een error gooit
                // bv. omdat de zet illegaal was of de gebruiker niet ingelogd is
                console.error("Error while casting vote:", error);
                alert(`Error while voting: ${error.message}`); // Toon de foutmelding aan de gebruiker
            });
            


        }
        selectedSquare = null; // Reset selection
    }
});






function display_voting (votes, total_votes){
    let voting_panel = document.getElementById("voting_panel_list")
    voting_panel.innerHTML = '';
    const sortedVotes = Object.entries(votes || {}).sort(([,a],[,b]) => b-a);
    for (const vote in sortedVotes){
        const move = sortedVotes[vote][0].split("-").map(Number)
        const count = sortedVotes[vote][1]
        const fromX = letters[move[0]];
        const toX = letters[move[2]];
        let panel = document.createElement("div")
        panel.className = "vote"
        let percentage = total_votes > 0 ? Math.round((count * 100) / total_votes) : 0;
        panel.innerHTML = `
            <div class="vote-info">
                <span class="vote-move">${fromX}${move[1]+1} ==> ${toX}${move[3]+1}</span>
                <span class="vote-details">${count} vote(s) - ${percentage}%</span>
            </div>
            <div class="percentage-bar-background">
                <div class="percentage-bar" style="width: ${percentage}%;"></div>
            </div>
        `;
        voting_panel.appendChild(panel)
    }
}



//game logic


function renderBoard(currentBoardState) {
    const allPieces = document.querySelectorAll('.piece');
    allPieces.forEach(p => p.remove());
    for (let y = 0; y <8; y++) {
        for(let x = 0; x <8; x++) {
            const piece = currentBoardState && currentBoardState[y] ? currentBoardState[y][x] : null; // fix: a weird error to fix the null handeling of empty squares in firebase
            if (piece) {
                const pieceElement = document.createElement('img');
                pieceElement.className = "piece"
                pieceElement.dataset.type = piece;
                pieceElement.src = `pieces/${piece}.png`;
                const square = document.querySelector(`[data-x="${letters[x]}"][data-y="${y + 1}"]`);
                square.appendChild(pieceElement)
            }
        }
    }
}




function isPathBlocked(startX, startY, endX, endY, boardState) {
    // Use the function's parameters, not global variables
    let x_direction = Math.sign(endX - startX);
    let y_direction = Math.sign(endY - startY);

    let currentX = startX + x_direction;
    let currentY = startY + y_direction;

    while (currentX !== endX || currentY !== endY) {
       // Check the array using [y][x] format
       if (boardState[currentY] && boardState[currentY][currentX] !== null) {
            return true; // Path is blocked
        }
        currentX += x_direction;
        currentY += y_direction;
    }
    return false; // Path is clear
}


function isMoveValid(fromX, fromY, toX, toY, boardState) {
    const piece = boardState && boardState[fromY] ? boardState[fromY][fromX] : null;
    if (!piece) return false;
    const type = piece[1];
    const color = piece[0]
    const destinationPiece = boardState && boardState[toY] ? boardState[toY][toX] : null;
    if (destinationPiece && destinationPiece[0] === color) {
        return false;
    }
    if (color != piece[0]) {
        console.log("moving the opponents piece, not allowed")
    }


    if (type === "p") {
        const direction = color === 'w' ? -1 : 1;
        const startRow = color === 'w' ? 6 : 1;

        // Standard 1-square move
        if (fromX === toX && toY === fromY + direction && !destinationPiece) {
            return true;
        }
        // 2-square move from start
        if (fromY === startRow && fromX === toX && toY === fromY + (2 * direction) && !destinationPiece) {
            // Check if path is blocked for the 2-square move
            if (boardState[fromY + direction] && !boardState[fromY + direction][fromX]) {
                return true;
            }
        }
        // Capture move
        if (Math.abs(fromX - toX) === 1 && toY === fromY + direction && destinationPiece) {
            return true;
        }
        return false; // Not a valid pawn move
    }

    if (type === "r") {
        if (fromX !== toX && fromY !== toY) return false; // Must be straight line
        return !isPathBlocked(fromX, fromY, toX, toY, boardState);
    }
    if (type === "b") {
        if (Math.abs(toX - fromX) !== Math.abs(toY - fromY)) return false; // Must be diagonal
        return !isPathBlocked(fromX, fromY, toX, toY, boardState);
    }
    if (type === "k") {
        const dx = Math.abs(toX - fromX);
        const dy = Math.abs(toY - fromY);
        return dx <= 1 && dy <= 1; // Can move 1 square in any direction
    }
    if (type === "q") {
        const isStraight = fromX === toX || fromY === toY;
        const isDiagonal = Math.abs(toX - fromX) === Math.abs(toY - fromY);
        if (!isStraight && !isDiagonal) return false;
        return !isPathBlocked(fromX, fromY, toX, toY, boardState);
    }
    if (type === "n") {
        const dx = Math.abs(toX - fromX);
        const dy = Math.abs(toY - fromY);
        return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
    }

    return false;



    }



const play_against_ai_btn = document.getElementById("play-AI-btn")
play_against_ai_btn.addEventListener("click", function() {
  
});