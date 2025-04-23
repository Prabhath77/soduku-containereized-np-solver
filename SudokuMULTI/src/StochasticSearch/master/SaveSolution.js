// This file handles saving Sudoku solutions to disk as JSON files
const fs = require('fs');
const path = require('path');

// Set up a folder to store all our saved solutions
const solutionsDir = './SavedSolutions';

// Make sure the solutions folder exists before we try to save anything
if (!fs.existsSync(solutionsDir)) {
  fs.mkdirSync(solutionsDir, { recursive: true });
}

// This function saves a completed Sudoku board to a JSON file
// jobId: identifies which puzzle was solved
// solvedBoard: the 9x9 grid with the solution
function saveSolutionToFile(jobId, solvedBoard) {
  // Convert each row of numbers to comma-separated strings for easier storage
  const formattedBoard = solvedBoard.map(row => row.join(','));
  
  // Create an object with all the data we want to save
  const solutionData = {
    jobId,
    solvedBoard: formattedBoard,
    timestamp: new Date().toISOString()
  };
  
  // Create a unique filename using the job ID and current time
  const filename = `solution_${jobId}_${Date.now()}.json`;
  const filePath = path.join(solutionsDir, filename);
  
  // Write the solution to a file and handle any errors
  fs.writeFile(filePath, JSON.stringify(solutionData, null, 2), (err) => {
    if (err) {
      console.error('Error saving solution to file:', err);
    } else {
      console.log('Solution saved to file:', filePath);
    }
  });
}

// Make the function available to other files that require this module
module.exports = { saveSolutionToFile };