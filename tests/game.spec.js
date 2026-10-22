const { test, expect } = require('@playwright/test');
const fs = require('fs');
const { execFileSync } = require('child_process');
const UPSTREAM = '6bc096ad9e25137ae27eb536a6eac1d056be7506';

async function ready(page) {
  await page.goto('/ko/?debug=1');
  await page.waitForFunction(() => window.__tataru);
  await page.evaluate(() => {
    const { game, ticker } = window.__tataru;
    ticker.stop();
    game.restart();
    game.paused = true;
  });
}
async function step(page, frames) {
  return page.evaluate((count) => {
    const { game, renderer, stage } = window.__tataru;
    game.paused = false;
    for (let i = 0; i < count; i++) game.gameLoop();
    game.paused = true;
    renderer.render(stage);
    return game.state.name;
  }, frames);
}
async function key(page, code, frames = 1) {
  await page.keyboard.down(code);
  await step(page, frames);
  await page.keyboard.up(code);
  await step(page, 1);
}
async function menu(page) {
  await ready(page);
  await step(page, 265);
}
async function start(page, which = 'z') {
  await menu(page);
  await key(page, which);
  await step(page, 105);
}

test('original keys, physics, background atlas, CSS and original sound files are unchanged', () => {
  const textFiles = [
    'src/resources/js/physics.js',
    'src/resources/js/rand.js',
    'src/resources/js/keyboard.js',
    'src/resources/js/audio.js',
    'src/resources/js/cloud_and_wave.js',
    'src/resources/style.css',
    'src/resources/assets/images/sprite_sheet.json',
  ];
  for (const file of textFiles) {
    const before = execFileSync('git', ['show', `${UPSTREAM}:${file}`], {
      encoding: 'utf8',
    });
    expect(fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n'), file).toBe(
      before.replace(/\r\n/g, '\n')
    );
  }
  const binaries = [
    'src/resources/assets/images/sprite_sheet.png',
    ...execFileSync(
      'git',
      ['ls-tree', '-r', '--name-only', UPSTREAM, 'src/resources/assets/sounds'],
      { encoding: 'utf8' }
    )
      .trim()
      .split(/\r?\n/),
  ];
  for (const file of binaries)
    expect(
      fs.readFileSync(file).equals(
        execFileSync('git', ['show', `${UPSTREAM}:${file}`], {
          maxBuffer: 32 * 1024 * 1024,
        })
      ),
      file
    ).toBe(true);
});

