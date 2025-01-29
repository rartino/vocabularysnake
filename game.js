/*******************************************************************
 * game.js
 * A Snake/Word-learning game with tile-based, smooth movement
 * in the style of your original "centipede" code.
 *******************************************************************/

const APP_VERSION = window.APP_VERSION || '(Unknown)';

/**
 * SAMPLE WORD DATA
 * Each entry: { primary, newLang, difficulty }.
 */
const WORD_LIST = [
  { primary: 'Hello', newLang: 'Hola', difficulty: 1 },
  { primary: 'Cat', newLang: 'Gato', difficulty: 1 },
  { primary: 'Dog', newLang: 'Perro', difficulty: 2 },
  { primary: 'Goodbye', newLang: 'Adiós', difficulty: 2 },
  { primary: 'Thanks', newLang: 'Gracias', difficulty: 2 },
  { primary: 'Mother', newLang: 'Madre', difficulty: 3 },
  { primary: 'Father', newLang: 'Padre', difficulty: 3 },
  { primary: 'Night', newLang: 'Noche', difficulty: 3 },
  { primary: 'Day', newLang: 'Día', difficulty: 1 },
  { primary: 'Food', newLang: 'Comida', difficulty: 2 },
  // Add more as you like...
];

/** Filter words by difficulty, pick random */
function getRandomWordForLevel(level, random) {
  const valid = WORD_LIST.filter(w => w.difficulty <= level);
  const finalList = valid.length > 0 ? valid : WORD_LIST; // fallback if none
  return random.pick(finalList);
}

/** Decide how many "wrong" letters to show at this level */
function getNumberOfExtraLetters(level) {
  return Math.min(6 + level, 15);
}

/** SCENE: BootScene
 * Simple title screen, then go to GameScene(level=1).
 */
class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // If you have a background image, load here
    // this.load.image('background', 'background.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#000000');

    // Title
    this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 - 50,
      'Word Snake',
      { fontSize: '48px', fill: '#ffffff' }
    ).setOrigin(0.5);

    // Instruction
    this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 + 20,
      'Tap or Press SPACE to Play',
      { fontSize: '24px', fill: '#ffffff' }
    ).setOrigin(0.5);

    // Version
    this.add.text(
      this.scale.width / 2,
      this.scale.height / 2 + 80,
      `Version: ${APP_VERSION}`,
      { fontSize: '18px', fill: '#ffffff' }
    ).setOrigin(0.5);

    // Start on SPACE
    this.input.keyboard.once('keydown-SPACE', () => {
      this.scene.start('GameScene', { level: 1 });
    });

    // Start on pointerdown
    this.input.once('pointerdown', () => {
      this.scene.start('GameScene', { level: 1 });
    });
  }
}

/*******************************************************************
 * CONSTANTS for the Snake & board
 ******************************************************************/
const TILE_SIZE = 20;         // Each tile is 20x20 pixels
const SNAKE_SPEED = 6;        // tiles per second
const ROOM_MARGIN = 40;       // margin around the play area
const TOP_UI_HEIGHT = 40;     // space for top text

/*******************************************************************
 * The Snake class (tile-based, partial movement).
 * Similar to your "centipede" logic but under user control.
 ******************************************************************/
class Snake {
  constructor(scene, startTileX, startTileY, length = 3) {
    this.scene = scene;
    this.speed = SNAKE_SPEED;  // in tiles/sec
    this.direction = { dx: 1, dy: 0 }; // move right by default
    this.pendingDirection = null;      // store last input

    this.segments = [];
    for (let i = 0; i < length; i++) {
      const tileX = startTileX - i; // horizontally placed
      const tileY = startTileY;
      // Create a rectangular segment
      let color = (i === 0) ? 0x00cc00 : 0x00ff00; // head is slightly different
      const xPos = this.toPixelX(tileX);
      const yPos = this.toPixelY(tileY);

      let seg = scene.add.rectangle(xPos, yPos, TILE_SIZE, TILE_SIZE, color);
      seg.setOrigin(0.5);
      seg.tileX = tileX;
      seg.tileY = tileY;
      seg.prevX = xPos;
      seg.prevY = yPos;
      seg.targetX = xPos;
      seg.targetY = yPos;
      this.segments.push(seg);
    }
  }

  // Convert tile coords to pixel coords for centering
  toPixelX(tileX) {
    return tileX * TILE_SIZE + TILE_SIZE / 2 + this.scene.room.x;
  }
  toPixelY(tileY) {
    return tileY * TILE_SIZE + TILE_SIZE / 2 + this.scene.room.y;
  }

