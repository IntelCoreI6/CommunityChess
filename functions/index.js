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
exports.handleTurnChange = onValueWritten(
  {
    ref: "/gamestate/turn",
    region: "europe-west1",
    instance: "community-chess-7de3a-default-rtdb",
    timeoutSeconds: 60,
  },
  async (event) => {
    // Exit if turn was deleted or didn't change
    if (!event.data.after.exists() || event.data.before.val() === event.data.after.val()) {
      return null;
    }

    const db = getDatabase();
    const gameStateRef = db.ref("/gamestate");
    const gameStateSnap = await gameStateRef.once("value");
    const gameState = gameStateSnap.val();

    if (!gameState) {
      logger.error("Gamestate not found!");
      return null;
    }

    // --- This is YOUR correct logic ---
    // Check if the current turn's color is controlled by a human player.
    if (gameState.turn === gameState.controlled) {
      // --- It's a HUMAN's turn. Start the timer. ---
      logger.info(`Human player's turn (${gameState.turn}). Starting vote timer.`);
      const roundDurationMs = 60000; // 60 seconds
      const deadline = Date.now() + roundDurationMs;
      
      return gameStateRef.update({
        roundEndsAt: deadline,
        currentVotes: {},
        totalVotesInRound: 0,
      });

    } else {
      // --- It's the AI's turn. Run the Stockfish logic. ---
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
        const moveResult = chess.move(bestMove, { sloppy: true });

        if (moveResult === null) throw new Error(`Stockfish made illegal move: ${bestMove}`);

        logger.log(`AI chose move: ${bestMove}. Updating database.`);
        return gameStateRef.update({
          fen: chess.fen(),
          board: chess.board(),
          turn: chess.turn(), // This correctly sets the turn to 'w' or 'b'
        });

      } catch (error) {
        logger.error("Error during AI turn:", error);
        // Failsafe: Give the turn back to the human to prevent a stuck game.
        return gameStateRef.update({ turn: gameState.controlled });
      }
    }
  }
);


exports.processFinishedRounds = onSchedule("every 2 seconds", async (event) => {
    const db = getDatabase();
    const gameStateRef = db.ref("/gamestate");
    const gameStateSnap = await gameStateRef.once("value");
    const gameState = gameStateSnap.val();
    const now = Date.now()
    if (gameState && gameState.roundEndsAt && (now > gameState.roundEndsAt || gameState.roundEndsAt == 0)) {
        logger.log("Round has ended. Processing votes...");
        //round over
        const votes = gameState.currentVotes;

        if (!votes || Object.keys(votes).length === 0) {
            logger.log("No votes cast. Passing turn to the other player.");
            // Pass the turn if no one voted.
            return gameStateRef.update({
                turn: gameState.turn === 'w' ? 'b' : 'w',
                roundEndsAt: 0 // Stop the timer
            });
        }
        let winningMove = "";
        let maxVotes = 0;
        for (const move in votes) {
          if (votes[move] > maxVotes)
            winningMove = votes[move];
            maxvotes = move
        }

    
        logger.log(`Winning move is ${winningMove} with ${maxVotes} votes.`);

        // 4. Apply the winning move to the board using chess.js.
        const chess = new Chess(gameState.fen);
        const moveResult = chess.move(winningMove, { sloppy: true });

        // 5. Check if the move was legal.
        if (moveResult === null) {
            logger.error(`Winning move ${winningMove} was illegal. Resetting round.`);
            return gameStateRef.update({
                currentVotes: {},
                totalVotesInRound: 0,
                roundEndsAt: Date.now() + 60000 // Give them another minute
            });
        }

        logger.log("Applying winning move and updating board state.");
        // Update the gamestate with the new position.
        return gameStateRef.update({
            fen: chess.fen(),
            board: chess.board(),
            turn: chess.turn(), // This will trigger the handleTurnChange function for the next player
            currentVotes: {},
            totalVotesInRound: 0,
            roundEndsAt: 0 // Reset the timer. The next turn will set a new one.
        });
    }

    // If the condition is false, it means no round is active or the timer hasn't finished.
    // In that case, do nothing.
    logger.info("No finished rounds to process.");
    return null;
});

exports.castVote = onCall({ region: 'europe-west1' }, async (request) => {
  // The data sent from the client is in request.data
  const moveKey = request.data.move;

  // You can add validation here to make sure the move is valid
  if (!moveKey || typeof moveKey !== 'string') {
    // Throwing an error will send a failure response back to the client
    throw new HttpsError('invalid-argument', 'The function must be called with a "move" argument.');
  }

  const db = getDatabase();
  const voteRef = db.ref(`/gamestate/currentVotes/${moveKey}`);
  const totalVotesRef = db.ref('/gamestate/totalVotesInRound');

  try {
    // Use a transaction to safely increment the vote counts
    await voteRef.transaction((currentVotes) => {
      return (currentVotes || 0) + 1;
    });

    await totalVotesRef.transaction((currentTotal) => {
      return (currentTotal || 0) + 1;
    });

    logger.info(`Vote cast successfully for ${moveKey}`);
    // Return a success message to the client
    return { success: true, message: `Vote for ${moveKey} recorded.` };

  } catch (error) {
    logger.error("Error while casting vote:", error);
    // Throw a generic error if something goes wrong
    throw new HttpsError('internal', 'An error occurred while casting the vote.');
  }
});



exports.startGame = onCall({region: 'europe-west1'}, async(request) => {
  const db = getDatabase();
  const gameStateRef = db.ref("/gamestate");
  const gameStateSnap = await gameStateRef.once("value");
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
      roundEndsAt: Date.now() + roundDurationMs 
  };
  await gameStateRef.set(initialGameState);
  return {success: true, message: "Game started successfully."}




});

