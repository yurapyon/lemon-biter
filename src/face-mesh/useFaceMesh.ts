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

type FaceMeshData = {
  mpFaceMesh: FaceMesh.FaceMesh | null;
  kalidokitFace: Kalidokit.TFace;
  faceFound: boolean;
};

const useFaceMesh = (options: FaceMesh.Options) => {
  const webcamRef = useRef<Webcam>(null);
  const faceRef = useRef<Kalidokit.TFace>(restingTFace);

  const data = useRef<FaceMeshData>({
    mpFaceMesh: null,
    faceFound: false,
    kalidokitFace: restingTFace,
  });

  const onResults = (results: FaceMesh.Results) => {
    if (!webcamRef?.current) {
      return;
    }

    if (results.multiFaceLandmarks) {
      data.current.faceFound = results.multiFaceLandmarks.length !== 0;
      for (const landmarks of results.multiFaceLandmarks) {
        faceRef.current =
          Kalidokit.Face.solve(landmarks, {
            runtime: "mediapipe",
            video: webcamRef.current.video,
            // imageSize: { width: WEBCAM_WIDTH, height: WEBCAM_HEIGHT, },
          }) ?? restingTFace;
      }
    }
  };

  useEffect(() => {
    if (data.current.mpFaceMesh !== null) return;

    const faceMesh = new FaceMesh.FaceMesh({
      locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh@${FaceMesh.VERSION}/${file}`;
      },
    });
    faceMesh.onResults(onResults);

    if (!webcamRef.current?.video) {
      throw "no video";
    }

    const camera = new Camera(webcamRef.current.video, {
      onFrame: async () => {
        if (webcamRef.current?.video) {
          // TODO leaks
          await faceMesh.send({ image: webcamRef.current.video });
        }
      },
      width: WEBCAM_WIDTH,
      height: WEBCAM_HEIGHT,
    });

    data.current.mpFaceMesh = faceMesh;
    camera.start();
  }, [webcamRef]);

  useEffect(() => {
    data.current.mpFaceMesh?.setOptions(options);
  }, [options]);

  return {
    webcamRef,
    faceRef: faceRef,
    faceFound: data.current.faceFound,
  };
};

export default useFaceMesh;
