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
function Lobby({ onGameStart }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [roomCode, setRoomCode] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [p1Name, setP1Name] = useState("");
  const [p2Name, setP2Name] = useState("");
  const [copied, setCopied] = useState(false);
  const peerRef = useRef(null);
  const connRef = useRef(null);

  // Check URL for room code on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("room");
    if (code) {
      setJoinCode(code.toUpperCase());
      setMode("join");
    }
  }, []);

  // Auto-join when mode is 'join' and we have a code from URL
  useEffect(() => {
    if (mode === "join" && joinCode && !connRef.current) {
      // Small delay to let UI render
      const timer = setTimeout(() => handleJoin(), 300);
      return () => clearTimeout(timer);
    }
  }, [mode, joinCode]);

  const initPeer = useCallback(() => {
    return new Promise((resolve, reject) => {
      import("peerjs").then(({ default: Peer }) => {
        const peer = new Peer(undefined, {
          debug: 0,
          config: {
            iceServers: [
              { urls: "stun:stun.l.google.com:19302" },
              { urls: "stun:stun1.l.google.com:19302" },
            ],
          },
        });
        peer.on("open", (id) => resolve(peer));
        peer.on("error", (err) => reject(err));
        peerRef.current = peer;
      });
    });
  }, []);

  const handleCreate = async () => {
    setStatus("Creating room...");
    setError("");
    try {
      const peer = await initPeer();
      const code = generateRoomCode();
      setRoomCode(code);
      setStatus("Waiting for opponent...");

      const hostName = p1Name.trim() || "P1";
      const guestName = p2Name.trim() || "P2";

      peer.on("connection", (conn) => {
        connRef.current = conn;
        conn.on("open", () => {
          const seed = Math.floor(Math.random() * 2147483647);
          conn.send({ type: "init", seed, hostPeerId: peer.id, p1Name: hostName, p2Name: guestName });
          onGameStart({
            myPlayer: 0,
            seed,
            conn,
            peer,
            isHost: true,
            myName: hostName,
            opponentName: guestName,
          });
        });
        conn.on("error", (err) => setError("Connection error: " + err.message));
      });

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

      const conn = peer.connect(hostPeerId, { reliable: true });
      connRef.current = conn;

      conn.on("open", () => {
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
            myName: data.p2Name || "P2",
            opponentName: data.p1Name || "P1",
          });
        }
      });

      conn.on("error", (err) => {
        setError("Connection failed: " + err.message);
        setStatus("");
      });

      // Timeout
      setTimeout(() => {
        if (!connRef.current?.open) {
          setError("Connection timed out. Make sure the host is still waiting.");
          setStatus("");
        }
      }, 60000);
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
      }}
    >
      {/* Title */}
      <div
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
          {[
            { label: "Player 1 (You)", value: p1Name, set: setP1Name, color: "#06b6d4" },
            { label: "Player 2 (Opponent)", value: p2Name, set: setP2Name, color: "#f43f5e" },
          ].map(({ label, value, set, color }) => (
            <input
              key={label}
              value={value}
              onChange={(e) => set(e.target.value)}
              placeholder={label}
              maxLength={16}
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                border: `2px solid ${color}44`,
                background: "#1e293b",
                color: "#e2e8f0",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: "monospace",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          ))}
          <div style={{ borderTop: "1px solid #1e293b", margin: "4px 0" }} />
          <button
            onClick={() => { setMode("create"); handleCreate(); }}
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
            {status}
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
            {status || "Preparing to join..."}
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
            peerRef.current?.destroy();
            connRef.current = null;
            peerRef.current = null;
            setMode(null);
            setRoomCode("");
            setJoinCode("");
            setStatus("");
            setError("");
            setP1Name("");
            setP2Name("");
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
      myName={gameSession.myName}
      opponentName={gameSession.opponentName}
      onDisconnect={() => {
        gameSession.peer?.destroy();
        setGameSession(null);
        window.history.replaceState({}, "", window.location.pathname);
      }}
    />
  );
}
