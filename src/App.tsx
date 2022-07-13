import './App.css';
import useFaceMesh from './face_mesh/useFaceMesh';
import Webcam from 'react-webcam';
import { useEffect, useRef, useState } from 'react';
import { Canvas, MeshProps, useFrame } from '@react-three/fiber';
import * as Kalidokit from "kalidokit";
import { FACEMESH_LEFT_IRIS } from '@mediapipe/face_mesh';

// TODO alert on face not detected
//      device picker

function Box(props: any) {
  // This reference will give us direct access to the mesh
  const mesh = useRef<MeshProps>(null);

  // Set up state for the hovered and active state
  const [hovered, setHover] = useState(false);
  const [active, setActive] = useState(false);

  // Subscribe this component to the render-loop, rotate the mesh every frame
  useFrame((state, delta) =>  {
    if (!mesh.current) return;
    mesh.current.rotation.x += 0.01
  });

  // Return view, these are regular three.js elements expressed in JSX
  return (
    <mesh
      {...props}
      ref={mesh}
      scale={active ? 1.5 : 1}
      onClick={(event) => setActive(!active)}
      onPointerOver={(event) => setHover(true)}
      onPointerOut={(event) => setHover(false)}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color={hovered ? 'hotpink' : 'orange'} />
    </mesh>
  )
}

const FBox: React.FC<{face: Kalidokit.TFace | undefined, offset: Kalidokit.XYZ | undefined}> = (props) => {
  const mesh = useRef<MeshProps>(null);

  useEffect(() => {
    if (!mesh.current || !props.face) return;

    mesh.current.rotation.x = props.face.head.normalized.x * -2;
    mesh.current.rotation.y = props.face.head.normalized.y * 2;
    mesh.current.rotation.z = props.face.head.normalized.z * -2;
    mesh.current.position.x = (props.face.head.position.x - (props.offset?.x ?? 0)) * -0.007
    mesh.current.position.y = (props.face.head.position.y - (props.offset?.y ?? 0)) * -0.007
    mesh.current.position.z = (props.face.head.position.z - (props.offset?.z ?? 0)) * 0.025
  }, [mesh, props.face, props.offset]);

  if (!props.face) return null;

  // Return view, these are regular three.js elements expressed in JSX
  return (
    <mesh ref={mesh} >
      <boxGeometry args={[3, 3, 3]} />
    </mesh>
  );
}

function App() {
  const { webcamRef, face } = useFaceMesh({
      maxNumFaces: 1,
      refineLandmarks: true,
      // TODO what does this do
      enableFaceGeometry: false,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7,
    }
  );

  const [offset, setOffset] = useState<Kalidokit.XYZ>();

  return (
    <>
      <div style={{width: 1000, height: 700}}>
        <Canvas>
          <ambientLight />
          <pointLight position={[10, 10, 10]} />
          <FBox face={face} offset={offset}/>
        </Canvas>
      </div>
      <div>
        <button onClick={()=>{
          setOffset(face?.head.position);
          console.log(offset);
        }}>setOffset</button>
      </div>
      <div>
        <Webcam
          audio={false}
          mirrored={true}
          ref={webcamRef}
          style={{
            // visibility: 'hidden',
          }}
        />
      </div>
    </>
  );
}

export default App;
