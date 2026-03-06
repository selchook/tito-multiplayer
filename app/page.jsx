"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";

const TitoGame = dynamic(() => import("../components/TitoGame"), { ssr: false });

// ─── GENERATE ROOM CODE ─────────────────────────────────────
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── ABLY CONN SHIM ──────────────────────────────────────────
// Wraps an Ably channel with the same interface as a PeerJS DataConnection
// so TitoGame.jsx needs zero changes.
function createAblyConn(channel, myPlayer) {
  const handlers = { data: [], close: [], error: [] };
  let isOpen = true;

  // Receive messages from the OTHER player only
  channel.subscribe("msg", (msg) => {
    if (!isOpen) return;
    if (msg.data.from !== myPlayer) {
      const { from, ...data } = msg.data;
      handlers.data.forEach(h => h(data));
    }
  });

  // Detect opponent disconnection via Ably presence
  channel.presence.subscribe("leave", (member) => {
    if (member.data?.player !== myPlayer) {
      isOpen = false;
      handlers.close.forEach(h => h());
    }
  });

  // Enter presence so opponent can detect us
  channel.presence.enter({ player: myPlayer }).catch(() => {});

  return {
    get open() { return isOpen; },
    send(data) {
      if (isOpen) channel.publish("msg", { ...data, from: myPlayer }).catch(() => {});
    },
    on(event, handler) {
      if (handlers[event]) handlers[event].push(handler);
    },
    off(event, handler) {
      if (handlers[event]) {
        handlers[event] = handlers[event].filter(h => h !== handler);
      }
    },
    destroy() {
      isOpen = false;
      channel.presence.leave().catch(() => {});
      channel.unsubscribe();
    },
  };
}

// ─── LOBBY COMPONENT ────────────────────────────────────────
const CONNECTION_TIMEOUT_MS = 60_000;
const ABLY_KEY = process.env.NEXT_PUBLIC_ABLY_KEY;