test('Tataru voice plays on actual spikes, restarts on repeat hits, and follows sound settings', async ({
  page,
}) => {
  await ready(page);
  await page.keyboard.press('Space');
  const clip = await page.evaluate(() => {
    const g = window.__tataru.game;
    const voice = g.audio.sounds.pika;
    const play = voice.play.bind(voice);
    window.__voiceCalls = [];
    voice.play = (side) => {
      window.__voiceCalls.push(side);
      play(side);
    };
    window.__strike = (playerIndex, spike, contact) => {
      const p = g.physics;
      for (const [i, player] of [p.player1, p.player2].entries()) {
        Object.assign(player, {
          x: i === 0 ? 100 : 332,
          y: 244,
          state: 0,
          frameNumber: 0,
          delayBeforeNextFrame: 0,
          yVelocity: 0,
          isComputer: false,
          isCollisionWithBallHappened: false,
        });
      }
      const player = playerIndex === 0 ? p.player1 : p.player2;
      Object.assign(player, { y: 150, state: 1 });
      Object.assign(p.ball, {
        x: contact ? player.x + 10 : 216,
        y: contact ? 140 : 40,
        xVelocity: 0,
        yVelocity: 3,
        isPowerHit: false,
      });
      const input = [
        { xDirection: 0, yDirection: 0, powerHit: 0 },
        { xDirection: 0, yDirection: 0, powerHit: 0 },
      ];
      input[playerIndex].powerHit = spike ? 1 : 0;
      p.runEngineForNextFrame(input);
      const result = { attack: player.sound.pika, hit: p.ball.isPowerHit };
      g.playSoundEffect();
      g.playSoundEffect(); // Consumed events must not play again next frame.
      return result;
    };
    return { url: voice.center.url, duration: voice.center.duration };
  });
  expect(clip.url).toContain('/resources/assets/sounds/tataru-spike.mp3');
  expect(clip.duration).toBeCloseTo(1.08, 1);
  expect(await page.evaluate(() => window.__strike(0, true, false))).toEqual({
    attack: true,
    hit: false,
  });
  await page.evaluate(() => window.__strike(0, false, true));
  expect(await page.evaluate(() => window.__voiceCalls)).toEqual([]);

  const playing = () =>
    page.evaluate(() => {
      const voice = window.__tataru.game.audio.sounds.pika;
      return ['left', 'center', 'right'].map(
        (side) => voice[side].instances.length
      );
    });
  expect(await page.evaluate(() => window.__strike(0, true, true))).toEqual({
    attack: true,
    hit: true,
  });
  await expect.poll(playing).toEqual([1, 0, 0]);
  await page.evaluate(() => window.__strike(0, true, true));
  await expect.poll(playing).toEqual([1, 0, 0]);
  await page.evaluate(() => window.__strike(1, true, true));
  await expect.poll(playing).toEqual([0, 0, 1]);
  await page.evaluate(() => {
    window.__tataru.game.isStereoSound = false;
    window.__strike(1, true, true);
  });
  await expect.poll(playing).toEqual([0, 1, 0]);
  expect(await page.evaluate(() => window.__voiceCalls)).toEqual([
    -1, -1, 1, 0,
  ]);
  const volumes = await page.evaluate(() => {
    const audio = window.__tataru.game.audio;
    audio.turnSFXVolume(false);
    const muted = ['left', 'center', 'right'].map(
      (side) => audio.sounds.pika[side].volume
    );
    audio.turnSFXVolume(true);
    const enabled = ['left', 'center', 'right'].map(
      (side) => audio.sounds.pika[side].volume
    );
    return { muted, enabled, bgm: audio.sounds.bgm.center.volume };
  });
  expect(volumes).toEqual({
    muted: [0, 0, 0],
    enabled: [0.35, 0.35, 0.35],
    bgm: 0.2,
  });
});

test('original opening and animated title, with only title and tiled character replaced', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  expect(await step(page, 60)).toBe('intro');
  await page.screenshot({ path: '.local/restored-opening.png' });
  expect(await step(page, 105)).toBe('menu');
  await step(page, 100);
  await page.screenshot({ path: '.local/restored-title.png' });
  const result = await page.evaluate(() => {
    const { game, resources } = window.__tataru;
    const t =
      resources['../resources/assets/images/sprite_sheet.json'].textures;
    return {
      timing: game.frameTotal.intro,
      menuTiming: game.noInputFrameTotal.menu,
      title: [
        t['messages/ko/pikachu_volleyball.png'].width,
        t['messages/ko/pikachu_volleyball.png'].height,
      ],
      subtitle: [
        game.view.menu.messages.pokemon.texture.width,
        game.view.menu.messages.pokemon.texture.height,
      ],
      tile: [t['sitting_pikachu.png'].width, t['sitting_pikachu.png'].height],
      bgURL: game.audio.sounds.bgm.center.url,
      canvas: document.querySelector('#game-canvas').width,
    };
  });
  expect(result).toMatchObject({
    timing: 165,
    menuTiming: 225,
    title: [276, 79],
    subtitle: [200, 32],
    tile: [104, 104],
    canvas: 864,
  });
  expect(result.bgURL).toContain('/resources/assets/sounds/bgm.mp3');
  expect(errors).toEqual([]);
  await expect(page.locator('#start-button')).toHaveCount(0);
});

