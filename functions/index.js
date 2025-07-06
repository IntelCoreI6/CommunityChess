const { onValueWritten } = require("firebase-functions/v2/database");
const { initializeApp } = require("firebase-admin/app");
const { getDatabase } = require("firebase-admin/database");
const logger = require("firebase-functions/logger");
const { spawn } = require("child_process");
const path = require("path");
const { Chess } = require("chess.js");

// Initialize the Admin SDK once
initializeApp();

// Define the function trigger
exports.chessAI = onValueWritten(
  {
    ref: "/gamestate/turn",
    region: "europe-west1",
    instance: "community-chess-7de3a-default-rtdb",
    // Increase timeout to give Stockfish enough time to run
    timeoutSeconds: 60, 
  },
  async (event) => {
    // Exit if the value was deleted or if it's not AI's turn
    if (!event.data.after.exists() || event.data.after.val() !== "ai") {
      logger.info("Not AI's turn or data deleted, exiting.");
      return null;
    }

    // Prevent the function from running again if it's already the AI's turn
    if (event.data.before.exists() && event.data.before.val() === "ai") {
        logger.info("Function re-triggered on an existing AI turn, exiting to prevent loops.");
        return null;
    }

    const db = getDatabase();
    const gameStateRef = db.ref("/gamestate");

    try {
      const gameStateSnap = await gameStateRef.once("value");
      const gameState = gameStateSnap.val();

      if (!gameState || !gameState.fen) {
        throw new Error("Gamestate or FEN not found in the database.");
      }

      const fen = gameState.fen;
      logger.log("AI received turn. Current FEN:", fen);

      // --- AI LOGIC (Stockfish) ---
      // IMPORTANT: The 'stockfish' file must be a LINUX binary and have execute permissions.
      const stockfishPath = path.join(__dirname, "stockfish");
      const stockfish = spawn(stockfishPath);

      let bestMove = "";

      stockfish.stdout.on("data", (data) => {
        const output = data.toString();
        logger.info("Stockfish stdout:", output);
        if (output.startsWith("bestmove")) {
          bestMove = output.split(" ")[1];
        }
      });

      stockfish.stderr.on("data", (data) => {
        logger.error("Stockfish stderr:", data.toString());
      });

      // Use a promise to handle the async process
      await new Promise((resolve, reject) => {
        stockfish.on("close", (code) => {
          if (code === 0 && bestMove) {
            resolve();
          } else {
            reject(new Error(`Stockfish process exited with code ${code}. Best move was: '${bestMove}'`));
          }
        });

        // Send commands to the engine
        stockfish.stdin.write(`position fen ${fen}\n`);
        stockfish.stdin.write("go movetime 2000\n"); // Think for 2 seconds
        stockfish.stdin.end(); // Close stdin to signal we're done
      });

      if (!bestMove) {
          throw new Error("Stockfish did not return a bestmove.");
      }

      logger.log(`AI chose move: ${bestMove}`);

      // Validate and apply the move using chess.js
      const chess = new Chess(fen);
      const moveResult = chess.move(bestMove, { sloppy: true });

      if (moveResult === null) {
        throw new Error(`Stockfish made an illegal move: ${bestMove} on FEN: ${fen}`);
      }

      // Prepare the update for Firebase
      const newFen = chess.fen();
      const newBoard = chess.board();

      logger.log("Updating database with new FEN:", newFen);
      return gameStateRef.update({
        fen: newFen,
        board: newBoard,
        turn: "w", // Give the turn back to white
        currentVotes: {},
        totalVotesInRound: 0,
      });

    } catch (error) {
      logger.error("Error during AI turn:", error);
      // If something goes wrong, give the turn back to the player to prevent the game from getting stuck.
      return gameStateRef.update({ turn: "w" });
    }
  }
);