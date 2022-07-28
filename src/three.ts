import { useCallback } from "react";
import { Object3D } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";

export var room: Object3D | null = null;
export var body: Object3D | null = null;
export var face: Object3D | null = null;

export const loadRoom = (filename: string, onResults: () => void) => {
  const loader = new GLTFLoader();
  loader.load(filename, (gltf) => {
    body = gltf.scene.getObjectByName("body") ?? null;
    face = gltf.scene.getObjectByName("face") ?? null;
    if (!body || !face) return;

    gltf.scene.remove(body);
    gltf.scene.remove(face);

    room = gltf.scene;

    onResults();
  });
};