  // Head segment is always at index 0
  get head() {
    return this.segments[0];
  }

  // Called by the scene’s update(time, delta)
  update(delta) {
    // 1) Check if we have a pending direction and it’s not a 180° turn
    if (this.pendingDirection) {
      let { dx, dy } = this.pendingDirection;
      // Prevent direct reversal
      if (!this.isOpposite(dx, dy)) {
        // We only apply the new direction if the head is at its tile center 
        // (i.e., done moving to the old target). Otherwise, the direction
        // will apply once it arrives. This is typical tile-based Snake logic.
        const head = this.head;
        const distToTarget = Phaser.Math.Distance.Between(
          head.x, head.y, head.targetX, head.targetY
        );
        if (distToTarget < 1) {
          this.direction = { dx, dy };
        }
      }
      this.pendingDirection = null;
    }

    // 2) Calculate how many pixels to move this frame
    const distanceToMove = (this.speed * delta * TILE_SIZE) / 1000;

    // Update head first
    this.updateHead(distanceToMove);

    // Update body segments
    for (let i = 1; i < this.segments.length; i++) {
      this.updateBodySegment(i, distanceToMove);
    }
  }

  updateHead(distanceToMove) {
    const head = this.head;

    // If the head has no target, set a new target = current tile + direction
    if (head.targetX === null || head.targetY === null) {
      this.setNewTargetForSegment(0);
    }

    // Move partially toward target
    let dx = head.targetX - head.x;
    let dy = head.targetY - head.y;
    let dist = Math.sqrt(dx * dx + dy * dy);

    if (dist <= distanceToMove) {
      // We can fully reach the target this frame
      head.x = head.targetX;
      head.y = head.targetY;
      head.prevX = head.x;
      head.prevY = head.y;

      // Update tile coords based on direction
      head.tileX += this.direction.dx;
      head.tileY += this.direction.dy;

      // Snap to tile center, set next target
      this.setNewTargetForSegment(0);
    } else {
      // Move partially
      let angle = Math.atan2(dy, dx);
      head.prevX = head.x;
      head.prevY = head.y;
      head.x += Math.cos(angle) * distanceToMove;
      head.y += Math.sin(angle) * distanceToMove;
    }
  }

  updateBodySegment(i, distanceToMove) {
    const seg = this.segments[i];
    const prevSeg = this.segments[i - 1];

    // If the body segment has no target (at startup), set it to its own coords
    if (seg.targetX === null || seg.targetY === null) {
      seg.targetX = seg.x;
      seg.targetY = seg.y;
    }

    // If this segment has "arrived" at its target, set a new target = 
    // the previous segment's *old* position (prevX/prevY).
    let distToTarget = Phaser.Math.Distance.Between(seg.x, seg.y, seg.targetX, seg.targetY);
    if (distToTarget < 1) {
      seg.x = seg.targetX;
      seg.y = seg.targetY;
      seg.prevX = seg.x;
      seg.prevY = seg.y;
      seg.targetX = prevSeg.prevX;
      seg.targetY = prevSeg.prevY;
      return;
    }

    // Otherwise move partially
    let dx = seg.targetX - seg.x;
    let dy = seg.targetY - seg.y;
    let dist = Math.sqrt(dx * dx + dy * dy);
    if (dist <= distanceToMove) {
      // Snap
      seg.prevX = seg.x;
      seg.prevY = seg.y;
      seg.x = seg.targetX;
      seg.y = seg.targetY;
    } else {
      // partial
      let angle = Math.atan2(dy, dx);
      seg.prevX = seg.x;
      seg.prevY = seg.y;
      seg.x += Math.cos(angle) * distanceToMove;
      seg.y += Math.sin(angle) * distanceToMove;
    }
  }

  // For the head: sets a new target = (tileX + direction.dx, tileY + direction.dy)
  setNewTargetForSegment(index) {
    const seg = this.segments[index];
    if (index === 0) {
      // HEAD
      const newTileX = seg.tileX + this.direction.dx;
      const newTileY = seg.tileY + this.direction.dy;
      seg.targetX = this.toPixelX(newTileX);
      seg.targetY = this.toPixelY(newTileY);
    } else {
      // BODY
      // Usually we do "seg.targetX = the segment in front's prevX," done in updateBodySegment
      // so no extra logic needed here for the body in this function.
    }
  }

  // Enqueue a direction change (we’ll apply it once we get to tile center)
  setDirection(dx, dy) {
    this.pendingDirection = { dx, dy };
  }

