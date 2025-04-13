// conway.js

// Count neighbors around (x,y) on a 64x64 board.
// Returns redCount, blueCount and the total aliveCount.
function countNeighbors(board, x, y) {
  let redCount = 0,
    blueCount = 0,
    aliveCount = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      let nx = x + dx,
        ny = y + dy;
      if (nx >= 0 && nx < 64 && ny >= 0 && ny < 64) {
        let idx = ny * 64 + nx;
        let val = board[idx];
        if (val === 1) {
          redCount++;
          aliveCount++;
        } else if (val === 2) {
          blueCount++;
          aliveCount++;
        }
      }
    }
  }
  return { redCount, blueCount, aliveCount };
}

// runOneStep applies Conway's Game of Life to the board.
// Survival: If a cell is alive (red or blue), it survives if it has exactly 2 or 3 live neighbors (regardless of color).
// Birth: If a dead cell has exactly 3 live neighbors, the new cell is born with the color chosen by majority.
//        (If redCount > blueCount, the new cell is red; if blueCount > redCount, it's blue; tie → remains dead.)
function runOneStep(oldBoard) {
  let newBoard = new Array(4096).fill(0);

  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      let idx = y * 64 + x;
      let cell = oldBoard[idx];
      let { redCount, blueCount, aliveCount } = countNeighbors(oldBoard, x, y);

      if (cell !== 0) {
        // An alive cell simply survives if the total neighbor count is 2 or 3.
        newBoard[idx] = (aliveCount === 2 || aliveCount === 3) ? cell : 0;
      } else {
        // A dead cell is born if exactly 3 neighbors are alive.
        if (aliveCount === 3) {
          if (redCount > blueCount) newBoard[idx] = 1;
          else if (blueCount > redCount) newBoard[idx] = 2;
          else newBoard[idx] = 0; // Tie → remain dead (or set a default)
        } else {
          newBoard[idx] = 0;
        }
      }
    }
  }
  return newBoard;
}

module.exports = {
  runOneStep
};
