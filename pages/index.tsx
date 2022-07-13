import useFaceMesh from '@/face_mesh';
import type { NextPage } from 'next'
import dynamic from "next/dynamic";
import Webcam from 'react-webcam';

/*
const LazyMPFaceMesh = dynamic(
  () => import("@/mediapipe_test"), {
    ssr: false
  }
);
*/

const Home: NextPage = () => {
  const { webcamRef, face } = useFaceMesh({
      maxNumFaces: 1,
      refineLandmarks: true,
      enableFaceGeometry: false,
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    }
  );
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