test('opens directly into the game with only source and controls below it', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/ko/?debug=1');
  await page.waitForFunction(
    () => window.__tataru && window.__tataru.game.frameCounter > 0
  );
  expect(
    await page.evaluate(() => ({
      paused: window.__tataru.game.paused,
      ticking: window.__tataru.ticker.started,
    }))
  ).toEqual({ paused: false, ticking: true });
  await expect(
    page.locator('#about-box, #about-btn, #close-about-btn')
  ).toHaveCount(0);
  await expect(page.locator('#loading-box')).toBeHidden();
  await expect(page.locator('#game-guide a')).toHaveCount(1);
  await expect(page.locator('#game-guide a')).toHaveAttribute(
    'href',
    'https://github.com/gorisanson/pikachu-volleyball'
  );
  const controlsImage = page.locator('#game-guide img.controls');
  await expect(controlsImage).toBeVisible();
  await expect(controlsImage).toHaveAttribute(
    'src',
    '../resources/assets/images/controls_ko.png'
  );
  await expect
    .poll(() =>
      controlsImage.evaluate((image) => [
        image.naturalWidth,
        image.naturalHeight,
      ])
    )
    .toEqual([1920, 984]);
  expect(
    await page.evaluate(
      () =>
        document.getElementById('game-guide').getBoundingClientRect().top >=
        document.getElementById('game-canvas').getBoundingClientRect().bottom
    )
  ).toBe(true);
  await page.keyboard.press('Space');
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.__tataru.game.audio.sounds.bgm.center.context.audioContext
            .state
      )
    )
    .toBe('running');
  await page.evaluate(() => {
    const { game, ticker, renderer, stage } = window.__tataru;
    ticker.stop();
    game.restart();
    game.paused = false;
    for (let i = 0; i < 265; i++) game.gameLoop();
    game.paused = true;
    renderer.render(stage);
  });
  await page.screenshot({
    path: '.local/direct-start-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    )
  ).toBe(true);
  await page.screenshot({
    path: '.local/direct-start-mobile.png',
    fullPage: true,
  });
  expect(errors).toEqual([]);
});

test('game and settings menus still pause and resume without an introduction button', async ({
  page,
}) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await ready(page);
  await page.locator('#options-dropdown-btn').click();
  await page.locator('#practice-mode-submenu-btn').hover();
  await page.locator('#practice-mode-on-btn').click();
  await page.locator('#options-dropdown-btn').click();
  await page.locator('#winning-score-submenu-btn').hover();
  await page.locator('#winning-score-10-btn').click();
  await expect(page.locator('#notice-box-2')).toBeVisible();
  await expect(page.locator('#game-dropdown-btn')).toBeDisabled();
  await page.locator('#notice-ok-btn-2').click();
  await expect(page.locator('#notice-box-2')).toBeHidden();
  await expect(page.locator('#game-dropdown-btn')).toBeEnabled();
  expect(await page.evaluate(() => window.__tataru.game.paused)).toBe(false);
  await page.locator('#game-dropdown-btn').click();
  await page.locator('#pause-btn').click();
  expect(await page.evaluate(() => window.__tataru.game.paused)).toBe(true);
  await page.locator('#game-dropdown-btn').click();
  await page.locator('#pause-btn').click();
  expect(await page.evaluate(() => window.__tataru.game.paused)).toBe(false);
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-bar')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.locator('#menu-bar')).toBeVisible();
  expect(errors).toEqual([]);
});

