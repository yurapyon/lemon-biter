import { render } from "@react-three/fiber";
import { useCallback } from "react";
import {
  Object3D,
  PerspectiveCamera,
  Scene,
  ShaderMaterial,
  SkinnedMesh,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

const vertShader = `
out vec2 uv_coords;

uniform float offset;
uniform sampler2D boneTexture;
uniform int boneTextureWidth;
uniform int boneTextureHeight;
mat4 getBoneMatrix( const in float i ) {
  float j = i * 4.0;
  float x = mod( j, float( boneTextureWidth ) );
  float y = floor( j / float( boneTextureWidth ) );
  float dx = 1.0 / float( boneTextureWidth );
  float dy = 1.0 / float( boneTextureHeight );
  y = dy * ( y + 0.5 );", "vec4 v1 = texture2D( boneTexture, vec2( dx * ( x + 0.5 ), y ) );
  vec4 v2 = texture2D( boneTexture, vec2( dx * ( x + 1.5 ), y ) );
  vec4 v3 = texture2D( boneTexture, vec2( dx * ( x + 2.5 ), y ) );
  vec4 v4 = texture2D( boneTexture, vec2( dx * ( x + 3.5 ), y ) );
  mat4 bone = mat4( v1, v2, v3, v4 );
  return bone;
}
void main() {
  mat4 boneMatX = getBoneMatrix( skinIndex.x );
  mat4 boneMatY = getBoneMatrix( skinIndex.y );
  mat4 boneMatZ = getBoneMatrix( skinIndex.z );
  mat4 boneMatW = getBoneMatrix( skinIndex.w );
  vec4 skinVertex = vec4( position + normal * offset, 1.0 );
  vec4 skinned  = boneMatX * skinVertex * skinWeight.x;
  skinned      += boneMatY * skinVertex * skinWeight.y;
  skinned      += boneMatZ * skinVertex * skinWeight.z;
  skinned      += boneMatW * skinVertex * skinWeight.w;
  vec4 mvPosition;
  mvPosition = modelViewMatrix * skinned;
  //"mvPosition = modelViewMatrix * (skinned + vec4( position + normal * offset, 1.0 ));
  gl_Position = projectionMatrix * mvPosition;

  uv_coords = uv;
}

// void main() {
  //vec4 skinned  = vec4(position, 1.0) * skinIndex * skinWeight.x;
  //skinned      += vec4(position, 1.0) * skinIndex * skinWeight.y;
  //skinned      += vec4(position, 1.0) * skinIndex * skinWeight.z;
  //skinned      += vec4(position, 1.0) * skinIndex * skinWeight.w;
  // vec4 asdf = skinIndex;
  // gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
// }
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

export var room: Object3D | null = null;
export var chara: Object3D | null = null;
export var face: Object3D | null = null;

export var renderer = new WebGLRenderer();

const scene = new Scene();
const camera = new PerspectiveCamera(75, 400 / 300, 0.1, 1000);

type InitParams = {
  width: number;
  height: number;
};

export const init: (params: InitParams) => void = (params) => {
  renderer.setSize(params.width, params.height);
};

export const loadRoom = (filename: string, onResults: () => void) => {
  const loader = new GLTFLoader();
  loader.load(filename, (gltf) => {
    chara = gltf.scene.getObjectByName("_body") ?? null;
    if (!chara) return;
    gltf.scene.remove(chara);

    face = gltf.scene.getObjectByName("_face") ?? null;
    if (!face) return;
    gltf.scene.remove(face);

    const uniforms = {
      // tex: { value: face_tex },
      // tex_dimensions: {
      // value: [face_tex.image.width, face_tex.image.height],
      // },
      eye_offset: { value: [0, 0] },
      blink_frame: { value: 0 },
      mouth_frame: { value: 0 },
    };

    const matl = new ShaderMaterial({
      uniforms,
      fragmentShader: fragShader,
      vertexShader: vertShader,
    });
    const newFace = new SkinnedMesh((face as SkinnedMesh).geometry, matl);
    newFace.bind((face as SkinnedMesh).skeleton);
    // console.log("faces", face, newFace);

    room = gltf.scene;

    scene.add(room);
    scene.add(newFace);
    scene.add(chara);

    document.body.appendChild(renderer.domElement);

    onResults();
    animate();
  });
};
function animate() {
  requestAnimationFrame(animate);
  if (!room) return;
  renderer.render(scene, room.getObjectByName("Camera") as PerspectiveCamera);
}