function Lobby({ onGameStart }) {
  const [mode, setMode] = useState(null);
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const ablyRef = useRef(null);
  const channelRef = useRef(null);
  const countdownRef = useRef(null);
  const joinIntervalRef = useRef(null);
  const gameStartedRef = useRef(false);

  const startCountdown = useCallback((onExpire) => {
    let secs = CONNECTION_TIMEOUT_MS / 1000;
    setCountdown(secs);
    countdownRef.current = setInterval(() => {
      secs--;
      setCountdown(secs);
      if (secs <= 0) {
        clearInterval(countdownRef.current);
        setCountdown(null);
        onExpire();
      }
    }, 1000);
  }, []);

  const stopCountdown = useCallback(() => {
    clearInterval(countdownRef.current);
    setCountdown(null);
  }, []);

  const cleanupAbly = useCallback(() => {
    clearInterval(joinIntervalRef.current);
    stopCountdown();
    try { channelRef.current?.unsubscribe(); } catch (_) {}
    try { channelRef.current?.presence?.leave(); } catch (_) {}
    try { ablyRef.current?.close(); } catch (_) {}
    channelRef.current = null;
    ablyRef.current = null;
    gameStartedRef.current = false;
  }, [stopCountdown]);

  // Check URL for room param on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("room")) setMode("join");
  }, []);

  // Auto-join when mode is 'join' and room param exists
  useEffect(() => {
    if (mode === "join") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("room")) {
        const timer = setTimeout(() => handleJoin(), 300);
        return () => clearTimeout(timer);
      }
    }
  }, [mode]);

  const initAbly = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!ABLY_KEY) {
        reject(new Error("NEXT_PUBLIC_ABLY_KEY not set in .env.local"));
        return;
      }
      import("ably").then(({ default: Ably }) => {
        const client = new Ably.Realtime({ key: ABLY_KEY, autoConnect: true });
        const timeout = setTimeout(() => {
          reject(new Error("Ably connection timed out"));
        }, 10000);
        client.connection.once("connected", () => {
          clearTimeout(timeout);
          ablyRef.current = client;
          resolve(client);
        });
        client.connection.once("failed", () => {
          clearTimeout(timeout);
          reject(new Error("Ably connection failed — check your API key"));
        });
      }).catch(reject);
    });
  }, []);

  const handleCreate = async () => {
    setMode("create");
    setStatus("Creating room...");
    setError("");
    gameStartedRef.current = false;
    try {
      const ably = await initAbly();
      const code = generateRoomCode();
      setRoomCode(code);
      setStatus("Waiting for opponent...");

      const channel = ably.channels.get(`game-${code}`);
      channelRef.current = channel;

      channel.subscribe("guest-join", () => {
        if (gameStartedRef.current) return;
        gameStartedRef.current = true;
        stopCountdown();
        const seed = Math.floor(Math.random() * 2147483647);
        const conn = createAblyConn(channel, 0);
        channel.publish("init", { seed });
        onGameStart({ myPlayer: 0, seed, conn, peer: null, isHost: true, ably });
      });

      startCountdown(() => {
        if (!gameStartedRef.current) {
          setError("Room expired — no one joined within 60s.");
          setStatus("");
          cleanupAbly();
          setMode(null);
        }
      });

      window.history.replaceState({}, "", `?room=${code}`);
    } catch (err) {
      setError("Failed to create room: " + err.message);
      setStatus("");
    }
  };

  const handleJoin = async () => {
    setMode("join");
    setStatus("Connecting...");
    setError("");
    gameStartedRef.current = false;

    const params = new URLSearchParams(window.location.search);
    const code = (params.get("room") || joinCode || "").toUpperCase().trim();

    if (!code) {
      setError("Enter a room code or use the host's invite link.");
      setStatus("");
      return;
    }

    try {
      const ably = await initAbly();
      const channel = ably.channels.get(`game-${code}`);
      channelRef.current = channel;

      channel.subscribe("init", (msg) => {
        if (gameStartedRef.current) return;
        gameStartedRef.current = true;
        clearInterval(joinIntervalRef.current);
        stopCountdown();
        const conn = createAblyConn(channel, 1);
        onGameStart({ myPlayer: 1, seed: msg.data.seed, conn, peer: null, isHost: false, ably });
      });

      // Publish guest-join repeatedly until host responds
      const doJoin = () => {
        if (!gameStartedRef.current) channel.publish("guest-join", { ts: Date.now() });
      };
      doJoin();
      joinIntervalRef.current = setInterval(doJoin, 2000);

      startCountdown(() => {
        if (!gameStartedRef.current) {
          clearInterval(joinIntervalRef.current);
          setError("Connection timed out. Make sure the host has the room open.");
          setStatus("");
        }
      });
    } catch (err) {
      setError("Failed to connect: " + err.message);
      setStatus("");
    }
  };

  const shareUrl =
    typeof window !== "undefined" && roomCode
      ? `${window.location.origin}?room=${roomCode}`
      : "";

  const whatsappUrl = shareUrl
    ? `https://wa.me/?text=${encodeURIComponent(
        `🎮 Join my Tito'nun Tankı game!\n\n${shareUrl}`
      )}`
    : "";

  const copyLink = () => {
    navigator.clipboard?.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="lobby-wrap"
      style={{
        background: "#0a0a1a",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "'JetBrains Mono','SF Mono',monospace",
        color: "#e2e8f0",
        padding: 20,
        overflowY: "auto",
      }}
    >
      {/* Title */}
      <div
        className="lobby-title"
        style={{
          fontSize: 36,
          fontWeight: 900,
          letterSpacing: 6,
          background: "linear-gradient(135deg,#06b6d4,#f43f5e)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          marginBottom: 8,
        }}
      >
        TITO'NUN TANKI
      </div>
      <div
        className="lobby-sub"
        style={{
          fontSize: 14,
          color: "#64748b",
          letterSpacing: 3,
          marginBottom: 40,
        }}
      >
        ⚔️ ONLINE MULTIPLAYER ⚔️
      </div>

      {!mode && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 320 }}>
          <button
            onClick={handleCreate}
            style={{
              padding: "18px 24px",
              borderRadius: 12,
              border: "2px solid #06b6d4",
              background: "linear-gradient(135deg,#0891b2,#06b6d4)",
              color: "#fff",
              fontSize: 16,
              fontWeight: 900,
              fontFamily: "monospace",
              letterSpacing: 2,
              cursor: "pointer",
              boxShadow: "0 0 25px rgba(6,182,212,0.3)",
            }}
          >
            🎮 CREATE GAME
          </button>
          <div style={{ textAlign: "center", color: "#475569", fontSize: 12 }}>OR</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="ROOM CODE"
              maxLength={6}
              style={{
                flex: 1,
                padding: "14px 16px",
                borderRadius: 10,
                border: "2px solid #334155",
                background: "#1e293b",
                color: "#e2e8f0",
                fontSize: 16,
                fontWeight: 700,
                fontFamily: "monospace",
                letterSpacing: 4,
                textAlign: "center",
                outline: "none",
              }}
            />
            <button
              onClick={handleJoin}
              disabled={joinCode.length < 3}
              style={{
                padding: "14px 20px",
                borderRadius: 10,
                border: "2px solid #f43f5e",
                background: joinCode.length >= 3 ? "linear-gradient(135deg,#e11d48,#f43f5e)" : "#1e293b",
                color: joinCode.length >= 3 ? "#fff" : "#475569",
                fontSize: 14,
                fontWeight: 900,
                fontFamily: "monospace",
                cursor: joinCode.length >= 3 ? "pointer" : "not-allowed",
              }}
            >
              JOIN
            </button>
          </div>
        </div>
      )}

      {mode === "create" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
            width: 360,
          }}
        >
          {roomCode && (
            <>
              <div style={{ fontSize: 12, color: "#64748b", letterSpacing: 2 }}>ROOM CODE</div>
              <div
                style={{
                  fontSize: 40,
                  fontWeight: 900,
                  letterSpacing: 12,
                  color: "#22d3ee",
                  textShadow: "0 0 20px rgba(34,211,238,0.3)",
                }}
              >
                {roomCode}
              </div>

              <div style={{ display: "flex", gap: 10, width: "100%" }}>
                <button
                  onClick={copyLink}
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 10,
                    border: "1px solid #334155",
                    background: copied ? "#059669" : "#1e293b",
                    color: copied ? "#fff" : "#94a3b8",
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "monospace",
                    cursor: "pointer",
                    transition: "all 0.2s",
                  }}
                >
                  {copied ? "✅ COPIED!" : "📋 COPY LINK"}
                </button>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    flex: 1,
                    padding: "12px",
                    borderRadius: 10,
                    border: "1px solid #25D366",
                    background: "linear-gradient(135deg,#128C7E,#25D366)",
                    color: "#fff",
                    fontSize: 13,
                    fontWeight: 700,
                    fontFamily: "monospace",
                    cursor: "pointer",
                    textAlign: "center",
                    textDecoration: "none",
                  }}
                >
                  📱 WHATSAPP
                </a>
              </div>
            </>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "#f59e0b",
              fontSize: 13,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#f59e0b",
                animation: "pulse 1.5s infinite",
              }}
            />
            {status}{countdown !== null && ` (${countdown}s)`}
          </div>
        </div>
      )}

      {mode === "join" && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 16,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              color: "#06b6d4",
              fontSize: 14,
            }}
          >
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: "#06b6d4",
                animation: "pulse 1.5s infinite",
              }}
            />
            {status || "Preparing to join..."}{countdown !== null && ` (${countdown}s)`}
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            marginTop: 16,
            padding: "12px 20px",
            borderRadius: 10,
            background: "rgba(239,68,68,0.1)",
            border: "1px solid #ef4444",
            color: "#ef4444",
            fontSize: 12,
            maxWidth: 360,
            textAlign: "center",
          }}
        >
          {error}
        </div>
      )}

      {mode && (
        <button
          onClick={() => {
            cleanupAbly();
            setMode(null);
            setRoomCode("");
            setJoinCode("");
            setStatus("");
            setError("");
            window.history.replaceState({}, "", window.location.pathname);
          }}
          style={{
            marginTop: 24,
            padding: "10px 20px",
            borderRadius: 8,
            border: "1px solid #334155",
            background: "transparent",
            color: "#64748b",
            fontSize: 12,
            fontFamily: "monospace",
            cursor: "pointer",
          }}
        >
          ← BACK
        </button>
      )}

      <style jsx>{`
        @keyframes pulse {
          0%,
          100% {
            opacity: 0.4;
          }
          50% {
            opacity: 1;
          }
        }
        @media (orientation: landscape) and (max-height: 500px) {
          .lobby-title { font-size: 22px !important; letter-spacing: 3px !important; margin-bottom: 2px !important; }
          .lobby-sub { font-size: 11px !important; margin-bottom: 12px !important; }
          .lobby-btn { padding: 10px 16px !important; font-size: 13px !important; }
          .lobby-wrap { padding: 10px !important; justify-content: flex-start !important; padding-top: 16px !important; }
        }
      `}</style>
    </div>
  );
}

// ─── MAIN PAGE ──────────────────────────────────────────────
export default function Home() {
  const [gameSession, setGameSession] = useState(null);

  if (!gameSession) {
    return <Lobby onGameStart={setGameSession} />;
  }

  return (
    <TitoGame
      isMultiplayer={true}
      myPlayer={gameSession.myPlayer}
      seed={gameSession.seed}
      conn={gameSession.conn}
      peer={gameSession.peer}
      isHost={gameSession.isHost}
      onDisconnect={() => {
        gameSession.conn?.destroy?.();
        try { gameSession.ably?.close(); } catch (_) {}
        setGameSession(null);
        window.history.replaceState({}, "", window.location.pathname);
      }}
    />
  );
}
