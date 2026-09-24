import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { getTableCameraLayout } from "./tableLayout";
export default function Table3D({
  potValue,
  done,
  winnerIndices,
  playerCount,
  playerTotals,
}: {
  potValue: number;
  done: boolean;
  winnerIndices: number[];
  playerCount: number;
  playerTotals: number[];
}) {
  const update = useRef<
    ((pot: number, done: boolean, winners: number[], players: number, totals: number[]) => void) | null
  >(null);
  useEffect(() => {
    update.current?.(potValue, done, winnerIndices, playerCount, playerTotals);
  }, [potValue, done, winnerIndices, playerCount, playerTotals]);
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    const el = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setFailed(true);
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
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
    for (let stack = 0; stack < 5; stack++) {
      for (let h = 0; h < 2 + (stack % 2); h++) {
        const chip = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.15, 0.042, 28),
          new THREE.MeshStandardMaterial({
            color: colors[stack % 3],
            roughness: 0.42,
            metalness: 0.18,
          }),
        );
        chip.position.set(
          (stack - 2) * 0.23,
          0.2 + h * 0.046,
          (stack % 2) * 0.12,
        );
        chips.add(chip);
        for (let k = 0; k < 6; k++) {
          const band = new THREE.Mesh(
            new THREE.BoxGeometry(0.028, 0.048, 0.037),
            new THREE.MeshStandardMaterial({ color: 0xe2d9b7 }),
          );
          const a = (k * Math.PI) / 3;
          band.position.set(
            chip.position.x + Math.cos(a) * 0.12,
            chip.position.y,
            chip.position.z + Math.sin(a) * 0.12,
          );
          band.rotation.y = -a;
          chips.add(band);
        }
      }
    }
    scene.add(chips);
    const chipGroups = [chips];
    const initialFlights: Array<{
      group: THREE.Group;
      from: THREE.Vector3;
      to: THREE.Vector3;
      startedAt: number;
    }> = [];
    let contributionSnapshot: number[] = [];
    let initialFlightFrame = 0;
    let actionFlightFrame = 0;
    let initialFlightPot = 0;
    let initialFlightFinished = false;
    const actionFlights: Array<{
      group: THREE.Group;
      from: THREE.Vector3;
      to: THREE.Vector3;
      startedAt: number;
      spin: number;
    }> = [];
    const actionChipGeometry = new THREE.CylinderGeometry(0.16, 0.16, 0.045, 28);
    const actionChipMaterial = new THREE.MeshStandardMaterial({
      color: 0xc6a35d,
      roughness: 0.36,
      metalness: 0.2,
    });
    const actionChipEdgeGeometry = new THREE.TorusGeometry(0.125, 0.012, 8, 24);
    const actionChipEdgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xf0db9a,
      roughness: 0.3,
      metalness: 0.25,
    });

    const playerPosition = (index: number, players: number) => {
      const angle = Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, players);
      return new THREE.Vector3(
        Math.cos(angle) * 4.25,
        0,
        Math.sin(angle) * 2.05,
      );
    };

    const animateActionFlights = () => {
      const now = performance.now();
      for (let i = actionFlights.length - 1; i >= 0; i -= 1) {
        const flight = actionFlights[i];
        const progress = Math.min(1, (now - flight.startedAt) / 820);
        const ease = 1 - (1 - progress) ** 3;
        flight.group.position.lerpVectors(flight.from, flight.to, ease);
        flight.group.position.y += Math.sin(Math.PI * progress) * 0.72;
        flight.group.rotation.x = flight.spin + progress * Math.PI * 5;
        flight.group.rotation.z = Math.sin(Math.PI * progress) * 0.22;
        flight.group.scale.setScalar(0.82 + Math.sin(Math.PI * progress) * 0.16);
        if (progress >= 1) {
          scene.remove(flight.group);
          actionFlights.splice(i, 1);
        }
      }
      renderer.render(scene, camera);
      actionFlightFrame = actionFlights.length
        ? requestAnimationFrame(animateActionFlights)
        : 0;
    };

    const queueActionFlight = (from: THREE.Vector3, to: THREE.Vector3) => {
      const group = new THREE.Group();
      const chip = new THREE.Mesh(actionChipGeometry, actionChipMaterial);
      chip.position.y = 0.22;
      group.add(chip);
      const edge = new THREE.Mesh(actionChipEdgeGeometry, actionChipEdgeMaterial);
      edge.rotation.x = Math.PI / 2;
      edge.position.y = 0.246;
      group.add(edge);
      group.position.copy(from);
      group.rotation.x = (Math.random() - 0.5) * 0.35;
      scene.add(group);
      actionFlights.push({
        group,
        from,
        to,
        startedAt: performance.now(),
        spin: group.rotation.x,
      });
      if (actionFlights.length === 1) {
        actionFlightFrame = requestAnimationFrame(animateActionFlights);
      }
    };

    const animateInitialFlights = () => {
      const now = performance.now();
      for (let i = initialFlights.length - 1; i >= 0; i -= 1) {
        const flight = initialFlights[i];
        const progress = Math.min(1, (now - flight.startedAt) / 1500);
        const ease = 1 - (1 - progress) ** 3;
        flight.group.position.lerpVectors(flight.from, flight.to, ease);
        flight.group.scale.setScalar(0.72 + ease * 0.28);
        if (progress >= 1) {
          scene.remove(flight.group);
          initialFlights.splice(i, 1);
        }
      }
      renderer.render(scene, camera);
      if (initialFlights.length) {
        initialFlightFrame = requestAnimationFrame(animateInitialFlights);
      } else {
        chips.visible = !initialFlightFinished && initialFlightPot > 0;
        renderer.render(scene, camera);
        initialFlightFrame = 0;
      }
    };

    const queueInitialFlight = (from: THREE.Vector3, to: THREE.Vector3) => {
      const group = chips.clone(true);
      group.visible = true;
      group.position.copy(from);
      group.scale.setScalar(0.72);
      scene.add(group);
      initialFlights.push({ group, from, to, startedAt: performance.now() });
      if (initialFlights.length === 1) {
        initialFlightFrame = requestAnimationFrame(animateInitialFlights);
      }
    };

    const resize = () => {
      const w = el.clientWidth,
        h = el.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      const cameraLayout = getTableCameraLayout(w, h);
      camera.position.y = cameraLayout.positionY;
      camera.position.z = cameraLayout.positionZ;
      camera.lookAt(0, 0, 0);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();
    let frame = 0;
    update.current = (pot, finished, winners, players, totals) => {
      const previous = contributionSnapshot;
      const handRestarted = previous.length > 0 && totals.some((amount, index) => amount < (previous[index] || 0));
      const shouldAnimateInitial = previous.length === 0 || handRestarted;
      contributionSnapshot = [...totals];

      if (shouldAnimateInitial) {
        cancelAnimationFrame(initialFlightFrame);
        initialFlights.forEach(({ group }) => scene.remove(group));
        initialFlights.length = 0;
        initialFlightPot = pot;
        initialFlightFinished = finished;
        chips.visible = false;
        chips.scale.y = Math.max(0.7, Math.min(1.5, Math.log2(1 + pot / 100) / 3.4));
        totals.forEach((amount, index) => {
          if (amount > 0) queueInitialFlight(playerPosition(index, players), new THREE.Vector3(0, 0, 0));
        });
        renderer.render(scene, camera);
        return;
      }

      totals.forEach((amount, index) => {
        if (amount > (previous[index] || 0)) {
          const from = playerPosition(index, players);
          from.y = 0.22;
          queueActionFlight(from, new THREE.Vector3(0, 0.22, 0));
        }
      });

      cancelAnimationFrame(frame);
      const start = performance.now();
      const movingToWinners = finished && winners.length > 0;
      const groupCount = finished ? winners.length : 1;
      while (chipGroups.length < groupCount) {
        const copy = chips.clone(true);
        copy.position.set(0, 0, 0);
        copy.scale.set(1, 1, 1);
        copy.visible = true;
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
          const angle = Math.PI / 2 + (winners[index] * Math.PI * 2) / Math.max(1, players);
          destinations[index] = new THREE.Vector3(
            Math.cos(angle) * 4.25,
            0,
            Math.sin(angle) * 2.05,
          );
        } else {
          destinations[index] = new THREE.Vector3(0, 0, 0);
        }
      });
      if (groupCount === 0) {
        renderer.render(scene, camera);
        return;
      }
      const tick = () => {
        const progress = Math.min(1, (performance.now() - start) / 1500);
        const ease = 1 - (1 - progress) ** 3;
        chipGroups.forEach((group, index) => {
          if (index >= groupCount) return;
          group.position.lerpVectors(starts[index], destinations[index], ease);
          group.scale.y = Math.max(
            0.7,
            Math.min(1.5, Math.log2(1 + pot / 100) / 3.4),
          );
        });
        renderer.render(scene, camera);
        if (progress < 1) frame = requestAnimationFrame(tick);
        else if (movingToWinners) {
          chipGroups.forEach((group) => (group.visible = false));
          renderer.render(scene, camera);
        }
      };
      tick();
    };
    update.current(potValue, done, winnerIndices, playerCount, playerTotals);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(initialFlightFrame);
      cancelAnimationFrame(actionFlightFrame);
      initialFlights.forEach(({ group }) => scene.remove(group));
      actionFlights.forEach(({ group }) => scene.remove(group));
      actionChipGeometry.dispose();
      actionChipMaterial.dispose();
      actionChipEdgeGeometry.dispose();
      actionChipEdgeMaterial.dispose();
      update.current = null;
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
      texture.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);
  return (
    <div
      className={"three-scene" + (failed ? " fallback" : "")}
      ref={host}
      aria-hidden="true"
    />
  );
}
