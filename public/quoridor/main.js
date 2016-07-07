window.jQuery = window.$ = require("jquery") // Ensure bootstrap dependency
var io = require("socket.io-client");


// Escaping functions
function escapeHTML (str) {
    var div = document.createElement("div");
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
};

function unescapeHTML (escapedStr) {
    // Unsafe on untrusted strings, use only on trusted
    var div = document.createElement("div");
    div.innerHTML = escapedStr;
    var child = div.childNodes[0];
    return child ? child.nodeValue : "";
};

function scrollBottom () {
    $('#chatMessages').scrollTop($('#chatMessages')[0].scrollHeight);
}

// On page ready
var socket = io("/quoridor");
$( document ).ready(function () {
    // Init socket on quoridor namespace
    
    
    // Emit room name to join relevant room
    var urlPath = window.location.pathname.split("/");
    var room = urlPath[urlPath.length - 1];
    
    socket.on("disconnect", function() {
        //alert("disconnect")
    })
    
    socket.on("connect", function() {
        socket.emit("sv:room", room);
        socket.emit("game:refreshState", "");
    })
    
    socket.on("reconnect", function() {
        //alert("reconnect")
    })
    
    // Server makes you redirect; does it need extra checks? i.e. auth
    socket.on("sv:redirect", function (data) {
        if (data.redirect) {
            window.location.replace("/quoridor");
        }
    });
    
    socket.on("sv:updatename", function (data) {
        // Update the name header
        $("#nameHeader").html(escapeHTML(data));
    });
    
    
    socket.on("game:receiveState", function (data) {
        // Reassign gameState to the server issued state
        gameState = data;
        
        // Print remaining wall dialogue
        if (gameState.activePlayer === Player.RED) 
            changeGameText(gameState.activePlayer + "'S TURN (" + gameState.redRemainingWalls + " WALLS REMAINING)");
        else 
            changeGameText(gameState.activePlayer + "'S TURN (" + gameState.bluRemainingWalls + " WALLS REMAINING)");

		// Check if red or blu wins
		if (gameState.redY === 0) {
            GameText("RED WINS! RESTART?"); 
			gameState.currentStatus = GameStatus.RED_WON;
		}
		else if (gameState.bluY === ROWS-1) {
			changeGameText("BLUE WINS! RESTART?"); 
			gameState.currentStatus = GameStatus.BLU_WON;
		}
	
        // gameState object changed, redraw all
        redrawAll();
    });
    
    
    // Init history
    // What happens if dc (e.g. no wifi) and reconnect? do we need to clear the #chatMessages pane? (i.e. will it send the whole block again) What if the room whiffs since there's no one in it?
    socket.on("chat:recent", function (data) {
        // assumes data is an array
        data.forEach(function (item) {
            var r = JSON.parse(item);
            var msg = "<div><b>" + escapeHTML(r.name) + "</b>: " + escapeHTML(r.msg) + "</div>";
            $("#chatMessages").append(msg);
            scrollBottom();
        });
    });
    
    // On message received from server
    socket.on("chat:message", function (data) {
        var r = JSON.parse(data);
        var msg = "<div><b>" + escapeHTML(r.name) + "</b>: " + escapeHTML(r.msg) + "</div>";
        $("#chatMessages").append(msg);
        scrollBottom();
    });
    
    // On chatForm submit
    $("#chatForm").submit(function () {
        // Do not emit if input is empty
        if ($("#chatInput").val().match(/^[\s]*$/) !== null) {
            return false;
        }
        
        // Send the message to the server
        socket.emit("io:message", $("#chatInput").val());
        // Clear input for next message
        $("#chatInput").val("");
        return false;
    });
    
    // On change name submit
    $("#changeNameForm").submit(function () {
        // Do not emit if input is empty
        if ($("#nameInput").val().match(/^[\s]*$/) !== null) {
            return false;
        }
        
        // Send the message to the server
        socket.emit("sv:namechange", $("#nameInput").val());
        // Close the modal
        $("#changeNameModal").modal("toggle");
        return false;
    });
});


// ------ GAME CONSTANTS ------

// Number of ROWS and COLS
var COLS = 9; // ROWS by COLS cells
var ROWS = 9;

