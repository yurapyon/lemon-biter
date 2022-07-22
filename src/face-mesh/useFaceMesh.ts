import * as FaceMesh from "@mediapipe/face_mesh";
import { Camera } from "@mediapipe/camera_utils";
import * as Kalidokit from "kalidokit";
import { useEffect, useRef, useState } from "react";
import Webcam from "react-webcam";

const WEBCAM_WIDTH = 1280;
const WEBCAM_HEIGHT = 720;

const restingTFace: Kalidokit.TFace = {
  ...Kalidokit.Utils.RestingDefault.Face,
  head: {
    ...Kalidokit.Utils.RestingDefault.Face.head,
    normalized: {
      x: 0,
      y: 0,
      z: 0,
    },
    degrees: {
      x: 0,
      y: 0,
      z: 0,
    },
  },
};

const useFaceMesh = (options: FaceMesh.Options) => {
  const webcamRef = useRef<Webcam>(null);
  const faceMeshRef = useRef<FaceMesh.FaceMesh>();
  const [faceFound, setFaceFound] = useState(false);
  const [face, setFace] = useState<Kalidokit.TFace>(restingTFace);

  const onResults = (results: FaceMesh.Results) => {
    if (!webcamRef?.current) {
      return;
    }

    if (results.multiFaceLandmarks) {
      setFaceFound(results.multiFaceLandmarks.length !== 0);
      for (const landmarks of results.multiFaceLandmarks) {
        setFace(
          Kalidokit.Face.solve(landmarks, {
            runtime: "mediapipe",
            video: webcamRef.current.video,
            // imageSize: { width: WEBCAM_WIDTH, height: WEBCAM_HEIGHT, },
          }) ?? restingTFace
        );
      }
    }
  };

  useEffect(() => {
    const faceMesh = new FaceMesh.FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${FaceMesh.VERSION}/${file}`;
      },
    });
    faceMesh.onResults(onResults);

    if (webcamRef.current?.video) {
      const camera = new Camera(webcamRef.current.video, {
        onFrame: async () => {
          if (webcamRef.current?.video) {
            await faceMesh.send({ image: webcamRef.current.video });
          }
        },
        width: WEBCAM_WIDTH,
        height: WEBCAM_HEIGHT,
      });
      camera.start();
    }

    faceMeshRef.current = faceMesh;
  }, [webcamRef]);

  useEffect(() => {
    faceMeshRef.current?.setOptions(options);
  }, [options]);

  return {
    webcamRef,
    faceFound,
    face,
  };
};

export default useFaceMesh;
