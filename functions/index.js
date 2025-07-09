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


exports.processFinishedRounds = onSchedule("every 5 seconds", async (event) => {
    const db = getDatabase();
    const gameStateRef = db.ref("/gamestate");
    const gameStateSnap = await gameStateRef.once("value");
    const gameState = gameStateSnap.val();
    const now = Date.now()
    if (gameState && gameState.status == "VOTING" && (now > gameState.roundEndsAt)) {
        logger.log(`Round has ended. Processing results`);
        //round over
        const votes = gameState.currentVotes;
        logger.log('votes:', votes)

        if (!votes || Object.keys(votes).length === 0) {
            logger.log("No votes cast. Passing turn to the other player.");
            // Pass the turn if no one voted.
            return gameStateRef.update({
                turn: gameState.turn === 'w' ? 'b' : 'w',
                roundEndsAt: Date.now() + 10000, // Stop the timer
                status: "PROCESSING_MOVE"

            });
        }
        let winningMove = "";
        let maxVotes = 0;
        for (const move in votes) {
          if (votes[move] > maxVotes) {
            winningMove = move;
            maxVotes = votes[move]
          }

        }

    
        logger.log(`Winning move is ${winningMove} with ${maxVotes} votes.`);

        // 4. Apply the winning move to the board using chess.js.
        const chess = new Chess(gameState.fen);

        // 5. Check if the move was legal.
        if (chess.move(winningMove, { sloppy: true }) === null) {
            logger.error(`Winning move ${winningMove} was illegal. Resetting round.`);
            return gameStateRef.update({
                currentVotes: {},
                totalVotesInRound: 0,
                roundEndsAt: Date.now() + 60000, // Give them another minute
                lastMessage: `The winning move (${winningMove}) was illegal. Please vote again.`
            });
        }

        logger.log("Applying winning move and updating board state.");
        // Update the gamestate with the new position.
        return gameStateRef.update({
            status: "PROCESSING_MOVE",
            fen: chess.fen(),
            board: chess.board(),
            turn: chess.turn(), // This will trigger the handleTurnChange function for the next player
            lastMessage: `Community chose ${winningMove}.`
        });
    }

    // If the condition is false, it means no round is active or the timer hasn't finished.
    // In that case, do nothing.
    logger.info("No finished rounds to process.");
    return null;
});

exports.castVote = onCall({ region: 'europe-west1' }, async (request) => {
  // The data sent from the client is in request.data
  const move = request.data.move;

  // You can add validation here to make sure the move is valid
  if (!move || typeof move !== 'string') {
    // Throwing an error will send a failure response back to the client
    throw new HttpsError('invalid-argument', 'The function must be called with a "move" argument.');
  }

  const db = getDatabase();
  const gameStateRef = db.ref("/gamestate");
  const gameState = (await gameStateRef.once("value")).val()
    if (!gameState) {
    throw new HttpsError('not-found', 'The game state could not be found. The game may need to be reset.');
  }
  if (gameState.status !== "VOTING"){
    throw new HttpsError("failed-precondition", "Not currently in a voting round.")
  }
  if (new Chess(gameState.fen).move(move, {sloppy: true}) === null) {
    throw new HttpsError('invalid-argument', 'The move is illegal.');

  }
  const voteRef = db.ref(`/gamestate/currentVotes/${move}`);
  const totalVotesRef = db.ref('/gamestate/totalVotesInRound');
  await voteRef.transaction((v) => (v || 0) + 1);
  await totalVotesRef.transaction((v) => (v || 0) + 1);

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
      fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
      totalVotesInRound: 0,
      roundEndsAt: Date.now() + roundDurationMs,
      status: "VOTING",
      lastMessage: "New game started. White to move"
  };
  await gameStateRef.set(initialGameState);
  return {success: true, message: "Game started successfully."}




});

