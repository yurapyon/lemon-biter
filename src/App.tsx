import "./App.css";
import useFaceMesh from "./face-mesh/useFaceMesh";
import Webcam from "react-webcam";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, MeshProps, useFrame, useLoader } from "@react-three/fiber";
import * as Kalidokit from "kalidokit";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import {
  Material,
  Mesh,
  NearestFilter,
  ShaderMaterial,
  SkinnedMesh,
  TextureLoader,
} from "three";
import { loadRoom } from "./three";
import * as rooms from "./three";

// TODO alert on face not detected
//      device picker

/*
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
*/

/*
const FBox: React.FC<{
  face: Kalidokit.TFace;
  offset: Kalidokit.XYZ | undefined;
}> = (props) => {
  const mesh = useRef<MeshProps>(null);

  useEffect(() => {
    if (!mesh.current) return;

    mesh.current.rotation.x = props.face.head.normalized.x * -2;
    mesh.current.rotation.y = props.face.head.normalized.y * 2;
    mesh.current.rotation.z = props.face.head.normalized.z * -2;
    mesh.current.position.x =
      (props.face.head.position.x - (props.offset?.x ?? 0)) * -0.007;
    mesh.current.position.y =
      (props.face.head.position.y - (props.offset?.y ?? 0)) * -0.007;
    mesh.current.position.z =
      (props.face.head.position.z - (props.offset?.z ?? 0)) * 0.025;
  }, [mesh, props.face, props.offset]);

  // Return view, these are regular three.js elements expressed in JSX
  return (
    <mesh ref={mesh}>
      <boxGeometry args={[3, 3, 3]} />
    </mesh>
  );
};

const RenderToTexture: React.FC<{
  targetRef: MutableRefObject<WebGLRenderTarget>;
}> = (props) => {
  const ctx = useThree();

  useFrame(() => {
    if (!props.targetRef.current) return;
    const target = props.targetRef.current;
    ctx.gl.setRenderTarget(target);
    ctx.gl.render(ctx.scene, ctx.camera);
  });

  return null;
};

*/

const vertShader = `
out vec2 uv_coords;

void main() {
  uv_coords = uv;
  //vec4 skinned  = vec4(position, 1.0) * skinIndex * skinWeight.x;
  //skinned      += vec4(position, 1.0) * skinIndex * skinWeight.y;
  //skinned      += vec4(position, 1.0) * skinIndex * skinWeight.z;
  //skinned      += vec4(position, 1.0) * skinIndex * skinWeight.w;
  // vec4 asdf = skinIndex;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragShader = `
in vec2 uv_coords;

uniform sampler2D tex;
uniform vec2 tex_dimensions;
uniform vec2 eye_offset;

uniform int blink_frame;
uniform int mouth_frame;

vec2 px_scale = vec2(1./128., 1./128.);
vec2 block_scale;

bool pointWithinBlock(vec2 point, vec2 block_offset) {
  vec2 block_bl = block_offset * block_scale;
  vec2 block_tr = (block_offset + 1.) * block_scale;

  return point.x <= block_tr.x &&
         point.x >= block_bl.x &&
         point.y <= block_tr.y &&
         point.y >= block_bl.y;
}

// size is 128 x 128
// provide bottom left corner
void blitBlock(vec2 block, vec2 draw_offset, bool use_mask, vec2 mask_offset) {
  vec2 coords = (uv_coords + block) * block_scale - draw_offset * px_scale;

  vec2 mask_coords = (uv_coords + mask_offset) * block_scale;
  vec4 mask_value = texture2D(tex, mask_coords);

  if (use_mask) {
    if (mask_value.a > 0.5) {
      if (pointWithinBlock(coords, block)) {
        vec4 col = texture2D(tex, coords);
        if (col.a > 0.5) {
          gl_FragColor = col;
        }
      }
    }
  } else {
    if (pointWithinBlock(coords, block)) {
      vec4 col = texture2D(tex, coords);
      if (col.a > 0.5) {
        gl_FragColor = col;
      }
    }
  }
}

