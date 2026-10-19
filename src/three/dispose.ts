import * as THREE from "three";


// Frees GPU memory held by an object tree: geometries, materials and every texture they use
// (map, normalMap, ...). Three.js re-uploads anything that is later rendered again, so shared
// cached assets stay safe. `keep` textures (e.g. a shared environment map) and textures marked
// `userData.shared` (built once, used by many models) are left alone.
export const disposeObjectDeep = (root: THREE.Object3D, keep: Set<THREE.Texture> = new Set()) => {
  root.traverse(child => {
    const mesh = child as THREE.Mesh;
    // Geometry and materials marked shared (one copy used by many models, e.g. a vehicle model)
    // stay: freeing them would only make the next model upload them again.
    if (mesh.geometry && !mesh.geometry.userData.shared) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
    materials.forEach(material => {
      if (material.userData.shared) return;
      Object.values(material).forEach(value => {
        if (value instanceof THREE.Texture && !keep.has(value) && !value.userData.shared) value.dispose();
      });
      material.dispose();
    });
  });
};
