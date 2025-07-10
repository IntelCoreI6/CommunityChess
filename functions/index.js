const { onValueWritten } = require("firebase-functions/v2/database");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const logger = require("firebase-functions/logger");
const { spawn } = require("child_process");
const path = require("path");
const { Chess } = require("chess.js");
const { onRequest } = require("firebase-functions/v2/https");
const { CloudTasksClient } = require('@google-cloud/tasks');
const { secureHeapUsed } = require("crypto");
const { error } = require("console");


initializeApp();


function isPathBlocked(startX, startY, endX, endY, boardState) {
    let x_direction = Math.sign(endX - startX);
    let y_direction = Math.sign(endY - startY);

    let currentX = startX + x_direction;
    let currentY = startY + y_direction;

    while (currentX !== endX || currentY !== endY) {
       // Check the array using [y][x] format
       if (boardState[currentY] && boardState[currentY][currentX] !== 0) {
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

function movePiece(fromX, fromY, toX, toY, boardState) {
    // First, get the piece from the original boardState
    const pieceToMove = boardState[fromY][fromX];
    
    // Then create a copy of the board
    const newBoardState = JSON.parse(JSON.stringify(boardState));
    
    // Move the piece on the copied board
    newBoardState[toY][toX] = pieceToMove;
    newBoardState[fromY][fromX] = 0;
    
    return newBoardState;
}

function updateCastlingRights(move, piece, currentRights) {
    const newRights = JSON.parse(JSON.stringify(currentRights)); // Deep copy
    const pieceType = piece[1];
    const pieceColor = piece[0];

    // If king moves, lose both side castling rights
    if (pieceType === 'k') {
        if (pieceColor === 'w') {
            newRights.w.K = false;
            newRights.w.Q = false;
        } else {
            newRights.b.k = false;
            newRights.b.q = false;
        }
    }

    // If a rook moves, lose castling rights on that side
    if (pieceType === 'r') {
        if (pieceColor === 'w') {
            if (move.fromX === 0 && move.fromY === 7) newRights.w.Q = false; // a1 rook
            if (move.fromX === 7 && move.fromY === 7) newRights.w.K = false; // h1 rook
        } else { // black rook
            if (move.fromX === 0 && move.fromY === 0) newRights.b.q = false; // a8 rook
            if (move.fromX === 7 && move.fromY === 0) newRights.b.k = false; // h8 rook
        }
    }

    return newRights;
}

async function log(...args) {
    // Convert all arguments to a single string, handling objects and errors
    const message = args.map(arg => {
        if (typeof arg === 'object' && arg !== null) {
            // Stringify objects to see their content, especially helpful for errors
            return JSON.stringify(arg, Object.getOwnPropertyNames(arg));
        }
        return arg;
    }).join(' '); // Join arguments with a space

    logger.info(message); // Log the full, detailed message to Cloud Logging
    const db = getDatabase();
    const gameStateRef = db.ref("/gamestate");
    try {
        await gameStateRef.update({
            lastMessage: `SERVER: ${message}`
        });
    } catch (error) {
        logger.error("Failed to update lastMessage:", error);
    }
}
async function scheduleRoundProcessing(roundEndsAt) {
    const client = new CloudTasksClient();
    const project = 'community-chess-7de3a'; // Your project ID
    const location = 'europe-west1'; // The region of your function
    const queue = 'processRound-queue'; // A name for your queue

    const parent = client.queuePath(project, location, queue);

    const url = `https://europe-west1-community-chess-7de3a.cloudfunctions.net/processRound`;
    
    const serviceAccountEmail = `${project}@appspot.gserviceaccount.com`;

    const task = {
        httpRequest: {
            httpMethod: 'POST',
            url: url,
            oidcToken: {
                serviceAccountEmail : serviceAccountEmail
            }
        },
        scheduleTime: {
            seconds: Math.floor(roundEndsAt / 1000)
        }
    };

    try {
        await client.createTask({ parent, task });
        log(`Task scheduled to process round at ${new Date(roundEndsAt).toISOString()}`);
    } catch (error) {
        logger.error("Error scheduling task:", error);
        log("Error scheduling task:", error);

    }
}
// ... (put this near your other helper functions like isMoveValid) ...

function boardToFen(board, turn, castlingRights, enPassantTarget) {
    let fen = '';
    for (let y = 0; y < 8; y++) {
        let empty = 0;
        for (let x = 0; x < 8; x++) {
            const piece = board[y][x];
            if (piece === 0) {
                empty++;
            } else {
                if (empty > 0) {
                    fen += empty;
                    empty = 0;
                }
                const color = piece[0];
                const type = piece[1];
                fen += (color === 'w' ? type.toUpperCase() : type.toLowerCase());
            }
        }
        if (empty > 0) {
            fen += empty;
        }
        if (y < 7) {
            fen += '/';
        }
    }

    fen += ` ${turn}`;

    let castling = '';
    if (castlingRights.w.K) castling += 'K';
    if (castlingRights.w.Q) castling += 'Q';
    if (castlingRights.b.k) castling += 'k';
    if (castlingRights.b.q) castling += 'q';
    fen += ` ${castling || '-'}`;
    
    // --- FIX IS HERE ---
    // Use the enPassantTarget from the game state, or '-' if there is none.
    fen += ` ${enPassantTarget || '-'}`;

    // For simplicity, we'll use placeholders for halfmove and fullmove
    fen += ' 0 1';
    return fen;
}

async function stockfish(fen) {
    const stockfishPath = path.join(__dirname, "stockfish");
    const stockfish = spawn(stockfishPath);
    let bestMove = "";
    let allOutput = "";

    stockfish.stdout.on("data", (data) => {
        const output = data.toString();
        allOutput += output;
        const lines = allOutput.split('\n');
        lines.forEach(line => {
            if (line.startsWith("bestmove")) {
            bestMove = line.split(" ")[1];
                }
        });
        allOutput = lines[lines.length - 1];

    });

    await new Promise((resolve, reject) => {
        stockfish.on("close", (code) => {
            if (code === 0 && bestMove) {
                resolve();
            } else {
                // Provide more details in the rejection error
                reject(new Error(`Stockfish process exited with code ${code}. Best move was ${bestMove ? "found" : "not found"}.`));
            }
        });
        stockfish.stdin.write(`position fen ${fen}\n`);
        stockfish.stdin.write(`go movetime 1000\n`); // Ask stockfish to think for 1 second
    });
    return bestMove
}

async function stockfish_api(fen, depth) {
    const apiUrl = `https://stockfish.online/api/s/v2.php?fen=${encodeURIComponent(fen)}&depth=${depth}`;
    log("Calling Stockfish API:", apiUrl);

    const response = await fetch(apiUrl);
    if (!response.ok) {
        throw new Error(`Stockfish API failed with status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.success || !data.bestmove) {
        throw new Error(`Stockfish API returned an error or no best move. Response: ${JSON.stringify(data)}`);
    }

    return data.bestmove;
}


exports.processRound = onRequest({ region: "europe-west1" }, async (req, res) => {
    try {
        log("processRound was triggered by a Cloud Task.");
        const db = getDatabase();
        const gameStateRef = db.ref("/gamestate");
        const gameStateSnap = await gameStateRef.once("value");
        const gameState = gameStateSnap.val();
        let newBoardState = [];
        let parts = [];


        // Add a check to prevent re-processing
        if (!gameState) {
            log("No game state found. Exiting.");
            res.status(200).send("No game state found.");
            return;
        }
        if (gameState.status !== "VOTING") {
            log("Round already processed. Exiting.");
            res.status(200).send("Round already processed.");
            return;
        }

        // --- All the logic from your old processFinishedRounds function goes here ---
        const votes = gameState.currentVotes;
        if (!votes || Object.keys(votes).length === 0) {
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
        parts = winningMoveKey.split('-').map(Number);
        log(`parts: ${parts}, fromx_value ${parts[0]}`)
        const move = {
            fromX: parts[0],
            fromY: parts[1],
            toX: parts[2],
            toY: parts[3]
        };
        log("trying to move piece")
        try {
        // 4. Apply the winning move to the board using chess.js.
        newBoardState = movePiece(move.fromX, move.fromY, move.toX, move.toY, gameState.board)
        }
        catch(error) {
            log("error while trying to move piece:", error)
        }
        

        // 5. Check if the move was legal.
        log("checking if move is legal")
        if (isMoveValid(move.fromX, move.fromY, move.toX, move.toY, gameState.board) ==  false) {
            log(`Winning move ${winningMoveKey} was illegal. Resetting round.`)
            logger.error(`Winning move ${winningMoveKey} was illegal. Resetting round.`);
            const roundEndsAt = Date.now() + 30000
            await scheduleRoundProcessing(roundEndsAt)
            return gameStateRef.update({
                currentVotes: {},
                totalVotesInRound: 0,
                roundEndsAt: roundEndsAt,
                lastMessage: `The winning move (${winningMoveKey}) was illegal. Please vote again.`
            });
        }
        else {
            log("valid move :check:")
        }

        log("Applying winning move and updating board state.");
        // Update the gamestate with the new position.
        let enPassantTarget = null;
        const piece = gameState.board[move.fromY][move.fromX];
        // If a pawn moved two squares...
        if (piece[1] === 'p' && Math.abs(move.toY - move.fromY) === 2) {
            const columns = "abcdefgh";
            // The target square is the one "behind" the pawn
            const enPassantY = (move.fromY + move.toY) / 2;
            enPassantTarget = columns[move.fromX] + (8 - enPassantY);
            log("New en passant target square:", enPassantTarget);
        }
        const newCastlingRights = updateCastlingRights(move, piece, gameState.castlingRights)
        log("Castling rights updated:", newCastlingRights);


        return gameStateRef.update({
            status: "PROCESSING_MOVE",
            board: newBoardState,
            turn: gameState.turn === 'w' ? 'b' : 'w',
            lastMessage: `Community chose ${winningMoveKey}.`,
            currentVotes: {},
            totalVotesInRound: 0,
            castlingRights: newCastlingRights,
            enPassantTarget: enPassantTarget,
        });

    } catch (error) {
        logger.error("Error in processRound:", error);
        // Log the actual error details, not just "error"
        log("Error in processRound:", error.message, error.stack);
        res.status(500).send("Internal Server Error");
    }
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

exports.handleTurnChange = onValueWritten({ref:"/gamestate", region:"europe-west1"}, async (event) => {
    const gameState = event.data.after.val();
    const oldGameState = event.data.before.val();

    // Only act if the status has just been set to 'PROCESSING_MOVE'.
    if (!gameState || gameState.status !== 'PROCESSING_MOVE' || oldGameState.status === 'PROCESSING_MOVE') {
        return null;
    }

    // --- AI's Turn ---
    if (gameState.turn !== gameState.controlled) {
        log(`AI's turn (${gameState.turn}). Running Stockfish.`);
        try {
            const fen = boardToFen(gameState.board, gameState.turn, gameState.castlingRights, gameState.enPassantTarget);
            log(fen)
            
            try {
                const stockfishResponse = await stockfish_api(fen, 15);
                log("stockfishResponse:", stockfishResponse);
                const bestMove = stockfishResponse.split(" ")[1];
                log("bestmove:", bestMove);
            } catch (error) {
                log(`Error occured while trying to fetch stockfish_api: ${error}`)
            }
            
            const fromX = bestMove.charCodeAt(0) - 'a'.charCodeAt(0);
            const fromY = 8 - parseInt(bestMove[1]);
            const toX = bestMove.charCodeAt(2) - 'a'.charCodeAt(0);
            const toY = 8 - parseInt(bestMove[3]);

            const aiMove = {fromX, fromY, toX, toY};
            log(aiMove)
            const pieceMovedByAI = gameState.board[fromY][fromX]
            const newCastlingRights = updateCastlingRights(aiMove, pieceMovedByAI, gameState.castlingRights);
            
            let enPassantTargetForNextTurn = null;
            if (pieceMovedByAI && pieceMovedByAI[1] === 'p' && Math.abs(toY - fromY) === 2) {
                const columns = "abcdefgh";
                const enPassantY = (fromY + toY) / 2;
                enPassantTargetForNextTurn = columns[fromX] + (8 - enPassantY);
                log("AI created new en passant target:", enPassantTargetForNextTurn);
            }
            const newBoardState = movePiece(fromX, fromY, toX, toY, gameState.board);
            // AI has moved. Now it's the human's turn again. Start a new voting round.
            const roundEndsAt = Date.now() + 30000
            await scheduleRoundProcessing(roundEndsAt);
            log("updating gamestate, with AI move")
            return event.data.after.ref.update({
                status: 'VOTING',
                board: newBoardState,
                turn: gameState.turn === 'w' ? 'b' : 'w',
                roundEndsAt: roundEndsAt,
                currentVotes: {},
                totalVotesInRound: 0,
                lastMessage: `AI moved ${bestMove}. Your turn to vote.`,
                castlingRights: newCastlingRights,
                enPassantTarget: enPassantTargetForNextTurn
            });
        } catch (error) {
            logger.error("Error during AI turn:", error);
            log("Error during AI turn:", error);
            return event.data.after.ref.update({ status: 'ERROR', lastMessage: `Ai failed to make move: ${error}` });
        }
    }
    // --- Human's Turn ---
    else {
        logger.info(`Human player's turn (${gameState.turn}). Starting new vote timer.`);
        // The move has been processed. Now start the next voting round.
        const roundEndsAt = Date.now() + 60000;
        await scheduleRoundProcessing(roundEndsAt);
        return event.data.after.ref.update({
            status: 'VOTING',
            roundEndsAt: roundEndsAt,
            currentVotes: {},
            totalVotesInRound: 0,
        });
    }
});

exports.startGame = onCall({ region: 'europe-west1' }, async(request) => {
    const db = getDatabase();
    const gameStateRef = db.ref("/gamestate");
    const roundDurationMs = 10000
    const roundEndsAt = Date.now() + roundDurationMs;
    await scheduleRoundProcessing(roundEndsAt);

    const initialGameState = {
        board: [
            ['br', 'bn', 'bb', 'bq', 'bk', 'bb', 'bn', 'br'],
            ['bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp'],
            [0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0],
            [0, 0, 0, 0, 0, 0, 0, 0],
            ['wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp'],
            ['wr', 'wn', 'wb', 'wq', 'wk', 'wb', 'wn', 'wr'] // <-- This was the extra 9th row, now removed
        ],
        turn: 'w',
        controlled: 'w', // The color the community plays
        status: "VOTING",
        lastMessage: "New game started. White to move.",
        roundEndsAt: roundEndsAt,
        currentVotes: {},
        totalVotesInRound: 0,
        castlingRights: { w: { K: true, Q: true }, b: { k: true, q: true } },
        enPassantTarget: null
    };
    await gameStateRef.set(initialGameState);
    return {success: true, message: "Game started successfully."}




});

