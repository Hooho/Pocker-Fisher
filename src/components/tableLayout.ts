export type TableStageSize = {
  width: number;
  height: number;
};

export type TableCameraLayout = {
  positionY: number;
  positionZ: number;
  verticalTableScale: number;
};

const WIDE_CAMERA_Y = 10;
const WIDE_CAMERA_Z = 9.8;
const PORTRAIT_CAMERA_Y = 14;
const PORTRAIT_CAMERA_Z = 13.7;
const PORTRAIT_ASPECT_THRESHOLD = 1.4;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getTableCameraLayout(width: number, height: number): TableCameraLayout {
  const aspect = width / Math.max(1, height);
  const portrait = aspect < PORTRAIT_ASPECT_THRESHOLD;
  const positionY = portrait ? PORTRAIT_CAMERA_Y : WIDE_CAMERA_Y;
  const positionZ = portrait ? PORTRAIT_CAMERA_Z : WIDE_CAMERA_Z;
  const wideCameraDistance = Math.hypot(WIDE_CAMERA_Y, WIDE_CAMERA_Z);
  const cameraDistance = Math.hypot(positionY, positionZ);

  return {
    positionY,
    positionZ,
    verticalTableScale: wideCameraDistance / cameraDistance,
  };
}

export function getTableSeatPosition(
  playerCount: number,
  seatIndex: number,
  stageSize: TableStageSize,
) {
  const angle = Math.PI / 2 + (seatIndex * Math.PI * 2) / Math.max(1, playerCount);
  if (!stageSize.width || !stageSize.height) {
    return {
      left: `${50 + 43 * Math.cos(angle)}%`,
      top: `${50 + (seatIndex === 0 ? 35 : 30) * Math.sin(angle)}%`,
    };
  }

  const compact = stageSize.width <= 600;
  const centerX = stageSize.width / 2;
  const centerY = stageSize.height * (compact ? 0.54 : 0.55);
  const tableRadiusX = stageSize.width * (compact ? 0.47 : 0.43);
  const { verticalTableScale } = getTableCameraLayout(stageSize.width, stageSize.height);
  const tableRadiusY =
    stageSize.height * (compact ? 0.18 : 0.2) * verticalTableScale;
  const seatHalfWidth = compact ? 45 : 62;
  const seatHalfHeight = compact ? 38 : 58;
  const gap = compact ? 8 : 14;
  const edgePadding = compact ? 4 : 8;
  const xRadius = tableRadiusX + seatHalfWidth + gap;
  const yRadius = tableRadiusY + seatHalfHeight + gap;

  const x = clampNumber(
    centerX + xRadius * Math.cos(angle),
    seatHalfWidth + edgePadding,
    stageSize.width - seatHalfWidth - edgePadding,
  );
  const y = clampNumber(
    centerY + yRadius * Math.sin(angle),
    seatHalfHeight + edgePadding,
    stageSize.height - seatHalfHeight - edgePadding,
  );
  return { left: `${x}px`, top: `${y}px` };
}