for (const [selection, computerSides] of [
  ['z', [false, true]],
  ['Enter', [true, false]],
]) {
  test(`original ${selection} selection keeps the original player side and key mapping`, async ({
    page,
  }) => {
    await start(page, selection);
    const actual = await page.evaluate(() => {
      const g = window.__tataru.game;
      return {
        sides: [g.physics.player1.isComputer, g.physics.player2.isComputer],
        startSound: {
          url: g.audio.sounds.pikachu.center.url,
          duration: g.audio.sounds.pikachu.center.duration,
          playing: g.audio.sounds.pikachu.center.instances.length,
        },
        keys: g.keyboardArray.map((k) => [
          k.leftKey.value,
          k.rightKey.value,
          k.upKey.value,
          k.downKey.value,
          k.powerHitKey.value,
        ]),
      };
    });
    expect(actual.sides).toEqual(computerSides);
    expect(actual.startSound.url).toContain(
      '/resources/assets/sounds/tataru-start.mp3'
    );
    expect(actual.startSound.duration).toBeCloseTo(2.04, 1);
    expect(actual.startSound.playing).toBe(1);
    expect(actual.keys).toEqual([
      ['KeyD', 'KeyG', 'KeyR', 'KeyV', 'KeyZ'],
      ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'],
    ]);
  });
}

test('original two-player controls drive dive and headbutt without the chu voice', async ({
  page,
}) => {
  await menu(page);
  await key(page, 'ArrowDown');
  await key(page, 'Enter');
  await step(page, 105);
  expect(
    await page.evaluate(() => [
      window.__tataru.game.physics.player1.isComputer,
      window.__tataru.game.physics.player2.isComputer,
    ])
  ).toEqual([false, false]);
  await page.evaluate(() => {
    const g = window.__tataru.game;
    window.__chuCalls = 0;
    g.audio.sounds.chu.play = () => window.__chuCalls++;
    g.audio.turnSFXVolume(false);
    g.audio.turnSFXVolume(true);
    g.physics.player1.initializeForNewRound();
    g.physics.player1.x = 100;
    Object.assign(g.physics.ball, {
      x: 300,
      y: -1000,
      xVelocity: 0,
      yVelocity: 0,
    });
  });
  await page.keyboard.down('g');
  await key(page, 'z');
  await page.keyboard.up('g');
  expect(
    await page.evaluate(() => window.__tataru.game.physics.player1.state)
  ).toBe(3);
  await page.screenshot({ path: '.local/restored-dive.png' });
  await page.evaluate(() =>
    window.__tataru.game.physics.player1.initializeForNewRound()
  );
  await key(page, 'r');
  await key(page, 'z');
  expect(
    await page.evaluate(() => window.__tataru.game.physics.player1.state)
  ).toBe(2);
  await page.keyboard.down('ArrowLeft');
  await key(page, 'Enter');
  await page.keyboard.up('ArrowLeft');
  expect(
    await page.evaluate(() => window.__tataru.game.physics.player2.state)
  ).toBe(3);
  await page.evaluate(() =>
    window.__tataru.game.physics.player2.initializeForNewRound()
  );
  await key(page, 'ArrowUp');
  expect(
    await page.evaluate(() => window.__tataru.game.physics.player2.state)
  ).toBe(1);
  expect(await page.evaluate(() => window.__chuCalls)).toBe(0);
  expect(
    await page.evaluate(() => [
      window.__tataru.game.physics.player1.sound.chu,
      window.__tataru.game.physics.player2.sound.chu,
    ])
  ).toEqual([false, false]);
});

