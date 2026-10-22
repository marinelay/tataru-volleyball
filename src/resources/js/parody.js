/** Pixel-art replacement textures for the original renderer. */
'use strict';
import { Texture } from '@pixi/core';
import { ASSETS_PATH } from './assets_path.js';

export const PARODY_PATH = {
  YAN: '../resources/assets/images/parody/yan-pixel.png',
  YAN_ACTIONS: '../resources/assets/images/parody/yan-actions-v3.png',
  FACES: '../resources/assets/images/parody/tataru-yan-heads-pixel-v2.png',
  COSTA: '../resources/assets/images/parody/costa-del-sol-native.png',
};
const T = ASSETS_PATH.TEXTURES;
const YAN_PALETTE = [
  '#100c08',
  '#503a29',
  '#765437',
  '#a84759',
  '#dc7987',
  '#ffff32',
  '#d8bd29',
  '#fff0ab',
  '#ffffff',
];
const TATARU_PALETTE = [
  '#160b0b',
  '#a92323',
  '#6c141c',
  '#dc6262',
  '#e6c557',
  '#f4dea0',
  '#ffc7a4',
  '#e3a17f',
  '#ad7c94',
  '#785565',
  '#ef87a5',
  '#73cddd',
  '#ffffff',
];
const COSTA_PALETTE = [
  '#182838',
  '#303840',
  '#485058',
  '#687c90',
  '#94a8b8',
  '#d0d8df',
  '#f8f4df',
  '#fff9d8',
  '#f8edbc',
  '#edcf87',
  '#d5ab60',
  '#9b713d',
  '#65462b',
  '#a55d2e',
  '#c7823b',
  '#edaa50',
  '#1d4234',
  '#315c35',
  '#568140',
  '#79a647',
  '#acc158',
  '#255caa',
  '#246cc8',
  '#3088e8',
  '#499fe8',
  '#70bce8',
  '#1688b8',
  '#16accc',
  '#54ced7',
  '#a1e5dc',
  '#fcffff',
  '#b4bdc7',
];

export function addParodyAssets(loader) {
  loader
    .add(PARODY_PATH.YAN)
    .add(PARODY_PATH.YAN_ACTIONS)
    .add(PARODY_PATH.FACES)
    .add(PARODY_PATH.COSTA);
}

function canvas(width, height) {
  const result = document.createElement('canvas');
  result.width = width;
  result.height = height;
  return result;
}

function trim(image, rect) {
  const [x, y, width, height] = rect;
  const tile = canvas(width, height);
  const ctx = tile.getContext('2d');
  ctx.drawImage(image, x, y, width, height, 0, 0, width, height);
  const pixels = ctx.getImageData(0, 0, width, height).data;
  // A neighboring horn can extend into a grid cell. Measure the main connected
  // sprite, not those stray pixels, or the whole face gets scaled down to fit.
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let largest = { count: 0 };
  for (let start = 0; start < visited.length; start++) {
    if (visited[start] || pixels[start * 4 + 3] < 128) continue;
    const bounds = { left: width, top: height, right: 0, bottom: 0 };
    let read = 0,
      count = 1;
    queue[0] = start;
    visited[start] = 1;
    while (read < count) {
      const index = queue[read++],
        i = index % width,
        j = Math.floor(index / width);
      bounds.left = Math.min(bounds.left, i);
      bounds.right = Math.max(bounds.right, i);
      bounds.top = Math.min(bounds.top, j);
      bounds.bottom = Math.max(bounds.bottom, j);
      for (const neighbor of [
        i > 0 ? index - 1 : -1,
        i < width - 1 ? index + 1 : -1,
        j > 0 ? index - width : -1,
        j < height - 1 ? index + width : -1,
      ]) {
        if (neighbor < 0 || visited[neighbor] || pixels[neighbor * 4 + 3] < 128)
          continue;
        visited[neighbor] = 1;
        queue[count++] = neighbor;
      }
    }
    if (count > largest.count) largest = { ...bounds, count };
  }
  if (!largest.count) throw new Error('Character sprite is empty');
  const { left, top, right, bottom } = largest;
  return {
    image,
    x: x + left,
    y: y + top,
    w: right - left + 1,
    h: bottom - top + 1,
  };
}

