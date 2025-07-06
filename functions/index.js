// Import the new V2 function type for Realtime Database
const { onValueWritten } = require("firebase-functions/v2/database");

const admin = require("firebase-admin");
const { spawn } = require("child_process");
const path = require("path");
const { Chess } = require("chess.js");

admin.initializeApp();

// This is the new V2 syntax for defining a Realtime Database trigger
// We have added an options object to specify the region and database instance.
exports.chessAI = onValueWritten(
  {
    ref: "/gamestate/turn",
    // *** IMPORTANT: Replace "YOUR_DATABASE_REGION" with your actual database region! ***
    // For example: "" or "us-central1"
    region: "europe-west1",
    // This should match your database instance name from the Firebase console.
    instance: "community-chess-7de3a-default-rtdb",
  },
  async (event) => {
    // In V2, the data is in event.data.before and event.data.after
    const turn = event.data.after.val();

    // Only run if the 'turn' was changed TO 'ai'
    if (turn !== "ai") {
      console.log("Not AI's turn, exiting.");
      return null;
    }

    const gameStateRef = admin.database().ref("/gamestate");
    const gameStateSnap = await gameStateRef.once("value");
    const gameState = gameStateSnap.val();
    const fen = gameState.fen;

    console.log("AI received turn. Current FEN:", fen);

    try {
      // --- AI LOGIC BEGINS ---
      const stockfishPath = path.join(__dirname, "stockfish");
      const stockfish = spawn(stockfishPath);

      let bestMove = "";

      // Listen for the engine's output
      stockfish.stdout.on("data", (data) => {
        const output = data.toString();
        console.log("Stockfish says:", output);
        if (output.startsWith("bestmove")) {
          bestMove = output.split(" ")[1];
        }
      });

      // Handle any errors from the engine
      stockfish.stderr.on("data", (data) => {
        console.error(`Stockfish error: ${data}`);
      });

      // Send commands to the engine
      stockfish.stdin.write(`position fen ${fen}\n`);
      stockfish.stdin.write("go movetime 2000\n"); // Think for 2 seconds

      // Wait for the engine to find a move
      await new Promise((resolve, reject) => {
        stockfish.on("close", (code) => {
          if (code === 0 && bestMove) {
            resolve();
          } else {
            reject(new Error(`Stockfish exited with code ${code}`));
          }
        });
        // Add a timeout in case the engine hangs
        setTimeout(() => reject(new Error("Stockfish timeout")), 5000);
      });

      // --- AI LOGIC ENDS ---

      console.log(`AI chose move: ${bestMove}`);

      // Validate and apply the move using chess.js
      const chess = new Chess(fen);
      const moveResult = chess.move(bestMove, { sloppy: true });

      if (moveResult === null) {
        throw new Error("Stockfish made an illegal move: " + bestMove);
      }

      // Prepare the update for Firebase
      const newFen = chess.fen();
      const newBoard = chess.board(); // chess.js provides the updated board array
      // Update the database with the AI's move
      return gameStateRef.update({
        fen: newFen,
        board: newBoard,
        turn: "w", // Give the turn back to white
        // Reset votes for the next round
        currentVotes: {},
        totalVotesInRound: 0,
      });
    } catch (error) {
      console.error("Error during AI turn:", error);
      // If something goes wrong, give the turn back to the player
      // to prevent the game from getting stuck.
      return gameStateRef.update({ turn: "w" });
    }
  }
);