test('native sprites use hard pixels; actual spike changes face and normal return restores smile', async ({
  page,
}) => {
  await start(page);
  const palette = await page.evaluate(() => {
    const t =
      window.__tataru.resources['../resources/assets/images/sprite_sheet.json']
        .textures;
    return [
      'pikachu/pikachu_0_0.png',
      'ball/tataru_smile.png',
      'background/costa_del_sol.png',
    ].map((name) => {
      const texture = t[name],
        c = texture.baseTexture.resource.source,
        d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      const colors = new Set(),
        alpha = new Set();
      for (let i = 0; i < d.length; i += 4) {
        alpha.add(d[i + 3]);
        if (d[i + 3]) colors.add(`${d[i]},${d[i + 1]},${d[i + 2]}`);
      }
      return {
        width: c.width,
        height: c.height,
        colors: colors.size,
        alpha: [...alpha].sort((a, b) => a - b),
      };
    });
  });
  expect(palette[0]).toMatchObject({ width: 84, height: 64, alpha: [0, 255] });
  expect(palette[0].colors).toBeLessThanOrEqual(9);
  expect(palette[1]).toMatchObject({ width: 40, height: 40, alpha: [0, 255] });
  expect(palette[1].colors).toBeLessThanOrEqual(13);
  expect(palette[2]).toMatchObject({ width: 432, height: 248, alpha: [255] });
  expect(palette[2].colors).toBeLessThanOrEqual(32);
  const hit = await page.evaluate(() => {
    const { game: g, renderer, stage } = window.__tataru;
    g.physics.player2.isComputer = false;
    Object.assign(g.physics.player1, {
      x: 100,
      y: 150,
      state: 2,
      frameNumber: 0,
      delayBeforeNextFrame: 5,
      yVelocity: 0,
      isCollisionWithBallHappened: false,
    });
    Object.assign(g.physics.ball, {
      x: 110,
      y: 140,
      xVelocity: 0,
      yVelocity: 3,
      isPowerHit: false,
      previousX: 110,
      previousY: 140,
      previousPreviousX: 110,
      previousPreviousY: 140,
    });
    g.physics.runEngineForNextFrame([
      { xDirection: 1, yDirection: 1, powerHit: 0 },
      { xDirection: 0, yDirection: 0, powerHit: 0 },
    ]);
    g.view.game.drawPlayersAndBall(g.physics);
    renderer.render(stage);
    return (
      g.physics.ball.isPowerHit &&
      g.view.game.ball.texture === g.view.game.tataruOuch
    );
  });
  expect(hit).toBe(true);
  await page.screenshot({ path: '.local/restored-spike.png' });
  const smile = await page.evaluate(() => {
    const g = window.__tataru.game;
    Object.assign(g.physics.player1, {
      x: 100,
      y: 244,
      state: 0,
      yVelocity: 0,
      isCollisionWithBallHappened: false,
    });
    Object.assign(g.physics.ball, {
      x: 100,
      y: 220,
      xVelocity: 0,
      yVelocity: 2,
    });
    g.physics.runEngineForNextFrame([
      { xDirection: 0, yDirection: 0, powerHit: 0 },
      { xDirection: 0, yDirection: 0, powerHit: 0 },
    ]);
    g.view.game.drawPlayersAndBall(g.physics);
    return (
      !g.physics.ball.isPowerHit &&
      g.view.game.ball.texture === g.view.game.tataruSmile
    );
  });
  expect(smile).toBe(true);
});

test('original scoring, next serve and match duration remain intact', async ({
  page,
}) => {
  await start(page);
  await page.evaluate(() => {
    const g = window.__tataru.game;
    Object.assign(g.physics.ball, {
      x: 330,
      y: 252,
      yVelocity: 8,
      xVelocity: 0,
    });
  });
  await step(page, 1);
  expect(await page.evaluate(() => window.__tataru.game.scores)).toEqual([
    1, 0,
  ]);
  await step(page, 70);
  expect(
    await page.evaluate(() => ({
      serve: window.__tataru.game.isPlayer2Serve,
      score: window.__tataru.game.scores,
      target: window.__tataru.game.winningScore,
      roundEnded: window.__tataru.game.roundEnded,
    }))
  ).toEqual({ serve: false, score: [1, 0], target: 15, roundEnded: false });
  await page.screenshot({ path: '.local/restored-court.png' });
  await page.evaluate(() => {
    const g = window.__tataru.game;
    window.__victoryVoiceCalls = 0;
    g.audio.sounds.pipikachu.play = () => window.__victoryVoiceCalls++;
    g.scores[0] = 14;
    for (const player of [g.physics.player1, g.physics.player2]) {
      player.initializeForNewRound();
      player.isComputer = false;
    }
    Object.assign(g.physics.ball, {
      x: 330,
      y: 252,
      yVelocity: 8,
      xVelocity: 0,
    });
  });
  await step(page, 50);
  expect(
    await page.evaluate(() => {
      const g = window.__tataru.game;
      return {
        score: g.scores,
        ended: g.gameEnded,
        states: [g.physics.player1.state, g.physics.player2.state],
        pendingVoice: g.physics.player1.sound.pipikachu,
        voiceCalls: window.__victoryVoiceCalls,
        gameSetVisible: g.view.game.messages.gameEnd.visible,
      };
    })
  ).toEqual({
    score: [15, 0],
    ended: true,
    states: [5, 6],
    pendingVoice: false,
    voiceCalls: 0,
    gameSetVisible: true,
  });
});

