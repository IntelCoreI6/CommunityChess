const { onValueWritten } = require("firebase-functions/v2/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const logger = require("firebase-functions/logger");
const { spawn } = require("child_process");
const path = require("path");
const { Chess } = require("chess.js");

// Initialize the Admin SDK once
initializeApp();

// Define the function trigger

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

function movePiece(fromX, fromY, toX, toY, boardState) {
    const newBoardState = JSON.parse(JSON.stringify(boardState));
    const pieceToMove = newBoardState[fromX, fromY];
    const destinationPiece = boardState && boardState[toY] ? boardState[toY][toX] : null;
    newBoardState[toY, toX] = pieceToMove
    newBoardState[fromY, fromX] = null
    return newBoardState;
}


async function log(text) {
    logger.info(text);
    const db = getDatabase();
    const gameStateRef = db.ref("/gamestate");
    try {
        await gameStateRef.update({
            lastMessage: `SERVER: ${text}`
        });
    } catch (error) {
        logger.error("Failed to update lastMessage:", error);
    }
}

exports.processFinishedRounds = onSchedule({schedule:"every 1 seconds", region:"europe-west1"}, async (event) => {
    log("processFinished Rounds was ran")
    const db = getDatabase();
    const gameStateRef = db.ref("/gamestate");
    const gameStateSnap = await gameStateRef.once("value");
    const gameState = gameStateSnap.val();
    const now = Date.now()


    log("checking if round has ended")
    if (gameState && gameState.status == "VOTING" && (now > gameState.roundEndsAt)) {
        log(`Round has ended. Processing results`);
        //round over
        const votes = gameState.currentVotes;
        log('votes:', votes)

        if (!votes || Object.keys(votes).length === 0) {
            log("No votes cast. Passing turn to the other player.");
            // Pass the turn if no one voted.
            return gameStateRef.update({
                turn: gameState.turn === 'w' ? 'b' : 'w',
                //roundEndsAt: Date.now() + 10000, // Stop the timer
                status: "PROCESSING_MOVE",
                lastMessage: "No votes were cast. Passing turn."

            });
        }
        let winningMoveKey = "";
        let maxVotes = 0;
        for (const moveKey in votes) {
          if (votes[moveKey] > maxVotes) {
            winningMoveKey = moveKey;
            maxVotes = votes[moveKey]
          }

        }

    
        log(`Winning move is ${winningMoveKey} with ${maxVotes} votes.`);
        const parts = winningMoveKey.split('-').map(Number);
        const [fromX, fromY, toX, toY] = parts;
        // 4. Apply the winning move to the board using chess.js.
        newBoardState = movePiece(fromX, fromY, toX, toY, gameState.board)

        // 5. Check if the move was legal.
        if (isMoveValid(fromX, fromY, toX, toY, gameState.board) ==  false) {
            logger.error(`Winning move ${winningMoveKey} was illegal. Resetting round.`);
            return gameStateRef.update({
                currentVotes: {},
                totalVotesInRound: 0,
                roundEndsAt: Date.now() + 60000, // Give them another minute
                lastMessage: `The winning move (${winningMoveKey}) was illegal. Please vote again.`
            });
        }

        log("Applying winning move and updating board state.");
        // Update the gamestate with the new position.
        return gameStateRef.update({
            status: "PROCESSING_MOVE",
            board: newBoardState,
            turn: gameState.turn === 'w' ? 'b' : 'w',
            lastMessage: `Community chose ${winningMoveKey}.`
        });
    }
    else {
        log("round end logic wasn't met, continueing")
    }

    // If the condition is false, it means no round is active or the timer hasn't finished.
    // In that case, do nothing.
    log("No finished rounds to process.");
    return null;
});

exports.castVote = onCall({ region: 'europe-west1' }, async (request) => {
    // The data sent from the client is in request.data
    const { fromX, fromY, toX, toY } = request.data;
    if ([fromX, fromY, toX, toY].some(coord => typeof coord !== 'number')) {
        throw new HttpsError('invalid-argument', 'The function must be called with fromX, fromY, toX, toY coordinates.');
    }
    const moveKey = `${fromX}-${fromY}-${toX}-${toY}`;

    const db = getDatabase();
    const gameStateRef = db.ref("/gamestate");
    const gameState = (await gameStateRef.once("value")).val()
        if (!gameState) {
        throw new HttpsError('not-found', 'The game state could not be found. The game may need to be reset.');
    }
    if (gameState.status !== "VOTING"){
        throw new HttpsError("failed-precondition", "Not currently in a voting round.")
    }

    try {
        if (isMoveValid(fromX, fromY, toX, toY, gameState.board) == false) {
            throw new HttpsError('invalid-argument', 'The move is illegal.');
    }
    } catch (e) {
        logger.warn(`Validation failed for move: ${moveKey}`)
        throw new HttpsError('invalid-argument', `move is not valid: ${moveKey}`)
    }


    const voteRef = db.ref(`/gamestate/currentVotes/${moveKey}`);
    const totalVotesRef = db.ref('/gamestate/totalVotesInRound');
    const votePromise = voteRef.transaction((v) => (v || 0) + 1);
    const totalVotesPromise = totalVotesRef.transaction((v) => (v || 0) + 1);

    await Promise.all([votePromise, totalVotesPromise])
    return { success: true };
});

exports.handleTurnChange = onValueWritten("/gamestate", async (event) => {
    const gameState = event.data.after.val();
    const oldGameState = event.data.before.val();

    // Only act if the status has just been set to 'PROCESSING_MOVE'.
    if (!gameState || gameState.status !== 'PROCESSING_MOVE' || oldGameState.status === 'PROCESSING_MOVE') {
        return null;
    }

    // --- AI's Turn ---
    if (gameState.turn !== gameState.controlled) {
        logger.info(`AI's turn (${gameState.turn}). Running Stockfish.`);
        try {
            const fen = gameState.fen;
            const stockfishPath = path.join(__dirname, "stockfish");
            const stockfish = spawn(stockfishPath);
            let bestMove = "";

            stockfish.stdout.on("data", (data) => {
                const output = data.toString();
                if (output.startsWith("bestmove")) {
                    bestMove = output.split(" ")[1];
                }
            });

            await new Promise((resolve, reject) => {
                stockfish.on("close", (code) => code === 0 && bestMove ? resolve() : reject(new Error(`Stockfish failed.`)));
                stockfish.stdin.write(`position fen ${fen}\n`);
                stockfish.stdin.write("go movetime 2000\n");
                stockfish.stdin.end();
            });

            const chess = new Chess(fen);
            chess.move(bestMove, { sloppy: true });

            // AI has moved. Now it's the human's turn again. Start a new voting round.
            return event.data.after.ref.update({
                status: 'VOTING',
                fen: chess.fen(),
                board: chess.board(),
                turn: chess.turn(),
                roundEndsAt: Date.now() + 60000,
                currentVotes: {},
                totalVotesInRound: 0,
                lastMessage: `AI moved ${bestMove}. Your turn to vote.`
            });
        } catch (error) {
            logger.error("Error during AI turn:", error);
            return event.data.after.ref.update({ status: 'ERROR', lastMessage: 'AI failed to make a move.' });
        }
    }
    // --- Human's Turn ---
    else {
        logger.info(`Human player's turn (${gameState.turn}). Starting new vote timer.`);
        // The move has been processed. Now start the next voting round.
        return event.data.after.ref.update({
            status: 'VOTING',
            roundEndsAt: Date.now() + 60000,
            currentVotes: {},
            totalVotesInRound: 0,
        });
    }
});

exports.startGame = onCall({ region: 'europe-west1' }, async(request) => {
  const db = getDatabase();
  const gameStateRef = db.ref("/gamestate");
  const roundDurationMs = 10000
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
      controlled: 'w',
      castlingRights: { w: { kingSide: true, queenSide: true }, b: { kingSide: true, queenSide: true } },
      moveHistory: [],
      currentVotes: {},
      fen: 'RNBQKBNR/PPPPPPPP/8/8/8/8/pppppppp/rnbqkbnr w KQkq - 0 1',
      totalVotesInRound: 0,
      roundEndsAt: Date.now() + roundDurationMs,
      status: "VOTING",
      lastMessage: "New game started. White to move"
  };
  await gameStateRef.set(initialGameState);
  return {success: true, message: "Game started successfully."}




});

