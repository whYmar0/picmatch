import React, { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AuthProvider, useAuth } from "../../src/contexts/AuthContext";
import api from "../../src/api";
import { MediaVideo, MotionMediaImage } from "../../src/components/Media";
import VideoPlayer from "../../src/components/VideoPlayer";

const base = api.defaults.baseURL.replace(/\/+$/, "");
const image = `${base}/media/11111111-1111-4111-8111-111111111111?variant=display`;
const video = `${base}/media/22222222-2222-4222-8222-222222222222?variant=display&media_type=video`;

function Fixture() {
  const auth = useAuth();
  const imageRef = useRef(null), videoRef = useRef(null);
  const [failures, setFailures] = useState(0), [metadata, setMetadata] = useState(0);
  const [imageTag, setImageTag] = useState(""), [videoTag, setVideoTag] = useState("");
  return <>
    <button onClick={() => auth.login("b@example.com", "Fixture!42", false)}>Switch account</button>
    <output data-testid="failures">{failures}</output>
    <output data-testid="metadata">{metadata}</output>
    <output data-testid="image-ref">{imageTag}</output><output data-testid="video-ref">{videoTag}</output>
    <MotionMediaImage ref={imageRef} layoutId="media-proof" data-testid="image" src={image} alt="Protected fixture" width="64" height="64"
      onLoad={() => setImageTag(imageRef.current?.tagName)} onError={() => setFailures(n => n + 1)} />
    <MediaVideo ref={videoRef} data-testid="video" src={video} muted autoPlay loop controls width="128" height="96"
      onLoadedMetadata={() => { setMetadata(n => n + 1); setVideoTag(videoRef.current?.tagName); }} />
    <div data-testid="player"><VideoPlayer src={video} muted autoPlay loop blurredBackdrop style={{ width: 128, height: 96 }} /></div>
  </>;
}
createRoot(document.getElementById("root")).render(<AuthProvider><Fixture /></AuthProvider>);