// Javascript implementation of Enums. Could possibly use http://www.2ality.com/2016/01/enumify.html
var UDLR = { UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT' };
var Direction = { VERTICAL: 'VERTICAL', HORIZONTAL: 'HORIZONTAL'};
var Player = { RED: 'RED', BLU: 'BLUE', EMPTY: 'EMPTY'};
var GameStatus = { PLAYING: 'PLAYING', RED_WON: 'RED_WON', BLU_WON: 'BLU_WON'};

var gameState = {};


// ------ FORMATTING CONSTANTS ------

// Named-varants of the various dimensions used for graphics drawing
var CELL_SIZE = 50; // cell width and height (square)
var CANVAS_WIDTH = CELL_SIZE * COLS;  // the drawing canvas
var CANVAS_HEIGHT = CELL_SIZE * ROWS;

// Players (circles) are displayed inside a cell, with padding from border
var CIRCLE_RADIUS = 15; // width/height
var CIRCLE_LINEWIDTH = 2; // pen stroke width

// Grid drawing constants
var GRIDLINE_WIDTH = 3;
var GRIDLINE_COLOR = "#ddd";

// Wall drawing constants
var WALL_STROKE_WIDTH = 4; // wall stroke width
var WALL_PADDING = 4; // wall padding

// Notation constants
var NOTATION_PADDING = 35;
var TEXT_OFFSET_X = 55, TEXT_OFFSET_Y = 25;


// titleText canvas contexts
var titleText = document.getElementById('title-text');
titleText.width = NOTATION_PADDING + CANVAS_WIDTH;
titleText.height = NOTATION_PADDING * 1.5;

var titleTextContext = titleText.getContext('2d');
titleTextContext.font = "26px Futura";
titleTextContext.fillText("QUORIDOR", 190, TEXT_OFFSET_Y);


// Left column notation canvas contexts
var leftNotation = document.getElementById('left-notation');
leftNotation.width = NOTATION_PADDING;
leftNotation.height = CANVAS_HEIGHT;

var leftContext = leftNotation.getContext('2d');
leftContext.font = "26px Arial";

for (var i=0; i < ROWS; i++) { 
    leftContext.fillText(9-i, 10, 35+i*CELL_SIZE);
};


// Bottom row notation canvas contexts
var botNotation = document.getElementById('bot-notation');
botNotation.width = NOTATION_PADDING + CANVAS_WIDTH;
botNotation.height = NOTATION_PADDING;

var botContext = botNotation.getContext('2d');
botContext.font = "26px Arial";

for (var i=0; i < ROWS; i++) {  
    botContext.fillText(String.fromCharCode(65+i), 55+i*CELL_SIZE, 25);
};


// Game text canvas contexts
var gameText = document.getElementById('game-text');
gameText.width = NOTATION_PADDING + CANVAS_WIDTH;
gameText.height = NOTATION_PADDING + 10;

var gameTextContext = gameText.getContext('2d');
gameTextContext.font = "22px Helvetica";


// Main board canvas contexts
var canvas = document.getElementById("quoridor-board");
canvas.width = CANVAS_WIDTH;
canvas.height = CANVAS_HEIGHT;

var context = canvas.getContext("2d");


// ------ HELPER FUNCTIONS ------ //

function changeGameText (inString) {
    gameTextContext.clearRect(0, 0, gameText.width, gameText.height);
    gameTextContext.fillText(inString, TEXT_OFFSET_X, TEXT_OFFSET_Y)
};

function clearAll () {
    context.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
};

function drawGridLines () {
    
    var lineStart = 0;
    var lineLength = CANVAS_WIDTH;
    
    context.lineWidth = GRIDLINE_WIDTH;
    context.strokeStyle = GRIDLINE_COLOR;
    context.lineCap = 'round';
    context.beginPath();

    // Horizontal lines
    for (var y = 1; y <= ROWS-1; y++) {
        context.moveTo(lineStart, y * CELL_SIZE);
        context.lineTo(lineLength, y * CELL_SIZE);
    };
    
    // Vertical lines
    for (var x = 1; x <= COLS-1; x++) {
        context.moveTo(x * CELL_SIZE, lineStart);
        context.lineTo(x * CELL_SIZE, lineLength);
    };
    
    context.stroke();

    context.lineWidth = 4;
    context.strokeStyle = "black";
    context.beginPath();
    
    // Horizontal Lines capping grid
    context.moveTo(0, 0);
    context.lineTo(CANVAS_WIDTH, 0);
    context.moveTo(0, CANVAS_HEIGHT);
    context.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);
    
    // Vertical Lines capping grid
    context.moveTo(0, 0);
    context.lineTo(0, CANVAS_HEIGHT);
    context.moveTo(CANVAS_WIDTH, 0);
    context.lineTo(CANVAS_WIDTH, CANVAS_HEIGHT);

    context.stroke();
};

