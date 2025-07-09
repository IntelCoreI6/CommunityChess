
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