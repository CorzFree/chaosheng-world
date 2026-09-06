import * as THREE from 'three';
export function geographicPoint(
  latitude: number,
  longitude: number,
  radius = 1,
) {
  const lat = THREE.MathUtils.degToRad(latitude),
    lon = THREE.MathUtils.degToRad(longitude);
  return new THREE.Vector3(
    Math.cos(lat) * Math.cos(lon) * radius,
    Math.sin(lat) * radius,
    -Math.cos(lat) * Math.sin(lon) * radius,
  );
}
export function rotateForScreenDrag(
  group: THREE.Object3D,
  camera: THREE.Camera,
  dx: number,
  dy: number,
) {
  camera.updateMatrixWorld();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0),
    up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  group.rotateOnWorldAxis(up, dx);
  group.rotateOnWorldAxis(right, dy);
}