function drawO (inX, inY, inPlayerColor) {
    // Draws player circles
    var halfSectionSize = CELL_SIZE / 2;
    var centerX = inX * CELL_SIZE + halfSectionSize;
    var centerY = inY * CELL_SIZE + halfSectionSize;
    var radius = CIRCLE_RADIUS;

    if (inPlayerColor === Player.RED) {
        context.fillStyle = "red";
    } else if (inPlayerColor === Player.BLU) {
        context.fillStyle = "blue";
    } else { 
        return;
    }
    
    context.beginPath();
    context.arc(centerX, centerY, radius, 0, 2 * Math.PI);
    
    context.fill();
    context.lineWidth = CIRCLE_LINEWIDTH;
    context.strokeStyle = "black";
    context.stroke();
};

function drawWall (inX, inY, inPlayerColor, inDirection) {
    // Draws a wall on the canvas
    
    if (inPlayerColor === Player.RED) {
        context.strokeStyle = "red";
    } else if (inPlayerColor === Player.BLU) {
        context.strokeStyle = "blue";
    } else {
        return;
    }
    
    context.lineWidth = WALL_STROKE_WIDTH;
    
    context.lineCap = 'butt';
    context.beginPath();

    if (inDirection === Direction.HORIZONTAL) {
        // Direction.HORIZONTAL
        var x1 = inX * CELL_SIZE + WALL_PADDING;
        var x2 = (inX + 2) * CELL_SIZE - WALL_PADDING;
        var y = (inY + 1) * CELL_SIZE;

        context.moveTo(x1, y);
        context.lineTo(x2, y);
    } else { 
        // Direction.VERTICAL 
        var x = (inX + 1) * CELL_SIZE;
        var y1 = inY * CELL_SIZE + WALL_PADDING;
        var y2 = (inY + 2) * CELL_SIZE - WALL_PADDING;
        context.moveTo(x, y1);
        context.lineTo(x, y2);
    }
    
    context.stroke();
};

function redrawAll () {
    // Redraws the board according to the current gameState
    clearAll();
    drawGridLines();
    drawO(gameState.redX, gameState.redY, Player.RED);
    drawO(gameState.bluX, gameState.bluY, Player.BLU);
    
    // Draw all walls currently in the gameState object
    for (var col = 0; col < COLS-1; col++) {
        for (var row = 0; row < ROWS-1; row++) {
            drawWall(col, row, gameState.horizontalWalls[col][row], Direction.HORIZONTAL);
            drawWall(col, row, gameState.verticalWalls[col][row], Direction.VERTICAL);  
        }
    }
};

function getCanvasMousePosition (event) {
    var rect = canvas.getBoundingClientRect();

    return {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
    }
};


// ------ LOGIC FUNCTIONS ------ //