  isOpposite(dx, dy) {
    return (
      (this.direction.dx === 1 && dx === -1) ||
      (this.direction.dx === -1 && dx === 1) ||
      (this.direction.dy === 1 && dy === -1) ||
      (this.direction.dy === -1 && dy === 1)
    );
  }

  // Add a segment at the tail (like “grow”)
  grow() {
    const tail = this.segments[this.segments.length - 1];

    // Create a new segment in the exact same spot as the tail
    let newSeg = this.scene.add.rectangle(tail.x, tail.y, TILE_SIZE, TILE_SIZE, 0x00ff00);
    newSeg.setOrigin(0.5);
    newSeg.prevX = tail.x;
    newSeg.prevY = tail.y;
    // Keep tileX/tileY the same (it will correct itself as it moves)
    newSeg.tileX = tail.tileX;
    newSeg.tileY = tail.tileY;
    newSeg.targetX = tail.targetX;
    newSeg.targetY = tail.targetY;

    this.segments.push(newSeg);
  }

  // Remove 1 segment from the tail
  shrink() {
    if (this.segments.length > 0) {
      const seg = this.segments.pop();
      seg.destroy();
    }
  }

  // If we collide with ourselves, we cut from collision index to the tail
  cutTailFrom(index) {
    while (this.segments.length > index) {
      const seg = this.segments.pop();
      seg.destroy();
    }
  }
}

/*******************************************************************
 * GameScene
 * The main “snake collects letters” gameplay. 
 ******************************************************************/
