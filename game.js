/*******************************************************************
 * game.js
 * A Snake-like game for learning words in another language.
 * 
 * 1) Reads from a (sample) word list with three fields: 
 *    - primary language word
 *    - new language word
 *    - difficulty level
 * 
 * 2) On each “round,” we display a primary-language word on the top-left.
 *    The goal is to collect letters in the correct order to form the new-language word.
 *    
 * 3) If the player picks the correct next letter, the snake grows by 1 segment 
 *    and that letter appears in the spelled word on the top-right.
 * 
 * 4) If the player picks the wrong letter, the screen flashes red and the snake 
 *    loses one segment (if possible).
 * 
 * 5) Hitting your own snake’s body causes you to lose all segments from the collision 
 *    point to the tail.
 * 
 * 6) Once the new-language word is spelled, we move on to a new word. 
 *    The difficulty or “level” increases gradually, meaning:
 *       - At level N, we use word entries that have difficulty <= N.
 *       - With higher levels, we place more extra/incorrect letters in the room.
 * 
 * 7) If the snake reaches zero length, game over.
 * 
 *******************************************************************/

// To match your existing setup:
const APP_VERSION = window.APP_VERSION || '(Unknown)';

/**
 * -------------------------------------------------------------
 * SAMPLE WORD DATA
 * In a real app, you might load this from a server or separate file.
 * Each entry has: { primary: string, newLang: string, difficulty: number }
 * -------------------------------------------------------------
 */
/*
const WORD_LIST = [
  { primary: 'idrottshall', newLang: 'sports centre', difficulty: 1 },
  { primary: 'ta reda på', newLang: 'find out', difficulty: 1 },
  { primary: 'bibliotek', newLang: 'library', difficulty: 1 },
  { primary: 'språk', newLang: 'language', difficulty: 1 },
  { primary: 'avslutningsvis', newLang: 'finally', difficulty: 1 },
  { primary: 'mjukvaruingenjör', newLang: 'software engineer', difficulty: 1 },
  { primary: 'bild', newLang: 'picture', difficulty: 1 },
  { primary: 'viktig', newLang: 'important', difficulty: 1 },
  { primary: 'kladdig, stökig, rörig', newLang: 'messy', difficulty: 1 },
  { primary: 'ta med din egen', newLang: 'bring your own', difficulty: 1 },
  // Add more words as you wish...
];
*/

const WORD_LIST = [
  { primary: 'låt oss gå', newLang: "let's go", difficulty: 1 },
  { primary: 'Hur mycket är klockan?', newLang: 'What time is it?', difficulty: 1 },
  { primary: 'cykeltur', newLang: 'bike ride', difficulty: 1 },
  { primary: 'däck', newLang: 'tyre', difficulty: 1 },
  { primary: 'punktering', newLang: 'flat tyre', difficulty: 1 },
  { primary: 'galen', newLang: 'crazy', difficulty: 1 },
  { primary: 'pengar', newLang: 'money', difficulty: 1 },
  { primary: 'dålig arm', newLang: 'bad arm', difficulty: 1 },
  { primary: 'bra idé', newLang: 'good idea', difficulty: 1 },
  { primary: 'hämta upp någon', newLang: 'pick someone up', difficulty: 1 },
  // Add more words as you wish...
];


/**
 * Helper to pick a random word whose difficulty <= current level
 */
function getRandomWordForLevel(level, random) {
  const validWords = WORD_LIST.filter(w => w.difficulty <= level);
  const finalList = validWords.length > 0 ? validWords : WORD_LIST; 
  return random.pick(finalList);
}

/**
 * Returns how many extra (wrong) letters to place, based on level
 */
function getNumberOfExtraLetters(level) {
  return Math.min(2 + level, 15); 
}

/**
 * Constants for UI layout, segment size, etc.
 */
const ROOM_MARGIN = 40;      // margin on each side of play area
const TOP_UI_HEIGHT = 40;    // top space for text
const SEGMENT_SIZE = 20;     // each snake segment is 20x20 px
const SNAKE_SPEED = 20;     // speed in pixels/second
// We'll do collisions each frame, so no "tick" interval needed.