function canAddWall(inCol, inRow, inDirection) {
    if (gameState.activePlayer === Player.EMPTY) throw Error("Player cannot be EMPTY");

    //Hack to clamp the wall addition
    if (inCol === -1) inCol = 0;
    else if (inCol === COLS-1) inCol = COLS-2;
    if (inRow === -1) inRow = 0;
    else if (inRow === ROWS-1) inRow = ROWS-2;

    var horizontalWalls = gameState.horizontalWalls;
    var verticalWalls = gameState.verticalWalls;

    var clashesHorizontally = horizontalWalls[inCol][inRow] !== Player.EMPTY;
    var clashesVertically = verticalWalls[inCol][inRow] !== Player.EMPTY;
    var clashesBack, clashesForward;

    if (inDirection === Direction.HORIZONTAL) // if isHorizontal check left and right (same inRow different inCol)
    {
        if (inCol !== 0) clashesBack = horizontalWalls[inCol-1][inRow] !== Player.EMPTY;
        else clashesBack = false;
        if (inCol !== COLS-2) clashesForward = horizontalWalls[inCol+1][inRow] !== Player.EMPTY;
        else clashesForward = false;
    } else // Direction.VERTICAL check up and down (same inCol different inRow)
    {
        if (inRow !== 0) clashesBack = verticalWalls[inCol][inRow-1] !== Player.EMPTY;
        else clashesBack = false;
        if (inRow !== ROWS-2) clashesForward = verticalWalls[inCol][inRow+1] !== Player.EMPTY;
        else clashesForward = false;
    }

    var clashes = clashesHorizontally || clashesVertically || clashesBack || clashesForward;
    if (clashes) return false;
    else return true;
}

function addWall(inCol, inRow, inDirection) {
    if (inDirection === Direction.HORIZONTAL)
    {
        gameState.horizontalWalls[inCol][inRow] = gameState.activePlayer;

        // If it becomes unsolvable, PURGE IT and fail
        if (!isSolvable())
        {
            gameState.horizontalWalls[inCol][inRow] = Player.EMPTY;
            return false;
        }
    } else // inDirection === Direction.VERTICAL
    {
        gameState.verticalWalls[inCol][inRow] = gameState.activePlayer;

        if (!isSolvable())
        {
            gameState.verticalWalls[inCol][inRow] = Player.EMPTY;
            return false;
        }
    }

    if (gameState.activePlayer === Player.RED) gameState.redRemainingWalls--;
    if (gameState.activePlayer === Player.BLU) gameState.bluRemainingWalls--;
    return true;
}

function isNextToWallOrBorder (inCol, inRow, inUDLR) {
    if (gameState.activePlayer === Player.EMPTY) throw Error("Player cannot be EMPTY");

    var horizontalWalls = gameState.horizontalWalls;
    var verticalWalls = gameState.verticalWalls;

    if (inUDLR === UDLR.UP)
    {

        if (inRow === 0) return true;
        else if (inCol === 0) return horizontalWalls[0][inRow-1] !== Player.EMPTY;
        else if (inCol === COLS-1) return horizontalWalls[COLS-2][inRow-1] !== Player.EMPTY;
        else return horizontalWalls[inCol-1][inRow-1] !== Player.EMPTY || horizontalWalls[inCol][inRow-1] !== Player.EMPTY;
    }
    else if (inUDLR === UDLR.DOWN)
    {
        if (inRow === ROWS-1) return true;
        else if (inCol === 0) return horizontalWalls[0][inRow] !== Player.EMPTY;
        else if (inCol === COLS-1) return horizontalWalls[COLS-2][inRow] !== Player.EMPTY;
        else return horizontalWalls[inCol-1][inRow] !== Player.EMPTY || horizontalWalls[inCol][inRow] !== Player.EMPTY;
    }
    else if (inUDLR === UDLR.LEFT)
    {
        if (inCol === 0) return true;
        else if (inRow === 0) return verticalWalls[inCol-1][0] !== Player.EMPTY;
        else if (inRow === ROWS-1) return verticalWalls[inCol-1][ROWS-2] !== Player.EMPTY;
        else return verticalWalls[inCol-1][inRow-1] !== Player.EMPTY || verticalWalls[inCol-1][inRow] !== Player.EMPTY;
    }
    else // (inUDLR === UDLR.RIGHT)
    {
        if (inCol === COLS-1) return true;
        else if (inRow === 0) return verticalWalls[inCol][0] !== Player.EMPTY;
        else if (inRow === ROWS-1) return verticalWalls[inCol][ROWS-2] !== Player.EMPTY;
        else return verticalWalls[inCol][inRow-1] !== Player.EMPTY || verticalWalls[inCol][inRow] !== Player.EMPTY;
    }
}

