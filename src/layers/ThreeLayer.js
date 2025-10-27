import {
    AmbientLight,
    BoxGeometry,
    Color,
    DirectionalLight,
    LinearSRGBColorSpace,
    Matrix4,
    Mesh,
    MeshStandardMaterial,
    PerspectiveCamera,
    Quaternion,
    Scene,
    Vector3,
    WebGLRenderer
} from 'three';
import mapboxgl from 'mapbox-gl';

/**
 * Custom Mapbox layer that uses Three.js for 3D rendering
 */
export default class ThreeLayer {
    constructor(id = 'three-layer') {
        this.id = id;
        this.type = 'custom';
        this.renderingMode = '3d';
        
        this.trains = [];
        this.trainMeshes = new Map();
    }

    onAdd(map, gl) {
        this.map = map;
        
        // Create Three.js renderer
        this.renderer = new WebGLRenderer({
            canvas: map.getCanvas(),
            context: gl,
            antialias: true
        });
        
        this.renderer.autoClear = false;
        this.renderer.outputColorSpace = LinearSRGBColorSpace;
        
        // Create scene
        this.scene = new Scene();
        
        // Add lighting
        const ambientLight = new AmbientLight(0xffffff, 0.5);
        this.scene.add(ambientLight);
        
        const directionalLight = new DirectionalLight(0xffffff, 0.8);
        directionalLight.position.set(0.5, 1, 0.5).normalize();
        this.scene.add(directionalLight);
        
        // Create camera (with proper FOV)
        const transform = map.transform;
        this.camera = new PerspectiveCamera(
            transform._fov ? (transform._fov * 180 / Math.PI) : 28.5,
            map.getCanvas().width / map.getCanvas().height
        );
        
        // Model origin for coordinate transformation
        const center = map.getCenter();
        this.modelOrigin = [center.lng, center.lat];
        this.modelAsMercatorCoordinate = mapboxgl.MercatorCoordinate.fromLngLat(
            this.modelOrigin,
            0
        );
        
        // ADD A DUMMY MESH to avoid black screen (Mini Tokyo 3D pattern)
        this.scene.add(new Mesh());
        
        // ADD A TEST CUBE AT ORIGIN to verify Three.js rendering works
        const testGeometry = new BoxGeometry(10000, 10000, 3000); // HUGE box
        const testMaterial = new MeshStandardMaterial({
            color: new Color(0xff0000), // BRIGHT RED
            emissive: new Color(0xff0000),
            emissiveIntensity: 1.0 // MAX GLOW
        });
        const testCube = new Mesh(testGeometry, testMaterial);
        testCube.position.set(0, 0, 100); // At map origin, 100m high
        this.scene.add(testCube);
        console.log(`🧪 TEST CUBE added at origin [0,0,100] with ${this.scene.children.length} scene children total`);
    }

    /**
     * Create a 3D train mesh
     */
    createTrainMesh(train) {
        // GIGANTIC box - we're in meter-space with tiny scales
        const geometry = new BoxGeometry(5000, 5000, 2000); // width, height, depth in meters
        
        // Material with train color - brighter and emissive for visibility
        const material = new MeshStandardMaterial({
            color: new Color().setRGB(
                train.color[0] / 255,
                train.color[1] / 255,
                train.color[2] / 255
            ),
            emissive: new Color().setRGB(
                train.color[0] / 255,
                train.color[1] / 255,
                train.color[2] / 255
            ),
            emissiveIntensity: 0.5, // Glow effect
            metalness: 0.3,
            roughness: 0.3
        });
        
        const mesh = new Mesh(geometry, material);
        
        // Position the train
        this.updateTrainMeshPosition(mesh, train);
        
        return mesh;
    }

    /**
     * Update train mesh position based on train coordinates
     */
    updateTrainMeshPosition(mesh, train) {
        const [lon, lat] = train.getCoordinates();
        const trainMercator = mapboxgl.MercatorCoordinate.fromLngLat([lon, lat], 0);
        
        const modelScale = trainMercator.meterInMercatorCoordinateUnits();
        
        // Calculate relative position from map origin
        const x = (trainMercator.x - this.modelAsMercatorCoordinate.x) / modelScale;
        const y = (trainMercator.y - this.modelAsMercatorCoordinate.y) / modelScale;
        const z = 50; // Height above ground in meters
        
        mesh.position.set(x, y, z);
        
        // Rotate based on bearing
        mesh.rotation.z = -(train.bearing || 0) * Math.PI / 180;
        
        // Scale INVERSELY - larger number for smaller scale value
        // modelScale is ~3e-8, so 1/modelScale is huge, we need to moderate it
        const visualScale = 1.0; // Keep mesh at original size (100m box)
        mesh.scale.set(visualScale, visualScale, visualScale);
        
        console.log(`📍 Train at Three.js coords [${x.toFixed(0)}, ${y.toFixed(0)}, ${z}], scale: ${visualScale}, modelScale: ${modelScale.toExponential(2)}`);
    }

