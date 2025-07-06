

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

let votes = {}
let total_votes = 0
let moving = false
let selected_piece = null
board.addEventListener('click', function(event){
    if (event.target.classList.contains('block') && moving == false)  {
    let clickedSquare = event.target;

    // Now you can access properties of the clicked square
    console.log('Clicked square:', clickedSquare);
    let coo = clickedSquare.dataset.x + clickedSquare.dataset.y
    if (coo in votes) {
        votes[coo]++;
    }
    else {
        votes[coo] = 1
    }
    total_votes++
    
    console.log(`Added 1 vote to ${coo}`)
    display_voting(votes, total_votes)
    

}
else if (event.target.classList.contains('block') && moving == true)  {
    move_piece(selected_piece, event.target)
}
else if (event.target.classList.contains('piece')) {
    moving = true
    selected_piece = event.target
    
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


function piece_generation() {
    const initialSetup = [
        ['br', 'bn', 'bb', 'bq', 'bk', 'bb', 'bn', 'br'], 
        ['bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp', 'bp'], 
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        [null, null, null, null, null, null, null, null],
        ['wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp', 'wp'], 
        ['wr', 'wn', 'wb', 'wq', 'wk', 'wb', 'wn', 'wr']  
    ];
for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 8; col++) {
            const piece = initialSetup[row][col];

            if (piece) {
                // Create an image element for the piece
                let pieceElement = document.createElement('img');
                pieceElement.className = 'piece';
                pieceElement.dataset.type = piece


                // Set the image source
                pieceElement.src = `pieces/${piece}.png`; // Assuming images are in "pieces" folder

                // Determine the square to place the piece on
                let square = document.querySelector(`[data-x="${letters[col]}"][data-y="${row + 1}"]`);

                if (square) {
                    square.appendChild(pieceElement);
                }
            }
        }
    }
}

function isPathBlocked(start_x_index, start_y, end_x_index, end_y) {
    let x_direction = 0;
    let y_direction = 0;
    if (start_x_index < end_x_index) {
        x_direction = 1
    }
    else if (start_x_index > end_x_index) {
        x_direction = -1
    }

    if (start_y < end_y) {
        y_direction = 1
    }
    else if (start_y > end_y) {
        y_direction = -1
    }
    let current_x = start_x_index + x_direction;
    let current_y = start_y + y_direction;
    while (current_x != end_x_index || current_y != end_y) {
        let x = letters[current_x];
        let y = current_y;
        let square = document.querySelector(`[data-x="${x}"][data-y="${y}"]`);
            if (square.hasChildNodes()) {
                console.log("path is blocked")
                console.log(`destination: x${end_x_index} y:${end_y} `)
                console.log(`direction: x${x_direction} y:${y_direction} `)
                console.log(`a piece is blocking this coordinate: ${current_x} ${current_y} `)
                return true;
            }
        current_x += x_direction
        current_y += y_direction
    }
    return false;
}


function move_piece(piece, destination) {
    let type = piece.dataset.type[1]
    let start_x = piece.parentElement.dataset.x 
    let start_y = piece.parentElement.dataset.y
    let end_x = destination.dataset.x
    let end_y = destination.dataset.y
    let start_x_index = letters.indexOf(start_x)
    let end_x_index = letters.indexOf(end_x)
    let start_y_index = parseInt(start_y)
    let end_y_index = parseInt(end_y)
    let color = piece.dataset.type[0]
    let direction = (color == "w") ? -1 : 1
    if (type == "p") {
        if (start_x_index == end_x_index && end_y_index == start_y_index + direction) {
            destination.appendChild(piece)
            moving = false
        }
        else {
            moving = false
        }
        }
    if (type == "r") {
        console.log("rook movement activated")
        if ((start_x_index == end_x_index || start_y == end_y) && isPathBlocked(start_x_index, start_y_index, end_x_index, end_y_index) == false) {
            destination.appendChild(piece)
            moving = false
        }
        else {
            moving = false
        }
    }
    if (type == "b")
        if ((Math.abs(start_x_index-end_x_index)==Math.abs(start_y-end_y)) && isPathBlocked(start_x_index, start_y_index, end_x_index, end_y_index) == false){
            destination.appendChild(piece)
            moving = false
        }
        else {
            console.log("moving failed")
            moving = false
        }


    }

piece_generation();