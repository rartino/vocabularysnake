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
const WORD_LIST = [
  { primary: 'idrottshall', newLang: 'sports centre', difficulty: 1 },
  { primary: 'ta reda på', newLang: 'find out', difficulty: 1 },
  { primary: 'bibliotek', newLang: 'library', difficulty: 2 },
  { primary: 'språk', newLang: 'language', difficulty: 2 },
  { primary: 'avslutningsvis', newLang: 'finally', difficulty: 2 },
  { primary: 'mjukvaruingenjör', newLang: 'software engineer', difficulty: 3 },
  { primary: 'bild', newLang: 'picture', difficulty: 3 },
  { primary: 'viktig', newLang: 'important', difficulty: 3 },
  { primary: 'kladdig, stökig, rörig', newLang: 'messy', difficulty: 1 },
  { primary: 'ta med din egen', newLang: 'bring your own', difficulty: 2 },
  // Add more words as you wish...
];

/**
 * Helper: get random word from WORD_LIST with difficulty <= level
 */
function getRandomWordForLevel(level, random) {
  // Filter the word list by difficulty
  const validWords = WORD_LIST.filter(w => w.difficulty <= level);

  // If no words exist at that level, fallback to entire list 
  // or handle differently as desired:
  const finalList = validWords.length > 0 ? validWords : WORD_LIST;

  // Pick one at random
  return random.pick(finalList);
}

/**
 * Constants for game layout
 */
const ROOM_MARGIN = 40;   // Margin on each side of the "room"
const SNAKE_SPEED = 5;    // Movement speed in pixels/frame
const SEGMENT_SIZE = 20;  // Each segment is a 20x20 square
const UPDATE_INTERVAL = 80; // Snake "ticks" (ms per movement update)

// We will place letters randomly in the "room" area
// The bigger the level, the more random (incorrect) letters to show.
function getNumberOfExtraLetters(level) {
  return Math.min(6 + level, 15); 
  // e.g. level 1 => 7 extra letters, grows with level but caps at 15
}


/**
 * Snake class
 * Manages a list of segments, the direction, etc.
 * 
 * The snake’s “head” is the first element in this.segments.
 */
// -- Snake constructor replacement --
class Snake {
  constructor(scene, startX, startY) {
    this.scene = scene;
    this.segments = [];
    this.direction = 'right';
    this.pendingDirection = null;

    // Start with length of 2
    for (let i = 0; i < 2; i++) {
      let x = startX - i * SEGMENT_SIZE;
      let y = startY;
      let segment = scene.add.rectangle(x, y, SEGMENT_SIZE, SEGMENT_SIZE, 0x00ff00).setOrigin(0);
      this.segments.push(segment);
    }
  }

  get head() {
    return this.segments[0];
  }

  move() {
    if (this.pendingDirection && !this.isOppositeDirection(this.pendingDirection)) {
      this.direction = this.pendingDirection;
    }
    this.pendingDirection = null;

    const oldPositions = this.segments.map(s => ({ x: s.x, y: s.y }));

    let newHeadX = this.head.x;
    let newHeadY = this.head.y;
    switch (this.direction) {
      case 'left':  newHeadX -= SEGMENT_SIZE; break;
      case 'right': newHeadX += SEGMENT_SIZE; break;
      case 'up':    newHeadY -= SEGMENT_SIZE; break;
      case 'down':  newHeadY += SEGMENT_SIZE; break;
    }
    this.head.setPosition(newHeadX, newHeadY);

    for (let i = 1; i < this.segments.length; i++) {
      this.segments[i].setPosition(oldPositions[i - 1].x, oldPositions[i - 1].y);
    }
  }

  grow() {
    const tail = this.segments[this.segments.length - 1];
    let newSegment = this.scene.add.rectangle(
      tail.x,
      tail.y,
      SEGMENT_SIZE,
      SEGMENT_SIZE,
      0x00ff00
    ).setOrigin(0);
    this.segments.push(newSegment);
  }

