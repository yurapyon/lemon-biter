import "./App.css";
import useFaceMesh from "./face-mesh/useFaceMesh";
import Webcam from "react-webcam";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as Kalidokit from "kalidokit";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import {
  Mesh,
  NearestFilter,
  Object3D,
  ShaderMaterial,
  Skeleton,
  SkinnedMesh,
  TextureLoader,
} from "three";
import { loadRoom } from "./three";
import * as rooms from "./three";
import { clamp } from "three/src/math/MathUtils";
import { Stats } from "@react-three/drei";

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
#include <common>
#include <uv_pars_vertex>
#include <uv2_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>

out vec2 uv_coords;

void main() {
	#include <uv_vertex>
	#include <uv2_vertex>
	#include <color_vertex>
	#include <skinbase_vertex>
	#ifdef USE_ENVMAP
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>

  uv_coords = uv;
}
`;

const fragShader = `
in vec2 uv_coords;
// vec2 uv_coords;

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
  // vec2 coords = (uv_coords + block) * block_scale - draw_offset * px_scale;
  // vec2 mask_coords = (uv_coords + mask_offset) * block_scale;

  vec2 coords = uv_coords + block * block_scale + draw_offset * px_scale;
  vec2 mask_coords = uv_coords + mask_offset * block_scale;

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
  // gl_FragColor = vec4(uv_coords.x, uv_coords.y*3., 0, 1);
  // gl_FragColor = texture2D(tex, uv_coords);
  // return;

  px_scale = 1. / tex_dimensions;
  block_scale =  px_scale * 128.;

  blitBlock(vec2(0, 1), vec2(0, 0), false, vec2(0, 0));

  // vec2 eyes = trunc(eye_offset/3.)*3.;
  blitBlock(vec2(0, 2), eye_offset, true, vec2(blink_frame, 5));
  blitBlock(vec2(0, 3), vec2(eye_offset.x, 0), true, vec2(blink_frame, 5));

  blitBlock(vec2(blink_frame, 4), vec2(0, 0), false, vec2(0, 0));
  blitBlock(vec2(mouth_frame, 6), vec2(0, 0), false, vec2(0, 0));
}
`;

/*
const FacePreview: React.FC<{
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
        (face.pupil.x - pupilOffset.x) * -7,
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
*/

const useRoom = () => {
  const [initialized, setInitialized] = useState(false);
  const [roomLoaded, setRoomLoaded] = useState(false);

  const canv = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (initialized) return;
    rooms.init({ width: 400, height: 300 });
    canv.current = rooms.renderer.domElement;
    setInitialized(true);
  });

  useEffect(() => {
    if (roomLoaded) return;
    loadRoom("src/assets/bites/vtuber_in_room_Real_joined.glb", () => {
      setRoomLoaded(true);
    });
  });

  return { canv, initialized, roomLoaded };
};

const useAverage = (count: number) => {
  const ref = useRef<number[]>([]);

  const pushOne = (val: number) => {
    ref.current.push(val);
    if (ref.current.length > count) {
      ref.current.shift();
    }
  };

  const getValue = () => {
    if (ref.current.length > 0) {
      const summed = ref.current.reduce((prev, curr) => prev + curr);
      return summed / Math.min(ref.current.length, count);
    } else {
      return 0;
    }
  };

  return { getValue, pushOne };
};

const Room: React.FC<{
  face: Kalidokit.TFace;
  pupilOffset: { x: number; y: number };
  headOffset: { x: number; y: number; z: number };
}> = ({ face, pupilOffset, headOffset }) => {
  const gltf = useLoader(
    GLTFLoader,
    "src/assets/bites/vtuber_in_room_Real_joined.glb"
  );

  const [done, setDone] = useState(false);
  const skel = useRef<Skeleton | null>(null);

  const face_tex = useLoader(TextureLoader, "src/assets/bites/face.png");

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

  useEffect(() => {
    face_tex.magFilter = NearestFilter;
    face_tex.minFilter = NearestFilter;
  }, [face_tex]);

  // const eye_avg = useRef<{ x: number; y: number }[]>([]);
  const { getValue: getPXA, pushOne: pushPXA } = useAverage(4);
  const { getValue: getPYA, pushOne: pushPYA } = useAverage(4);

  const { getValue: getHXA, pushOne: pushHXA } = useAverage(6);
  const { getValue: getHYA, pushOne: pushHYA } = useAverage(6);
  const { getValue: getHZA, pushOne: pushHZA } = useAverage(6);

  // pos
  const { getValue: getHPXA, pushOne: pushHPXA } = useAverage(20);
  const { getValue: getHPYA, pushOne: pushHPYA } = useAverage(20);
  const { getValue: getHPZA, pushOne: pushHPZA } = useAverage(20);

  const { getValue: getHXALong, pushOne: pushHXALong } = useAverage(20);
  const { getValue: getHYALong, pushOne: pushHYALong } = useAverage(20);
  const { getValue: getHZALong, pushOne: pushHZALong } = useAverage(20);

  const { getValue: getBlinkA, pushOne: pushBlinkA } = useAverage(3);
  const { getValue: getMouthA, pushOne: pushMouthA } = useAverage(6);

  useFrame((state) => {
    pushPXA(clamp(face.pupil.x, -1, 1));
    pushPYA(clamp(face.pupil.y, -1, 1));

    const uniforms = (
      (gltf.scene.getObjectByName("_face") as Mesh).material as ShaderMaterial
    ).uniforms;
    uniforms.eye_offset.value = [
      (getPXA() - pupilOffset.x) * -5,
      (getPYA() - pupilOffset.y + 0.1) * 5,
    ];
    pushBlinkA(face.eye.l);
    uniforms.blink_frame.value = getBlinkA() > 0.5 ? 0 : 1;
    pushMouthA(face.mouth.y);
    uniforms.mouth_frame.value = getMouthA() < 0.2 ? 0 : 1;

    pushHPXA(face.head.position.x);
    pushHPYA(face.head.position.y);
    pushHPZA(face.head.position.z);
    const headPosX = (getHPXA() - headOffset.x) / -200;
    const headPosY = (getHPYA() - headOffset.y) / -200;
    const headPosZ = (getHPZA() - headOffset.z) / 20;

    // console.log(headPosX, headPosY, headPosZ);

    if (skel.current) {
      pushHXA(face.head.normalized.x);
      pushHYA(face.head.normalized.y);
      pushHZA(face.head.normalized.z);
      pushHXALong(face.head.normalized.x);
      pushHYALong(face.head.normalized.y);
      pushHZALong(face.head.normalized.z);
      const headBone = skel.current.bones.find((bone) => bone.name === "head");
      const baseBone = skel.current.bones.find((bone) => bone.name === "base");
      const torsoBone = skel.current.bones.find(
        (bone) => bone.name === "torso"
      );

      const wingLBone = skel.current.bones.find(
        (bone) => bone.name === "wing_L"
      );

      const wingRBone = skel.current.bones.find(
        (bone) => bone.name === "wing_R"
      );

      if (headBone && baseBone && torsoBone && wingLBone && wingRBone) {
        const basePosX = baseBone.position.x;
        const basePosY = baseBone.position.y;
        const basePosZ = baseBone.position.z;

        // console.log(
        // (Math.atan(headPosX / (headPosY - basePosY)) * 180) / Math.PI
        // );

        const rotX = Math.atan(-headPosZ / (headPosY - basePosY)) - Math.PI;
        const rotY = Math.atan(headPosX / (headPosY - basePosY));

        let wing =
          Math.sin(state.clock.elapsedTime * 2 * 0.5) +
          Math.sin(state.clock.elapsedTime * 3 * 0.5);
        wing = wing / 2;

        let breathe = (Math.sin(state.clock.elapsedTime * 0.8) + 1) / 2;
        breathe = 1 - Math.pow(breathe, 1.5);

        headBone.rotation.x = -getHXA() * 2;
        headBone.rotation.y = getHYA() * 2;
        headBone.rotation.z = -getHZA() * 2;
        torsoBone.rotation.x = rotX / 2;
        torsoBone.rotation.y = getHYA() * 1.5;
        torsoBone.rotation.z = rotY / 2;
        torsoBone.position.y = headPosZ / 3;
        torsoBone.position.z = headPosY / -2 + 0.25 + breathe * 0.15;
        wingLBone.rotation.z = Math.PI * 1.55 + wing / 5;
        wingRBone.rotation.z = -Math.PI * 1.55 - wing / 5;
        // baseBone.position.y = headOffset.y / -200 + 5;
        // baseBone.position.x = (face.head.position.x - headOffset.x) / -200;
        // baseBone.position.y = (face.head.position.y - headOffset.y) / -200 + 5;
        // baseBone.position.z = (face.head.position.z - headOffset.z) / 20;
      }
    }
  });

  useEffect(() => {
    if (done) return;

    face_tex.flipY = false;
    const faceMatl = new ShaderMaterial({
      uniforms: uniforms,
      fragmentShader: fragShader,
      vertexShader: vertShader,
    });
    const oldFace = gltf.scene.getObjectByName("_face") as SkinnedMesh;
    const newFace = new SkinnedMesh(oldFace.geometry, faceMatl);
    (newFace as Object3D).add(oldFace.skeleton.bones[0]);
    newFace.bind(oldFace.skeleton);
    newFace.name = "_face";

    gltf.scene.add(newFace);
    gltf.scene.remove(oldFace);

    skel.current = newFace.skeleton;

    const baseBone = skel.current.bones.find((bone) => bone.name === "base");
    const armilBone = skel.current.bones.find(
      (bone) => bone.name === "arm_i_L"
    );
    const armirBone = skel.current.bones.find(
      (bone) => bone.name === "arm_i_R"
    );

    // TODO remove when gun is out of room
    const gunBone = skel.current.bones.find((bone) => bone.name === "gun");

    if (baseBone) {
      baseBone.position.x = 0;
      baseBone.position.y = 4.3;
      baseBone.position.z = 0.8;
    }

    if (armilBone) {
      armilBone.rotation.z = (-160 * Math.PI) / 180;
    }

    if (armirBone) {
      armirBone.rotation.z = (160 * Math.PI) / 180;
    }

    if (gunBone) {
      gunBone.scale.x = 0;
      gunBone.scale.y = 0;
      gunBone.scale.z = 0;
    }

    // console.log(gltf);

    setDone(true);
  }, [gltf]);

  return (
    <mesh>
      <primitive object={gltf.scene} />
    </mesh>
  );
};

const HeadAnim: React.FC<{ face: Kalidokit.TFace; roomLoaded: boolean }> = ({
  face,
  roomLoaded,
}) => {
  useFrame(() => {
    if (roomLoaded && rooms.chara) {
      const head = rooms.chara.getObjectByName("head");
      if (head) {
        head.rotation.x = -face.head.normalized.x * 2;
        head.rotation.y = face.head.normalized.y * 2;
        head.rotation.z = -face.head.normalized.z * 2;
      }
    }
  });

  return null;
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
  const [headOffset, setHeadOffset] = useState<Kalidokit.XYZ>({
    x: 0,
    y: 0,
    z: 0,
  });

  // const { canv, roomLoaded } = useRoom();

  // if (roomLoaded) {
  // console.log(rooms.room);
  // console.log(rooms.chara);
  // console.log(rooms.face);
  // }

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

      {canv.current && (
        <canvas ref={canv} style={{ width: 400, height: 300 }} />
      )}

      <div style={{ width: 128, height: 128 }}>
        <Canvas camera={{ position: [0, 0, 1] }} orthographic={true}>
          <FacePreview face={face} pupilOffset={offset} />
        </Canvas>
      </div>
  */

  return (
    <div className="App">
      <div style={{ width: 1280, height: 720 }}>
        <Canvas
          camera={{
            fov: 43,
            position: [0, 7, 11],
            rotation: [(4 * Math.PI) / 180, 0, 0],
          }}
          flat={true}
          gl={{ antialias: false }}
        >
          <Stats />
          <Room face={face} pupilOffset={offset} headOffset={headOffset} />
        </Canvas>
      </div>
      <div>
        <button
          onClick={() => {
            setOffset(face?.pupil);
            setHeadOffset(face?.head.position);
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
