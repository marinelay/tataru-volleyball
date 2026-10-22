# 얀 홈페이지 아이콘

- 생성: 내장 `image_gen`, 기존 시트에서 얀 얼굴 분리, 투명 배경.
- 참고: `../parody/tataru-yan-heads-pixel.png`의 오른쪽 얀 얼굴.
- 생성 원본: `art/source/yan-icon.png` (게임 배포 파일에서 제외).
- 적용: `yan-32.png` 브라우저 탭, `yan-180.png` Apple 홈 화면, `yan-192.png`와 `yan-512.png` 설치형 앱 아이콘. 64픽셀로 최근접 축소한 후 앱 아이콘을 최근접 확대했습니다. 탭 아이콘은 작은 눈 디테일을 보존하도록 32픽셀로 면적 평균 축소했습니다.

## 최종 프롬프트

Use case: background-extraction / identity-preserve. Input 1 is an existing transparent pixel-art sprite sheet and is the exact edit target. Extract ONLY the RIGHTMOST character: Yan, the dark brown sheep/ram head with two dusty pink curled horns and pale golden oval eyes. Output a single centered Yan head on a square fully transparent canvas, with all horns intact and about 8% empty margin on each side. Remove both Tataru heads entirely. Preserve the existing Yan identity, face proportions, horn silhouette, colors, gentle forward-looking expression and original simple 1990s pixel-art style. No redesign, no body, no text, no badge, no background, no border, no shadows or glow. This is a game favicon that must read well at 32 by 32 pixels: hard clean pixel steps, dark 1-pixel contour, very limited flat palette, crisp symmetric eyes with one small white catchlight each, no antialiasing, no gradients. Render as a native 32 by 32 pixel-art design enlarged with nearest-neighbor square blocks. Real transparent PNG.