    /**
     * Update trains data
     */
    updateTrains(trains) {
        this.trains = trains;
        
        // Remove meshes for trains that no longer exist
        const currentTrainIds = new Set(trains.map(t => t.tripId));
        for (const [tripId, mesh] of this.trainMeshes) {
            if (!currentTrainIds.has(tripId)) {
                this.scene.remove(mesh);
                this.trainMeshes.delete(tripId);
            }
        }
        
        // Add or update train meshes
        trains.forEach(train => {
            let mesh = this.trainMeshes.get(train.tripId);
            
            if (!mesh) {
                // Create new mesh
                mesh = this.createTrainMesh(train);
                this.scene.add(mesh);
                this.trainMeshes.set(train.tripId, mesh);
                console.log(`🎨 Added 3D mesh to scene for train ${train.tripId} at [${train.lon}, ${train.lat}], meshes in scene: ${this.trainMeshes.size}`);
            } else {
                // Update existing mesh position
                this.updateTrainMeshPosition(mesh, train);
                
                // Update color if changed
                const color = new Color().setRGB(
                    train.color[0] / 255,
                    train.color[1] / 255,
                    train.color[2] / 255
                );
                mesh.material.color = color;
            }
        });
        
        // Trigger re-render
        if (this.map) {
            this.map.triggerRepaint();
        }
    }

    render(gl, matrix) {
        const {camera, renderer, scene, modelAsMercatorCoordinate, map} = this;
        
        if (!camera || !renderer || !scene) {
            console.warn('⚠️ render() called but missing camera/renderer/scene');
            return;
        }
        
        // Log render calls every 100 frames
        if (!this._renderCount) this._renderCount = 0;
        this._renderCount++;
        if (this._renderCount % 100 === 0) {
            console.log(`🎬 ThreeLayer render() called ${this._renderCount} times, scene has ${this.scene.children.length} children, ${this.trainMeshes.size} train meshes`);
        }
        
        // Proper camera setup (adapted from Mini Tokyo 3D)
        const transform = map.transform;
        const fov = transform._fov ? transform._fov : 0.6435011087932844; // default Mapbox FOV in radians
        const halfFov = fov / 2;
        const width = map.getCanvas().width;
        const height = map.getCanvas().height;
        
        // Calculate near and far clipping planes
        const nearZ = height / 50;
        const farZ = Math.max(10000000, nearZ * 1000); // Far enough to see everything
        camera.near = nearZ;
        camera.far = farZ;
        
        const halfHeight = Math.tan(halfFov) * nearZ;
        const halfWidth = halfHeight * width / height;
        
        // Create transformation matrices for Mapbox coordinate system
        const m = new Matrix4().fromArray(matrix);
        const l = new Matrix4()
            .makeTranslation(
                modelAsMercatorCoordinate.x,
                modelAsMercatorCoordinate.y,
                modelAsMercatorCoordinate.z || 0
            )
            .scale(new Vector3(1, -1, 1)); // Flip Y axis for Mapbox
        
        // Build proper perspective matrix and decompose to camera transform
        camera.projectionMatrix
            .makePerspective(-halfWidth, halfWidth, halfHeight, -halfHeight, nearZ, farZ)
            .clone()
            .invert()
            .multiply(m)
            .multiply(l)
            .invert()
            .decompose(camera.position, camera.quaternion, camera.scale);
        
        // Reset WebGL state before rendering
        renderer.resetState();
        
        // Render the scene
        renderer.render(scene, camera);
        
        // Tell Mapbox to continue rendering
        this.map.triggerRepaint();
    }

    onRemove() {
        // Clean up
        this.trainMeshes.forEach(mesh => {
            mesh.geometry.dispose();
            mesh.material.dispose();
        });
        this.trainMeshes.clear();
    }
}

