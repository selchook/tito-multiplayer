"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import dynamic from "next/dynamic";

// Dynamic import to avoid SSR issues with PeerJS
const TitoGame = dynamic(() => import("../components/TitoGame"), { ssr: false });

// ─── GENERATE ROOM CODE ─────────────────────────────────────
function generateRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// ─── LOBBY COMPONENT ────────────────────────────────────────
const CONNECTION_TIMEOUT_MS = 60_000;

function Lobby({ onGameStart }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(null);
  const peerRef = useRef(null);
  const connRef = useRef(null);
  const countdownRef = useRef(null);

  // Countdown timer helper
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

  // Check URL for host param on mount (shared invite link)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("host")) {
      setMode("join");
    }
  }, []);

  // Auto-join when mode is 'join' and host param exists in URL
  useEffect(() => {
    if (mode === "join" && !connRef.current) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("host")) {
        const timer = setTimeout(() => handleJoin(), 300);
        return () => clearTimeout(timer);
      }
    }
  }, [mode]);

  const initPeer = useCallback(() => {
    return new Promise((resolve, reject) => {
      import("peerjs").then(({ default: Peer }) => {
        const peer = new Peer(undefined, {
          debug: 0,
          // Explicit PeerJS cloud config — needed for iOS WSS
          host: "0.peerjs.com",
          port: 443,
          path: "/",
          secure: true,
          config: {
            iceServers: [
              // Google STUN
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
              // freestun.net — dedicated free TURN, more reliable than openrelay
              { urls: "stun:freestun.net:3479" },
              { urls: "turn:freestun.net:3479", username: "free", credential: "free" },
              { urls: "turns:freestun.net:5350", username: "free", credential: "free" },
              // openrelay.metered.ca — backup TURN
              { urls: "stun:openrelay.metered.ca:80" },
              { urls: "turn:openrelay.metered.ca:80", username: "openrelayproject", credential: "openrelayproject" },
              { urls: "turn:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
              { urls: "turns:openrelay.metered.ca:443", username: "openrelayproject", credential: "openrelayproject" },
            ],
            iceTransportPolicy: "all",
            bundlePolicy: "max-bundle",
            rtcpMuxPolicy: "require",
          },
        });
        peer.on("open", (id) => resolve(peer));
        peer.on("error", (err) => reject(err));
        peerRef.current = peer;
      });
    });
  }, []);

  const handleCreate = async () => {
    setMode("create");
    setStatus("Creating room...");
    setError("");
    try {
      const peer = await initPeer();
      const code = generateRoomCode();
      setRoomCode(code);
      setStatus("Waiting for opponent...");

      // Store peer ID mapping via the room code
      // We'll use the peer ID directly in the connection
      // Guest will connect using: host's peer ID

      // Reconnect to signaling server if iOS drops the WebSocket in background
      peer.on("disconnected", () => { try { peer.reconnect(); } catch (_) {} });

      // Host-side 60s timeout — expire the room if no one joins
      startCountdown(() => {
        if (!connRef.current?.open) {
          setError("Room expired — no one joined within 60s.");
          setStatus("");
          peerRef.current?.destroy();
          peerRef.current = null;
        }
      });

      peer.on("connection", (conn) => {
        stopCountdown();
        connRef.current = conn;
        conn.on("open", () => {
          // Send init message with game seed
          const seed = Math.floor(Math.random() * 2147483647);
          conn.send({ type: "init", seed, hostPeerId: peer.id });
          onGameStart({
            myPlayer: 0,
            seed,
            conn,
            peer,
            isHost: true,
          });
        });
        conn.on("error", (err) => setError("Connection error: " + err.message));
      });

      // Store the peer ID as the room code mapping
      // We encode the peer ID in the shareable link
      window.history.replaceState({}, "", `?host=${peer.id}&code=${code}`);
    } catch (err) {
      setError("Failed to create room: " + err.message);
      setStatus("");
    }
  };

  const handleJoin = async () => {
    if (!joinCode && !mode) return;
    setMode("join");
    setStatus("Connecting...");
    setError("");
    try {
      const peer = await initPeer();

      // Get the host peer ID from URL params
      const params = new URLSearchParams(window.location.search);
      let hostPeerId = params.get("host");

      if (!hostPeerId) {
        setError("Invalid room link. Ask the host to share the full link.");
        setStatus("");
        return;
      }

      // Reconnect to signaling server if iOS drops the WebSocket in background
      peer.on("disconnected", () => { try { peer.reconnect(); } catch (_) {} });

      const conn = peer.connect(hostPeerId, {
        reliable: true,
        serialization: "json", // iOS Safari has issues with binary DataChannel
      });
      connRef.current = conn;

      conn.on("open", () => {
        stopCountdown();
        setStatus("Connected! Waiting for game init...");
      });

      conn.on("data", (data) => {
        if (data.type === "init") {
          onGameStart({
            myPlayer: 1,
            seed: data.seed,
            conn,
            peer,
            isHost: false,
          });
        }
      });

      conn.on("error", (err) => {
        stopCountdown();
        setError("Connection failed: " + err.message);
        setStatus("");
      });

      // 60s connection timeout
      startCountdown(() => {
        if (!connRef.current?.open) {
          setError("Connection timed out. Make sure the host is still waiting.");
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
      ? `${window.location.origin}?host=${peerRef.current?.id}&code=${roomCode}`
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
            stopCountdown();
            peerRef.current?.destroy();
            connRef.current = null;
            peerRef.current = null;
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
        gameSession.peer?.destroy();
        setGameSession(null);
        window.history.replaceState({}, "", window.location.pathname);
      }}
    />
  );
}