/**
 * Snake class (smooth movement).
 * 
 * The snake is an array of Phaser.Rectangle objects. On each
 * update(delta), we move the head by (speed*delta)/1000 in the current
 * direction, and each body segment tries to follow the previous
 * segment's old position (like a "centipede" approach).
 */
class Snake {
  constructor(scene, startX, startY, length = 3) {
    this.scene = scene;
    this.speed = SNAKE_SPEED;
    this.segments = [];
    // The current direction we are heading (dx, dy):
    this.direction = { x: 1, y: 0 }; // start moving right
    this.pendingDirection = null; // store recent input

    // Create the initial snake
    // Head is segment[0], then segment[1], etc
    for (let i = 0; i < length; i++) {
      let x = startX - i * SEGMENT_SIZE;
      let y = startY;
      let color = (i === 0) ? 0x00cc00 : 0x00ff00; // head slightly different
      let rect = scene.add.rectangle(x, y, SEGMENT_SIZE, SEGMENT_SIZE, color)
                       .setOrigin(0.5);
      // Store previous location for "following" logic
      rect.prevX = x;
      rect.prevY = y;
      this.segments.push(rect);
    }
  }

  // A convenience for the head
  get head() {
    return this.segments[0];
  }

  // Called every frame from GameScene.update(...).
  // We move the head smoothly based on how much time has passed.
  update(delta) {
    // If there's a pending direction (from input),
    // and it’s not a 180° reversal, update direction now:
    if (this.pendingDirection) {
      if (!this.isOppositeDirection(this.pendingDirection)) {
        this.direction = { ...this.pendingDirection };
      }
      this.pendingDirection = null;
    }

    // Distance to move this frame:
    const distanceToMove = ((this.speed + this.segments.length) * delta) / 1000;

    // 1. Move head
    const head = this.segments[0];
    head.prevX = head.x;
    head.prevY = head.y;
    head.x += this.direction.x * distanceToMove;
    head.y += this.direction.y * distanceToMove;

    // 2. For each subsequent segment, move it towards
    //    the "prevX, prevY" of the segment in front of it.
    for (let i = 1; i < this.segments.length; i++) {
      let seg = this.segments[i];
      let leader = this.segments[i - 1]; // the segment in front
      let dx = leader.prevX - seg.x;
      let dy = leader.prevY - seg.y;
      let dist = Math.sqrt(dx * dx + dy * dy);

      // If this gap is > SEGMENT_SIZE, we move the segment forward
      // some portion of 'distanceToMove' to keep them from spacing out too far.
      if (dist > SEGMENT_SIZE) {
        // Only move up to (dist - SEGMENT_SIZE) so segments
        // remain roughly SEGMENT_SIZE apart
        let moveStep = Math.min(distanceToMove, dist - SEGMENT_SIZE);
        let angle = Math.atan2(dy, dx);

        seg.prevX = seg.x;
        seg.prevY = seg.y;
        seg.x += Math.cos(angle) * moveStep;
        seg.y += Math.sin(angle) * moveStep;
      } else {
        // Even if dist <= SEGMENT_SIZE, we still store the current position
        seg.prevX = seg.x;
        seg.prevY = seg.y;
      }
    }
  }

  // Attempt to set a new direction (e.g. from arrow keys)
  setDirection(dx, dy) {
    this.pendingDirection = { x: dx, y: dy };
  }

  // A quick check if the new direction is a direct 180° reversal
  isOppositeDirection(newDir) {
    return (
      (this.direction.x === 1 && newDir.x === -1) ||
      (this.direction.x === -1 && newDir.x === 1) ||
      (this.direction.y === 1 && newDir.y === -1) ||
      (this.direction.y === -1 && newDir.y === 1)
    );
  }

  // Add one segment at the tail's position
  grow() {
    let tail = this.segments[this.segments.length - 1];
    let newSegment = this.scene.add.rectangle(
      tail.x,
      tail.y,
      SEGMENT_SIZE,
      SEGMENT_SIZE,
      0x00ff00
    ).setOrigin(0.5);

    // Initialize prevX/Y to match tail
    newSegment.prevX = tail.x;
    newSegment.prevY = tail.y;
    this.segments.push(newSegment);
  }