  shrink(count = 1) {
    // Remove `count` segments from the tail
    while (count > 0 && this.segments.length > 0) {
      const tail = this.segments.pop();
      tail.destroy();
      count--;
    }
    // If snake ever drops below length 2, game over
    if (this.segments.length < 2) {
      this.scene.gameOver();
    }
  }

  cutTailFrom(collisionIndex) {
    // Remove segments from collisionIndex to the end
    const removeCount = this.segments.length - collisionIndex;
    for (let i = 0; i < removeCount; i++) {
      let seg = this.segments.pop();
      seg.destroy();
    }
    // Check length after cutting
    if (this.segments.length < 2) {
      this.scene.gameOver();
    }
  }

  setDirection(dir) {
    this.pendingDirection = dir;
  }

  isOppositeDirection(dir) {
    return (
      (this.direction === 'left'  && dir === 'right') ||
      (this.direction === 'right' && dir === 'left')  ||
      (this.direction === 'up'    && dir === 'down')  ||
      (this.direction === 'down'  && dir === 'up')
    );
  }
}


/**
 * BootScene:
 * Displays a title screen and waits for user input to start the game.
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // You can have a background image here if desired
    // this.load.image('background', 'background.png');
  }

  create() {
    // Optional: fill background with black
    this.cameras.main.setBackgroundColor('#000000');

    // Title
    const titleText = this.add.text(
      this.scale.width / 2, 
      this.scale.height / 2 - 50, 
      'Vocabulary Snake', 
      {
        fontSize: '48px', 
        fill: '#ffffff',
        fontFamily: 'sans-serif'
      }
    ).setOrigin(0.5);

    // Start instruction
    const instructionText = this.add.text(
      this.scale.width / 2, 
      this.scale.height / 2 + 20, 
      'Tap or Press SPACE to Play', 
      {
        fontSize: '24px',
        fill: '#ffffff',
        fontFamily: 'sans-serif'
      }
    ).setOrigin(0.5);

    // Version at the bottom
    const versionText = this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 + 80,
      `Version: ${APP_VERSION}`,
      { fontSize: '18px', fill: '#ffffff' }
    ).setOrigin(0.5);

    // Start on space bar
    this.input.keyboard.once('keydown-SPACE', () => {
      this.scene.start('GameScene', { level: 1 });
    });

    // Start on pointerdown (touch/click)
    this.input.once('pointerdown', () => {
      this.scene.start('GameScene', { level: 1 });
    });
  }
}


/**
 * GameScene:
 * The main snake + word-learning gameplay happens here.
 */
