const fs = require('fs');
const path = require('path');

const solutionsDir = '/home/parallels/Documents/Sudoku/SudokuSingle/StochasticSearch/solutions';
if (!fs.existsSync(solutionsDir)) {
  fs.mkdirSync(solutionsDir, { recursive: true });
}

function saveSolutionToFile(jobId, solvedBoard) {
  // Format each row as a comma-separated string.
  const formattedBoard = solvedBoard.map(row => row.join(','));
  const solutionData = {
    jobId,
    solvedBoard: formattedBoard,
    timestamp: new Date().toISOString()
  };
  const filename = `solution_${jobId}_${Date.now()}.json`;
  const filePath = path.join(solutionsDir, filename);
  fs.writeFile(filePath, JSON.stringify(solutionData, null, 2), (err) => {
    if (err) console.error('Error saving solution to file:', err);
    else console.log('Solution saved to file:', filePath);
  });
}

module.exports = { saveSolutionToFile };