// Render at native pixel density with a small flat palette and hard alpha.
function nativeSprite(
  frame,
  {
    width: canvasWidth,
    height: canvasHeight = canvasWidth,
    maxWidth = canvasWidth,
    maxHeight = canvasHeight,
    centerY = canvasHeight / 2,
    palette,
    offsetY = 0,
    scale = Math.min(maxWidth / frame.w, maxHeight / frame.h),
  }
) {
  const result = canvas(canvasWidth, canvasHeight),
    ctx = result.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const width = Math.round(frame.w * scale),
    height = Math.round(frame.h * scale);
  ctx.drawImage(
    frame.image,
    frame.x,
    frame.y,
    frame.w,
    frame.h,
    Math.floor((canvasWidth - width) / 2),
    Math.round(centerY - height / 2 + offsetY),
    width,
    height
  );
  const colors = palette.map((hex) =>
    [1, 3, 5].map((start) => parseInt(hex.slice(start, start + 2), 16))
  );
  const pixels = ctx.getImageData(0, 0, canvasWidth, canvasHeight);
  for (let i = 0; i < pixels.data.length; i += 4) {
    if (pixels.data[i + 3] < 128) {
      pixels.data[i + 3] = 0;
      continue;
    }
    let best = colors[0],
      distance = Infinity;
    for (const color of colors) {
      const d =
        (pixels.data[i] - color[0]) ** 2 +
        (pixels.data[i + 1] - color[1]) ** 2 +
        (pixels.data[i + 2] - color[2]) ** 2;
      if (d < distance) {
        best = color;
        distance = d;
      }
    }
    pixels.data[i] = best[0];
    pixels.data[i + 1] = best[1];
    pixels.data[i + 2] = best[2];
    pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  return result;
}

function textureCanvas(texture) {
  const result = canvas(texture.width, texture.height);
  const f = texture.frame;
  result
    .getContext('2d')
    .drawImage(
      texture.baseTexture.resource.source,
      f.x,
      f.y,
      f.width,
      f.height,
      0,
      0,
      texture.width,
      texture.height
    );
  return result;
}

function titleTexture(original) {
  const title = textureCanvas(original),
    ctx = title.getContext('2d');
  // Preserve the original title's transparent margins and its existing 배구 bitmap.
  ctx.clearRect(0, 0, 150, title.height);
  ctx.fillStyle = '#ffff00';
  const ta = [
    [0, 0, 6, 2],
    [0, 4, 6, 2],
    [0, 8, 6, 2],
    [0, 0, 2, 10],
    [8, 0, 2, 12],
    [10, 5, 3, 2],
  ];
  const ru = [
    [1, 0, 10, 2],
    [9, 0, 2, 5],
    [1, 4, 10, 2],
    [1, 4, 2, 5],
    [1, 8, 10, 2],
    [0, 11, 13, 2],
    [6, 12, 2, 3],
  ];
  [
    [52, ta],
    [81, ta],
    [110, ru],
  ].forEach(([x, strokes]) => {
    strokes.forEach(([sx, sy, w, h]) =>
      ctx.fillRect(x + sx * 2, 23 + sy * 2, w * 2, h * 2)
    );
  });
  return Texture.from(title);
}

function franchiseTexture(original) {
  const result = canvas(original.width, original.height),
    ctx = result.getContext('2d');
  // Draw on the same native pixel grid as the title, without system font smoothing.
  const glyphs = {
    파: [
      '00000010',
      '11111010',
      '01010010',
      '01010010',
      '01010010',
      '01010011',
      '01010010',
      '01010010',
      '11111010',
      '00000010',
      '00000010',
    ],
    이: [
      '00000010',
      '01110010',
      '10001010',
      '10001010',
      '10001010',
      '10001010',
      '10001010',
      '10001010',
      '10001010',
      '01110010',
      '00000010',
    ],
    널: [
      '10000010',
      '10000010',
      '10001110',
      '11110010',
      '00000010',
      '00000000',
      '11111110',
      '00000010',
      '11111110',
      '10000000',
      '11111110',
    ],
    판: [
      '11111010',
      '01010010',
      '01010011',
      '01010010',
      '11111010',
      '00000010',
      '00000000',
      '10000000',
      '10000000',
      '10000000',
      '11111110',
    ],
    타: [
      '00000010',
      '11111010',
      '10000010',
      '10000010',
      '10000010',
      '11111011',
      '10000010',
      '10000010',
      '10000010',
      '11111010',
      '00000010',
    ],
    지: [
      '00000010',
      '11111010',
      '00100010',
      '00100010',
      '00100010',
      '01010010',
      '01010010',
      '10001010',
      '10001010',
      '10001010',
      '00000010',
    ],
    1: [
      '00100',
      '01100',
      '10100',
      '00100',
      '00100',
      '00100',
      '00100',
      '00100',
      '00100',
      '00100',
      '11111',
    ],
    4: [
      '00010',
      '00010',
      '00110',
      '00110',
      '01010',
      '01010',
      '10010',
      '11111',
      '00010',
      '00010',
      '00010',
    ],
  };
  const letters = [...'파이널판타지14'].map((letter) => glyphs[letter]);
  const width = letters.reduce((sum, rows) => sum + rows[0].length * 2 + 2, -2);
  let x = Math.floor((result.width - width) / 2);
  // Preserve the original subtitle's cyan color and vertical bounds (y=7..28).
  ctx.fillStyle = '#80ffff';
  for (const rows of letters) {
    rows.forEach((row, y) => {
      [...row].forEach((pixel, column) => {
        if (pixel === '1') ctx.fillRect(x + column * 2, 7 + y * 2, 2, 2);
      });
    });
    x += rows[0].length * 2 + 2;
  }
  return Texture.from(result);
}

export function applyParodyTextures(resources) {
  const textures = resources[ASSETS_PATH.SPRITE_SHEET].textures;
  const costa = resources[PARODY_PATH.COSTA].data;
  textures['background/costa_del_sol.png'] = Texture.from(
    nativeSprite(
      { image: costa, x: 0, y: 0, w: costa.width, h: costa.height },
      { width: 432, height: 248, palette: COSTA_PALETTE }
    )
  );
  const yan = resources[PARODY_PATH.YAN].data;
  const yanActions = resources[PARODY_PATH.YAN_ACTIONS].data;
  const faces = resources[PARODY_PATH.FACES].data;
  const cells = [
    [0, 260, 384, 340],
    [384, 260, 384, 340],
    [768, 260, 384, 340],
    [1152, 260, 384, 340],
    [0, 650, 440, 350],
    [440, 650, 398, 350],
    [838, 650, 352, 350],
    [1190, 650, 346, 350],
  ];
  // A tucked headbutt and alert pounce; other poses keep their original art.
  const poses = cells.map((rect, pose) =>
    trim(pose === 4 || pose === 5 ? yanActions : yan, rect)
  );
  // Preserve source scale instead of fitting every pose to the same width.
  const yanScale = Math.min(62 / poses[0].w, 58 / poses[0].h);
  const poseMap = [
    [0, 1, 0, 2, 0],
    [3, 3, 3, 3, 3],
    [4, 4, 4, 4, 3],
    [5, 5],
    [6],
    [7, 7, 7, 7, 7],
    [6, 6, 6, 6, 6],
  ];
  poseMap.forEach((states, state) =>
    states.forEach((pose, frame) => {
      // The compact v3 headbutt was drawn with a slightly smaller head; match
      // idle head size while keeping its shorter neck and tucked silhouette.
      const poseScale = yanScale * (pose === 4 ? 1.1 : 1);
      const height = Math.round(poses[pose].h * poseScale);
      const center =
        state === 0 || state >= 4 ? 62 - height / 2 : state === 3 ? 42 : 32;
      const offset = state === 5 ? [0, -1, -2, -1, 0][frame] : 0;
      textures[T.PIKACHU(state, frame)] = Texture.from(
        nativeSprite(poses[pose], {
          width: 84,
          height: 64,
          scale: poseScale,
          centerY: center,
          palette: YAN_PALETTE,
          offsetY: offset,
        })
      );
    })
  );

  const faceWidth = faces.width / 3;
  const smile = trim(faces, [0, 0, faceWidth, faces.height]);
  const ouch = trim(faces, [faceWidth, 0, faceWidth, faces.height]);
  const faceScale = Math.min(40 / smile.w, 40 / smile.h);
  const faceOptions = { width: 40, scale: faceScale, palette: TATARU_PALETTE };
  const smileCanvas = nativeSprite(smile, faceOptions);
  const smileCtx = smileCanvas.getContext('2d');
  // Reuse the corrected source eye on the native grid: sampling the enlarged
  // pair at different subpixel phases otherwise drops the right catchlight.
  smileCtx.putImageData(smileCtx.getImageData(12, 27, 6, 5), 23, 27);
  const normal = Texture.from(smileCanvas);
  const hurt = Texture.from(nativeSprite(ouch, faceOptions));
  for (let frame = 0; frame < 5; frame++) textures[T.BALL(frame)] = normal;
  textures['ball/tataru_smile.png'] = normal;
  textures['ball/tataru_ouch.png'] = hurt;
  const blueFace = textureCanvas(hurt),
    blueCtx = blueFace.getContext('2d'),
    bluePixels = blueCtx.getImageData(0, 0, 40, 40);
  for (let index = 0; index < bluePixels.data.length; index += 4) {
    if (bluePixels.data[index + 3]) {
      const light = Math.round(
        (bluePixels.data[index] +
          bluePixels.data[index + 1] +
          bluePixels.data[index + 2]) /
          3
      );
      bluePixels.data[index] = Math.round(light * 0.18);
      bluePixels.data[index + 1] = Math.round(light * 0.55);
      bluePixels.data[index + 2] = 90 + Math.round(light * 0.65);
    }
  }
  blueCtx.putImageData(bluePixels, 0, 0);
  const trailTexture = Texture.from(blueFace);
  textures[T.BALL_HYPER] = trailTexture;
  textures[T.BALL_TRAIL] = trailTexture;

  const oldTile = textureCanvas(textures[T.SITTING_PIKACHU]);
  const tile = canvas(oldTile.width, oldTile.height),
    ctx = tile.getContext('2d');
  // Keep the original green dithered tile using its unobstructed left edge.
  for (let x = 0; x < tile.width; x += 2)
    ctx.drawImage(oldTile, 0, 0, 2, oldTile.height, x, 0, 2, tile.height);
  // Reuse the corrected smiling face at an integer scale for crisp title pixels.
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(smileCanvas, 12, 12, 80, 80);
  textures[T.SITTING_PIKACHU] = Texture.from(tile);
  textures['messages/ko/pikachu_volleyball.png'] = titleTexture(
    textures['messages/ko/pikachu_volleyball.png']
  );
  // All entry points show the same requested Korean title, with original animation dimensions.
  textures['messages/ja/pikachu_volleyball.png'] =
    textures['messages/ko/pikachu_volleyball.png'];
  textures['messages/ko/pokemon.png'] = franchiseTexture(
    textures['messages/ko/pokemon.png']
  );
  textures['messages/ja/pokemon.png'] = textures['messages/ko/pokemon.png'];
}
