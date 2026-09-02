"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { bulletAt } from "@/core/motion";
import { DIFFICULTY, type Difficulty, type Level, generateLevel } from "@/core/level";
import { type Session, createSession, ghostAhead, stepSession } from "@/core/session";
import type { Vec2 } from "@/core/types";
import { WORLD } from "@/core/world";
import { type Records, loadRecords, submitRecord } from "@/lib/records";

const LEVELS: { key: keyof typeof DIFFICULTY; label: string }[] = [
  { key: "easy", label: "易" },
  { key: "normal", label: "並" },
  { key: "hard", label: "難" },
];

/** ゴーストで見せる先読みの長さ(tick)。 */
const GHOST_SPAN = 120;

function draw(
  ctx: CanvasRenderingContext2D,
  px: number,
  s: Session,
  ghost: readonly Vec2[] | null,
) {
  const X = (v: number) => v * px;
  ctx.clearRect(0, 0, px, px);

  // 盤面
  ctx.fillStyle = "#0b0e13";
  ctx.fillRect(0, 0, px, px);
  ctx.strokeStyle = "#1b2130";
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, px - 1, px - 1);

  // 避け道(F-12)— 証明された経路そのもの
  if (ghost && ghost.length > 1) {
    ctx.strokeStyle = "rgba(127, 209, 193, 0.45)";
    ctx.lineWidth = Math.max(1.5, px * 0.004);
    ctx.setLineDash([px * 0.012, px * 0.012]);
    ctx.beginPath();
    ctx.moveTo(X(ghost[0].x), X(ghost[0].y));
    for (const p of ghost.slice(1)) ctx.lineTo(X(p.x), X(p.y));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // 弾
  ctx.fillStyle = "#e0574f";
  for (const b of s.level.bullets) {
    const p = bulletAt(b, s.tick);
    if (p === null) continue;
    if (p.x < -0.1 || p.x > 1.1 || p.y < -0.1 || p.y > 1.1) continue;
    ctx.beginPath();
    ctx.arc(X(p.x), X(p.y), X(WORLD.bulletRadius), 0, Math.PI * 2);
    ctx.fill();
  }

  // 自機
  ctx.fillStyle = s.status === "hit" ? "#6b7280" : "#eef2f7";
  ctx.beginPath();
  ctx.arc(X(s.ship.x), X(s.ship.y), X(WORLD.shipRadius), 0, Math.PI * 2);
  ctx.fill();
  if (s.status !== "hit") {
    ctx.strokeStyle = "rgba(127, 209, 193, 0.9)";
    ctx.lineWidth = Math.max(1, px * 0.002);
    ctx.beginPath();
    ctx.arc(X(s.ship.x), X(s.ship.y), X(WORLD.shipRadius) * 1.9, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<Vec2 | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const [difficulty, setDifficulty] = useState<keyof typeof DIFFICULTY>("normal");
  const [seed, setSeed] = useState(1);
  const [level, setLevel] = useState<Level | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [building, setBuilding] = useState(true);
  const [showGhost, setShowGhost] = useState(false); // F-12: 既定は OFF
  const [status, setStatus] = useState<Session["status"]>("playing");
  const [tick, setTick] = useState(0);
  const [records, setRecords] = useState<Records>({});
  const recordedRef = useRef(false);

  // 記録は初回描画の後に読む(サーバ側に localStorage は無い)
  useEffect(() => {
    try {
      setRecords(loadRecords(window.localStorage));
    } catch {
      /* 読めない環境では空のまま */
    }
  }, []);

  // 面が終わったら記録を出す。1 面につき一度だけ。
  useEffect(() => {
    if (status === "playing" || recordedRef.current) return;
    recordedRef.current = true;
    try {
      setRecords(submitRecord(window.localStorage, difficulty, tick));
    } catch {
      /* 保存できなくても遊びは続く */
    }
  }, [status, tick, difficulty]);

  // 面を作る。生成は 1 秒弱かかるので、先に「支度中」を描かせてから回す(N-06)。
  useEffect(() => {
    setBuilding(true);
    setLevel(null);
    const id = window.setTimeout(() => {
      const d: Difficulty = DIFFICULTY[difficulty];
      const g = generateLevel(d, seed, WORLD, 40);
      setLevel(g.level);
      setAttempts(g.attempts);
      setBuilding(false);
    }, 30);
    return () => window.clearTimeout(id);
  }, [difficulty, seed]);

  // ゲームループ。固定 tick(WORLD.dt)で進める。
  useEffect(() => {
    if (!level) return;
    const s0 = createSession(level, WORLD);
    sessionRef.current = s0;
    targetRef.current = null;
    recordedRef.current = false;
    setStatus(s0.status);
    setTick(0);

    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const step = (now: number) => {
      raf = requestAnimationFrame(step);
      acc += Math.min(0.25, (now - last) / 1000);
      last = now;
      let s = sessionRef.current!;
      while (acc >= WORLD.dt) {
        acc -= WORLD.dt;
        s = stepSession(s, targetRef.current, WORLD);
      }
      sessionRef.current = s;
      setStatus(s.status);
      setTick(s.tick);

      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (canvas && ctx) {
        draw(ctx, canvas.width, s, showGhost ? ghostAhead(level, s.tick, GHOST_SPAN) : null);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [level, showGhost]);

  // 描画解像度を実寸に合わせる(にじみを避ける)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const fit = () => {
      const size = Math.round(canvas.clientWidth * Math.min(2, window.devicePixelRatio || 1));
      if (size > 0 && canvas.width !== size) {
        canvas.width = size;
        canvas.height = size;
      }
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const toWorld = useCallback((e: React.PointerEvent<HTMLCanvasElement>): Vec2 => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  }, []);

  const onDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      targetRef.current = toWorld(e);
    },
    [toWorld],
  );
  const onMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (targetRef.current !== null) targetRef.current = toWorld(e);
    },
    [toWorld],
  );
  const onUp = useCallback(() => {
    targetRef.current = null;
  }, []);

  const remaining = Math.max(0, WORLD.ticks - tick);

  return (
    <div className="game">
      <div className="board">
        <canvas
          ref={canvasRef}
          className="canvas"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        />
        {building && <div className="veil">面を支度しています…</div>}
        {!building && level === null && (
          <div className="veil">
            この種では面を作れませんでした。種を変えてください。
          </div>
        )}
        {!building && level !== null && status !== "playing" && (
          <div className="veil">
            {status === "cleared" ? "抜けた" : "被弾"}
            <button className="again" onClick={() => setSeed((v) => v + 1)}>
              次の面へ
            </button>
          </div>
        )}
      </div>

      <div className="hud">
        <span className="stat">
          残り <b>{(remaining * WORLD.dt).toFixed(1)}</b> 秒
        </span>
        <span className="stat">
          種 <b>{seed}</b>
        </span>
        {level && (
          <span className="stat">
            試行 <b>{attempts}</b>
          </span>
        )}
        {records[difficulty] !== undefined && (
          <span className="stat">
            最良 <b>{(records[difficulty]! * WORLD.dt).toFixed(1)}</b> 秒
          </span>
        )}
      </div>

      <div className="controls">
        <div className="group" role="group" aria-label="難度">
          {LEVELS.map((d) => (
            <button
              key={d.key}
              className={d.key === difficulty ? "on" : ""}
              onClick={() => setDifficulty(d.key)}
            >
              {d.label}
            </button>
          ))}
        </div>
        <div className="group">
          <button className={showGhost ? "on" : ""} onClick={() => setShowGhost((v) => !v)}>
            避け道 {showGhost ? "表示" : "非表示"}
          </button>
          <button onClick={() => setSeed((v) => v + 1)}>別の面</button>
        </div>
      </div>

      <p className="hint">
        画面を押さえて指(またはマウス)を動かすと、機体がその点を追います。離すとその場に留まります。
        「避け道」は、この面が抜けられることを<strong>証明したときの経路そのもの</strong>です。
      </p>
    </div>
  );
}
