// conway.js

// We treat 1=red, 2=blue as "alive" but separate colors
// Survival: 2 or 3 neighbors of the same color
// Birth: exactly 3 neighbors are alive => pick majority color
function runOneStep(oldBoard) {
    let newBoard = new Array(4096).fill(0);
  
    for(let y=0; y<64; y++){
      for(let x=0; x<64; x++){
        let idx=y*64 + x;
        let cell=oldBoard[idx];
        let { redCount, blueCount, aliveCount } = countNeighbors(oldBoard, x, y);
  
        if(cell===1){
          // red => survive if redCount=2 or 3
          if(redCount===2 || redCount===3){
            newBoard[idx]=1;
          } else {
            newBoard[idx]=0;
          }
        } else if(cell===2){
          // blue => survive if blueCount=2 or 3
          if(blueCount===2 || blueCount===3){
            newBoard[idx]=2;
          } else {
            newBoard[idx]=0;
          }
        } else {
          // empty => birth if aliveCount=3
          if(aliveCount===3){
            // pick color: whichever has >=2 among those 3
            if(redCount>blueCount) newBoard[idx]=1;
            else if(blueCount>redCount) newBoard[idx]=2;
            else newBoard[idx]=0; // tie => remain empty
          } else {
            newBoard[idx]=0;
          }
        }
      }
    }
    return newBoard;
  }
  
  function countNeighbors(board,x,y){
    let redCount=0,blueCount=0,aliveCount=0;
    for(let dy=-1; dy<=1; dy++){
      for(let dx=-1; dx<=1; dx++){
        if(dx===0&&dy===0) continue;
        let nx=x+dx, ny=y+dy;
        if(nx>=0&&nx<64 && ny>=0&&ny<64){
          let idx=ny*64+nx;
          let val=board[idx];
          if(val===1){
            redCount++; aliveCount++;
          } else if(val===2){
            blueCount++; aliveCount++;
          }
        }
      }
    }
    return { redCount, blueCount, aliveCount };
  }
  
  module.exports = {
    runOneStep
  };
  