function updateValidMovements () {
    if (gameState.activePlayer === Player.EMPTY) throw Error("Player cannot be EMPTY");
    var validMovements = [];
    var activeX, activeY, inactiveX, inactiveY;
    if (gameState.activePlayer === Player.RED)
    {
        activeX = gameState.redX;
        activeY = gameState.redY;
        inactiveX = gameState.bluX;
        inactiveY = gameState.bluY;
    }
    else // gameState.activePlayer === Player.BLU
    {
        activeX = gameState.bluX;
        activeY = gameState.bluY;
        inactiveX = gameState.redX;
        inactiveY = gameState.redY;
    }
    var isNextToOpponent, opponentHasWallBehindHim;

    // Check if can move up
    if (!isNextToWallOrBorder(activeX, activeY, UDLR.UP))
    {
        isNextToOpponent = inactiveX === activeX && inactiveY === activeY - 1;
        if (!isNextToOpponent) validMovements.push([activeX,activeY-1]);
        else
        {
            opponentHasWallBehindHim = isNextToWallOrBorder(inactiveX, inactiveY, UDLR.UP);
            if (!opponentHasWallBehindHim) validMovements.push([activeX,activeY-2]);
            else
            {
                if (!isNextToWallOrBorder(inactiveX, inactiveY, UDLR.LEFT)) validMovements.push([inactiveX-1,inactiveY]);
                if (!isNextToWallOrBorder(inactiveX, inactiveY, UDLR.RIGHT)) validMovements.push([inactiveX+1,inactiveY]);
            }
        }
    }

    // Check if can move down
    if (!isNextToWallOrBorder(activeX, activeY, UDLR.DOWN))
    {
        isNextToOpponent = inactiveX === activeX && inactiveY === activeY + 1;
        if (!isNextToOpponent) validMovements.push([activeX,activeY+1]);
        else
        {
            opponentHasWallBehindHim = isNextToWallOrBorder(inactiveX, inactiveY, UDLR.DOWN);
            if (!opponentHasWallBehindHim) validMovements.push([activeX,activeY+2]);
            else
            {
                if (!isNextToWallOrBorder(inactiveX, inactiveY, UDLR.LEFT)) validMovements.push([inactiveX-1,inactiveY]);
                if (!isNextToWallOrBorder(inactiveX, inactiveY, UDLR.RIGHT)) validMovements.push([inactiveX+1,inactiveY]);
            }
        }
    }

    // Check if can move left
    if (!isNextToWallOrBorder(activeX, activeY, UDLR.LEFT))
    {
        isNextToOpponent = inactiveX === activeX-1 && inactiveY === activeY;
        if (!isNextToOpponent) validMovements.push([activeX-1,activeY]);
        else // can jump
        {
            opponentHasWallBehindHim = isNextToWallOrBorder(inactiveX, inactiveY, UDLR.LEFT);
            if (!opponentHasWallBehindHim) validMovements.push([activeX-2,activeY]);
            else
            {
                if (!isNextToWallOrBorder(inactiveX, inactiveY, UDLR.UP)) validMovements.push([inactiveX,inactiveY-1]);
                if (!isNextToWallOrBorder(inactiveX, inactiveY, UDLR.DOWN)) validMovements.push([inactiveX,inactiveY+1]);
            }
        }
    }

    // Check if can move right
    if (!isNextToWallOrBorder(activeX,activeY,UDLR.RIGHT))
    {
        isNextToOpponent = inactiveX === activeX + 1 && inactiveY === activeY;
        if (!isNextToOpponent) validMovements.push([activeX+1,activeY]);
        else
        {
            opponentHasWallBehindHim = isNextToWallOrBorder(inactiveX, inactiveY, UDLR.RIGHT);
            if (!opponentHasWallBehindHim) validMovements.push([activeX+2,activeY]);
            else
            {
                if (!isNextToWallOrBorder(inactiveX, inactiveY, UDLR.UP)) validMovements.push([inactiveX,inactiveY-1]);
                if (!isNextToWallOrBorder(inactiveX, inactiveY, UDLR.DOWN)) validMovements.push([inactiveX,inactiveY+1]);
            }
        }
    }

    if (gameState.activePlayer === Player.RED) gameState.validMovementsRed = validMovements;
    else gameState.validMovementsBlu = validMovements;
}

