import type { NextPage } from 'next'
import dynamic from "next/dynamic";

const LazyMPFaceMesh = dynamic(
  () => import("@/mediapipe_test"),
  {
    ssr: false,
  }
);

const Home: NextPage = () => {
  return (
    <div>
      <LazyMPFaceMesh 
        options={ {
          maxNumFaces: 1,
          refineLandmarks: true,
          enableFaceGeometry: false,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        }}
      />
    </div>
  )
}

export default Home