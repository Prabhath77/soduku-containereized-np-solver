// solver.js

class SudokuSolver {
  constructor() {
    this.MAX_ATTEMPTS = 50;
    this.MAX_HYBRID_ITERATIONS = 20;
    this.CLUES_PER_ITERATION = 3;
  }

  deepCopy(board) {
    return board.map(row => [...row]);
  }

  // New method: Check if placing num at (row, col) is valid.
  isValidPlacement(board, row, col, num) {
    const n = board.length;
    for (let i = 0; i < n; i++) {
      if (board[row][i] === num || board[i][col] === num) return false;
    }
    const blockSize = Math.sqrt(n);
    const br = Math.floor(row / blockSize) * blockSize;
    const bc = Math.floor(col / blockSize) * blockSize;
    for (let r = 0; r < blockSize; r++) {
      for (let c = 0; c < blockSize; c++) {
        if (board[br + r][bc + c] === num) return false;
      }
    }
    return true;
  }

  // New method: Apply naked singles propagation to the board.
  // If a non-fixed cell is 0 and has exactly one valid candidate, fill it in and mark it fixed.
  applyNakedSingles(board, fixedCells) {
    const n = board.length;
    let changed = true;
    while (changed) {
      changed = false;
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          if (!fixedCells[r][c] && board[r][c] === 0) {
            let candidates = [];
            for (let num = 1; num <= n; num++) {
              if (this.isValidPlacement(board, r, c, num)) {
                candidates.push(num);
              }
            }
            if (candidates.length === 1) {
              board[r][c] = candidates[0];
              fixedCells[r][c] = true;
              changed = true;
            }
          }
        }
      }
    }
    return board;
  }

  initializeCandidate(originalBoard, fixedCells) {
    const board = this.deepCopy(originalBoard);
    const n = board.length;
    
    for (let r = 0; r < n; r++) {
      const present = new Set();
      const missing = [];
      
      // Track existing numbers based on fixed clues.
      for (let c = 0; c < n; c++) {
        if (fixedCells[r][c]) present.add(board[r][c]);
      }
      
      for (let num = 1; num <= n; num++) {
        if (!present.has(num)) missing.push(num);
      }
      
      for (let j = missing.length - 1; j > 0; j--) {
        const k = Math.floor(Math.random() * (j + 1));
        [missing[j], missing[k]] = [missing[k], missing[j]];
      }
      
      let idx = 0;
      for (let c = 0; c < n; c++) {
        if (!fixedCells[r][c]) {
          board[r][c] = missing[idx++];
        }
      }
    }
    return board;
  }

  energy(board, fixedCells) {
    let conflicts = 0;
    const n = board.length;
    const blockSize = Math.sqrt(n);

    // Check columns.
    for (let c = 0; c < n; c++) {
      const seen = new Set();
      for (let r = 0; r < n; r++) {
        const val = board[r][c];
        if (val === 0) continue;
        if (seen.has(val)) conflicts++;
        seen.add(val);
      }
    }

    // Check blocks.
    for (let br = 0; br < blockSize; br++) {
      for (let bc = 0; bc < blockSize; bc++) {
        const seen = new Set();
        for (let r = br * blockSize; r < (br + 1) * blockSize; r++) {
          for (let c = bc * blockSize; c < (bc + 1) * blockSize; c++) {
            const val = board[r][c];
            if (val === 0) continue;
            if (seen.has(val)) conflicts++;
            seen.add(val);
          }
        }
      }
    }
    return conflicts;
  }

  stochasticSolve(originalBoard, fixedCells) {
    const n = originalBoard.length;
    let candidate = this.initializeCandidate(originalBoard, fixedCells);
    let currentEnergy = this.energy(candidate, fixedCells);
    if (currentEnergy === 0) return candidate;

    let T = 15.0;
    const COOLING = 0.99995;
    const MAX_STEPS = 500000;

    for (let step = 0; step < MAX_STEPS && T > 1e-8; step++) {
      const r = Math.floor(Math.random() * n);
      const swappable = [];
      for (let c = 0; c < n; c++) {
        if (!fixedCells[r][c] && candidate[r][c] !== 0) swappable.push(c);
      }
      if (swappable.length < 2) continue;

      const [c1, c2] = this.sample(swappable, 2);
      const newBoard = this.deepCopy(candidate);
      [newBoard[r][c1], newBoard[r][c2]] = [newBoard[r][c2], newBoard[r][c1]];
      
      const newEnergy = this.energy(newBoard, fixedCells);
      if (newEnergy < currentEnergy || 
          Math.random() < Math.exp((currentEnergy - newEnergy) / T)) {
        candidate = newBoard;
        currentEnergy = newEnergy;
        if (currentEnergy === 0) break;
      }
      T *= COOLING;
    }
    return currentEnergy === 0 ? candidate : null;
  }

  getFixedCells(board) {
    return board.map(row => row.map(cell => cell !== 0));
  }

  findMissingClues(board, fixedCells) {
    const n = board.length;
    const candidates = [];
    
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!fixedCells[r][c] && board[r][c] === 0) {
          candidates.push({ r, c });
        }
      }
    }
    
    return this.sample(candidates, this.CLUES_PER_ITERATION);
  }

  strategicBacktrack(board, fixedCells, cellsToSolve) {
    console.log("Using backtracking now...");
    const n = board.length;
    const solution = this.deepCopy(board);
    
    const isValid = (r, c, num) => {
      for (let x = 0; x < n; x++) {
        if (x !== c && solution[r][x] === num) return false;
      }
      for (let x = 0; x < n; x++) {
        if (x !== r && solution[x][c] === num) return false;
      }
      const blockSize = Math.sqrt(n);
      const br = Math.floor(r / blockSize) * blockSize;
      const bc = Math.floor(c / blockSize) * blockSize;
      for (let x = br; x < br + blockSize; x++) {
        for (let y = bc; y < bc + blockSize; y++) {
          if ((x !== r || y !== c) && solution[x][y] === num) return false;
        }
      }
      return true;
    };

    const solve = (index) => {
      if (index >= cellsToSolve.length) return true;
      const { r, c } = cellsToSolve[index];
      if (fixedCells[r][c]) return solve(index + 1);

      for (let num = 1; num <= n; num++) {
        if (isValid(r, c, num)) {
          solution[r][c] = num;
          if (solve(index + 1)) return true;
          solution[r][c] = 0;
        }
      }
      return false;
    };

    return solve(0) ? solution : null;
  }

  getAllEmptyCells(board, fixedCells) {
    const cells = [];
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board.length; c++) {
        if (!fixedCells[r][c] && board[r][c] === 0) {
          cells.push({ r, c });
        }
      }
    }
    return cells;
  }

  sample(array, count) {
    return [...array].sort(() => Math.random() - 0.5).slice(0, count);
  }

  // Main solver method.
  hybridSolve(originalBoard) {
    const fixedCells = this.getFixedCells(originalBoard);
    let board = this.deepCopy(originalBoard);
    
    // Apply naked singles propagation to update board and fixedCells.
    board = this.applyNakedSingles(board, fixedCells);

    let attempt = 0;
    while (attempt++ < this.MAX_ATTEMPTS) {
      const solution = this.stochasticSolve(board, fixedCells);
      if (solution) return solution;

      const neededCells = this.findMissingClues(board, fixedCells);
      if (neededCells.length === 0) break;

      console.log("Using backtracking now...");
      const partialSolution = this.strategicBacktrack(board, fixedCells, neededCells);
      if (!partialSolution) throw new Error("Invalid puzzle");

      neededCells.forEach(({ r, c }) => {
        board[r][c] = partialSolution[r][c];
        fixedCells[r][c] = true;
      });
    }
    console.log("Using backtracking for final solve...");
    return this.strategicBacktrack(board, fixedCells, this.getAllEmptyCells(board, fixedCells));
  }
}

module.exports = { SudokuSolver };