class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
    this.level = 1;
    this.score = 0; // If you want to track points

    // Word logic
    this.currentWord = null;        // e.g. { primary: 'Hello', newLang: 'Hola', difficulty: 1 }
    this.spelledLetters = '';       // e.g. 'Ho' if we've collected 'H' and 'o'
    this.nextLetterIndex = 0;       // which letter in newLang are we looking for next?
    
    // Snake
    this.snake = null;
    this.lastMoveTime = 0;  // track when we last moved

    // Letters on the field
    this.lettersOnField = [];  // array of { textObj, letter, correct }
  }

  create(data) {
    this.level = data.level || 1;
    this.cameras.main.setBackgroundColor('#000000'); // Overall black if you like
  
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
  
    // Create snake in the center of the room
    let centerX = this.room.x + this.room.width / 2;
    let centerY = this.room.y + this.room.height / 2;
    centerX = Phaser.Math.Snap.Floor(centerX, SEGMENT_SIZE);
    centerY = Phaser.Math.Snap.Floor(centerY, SEGMENT_SIZE);
    this.snake = new Snake(this, centerX, centerY);
  
    // Set up keyboard
    this.cursors = this.input.keyboard.createCursorKeys();
    this.setupTouchControls();
  
    // UI text
    this.primaryWordText = this.add.text(10, 10, '', { fontSize: '20px', fill: '#ffffff' });
    this.spelledWordText = this.add.text(this.scale.width - 10, 10, '', {
      fontSize: '20px',
      fill: '#ffffff'
    }).setOrigin(1, 0);
  
    this.levelText = this.add.text(
      this.scale.width / 2,
      10,
      `Level: ${this.level}`,
      { fontSize: '20px', fill: '#ffffff' }
    ).setOrigin(0.5, 0);
  
    // We'll track the letters in this array
    this.lettersOnField = [];
  
    // Start first word
    this.loadNewWord();
  
    // Optional restart key
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);
  
    // For controlling snake movement timing
    this.lastMoveTime = 0;
  }

  update(time, delta) {
    // If R is pressed => simulate losing a life or just restart for debug
    if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.gameOver();
      return;
    }

    // Check input 
    this.handleInput();

    // Move the snake on a timed basis (like a typical Snake game "tick")
    if (time - this.lastMoveTime > UPDATE_INTERVAL) {
      this.snake.move();
      this.lastMoveTime = time;

      // Check for collisions with boundaries
      this.handleWallCollision();
      // Check for collisions with itself
      this.handleSelfCollision();
      // Check for collisions with letters
      this.handleLetterCollisions();
    }
  }

  handleInput() {
    // Keyboard
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      this.snake.setDirection('left');
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      this.snake.setDirection('right');
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      this.snake.setDirection('up');
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
      this.snake.setDirection('down');
    }

    // Or swipe direction from touch
    if (this.swipeDirection) {
      switch (this.swipeDirection) {
        case 'left':  this.snake.setDirection('left');  break;
        case 'right': this.snake.setDirection('right'); break;
        case 'up':    this.snake.setDirection('up');    break;
        case 'down':  this.snake.setDirection('down');  break;
      }
      this.swipeDirection = null; // reset
    }
  }

  handleWallCollision() {
    const head = this.snake.head;
    const x = head.x;
    const y = head.y;

    // Check if outside the "room"
    if (x < this.room.x || x >= this.room.x + this.room.width ||
        y < this.room.y || y >= this.room.y + this.room.height) {
      // If you like, you can bounce or something, but typically snake game is over
      // or you lose a segment. We'll do a "game over" here:
      this.gameOver();
    }
  }

  handleSelfCollision() {
    // If head overlaps with any other segment, we remove tail behind collision.
    const head = this.snake.head;
    for (let i = 1; i < this.snake.segments.length; i++) {
      let seg = this.snake.segments[i];
      if (Phaser.Geom.Intersects.RectangleToRectangle(head.getBounds(), seg.getBounds())) {
        // Cut the snake from i
        this.snake.cutTailFrom(i);
        // If that leaves us with 0 length, game over
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
      let rectBounds = letterObj.letterRect.getBounds();
  
      if (Phaser.Geom.Intersects.RectangleToRectangle(headBounds, rectBounds)) {
        // Collided with this letter
        this.processLetter(letterObj);
  
        // Remove from scene
        letterObj.letterRect.destroy();
        letterObj.letterText.destroy();
        this.lettersOnField.splice(i, 1);
      }
    }
  }

  processLetter(letterObj) {
    if (letterObj.correct) {
      // Correct letter
      this.snake.grow();
      this.spelledLetters += letterObj.letter;
      this.updateSpelledWordText();

      // If spelled the entire newLang word, load next word
      if (this.spelledLetters.length >= this.currentWord.newLang.length) {
        // Completed word => get next
        this.loadNewWord();
      } else {
        // Just add new letters
        this.placeLetters();
      }
    } else {
      // Wrong letter => blink red, lose one segment if possible
      this.flashRed();
      if (this.snake.segments.length > 0) {
        this.snake.shrink(1);
        if (this.snake.segments.length === 0) {
          this.gameOver();
          return;
        }
      }
      // Replace letters so the user can try again
      this.placeLetters();
    }
  }

  loadNewWord() {
    // The game might progress levels after X words, or for simplicity we just keep
    // the level as is, or you can do something else to increment the level after each new word.
    const random = new Phaser.Math.RandomDataGenerator();
    this.currentWord = getRandomWordForLevel(this.level, random);
    this.spelledLetters = '';
    this.updatePrimaryWordText();
    this.updateSpelledWordText();

    // Clear existing letters from the screen
    this.lettersOnField.forEach(letter => letter.textObj.destroy());
    this.lettersOnField = [];

    // Place new letters
    this.placeLetters();
  }

  placeLetters() {
    // Remove any existing letters
    this.lettersOnField.forEach(letter => letter.textObj.destroy());
    this.lettersOnField = [];

    // Next correct letter we need:
    const neededLetter = this.currentWord.newLang[this.spelledLetters.length];

    // Put that letter in the field:
    this.createLetter(neededLetter, true);

    // Put extra letters that are random (and wrong)
    let extraCount = getNumberOfExtraLetters(this.level);
    for (let i = 0; i < extraCount; i++) {
      // Generate a random letter from the ASCII (or you can do more advanced logic).
      // Make sure it’s not the needed letter (to guarantee it’s "wrong").
      let possibleLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÑñÁÉÍÓÚÜ';
      let letterCandidate = neededLetter; 
      while (letterCandidate === neededLetter) {
        letterCandidate = Phaser.Utils.Array.GetRandom(possibleLetters.split(''));
      }
      this.createLetter(letterCandidate, false);
    }
  }

  createLetter(letter, isCorrect) {
    // Random position snapped to SEGMENT_SIZE
    let randX = Phaser.Math.Between(this.room.x, this.room.x + this.room.width - SEGMENT_SIZE);
    let randY = Phaser.Math.Between(this.room.y, this.room.y + this.room.height - SEGMENT_SIZE);
    randX = Phaser.Math.Snap.Floor(randX, SEGMENT_SIZE);
    randY = Phaser.Math.Snap.Floor(randY, SEGMENT_SIZE);
  
    // A white rectangle exactly SEGMENT_SIZE x SEGMENT_SIZE
    let letterRect = this.add.rectangle(randX, randY, SEGMENT_SIZE, SEGMENT_SIZE, 0xffffff)
      .setOrigin(0);
  
    // Outline if you like (optional):
    // letterRect.setStrokeStyle(1, 0x000000);
  
    // Black text, centered in the rectangle
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
      letter: letter,
      correct: isCorrect
    });
  }

  updatePrimaryWordText() {
    if (this.currentWord) {
      this.primaryWordText.setText(this.currentWord.primary);
    }
  }

  updateSpelledWordText() {
    this.spelledWordText.setText(this.spelledLetters);
  }

  flashRed() {
    // Quickly flash the screen red
    this.cameras.main.setBackgroundColor('#ff0000');
    this.time.delayedCall(100, () => {
      this.cameras.main.setBackgroundColor('#000000');
    });
  }

  gameOver() {
    // For now, we’ll just return to BootScene, or you can show a "Game Over" scene
    this.scene.start('BootScene');
  }

  setupTouchControls() {
    this.swipeDirection = null;
    let swipeCoordX, swipeCoordY, swipeCoordX2, swipeCoordY2;
    let swipeMinDistance = 20;

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
          this.swipeDirection = deltaX > 0 ? 'right' : 'left';
        }
      } else {
        if (Math.abs(deltaY) > swipeMinDistance) {
          this.swipeDirection = deltaY > 0 ? 'down' : 'up';
        }
      }
    });
  }
}


/**
 * Phaser game config
 * Re-using your existing canvas scaling approach.
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
      debug: false
    }
  }
};

// Create the Phaser game instance
const game = new Phaser.Game(config);
