// Import the functions you need from the SDKs you need
import { initializeApp} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getDatabase, ref, set, onValue, runTransaction } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBN1-m8zZUaB_PzBTmqzCd-0Meq6pTVp00",
  authDomain: "community-chess-7de3a.firebaseapp.com",
  projectId: "community-chess-7de3a",
  storageBucket: "community-chess-7de3a.firebasestorage.app",
  messagingSenderId: "564950810071",
  appId: "1:564950810071:web:66337708547537dd701f92"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase();
const gameRef = ref(db,"gamestate")

let localGameState = {};

onValue(gameRef, (snapshot) => {
    const serverState = snapshot.val();
    if (serverState) {
        localGameState = serverState;
        // When data changes, re-render the entire board view
        renderBoard(serverState.board); 
        // And update the voting panel
        display_voting(serverState.currentVotes, serverState.totalVotesInRound);
    }
});



//board creation
let board = document.getElementById("board")

const letters = ["a", "b", "c", "d", "e", "f", "g", "h"];
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
            const voteRef = ref(db, `gamestate/currentVotes/${moveKey}`);
            runTransaction(voteRef, (currentVotes) => {
                return (currentVotes || 0) + 1;
            });
            const voteRefTotal = ref(db, "gamestate/totalVotesInRound")
            runTransaction(voteRefTotal, (totalVotesInRound) => {
                return (totalVotesInRound || 0) + 1;
            })
            


        }
        selectedSquare = null; // Reset selection
    }
});



function display_voting (votes, total_votes){
    let voting_panel = document.getElementById("voting_panel_list")
    voting_panel.innerHTML = '';
    for (const vote in votes){
        let panel = document.createElement("div")
        panel.className = "vote"
        let percentage = Math.round(votes[vote]*100/total_votes)
        panel.textContent = `${vote} has ${votes[vote]} votes which is ${percentage}% of all votes`
        let bar = document.createElement("div")
        bar.className = "percentage-bar"
        bar.style.width= `${percentage}%`
        panel.appendChild(bar)
        voting_panel.appendChild(panel)
    }
}



//game logic

let boardState = [
        ['br', 'bn', 'bb', 'bq', 'bk', 'bb', 'bn', 'br'], 
        ['bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp'], 
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, "wk", null, null, null, null],
        [null, null, null, null, null, null, null, null],
        ['wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp'], 
        ['wr', 'wn', 'wb', 'wq', 'wk', 'wb', 'wn', 'wr']  
    ];


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
