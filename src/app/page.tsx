"use client";

import React, { useRef, useState } from "react";
import { io, Socket } from "socket.io-client";

const socket: Socket = io("http://localhost:8080");

export default function Home() {
    const [role, setRole] = useState<"streamer" | "viewer" | null>(null);
    const localVideoRef = useRef<HTMLVideoElement>(null);
    const remoteVideoRef = useRef<HTMLVideoElement>(null);
    const peerConnection = useRef<RTCPeerConnection | null>(null);

    const startStreaming = async () => {
        setRole("streamer");

        // Create a WebRTC PeerConnection
        peerConnection.current = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        // Capture screen instead of the user's camera
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: true,
            audio: false,
        });
        if (localVideoRef.current) localVideoRef.current.srcObject = stream;

        // Add the local stream to the peer connection
        stream
            .getTracks()
            .forEach((track) =>
                peerConnection.current?.addTrack(track, stream)
            );

        // Handle ICE candidates
        peerConnection.current.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("ice-candidate", { candidate: event.candidate });
            }
        };

        // Create and send the offer to the backend
        const offer = await peerConnection.current.createOffer();
        await peerConnection.current.setLocalDescription(offer);
        socket.emit("offer", { offer });
    };

    const startViewing = async () => {
        setRole("viewer");

        // Create a WebRTC PeerConnection
        peerConnection.current = new RTCPeerConnection({
            iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });

        // Handle incoming remote streams
        peerConnection.current.ontrack = (event) => {
            if (remoteVideoRef.current)
                remoteVideoRef.current.srcObject = event.streams[0];
        };

        // Handle ICE candidates
        peerConnection.current.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("ice-candidate", { candidate: event.candidate });
            }
        };
    };

    // Listen for WebRTC signaling messages
    React.useEffect(() => {
        socket.on("offer", async ({ offer }) => {
            if (role === "viewer") {
                await peerConnection.current?.setRemoteDescription(
                    new RTCSessionDescription(offer)
                );

                // Create and send an answer to the backend
                const answer = await peerConnection.current?.createAnswer();
                await peerConnection.current?.setLocalDescription(answer!);
                socket.emit("answer", { answer });
            }
        });

        socket.on("answer", async ({ answer }) => {
            if (role === "streamer") {
                await peerConnection.current?.setRemoteDescription(
                    new RTCSessionDescription(answer)
                );
            }
        });

        socket.on("ice-candidate", async ({ candidate }) => {
            if (candidate) {
                try {
                    await peerConnection.current?.addIceCandidate(
                        new RTCIceCandidate(candidate)
                    );
                } catch (error) {
                    console.error(
                        "Error adding received ICE candidate:",
                        error
                    );
                }
            }
        });

        return () => {
            socket.off("offer");
            socket.off("answer");
            socket.off("ice-candidate");
        };
    }, [role]);

    return (
        <div style={{ textAlign: "center" }}>
            <h1>Live Streaming</h1>
            <div>
                {!role && (
                    <>
                        <button onClick={startStreaming}>Streamer</button>
                        <button onClick={startViewing}>Viewer</button>
                    </>
                )}
            </div>

            <div>
                {role === "streamer" && (
                    <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        style={{ width: "60%", border: "1px solid black" }}
                    />
                )}
                {role === "viewer" && (
                    <video
                        ref={remoteVideoRef}
                        autoPlay
                        playsInline
                        style={{ width: "60%", border: "1px solid black" }}
                    />
                )}
            </div>
        </div>
    );
}

