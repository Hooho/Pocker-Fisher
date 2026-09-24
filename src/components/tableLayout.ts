export type TableStageSize = {
  width: number;
  height: number;
};

export type TableCameraLayout = {
  positionY: number;
  positionZ: number;
  verticalTableScale: number;
};

export type TableSeatSize = {
  width: number;
  height: number;
};

export type TableSeatPosition = {
  left: string;
  top: string;
};

const WIDE_CAMERA_Y = 10;
const WIDE_CAMERA_Z = 9.8;
const PORTRAIT_CAMERA_Y = 14;
const PORTRAIT_CAMERA_Z = 13.7;
const PORTRAIT_ASPECT_THRESHOLD = 1.4;
const TABLE_WORLD_RADIUS_X = 5.3;
const TABLE_CAMERA_FOV_DEGREES = 36;
const TABLE_REFERENCE_WIDTH = 1120;
const TABLE_REFERENCE_HEIGHT = 580;
const TABLE_UI_MIN_SCALE = 0.62;
const TABLE_SEAT_DESIGN_WIDTH = 118;
const TABLE_SEAT_DESIGN_HEIGHT = 154;

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function getTableUiScale(stageSize: TableStageSize) {
  if (!stageSize.width || !stageSize.height) return 1;
  return clampNumber(
    Math.min(stageSize.width / TABLE_REFERENCE_WIDTH, stageSize.height / TABLE_REFERENCE_HEIGHT),
    TABLE_UI_MIN_SCALE,
    1,
  );
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

function getTableSceneSize(stageSize: TableStageSize) {
  const compact = stageSize.width <= 600;
  return {
    width: stageSize.width * (compact ? 1.14 : 1.06),
    height: stageSize.height * (compact ? 1.03 : 1.15),
  };
}

function getProjectedTableRadiusX(stageSize: TableStageSize) {
  const sceneSize = getTableSceneSize(stageSize);
  const camera = getTableCameraLayout(sceneSize.width, sceneSize.height);
  const cameraDistance = Math.hypot(camera.positionY, camera.positionZ);
  const focalScale = 1 / Math.tan((TABLE_CAMERA_FOV_DEGREES * Math.PI) / 360);

  // PerspectiveCamera uses the vertical FOV, so horizontal pixel scale is
  // determined by the rendered scene height and camera distance.
  return (TABLE_WORLD_RADIUS_X * focalScale * sceneSize.height) / (2 * cameraDistance);
}

export function getTableSeatFootprint(stageSize: TableStageSize): TableSeatSize {
  const scale = getTableUiScale(stageSize);
  return {
    width: TABLE_SEAT_DESIGN_WIDTH * scale,
    height: TABLE_SEAT_DESIGN_HEIGHT * scale,
  };
}

export function getTableSeatPositions(
  playerCount: number,
  stageSize: TableStageSize,
  seatSize: TableSeatSize = getTableSeatFootprint(stageSize),
): TableSeatPosition[] {
  const count = Math.max(1, playerCount);
  const angles = Array.from(
    { length: count },
    (_, seatIndex) => Math.PI / 2 + (seatIndex * Math.PI * 2) / count,
  );
  if (!stageSize.width || !stageSize.height) {
    return angles.map((angle, seatIndex) => ({
      left: `${50 + 43 * Math.cos(angle)}%`,
      top: `${50 + (seatIndex === 0 ? 35 : 30) * Math.sin(angle)}%`,
    }));
  }

  const compact = stageSize.width <= 600;
  const centerX = stageSize.width / 2;
  const centerY = stageSize.height * (compact ? 0.54 : 0.55);
  const tableRadiusX = Math.min(
    getProjectedTableRadiusX(stageSize),
    stageSize.width * (compact ? 0.47 : 0.43),
  );
  const { verticalTableScale } = getTableCameraLayout(stageSize.width, stageSize.height);
  const tableRadiusY =
    stageSize.height * (compact ? 0.18 : 0.2) * verticalTableScale;
  const seatHalfWidth = seatSize.width / 2;
  const seatHalfHeight = seatSize.height / 2;
  const gap = compact ? 8 : 14;
  const edgePadding = compact ? 4 : 8;
  const minRadiusX = seatHalfWidth + edgePadding;
  const maxRadiusX = centerX - minRadiusX;
  const minRadiusY = seatHalfHeight + edgePadding;
  const maxRadiusY = Math.min(
    centerY - minRadiusY,
    stageSize.height - centerY - minRadiusY,
  );
  let radiusX = clampNumber(tableRadiusX + seatHalfWidth + gap, minRadiusX, maxRadiusX);
  let radiusY = clampNumber(tableRadiusY + seatHalfHeight + gap, minRadiusY, maxRadiusY);
  const requiredHorizontalGap = seatSize.width + gap;
  const requiredVerticalGap = seatSize.height + gap;

  const getCoordinates = () => {
    const coordinates = angles.map((angle) => ({
      x: clampNumber(
        centerX + radiusX * Math.cos(angle),
        minRadiusX,
        stageSize.width - minRadiusX,
      ),
      y: clampNumber(
        centerY + radiusY * Math.sin(angle),
        minRadiusY,
        stageSize.height - minRadiusY,
      ),
    }));

    // When an even table has several seats on each side, keep that side in a
    // vertical lane if the fixed seat footprints would overlap.
    // The lane is derived from the count and available height, not from a
    // special case for a particular player count.
    const sideSeatCount = Math.floor(count / 2) - 1;
    const naturalSideSpan = radiusY * 2 * Math.sin(Math.PI / count);
    if (count % 2 === 0 && sideSeatCount >= 2 && naturalSideSpan < requiredVerticalGap) {
      const safeTop = minRadiusY;
      const safeBottom = stageSize.height - minRadiusY;
      const requiredLaneSpan = (requiredVerticalGap + 1) * (sideSeatCount - 1);
      const laneSpan = Math.min(
        safeBottom - safeTop,
        Math.max(naturalSideSpan, requiredLaneSpan),
      );
      const laneCenter = clampNumber(
        centerY,
        safeTop + laneSpan / 2,
        safeBottom - laneSpan / 2,
      );
      const laneStep = sideSeatCount > 1 ? laneSpan / (sideSeatCount - 1) : 0;
      for (let seatIndex = 1; seatIndex < count / 2; seatIndex += 1) {
        const order = seatIndex - 1;
        coordinates[seatIndex].y = laneCenter + laneSpan / 2 - order * laneStep;
        const oppositeIndex = count - seatIndex;
        coordinates[oppositeIndex].y = coordinates[seatIndex].y;
      }
    }

    return coordinates;
  };

  // Grow the ellipse only when the fixed seat footprints would overlap. This
  // keeps small tables close to the felt while giving 8+ seat tables enough
  // room on both axes without letting state-dependent content move seats.
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const coordinates = getCoordinates();
    const overlap = coordinates.some((current, index) =>
      coordinates.some((other, otherIndex) => {
        if (index >= otherIndex) return false;
        return (
          Math.abs(current.x - other.x) < requiredHorizontalGap &&
          Math.abs(current.y - other.y) < requiredVerticalGap
        );
      }),
    );
    if (!overlap) break;
    const canGrowX = radiusX < maxRadiusX - 0.5;
    const canGrowY = radiusY < maxRadiusY - 0.5;
    if (!canGrowX && !canGrowY) break;
    if (canGrowX) radiusX = Math.min(maxRadiusX, radiusX * 1.06 + 1);
    if (canGrowY) radiusY = Math.min(maxRadiusY, radiusY * 1.06 + 1);
  }

  return getCoordinates().map(({ x, y }) => ({
    left: `${x}px`,
    top: `${y}px`,
  }));
}