class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');

    // Word logic
    this.currentWord = null;
    this.spelledLetters = '';

    // Snake
    this.snake = null;
    this.level = 1;

    // Letters in the field
    this.lettersOnField = [];
  }

  create(data) {
    this.level = data.level || 1;
    this.cameras.main.setBackgroundColor('#000000');

    // The playable “room”
    this.room = {
      x: ROOM_MARGIN,
      y: ROOM_MARGIN + TOP_UI_HEIGHT,
      width: this.scale.width - ROOM_MARGIN * 2,
      height: this.scale.height - ROOM_MARGIN * 2 - TOP_UI_HEIGHT,
    };

    // Convert that to how many tiles wide/high
    this.tileCountX = Math.floor(this.room.width / TILE_SIZE);
    this.tileCountY = Math.floor(this.room.height / TILE_SIZE);

    // Start the snake near the center tile
    const startTileX = Math.floor(this.tileCountX / 2);
    const startTileY = Math.floor(this.tileCountY / 2);

    this.snake = new Snake(this, startTileX, startTileY, 3);

    // UI texts
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

    // Keyboard input
    this.cursors = this.input.keyboard.createCursorKeys();
    this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.R);

    // Swipe/touch
    this.setupTouchControls();

    // Start with a new word
    this.loadNewWord();
  }

  update(time, delta) {
    // Press "R" => immediate gameOver (debug)
    if (Phaser.Input.Keyboard.JustDown(this.restartKey)) {
      this.gameOver();
      return;
    }

    // Handle input
    this.handleInput();

    // Update snake positions (smooth movement)
    this.snake.update(delta);

    // Check collisions
    this.checkWallCollision();
    this.checkSelfCollision();
    this.checkLetterCollisions();
  }

  handleInput() {
    // Keyboard
    if (Phaser.Input.Keyboard.JustDown(this.cursors.left)) {
      this.snake.setDirection(-1, 0);
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right)) {
      this.snake.setDirection(1, 0);
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.up)) {
      this.snake.setDirection(0, -1);
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.down)) {
      this.snake.setDirection(0, 1);
    }

    // Touch-based swipe
    if (this.swipeDirection) {
      switch (this.swipeDirection) {
        case 'left':  this.snake.setDirection(-1, 0);  break;
        case 'right': this.snake.setDirection(1, 0);   break;
        case 'up':    this.snake.setDirection(0, -1);  break;
        case 'down':  this.snake.setDirection(0, 1);   break;
      }
      this.swipeDirection = null;
    }
  }

  checkWallCollision() {
    // If the snake's head tile is outside the tileCount range => game over
    const head = this.snake.head;
    // Convert (head.x, head.y) back to tile coords
    let tileX = Math.floor((head.x - this.room.x) / TILE_SIZE);
    let tileY = Math.floor((head.y - this.room.y) / TILE_SIZE);

    if (tileX < 0 || tileX >= this.tileCountX || tileY < 0 || tileY >= this.tileCountY) {
      this.gameOver();
    }
  }

  checkSelfCollision() {
    // If the head's bounding box intersects any body segment => cut tail
    const headBounds = this.snake.head.getBounds();
    for (let i = 1; i < this.snake.segments.length; i++) {
      let seg = this.snake.segments[i];
      let segBounds = seg.getBounds();

      if (Phaser.Geom.Intersects.RectangleToRectangle(headBounds, segBounds)) {
        // cut from i
        this.snake.cutTailFrom(i);
        if (this.snake.segments.length === 0) {
          this.gameOver();
        }
        break;
      }
    }
  }

  checkLetterCollisions() {
    const headBounds = this.snake.head.getBounds();
    for (let i = this.lettersOnField.length - 1; i >= 0; i--) {
      let letterObj = this.lettersOnField[i];
      let letterBounds = letterObj.textObj.getBounds();
      if (Phaser.Geom.Intersects.RectangleToRectangle(headBounds, letterBounds)) {
        // Collides with that letter
        this.handleLetter(letterObj);
        letterObj.textObj.destroy();
        this.lettersOnField.splice(i, 1);
      }
    }
  }

  handleLetter(letterObj) {
    if (letterObj.correct) {
      // Good letter => snake grows, add letter to spelled word
      this.snake.grow();
      this.spelledLetters += letterObj.letter;
      this.spelledWordText.setText(this.spelledLetters);

      // Check if we finished the word
      if (this.spelledLetters.length >= this.currentWord.newLang.length) {
        this.loadNewWord();
      } else {
        // Re-place letters
        this.placeLetters();
      }
    } else {
      // Wrong letter => flash red, snake loses segment
      this.flashRed();
      this.snake.shrink();
      if (this.snake.segments.length === 0) {
        this.gameOver();
        return;
      }
      // Re-place letters
      this.placeLetters();
    }
  }

  loadNewWord() {
    // pick a new word
    const random = new Phaser.Math.RandomDataGenerator();
    this.currentWord = getRandomWordForLevel(this.level, random);
    this.spelledLetters = '';
    this.primaryWordText.setText(this.currentWord.primary);
    this.spelledWordText.setText('');

    // remove old letters
    this.lettersOnField.forEach(obj => obj.textObj.destroy());
    this.lettersOnField = [];

    // place letters for next needed letter
    this.placeLetters();
  }

  placeLetters() {
    // clear existing
    this.lettersOnField.forEach(obj => obj.textObj.destroy());
    this.lettersOnField = [];

    // The next correct letter we need
    const neededLetter = this.currentWord.newLang[this.spelledLetters.length];

    // place that one correct letter
    this.createLetter(neededLetter, true);

    // plus some wrong letters
    const extraCount = getNumberOfExtraLetters(this.level);
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzÑñÁÉÍÓÚÜ';

    for (let i = 0; i < extraCount; i++) {
      let randomLetter = neededLetter;
      while (randomLetter === neededLetter) {
        randomLetter = Phaser.Utils.Array.GetRandom(possible.split(''));
      }
      this.createLetter(randomLetter, false);
    }
  }

  createLetter(letter, isCorrect) {
    // pick a random tile in [0..tileCountX-1], [0..tileCountY-1]
    // then convert to pixel coords
    let tx = Phaser.Math.Between(0, this.tileCountX - 1);
    let ty = Phaser.Math.Between(0, this.tileCountY - 1);

    let xPos = this.room.x + tx * TILE_SIZE;
    let yPos = this.room.y + ty * TILE_SIZE;

    // We'll place the text with a slight offset so it's visually centered in the tile
    let textObj = this.add.text(xPos + 2, yPos + 2, letter, {
      fontSize: '20px',
      fill: isCorrect ? '#00ff00' : '#ffffff'
    });

    this.lettersOnField.push({
      textObj: textObj,
      letter: letter,
      correct: isCorrect
    });
  }

  flashRed() {
    this.cameras.main.setBackgroundColor('#ff0000');
    this.time.delayedCall(100, () => {
      this.cameras.main.setBackgroundColor('#000000');
    });
  }

  gameOver() {
    // Return to BootScene or a dedicated "GameOverScene"
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

/** Phaser config */
const config = {
  type: Phaser.AUTO,
  backgroundColor: '#000000',
  scene: [BootScene, GameScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: window.innerWidth,
    height: window.innerHeight,
    parent: 'game-container'
  },
  render: {
    pixelArt: true,
    antialias: false
  },
  physics: {
    default: 'arcade',
    arcade: { gravity: { y: 0 }, debug: false }
  }
};

const game = new Phaser.Game(config);
