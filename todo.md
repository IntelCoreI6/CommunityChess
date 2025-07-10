# Community Chess Project Checklist

## Critical Fixes

- [x] Initialize castlingRights and enPassantTarget in startGame function
- [x] Fix "AI failed to make move" error
- [ ] Prevent handleTurnChange from running multiple times for the same state
- [x] Fix pieceMovedByAI variable declaration (currently missing var/let/const)
- [ ] Properly detect and handle game end conditions (checkmate, stalemate)

## Move Validation

- [ ] Add en passant capture logic to isMoveValid function
- [ ] Add castling move logic to isMoveValid function
- [ ] Add pawn promotion logic to movePiece function
- [ ] Fix issue where the same move is valid in castVote but invalid in processRound

## UI Improvements

- [ ] Add visual feedback for selected pieces (highlight source square)
- [ ] Add visual feedback for illegal moves
- [ ] Show check/checkmate status in the UI
- [ ] Add game history/move log display
- [ ] Add piece promotion UI for pawns reaching the back rank

## AI & Game Logic

- [ ] Improve error handling in AI move generation
- [ ] Add support for capturing via en passant
- [ ] Add support for castling moves
- [ ] Implement proper game end detection

## Polish & Quality of Life

- [ ] Add clear indicators for whose turn it is
- [ ] Add option to change difficulty of AI
- [ ] Add option to play as black
- [ ] Add proper game reset functionality
- [ ] Add a loading state when the AI is thinking
- [ ] Add sound effects for moves, captures, check, etc.

## Performance & Stability

- [ ] Optimize database reads/writes
- [ ] Add better error logging
- [ ] Fix issues with the roundEndsAt timer
- [ ] Add automatic recovery from error states

## Documentation

- [ ] Add comments to explain complex logic
- [ ] Create a README with setup instructions
- [ ] Document the Firebase