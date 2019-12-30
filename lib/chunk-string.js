

const chunkString = function(str, size) {
  const chunks = [];
  const spacePieces = str.split(' ');
  return spacePieces.reduce(function(chunks, piece, index) {
    const isFirstPiece = index === 0;
    const isLastPiece = index === spacePieces.length - 1;

    const chunkSeparator = isFirstPiece ? '' : ' ';
    let currentChunk = chunks[chunks.length - 1];
    // If a piece is simply too long, split it up harshly
    if(piece.length > size) {
      // Add whatever we can to the current
      const startingPieceIndex = size - (chunkSeparator + currentChunk).length;
      currentChunk += chunkSeparator + piece.substring(0, startingPieceIndex);
      chunks[chunks.length - 1] = currentChunk;

      // Then just add the rest to more chunks
      const leftover = piece.substring(startingPieceIndex);
      for (let i = 0; i < leftover.length; i += size) {
        chunks.push(leftover.substring(i, i + size));
      }
    }
    // Otherwise try to split nicely at spaces
    else if((currentChunk + chunkSeparator + piece).length <= size) {
      currentChunk += chunkSeparator + piece;
      chunks[chunks.length - 1] = currentChunk;
    }
    // If we simply reached max for this chunk, move to the next one
    else {
      currentChunk = piece;
      chunks.push('');
      chunks[chunks.length - 1] = currentChunk;
    }

    return chunks;
  }, ['']);
};

module.exports = chunkString;