var wasHere = [];

function isSolvable() {
    wasHere.length = COLS;

    for (var col = 0; col < COLS; col++)
    {
        var temporaryArray = [];
        temporaryArray.length = ROWS;
        for (var row = 0; row < ROWS; row++)
        {
            temporaryArray[row] = false;
        }
        wasHere[col] = temporaryArray;
    }

    var bluPossible = true;
    var redPossible = recursiveSolve(gameState.redX, gameState.redY, Player.RED);
    if (redPossible)
    {
        for (var col = 0; col < COLS; col++)
        {
            var temporaryArray = [];
            temporaryArray.length = ROWS;
            for (var row = 0; row < ROWS; row++)
            {
                temporaryArray[row] = false;
            }
            wasHere[col] = temporaryArray;
        }
        bluPossible = recursiveSolve(gameState.bluX, gameState.bluY, Player.BLU);
    }
    if (!bluPossible) changeGameText("Invalid move. Blue cannot win.");
    else if (!redPossible) changeGameText("Invalid move. Red cannot win.");
    //console.log("Is Red/Blu possible? "+redPossible+"/"+bluPossible);
    return redPossible && bluPossible;
}

function recursiveSolve (inX, inY, inPlayer) {
    if (inPlayer === Player.EMPTY) throw Error("Player cannot be EMPTY");

    // Teriminating Conditions
    if (inPlayer === Player.RED && inY === 0) return true;
    else if (inPlayer === Player.BLU && inY === ROWS-1) return true;
    wasHere[inX][inY] = true;

    // Check if can go up
    var canGoUp = !isNextToWallOrBorder(inX, inY, UDLR.UP) && !wasHere[inX][inY-1];
    var canGoDown = !isNextToWallOrBorder(inX, inY, UDLR.DOWN) && !wasHere[inX][inY+1];
    var canGoLeft = !isNextToWallOrBorder(inX, inY, UDLR.LEFT) && !wasHere[inX-1][inY];
    var canGoRight = !isNextToWallOrBorder(inX, inY, UDLR.RIGHT) && !wasHere[inX+1][inY];

    if (canGoUp)
    {
        //console.log(inPlayer + ": From: " +inX+", "+inY+". We can go up, going.");
        if (recursiveSolve(inX, inY-1, inPlayer)) return true;
    }
    //else console.log(inPlayer + ": From: " +inX+", "+inY+". We can't go up.");
    if (canGoDown){
        //console.log(inPlayer + ": From: " +inX+", "+inY+". We can go down, going.");
        if (recursiveSolve(inX, inY+1, inPlayer)) return true;
    }
    //else console.log(inPlayer + ": From: " +inX+", "+inY+". We can't go down.");
    if (canGoLeft)
    {
        //console.log(inPlayer + ": From: " +inX+", "+inY+". We can go left, going.");
        if (recursiveSolve(inX-1, inY, inPlayer)) return true;
    }
    //else console.log(inPlayer + ": From: " +inX+", "+inY+". We can't go left.");
    if (canGoRight)
    {
        //console.log(inPlayer + ": From: " +inX+", "+inY+". We can go right, going.");
        if (recursiveSolve(inX+1, inY, inPlayer)) return true;
    }
    //else console.log(inPlayer + ": From: " +inX+", "+inY+". We can't go right.");
    return false;
}


// ------ CONTROL FUNCTIONS ------ //