  // Remove one segment from the tail (if we have any)
  shrink() {
    if (this.segments.length > 0) {
      let seg = this.segments.pop();
      seg.destroy();
    }
  }

  // If you collide with yourself, remove from collision point to tail
  cutTailFrom(index) {
    while (this.segments.length > index) {
      let seg = this.segments.pop();
      seg.destroy();
    }
  }
}


/**
 * BootScene:
 * Simple title screen that transitions into the GameScene.
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // this.load.image('background', 'background.png'); // if you have one
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');

    let stored = localStorage.getItem('wordSnakeLeaderboard');
    let leaderboard = stored ? JSON.parse(stored) : [];
    
    const titleText = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 - 150,
      'Word Snake',
      { fontSize: '48px', fill: '#ffffff' }
    ).setOrigin(0.5);

    let leaderboardTextString = 'Longest Snakes:\n';
    leaderboard.forEach((score, i) => {
      leaderboardTextString += `${i+1}. ${score}\n`;
    });

    // Display the leaderboard lines
    const leaderboardText = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 - 30,
      leaderboardTextString,
      { fontSize: '20px', fill: '#ffffff', align: 'center' }
    ).setOrigin(0.5);
    
    const instructionText = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 + 80,
      'Tap or Press SPACE to Play',
      { fontSize: '24px', fill: '#ffffff' }
    ).setOrigin(0.5);

    const versionText = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 + 150,
      `Version: ${APP_VERSION}`,
      { fontSize: '18px', fill: '#ffffff' }
    ).setOrigin(0.5);

    // Start on SPACE
    this.input.keyboard.once('keydown-SPACE', () => {
      this.scene.start('GameScene', { level: 1 });
    });
    // Or start on pointerdown
    this.input.once('pointerdown', () => {
      this.scene.start('GameScene', { level: 1 });
    });
  }
}


/**
 * GameScene:
 * The main, smooth-moving snake + word-learning gameplay.
 */