void main() {
  gl_FragColor = vec4(uv_coords.x, 0, uv_coords.y, 1);

  px_scale = 1. / tex_dimensions;
  block_scale =  px_scale * 128.;
  blitBlock(vec2(0, 5), vec2(0, 0), false, vec2(0, 0));

  blitBlock(vec2(0, 3), vec2(eye_offset.x, eye_offset.y / 2.), true, vec2(blink_frame, 1));
  blitBlock(vec2(0, 4), eye_offset, true, vec2(blink_frame, 1));

  blitBlock(vec2(blink_frame, 2), vec2(0, 0), false, vec2(0, 0));
  blitBlock(vec2(mouth_frame, 0), vec2(0, 0), false, vec2(0, 0));
}
`;

const Thingy: React.FC<{
  face: Kalidokit.TFace;
  pupilOffset: { x: number; y: number };
}> = ({ face, pupilOffset }) => {
  const mesh = useRef<Mesh>(null);

  const face_tex = useLoader(TextureLoader, "src/assets/bites/face.png");
  useEffect(() => {
    face_tex.magFilter = NearestFilter;
    face_tex.minFilter = NearestFilter;
  }, [face_tex]);

  const uniforms = useMemo(() => {
    return {
      tex: { value: face_tex },
      tex_dimensions: {
        value: [face_tex.image.width, face_tex.image.height],
      },
      eye_offset: { value: [0, 0] },
      blink_frame: { value: 0 },
      mouth_frame: { value: 0 },
    };
  }, []);

  useFrame(() => {
    if (mesh.current?.material instanceof Material) {
      const uniforms = (mesh.current?.material as ShaderMaterial).uniforms;
      uniforms.eye_offset.value = [
        (face.pupil.x - pupilOffset.x) * 7,
        (face.pupil.y - pupilOffset.y + 0.2) * 7,
      ];
      uniforms.blink_frame.value = face.eye.l > 0.5 ? 0 : 1;
      uniforms.mouth_frame.value = face.mouth.y < 0.25 ? 0 : 1;
    }
  });

  return (
    <mesh ref={mesh}>
      <shaderMaterial
        uniforms={uniforms}
        fragmentShader={fragShader}
        vertexShader={vertShader}
      />
      <planeGeometry args={[128, 128]} />
    </mesh>
  );
};

const useRoom = () => {
  const [roomLoaded, setRoomLoaded] = useState(false);
  useEffect(() => {
    if (roomLoaded) return;
    loadRoom("src/assets/bites/vtuber_in_room.glb", () => {
      setRoomLoaded(true);
    });
  }, [roomLoaded, setRoomLoaded]);
  return roomLoaded;
};

const Room: React.FC<{
  face: Kalidokit.TFace;
  pupilOffset: { x: number; y: number };
}> = ({ face, pupilOffset }) => {
  const gltf = useLoader(GLTFLoader, "src/assets/bites/vtuber_in_room.glb");
  gltf.nodes.head_1.rotation.x = -face.head.normalized.x * 2;
  gltf.nodes.head_1.rotation.y = face.head.normalized.y * 2;
  gltf.nodes.head_1.rotation.z = -face.head.normalized.z * 2;

  const faceMesh = gltf.nodes.face as Mesh;
  useEffect(() => {
    const matl = new ShaderMaterial({
      uniforms: uniforms,
      fragmentShader: fragShader,
      vertexShader: vertShader,
    });
    // console.log(gltf.nodes.face);
    const old = gltf.nodes.face as SkinnedMesh;
    gltf.nodes.face = new Mesh(old.geometry, matl);
    // (gltf.nodes.face as SkinnedMesh).bind(old.skeleton);

    // console.log(gltf.nodes.face);
    /*
    (gltf.nodes.face as SkinnedMesh).material = new ShaderMaterial({
      uniforms: uniforms,
      fragmentShader: fragShader,
      vertexShader: vertShader,
    });
    console.log((gltf.nodes.face as SkinnedMesh).material);
    console.log((gltf.nodes.body as SkinnedMesh).material);
    */
  }, [gltf]);

  const face_tex = useLoader(TextureLoader, "src/assets/bites/face.png");
  useEffect(() => {
    face_tex.magFilter = NearestFilter;
    face_tex.minFilter = NearestFilter;
  }, [face_tex]);

  const uniforms = useMemo(() => {
    return {
      tex: { value: face_tex },
      tex_dimensions: {
        value: [face_tex.image.width, face_tex.image.height],
      },
      eye_offset: { value: [0, 0] },
      blink_frame: { value: 0 },
      mouth_frame: { value: 0 },
    };
  }, []);

  useFrame(() => {
    const uniforms = ((gltf.nodes.face as Mesh).material as ShaderMaterial)
      .uniforms;
    uniforms.eye_offset.value = [
      (face.pupil.x - pupilOffset.x) * 7,
      (face.pupil.y - pupilOffset.y + 0.2) * 7,
    ];
    uniforms.blink_frame.value = face.eye.l > 0.5 ? 0 : 1;
    uniforms.mouth_frame.value = face.mouth.y < 0.25 ? 0 : 1;
  });

  return (
    <mesh>
      <primitive object={gltf.scene} />
    </mesh>
  );
};

function App() {
  const { webcamRef, face } = useFaceMesh({
    maxNumFaces: 1,
    refineLandmarks: true,
    // TODO what does this do
    enableFaceGeometry: false,
    minDetectionConfidence: 0.7,
    minTrackingConfidence: 0.7,
  });
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const roomLoaded = useRoom();

  if (roomLoaded) {
    console.log(rooms.room);
    console.log(rooms.body);
    console.log(rooms.face);
  }

  /*
  const [time, setTime] = useState(0);
  const [eyeSin, setEyeSin] = useState(0);
  useFrame((_state, delta) => {
    setTime(time + delta);
    setEyeSin(Math.sin(time));
  });
  */

  // TODO make sure ortho cam position is right

  /*
  useEffect(() => {
    const interval = setInterval(() => {
      console.log("This will be called every 2 seconds");
    }, 200);

    return () => clearInterval(interval);
  }, []);
  */

  return (
    <div className="App">
      <div style={{ width: 128, height: 128 }}>
        <Canvas camera={{ position: [0, 0, 1] }} orthographic={true}>
          <Thingy face={face} pupilOffset={offset} />
        </Canvas>
      </div>

      <div style={{ width: 1920 / 2, height: 1080 / 2 }}>
        <Canvas
          camera={{
            fov: 43,
            position: [0, 7.2, 10.7],
            rotation: [(3.9 * Math.PI) / 180, 0, 0],
          }}
        >
          <Room face={face} pupilOffset={offset} />
        </Canvas>
      </div>
      <div>
        <button
          onClick={() => {
            setOffset(face?.pupil);
          }}
        >
          setOffset
        </button>
      </div>
      <div>
        <Webcam
          audio={false}
          mirrored={true}
          ref={webcamRef}
          style={
            {
              // visibility: "hidden",
            }
          }
        />
      </div>
    </div>
  );
}

export default App;
