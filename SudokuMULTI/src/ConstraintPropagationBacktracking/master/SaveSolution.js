const fs = require('fs');
const path = require('path');

// Directory where all Sudoku solutions will be saved
const solutionsDir = './SaveSolutions';

// Create the solutions directory if it doesn't exist yet
if (!fs.existsSync(solutionsDir)) {
  fs.mkdirSync(solutionsDir, { recursive: true });
}

function saveSolutionToFile(jobId, solvedBoard) {
  // Convert the 2D board array into a format easier to store (comma-separated strings)
  const formattedBoard = solvedBoard.map(row => row.join(','));
  
  // Prepare the solution data object with id, board and timestamp
  const solutionData = {
    jobId,
    solvedBoard: formattedBoard,
    timestamp: new Date().toISOString()
  };
  
  // Generate a unique filename based on job ID and current time
  const filename = `solution_${jobId}_${Date.now()}.json`;
  const filePath = path.join(solutionsDir, filename);
  
  // Write the solution data to the file as formatted JSON
  fs.writeFile(filePath, JSON.stringify(solutionData, null, 2), (err) => {
    if (err) console.error('Error saving solution to file:', err);
    else console.log('Solution saved to file:', filePath);
  });
}

module.exports = { saveSolutionToFile };