test('action poses retain body scale, both faces retain size, and both trails are blue Tataru', async ({
  page,
}) => {
  await start(page);
  const result = await page.evaluate(() => {
    const { resources, game } = window.__tataru;
    const t =
      resources['../resources/assets/images/sprite_sheet.json'].textures;
    function pixels(name) {
      const c = t[name].baseTexture.resource.source;
      return c.getContext('2d').getImageData(0, 0, c.width, c.height);
    }
    function measure(name) {
      const { data, width, height } = pixels(name);
      let left = width,
        top = height,
        right = 0,
        bottom = 0,
        count = 0;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          if (!data[(y * width + x) * 4 + 3]) continue;
          count++;
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      return { count, bounds: [left, top, right, bottom] };
    }
    const hurt = pixels('ball/tataru_ouch.png').data;
    const trails = ['ball/ball_hyper.png', 'ball/ball_trail.png'].map(
      (name) => {
        const data = pixels(name).data;
        let sameSilhouette = true,
          onlyBlue = true;
        for (let i = 0; i < data.length; i += 4) {
          sameSilhouette = sameSilhouette && data[i + 3] === hurt[i + 3];
          if (data[i + 3])
            onlyBlue =
              onlyBlue && data[i + 2] > data[i + 1] && data[i + 1] > data[i];
        }
        return { sameSilhouette, onlyBlue };
      }
    );
    return {
      yan: [0, 1, 2, 3].map((state) =>
        measure(`pikachu/pikachu_${state}_0.png`)
      ),
      smile: measure('ball/tataru_smile.png'),
      hurt: measure('ball/tataru_ouch.png'),
      trails,
      fade: [game.view.game.ballHyper.alpha, game.view.game.ballTrail.alpha],
    };
  });
  for (const pose of result.yan.slice(1)) {
    // The old per-pose fit shrank action silhouettes to only ~57% of idle area.
    expect(pose.count / result.yan[0].count).toBeGreaterThan(0.88);
    expect(pose.count / result.yan[0].count).toBeLessThan(1.12);
    expect(pose.bounds[0]).toBeGreaterThan(0);
    expect(pose.bounds[2]).toBeLessThan(83);
  }
  expect(result.hurt.bounds).toEqual(result.smile.bounds);
  expect(result.hurt.count / result.smile.count).toBeCloseTo(1, 1);
  expect(result.trails).toEqual([
    { sameSilhouette: true, onlyBlue: true },
    { sameSilhouette: true, onlyBlue: true },
  ]);
  expect(result.fade[1]).toBeLessThan(result.fade[0]);
  expect(result.fade[0]).toBeLessThan(1);
});

test('smiling eyes have matching native pixel shapes and visible catchlights', async ({
  page,
}) => {
  await ready(page);
  const eyes = await page.evaluate(() => {
    const c =
      window.__tataru.game.view.game.tataruSmile.baseTexture.resource.source;
    return [12, 23].map((x) => [
      ...c.getContext('2d').getImageData(x, 27, 6, 5).data,
    ]);
  });
  expect(eyes[0]).toEqual(eyes[1]);
  expect(
    eyes[0].some(
      (v, i, data) =>
        i % 4 === 0 && v === 255 && data[i + 1] === 255 && data[i + 2] === 255
    )
  ).toBe(true);
});