class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');

    // Word logic
    this.currentWord = null;
    this.spelledLetters = '';
    this.level = 1;

    // Snake
    this.snake = null;

    // Letters that appear on field
    this.lettersOnField = [];
  }

  create(data) {
    // Define the room (grey area) where the snake moves
    this.room = {
      x: ROOM_MARGIN,
      y: ROOM_MARGIN + 40,
      width: this.scale.width - ROOM_MARGIN * 2,
      height: this.scale.height - ROOM_MARGIN * 2 - 40
    };
  
    // Draw grey background in that area
    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(0x808080, 1); // grey
    bgGraphics.fillRect(this.room.x, this.room.y, this.room.width, this.room.height);

    // Add a pause button on the top-left, for example
    this.paused = false; // track whether the game is paused
    this.pauseButton = this.add.text(
      10, 
      10, 
      'Pause', 
      { fontSize: '20px', fill: '#ffffff', backgroundColor: '#000000' }
    ).setPadding(6).setInteractive();
  
    // When clicked, toggle paused state
    this.pauseButton.on('pointerdown', () => {
      this.togglePause();
    });
    
    // Create snake in the center of the room
    let centerX = this.room.x + this.room.width / 2;
    let centerY = this.room.y + this.room.height / 2;
    centerX = Phaser.Math.Snap.Floor(centerX, SEGMENT_SIZE);
    centerY = Phaser.Math.Snap.Floor(centerY, SEGMENT_SIZE);
    this.snake = new Snake(this, centerX, centerY);

    this.currentLength = this.snake.segments.length;
    this.bestThisGame = this.currentLength;
  
    this.scoreText = this.add.text(
      this.scale.width - 10,
      10,
      `${this.currentLength} (${this.bestThisGame})`, 
      { fontSize: '20px', fill: '#ffffff' }
    ).setOrigin(1, 0);
    
    // Set up keyboard
    this.cursors = this.input.keyboard.createCursorKeys();
    this.setupTouchControls();

    this.levelText = this.add.text(
      this.scale.width / 2,
      10,
      `Level: ${this.level}`,
      { fontSize: '20px', fill: '#ffffff' }
    ).setOrigin(0.5, 0);

    let textheight = this.levelText.displayHeight;
    
    // UI text
    this.primaryWordText = this.add.text(this.scale.width/2, textheight+5, '', { 
      fontSize: '20px', 
      fill: '#ffffff' 
    }).setOrigin(0.5, 0);;
    this.spelledWordText = this.add.text(this.scale.width/2, this.scale.height-textheight-5, '', {
      fontSize: '20px',
      fill: '#ffffff'
    }).setOrigin(0.5, 0); 
 
    // We'll track the letters in this array
    this.lettersOnField = [];
  
    // Start first word
    this.loadNewWord();
  
    // Optional restart key
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  
    // For controlling snake movement timing
    this.lastMoveTime = 0;
  }

  togglePause() {
    this.paused = !this.paused;
    if (this.paused) {
      // Show some overlay text, or change the pause button label
      this.pauseButton.setText('Resume');
      // You might also fade background or display "Paused" in center:
      this.pausedText = this.add.text(
        this.scale.width / 2,
        this.scale.height / 2,
        'PAUSED',
        { fontSize: '48px', fill: '#ff0000' }
      ).setOrigin(0.5);
    } else {
      // Removing or hiding any "Paused" overlay
      this.pauseButton.setText('Pause');
      if (this.pausedText) {
        this.pausedText.destroy();
        this.pausedText = null;
      }
    }
  }
  
  update(time, delta) {  
    // R to force game over for debugging
    if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.gameOver();
      return;
    }

    if (this.paused) {
      // If paused, skip updating the snake or checking collisions.
      // Optionally, still allow certain input if you want.
      return;
    }
    
    // Handle input each frame
    this.handleInput();

    // Smoothly update the snake
    this.snake.update(delta* Math.min(this.scale.width,this.scale.height)/100);

    // After we move, check for collisions:
    this.handleRoomBounds();
    this.handleSelfCollision();
    this.handleLetterCollisions();
  }
  
  updateScoreDisplay() {
    this.currentLength = this.snake.segments.length;
    if (this.currentLength > this.bestThisGame) {
      this.bestThisGame = this.currentLength;
    }
    this.scoreText.setText(`${this.currentLength} (${this.bestThisGame})`);
  }
  
  handleInput() {
    // Keyboard input => set direction
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      this.snake.setDirection(-1, 0);
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      this.snake.setDirection(1, 0);
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      this.snake.setDirection(0, -1);
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
      this.snake.setDirection(0, 1);
    }

    // Touch swipe => set direction
    if (this.swipeDirection) {
      switch (this.swipeDirection) {
        case 'left':  this.snake.setDirection(-1, 0); break;
        case 'right': this.snake.setDirection(1, 0);  break;
        case 'up':    this.snake.setDirection(0, -1); break;
        case 'down':  this.snake.setDirection(0, 1);  break;
      }
      this.swipeDirection = null;
    }
  }

  handleRoomBounds() {
    // If head goes out of the "room," game over.
    const head = this.snake.head;
    if (
      head.x < this.room.x ||
      head.x > this.room.x + this.room.width ||
      head.y < this.room.y ||
      head.y > this.room.y + this.room.height
    ) {
      this.gameOver();
    }
  }

  handleSelfCollision() {
    // If head intersects any body part, cut the tail from there.
    const head = this.snake.head;
    for (let i = 2; i < this.snake.segments.length; i++) {
      let seg = this.snake.segments[i];
      // bounding-box check:
      if (Phaser.Geom.Intersects.RectangleToRectangle(head.getBounds(), seg.getBounds())) {
        // cut tail from i
        this.snake.cutTailFrom(i);
        if (this.snake.segments.length === 0) {
          this.gameOver();
        }
        break;
      }
    }
  }

  handleLetterCollisions() {
    const headBounds = this.snake.head.getBounds();
    for (let i = this.lettersOnField.length - 1; i >= 0; i--) {
      let letterObj = this.lettersOnField[i];
      let letterBounds = letterObj.letterRect.getBounds();
      if (Phaser.Geom.Intersects.RectangleToRectangle(headBounds, letterBounds)) {
        // Remove it from screen
        letterObj.letterText.destroy();
        letterObj.letterRect.destroy();
        this.lettersOnField.splice(i, 1);
        // Collided with a letter
        this.processLetter(letterObj);        
      }
    }
  }
  
  processLetter(letterObj) {
    // The index of the next needed letter in currentWord.newLang
    const nextNeededIndex = this.spelledLetters.length;
    const wordNeeded = this.currentWord.newLang;
  
    // If we still have letters left to spell…
    if (nextNeededIndex < wordNeeded.length) {
      const neededChar = wordNeeded[nextNeededIndex];
  
      if (letterObj.letter === neededChar) {
        // ---- Correct pick in correct order ----
        this.flash(true);
        this.snake.grow();
        this.updateScoreDisplay();
        this.spelledLetters += letterObj.letter;
        this.spelledWordText.setText(this.spelledLetters);
  
        // If fully spelled the entire word, load next
        if (this.spelledLetters.length >= wordNeeded.length) {
          this.loadNewWord();
        }
        // Otherwise, do nothing special; letters remain on the board
      } else {
        // ---- Wrong pick (out of order OR truly not in the word) ----
        this.flash(false);
        this.snake.shrink();
        this.updateScoreDisplay();
        if (this.snake.segments.length === 0) {
          this.gameOver();
          return;
        }
        
        // If the letter is actually part of the word (just out of order),
        // re-spawn it so the player can still collect it correctly later.
        if (wordNeeded.includes(letterObj.letter)) {
          this.spawnLetter(letterObj.letter);
        }
      }
    }
  }
  
  loadNewWord() {
    // Pick a random word for our current level
    const random = new Phaser.Math.RandomDataGenerator();
    this.currentWord = getRandomWordForLevel(this.level, random);
  
    // Reset spelled letters
    this.spelledLetters = '';
  
    // Display new primary word, clear spelled text
    this.primaryWordText.setText(this.currentWord.primary);
    this.spelledWordText.setText('');
  
    // Remove leftover letters from the previous word
    this.removeAllLetters();
  
    // Place letters for the entire newLang word
    this.placeLetters();
  }

  removeAllLetters() {
    // Remove any existing letters
    this.lettersOnField.forEach(letterObj => {
      if (letterObj.letterRect) {
        letterObj.letterRect.destroy();
      }
      if (letterObj.letterText) {
        letterObj.letterText.destroy();
      }
    });
    this.lettersOnField = [];    
  }
    
  placeLetters() {
    // Remove any letters currently on the field
    this.removeAllLetters();
  
    // 1) Place each letter from the entire newLang word
    //    (so if newLang = "hello", we place 'h','e','l','l','o')
    const newLangWord = this.currentWord.newLang;
    for (let i = 0; i < newLangWord.length; i++) {
      const letter = newLangWord[i];
      this.spawnLetter(letter);
    }
  
    // 2) Place extra (wrong) letters
    const extraCount = getNumberOfExtraLetters(this.level);
    const possibleLetters = 'abcdefghijklmnopqrstuvwxyz';
  
    for (let i = 0; i < extraCount; i++) {
      let randLetter = Phaser.Utils.Array.GetRandom(possibleLetters.split(''));
      this.spawnLetter(randLetter);
    }
  }


  
  spawnLetter(letter) {
    const maxAttempts = 100; // avoid infinite loops
    for (let i = 0; i < maxAttempts; i++) {
      // Random position snapped to SEGMENT_SIZE
      let randX = Phaser.Math.Between(this.room.x, this.room.x + this.room.width - SEGMENT_SIZE);
      let randY = Phaser.Math.Between(this.room.y, this.room.y + this.room.height - SEGMENT_SIZE);
      randX = Phaser.Math.Snap.Floor(randX, SEGMENT_SIZE);
      randY = Phaser.Math.Snap.Floor(randY, SEGMENT_SIZE);
      
      // Candidate rectangle for our letter
      let candidateRect = new Phaser.Geom.Rectangle(randX, randY, SEGMENT_SIZE, SEGMENT_SIZE);
  
      // Check collision with existing letters
      let overlaps = false;
      for (let existing of this.lettersOnField) {
        let existingBounds = existing.letterRect.getBounds();
        if (Phaser.Geom.Intersects.RectangleToRectangle(candidateRect, existingBounds)) {
          overlaps = true;
          break;
        }
      }
  
      // If no overlap, place the new letter here
      if (!overlaps) {
        let letterRect = this.add.rectangle(randX, randY, SEGMENT_SIZE, SEGMENT_SIZE, 0xffffff).setOrigin(0);
        let letterText = this.add.text(
          randX + SEGMENT_SIZE/2,
          randY + SEGMENT_SIZE/2,
          letter,
          {
            fontSize: '18px',
            color: '#000000',
            fontFamily: 'sans-serif'
          }
        ).setOrigin(0.5);
  
        this.lettersOnField.push({
          letterRect: letterRect,
          letterText: letterText,
          letter: letter
        });
  
        // Done placing, so exit the function
        return;
      }
    }
  
    // If we exhaust maxAttempts, we’ll just place it anyway (rare corner case)
    console.warn('Could not find non-overlapping position, placing anyway.');
    // Fallback if needed:
    let letterRect = this.add.rectangle(this.room.x, this.room.y, SEGMENT_SIZE, SEGMENT_SIZE, 0xffffff).setOrigin(0);
    let letterText = this.add.text(
      this.room.x + SEGMENT_SIZE/2,
      this.room.y + SEGMENT_SIZE/2,
      letter,
      {
        fontSize: '18px',
        color: '#000000',
        fontFamily: 'sans-serif'
      }
    ).setOrigin(0.5);
  
    this.lettersOnField.push({
      letterRect: letterRect,
      letterText: letterText,
      letter: letter
    });
  }

  flash(good) {
    if (good) {
      this.cameras.main.setBackgroundColor('#00ff00');
      this.time.delayedCall(100, () => {
        this.cameras.main.setBackgroundColor('#000000');
      });
    } else {
      this.cameras.main.setBackgroundColor('#ff0000');
      this.time.delayedCall(100, () => {
        this.cameras.main.setBackgroundColor('#000000');
      });
    }
  }

  gameOver() {
    // Retrieve existing leaderboard
    let stored = localStorage.getItem('wordSnakeLeaderboard');
    let leaderboard = stored ? JSON.parse(stored) : [];
  
    // Insert this game’s best length
    leaderboard.push(this.bestThisGame);
  
    // Sort descending
    leaderboard.sort((a, b) => b - a);
  
    // Keep top 5
    leaderboard = leaderboard.slice(0, 5);
  
    // Save back to localStorage
    localStorage.setItem('wordSnakeLeaderboard', JSON.stringify(leaderboard));
  
    // Then go back to BootScene
    this.scene.start('BootScene');
  }

  setupTouchControls() {
    this.swipeDirection = null;
    let swipeCoordX, swipeCoordY, swipeCoordX2, swipeCoordY2;
    const swipeMinDistance = 20;

    this.input.on('pointerdown', (pointer) => {
      swipeCoordX = pointer.downX;
      swipeCoordY = pointer.downY;
    });
    this.input.on('pointerup', (pointer) => {
      swipeCoordX2 = pointer.upX;
      swipeCoordY2 = pointer.upY;

      let deltaX = swipeCoordX2 - swipeCoordX;
      let deltaY = swipeCoordY2 - swipeCoordY;

      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        if (Math.abs(deltaX) > swipeMinDistance) {
          this.swipeDirection = (deltaX > 0) ? 'right' : 'left';
        }
      } else {
        if (Math.abs(deltaY) > swipeMinDistance) {
          this.swipeDirection = (deltaY > 0) ? 'down' : 'up';
        }
      }
    });
  }
}


/**
 * Phaser config. Re-using your scaling approach.
 */
const config = {
  type: Phaser.AUTO,
  backgroundColor: '#000000',
  scene: [BootScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container',
  },
  render: {
    pixelArt: true,
    antialias: false,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 0 },
      debug: false,
    },
  },
};

const game = new Phaser.Game(config);
