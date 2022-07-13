import useFaceMeshLandmarks from '@/face_mesh';
import type { NextPage } from 'next'
import dynamic from "next/dynamic";
import Webcam from 'react-webcam';
import * as Kalidokit from 'kalidokit';
import { useState } from 'react';

/*
const LazyMPFaceMesh = dynamic(
  () => import("@/mediapipe_test"), {
    ssr: false
  }
);

          setFace(
            Kalidokit.Face.solve(landmarks, {
            runtime: "mediapipe",
            video: webcamRef.current.video,
            // imageSize: { width: WEBCAM_WIDTH, height: WEBCAM_HEIGHT, },
          }));
*/

const Home: NextPage = () => {
  const [face, setFace] = useState<Kalidokit.Face>();

  const { webcamRef, landmarks } = useFaceMeshLandmarks({
      maxNumFaces: 1,
      refineLandmarks: true,
      enableFaceGeometry: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }
  );

  if(webcamRef.current?.video && landmarks) {
    setFace(Kalidokit.Face.solve(landmarks, {
      runtime: "mediapipe",
      video: webcamRef.current.video,
      // imageSize: { width: WEBCAM_WIDTH, height: WEBCAM_HEIGHT, },
    }));
  }
  
  console.log(face);

  return (
    <div>
      <Webcam
        audio={false}
        mirrored={true}
        ref={webcamRef}
        style={{
          position: "absolute",
          marginLeft: "auto",
          marginRight: "auto",
          left: "0",
          right: "0",
          textAlign: "center",
          zIndex: 9,
          width: 1280,
          height: 720,
        }}
      />
    </div>
  )
}

export default Home