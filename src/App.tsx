import "./App.css";
import useFaceMesh from "./face-mesh/useFaceMesh";
import Webcam from "react-webcam";
import React, {
  MutableRefObject,
  Ref,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import * as Kalidokit from "kalidokit";
import { GLTF, GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import {
  Mesh,
  NearestFilter,
  Object3D,
  ShaderMaterial,
  Skeleton,
  SkinnedMesh,
  Texture,
  TextureLoader,
} from "three";
import { clamp } from "three/src/math/MathUtils";
import { Stats } from "@react-three/drei";
import { useFilePicker } from "use-file-picker";

// TODO alert on face not detected
//      device picker

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
// TODO make work
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
  gltfFile: string;
  faceFile: string;
  faceRef: MutableRefObject<Kalidokit.TFace>;
  pupilOffset: { x: number; y: number };
  headOffset: { x: number; y: number; z: number };
}> = ({ gltfFile, faceFile, faceRef, pupilOffset, headOffset }) => {
  const [gltf, setGltf] = useState<GLTF>();
  useEffect(() => {
    new GLTFLoader().parse(gltfFile, "/", setGltf);
  }, [gltfFile]);

  const [done, setDone] = useState(false);
  const skel = useRef<Skeleton | null>(null);

  // const face_tex = useLoader(TextureLoader, faceFile);
  const [faceTex, setFaceTex] = useState<Texture>();
  useEffect(() => {
    new TextureLoader().load(faceFile, setFaceTex);
  }, [faceFile]);

  const uniforms = useMemo(() => {
    return {
      tex: { value: faceTex },
      tex_dimensions: {
        value: [faceTex?.image.width, faceTex?.image.height],
      },
      eye_offset: { value: [0, 0] },
      blink_frame: { value: 0 },
      mouth_frame: { value: 0 },
    };
  }, [faceTex]);

  useEffect(() => {
    if (!faceTex) return;
    faceTex.magFilter = NearestFilter;
    faceTex.minFilter = NearestFilter;
  }, [faceTex]);

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
    if (!done) return;
    if (!gltf) return;

    const face = faceRef.current;
    pushPXA(clamp(face.pupil.x, -1, 1));
    pushPYA(clamp(face.pupil.y, -1, 1));

    const uniforms = (
      (gltf.scene.getObjectByName("_face") as Mesh).material as ShaderMaterial
    ).uniforms;
    uniforms.eye_offset.value = [
      (getPXA() - pupilOffset.x) * -5,
      (getPYA() - pupilOffset.y + 0.2) * 5,
    ];
    pushBlinkA(face.eye.l);
    uniforms.blink_frame.value = getBlinkA() > 0.4 ? 0 : 1;
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
    if (!gltf) return;
    if (!faceTex) return;

    faceTex.flipY = false;
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

    const room = gltf.scene.getObjectByName("room_parent");
    if (room) gltf.scene.remove(room);

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

  if (!gltf) {
    return null;
  }

  return (
    <mesh>
      <primitive object={gltf.scene} />
    </mesh>
  );
};

function App() {
  const { webcamRef, faceRef } = useFaceMesh({
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

  const [deviceId, setDeviceId] = useState({});
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);

  const handleDevices = useCallback(
    (mediaDevices: MediaDeviceInfo[]) =>
      setDevices(mediaDevices.filter(({ kind }) => kind === "videoinput")),
    [setDevices]
  );

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(handleDevices);
  }, [handleDevices]);

  const [openFileSelector, { filesContent }] = useFilePicker({
    accept: [".gltf", ".glb"],
    // readFilesContent: false,
    readAs: "ArrayBuffer",
  });

  const [openTextureSelector, { filesContent: textureContent }] = useFilePicker(
    {
      accept: [".png"],
      readAs: "DataURL",
    }
  );

  // if (loading) {
  // return <div>loading...</div>;
  // }

  // "src/assets/bites/vtuber_in_room_Real_joined.glb"

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
          {filesContent.length > 0 && (
            <Room
              gltfFile={filesContent[0].content}
              faceFile={textureContent[0].content}
              faceRef={faceRef}
              pupilOffset={offset}
              headOffset={headOffset}
            />
          )}
        </Canvas>
      </div>
      <div>
        <button
          onClick={() => {
            openFileSelector();
          }}
        >
          pick gltf file
        </button>
        <button
          onClick={() => {
            openTextureSelector();
          }}
        >
          pick face texture
        </button>
        <button
          onClick={() => {
            setOffset(faceRef.current.pupil);
            setHeadOffset(faceRef.current.head.position);
          }}
        >
          setOffset
        </button>
      </div>
      <div>
        {devices.map((info) => {
          return (
            <button
              onClick={() => {
                setDeviceId(info.deviceId);
              }}
              key={info.deviceId}
            >
              {info.label}
            </button>
          );
        })}
      </div>
      <div>
        <Webcam
          audio={false}
          mirrored={true}
          ref={webcamRef}
          imageSmoothing={false}
          videoConstraints={{ deviceId: deviceId }}
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
