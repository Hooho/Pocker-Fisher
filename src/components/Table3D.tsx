import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getTableCameraLayout } from "./tableLayout";

type ScreenPoint = { x: number; y: number };
type ChipAnimationProgress = { hand: number; settledTotals: Record<string, number> };

export default function Table3D({
  potValue,
  chipUnit,
  hand,
  playerTotals,
  playerIds,
  playerCardPositions,
  chipAnimation,
  onChipAnimationStart,
  done,
  winnerIndices,
  playerCount,
  chipToss,
}: {
  potValue: number;
  chipUnit: number;
  hand: number;
  playerTotals: number[];
  playerIds: number[];
  playerCardPositions: Array<ScreenPoint | null>;
  chipAnimation: ChipAnimationProgress | null;
  onChipAnimationStart: (hand: number, updates: Record<string, number>) => void;
  done: boolean;
  winnerIndices: number[];
  playerCount: number;
  chipToss?: {
    seat: number;
    token: number;
    hand: number;
    playerId: number;
    total: number;
    source: ScreenPoint | null;
  } | null;
}) {
  const update = useRef<
    ((
      pot: number,
      unit: number,
      hand: number,
      totals: number[],
      ids: number[],
      cardPositions: Array<ScreenPoint | null>,
      animationProgress: ChipAnimationProgress | null,
      done: boolean,
      winners: number[],
      players: number,
    ) => void) | null
  >(null);
  useEffect(() => {
    update.current?.(
      potValue,
      chipUnit,
      hand,
      playerTotals,
      playerIds,
      playerCardPositions,
      chipAnimation,
      done,
      winnerIndices,
      playerCount,
    );
  }, [potValue, chipUnit, hand, playerTotals, playerIds, playerCardPositions, chipAnimation, done, winnerIndices, playerCount]);
  const toss = useRef<((seat: number, players: number, source: ScreenPoint | null, hand: number, playerId: number, total: number) => void) | null>(null);
  useEffect(() => {
    if (chipToss) toss.current?.(chipToss.seat, playerCount, chipToss.source, chipToss.hand, chipToss.playerId, chipToss.total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chipToss?.token]);
  const host = useRef<HTMLDivElement>(null);
  const overlayHost = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!host.current || !overlayHost.current) return;
    const el = host.current;
    const overlayEl = overlayHost.current;
    let unmounted = false;
    let renderer: THREE.WebGLRenderer;
    let overlayRenderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      overlayRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    overlayRenderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    overlayRenderer.outputColorSpace = THREE.SRGBColorSpace;
    overlayRenderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);
    overlayEl.appendChild(overlayRenderer.domElement);
    const scene = new THREE.Scene();
    const overlayScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
    camera.position.set(0, 10, 9.8);
    camera.lookAt(0, 0, 0);
    scene.add(new THREE.HemisphereLight(0xe0f3d8, 0x252117, 2.5));
    const key = new THREE.DirectionalLight(0xffe5b8, 3);
    key.position.set(-3, 8, 3);
    scene.add(key);
    const rim = new THREE.PointLight(0x5aa989, 35);
    rim.position.set(3, 3, -4);
    scene.add(rim);
    overlayScene.add(new THREE.HemisphereLight(0xe0f3d8, 0x252117, 2.5));
    const overlayKey = new THREE.DirectionalLight(0xffe5b8, 3);
    overlayKey.position.set(-3, 8, 3);
    overlayScene.add(overlayKey);
    const overlayRim = new THREE.PointLight(0x5aa989, 35);
    overlayRim.position.set(3, 3, -4);
    overlayScene.add(overlayRim);
    const shape = (x: number, z: number) => {
      const s = new THREE.Shape();
      s.absellipse(0, 0, x, z, 0, Math.PI * 2, false, 0);
      return s;
    };
    const addOval = (
      x: number,
      z: number,
      y: number,
      depth: number,
      color: number,
      roughness: number,
    ) => {
      const geo = new THREE.ExtrudeGeometry(shape(x, z), {
        depth,
        bevelEnabled: true,
        bevelSegments: 4,
        steps: 1,
        bevelSize: 0.08,
        bevelThickness: 0.08,
        curveSegments: 100,
      });
      geo.rotateX(-Math.PI / 2);
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshStandardMaterial({
          color,
          roughness,
          metalness: color === 0x9d8350 ? 0.65 : 0.08,
        }),
      );
      mesh.position.y = y;
      scene.add(mesh);
      return mesh;
    };
    addOval(5.3, 2.87, -0.5, 0.24, 0x171c18, 0.48);
    addOval(5.18, 2.77, -0.24, 0.03, 0x9d8350, 0.35);
    addOval(5.08, 2.68, -0.19, 0.19, 0x28372d, 0.74);
    const felt = addOval(4.64, 2.29, 0.04, 0.025, 0x164c3c, 0.95);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#347059";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 16000; i++) {
      const v = Math.random() * 60;
      ctx.fillStyle = `rgba(${v},${v + 35},${v + 22},.12)`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(5, 5);
    (felt.material as THREE.MeshStandardMaterial).map = texture;
    const points = Array.from({ length: 161 }, (_, i) => {
      const a = (i / 160) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * 4.35, 0.17, Math.sin(a) * 2.03);
    });
    scene.add(
      new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: 0x789275,
          transparent: true,
          opacity: 0.5,
        }),
      ),
    );
    const chips = new THREE.Group();
    const colors = [0xb99863, 0xad5844, 0x59807f];
    const maxPoolChips = 40;
    for (let index = 0; index < maxPoolChips; index++) {
      const stack = index % 5;
      const height = Math.floor(index / 5);
      const chipStack = new THREE.Group();
      chipStack.position.set((stack - 2) * 0.23, 0, 1.9 + (stack % 2) * 0.12);
      for (let h = 0; h < 1; h++) {
        const chip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 0.042, 28),
          new THREE.MeshStandardMaterial({
            color: colors[stack % 3],
            roughness: 0.42,
            metalness: 0.18,
          }),
        );
        chip.position.y = 0.2 + (height + h) * 0.046;
        chipStack.add(chip);
        for (let k = 0; k < 6; k++) {
          const band = new THREE.Mesh(
            new THREE.BoxGeometry(0.028, 0.048, 0.037),
            new THREE.MeshStandardMaterial({ color: 0xe2d9b7 }),
          );
          const a = (k * Math.PI) / 3;
          band.position.set(
            Math.cos(a) * 0.12,
            chip.position.y,
            Math.sin(a) * 0.12,
          );
          band.rotation.y = -a;
          chipStack.add(band);
        }
      }
      chips.add(chipStack);
    }
    const setPoolChipCount = (group: THREE.Group, pot: number, unit: number) => {
      const visualUnit = Math.max(1, unit / 2);
      const count = Math.min(maxPoolChips, Math.ceil(Math.max(0, pot) / visualUnit));
      group.children.forEach((chipStack, index) => {
        chipStack.visible = index < count;
      });
    };
    scene.add(chips);
    const chipGroups = [chips];
    const renderScenes = () => {
      renderer.render(scene, camera);
      overlayRenderer.render(overlayScene, camera);
    };
    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      overlayRenderer.setSize(w, h);
      camera.aspect = w / h;
      const cameraLayout = getTableCameraLayout(w, h);
      camera.position.y = cameraLayout.positionY;
      camera.position.z = cameraLayout.positionZ;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      renderScenes();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let frame = 0;
    const screenRaycaster = new THREE.Raycaster();
    const screenToTablePoint = (point: ScreenPoint, planeY = 0.25) => {
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      screenRaycaster.setFromCamera(
        new THREE.Vector2(
          ((point.x - rect.left) / rect.width) * 2 - 1,
          1 - ((point.y - rect.top) / rect.height) * 2,
        ),
        camera,
      );
      return screenRaycaster.ray.intersectPlane(
        new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY),
        new THREE.Vector3(),
      );
    };
    const playerStart = (seatIndex: number, players: number, source?: ScreenPoint | null) => {
      const angle = Math.PI / 2 + (seatIndex * Math.PI * 2) / Math.max(1, players);
      const fallbackStart = new THREE.Vector3(
        Math.cos(angle) * 4.25,
        0.25,
        Math.sin(angle) * 2.05 - 1.41,
      );
      return source ? screenToTablePoint(source) ?? fallbackStart : fallbackStart;
    };
    const playerDestination = (seatIndex: number, players: number, source?: ScreenPoint | null) => {
      const angle = Math.PI / 2 + (seatIndex * Math.PI * 2) / Math.max(1, players);
      const fallbackDestination = new THREE.Vector3(
        Math.cos(angle) * 4.25,
        0,
        Math.sin(angle) * 2.05 - 1.41,
      );
      return source ? screenToTablePoint(source, 0) ?? fallbackDestination : fallbackDestination;
    };
    const createFlyer = (start: THREE.Vector3, delay = 0, onComplete?: () => void) => {
      const end = new THREE.Vector3(0, 0.22, 1.55);
      const flyer = new THREE.Group();
      const flyerColors = [0xb99863, 0xad5844, 0x59807f];
      for (let h = 0; h < 3; h++) {
        const chip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 0.046, 24),
          new THREE.MeshStandardMaterial({
            color: flyerColors[h % flyerColors.length],
            roughness: 0.42,
            metalness: 0.18,
          }),
        );
        chip.position.y = h * 0.052;
        flyer.add(chip);
      }
      flyer.position.copy(start);
      flyer.rotation.z = (Math.random() - 0.5) * 0.6;
      overlayScene.add(flyer);
      const flyStart = performance.now() + delay;
      const duration = 480;
      const flyTick = () => {
        if (unmounted) return;
        const progress = Math.min(1, Math.max(0, (performance.now() - flyStart) / duration));
        const ease = 1 - (1 - progress) ** 2;
        flyer.position.lerpVectors(start, end, ease);
        flyer.position.y = start.y + Math.sin(progress * Math.PI) * 0.9;
        flyer.rotation.x += 0.35;
        renderScenes();
        if (progress < 1) requestAnimationFrame(flyTick);
        else {
          overlayScene.remove(flyer);
          flyer.children.forEach((child) => {
            const mesh = child as THREE.Mesh;
            mesh.geometry.dispose();
            (mesh.material as THREE.Material).dispose();
          });
          onComplete?.();
          renderScenes();
        }
      };
      flyTick();
    };
    toss.current = (seatIndex, players, source, handNumber, playerId, total) => {
      onChipAnimationStart(handNumber, { [String(playerId)]: total });
      createFlyer(playerStart(seatIndex, players, source));
    };
    let displayedHand: number | null = null;
    let initialFlightHand: number | null = null;
    let initialFlightSerial = 0;
    let latestPot = 0;
    let latestUnit = 1;
    let latestFinished = false;
    update.current = (
      pot,
      unit,
      handNumber,
      totals,
      ids,
      cardPositions,
      animationProgress,
      finished,
      winners,
      players,
    ) => {
      cancelAnimationFrame(frame);
      latestPot = pot;
      latestUnit = unit;
      latestFinished = finished;
      const newHand = displayedHand === null || displayedHand !== handNumber;
      displayedHand = handNumber;
      if (initialFlightHand === handNumber) {
        setPoolChipCount(chips, pot, unit);
        return;
      }
      if (newHand && !finished) {
        initialFlightHand = handNumber;
        const flightSerial = ++initialFlightSerial;
        chips.position.set(0, 0, 0);
        chips.visible = false;
        setPoolChipCount(chips, pot, unit);
        const contributors = totals
          .map((amount, index) => ({ amount, index, playerId: String(ids[index] ?? index) }))
          .filter(({ amount, playerId }) => amount > (animationProgress?.hand === handNumber ? animationProgress.settledTotals[playerId] || 0 : 0));
        if (!contributors.length) {
          initialFlightHand = null;
          chips.visible = pot > 0;
          renderScenes();
          return;
        }
        onChipAnimationStart(
          handNumber,
          Object.fromEntries(contributors.map(({ amount, playerId }) => [playerId, amount])),
        );
        let remaining = contributors.length;
        contributors.forEach(({ index }, sequence) => {
          createFlyer(
            playerStart(index, players, cardPositions[index]),
            sequence * 90,
            () => {
              remaining -= 1;
              if (remaining > 0 || flightSerial !== initialFlightSerial) return;
              initialFlightHand = null;
              chips.position.set(0, 0, 0);
              setPoolChipCount(chips, latestPot, latestUnit);
              chips.visible = latestPot > 0 && !latestFinished;
              renderScenes();
            },
          );
        });
        return;
      }
      setPoolChipCount(chips, pot, unit);
      const start = performance.now();
      const movingToWinners = finished && winners.length > 0;
      const groupCount = finished ? winners.length : 1;
      while (chipGroups.length < groupCount) {
        const copy = chips.clone(true);
        copy.position.set(0, 0, 0);
        copy.scale.set(1, 1, 1);
        scene.add(copy);
        chipGroups.push(copy);
      }
      const starts: THREE.Vector3[] = [];
      const destinations: THREE.Vector3[] = [];
      chipGroups.forEach((group, index) => {
        if (index >= groupCount) {
          group.visible = false;
          return;
        }
        group.visible = true;
        starts[index] = group.position.clone();
        if (movingToWinners) {
          const winnerSeat = winners[index];
          destinations[index] = playerDestination(winnerSeat, players, cardPositions[winnerSeat]);
        } else {
          destinations[index] = new THREE.Vector3(0, 0, 0);
        }
      });
      if (groupCount === 0) {
        renderScenes();
        return;
      }
      const tick = () => {
        const progress = Math.min(1, (performance.now() - start) / 1500);
        const ease = 1 - (1 - progress) ** 3;
        chipGroups.forEach((group, index) => {
          if (index >= groupCount) return;
          group.position.lerpVectors(starts[index], destinations[index], ease);
          group.scale.y = 1;
        });
        renderScenes();
        if (progress < 1) frame = requestAnimationFrame(tick);
        else if (movingToWinners) {
          chipGroups.forEach((group) => (group.visible = false));
          renderScenes();
        }
      };
      tick();
    };
    update.current(
      potValue,
      chipUnit,
      hand,
      playerTotals,
      playerIds,
      playerCardPositions,
      chipAnimation,
      done,
      winnerIndices,
      playerCount,
    );
    return () => {
      unmounted = true;
      cancelAnimationFrame(frame);
      update.current = null;
      toss.current = null;
      ro.disconnect();
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          const materials = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          materials.forEach((m) => m.dispose());
        }
      });
      overlayScene.traverse((obj) => {
        if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
          obj.geometry.dispose();
          const materials = Array.isArray(obj.material)
            ? obj.material
            : [obj.material];
          materials.forEach((m) => m.dispose());
        }
      });
      texture.dispose();
      renderer.dispose();
      overlayRenderer.dispose();
      renderer.domElement.remove();
      overlayRenderer.domElement.remove();
    };
  }, []);
  return (
    <>
      <div
        className={"three-scene" + (failed ? " fallback" : "")}
        ref={host}
        aria-hidden="true"
      />
      <div className="three-scene-overlay" ref={overlayHost} aria-hidden="true" />
    </>
  );
}
