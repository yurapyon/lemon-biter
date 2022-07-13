import { useRef, useEffect, useState, useCallback } from "react";
import Webcam from "react-webcam";
import { Camera } from "@mediapipe/camera_utils";
import type * as FaceMeshTypes from "@mediapipe/face_mesh";
import * as Kalidokit from "kalidokit";

const WEBCAM_WIDTH = 1280;
const WEBCAM_HEIGHT = 720;

const useFaceMesh = (options: FaceMeshTypes.Options) => {
  const [MPFaceMesh, setMPFaceMesh] = useState<typeof import("@mediapipe/face_mesh/index")>();
  const loadMPFaceMesh = useCallback(async () => {
    setMPFaceMesh((await import("@mediapipe/face_mesh")).default);
  }, []);

  const webcamRef = useRef<Webcam>(null);
  const faceMeshRef = useRef<FaceMeshTypes.FaceMesh>();
  const [face, setFace] = useState<Kalidokit.TFace>();

  useEffect(() => {
    loadMPFaceMesh();
    if (!MPFaceMesh) return;

    const faceMesh = new MPFaceMesh.FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${MPFaceMesh.VERSION}/${file}`;
      },
    });
    faceMesh.onResults(onResults);

    if (webcamRef?.current?.video) {
      const camera = new Camera(webcamRef.current.video, {
        onFrame: async () => {
          if (webcamRef?.current?.video) {
            await faceMesh.send({ image: webcamRef.current.video });
          }
        },
        width: WEBCAM_WIDTH,
        height: WEBCAM_HEIGHT,
      });
      camera.start();
    }

    faceMeshRef.current = faceMesh;
  }, [loadMPFaceMesh, MPFaceMesh]);

  useEffect(() => {
    faceMeshRef.current?.setOptions(options);
  }, [options]);

  const onResults = (results: FaceMeshTypes.Results) => {
    if (!webcamRef?.current) {
      return;
    }

    if (results.multiFaceLandmarks) {
      for (const landmarks of results.multiFaceLandmarks) {
        setFace(Kalidokit.Face.solve(landmarks, {
          runtime: "mediapipe",
          video: webcamRef.current.video,
          // imageSize: { width: WEBCAM_WIDTH, height: WEBCAM_HEIGHT, },
        }));
      }
    }
  };

  return {
    webcamRef,
    face
  };
};

export default useFaceMesh;