// Returns a object with the currently selected move based on mouse pos (does not do validation)
function selectMove (inMousePosition) {
    // Ascertain if user wants to place a wall or move the piece
    
    // Get selected cell mouse cursor is in
    var cellCol = Math.floor(inMousePosition.x / CELL_SIZE);
    var cellRow = Math.floor(inMousePosition.y / CELL_SIZE);
    
    // Get selected wall mouse cursor is near
    var wallCol = Math.round(inMousePosition.x / CELL_SIZE) - 1;
    var wallRow = Math.round(inMousePosition.y / CELL_SIZE) - 1;
	
    // Determine if mouse is near a wall
    var remainderX = inMousePosition.x % CELL_SIZE;
    var remainderY = inMousePosition.y % CELL_SIZE;
    
    var payload = {
        type: "wall",
        dir: null,
        col: wallCol,
        row: wallRow
    };
    
    if (remainderY <= WALL_PADDING || remainderY >= CELL_SIZE - WALL_PADDING) {
        // Hovering near a horizontal wall; attempt to place a horizontal wall
        payload.dir = Direction.HORIZONTAL;
    } else if (remainderX <= WALL_PADDING || remainderX >= CELL_SIZE - WALL_PADDING) {
        // Hovering near a vertical wall; attempt to place a vertical wall
        payload.dir = Direction.VERTICAL;
    } else {
        payload.type = "piece";
        payload.col = cellCol;
        payload.row = cellRow;
    }
    
    if (payload.type === "wall" &&
        (payload.col < 0 || 
        payload.col > COLS - 2 || 
        payload.row < 0 || 
        payload.row > ROWS - 2))
    {
        payload.type = null;
    }
    
    return payload;
};

function validateWall (inCol, inRow, inDirection) {
    // Wrapper around canAddWall to validate that player has enough walls
    var hasEnoughWalls;
    
    if (gameState.activePlayer === Player.RED) {
        hasEnoughWalls = (gameState.redRemainingWalls >= 1);
    } else {
        hasEnoughWalls = (gameState.bluRemainingWalls >= 1);
    }
    
    if (!hasEnoughWalls) return false;
    
    return canAddWall(inCol, inRow, inDirection);
};

function validateMove (inCol, inRow) {
    
    var validMovements;
    
    if (gameState.activePlayer === Player.RED) {
        validMovements = gameState.validMovementsRed;
    } else {
        // Assume activePlayer !== Player.EMPTY
        validMovements = gameState.validMovementsBlu;
    }
    
    for (var i = 0; i < validMovements.length; i++) {
        if (inCol === validMovements[i][0] && inRow === validMovements[i][1]) {
            return true; // Valid move found
        }
    }
    
    return false; // no valid move found
};

function hoverAt (inMousePosition) {
    if (gameState.currentStatus !== GameStatus.PLAYING) {
        return;
    }
    
    clearAll();
    redrawAll();
    
    var move = selectMove(inMousePosition);
    
    if (move.type === "wall") {
        if (validateWall(move.col, move.row, move.dir)) {
            drawWall(move.col, move.row, gameState.activePlayer, move.dir)
        } else {
            // changeGameText("No walls left or wall clash!");
        }
        return;
    }
    
    if (move.type === "piece") {
        if (validateMove(move.col, move.row)) {
            drawO(move.col, move.row, gameState.activePlayer)
        }
    }
};

function clickAt (inMousePosition) {
    if (gameState.currentStatus !== GameStatus.PLAYING) {
		socket.emit("game:restartGame", "");
		return;
    }
    
    clearAll();
    redrawAll();
    
    var move = selectMove(inMousePosition);
    
    if (move.type === "wall") {
        if (validateWall(move.col, move.row, move.dir)) {
            var success = addWall(move.col, move.row, move.dir);
            if (success) {
                updateGame();
            }
        } else {
            // changeGameText("No walls left or wall clash!");
        }
        return;
    }
    
    if (move.type === "piece") {
        if (validateMove(move.col, move.row)) {
            if (gameState.activePlayer === Player.RED) {
                gameState.redX = move.col;
                gameState.redY = move.row;
            } else {
                gameState.bluX = move.col;
                gameState.bluY = move.row;
            }
            updateGame();
        }
        return;
    }
    
};

// ------ MAIN APP LOGIC ------

function updateGame () {
    // Swap active player
    if (gameState.activePlayer === Player.RED) gameState.activePlayer = Player.BLU;
    else gameState.activePlayer = Player.RED;
	
	// Update valid movements
    updateValidMovements();
    
    socket.emit("game:sendState", gameState);
};

// Mouse hover methods
canvas.addEventListener('mousemove', function(event) {
    var mousePosition = getCanvasMousePosition(event);
    hoverAt(mousePosition);
});

// Mouse click methods
canvas.addEventListener('click', function (event) {
    var mousePosition = getCanvasMousePosition(event);
    clickAt(mousePosition);
});


