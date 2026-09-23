(() => {
  "use strict";

  const SIZE = 4;
  const BEST_KEY = "game-2048-best";
  const boardElement = document.querySelector("#board");
  const scoreElement = document.querySelector("#score");
  const bestElement = document.querySelector("#best");
  const statusElement = document.querySelector("#status");
  const undoButton = document.querySelector("#undo");
  const overlay = document.querySelector("#overlay");
  const SLIDE_DURATION = 180;
  let animationTimer = null;
  let moving = false;
  let queuedDirection = null;

  const game = {
    board: [],
    score: 0,
    best: readBest(),
    previous: null,
    won: false,
    keepPlaying: false,
    over: false,
    newTile: null,
  };

  function readBest() {
    try {
      return Math.max(0, Number(localStorage.getItem(BEST_KEY)) || 0);
    } catch {
      return 0;
    }
  }

  function saveBest() {
    try {
      localStorage.setItem(BEST_KEY, String(game.best));
    } catch {
      // The game still works when storage is unavailable.
    }
  }

  function emptyBoard() {
    return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  }

  function emptyCells() {
    const cells = [];
    game.board.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        if (value === 0) cells.push([rowIndex, columnIndex]);
      });
    });
    return cells;
  }

  function addRandomTile() {
    const cells = emptyCells();
    if (cells.length === 0) return;
    const [row, column] = cells[Math.floor(Math.random() * cells.length)];
    game.board[row][column] = Math.random() < 0.9 ? 2 : 4;
    game.newTile = [row, column];
  }

  function startGame() {
    stopAnimation();
    game.board = emptyBoard();
    game.score = 0;
    game.previous = null;
    game.won = false;
    game.keepPlaying = false;
    game.over = false;
    addRandomTile();
    addRandomTile();
    render();
  }

  function mergeLine(line) {
    const values = line.map((value, index) => ({ value, index })).filter((tile) => tile.value !== 0);
    const result = [];
    const movements = [];
    const mergedPositions = [];
    let earned = 0;
    for (let index = 0; index < values.length; index += 1) {
      const target = result.length;
      movements.push({ from: values[index].index, to: target });
      if (values[index].value === values[index + 1]?.value) {
        const merged = values[index].value * 2;
        result.push(merged);
        earned += merged;
        movements.push({ from: values[index + 1].index, to: target });
        mergedPositions.push(target);
        index += 1;
      } else {
        result.push(values[index].value);
      }
    }
    while (result.length < SIZE) result.push(0);
    return { result, earned, movements, mergedPositions };
  }

  function move(direction) {
    if (moving) {
      queuedDirection = direction;
      return;
    }
    if (game.over || (game.won && !game.keepPlaying)) return;

    const before = game.board.map((row) => [...row]);
    const next = emptyBoard();
    const movements = [];
    const mergedTiles = [];
    let earned = 0;

    for (let index = 0; index < SIZE; index += 1) {
      const horizontal = direction === "left" || direction === "right";
      const reverse = direction === "right" || direction === "down";
      const line = horizontal
        ? [...before[index]]
        : before.map((row) => row[index]);
      if (reverse) line.reverse();
      const merged = mergeLine(line);
      earned += merged.earned;
      const cellAt = (position) => {
        const actual = reverse ? SIZE - 1 - position : position;
        return horizontal ? [index, actual] : [actual, index];
      };
      merged.movements.forEach(({ from, to }) => {
        movements.push({ from: cellAt(from), to: cellAt(to) });
      });
      merged.mergedPositions.forEach((position) => mergedTiles.push(cellAt(position)));
      if (reverse) merged.result.reverse();
      for (let position = 0; position < SIZE; position += 1) {
        if (horizontal) next[index][position] = merged.result[position];
        else next[position][index] = merged.result[position];
      }
    }

    if (next.every((row, index) => row.every((value, column) => value === before[index][column]))) return;

    game.previous = {
      board: before,
      score: game.score,
      won: game.won,
      keepPlaying: game.keepPlaying,
    };
    game.board = next;
    game.score += earned;
    if (game.score > game.best) {
      game.best = game.score;
      saveBest();
    }
    addRandomTile();
    if (!game.won && game.board.some((row) => row.includes(2048))) game.won = true;
    game.over = !canMove();
    animateMove(movements, mergedTiles);
  }

  function stopAnimation() {
    if (animationTimer !== null) clearTimeout(animationTimer);
    animationTimer = null;
    boardElement.querySelectorAll(".tile-ghost").forEach((tile) => tile.remove());
    boardElement.classList.remove("board-moving");
    moving = false;
    queuedDirection = null;
  }

  function animateMove(movements, mergedTiles) {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      render(mergedTiles);
      return;
    }

    const cells = [...boardElement.querySelectorAll(".cell")];
    const ghosts = movements.map(({ from, to }) => {
      const source = cells[from[0] * SIZE + from[1]];
      const destination = cells[to[0] * SIZE + to[1]];
      const tile = source.cloneNode(true);
      tile.classList.remove("tile-new", "tile-merged");
      tile.classList.add("tile-ghost");
      tile.removeAttribute("role");
      tile.setAttribute("aria-hidden", "true");
      tile.style.left = `${source.offsetLeft}px`;
      tile.style.top = `${source.offsetTop}px`;
      tile.style.width = `${source.offsetWidth}px`;
      tile.style.height = `${source.offsetHeight}px`;
      boardElement.append(tile);
      return { tile, dx: destination.offsetLeft - source.offsetLeft, dy: destination.offsetTop - source.offsetTop };
    });

    moving = true;
    boardElement.classList.add("board-moving");
    // Commit the starting positions before applying transforms.
    boardElement.offsetWidth;
    ghosts.forEach(({ tile, dx, dy }) => {
      tile.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    animationTimer = setTimeout(() => {
      animationTimer = null;
      boardElement.querySelectorAll(".tile-ghost").forEach((tile) => tile.remove());
      boardElement.classList.remove("board-moving");
      moving = false;
      render(mergedTiles);
      const nextDirection = queuedDirection;
      queuedDirection = null;
      if (nextDirection) move(nextDirection);
    }, SLIDE_DURATION);
  }

  function canMove() {
    if (emptyCells().length > 0) return true;
    for (let row = 0; row < SIZE; row += 1) {
      for (let column = 0; column < SIZE; column += 1) {
        const value = game.board[row][column];
        if (column + 1 < SIZE && value === game.board[row][column + 1]) return true;
        if (row + 1 < SIZE && value === game.board[row + 1][column]) return true;
      }
    }
    return false;
  }

  function undo() {
    if (!game.previous) return;
    stopAnimation();
    game.board = game.previous.board;
    game.score = game.previous.score;
    game.won = game.previous.won;
    game.keepPlaying = game.previous.keepPlaying;
    game.over = false;
    game.previous = null;
    game.newTile = null;
    render();
  }

  function render(mergedTiles = []) {
    const mergedCells = new Set(mergedTiles.map(([row, column]) => row * SIZE + column));
    boardElement.replaceChildren();
    game.board.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        const cell = document.createElement("div");
        cell.className = "cell";
        cell.setAttribute("role", "gridcell");
        cell.setAttribute("aria-label", `第 ${rowIndex + 1} 行，第 ${columnIndex + 1} 列：${value || "空"}`);
        if (value) {
          cell.textContent = String(value);
          cell.classList.add("tile", value <= 2048 ? `tile-${value}` : "tile-super");
          if (game.newTile?.[0] === rowIndex && game.newTile?.[1] === columnIndex) {
            cell.classList.add("tile-new");
          }
          if (mergedCells.has(rowIndex * SIZE + columnIndex)) cell.classList.add("tile-merged");
        }
        boardElement.append(cell);
      });
    });
    game.newTile = null;
    scoreElement.textContent = String(game.score);
    bestElement.textContent = String(game.best);
    undoButton.disabled = !game.previous;

    overlay.hidden = !game.over && (!game.won || game.keepPlaying);
    if (game.over) {
      document.querySelector("#overlay-icon").textContent = "↻";
      document.querySelector("#overlay-title").textContent = "游戏结束";
      document.querySelector("#overlay-text").textContent = `本局得分 ${game.score}，再试一次吧。`;
      document.querySelector("#keep-playing").hidden = true;
      statusElement.textContent = "棋盘已满，无法继续移动。";
    } else if (game.won && !game.keepPlaying) {
      document.querySelector("#overlay-icon").textContent = "✦";
      document.querySelector("#overlay-title").textContent = "你做到了！";
      document.querySelector("#overlay-text").textContent = "成功合成 2048，要继续挑战吗？";
      document.querySelector("#keep-playing").hidden = false;
      statusElement.textContent = "成功合成 2048！";
    } else {
      statusElement.textContent = game.keepPlaying ? "继续挑战更大的数字！" : "合并数字，达到 2048！";
    }
  }

  const keyDirections = {
    ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
    w: "up", s: "down", a: "left", d: "right",
  };
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const direction = keyDirections[event.key] || keyDirections[event.key.toLowerCase()];
    if (!direction) return;
    event.preventDefault();
    move(direction);
  });

  let touchStart = null;
  boardElement.addEventListener("touchstart", (event) => {
    if (event.touches.length !== 1) return;
    touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }, { passive: true });
  boardElement.addEventListener("touchend", (event) => {
    if (!touchStart || event.changedTouches.length !== 1) return;
    const dx = event.changedTouches[0].clientX - touchStart.x;
    const dy = event.changedTouches[0].clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 25) return;
    move(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up"));
  }, { passive: true });

  document.querySelector("#restart").addEventListener("click", startGame);
  document.querySelector("#play-again").addEventListener("click", startGame);
  undoButton.addEventListener("click", undo);
  document.querySelector("#keep-playing").addEventListener("click", () => {
    game.keepPlaying = true;
    render();
  });

  startGame();
})();