test('ball rotates through a rally, trails retain previous angles, and a new serve resets it', async ({
  page,
}) => {
  await start(page);
  const result = await page.evaluate(() => {
    const { game: g, renderer, stage } = window.__tataru;
    const view = g.view.game,
      ball = g.physics.ball;
    g.physics.player1.isComputer = g.physics.player2.isComputer = false;
    view.lastBallPosition = null;
    Object.assign(ball, {
      x: 100,
      y: 60,
      previousX: 100,
      previousY: 60,
      xVelocity: 6,
      yVelocity: 0,
      isPowerHit: false,
      punchEffectRadius: 0,
    });
    view.drawPlayersAndBall(g.physics);
    const frames = [];
    const input = [
      { xDirection: 0, yDirection: 0, powerHit: 0 },
      { xDirection: 0, yDirection: 0, powerHit: 0 },
    ];
    for (let i = 0; i < 3; i++) {
      g.physics.runEngineForNextFrame(input);
      view.drawPlayersAndBall(g.physics);
      frames.push(view.ball.rotation);
    }
    ball.isPowerHit = true;
    ball.xVelocity = 20;
    g.physics.runEngineForNextFrame(input);
    view.drawPlayersAndBall(g.physics);
    const spike = {
      angle: view.ball.rotation,
      previous: view.ballHyper.rotation,
      older: view.ballTrail.rotation,
      visible: [view.ballHyper.visible, view.ballTrail.visible],
      positions: [
        view.ballHyper.x,
        view.ballHyper.y,
        view.ballTrail.x,
        view.ballTrail.y,
      ],
      expectedPositions: [
        ball.previousX,
        ball.previousY,
        ball.previousPreviousX,
        ball.previousPreviousY,
      ],
      scale: [view.ball.scale.x, view.ball.scale.y],
    };
    view.drawPlayersAndBall(g.physics);
    const redraw = view.ball.rotation;
    renderer.render(stage);
    // Reversing horizontal motion also reverses the spin, including at a wall.
    ball.xVelocity = -6;
    g.physics.runEngineForNextFrame(input);
    view.drawPlayersAndBall(g.physics);
    const reversed = view.ball.rotation;
    const resets = [false, true].map((right) => {
      ball.initializeForNewRound(right);
      view.drawPlayersAndBall(g.physics);
      return [
        view.ball.rotation,
        view.ballHyper.rotation,
        view.ballTrail.rotation,
        view.ballHyper.visible,
        view.ballTrail.visible,
      ];
    });
    g.physics.runEngineForNextFrame(input);
    view.drawPlayersAndBall(g.physics);
    return {
      frames,
      spike,
      redraw,
      reversed,
      resets,
      vertical: view.ball.rotation,
    };
  });
  expect(result.frames[0]).toBeGreaterThan(0);
  expect(result.frames[2]).toBeGreaterThan(result.frames[1]);
  expect(result.spike.angle).toBeGreaterThan(result.frames[2]);
  expect(result.spike.previous).toBe(result.frames[2]);
  expect(result.spike.older).toBe(result.frames[1]);
  expect(result.spike.visible).toEqual([true, true]);
  expect(result.spike.positions).toEqual(result.spike.expectedPositions);
  expect(result.spike.scale).toEqual([1, 1]);
  expect(result.redraw).toBe(result.spike.angle);
  expect(result.reversed).toBeLessThan(result.spike.angle);
  expect(result.resets).toEqual([
    [0, 0, 0, false, false],
    [0, 0, 0, false, false],
  ]);
  expect(result.vertical).toBeGreaterThan(0);
});
